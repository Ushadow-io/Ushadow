from enum import Enum


class IntegrationType(str, Enum):
    DATABASE = "database"
    FILESYSTEM = "filesystem"
    GRAPHQL = "graphql"
    GRPC = "grpc"
    MCP = "mcp"
    REST = "rest"
    WEBSOCKET = "websocket"

    def __str__(self) -> str:
        return str(self.value)
