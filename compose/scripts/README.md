# Service Setup Scripts

Utility scripts for service configuration and token generation.

## Mycelia Token Generator

Generate Mycelia authentication credentials without spinning up the full compose stack.

### Python Script (Recommended)

**Requirements:**
- Python 3.6+
- `pymongo` library: `pip install pymongo`
- MongoDB running (either standalone or via ushadow's infra stack)

**Usage:**

```bash
# Basic usage (connects to localhost:27017)
python3 compose/scripts/mycelia-generate-token.py

# Custom MongoDB URI
python3 compose/scripts/mycelia-generate-token.py --mongo-uri mongodb://localhost:27018

# Custom database name
python3 compose/scripts/mycelia-generate-token.py --db-name my_mycelia_db

# See all options
python3 compose/scripts/mycelia-generate-token.py --help
```

**What it does:**
1. Connects to your MongoDB instance
2. Generates a cryptographically secure API key (`mycelia_...`)
3. Hashes the key and stores it in the `api_keys` collection
4. Returns both `MYCELIA_TOKEN` and `MYCELIA_CLIENT_ID`

**Output:**
```
✓ Credentials generated successfully!

MYCELIA_CLIENT_ID=6967e390127eb6333b3d6e9e
MYCELIA_TOKEN=mycelia_baKIsM6qRqcG0WH29ZcqXVx8PYELgHcRlrCcUsDpcB4
```

### Docker Compose Method

If you don't have Python or prefer to use the official Mycelia tooling:

```bash
docker compose -f compose/mycelia-compose.yml run --rm mycelia-backend \
  deno run -A server.ts token-create
```

This method requires:
- Mycelia backend image to be built
- MongoDB accessible from the container
- All Mycelia dependencies available

### Bash Script (Advanced)

For environments with `mongosh` installed:

```bash
bash compose/scripts/mycelia-generate-token.sh
```

Falls back to docker compose if `mongosh` is not available.

## Using Generated Credentials

### Via ushadow Wizard

1. Click "Setup" on the mycelia-backend service card
2. Run one of the commands above
3. Copy the `MYCELIA_TOKEN` and `MYCELIA_CLIENT_ID` values
4. Paste into the wizard form fields
5. Click "Save Credentials"

The wizard will automatically save these to ushadow settings and inject them when starting Mycelia.

### Manual Configuration

Add to your `.env` file:

```bash
MYCELIA_TOKEN=mycelia_baKIsM6qRqcG0WH29ZcqXVx8PYELgHcRlrCcUsDpcB4
MYCELIA_CLIENT_ID=6967e390127eb6333b3d6e9e
```

Or add via ushadow settings API:

```bash
curl -X PUT http://localhost:8360/api/settings \
  -H "Content-Type: application/json" \
  -d '{
    "mycelia.token": "mycelia_...",
    "mycelia.client_id": "..."
  }'
```

## Troubleshooting

### Python script fails with "pymongo not installed"

Install the required library:
```bash
pip install pymongo
```

### Cannot connect to MongoDB

Make sure MongoDB is running:
```bash
# Check if running via docker
docker ps | grep mongo

# Or start ushadow's infrastructure
docker compose -f compose/docker-compose.infra.yml up -d mongo
```

### Token already exists

Each run creates a new token. You can have multiple active tokens. To revoke old tokens, use the Mycelia API or delete from the `api_keys` collection in MongoDB.

## Security Notes

- Tokens are cryptographically secure (32 random bytes)
- Tokens are hashed with SHA256 before storage
- Each token gets admin-level policies by default
- Store tokens securely - treat them like passwords
- Revoke unused tokens through the Mycelia admin interface
