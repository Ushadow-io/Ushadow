#!/usr/bin/env python3
"""
Quick test script to check what /api/auth/me returns
"""
import asyncio
from src.models.user import UserRead, User
from beanie import PydanticObjectId

async def test_user_serialization():
    # Simulate a user record from DB
    user = User(
        id=PydanticObjectId("69830c0045d101deddb5ceb8"),
        email="stu@theawesome.co.uk",
        display_name="stu alexander",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        hashed_password=""
    )

    # Serialize using UserRead
    user_read = UserRead(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        is_active=user.is_active,
        is_superuser=user.is_superuser,
        is_verified=user.is_verified,
        created_at=None,
        updated_at=None,
    )

    # Check what gets serialized
    print("UserRead model_dump():")
    print(user_read.model_dump())
    print()
    print("UserRead model_dump_json():")
    print(user_read.model_dump_json())

if __name__ == "__main__":
    asyncio.run(test_user_serialization())
