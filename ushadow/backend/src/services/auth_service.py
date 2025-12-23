"""
Authentication Service
Handles user authentication, JWT tokens, and password hashing
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from motor.motor_asyncio import AsyncIOMotorClient

from src.config.settings import get_settings
from src.models.user import UserInDB, User

logger = logging.getLogger(__name__)
settings = get_settings()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30 * 24 * 60  # 30 days


class AuthService:
    """Service for authentication operations."""

    def __init__(self):
        self.client = None
        self.db = None
        self.users_collection = None

    async def get_users_collection(self):
        """Get or create users collection."""
        if self.users_collection is None:
            self.client = AsyncIOMotorClient(settings.MONGODB_URI)
            self.db = self.client[settings.MONGODB_DATABASE]
            self.users_collection = self.db["users"]
            # Create unique index on email
            await self.users_collection.create_index("email", unique=True)
        return self.users_collection

    def hash_password(self, password: str) -> str:
        """Hash a password."""
        return pwd_context.hash(password)

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash."""
        return pwd_context.verify(plain_password, hashed_password)

    def create_access_token(self, data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """Create a JWT access token."""
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, settings.AUTH_SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt

    def decode_token(self, token: str) -> Optional[dict]:
        """Decode and validate a JWT token."""
        try:
            payload = jwt.decode(token, settings.AUTH_SECRET_KEY, algorithms=[ALGORITHM])
            return payload
        except JWTError as e:
            logger.error(f"JWT decode error: {e}")
            return None

    async def get_user_by_email(self, email: str) -> Optional[UserInDB]:
        """Get user by email."""
        try:
            collection = await self.get_users_collection()
            user_doc = await collection.find_one({"email": email})
            if user_doc:
                user_doc["id"] = str(user_doc.pop("_id"))
                return UserInDB(**user_doc)
            return None
        except Exception as e:
            logger.error(f"Error getting user by email: {e}")
            return None

    async def get_user_by_id(self, user_id: str) -> Optional[UserInDB]:
        """Get user by ID."""
        try:
            from bson import ObjectId
            collection = await self.get_users_collection()
            user_doc = await collection.find_one({"_id": ObjectId(user_id)})
            if user_doc:
                user_doc["id"] = str(user_doc.pop("_id"))
                return UserInDB(**user_doc)
            return None
        except Exception as e:
            logger.error(f"Error getting user by ID: {e}")
            return None

    async def create_user(self, email: str, display_name: str, password: str, is_superuser: bool = False) -> UserInDB:
        """Create a new user."""
        try:
            from bson import ObjectId
            collection = await self.get_users_collection()

            now = datetime.utcnow()
            user_doc = {
                "_id": ObjectId(),
                "email": email,
                "display_name": display_name,
                "hashed_password": self.hash_password(password),
                "is_active": True,
                "is_superuser": is_superuser,
                "created_at": now,
                "updated_at": now
            }

            await collection.insert_one(user_doc)
            user_doc["id"] = str(user_doc.pop("_id"))
            logger.info(f"User created: {email}")

            return UserInDB(**user_doc)
        except Exception as e:
            logger.error(f"Error creating user: {e}")
            raise

    async def authenticate_user(self, email: str, password: str) -> Optional[UserInDB]:
        """Authenticate a user by email and password."""
        user = await self.get_user_by_email(email)
        if not user:
            return None
        if not self.verify_password(password, user.hashed_password):
            return None
        return user

    async def requires_setup(self) -> bool:
        """Check if initial setup is required (no users exist)."""
        try:
            collection = await self.get_users_collection()
            count = await collection.count_documents({})
            return count == 0
        except Exception as e:
            logger.error(f"Error checking setup status: {e}")
            return True

    async def get_user_count(self) -> int:
        """Get total number of users."""
        try:
            collection = await self.get_users_collection()
            return await collection.count_documents({})
        except Exception as e:
            logger.error(f"Error getting user count: {e}")
            return 0
