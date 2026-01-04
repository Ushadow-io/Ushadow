#!/bin/bash
# Ushadow Quick Start - Zero-prompt startup with defaults
#
# This runs production mode with:
# - Default settings (env: ushadow, port offset: 0)
# - No prompts
# - Production build (no hot-reload)
# - Opens registration page for first-time setup
#
# For development mode with hot-reload: ./dev.sh
# For interactive setup: python3 setup/run.py

exec python3 setup/run.py --quick --prod --skip-admin "$@"
