#!/usr/bin/env python3
"""
casdoor-db-setup
================
Creates the Casdoor PostgreSQL user and database if they don't exist.
Must be run before starting Casdoor for the first time.

Usage
-----
    python3 scripts/casdoor_db_setup.py [--env-file .env] [--dry-run]

Environment variables
---------------------
    CASDOOR_PG_CONTAINER  Docker container running Postgres (default: postgres)
    POSTGRES_USER         Postgres superuser for init commands  (default: postgres)
    CASDOOR_PG_USER       User Casdoor will connect as          (default: casdoor)
    CASDOOR_DB_PASSWORD   Password for CASDOOR_PG_USER          (default: casdoor)
    CASDOOR_PG_DB         Database name Casdoor will use        (default: casdoor)
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


def _load_env(env_file: Path) -> None:
    if not env_file.exists():
        print(f"  [warn] env file not found: {env_file} — relying on process env")
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        if key.strip() and key.strip() not in os.environ:
            os.environ[key.strip()] = value.strip()


def _psql(container: str, superuser: str, sql: str, dry_run: bool, db: str | None = None) -> None:
    print(f"  sql> {sql.strip()}")
    if dry_run:
        return
    cmd = ["docker", "exec", container, "psql", "-U", superuser]
    if db:
        cmd += ["-d", db]
    cmd += ["-c", sql]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    if result.returncode != 0:
        stderr = result.stderr.strip()
        if "already exists" in stderr.lower():
            print("  [skip] already exists")
        else:
            print(f"  [error] {stderr}", file=sys.stderr)
            sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Create Casdoor's PostgreSQL user and database")
    parser.add_argument("--env-file", default=".env")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    _load_env(Path(args.env_file))

    container = os.environ.get("CASDOOR_PG_CONTAINER", "postgres")
    superuser = os.environ.get("POSTGRES_USER",       "postgres")
    user      = os.environ.get("CASDOOR_PG_USER",     "casdoor")
    password  = os.environ.get("CASDOOR_DB_PASSWORD", "casdoor")
    db        = os.environ.get("CASDOOR_PG_DB",       "casdoor")

    if args.dry_run:
        print("[DRY-RUN MODE] No changes will be made.\n")

    print(f"── Casdoor DB setup (container: {container}, superuser: {superuser}) ─────")

    print(f"\n── User '{user}' ────────────────────────────────────────────────────────")
    _psql(container, superuser, f"CREATE USER {user} WITH PASSWORD '{password}';", args.dry_run)

    print(f"\n── Database '{db}' ──────────────────────────────────────────────────────")
    _psql(container, superuser, f"CREATE DATABASE {db} OWNER {user};", args.dry_run)

    print(f"\n── Privileges ───────────────────────────────────────────────────────────")
    _psql(container, superuser, f"GRANT ALL PRIVILEGES ON DATABASE {db} TO {user};", args.dry_run)
    # PostgreSQL 15+ removed default CREATE on public schema — grant it explicitly
    _psql(container, superuser, f"GRANT ALL ON SCHEMA public TO {user};", args.dry_run, db=db)

    print(f"\n✓ Casdoor database ready  (db={db}, user={user})")


if __name__ == "__main__":
    main()
