from enum import Enum


class ImportedServiceConfigSourceType(str, Enum):
    DOCKERHUB = "dockerhub"
    GITHUB = "github"

    def __str__(self) -> str:
        return str(self.value)
