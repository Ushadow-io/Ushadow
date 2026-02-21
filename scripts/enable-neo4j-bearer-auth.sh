#!/bin/bash
# Enable Neo4j Bearer Token Authentication (Option 2: Native Driver)

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Neo4j Bearer Token Setup (Native Driver)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if AUTH_SECRET_KEY exists
if ! grep -q "secret_key:" config/SECRETS/secrets.yaml 2>/dev/null; then
    echo "⚠️  AUTH_SECRET_KEY not found in config/SECRETS/secrets.yaml"
    echo "   Generating a secure key..."

    # Generate a secure random key
    SECRET_KEY=$(openssl rand -hex 32)

    # Ensure auth section exists
    if ! grep -q "^auth:" config/SECRETS/secrets.yaml 2>/dev/null; then
        echo "" >> config/SECRETS/secrets.yaml
        echo "auth:" >> config/SECRETS/secrets.yaml
    fi

    # Add secret_key if not present
    sed -i.bak '/^auth:/a\
  secret_key: "'"$SECRET_KEY"'"' config/SECRETS/secrets.yaml

    echo "✅ Generated and saved AUTH_SECRET_KEY"
else
    echo "✅ AUTH_SECRET_KEY already exists in config/SECRETS/secrets.yaml"
fi

echo ""
echo "📝 Checking Neo4j configuration..."

if [ ! -f "config/neo4j.conf" ]; then
    echo "❌ config/neo4j.conf not found!"
    exit 1
fi

echo "✅ Neo4j JWT config found"

echo ""
echo "🔄 Restarting Neo4j with JWT authentication..."
docker compose -f compose/docker-compose.infra.yml down neo4j
docker compose -f compose/docker-compose.infra.yml up -d neo4j

echo ""
echo "⏳ Waiting for Neo4j to be ready (30s)..."
sleep 30

echo ""
echo "🧪 Running authentication tests..."
echo ""

cd ushadow/backend
if uv run python test_neo4j_bearer_auth.py; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ Setup Complete!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📋 Next Steps:"
    echo ""
    echo "1. Update OpenMemory to use bearer tokens:"
    echo "   See: docs/NEO4J_BEARER_AUTH_OPTIONS.md (Option 2)"
    echo ""
    echo "2. Example Python code:"
    echo "   from neo4j import GraphDatabase, bearer_auth"
    echo "   from src.services.auth import generate_jwt_for_service"
    echo ""
    echo "   token = generate_jwt_for_service(...)"
    echo "   driver = GraphDatabase.driver("
    echo "       'bolt://neo4j:7687',"
    echo "       auth=bearer_auth(token)"
    echo "   )"
    echo ""
    echo "3. View Neo4j logs:"
    echo "   docker logs neo4j"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "❌ Setup failed - check errors above"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 1
fi
