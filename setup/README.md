# Setup Utilities

This directory contains shared utilities for Chronicle environment setup and configuration.

## setuputils.py

Python CLI utilities for validating and configuring Chronicle environments.

### Features

- **Port Conflict Detection**: Check if TCP ports are available before starting services
- **Redis Database Selection**: Find empty Redis databases (0-15) for multi-environment isolation
- **Environment Markers**: Tag Redis databases with environment names for reuse
- **Multi-Port Validation**: Validate multiple ports at once

### Environment Marker System

Redis only supports 16 databases (0-15). To prevent running out of databases in multi-worktree setups, the utilities implement an environment marker system:

1. **First Run**: When an environment (e.g., "blue") selects a database, it stores a marker key `chronicle:env:name` with the environment name
2. **Subsequent Runs**: When the same environment runs again, it finds and reuses its marked database instead of claiming a new one
3. **Different Environments**: Each environment gets its own database, identified by the marker

**Benefits:**
- Environments can restart without consuming new databases
- Maximum of 16 concurrent environments (one per Redis database)
- Automatic cleanup when Redis is reset
- No external state files needed

### Usage

```bash
# Check if a single port is in use
python3 setup/setuputils.py check-port 8000

# Find available Redis database
python3 setup/setuputils.py find-redis-db 2

# Validate multiple ports at once
python3 setup/setuputils.py validate-ports 8000 3000 6333
```

### Commands

| Command | Description | Exit Code |
|---------|-------------|-----------|
| `check-port <port>` | Check if port is in use | 0 if available, 1 if in use |
| `check-redis-db <db_num>` | Check if Redis DB has data | 0 if empty, 1 if has data |
| `find-redis-db <preferred_db> [env_name]` | Find available Redis DB for environment | 0 always |
| `set-redis-marker <db_num> <env_name>` | Mark Redis DB with environment name | 0 if success, 1 if failed |
| `get-redis-marker <db_num>` | Get environment marker from Redis DB | 0 if exists, 1 if not found |
| `validate-ports <port1> [port2...]` | Check multiple ports | 0 if all available, 1 if conflicts |

### JSON Output

All commands return JSON for easy parsing:

```bash
$ python3 setup/setuputils.py check-port 8000
{"in_use": false, "port": 8000}

$ python3 setup/setuputils.py validate-ports 8000 3000
{"available": true, "conflicts": [], "ports": [8000, 3000]}

# Find database for "blue" environment (first time)
$ python3 setup/setuputils.py find-redis-db 2 blue
{"db_num": 2, "preferred": 2, "changed": false, "matched_env": false, "env_marker": null}

# Set environment marker
$ python3 setup/setuputils.py set-redis-marker 2 blue
{"success": true, "db_num": 2, "env_name": "blue"}

# Find database for "blue" environment again (reuses DB 2)
$ python3 setup/setuputils.py find-redis-db 5 blue
{"db_num": 2, "preferred": 5, "changed": true, "matched_env": true, "env_marker": "blue"}

# Get marker from database
$ python3 setup/setuputils.py get-redis-marker 2
{"db_num": 2, "env_marker": "blue"}
```

### Integration

Used by:
- `quick-start.sh` - Interactive environment setup
- Multi-worktree configurations - Port and database isolation
- CI/CD pipelines - Environment validation

### Requirements

- Python 3.7+
- Docker (for Redis database checks)
- Standard library only (no external dependencies)

### Debugging

Enable debug output to see timeout and error details:

```bash
# Enable debug mode
export SETUP_UTILS_DEBUG=1

# Run commands with debug output
python3 setup/setuputils.py find-redis-db 2 blue
```

Debug mode logs:
- Timeout errors from Docker commands
- Connection failures to Redis
- Command execution errors

Useful for troubleshooting slow Docker responses or Redis connectivity issues.
