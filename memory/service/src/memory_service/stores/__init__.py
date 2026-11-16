"""Side-table stores (memory for tests, Mongo for the service)."""

from memory_service.stores.collection import Collection, MemoryCollection, MongoCollection
from memory_service.stores.side_tables import (
    Proof,
    SideTables,
    ensure_indexes,
    memory_tables,
    mongo_tables,
)

__all__ = [
    "Collection",
    "MemoryCollection",
    "MongoCollection",
    "Proof",
    "SideTables",
    "ensure_indexes",
    "memory_tables",
    "mongo_tables",
]
