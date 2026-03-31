#!/bin/sh
# Docker entrypoint script for frontend container

set -e

# Execute the main container command
exec "$@"
