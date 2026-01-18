from enum import Enum


class InstanceStatus(str, Enum):
    DEPLOYING = "deploying"
    ERROR = "error"
    NA = "n/a"
    PENDING = "pending"
    RUNNING = "running"
    STOPPED = "stopped"

    def __str__(self) -> str:
        return str(self.value)
