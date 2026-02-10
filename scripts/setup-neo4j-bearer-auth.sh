#!/bin/bash
# Setup script for Neo4j Bearer Token Authentication

set -e

echo "🔐 Setting up Neo4j Bearer Token Authentication..."
echo ""

# Check if AUTH_SECRET_KEY exists
if ! grep -q "AUTH_SECRET_KEY" config/SECRETS/secrets.yaml 2>/dev/null; then
    echo "⚠️  AUTH_SECRET_KEY not found in config/SECRETS/secrets.yaml"
    echo "   Adding a generated key..."

    # Generate a secure random key
    SECRET_KEY=$(openssl rand -hex 32)

    # Add to secrets.yaml
    echo "" >> config/SECRETS/secrets.yaml
    echo "# Authentication secret key for JWT signing" >> config/SECRETS/secrets.yaml
    echo "auth:" >> config/SECRETS/secrets.yaml
    echo "  secret_key: \"$SECRET_KEY\"" >> config/SECRETS/secrets.yaml

    echo "✅ Generated and saved AUTH_SECRET_KEY"
else
    echo "✅ AUTH_SECRET_KEY already exists"
fi

echo ""
echo "📦 Starting Neo4j with authentication enabled..."
docker compose -f compose/docker-compose.infra.yml up -d neo4j

echo ""
echo "⏳ Waiting for Neo4j to be ready..."
sleep 10

echo ""
echo "🚀 Starting Neo4j Auth Proxy..."
docker compose -f compose/neo4j-auth-proxy-compose.yaml up -d --build

echo ""
echo "⏳ Waiting for proxy to be ready..."
sleep 5

echo ""
echo "✅ Setup complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Service Status:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker compose -f compose/neo4j-auth-proxy-compose.yaml ps
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔗 Connection Details:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Direct Neo4j:     bolt://localhost:7687 (basic auth)"
echo "Via Auth Proxy:   bolt://localhost:7688 (bearer token)"
echo "Neo4j Browser:    http://localhost:7474"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 Next Steps:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. Test the connection:"
echo "   cd ushadow/backend"
echo "   uv run python -c 'from neo4j import GraphDatabase, bearer_auth; print(\"Ready to test!\")'"
echo ""
echo "2. Update OpenMemory to use the proxy:"
echo "   Edit compose/openmemory-compose.yaml:"
echo "   NEO4J_URL=bolt://neo4j-auth-proxy:7688"
echo ""
echo "3. View logs:"
echo "   docker compose -f compose/neo4j-auth-proxy-compose.yaml logs -f"
echo ""
echo "For more info, see: docs/NEO4J_BEARER_AUTH_OPTIONS.md"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
