from enum import Enum


class KubernetesClusterStatus(str, Enum):
    CONNECTED = "connected"
    ERROR = "error"
    UNAUTHORIZED = "unauthorized"
    UNREACHABLE = "unreachable"

    def __str__(self) -> str:
        return str(self.value)
