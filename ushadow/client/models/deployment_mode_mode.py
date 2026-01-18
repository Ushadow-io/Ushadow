from enum import Enum


class DeploymentModeMode(str, Enum):
    MULTI = "multi"
    SINGLE = "single"

    def __str__(self) -> str:
        return str(self.value)
