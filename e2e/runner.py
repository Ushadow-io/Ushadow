"""Run the story twice (straight through, and with both services killed and started again in
the middle), compare the end states, and clean up: test databases dropped, servers stopped,
containers, network and images removed. Also on failure."""

from __future__ import annotations

import os
import subprocess
import uuid
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from typing import Any

from harness import LEDGER_DIR, MEMORY_DIR, MEMORY_PREFIX, Container, TestDbs, free_port
from story import (
    Services,
    Story,
    bad_token_memory,
    docker_services,
    memory_env,
    process_services,
    run_story,
)

RESTART_AFTER = "e human correction survives sync + rebuild"


def mongo_uri() -> str:
    uri = os.environ.get("E2E_MONGO_URI", "")
    if not uri:
        raise SystemExit("set E2E_MONGO_URI (a replica-set Mongo; only *_test_e2e_* DBs are used)")
    return uri


def _report(runs: dict[str, Story]) -> bool:
    ok = True
    for label, story in runs.items():
        print(f"\n== {label}")
        for name, passed, detail in story.results:
            print(f"  {'PASS' if passed else 'FAIL'}  {name}: {detail}")
            ok = ok and passed
    snaps = [s.notes.get("snapshot") for s in runs.values()]
    same = len(snaps) == 2 and snaps[0] is not None and snaps[0] == snaps[1]
    print(f"\n  {'PASS' if same else 'FAIL'}  j restart in the middle ends in the same state")
    if not same and all(snaps):
        for key in snaps[0]:
            if snaps[0][key] != snaps[1][key]:
                print(f"     differs: {key}\n       straight: {snaps[0][key]}")
                print(f"       restart:  {snaps[1][key]}")
    return ok and same


def _docker(cmd: list[str], **kw: Any) -> subprocess.CompletedProcess:
    return subprocess.run(["docker", *cmd], check=True, capture_output=True, **kw)


@dataclass(frozen=True)
class DockerRun:
    dbs: TestDbs
    uri: str  # Mongo as the containers see it
    logs: Path
    net: str
    images: tuple[str, str]

    def bad_memory(self, svc: Services) -> Container:
        """A memory container that holds the WRONG ledger token."""
        mdb = self.dbs.new(MEMORY_PREFIX)
        env = memory_env(self.uri, mdb, f"http://{svc.ledger.name}:8200", "not-the-ledger-token",
                         svc.tokens)
        return Container(f"e2e-memory-bad-{mdb[-12:]}", self.images[1], env, free_port(), 8210,
                         [self.net, "infra-network"], self.logs)


def run_all(docker: bool, logs: Path) -> int:
    uri = mongo_uri()
    dbs = TestDbs(uri)
    tag = uuid.uuid4().hex[:8]
    images = (f"e2e-ledger:{tag}", f"e2e-memory:{tag}")
    net = f"e2e-net-{tag}"
    print(f"logs: {logs}")
    try:
        if docker:
            inner = os.environ.get("E2E_DOCKER_MONGO_URI", "mongodb://mongo:27017/?replicaSet=rs0")
            _docker(["build", "-q", "-t", images[0], str(LEDGER_DIR)])
            _docker(["build", "-q", "-t", images[1], str(MEMORY_DIR)])
            _docker(["network", "create", net])
            make = partial(docker_services, dbs, inner, logs, net, images)
            extra = DockerRun(dbs, inner, logs, net, images).bad_memory
        else:
            make = partial(process_services, dbs, uri, logs)
            extra = partial(bad_token_memory, dbs=dbs, uri=uri, logs=logs)
        runs = {"straight through": run_story(make, dbs, None, extra),
                "restart after step e": run_story(make, dbs, RESTART_AFTER, extra)}
        ok = _report(runs)
    finally:
        dbs.drop_all()
        if docker:
            subprocess.run(["docker", "network", "rm", net], capture_output=True)
            subprocess.run(["docker", "rmi", "-f", *images], capture_output=True)
        found = dbs.leftovers()
        left = [n for n in found if n in dbs.names]
        print(f"\nthis run's test databases left on the server: {left or 'none'}")
        if set(found) - set(left):  # e.g. another e2e run at the same time
            print(f"other *_test_e2e_* databases (not this run's): {sorted(set(found) - set(left))}")
        dbs.client.close()
    return 0 if ok and not left else 1
