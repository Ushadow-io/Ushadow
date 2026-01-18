from enum import Enum


class TemplateSource(str, Enum):
    COMPOSE = "compose"
    PROVIDER = "provider"

    def __str__(self) -> str:
        return str(self.value)
