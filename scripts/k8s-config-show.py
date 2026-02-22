#!/usr/bin/env python3
"""Show K8s ushadow config and secrets from the running backend pod.

Reads config files directly from the backend pod's /config PVC via kubectl exec,
so it shows the actual live state (including tokens saved by wizards at runtime).

Displays:
  - Infrastructure overrides and scans
  - API keys (mycelia tokens, etc.)
  - Security settings
  - Service-specific secrets

Masks sensitive values by default.
"""

import json
import re
import subprocess
import sys

SENSITIVE = re.compile(r"(KEY|SECRET|PASSWORD|TOKEN|CREDENTIAL)", re.I)
HEX_KEY = re.compile(r"^[0-9a-f]{8,}$")

# Config files inside the backend pod (mounted from ushadow-config PVC)
POD_CONFIG_FILES = [
    ("config.overrides.yaml", "/config/config.overrides.yaml"),
    ("SECRETS/secrets.yaml", "/config/SECRETS/secrets.yaml"),
    ("SECRETS/secrets_k8s.yaml", "/config/SECRETS/secrets_k8s.yaml"),
]

# Top-level sections to display (beyond infrastructure)
DISPLAY_SECTIONS = ["api_keys", "security", "services"]


def mask(d: dict) -> dict:
    """Mask values whose keys match sensitive patterns."""
    result = {}
    for k, v in d.items():
        if isinstance(v, dict):
            result[k] = mask(v)
        elif SENSITIVE.search(k) and v:
            result[k] = "****" + str(v)[-4:]
        else:
            result[k] = v
    return result


def find_backend_pod() -> str | None:
    """Find the ushadow backend pod name."""
    try:
        result = subprocess.run(
            ["kubectl", "get", "pods", "-n", "ushadow",
             "-l", "app=backend",
             "-o", "jsonpath={.items[0].metadata.name}"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    # Fallback: find by name pattern
    try:
        result = subprocess.run(
            ["kubectl", "get", "pods", "-n", "ushadow",
             "-o", "jsonpath={range .items[*]}{.metadata.name}{'\\n'}{end}"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            for line in result.stdout.strip().split("\n"):
                if line.startswith("backend-"):
                    return line
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    return None


def read_pod_file(pod: str, path: str) -> str | None:
    """Read a file from the backend pod via kubectl exec."""
    try:
        result = subprocess.run(
            ["kubectl", "exec", pod, "-n", "ushadow", "--", "cat", path],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            return result.stdout
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None


def main():
    import yaml

    pod = find_backend_pod()
    if not pod:
        print("❌ No ushadow backend pod found in the 'ushadow' namespace.")
        print("   Is the backend deployed? Check: kubectl get pods -n ushadow")
        sys.exit(1)

    print(f"📋 K8s Config (from pod {pod})")
    print()

    # Load all config files from the pod
    all_configs: list[tuple[str, dict]] = []
    for label, path in POD_CONFIG_FILES:
        content = read_pod_file(pod, path)
        if content:
            raw = yaml.safe_load(content) or {}
            all_configs.append((label, raw))

    if not all_configs:
        print("  (no config files found in pod)")
        sys.exit(0)

    # Show sources
    print("Sources:")
    for label, _ in all_configs:
        print(f"  ✓ {label}")
    print()

    # --- Infrastructure section ---
    merged_overrides = {}
    merged_scans = {}
    for _, raw in all_configs:
        infra = raw.get("infrastructure", {})
        for k, v in (infra.get("overrides") or {}).items():
            if isinstance(v, dict):
                merged_overrides.setdefault(k, {}).update(v)
        for k, v in (infra.get("scans") or {}).items():
            if isinstance(v, dict):
                merged_scans.setdefault(k, {}).update(v)

    if merged_overrides:
        print("=== Infrastructure Overrides ===")
        for cluster, vals in sorted(merged_overrides.items()):
            tag = " ⚠️ stale hex ID" if HEX_KEY.match(cluster) else ""
            print(f"  [{cluster}]{tag}")
            for k, v in sorted(mask(vals).items()):
                print(f"    {k}: {v}")
        print()

    if merged_scans:
        print("=== Infrastructure Scans ===")
        for cluster, vals in sorted(merged_scans.items()):
            tag = " ⚠️ stale hex ID" if HEX_KEY.match(cluster) else ""
            print(f"  [{cluster}]{tag}")
            for k, v in sorted(vals.items()):
                print(f"    {k}: {v}")
        print()

    # --- Other sections (api_keys, security, services) ---
    merged_sections: dict[str, dict] = {}
    for _, raw in all_configs:
        for section in DISPLAY_SECTIONS:
            section_data = raw.get(section)
            if isinstance(section_data, dict) and section_data:
                merged_sections.setdefault(section, {}).update(section_data)

    for section, data in sorted(merged_sections.items()):
        # Skip empty sections
        non_empty = {k: v for k, v in data.items() if v not in (None, "", {}, [])}
        if not non_empty:
            continue
        title = section.replace("_", " ").title()
        print(f"=== {title} ===")
        for k, v in sorted(mask(non_empty).items()):
            if isinstance(v, dict):
                print(f"  {k}:")
                for sk, sv in sorted(mask(v).items()):
                    if sv not in (None, "", {}, []):
                        print(f"    {sk}: {sv}")
            else:
                print(f"  {k}: {v}")
        print()

    # Warn about stale hex keys
    all_keys = set(list(merged_overrides) + list(merged_scans))
    hex_keys = sorted(k for k in all_keys if HEX_KEY.match(k))
    if hex_keys:
        print("─" * 50)
        print(f"⚠️  Found {len(hex_keys)} stale hex-keyed entry group(s): {', '.join(hex_keys)}")
        print("   The web uses stable cluster names (e.g. 'k8s').")


if __name__ == "__main__":
    main()
