#!/bin/bash
# Generate Mycelia authentication token and client ID
# This script connects to MongoDB and creates the credentials directly

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Mycelia Token Generator${NC}"
echo "========================"
echo

# Check if mongosh is available
if ! command -v mongosh &> /dev/null; then
    echo -e "${YELLOW}Warning: mongosh not found. Falling back to docker compose method...${NC}"
    echo
    docker compose -f compose/mycelia-compose.yml run --rm mycelia-backend deno run -A server.ts token-create
    exit 0
fi

# Read MongoDB connection info from .env or use defaults
MONGO_HOST=${MONGO_HOST:-localhost}
MONGO_PORT=${MONGO_PORT:-27017}
MONGO_DB=${MYCELIA_DATABASE_NAME:-mycelia}

# Generate random token
TOKEN="mycelia_$(openssl rand -base64 32 | tr -d '/+=' | head -c 43)"

# Generate salt and hash
SALT=$(openssl rand -base64 32)
SALT_HEX=$(echo -n "$SALT" | base64 -d | xxd -p | tr -d '\n')
HASH=$(echo -n "${SALT_HEX}${TOKEN}" | xxd -r -p | openssl sha256 -binary | base64)

# Create MongoDB document
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# Insert into MongoDB and capture the ID
MONGO_SCRIPT="
db = db.getSiblingDB('${MONGO_DB}');
var result = db.api_keys.insertOne({
  hashedKey: '${HASH}',
  salt: '${SALT}',
  owner: 'admin',
  name: 'ushadow_generated_$(date +%s)',
  policies: [{ resource: '**', action: '**', effect: 'allow' }],
  openPrefix: '${TOKEN:0:16}',
  createdAt: new Date('${TIMESTAMP}'),
  isActive: true
});
print(result.insertedId.toString());
"

CLIENT_ID=$(mongosh --quiet --host "${MONGO_HOST}" --port "${MONGO_PORT}" --eval "${MONGO_SCRIPT}")

# Output credentials
echo -e "${GREEN}✓ Credentials generated successfully!${NC}"
echo
echo -e "${BLUE}MYCELIA_CLIENT_ID=${NC}${CLIENT_ID}"
echo -e "${BLUE}MYCELIA_TOKEN=${NC}${TOKEN}"
echo
echo -e "${YELLOW}Copy these values into the ushadow wizard or your .env file${NC}"
