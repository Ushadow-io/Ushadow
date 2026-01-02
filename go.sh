#!/bin/bash
# Ushadow Quick Start - Zero-prompt startup with defaults
#
# This is a thin wrapper around start-dev.sh that:
# - Uses defaults (env: ushadow, port offset: 0)
# - Skips all prompts
# - Uses production build (no hot-reload)
# - Opens registration page instead of creating admin
#
# For interactive setup, use: ./start-dev.sh
# For dev mode with hot-reload: ./dev.sh

exec ./start-dev.sh --quick --prod --no-admin "$@"
