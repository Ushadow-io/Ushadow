from enum import Enum


class UNodePlatform(str, Enum):
    LINUX = "linux"
    MACOS = "macos"
    UNKNOWN = "unknown"
    WINDOWS = "windows"

    def __str__(self) -> str:
        return str(self.value)
