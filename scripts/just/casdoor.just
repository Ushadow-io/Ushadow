# Casdoor recipes
# Scaffolded by: uvx --from "git+https://github.com/Ushadow-io/ushadow-sdk" casdoor-init
#
# Add to your root justfile:
#   import 'scripts/just/casdoor.just'
#
# Full setup sequence for a new environment:
#   just casdoor-db-setup    # 1. create Postgres user + database
#   just casdoor-start       # 2. generate app.conf, start container, wait for health
#   just casdoor-provision   # 3. apply orgs / apps / roles / groups
#
# One-time re-scaffold (safe — skips existing files):
#   just casdoor-install

# Directory containing casdoor_db_setup.py and casdoor_provision.py
_scripts_dir := "./scripts"

# External Docker network names — must match your infra bootstrap.
# Override via env: APP_NETWORK=my-net INFRA_NETWORK=my-infra-net just casdoor-start
_app_network   := env_var_or_default("APP_NETWORK",   "app-network")
_infra_network := env_var_or_default("INFRA_NETWORK", "infra-network")

# ── Bootstrap ─────────────────────────────────────────────────────────────────

# Re-run the SDK scaffold (skips files that already exist — use --force to overwrite)
casdoor-install:
    uvx --from "git+https://github.com/Ushadow-io/ushadow-sdk" casdoor-init

# ── Step 1: database ──────────────────────────────────────────────────────────

# Create the Casdoor Postgres user and database (run once before first boot)
casdoor-db-setup env="dev":
    python3 {{_scripts_dir}}/casdoor_db_setup.py \
        --env-file {{ if env == "dev" { ".env" } else { ".env." + env } }}

# ── Step 2: container ─────────────────────────────────────────────────────────

# Generate app.conf, start the Casdoor container, wait for health
casdoor-start env="dev":
    #!/usr/bin/env python3
    import os, subprocess, sys, time, urllib.request
    from pathlib import Path

    env_file = ".env" if "{{env}}" == "dev" else ".env.{{env}}"
    for line in Path(env_file).read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

    port     = os.environ.get("CASDOOR_PORT", "8082")
    ext_url  = os.environ.get("CASDOOR_EXTERNAL_URL", f"http://localhost:{port}")
    pg_user  = os.environ.get("CASDOOR_PG_USER",    "casdoor")
    pg_pass  = os.environ.get("CASDOOR_DB_PASSWORD", "casdoor")
    pg_host  = os.environ.get("CASDOOR_PG_CONTAINER", "postgres")
    pg_db    = os.environ.get("CASDOOR_PG_DB",       "casdoor")

    dsn = f"user={pg_user} password={pg_pass} host={pg_host} port=5432 sslmode=disable dbname={pg_db}"
    conf = "\n".join([
        "appname = casdoor",
        "httpport = 8000",
        "runmode = dev",
        "SessionOn = true",
        "copyrequestbody = true",
        f"origin = {ext_url}",
        "",
        "driverName = postgres",
        f'dataSourceName = "{dsn}"',
        f"dbName = {pg_db}",
        "tableNamePrefix =",
        "showSql = false",
        "",
        "redisEndpoint =",
        "defaultStorageProvider =",
        "isCloudIntranet = false",
        'authState = "casdoor"',
        'socks5Proxy = ""',
        "verificationCodeTimeout = 10",
        "initScore = 2000",
        "logPostOnly = true",
        'staticBaseUrl = "https://cdn.casbin.org"',
        "",
    ])
    conf_path = Path("config/casdoor/app.conf.local")
    conf_path.parent.mkdir(parents=True, exist_ok=True)
    conf_path.write_text(conf)
    print(f"  generated {conf_path}")

    # Ensure external networks exist (idempotent)
    app_net   = os.environ.get("APP_NETWORK",   "{{_app_network}}")
    infra_net = os.environ.get("INFRA_NETWORK", "{{_infra_network}}")
    for net in (app_net, infra_net):
        subprocess.run(["docker", "network", "create", net],
                       capture_output=True)  # ignore error if already exists

    # Start container
    subprocess.run(
        ["docker", "compose", "-f", "compose/casdoor.yml", "--profile", "infra", "up", "-d"],
        env={**os.environ, "APP_NETWORK": app_net, "INFRA_NETWORK": infra_net},
        check=True,
    )

    # Wait for HTTP health (port open ≠ ready — Casdoor runs DB migrations on start)
    url = f"http://localhost:{port}/api/health"
    print(f"  waiting for Casdoor at {url} ...")
    for _ in range(60):
        try:
            urllib.request.urlopen(url, timeout=2)
            print("  Casdoor ready")
            sys.exit(0)
        except Exception:
            time.sleep(2)
    print("  ERROR: Casdoor did not start within 120 s", file=sys.stderr)
    sys.exit(1)

# ── Step 3: provision ─────────────────────────────────────────────────────────

# Apply orgs, apps, providers, groups, and roles defined in config/casdoor/*.yaml
casdoor-provision env="dev":
    uv run --with httpx --with pyyaml python3 {{_scripts_dir}}/casdoor_provision.py \
        --config-dir ./config/casdoor \
        --env-file {{ if env == "dev" { ".env" } else { ".env." + env } }}

# ── Maintenance ───────────────────────────────────────────────────────────────

# Delete a Casdoor application by name
casdoor-app-delete app env="dev":
    uv run --with httpx --with pyyaml python3 {{_scripts_dir}}/casdoor_provision.py \
        delete-app {{app}} \
        --config-dir ./config/casdoor \
        --env-file {{ if env == "dev" { ".env" } else { ".env." + env } }}

# Reset the Casdoor DB — drops the database and clears credentials from .env.
# Run casdoor-db-setup then casdoor-start before casdoor-provision to reinitialise.
casdoor-db-reset env="dev":
    #!/usr/bin/env bash
    set -euo pipefail
    ENV_FILE="{{ if env == "dev" { ".env" } else { ".env." + env } }}"
    _get() { grep "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true; }
    _clear() { sed -i '' "s|^$1=.*|$1=|" "$ENV_FILE" 2>/dev/null || true; }

    CONTAINER=$(_get CASDOOR_PG_CONTAINER); CONTAINER=${CONTAINER:-postgres}
    SUPERUSER=$(_get POSTGRES_USER);         SUPERUSER=${SUPERUSER:-postgres}
    PG_USER=$(_get CASDOOR_PG_USER);        PG_USER=${PG_USER:-casdoor}
    DB=$(_get CASDOOR_PG_DB);               DB=${DB:-casdoor}

    echo "→ Stopping casdoor container..."
    docker compose -f compose/casdoor.yml --profile infra stop casdoor 2>/dev/null || true

    echo "→ Terminating active connections to '$DB'..."
    docker exec "$CONTAINER" psql -U "$SUPERUSER" -c \
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB' AND pid <> pg_backend_pid();" 2>/dev/null || true

    echo "→ Dropping database '$DB' and user '$PG_USER'..."
    docker exec "$CONTAINER" psql -U "$SUPERUSER" -c "DROP DATABASE IF EXISTS $DB;"
    docker exec "$CONTAINER" psql -U "$SUPERUSER" -c "DROP USER IF EXISTS $PG_USER;"

    echo "→ Clearing credentials from $ENV_FILE..."
    _clear CASDOOR_CLIENT_ID
    _clear CASDOOR_CLIENT_SECRET
    _clear CASDOOR_ADMIN_CLIENT_ID
    _clear CASDOOR_ADMIN_CLIENT_SECRET

    echo "✓ Done. Run 'just casdoor-db-setup && just casdoor-start && just casdoor-provision' to reinitialise."
