# Casdoor provisioning recipes
# Scaffolded by: uvx --from "git+https://github.com/Ushadow-io/ushadow-sdk" casdoor-init
#
# Full setup sequence for a new environment:
#   just casdoor-db-setup    # 1. create Postgres user + database
#   just casdoor-start       # 2. generate app.conf, start container, wait for health
#   just casdoor-provision   # 3. apply orgs / apps / roles / groups / app-admin user
#
# One-time re-scaffold (safe — skips existing files):
#   just casdoor-install

_backend := "ushadow/backend"

# ── Bootstrap ─────────────────────────────────────────────────────────────────

# Re-run the SDK scaffold (skips files that already exist — use --force to overwrite)
casdoor-install:
    uvx --from "git+https://github.com/Ushadow-io/ushadow-sdk" casdoor-init

# ── Step 1: database ──────────────────────────────────────────────────────────

# Create the Casdoor Postgres user and database (run once before first boot)
casdoor-db-setup env="dev":
    uv run --directory {{_backend}} casdoor-db-setup \
        --env-file {{ if env == "dev" { ".env" } else { ".env." + env } }}

# ── Step 2: container ─────────────────────────────────────────────────────────

# Generate app.conf from template, start the Casdoor container, wait for health
casdoor-start env="dev":
    #!/usr/bin/env python3
    import os, re, subprocess, sys, time, urllib.request
    from pathlib import Path

    env_file = ".env" if "{{env}}" == "dev" else ".env.{{env}}"
    for line in Path(env_file).read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

    # Generate app.conf from template
    template_path = Path("config/casdoor/app.conf.template")
    if not template_path.exists():
        print(f"  ERROR: {template_path} not found", file=sys.stderr)
        sys.exit(1)
    conf = re.sub(r'\$\{(\w+)\}', lambda m: os.environ.get(m.group(1), ""), template_path.read_text())
    Path("config/casdoor/app.conf").write_text(conf)
    print("  generated config/casdoor/app.conf")

    # Ensure external networks exist (infra bootstrap creates these, but guard anyway)
    for net in ("ushadow-network", "infra-network"):
        subprocess.run(["docker", "network", "create", net], capture_output=True)

    # Start via the infra compose (casdoor is part of the infra profile)
    subprocess.run(
        ["docker", "compose", "-f", "compose/docker-compose.infra.yml",
         "--profile", "infra", "up", "casdoor", "-d"],
        check=True,
    )

    # Wait for health
    port = os.environ.get("CASDOOR_PORT", "8082")
    url  = f"http://localhost:{port}/api/health"
    print(f"  waiting for Casdoor at {url} ...")
    for _ in range(30):
        try:
            urllib.request.urlopen(url, timeout=2)
            print("  Casdoor ready")
            sys.exit(0)
        except Exception:
            time.sleep(2)
    print("  ERROR: Casdoor did not start within 60 s", file=sys.stderr)
    sys.exit(1)

# ── Step 3: provision ─────────────────────────────────────────────────────────

# Apply orgs, apps, providers, groups, roles, and app-admin user from config/casdoor/*.yaml.
# CASDOOR_APP_ADMIN_USER / CASDOOR_APP_ADMIN_PASSWORD from .env control the CLI admin user.
casdoor-provision env="dev":
    uv run --directory {{_backend}} casdoor-provision \
        --config-dir ./config/casdoor \
        --env-file {{ if env == "dev" { ".env" } else { ".env." + env } }}
