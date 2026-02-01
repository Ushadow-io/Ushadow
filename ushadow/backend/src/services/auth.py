"""Authentication configuration for fastapi-users with JWT.

ushadow is the central auth provider. Tokens issued here include audience claims
that allow other services (chronicle, etc.) to validate them.

Supported audiences:
- "ushadow": Default, for ushadow API access
- "chronicle": For chronicle service access
- Additional audiences can be added as services are integrated
"""

import logging
import os
from datetime import datetime, timedelta
from typing import Optional

import jwt
from beanie import PydanticObjectId
from fastapi import Depends, Request
from fastapi_users import BaseUserManager, FastAPIUsers
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    CookieTransport,
    JWTStrategy,
)

from src.config.omegaconf_settings import get_settings
from src.models.user import User, UserCreate, get_user_db

logger = logging.getLogger(__name__)
config = get_settings()

# JWT Configuration
JWT_LIFETIME_SECONDS = 86400  # 24 hours (matches chronicle)
ALGORITHM = "HS256"

# Get secret key with env var bootstrap fallback
from src.config.secrets import get_auth_secret_key
SECRET_KEY = get_auth_secret_key()

# Environment mode determines cookie security
ENV_MODE = config.get_sync("environment.mode") or "development"
COOKIE_SECURE = ENV_MODE == "production"

# Admin configuration from OmegaConf (secrets.yaml -> admin.*)
# Only creates admin on startup if explicitly configured in secrets.yaml
ADMIN_EMAIL = config.get_sync("admin.email") or config.get_sync("auth.admin_email")
ADMIN_PASSWORD = config.get_sync("admin.password")  # Must be explicitly set in secrets.yaml
ADMIN_NAME = config.get_sync("admin.name") or config.get_sync("auth.admin_name") or "admin"

# Accepted token issuers - comma-separated list of services whose tokens we accept
ACCEPTED_ISSUERS = [
    iss.strip() 
    for iss in os.getenv("ACCEPTED_TOKEN_ISSUERS", "ushadow,chronicle").split(",") 
    if iss.strip()
]
logger.info(f"Accepting tokens from issuers: {ACCEPTED_ISSUERS}")


class UserManager(BaseUserManager[User, PydanticObjectId]):
    """User manager with customization for ushadow.

    Handles user lifecycle events and MongoDB ObjectId parsing.
    """

    reset_password_token_secret = SECRET_KEY
    verification_token_secret = SECRET_KEY

    # Temporary storage for plaintext password (captured in create, used in on_after_register)
    _pending_plaintext_password: Optional[str] = None

    def parse_id(self, value: str) -> PydanticObjectId:
        """Parse string ID to PydanticObjectId for MongoDB compatibility."""
        try:
            return PydanticObjectId(value)
        except Exception as e:
            raise ValueError(f"Invalid ObjectId format: {value}") from e

    async def create(self, user_create, safe: bool = False, request: Optional[Request] = None):
        """Override create to capture plaintext password before hashing."""
        # Capture plaintext before parent hashes it
        self._pending_plaintext_password = user_create.password
        try:
            return await super().create(user_create, safe=safe, request=request)
        finally:
            # Clear after use (will be consumed by on_after_register)
            pass  # Cleared in on_after_register

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        """Called after a user registers.

        For admin users, writes credentials to config/SECRETS/secrets.yaml so dependent services
        (e.g., Chronicle) can create matching admin users with the same password hash.
        """
        logger.info(f"User {user.user_id} ({user.email}) has registered.")

        # Write admin credentials to config/SECRETS/secrets.yaml for dependent services
        # TODO(USH-5): Align password dependencies - Chronicle and other services should
        # read admin.password and admin.password_hash from config/SECRETS/secrets.yaml
        # https://linear.app/ushadow/issue/USH-5/align-container-passwords
        if user.is_superuser:
            try:
                settings = get_settings()
                await settings.update({
                    "admin": {
                        "email": user.email,
                        "password": self._pending_plaintext_password,
                        "password_hash": user.hashed_password,
                    }
                })
                logger.info(f"Saved admin credentials to config/SECRETS/secrets.yaml for {user.email}")
            except Exception as e:
                logger.error(f"Failed to save admin credentials to config/SECRETS/secrets.yaml: {e}")
            finally:
                self._pending_plaintext_password = None

    async def on_after_forgot_password(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        """Called after a user requests password reset."""
        logger.info(f"User {user.user_id} ({user.email}) has requested password reset")
        # TODO: Send password reset email when email service is configured

    async def on_after_request_verify(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        """Called after a user requests email verification."""
        logger.info(f"Verification requested for user {user.user_id} ({user.email})")
        # TODO: Send verification email when email service is configured


async def get_user_manager(user_db=Depends(get_user_db)):
    """Get user manager instance for dependency injection."""
    yield UserManager(user_db)


# Transport configurations
cookie_transport = CookieTransport(
    cookie_name="ushadow_auth",
    cookie_max_age=JWT_LIFETIME_SECONDS,
    cookie_secure=COOKIE_SECURE,
    cookie_httponly=True,
    cookie_samesite="lax",
)

bearer_transport = BearerTransport(tokenUrl="api/auth/login")


def get_jwt_strategy() -> JWTStrategy:
    """Get JWT strategy for token generation and validation.
    
    Uses a custom strategy that handles our multi-service audience claims.
    """
    from fastapi_users.authentication.strategy.jwt import JWTStrategy as BaseJWTStrategy
    from fastapi_users.manager import BaseUserManager
    from typing import Optional
    
    class MultiAudienceJWTStrategy(BaseJWTStrategy):
        """JWT strategy that supports multi-service audience validation."""

        async def read_token(
            self,
            token: Optional[str],
            user_manager: BaseUserManager,
        ):
            """Decode token with audience validation for our services."""
            if token is None:
                return None

            try:
                # Decode with audience validation - accept any of our services
                data = jwt.decode(
                    token,
                    self.decode_key,
                    algorithms=[self.algorithm],
                    audience=["ushadow", "chronicle"],  # Accept tokens for either service
                    options={"verify_aud": True}
                )
                user_id = data.get("sub")
                if user_id is None:
                    return None
            except (jwt.exceptions.PyJWTError, jwt.exceptions.ExpiredSignatureError, jwt.exceptions.InvalidAudienceError) as e:
                logger.warning(f"[AUTH] Token validation failed with audience check: {type(e).__name__}: {e}")
                # Try again without audience validation for backward compat
                try:
                    data = jwt.decode(
                        token,
                        self.decode_key,
                        algorithms=[self.algorithm],
                        options={"verify_aud": False}
                    )
                    user_id = data.get("sub")
                    if user_id is None:
                        logger.warning("[AUTH] Token decoded but no 'sub' claim found")
                        return None
                    logger.info(f"[AUTH] Token validated without audience check for user {user_id}")
                except jwt.exceptions.PyJWTError as e2:
                    logger.error(f"[AUTH] Token validation failed completely: {type(e2).__name__}: {e2}")
                    return None

            try:
                parsed_id = user_manager.parse_id(user_id)
                return await user_manager.get(parsed_id)
            except Exception:
                return None
    
    return MultiAudienceJWTStrategy(
        secret=SECRET_KEY, 
        lifetime_seconds=JWT_LIFETIME_SECONDS,
        algorithm=ALGORITHM,
    )


# Authentication backends
cookie_backend = AuthenticationBackend(
    name="cookie",
    transport=cookie_transport,
    get_strategy=get_jwt_strategy,
)

bearer_backend = AuthenticationBackend(
    name="bearer",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

# FastAPI Users instance
fastapi_users = FastAPIUsers[User, PydanticObjectId](
    get_user_manager,
    [cookie_backend, bearer_backend],
)

# User dependencies for protecting endpoints
get_current_user = fastapi_users.current_user(active=True)
get_optional_current_user = fastapi_users.current_user(active=True, optional=True)
get_current_superuser = fastapi_users.current_user(active=True, superuser=True)



def validate_token_issuer(token: str) -> bool:
    """Validate that a token was issued by an accepted issuer.
    
    Args:
        token: JWT token string
        
    Returns:
        True if token issuer is in ACCEPTED_ISSUERS, False otherwise
    """
    try:
        # Decode without verification to check issuer
        payload = jwt.decode(token, options={"verify_signature": False})
        issuer = payload.get("iss")
        if issuer and issuer in ACCEPTED_ISSUERS:
            return True
        # Also accept tokens without issuer (legacy tokens)
        if issuer is None:
            return True
        logger.warning(f"Token rejected: issuer '{issuer}' not in {ACCEPTED_ISSUERS}")
        return False
    except Exception as e:
        logger.error(f"Error validating token issuer: {e}")
        return False

def generate_jwt_for_service(
    user_id: str, 
    user_email: str, 
    audiences: list[str] = None
) -> str:
    """Generate a JWT token for cross-service authentication.
    
    This function creates a JWT token that can be used to authenticate with
    any service that shares the same AUTH_SECRET_KEY and accepts the specified
    audiences.

    Args:
        user_id: User's unique identifier (MongoDB ObjectId as string)
        user_email: User's email address
        audiences: List of services this token is valid for. 
                   Defaults to ["ushadow", "chronicle"]

    Returns:
        JWT token string valid for JWT_LIFETIME_SECONDS

    Example:
        >>> token = generate_jwt_for_service(
        ...     "507f1f77bcf86cd799439011", 
        ...     "user@example.com",
        ...     audiences=["ushadow", "chronicle", "mycelia"]
        ... )
    """
    if audiences is None:
        audiences = ["ushadow", "chronicle"]
    
    payload = {
        "sub": user_id,
        "email": user_email,
        "iss": "ushadow",  # Issuer - ushadow is the auth provider
        "aud": audiences,  # Audiences - services that can use this token
        "exp": datetime.utcnow() + timedelta(seconds=JWT_LIFETIME_SECONDS),
        "iat": datetime.utcnow(),
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def get_user_from_token(token: str) -> Optional[User]:
    """Get user from JWT token string.
    
    Useful for endpoints that need token-based auth via query params,
    such as WebSocket connections or SSE streams.
    """
    if not token:
        return None
    try:
        strategy = get_jwt_strategy()
        user_db_gen = get_user_db()
        user_db = await user_db_gen.__anext__()
        user_manager = UserManager(user_db)
        user = await strategy.read_token(token, user_manager)
        if user and user.is_active:
            return user
    except Exception as e:
        logger.warning(f"Failed to get user from token: {e}")
    return None


def get_accessible_user_ids(user: User) -> list[str] | None:
    """Get list of user IDs that the current user can access.
    
    Returns None for superusers (can access all), or [user.id] for regular users.
    """
    if user.is_superuser:
        return None  # Can access all data
    return [str(user.id)]  # Can only access own data


async def create_admin_user_if_needed():
    """Create admin user during startup if explicitly configured in config/SECRETS/secrets.yaml.

    Only creates if both admin.email and admin.password are set in config/SECRETS/secrets.yaml.
    Writes password hash back to config/SECRETS/secrets.yaml for dependent services.
    """
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        logger.info("Skipping admin user creation - credentials not configured in config/SECRETS/secrets.yaml")
        return

    try:
        # Get user database
        user_db_gen = get_user_db()
        user_db = await user_db_gen.__anext__()

        # Check if admin user already exists
        existing_admin = await user_db.get_by_email(ADMIN_EMAIL)

        if existing_admin:
            logger.info(f"✅ Admin user already exists: {existing_admin.email}")
            return

        # Create admin user
        user_manager_gen = get_user_manager(user_db)
        user_manager = await user_manager_gen.__anext__()

        admin_create = UserCreate(
            email=ADMIN_EMAIL,
            password=ADMIN_PASSWORD,
            is_superuser=True,
            is_verified=True,
            display_name=ADMIN_NAME or "Administrator",
        )

        admin_user = await user_manager.create(admin_create)
        logger.info(f"✅ Created admin user: {admin_user.email} (ID: {admin_user.id})")

        # Write admin credentials to config/SECRETS/secrets.yaml for dependent services
        # TODO(USH-5): Align password dependencies - Chronicle and other services should
        # read admin.password and admin.password_hash from config/SECRETS/secrets.yaml
        # https://linear.app/ushadow/issue/USH-5/align-container-passwords
        try:
            settings = get_settings()
            await settings.update({
                "admin": {
                    "email": admin_user.email,
                    "password": ADMIN_PASSWORD,
                    "password_hash": admin_user.hashed_password,
                }
            })
            logger.info(f"Saved admin credentials to config/SECRETS/secrets.yaml for dependent services")
        except Exception as e:
            logger.error(f"Failed to save admin credentials to config/SECRETS/secrets.yaml: {e}")

    except Exception as e:
        logger.error(f"Failed to create admin user: {e}", exc_info=True)


async def websocket_auth(websocket, token: Optional[str] = None) -> Optional[User]:
    """WebSocket authentication supporting both cookie and token-based auth.
    
    Returns None if authentication fails (allowing graceful handling).
    """
    import re
    
    strategy = get_jwt_strategy()

    # Try JWT token from query parameter first
    if token:
        logger.debug(f"Attempting WebSocket auth with query token")
        try:
            user_db_gen = get_user_db()
            user_db = await user_db_gen.__anext__()
            user_manager = UserManager(user_db)
            user = await strategy.read_token(token, user_manager)
            if user and user.is_active:
                logger.info(f"WebSocket auth successful for user {user.user_id}")
                return user
        except Exception as e:
            logger.warning(f"WebSocket auth with query token failed: {e}")

    # Try cookie authentication
    try:
        cookie_header = next(
            (v.decode() for k, v in websocket.headers.items() if k.lower() == b"cookie"), 
            None
        )
        if cookie_header:
            match = re.search(r"ushadow_auth=([^;]+)", cookie_header)
            if match:
                user_db_gen = get_user_db()
                user_db = await user_db_gen.__anext__()
                user_manager = UserManager(user_db)
                user = await strategy.read_token(match.group(1), user_manager)
                if user and user.is_active:
                    logger.info(f"WebSocket auth successful for user {user.user_id} via cookie")
                    return user
    except Exception as e:
        logger.warning(f"WebSocket auth with cookie failed: {e}")

    logger.warning("WebSocket authentication failed")
    return None
