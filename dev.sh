#!/bin/bash
# Ushadow Development Mode
#
# Starts with hot-reload enabled for frontend development.
# For production mode, use: ./go.sh
#
# Usage:
#   ./dev.sh

exec python3 setup/run.py --dev "$@"
