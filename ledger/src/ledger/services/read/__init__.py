"""L6 read API: handlers behind one gateway (scopes are checked there only)."""

from ledger.services.read.answers import ReadDeps
from ledger.services.read.gateway import ReadGateway

__all__ = ["ReadDeps", "ReadGateway"]
