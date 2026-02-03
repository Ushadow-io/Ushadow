#!/bin/bash
set -e

# Ushadow Admin Reset Script
# Removes admin users and secrets for fresh setup

echo "🧹 Ushadow Admin Reset"
echo "========================================"

# Check we're in the right directory (project root)
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Error: Must be run from the project root directory"
    echo "   cd to the directory containing docker-compose.yml"
    exit 1
fi
echo ""
echo "⚠️  WARNING: This will:"
echo "   - Remove ALL admin users from the database"
echo "   - Delete config/SECRETS/secrets.yaml (all API keys and credentials)"
echo "   - Delete config/config.overrides.yaml (wizard state and service preferences)"
echo "   - Allow you to run ./dev.sh or ./go.sh for a fresh setup"
echo ""
read -p "Are you sure? (yes/no): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "❌ Aborted"
    exit 0
fi

# Get database name from .env
if [ -f .env ]; then
    MONGODB_DATABASE=$(grep "^MONGODB_DATABASE=" .env | cut -d'=' -f2 | tr -d ' ')
fi

# Final fallback to backend's hardcoded default
if [ -z "$MONGODB_DATABASE" ]; then
    MONGODB_DATABASE="ushadow"
fi

echo "📦 Database: ${MONGODB_DATABASE}"
echo ""

# Check if MongoDB is running
echo "🔍 Checking MongoDB connection..."
if ! docker ps | grep -q "mongo"; then
    echo "⚠️  MongoDB container is not running"
    echo "   Starting MongoDB..."
    docker compose -f compose/docker-compose.infra.yml up -d mongo
    echo "   Waiting for MongoDB to be ready..."
    sleep 5
fi

# Remove admin users from MongoDB
echo "🗑️  Removing admin users from database..."
docker exec -i mongo mongosh "${MONGODB_DATABASE}" --quiet --eval '
const beforeCount = db.users.countDocuments({ is_superuser: true });
const result = db.users.deleteMany({ is_superuser: true });
const afterCount = db.users.countDocuments({ is_superuser: true });
print("✅ Removed " + result.deletedCount + " admin user(s). Remaining admins: " + afterCount);
' || echo "⚠️  MongoDB operation may have failed - check if container is running"

echo ""
echo "🗑️  Removing config/SECRETS/secrets.yaml..."
if [ -f "config/SECRETS/secrets.yaml" ]; then
    rm "config/SECRETS/secrets.yaml"
    echo "   ✅ config/SECRETS/secrets.yaml removed"
else
    echo "   ℹ️  config/SECRETS/secrets.yaml not found (already clean)"
fi

echo ""
echo "🗑️  Removing wizard state (config.overrides.yaml)..."
if [ -f "config/config.overrides.yaml" ]; then
    rm "config/config.overrides.yaml"
    echo "   ✅ config/config.overrides.yaml removed"
else
    echo "   ℹ️  config/config.overrides.yaml not found (already clean)"
fi


echo ""
echo "🔄 Restarting backend to invalidate active sessions..."
docker compose -f docker-compose.yml restart ushadow-backend 2>/dev/null || echo "   ⚠️  Backend not running (that's ok)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Admin reset complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🚀 Next steps:"
echo "   1. Regenerate secrets and start:"
echo "      • ./dev.sh  - development (hot-reload for frontend/backend)"
echo "      • ./go.sh   - quick start (production build, opens browser)"
echo "   2. Clear your browser cache (Cmd+Shift+R or hard refresh)"
echo "   3. Log in with your new admin credentials"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
