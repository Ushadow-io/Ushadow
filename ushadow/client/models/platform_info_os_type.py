from enum import Enum


class PlatformInfoOsType(str, Enum):
    DARWIN = "darwin"
    LINUX = "linux"
    UNKNOWN = "unknown"
    WINDOWS = "windows"

    def __str__(self) -> str:
        return str(self.value)
