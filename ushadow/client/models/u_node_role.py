from enum import Enum


class UNodeRole(str, Enum):
    LEADER = "leader"
    STANDBY = "standby"
    WORKER = "worker"

    def __str__(self) -> str:
        return str(self.value)
