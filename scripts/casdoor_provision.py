#!/usr/bin/env python3
"""
Casdoor provisioner — local replacement for uvx casdoor-provision / casdoor-app-delete.

Usage
-----
    # Provision orgs, apps, roles, groups from config/casdoor/*.yaml:
    python3 scripts/casdoor_provision.py [--env-file .env] [--config-dir ./config/casdoor]

    # Delete a Casdoor application:
    python3 scripts/casdoor_provision.py delete-app <name> [--env-file .env]

    # Dry run:
    python3 scripts/casdoor_provision.py --dry-run

Dependencies: httpx, pyyaml  (both in backend/pyproject.toml)
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

import httpx
import yaml

# ---------------------------------------------------------------------------
# Env helpers
# ---------------------------------------------------------------------------

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


def _require_env(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        print(f"ERROR: required env var {name} is not set", file=sys.stderr)
        sys.exit(1)
    return value


# ---------------------------------------------------------------------------
# Admin client (inline of ushadow_casdoor.client)
# ---------------------------------------------------------------------------

def _psql_query(cmd: list[str], pg_user: str, pg_db: str) -> tuple[str, str]:
    """Run a psql query via an exec command (docker or kubectl) and return (client_id, client_secret)."""
    result = subprocess.run(
        cmd + ["psql", "-U", pg_user, "-d", pg_db, "-t", "-c",
               "SELECT client_id, client_secret FROM application WHERE name='app-built-in';"],
        capture_output=True, text=True, timeout=10,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip())
    line = result.stdout.strip()
    parts = [p.strip() for p in line.split("|")]
    if len(parts) != 2 or not parts[0]:
        raise RuntimeError(f"Unexpected DB output: {line!r}")
    return parts[0], parts[1]


def _kubectl_exec_cmd(namespace: str, selector: str) -> list[str]:
    """Resolve kubectl exec command for the first pod matching selector in namespace."""
    pod_result = subprocess.run(
        ["kubectl", "get", "pod", "-n", namespace, "-l", selector,
         "--field-selector=status.phase=Running", "-o", "name"],
        capture_output=True, text=True, timeout=15,
    )
    if pod_result.returncode != 0:
        raise RuntimeError(f"kubectl get pod failed: {pod_result.stderr.strip()}")
    pod_name = pod_result.stdout.strip().splitlines()[0] if pod_result.stdout.strip() else ""
    if not pod_name:
        raise RuntimeError(f"No running pod found in namespace={namespace!r} with selector={selector!r}")
    # pod_name may be "pod/postgres-0" — strip the "pod/" prefix for exec
    pod_name = pod_name.removeprefix("pod/")
    return ["kubectl", "exec", pod_name, "-n", namespace, "--"]


def _bootstrap_credentials(pg_container: str, pg_user: str, pg_db: str, retries: int = 10, retry_delay: float = 3.0) -> tuple[str, str]:
    import time

    # K8s path: use kubectl exec when CASDOOR_PG_K8S_NAMESPACE is set.
    # This avoids hitting the local Docker postgres (which may belong to a different environment).
    k8s_namespace = os.environ.get("CASDOOR_PG_K8S_NAMESPACE", "")
    if k8s_namespace:
        selector = os.environ.get("CASDOOR_PG_K8S_SELECTOR", "app=postgres")
        print(f"  [k8s] using kubectl exec in namespace={k8s_namespace!r} selector={selector!r}")
        last_err: Exception | None = None
        for attempt in range(retries):
            try:
                cmd = _kubectl_exec_cmd(k8s_namespace, selector)
                return _psql_query(cmd, pg_user, pg_db)
            except Exception as e:
                last_err = e
                if attempt < retries - 1:
                    print(f"  [wait] K8s postgres not ready, retrying in {retry_delay:.0f}s... ({attempt+1}/{retries})")
                    time.sleep(retry_delay)
        raise RuntimeError(
            f"Could not bootstrap Casdoor admin credentials via kubectl.\n"
            f"  kubectl exec failed: {last_err}\n"
            f"  Check CASDOOR_PG_K8S_NAMESPACE and CASDOOR_PG_K8S_SELECTOR."
        ) from last_err

    # Docker path: default for local dev environments.
    last_err = None
    for attempt in range(retries):
        try:
            return _psql_query(["docker", "exec", pg_container], pg_user, pg_db)
        except Exception as e:
            last_err = e
            if "does not exist" in str(e) and attempt < retries - 1:
                print(f"  [wait] Casdoor DB not ready yet, retrying in {retry_delay:.0f}s... ({attempt+1}/{retries})")
                time.sleep(retry_delay)
            else:
                break

    cid = os.environ.get("CASDOOR_ADMIN_CLIENT_ID", "")
    csec = os.environ.get("CASDOOR_ADMIN_CLIENT_SECRET", "")
    if cid and csec:
        print(f"  [info] docker exec unavailable ({last_err}), using CASDOOR_ADMIN_CLIENT_ID/SECRET")
        return cid, csec
    raise RuntimeError(
        f"Could not bootstrap Casdoor admin credentials.\n"
        f"  docker exec failed: {last_err}\n"
        f"  Fallback: set CASDOOR_ADMIN_CLIENT_ID and CASDOOR_ADMIN_CLIENT_SECRET."
    ) from last_err


class CasdoorAdminClient:
    def __init__(self, base_url: str, org: str, pg_container: str, pg_user: str, pg_db: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.org = org
        client_id, client_secret = _bootstrap_credentials(pg_container, pg_user, pg_db)
        self._http = httpx.Client(
            params={"clientId": client_id, "clientSecret": client_secret},
            timeout=30,
        )

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "CasdoorAdminClient":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def _check(self, resp: httpx.Response, action: str) -> dict:
        resp.raise_for_status()
        body = resp.json()
        if isinstance(body, dict) and body.get("status") not in ("ok", None):
            msg = body.get("msg") or ""
            if "duplicate key" in msg.lower():
                print(f"  [warn] {action}: already exists (duplicate key) — skipping")
                return body
            raise RuntimeError(f"Casdoor {action} failed: {msg or body}")
        return body

    def ensure(
        self,
        resource: str,
        resource_id: str,
        payload: dict,
        dry_run: bool = False,
        merge_on_update: bool = True,
        fetch_after_create: bool = False,
    ) -> dict | None:
        name = payload.get("name", resource_id)
        resp = self._http.get(f"{self.base_url}/api/get-{resource}", params={"id": resource_id})
        resp.raise_for_status()
        existing = resp.json().get("data") if isinstance(resp.json(), dict) else None

        if existing:
            print(f"↩  {resource.capitalize()} '{name}' exists — updating")
            if not dry_run:
                merged = {**existing, **payload} if merge_on_update else payload
                r = self._http.post(f"{self.base_url}/api/update-{resource}",
                                    params={"id": resource_id}, json=merged)
                self._check(r, f"update-{resource} {name}")
            return existing

        print(f"→ {resource.capitalize()} '{name}' not found — creating")
        if dry_run:
            return None
        r = self._http.post(f"{self.base_url}/api/add-{resource}", json=payload)
        self._check(r, f"add-{resource} {name}")

        if fetch_after_create:
            r2 = self._http.get(f"{self.base_url}/api/get-{resource}", params={"id": resource_id})
            created = self._check(r2, f"get-{resource} {name}").get("data") or {}
            print(f"✓ {resource.capitalize()} '{name}' created")
            return created

        print(f"✓ {resource.capitalize()} '{name}' created")
        return payload

    def delete(self, resource: str, resource_id: str, payload: dict, dry_run: bool = False) -> None:
        name = payload.get("name", resource_id)
        resp = self._http.get(f"{self.base_url}/api/get-{resource}", params={"id": resource_id})
        resp.raise_for_status()
        existing = resp.json().get("data") if isinstance(resp.json(), dict) else None

        if not existing:
            print(f"  [skip] {resource.capitalize()} '{name}' not found — nothing to delete")
            return

        print(f"✗ Deleting {resource} '{name}'")
        if not dry_run:
            r = self._http.post(f"{self.base_url}/api/delete-{resource}", json={**existing, **payload})
            self._check(r, f"delete-{resource} {name}")
            print(f"✓ {resource.capitalize()} '{name}' deleted")

    def write_credentials(self, env_file: Path, client_id: str, client_secret: str) -> None:
        if not env_file.exists():
            print(f"  [warn] {env_file} not found — skipping credential write-back")
            return
        text = env_file.read_text()

        def replace_or_append(content: str, key: str, value: str) -> tuple[str, bool]:
            pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
            if pattern.search(content):
                return pattern.sub(f"{key}={value}", content), True
            return content + f"\n{key}={value}\n", False

        text, found_id = replace_or_append(text, "CASDOOR_CLIENT_ID", client_id)
        text, found_secret = replace_or_append(text, "CASDOOR_CLIENT_SECRET", client_secret)
        env_file.write_text(text)
        print(f"✓ {'updated' if found_id else 'appended'} CASDOOR_CLIENT_ID in {env_file}")
        print(f"✓ {'updated' if found_secret else 'appended'} CASDOOR_CLIENT_SECRET in {env_file}")


# ---------------------------------------------------------------------------
# YAML loader
# ---------------------------------------------------------------------------

def _load_yaml(filename: str, config_dir: Path) -> dict:
    path = config_dir / filename
    if not path.exists():
        return {}
    text = re.sub(r'\$\{(\w+)\}', lambda m: os.environ.get(m.group(1), m.group(0)),
                  path.read_text())
    return yaml.safe_load(text) or {}


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_provision(args: argparse.Namespace) -> None:
    env_path = Path(args.env_file)
    _load_env(env_path)

    config_dir = Path(args.config_dir)
    base_url = (os.environ.get("CASDOOR_EXTERNAL_URL") or _require_env("CASDOOR_ENDPOINT")).rstrip("/")
    pg_container = os.environ.get("CASDOOR_PG_CONTAINER", "postgres")
    pg_superuser = os.environ.get("CASDOOR_PG_USER") or os.environ.get("POSTGRES_USER", "postgres")
    pg_db = os.environ.get("CASDOOR_PG_DB", "casdoor")
    app_name = os.environ.get("CASDOOR_APP_NAME", "")

    orgs_config = _load_yaml("organizations.yaml", config_dir)
    admin_org = orgs_config.get("admin_org", "admin")
    user_org = orgs_config.get("user_org", "built-in")

    if args.dry_run:
        print("[DRY-RUN MODE] No changes will be made.\n")

    with CasdoorAdminClient(base_url, admin_org, pg_container, pg_superuser, pg_db) as admin:

        # Patch built-in org
        print("\n── Built-in org patch ─────────────────────────────────────────────────")
        admin.ensure("organization", "admin/built-in",
                     {"owner": "admin", "name": "built-in", "defaultApplication": ""},
                     dry_run=args.dry_run, merge_on_update=True)

        print("\n── Organizations ──────────────────────────────────────────────────────")
        for org_def in orgs_config.get("organizations", []):
            admin.ensure("organization", f"{admin_org}/{org_def['name']}",
                         {"owner": admin_org, **org_def},
                         dry_run=args.dry_run, merge_on_update=True)

        print("\n── Providers ──────────────────────────────────────────────────────────")
        for provider_def in _load_yaml("providers.yaml", config_dir).get("providers", []):
            admin.ensure("provider", f"{admin_org}/{provider_def['name']}",
                         {"owner": admin_org, **provider_def},
                         dry_run=args.dry_run, merge_on_update=True)

        print("\n── Applications ───────────────────────────────────────────────────────")
        apps_config = _load_yaml("apps.yaml", config_dir)
        app_credentials: dict[str, tuple[str, str]] = {}
        for app_def in apps_config.get("apps", []):
            result = admin.ensure("application", f"{admin_org}/{app_def['name']}",
                                  {"owner": admin_org, "organization": user_org, **app_def},
                                  dry_run=args.dry_run, merge_on_update=True, fetch_after_create=True)
            if result and (cid := result.get("clientId")):
                app_credentials[app_def["name"]] = (cid, result.get("clientSecret", ""))

        print("\n── Groups ─────────────────────────────────────────────────────────────")
        for group_def in _load_yaml("groups.yaml", config_dir).get("groups", []):
            admin.ensure("group", f"{user_org}/{group_def['name']}",
                         {"owner": user_org, **group_def},
                         dry_run=args.dry_run, merge_on_update=False)

        print("\n── Roles ──────────────────────────────────────────────────────────────")
        for role_def in _load_yaml("roles.yaml", config_dir).get("roles", []):
            admin.ensure("role", f"{user_org}/{role_def['name']}",
                         {"owner": user_org, "users": [], "roles": [], "domains": [],
                          "isEnabled": True, **role_def},
                         dry_run=args.dry_run, merge_on_update=False)

        # App admin user
        raw_user = os.environ.get("CASDOOR_APP_ADMIN_USER", "admin")
        username = raw_user.split("/")[-1]
        password = str(os.environ.get("CASDOOR_APP_ADMIN_PASSWORD", "") or app_name)
        print("\n── App admin user ─────────────────────────────────────────────────────")
        print(f"  user: {user_org}/{username}")
        admin.ensure("user", f"{user_org}/{username}",
                     {"owner": user_org, "name": username, "displayName": "Admin",
                      "password": password, "type": "normal-user",
                      "signupApplication": app_name, "isAdmin": True,
                      "isForbidden": False, "isDeleted": False},
                     dry_run=args.dry_run, merge_on_update=False)

    if not args.dry_run and app_name and app_name in app_credentials:
        cid, csecret = app_credentials[app_name]
        print("\n── Application credentials ────────────────────────────────────────────")
        with CasdoorAdminClient(base_url, admin_org, pg_container, pg_superuser, pg_db) as admin:
            admin.write_credentials(env_path, cid, csecret)

    print("\n✓ Casdoor provisioning complete")


def cmd_delete_app(args: argparse.Namespace) -> None:
    env_path = Path(args.env_file)
    _load_env(env_path)

    base_url = (os.environ.get("CASDOOR_EXTERNAL_URL") or _require_env("CASDOOR_ENDPOINT")).rstrip("/")
    pg_container = os.environ.get("CASDOOR_PG_CONTAINER", "postgres")
    pg_superuser = os.environ.get("CASDOOR_PG_USER") or os.environ.get("POSTGRES_USER", "postgres")
    pg_db = os.environ.get("CASDOOR_PG_DB", "casdoor")

    orgs_config = _load_yaml("organizations.yaml", Path(args.config_dir)) if Path(args.config_dir).exists() else {}
    admin_org = orgs_config.get("admin_org", "admin")

    with CasdoorAdminClient(base_url, admin_org, pg_container, pg_superuser, pg_db) as admin:
        admin.delete("application", f"{admin_org}/{args.app_name}",
                     {"owner": admin_org, "name": args.app_name},
                     dry_run=args.dry_run)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Casdoor provisioner")
    parser.add_argument("--env-file", default=".env")
    parser.add_argument("--config-dir", default="./config/casdoor")
    parser.add_argument("--dry-run", action="store_true")

    sub = parser.add_subparsers(dest="command")

    # delete-app subcommand
    del_parser = sub.add_parser("delete-app", help="Delete a Casdoor application")
    del_parser.add_argument("app_name", help="Application name to delete")
    del_parser.add_argument("--env-file", default=".env")
    del_parser.add_argument("--config-dir", default="./config/casdoor")
    del_parser.add_argument("--dry-run", action="store_true")

    args = parser.parse_args()

    if args.command == "delete-app":
        cmd_delete_app(args)
    else:
        cmd_provision(args)


if __name__ == "__main__":
    main()
