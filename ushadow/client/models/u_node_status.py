from enum import Enum


class UNodeStatus(str, Enum):
    CONNECTING = "connecting"
    ERROR = "error"
    OFFLINE = "offline"
    ONLINE = "online"

    def __str__(self) -> str:
        return str(self.value)
