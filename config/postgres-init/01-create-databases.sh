#!/bin/bash
# Create additional databases from POSTGRES_MULTIPLE_DATABASES env var
# Format: comma-separated list of database names

set -e

if [ -n "$POSTGRES_MULTIPLE_DATABASES" ]; then
    echo "Creating additional databases: $POSTGRES_MULTIPLE_DATABASES"

    for db in $(echo $POSTGRES_MULTIPLE_DATABASES | tr ',' ' '); do
        echo "  Creating database: $db"
        psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
            SELECT 'CREATE DATABASE $db'
            WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
            GRANT ALL PRIVILEGES ON DATABASE $db TO $POSTGRES_USER;
EOSQL
    done

    echo "Additional databases created successfully"
fi
