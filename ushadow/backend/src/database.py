"""Database dependency injection helpers."""

from fastapi import Request
from motor.motor_asyncio import AsyncIOMotorDatabase


def get_database(request: Request) -> AsyncIOMotorDatabase:
    """Get MongoDB database from FastAPI app state.

    Args:
        request: FastAPI request object

    Returns:
        MongoDB database instance

    Raises:
        RuntimeError: If database not initialized
    """
    if not hasattr(request.app.state, "db"):
        raise RuntimeError("Database not initialized. Check lifespan events in main.py")
    return request.app.state.db
