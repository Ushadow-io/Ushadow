from enum import Enum


class DeploymentStatus(str, Enum):
    DEPLOYING = "deploying"
    FAILED = "failed"
    PENDING = "pending"
    REMOVING = "removing"
    RUNNING = "running"
    STOPPED = "stopped"

    def __str__(self) -> str:
        return str(self.value)
