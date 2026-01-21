"""
Logging utilities with prefixed loggers for easier debugging.

Usage:
    from src.utils.logging import get_logger

    logger = get_logger(__name__, prefix="Deploy")
    logger.info("Starting deployment")  # Output: [Deploy] Starting deployment
"""

import logging
from typing import Optional


class PrefixedLogger(logging.LoggerAdapter):
    """Logger adapter that adds a prefix to all log messages."""

    def __init__(self, logger: logging.Logger, prefix: str):
        super().__init__(logger, {})
        self.prefix = f"[{prefix}]"

    def process(self, msg, kwargs):
        """Add prefix to the message."""
        return f"{self.prefix} {msg}", kwargs


def get_logger(name: str, prefix: Optional[str] = None) -> logging.Logger:
    """
    Get a logger with an optional prefix.

    Args:
        name: Logger name (typically __name__)
        prefix: Optional prefix to add to all messages (e.g., "Deploy", "Config")

    Returns:
        Logger instance (with prefix adapter if prefix is provided)

    Examples:
        # Without prefix (standard logger)
        logger = get_logger(__name__)
        logger.info("Message")  # Output: Message

        # With prefix
        logger = get_logger(__name__, prefix="Deploy")
        logger.info("Starting")  # Output: [Deploy] Starting
    """
    base_logger = logging.getLogger(name)

    if prefix:
        return PrefixedLogger(base_logger, prefix)

    return base_logger
