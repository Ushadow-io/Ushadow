"""Run the ledger and the memory service as real processes (or containers) on real Mongo.

Safety rules (the Mongo server holds real databases):
- only databases named `ledger_test_e2e_<random>` / `memory_test_e2e_<random>` are ever
  created, read or dropped (`TestDbs`); `drop()` refuses any other name;
- servers bind to 127.0.0.1 on free ports; `stop()` kills them, also on failure;
- tokens are random per run, passed in the environment only, and never printed.
"""

from __future__ import annotations

import os
import secrets
import signal
import socket
import subprocess
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import httpx
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parents[1]
LEDGER_DIR = ROOT / "ledger"
MEMORY_DIR = ROOT / "memory" / "service"
LEDGER_PREFIX = "ledger_test_e2e_"
MEMORY_PREFIX = "memory_test_e2e_"
SPLIT_MARKER = "Different thing"


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@dataclass
class Tokens:
    chronicle: str = field(default_factory=lambda: secrets.token_hex(16), repr=False)
    memory_to_ledger: str = field(default_factory=lambda: secrets.token_hex(16), repr=False)
    memory: str = field(default_factory=lambda: secrets.token_hex(16), repr=False)
    agent: str = field(default_factory=lambda: secrets.token_hex(16), repr=False)  # read API
    reader: str = field(default_factory=lambda: secrets.token_hex(16), repr=False)  # read API
    # the key Ushadow signs user tokens with (AUTH_SECRET_KEY): a signed-in user at the ledger
    auth_secret: str = field(default_factory=lambda: secrets.token_hex(32), repr=False)

    def ledger_tokens(self) -> str:
        return (f"chronicle:{self.chronicle},memory:{self.memory_to_ledger},agent:{self.agent},"
                f"reader:{self.reader}")


class TestDbs:
    """The run's own databases. Every name made here is checked against the prefixes."""

    def __init__(self, uri: str) -> None:
        self.client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        self.names: list[str] = []

    def new(self, prefix: str) -> str:
        assert prefix in (LEDGER_PREFIX, MEMORY_PREFIX)
        name = f"{prefix}{uuid.uuid4().hex[:12]}"
        self.names.append(name)
        return name

    def docs(self, name: str) -> dict[str, list[dict]]:
        """Every document of one of OUR databases, by collection."""
        self._ours(name)
        db = self.client[name]
        return {c: list(db[c].find()) for c in db.list_collection_names()}

    def drop_all(self) -> None:
        for name in self.names:
            self._ours(name)
            self.client.drop_database(name)

    def leftovers(self) -> list[str]:
        return [n for n in self.client.list_database_names()
                if n.startswith(LEDGER_PREFIX) or n.startswith(MEMORY_PREFIX)]

    @staticmethod
    def _ours(name: str) -> None:
        if not (name.startswith(LEDGER_PREFIX) or name.startswith(MEMORY_PREFIX)):
            raise RuntimeError(f"refusing to touch database {name!r}")


def wait_healthy(url: str, proc_alive=lambda: True, timeout: float = 60.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not proc_alive():
            raise RuntimeError(f"service at {url} exited during start")
        try:
            if httpx.get(url + "/health", timeout=1.0).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.2)
    raise RuntimeError(f"service at {url} did not become healthy")


# ---- processes -------------------------------------------------------------------------------


@dataclass
class Proc:
    """One uvicorn server as a subprocess of this test (the service's own venv)."""

    name: str
    cwd: Path
    app: list[str]
    env: dict[str, str]
    port: int
    log_dir: Path
    popen: subprocess.Popen | None = None
    starts: int = 0

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def start(self) -> None:
        python = self.cwd / ".venv" / "bin" / "python"
        if not python.exists():
            raise RuntimeError(f"{python} missing: run `uv sync` in {self.cwd}")
        self.starts += 1
        log = open(self.log_dir / f"{self.name}-{self.starts}.log", "wb")  # noqa: SIM115
        env = {"PATH": os.environ.get("PATH", ""), "HOME": os.environ.get("HOME", ""), **self.env}
        cmd = [str(python), "-m", "uvicorn", *self.app, "--host", "127.0.0.1",
               "--port", str(self.port)]
        self.popen = subprocess.Popen(cmd, cwd=self.cwd, env=env, stdout=log,
                                      stderr=subprocess.STDOUT)
        wait_healthy(self.url, lambda: self.popen is not None and self.popen.poll() is None)

    def kill(self) -> None:
        """SIGKILL: no shutdown hook runs, so nothing can be flushed from memory."""
        if self.popen and self.popen.poll() is None:
            self.popen.send_signal(signal.SIGKILL)
            self.popen.wait(timeout=10)
        self.popen = None

    def restart(self) -> None:
        self.kill()
        self.start()


# ---- containers ------------------------------------------------------------------------------


@dataclass
class Container:
    """One service container. Started on a private network (+ infra-network for Mongo); the
    port is published on 127.0.0.1 only."""

    name: str
    image: str
    env: dict[str, str]
    port: int
    inner_port: int
    networks: list[str]
    log_dir: Path
    starts: int = 0
    created: bool = False

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def start(self) -> None:
        self.starts += 1
        if not self.created:
            cmd = ["docker", "run", "-d", "--name", self.name, "--network", self.networks[0],
                   "-p", f"127.0.0.1:{self.port}:{self.inner_port}"]
            for k in self.env:
                cmd += ["-e", k]  # values come from the environment below, not the command line
            subprocess.run([*cmd, self.image], check=True, capture_output=True,
                           env={**os.environ, **self.env})
            for net in self.networks[1:]:
                subprocess.run(["docker", "network", "connect", net, self.name], check=True,
                               capture_output=True)
            self.created = True
        else:
            subprocess.run(["docker", "start", self.name], check=True, capture_output=True)
        wait_healthy(self.url, timeout=90)

    def kill(self) -> None:
        if self.created:
            self.save_log()
            subprocess.run(["docker", "kill", self.name], capture_output=True)

    def restart(self) -> None:
        self.kill()
        self.start()

    def save_log(self) -> None:
        out = subprocess.run(["docker", "logs", self.name], capture_output=True)
        (self.log_dir / f"{self.name}-{self.starts}.log").write_bytes(out.stdout + out.stderr)

    def remove(self) -> None:
        if self.created:
            self.save_log()
            subprocess.run(["docker", "rm", "-f", self.name], capture_output=True)
            self.created = False
