"""
User registration and management.

fastapi-users machinery for the setup/registration flow.
Casdoor handles runtime auth; this module handles local user creation
(initial admin setup, registration endpoints).
"""

import logging
from typing import Optional

from beanie import PydanticObjectId
from fastapi import Depends, Request
from fastapi_users import BaseUserManager, FastAPIUsers
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    CookieTransport,
    JWTStrategy,
)

from src.config.secrets import get_auth_secret_key
from src.models.user import User, UserCreate, get_user_db

logger = logging.getLogger(__name__)

SECRET_KEY = get_auth_secret_key()


def get_auth_cookie_name() -> str:
    """Return the env-scoped auth cookie name.

    Uses the environment name so that multiple envs on the same host
    (different ports) don't share cookies — browsers don't scope cookies by port.
    """
    from src.utils.environment import get_env_name
    return f"ushadow_auth_{get_env_name()}"
JWT_LIFETIME_SECONDS = 86400
ALGORITHM = "HS256"


def _get_cookie_secure() -> bool:
    from src.config import get_settings
    return (get_settings().get_sync("environment.mode") or "development") == "production"


class UserManager(BaseUserManager[User, PydanticObjectId]):
    reset_password_token_secret = SECRET_KEY
    verification_token_secret = SECRET_KEY
    _pending_plaintext_password: Optional[str] = None

    def parse_id(self, value: str) -> PydanticObjectId:
        return PydanticObjectId(value)

    async def create(self, user_create, safe: bool = False, request: Optional[Request] = None):
        self._pending_plaintext_password = user_create.password
        return await super().create(user_create, safe=safe, request=request)

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        logger.info("User registered: %s", user.email)
        if user.is_superuser and self._pending_plaintext_password:
            try:
                from src.config import get_settings
                await get_settings().update({"admin": {"email": user.email, "password": self._pending_plaintext_password, "password_hash": user.hashed_password}})
            except Exception as e:
                logger.error("Failed to save admin credentials: %s", e)
            finally:
                self._pending_plaintext_password = None


async def get_user_manager(user_db=Depends(get_user_db)):
    yield UserManager(user_db)


cookie_transport = CookieTransport(
    cookie_name=get_auth_cookie_name(),
    cookie_max_age=JWT_LIFETIME_SECONDS,
    cookie_secure=_get_cookie_secure(),
    cookie_httponly=True,
    cookie_samesite="lax",
)
bearer_transport = BearerTransport(tokenUrl="api/auth/login")


def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(secret=SECRET_KEY, lifetime_seconds=JWT_LIFETIME_SECONDS, algorithm=ALGORITHM)


cookie_backend = AuthenticationBackend(name="cookie", transport=cookie_transport, get_strategy=get_jwt_strategy)
bearer_backend = AuthenticationBackend(name="bearer", transport=bearer_transport, get_strategy=get_jwt_strategy)

fastapi_users = FastAPIUsers[User, PydanticObjectId](get_user_manager, [cookie_backend, bearer_backend])


async def create_admin_user_if_needed():
    from src.config import get_settings
    config = get_settings()
    admin_email = config.get_sync("admin.email") or config.get_sync("auth.admin_email")
    admin_password = config.get_sync("admin.password")
    admin_name = config.get_sync("admin.name") or "admin"

    if not admin_email or not admin_password:
        return
    try:
        user_db_gen = get_user_db()
        user_db = await user_db_gen.__anext__()
        if await user_db.get_by_email(admin_email):
            return
        user_manager_gen = get_user_manager(user_db)
        user_manager = await user_manager_gen.__anext__()
        admin_user = await user_manager.create(UserCreate(
            email=admin_email,
            password=admin_password,
            is_superuser=True,
            is_verified=True,
            display_name=admin_name or "Administrator",
        ))
        logger.info("Created admin user: %s", admin_user.email)
    except Exception as e:
        logger.error("Failed to create admin user: %s", e, exc_info=True)
