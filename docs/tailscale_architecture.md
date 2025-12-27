# Tailscale Integration Architecture

Detailed technical architecture and design decisions for the Tailscale + Caddy integration.

---

## Table of Contents

- [System Architecture](#system-architecture)
- [Network Flow](#network-flow)
- [Component Details](#component-details)
- [Design Decisions](#design-decisions)
- [State Management](#state-management)
- [Scaling Considerations](#scaling-considerations)

---

## System Architecture

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Client Devices                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   Desktop    │  │    Phone     │  │    Tablet    │           │
│  │  (anywhere)  │  │  (anywhere)  │  │  (anywhere)  │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                 │                  │                   │
└─────────┼─────────────────┼──────────────────┼───────────────────┘
          │                 │                  │
          │    Tailscale VPN (encrypted mesh network)
          │                 │                  │
┌─────────▼─────────────────▼──────────────────▼───────────────────┐
│                    Tailscale Service Layer                        │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              tailscale serve :443                         │   │
│  │  • Automatic HTTPS termination                            │   │
│  │  • Certificate management                                 │   │
│  │  • Route to localhost services                            │   │
│  └────────────────────┬─────────────────────────────────────┘   │
│                       │                                           │
└───────────────────────┼───────────────────────────────────────────┘
                        │
          ┌─────────────┴──────────────┐
          │                            │
┌─────────▼────────────┐    ┌──────────▼──────────────┐
│  Option 1: Direct    │    │  Option 2: Caddy Proxy  │
│  (tailscale serve)   │    │  (Multi-environment)    │
│                      │    │                         │
│  Backend:8000  ◄─────┤    │  ┌────────────────┐    │
│  WebUI:3010          │    │  │  Caddy :443    │    │
│                      │    │  └────┬───┬───┬───┘    │
└──────────────────────┘    │       │   │   │        │
                            │  ┌────▼┐ ┌▼─┐ ┌▼─┐     │
                            │  │/dev/│ │  │ │  │     │
                            │  └─┬─┬─┘ └┬─┘ └┬─┘     │
                            │    │ │    │    │        │
                            └────┼─┼────┼────┼────────┘
                                 │ │    │    │
       ┌─────────────────────────┼─┴────┼────┼────────┐
       │                         │      │    │        │
  ┌────▼────┐              ┌────▼──┐  ...  ...      ...
  │Backend  │              │WebUI  │
  │:8000    │              │:80    │
  └─────────┘              └───────┘
   Container                Container
```

---

## Network Flow

### Flow 1: Single Environment (tailscale serve)

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTPS Request
       │ https://hostname/api/health
       ▼
┌──────────────────────────────────────┐
│  Tailscale VPN + DNS Resolution      │
│  • Resolves hostname.tail12345.ts.net│
│  • Routes through VPN mesh           │
└──────┬───────────────────────────────┘
       │ Encrypted tunnel
       ▼
┌──────────────────────────────────────┐
│  tailscale serve (on server)         │
│  • Listens on :443                   │
│  • TLS termination                   │
│  • Route matching                    │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│  Path Router                          │
│  /api/*      → localhost:8000         │
│  /auth/*     → localhost:8000         │
│  /ws_pcm     → localhost:8000         │
│  /*          → localhost:3010         │
└──────┬───────────────────────────────┘
       │
       ├─────────────┐
       ▼             ▼
┌─────────┐    ┌─────────┐
│Backend  │    │WebUI    │
│:8000    │    │:3010    │
└─────────┘    └─────────┘
```

**Latency**: ~5-50ms (depending on distance)
**Hops**: 2 (Tailscale → tailscale serve → Container)

### Flow 2: Multiple Environments (Caddy Proxy)

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ HTTPS Request
       │ https://hostname/dev/api/health
       ▼
┌──────────────────────────────────────┐
│  Tailscale VPN + DNS Resolution      │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│  tailscale serve (on server)         │
│  https:443 → http://localhost:443    │
└──────┬───────────────────────────────┘
       │ HTTP (localhost only)
       ▼
┌──────────────────────────────────────┐
│  Caddy Reverse Proxy :443            │
│  • TLS with Tailscale certs          │
│  • Path-based routing                │
│  • Header injection                  │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│  Route Matcher                        │
│  /dev/*  → dev containers             │
│  /test/* → test containers            │
│  /prod/* → prod containers            │
└──────┬───────────────────────────────┘
       │ Path prefix stripped
       │ /dev/api/health → /api/health
       ▼
┌──────────────────────────────────────┐
│  Environment-Specific Routing         │
│  @api     → backend:8000              │
│  @auth    → backend:8000              │
│  @ws      → backend:8000              │
│  default  → webui:80                  │
└──────┬───────────────────────────────┘
       │
       ├─────────────┐
       ▼             ▼
┌─────────┐    ┌─────────┐
│Backend  │    │WebUI    │
│:8000    │    │:80      │
└─────────┘    └─────────┘
```

**Latency**: ~5-50ms + <1ms (Caddy overhead)
**Hops**: 3 (Tailscale → tailscale serve → Caddy → Container)

---

## Component Details

### 1. Tailscale Service

**Purpose**: Secure VPN mesh network and DNS resolution

**Key Responsibilities**:
- Maintain encrypted peer-to-peer connections
- Resolve `.ts.net` hostnames to Tailscale IPs
- Provide automatic NAT traversal
- Handle certificate provisioning

**Configuration**:
```bash
# Minimal configuration - Tailscale handles the rest
tailscale up

# Optional: Advertise routes, exit nodes, etc.
tailscale up --advertise-routes=10.0.0.0/24
```

**DNS Resolution**:
```
hostname.tail12345.ts.net → 100.x.x.x (Tailscale IP)
```

**Certificate Provisioning**:
```bash
tailscale cert hostname.tail12345.ts.net
# Generates:
#   hostname.tail12345.ts.net.crt
#   hostname.tail12345.ts.net.key
```

### 2. tailscale serve

**Purpose**: HTTPS termination and local service routing

**Mode 1: Direct Routing** (Single Environment)

```bash
# Configure routes
tailscale serve --bg --set-path /api http://localhost:8000/api
tailscale serve --bg --set-path /auth http://localhost:8000/auth
tailscale serve --bg http://localhost:3010  # Catch-all for frontend
```

**How it works**:
1. Listens on port 443 (HTTPS)
2. Uses Tailscale-provided certificates
3. Matches incoming path against configured routes
4. Proxies to localhost service
5. Most specific path wins

**Status check**:
```bash
tailscale serve status
# Output shows all configured routes
```

**Mode 2: Caddy Routing** (Multiple Environments)

```bash
# Single route to Caddy
tailscale serve https:443 http://localhost:443
```

**How it works**:
1. Terminates HTTPS
2. Proxies ALL requests to Caddy on localhost:443
3. Caddy handles all routing logic

### 3. Caddy Reverse Proxy

**Purpose**: Multi-environment routing, path rewriting, header injection

**Key Features**:

**Path-Based Routing**:
```
https://hostname/dev/api/health  → dev-backend:8000/api/health
https://hostname/test/api/users  → test-backend:8000/api/users
https://hostname/prod/           → prod-webui:80/
```

**Path Stripping**:
```
# Client request
GET https://hostname/dev/api/health

# Caddy strips /dev prefix
GET /api/health → dev-backend:8000
```

**Header Injection**:
```
# For frontend base path awareness
X-Forwarded-Prefix: /dev

# Frontend can use this to configure routing
# Vite: import.meta.env.BASE_URL = headers['X-Forwarded-Prefix']
```

**TLS Configuration**:
```
{
    auto_https off  # Tailscale manages certificates
}

https://hostname.tail12345.ts.net {
    tls /certs/hostname.tail12345.ts.net.crt /certs/hostname.tail12345.ts.net.key
    # ... routes ...
}
```

**Container Resolution**:
```
# Docker Compose networking
# Caddy can resolve container names via Docker DNS
reverse_proxy friend-lite-dev-backend-1:8000
```

### 4. Docker Networking

**Network**: `chronicle-network` (user-defined bridge)

**Why user-defined bridge**:
- ✅ Automatic DNS resolution (container name → IP)
- ✅ Network isolation
- ✅ Easy container communication

**Container Communication**:
```
caddy → docker DNS → friend-lite-dev-backend-1 → container IP
```

**Network Creation**:
```bash
docker network create chronicle-network
```

**Joining Network**:
```yaml
# In docker-compose.yml
services:
  caddy:
    networks:
      - chronicle-network

  backend:
    networks:
      - chronicle-network

networks:
  chronicle-network:
    external: true  # Use existing network
```

---

## Design Decisions

### Decision 1: Why Tailscale over Other VPNs?

**Alternatives considered**:
- WireGuard: Lower-level, requires manual config
- OpenVPN: Legacy, complex setup
- ZeroTier: Similar, but Tailscale has better UX
- CloudFlare Tunnel: Vendor lock-in, limited free tier

**Chosen: Tailscale**

**Reasons**:
- ✅ Built on WireGuard (modern, fast, secure)
- ✅ Zero configuration (no manual key exchange)
- ✅ Automatic NAT traversal
- ✅ MagicDNS (`.ts.net` hostnames)
- ✅ Certificate provisioning
- ✅ Free for personal use (100 devices)
- ✅ Excellent mobile apps
- ✅ Active development and support

### Decision 2: Why Path-Based Routing Instead of Subdomains?

**Alternatives considered**:
```
Option A: Subdomains
dev.hostname.tail12345.ts.net
test.hostname.tail12345.ts.net
prod.hostname.tail12345.ts.net

Option B: Path-based (CHOSEN)
hostname.tail12345.ts.net/dev/
hostname.tail12345.ts.net/test/
hostname.tail12345.ts.net/prod/
```

**Chosen: Path-Based**

**Reasons**:
- ✅ Single Tailscale hostname (simpler DNS)
- ✅ Single certificate (easier management)
- ✅ No wildcard certificate needed
- ✅ Easier to remember URLs
- ✅ Works better with Tailscale's DNS system
- ✅ Simpler `tailscale serve` configuration

**Trade-offs**:
- ❌ Frontend must be configured with base path
- ❌ Slightly longer URLs
- ⚠️ Requires careful path handling in frontend

### Decision 3: Why Caddy over Nginx/Traefik?

**Alternatives considered**:
- Nginx: Industry standard, but complex config
- Traefik: Excellent for Kubernetes, overkill for Docker Compose
- HAProxy: High performance, complex config
- Envoy: Advanced, steep learning curve

**Chosen: Caddy**

**Reasons**:
- ✅ Simple, human-readable config (Caddyfile)
- ✅ Automatic HTTPS (though we use Tailscale certs)
- ✅ Built-in reverse proxy
- ✅ Excellent Docker support
- ✅ Low resource usage
- ✅ Active development
- ✅ Easy to generate config programmatically

**Caddyfile vs Nginx comparison**:
```
# Caddy (7 lines)
https://host {
    tls cert.crt cert.key
    handle_path /dev/* {
        reverse_proxy backend:8000
    }
}

# Nginx (20+ lines)
server {
    listen 443 ssl;
    server_name host;
    ssl_certificate cert.crt;
    ssl_certificate_key cert.key;

    location /dev/ {
        rewrite ^/dev/(.*) /$1 break;
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # ... many more lines ...
    }
}
```

### Decision 4: Why handle_path Instead of rewrite?

**Caddyfile path handling**:

**Option A: Manual rewrite**:
```
handle /dev/* {
    rewrite * /dev{uri}  # Manual path manipulation
    reverse_proxy backend:8000
}
```

**Option B: handle_path (CHOSEN)**:
```
handle_path /dev/* {
    # Automatically strips /dev prefix
    reverse_proxy backend:8000
}
```

**Chosen: handle_path**

**Reasons**:
- ✅ Automatic path stripping
- ✅ Less error-prone
- ✅ Cleaner code
- ✅ Matches developer intent

---

## State Management

### Configuration Files

**1. Global Configuration** (`config-docker.env`):
```bash
TAILSCALE_HOSTNAME=hostname.tail12345.ts.net
HTTPS_ENABLED=true
USE_CADDY_PROXY=true
```

**State**: Persistent, manually edited or wizard-generated

**2. Environment Files** (`environments/<name>.env`):
```bash
ENV_NAME=dev
PORT_OFFSET=0
COMPOSE_PROJECT_NAME=friend-lite-dev
VITE_BASE_PATH=/dev
```

**State**: Persistent, created by setup wizard

**3. Generated Files**:

**Caddyfile** (`caddy/Caddyfile`):
- **Generated by**: `scripts/generate-caddyfile.sh`
- **Triggers**: Environment added/removed, manual regeneration
- **State**: Ephemeral, regenerated on demand

**Environment .env files** (e.g., `backends/advanced/.env`):
- **Generated by**: Config generation scripts
- **State**: Ephemeral, regenerated from environment files

### Runtime State

**Tailscale State**:
```bash
# Tailscale connection state
tailscale status
# Shows: Connected devices, IP addresses, hostnames

# tailscale serve routes
tailscale serve status
# Shows: Configured HTTPS routes
```

**State storage**: `/var/lib/tailscale/`

**Caddy State**:
```bash
# Running status
docker ps | grep caddy

# Logs
docker compose -f compose/caddy.yml logs
```

**State storage**: Docker volumes (`caddy_data`, `caddy_config`)

---

## Scaling Considerations

### Horizontal Scaling

**Current limitation**: Single server per environment

**Scaling options**:

**Option 1: Multiple backend replicas**:
```yaml
# docker-compose.yml
services:
  backend:
    deploy:
      replicas: 3
```

**Caddy automatically load balances**:
```
reverse_proxy backend:8000
# Caddy discovers all 3 replicas via Docker DNS
# Round-robin load balancing
```

**Option 2: Multiple environments on different servers**:
```
Server A (Tailscale node A):
  - dev environment

Server B (Tailscale node B):
  - test environment
  - prod environment
```

**Access**:
```
https://server-a.tail12345.ts.net/dev/
https://server-b.tail12345.ts.net/test/
https://server-b.tail12345.ts.net/prod/
```

### Vertical Scaling

**Resource allocation**:
```yaml
# docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
```

**Caddy resource usage**:
- CPU: <5% under normal load
- Memory: ~50MB base + ~1KB per active connection

### Performance Optimization

**1. Connection Pooling**:
Caddy reuses backend connections automatically.

**2. Buffer Sizes**:
```
reverse_proxy backend:8000 {
    buffer_size 8KB  # Default is 4KB
}
```

**3. Caching** (if needed):
```
handle /api/static/* {
    reverse_proxy backend:8000 {
        header_up Cache-Control "public, max-age=3600"
    }
}
```

---

## Security Architecture

### Threat Model

**In Scope**:
- ✅ Unauthorized access to services
- ✅ Man-in-the-middle attacks
- ✅ Certificate theft
- ✅ Container escape

**Out of Scope**:
- ❌ Physical server access
- ❌ Compromised Tailscale account
- ❌ Application-level vulnerabilities

### Defense Layers

**Layer 1: Network**:
- Tailscale VPN (encrypted mesh)
- Only devices on YOUR network can connect
- No public internet exposure

**Layer 2: TLS**:
- HTTPS for all connections
- Valid certificates (no MITM possible)
- Forward secrecy (WireGuard)

**Layer 3: Application**:
- Application-level authentication (JWT, etc.)
- Authorization checks
- Input validation

**Layer 4: Container Isolation**:
- Docker containers
- User namespaces
- Read-only file systems (where applicable)

### Certificate Security

**Storage**:
```
certs/
├── hostname.tail12345.ts.net.crt  # Public certificate
└── hostname.tail12345.ts.net.key  # Private key (SENSITIVE!)
```

**Permissions**:
```bash
chmod 600 certs/*.key  # Only owner can read
chmod 644 certs/*.crt  # Public certificate
```

**.gitignore**:
```
# Never commit certificates!
certs/
*.key
*.crt
```

**Rotation**:
- Tailscale automatically renews certificates
- Re-run `tailscale cert <hostname>` to get new certs
- Restart Caddy to load new certificates

---

## Disaster Recovery

### Backup Requirements

**Critical files to backup**:
```
.env.secrets           # API keys, passwords
config-docker.env      # Global config (includes Tailscale hostname)
environments/*.env     # All environment configurations
```

**Not critical (can be regenerated)**:
```
caddy/Caddyfile       # Generated from environments
backends/*/.env       # Generated from environments
certs/*               # Can be re-provisioned with `tailscale cert`
```

### Recovery Procedures

**Scenario 1: Lost Tailscale certificates**:
```bash
# Re-provision certificates
tailscale cert hostname.tail12345.ts.net
mv *.crt *.key certs/

# Restart Caddy
docker compose -f compose/caddy.yml restart
```

**Scenario 2: Lost Caddyfile**:
```bash
# Regenerate from environments
./scripts/generate-caddyfile.sh

# Restart Caddy
docker compose -f compose/caddy.yml restart
```

**Scenario 3: New server deployment**:
```bash
# 1. Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# 2. Restore configuration files
cp backup/.env.secrets .
cp backup/config-docker.env .
cp -r backup/environments .

# 3. Provision certificates
tailscale cert $(grep TAILSCALE_HOSTNAME config-docker.env | cut -d= -f2)
mkdir -p certs && mv *.crt *.key certs/

# 4. Regenerate Caddyfile
./scripts/generate-caddyfile.sh

# 5. Start services
./start-env.sh dev
docker compose -f compose/caddy.yml up -d
```

---

## Monitoring and Debugging

### Health Checks

**Tailscale connectivity**:
```bash
# Check if Tailscale is running
tailscale status

# Ping another device
ping hostname.tail12345.ts.net

# Check routes
tailscale serve status
```

**Caddy health**:
```bash
# Check if Caddy is running
docker ps | grep caddy

# Check logs
docker compose -f compose/caddy.yml logs -f

# Test routing
curl -k https://hostname.tail12345.ts.net/dev/health
```

### Debugging Tools

**Network debugging**:
```bash
# Trace Tailscale route
tailscale ping hostname.tail12345.ts.net

# Check port accessibility
nc -zv localhost 443  # Caddy
nc -zv localhost 8000  # Backend

# DNS resolution
nslookup hostname.tail12345.ts.net
```

**Caddy debugging**:
```
# Enable debug logging
# In Caddyfile:
{
    debug
}

# View detailed request logs
docker compose -f compose/caddy.yml logs -f
```

**Container debugging**:
```bash
# Check container connectivity
docker exec -it caddy /bin/sh
wget -O- http://friend-lite-dev-backend-1:8000/health

# Check Docker DNS
docker exec -it caddy nslookup friend-lite-dev-backend-1
```

---

## Summary

This architecture provides:

- ✅ **Secure**: End-to-end encryption, no public exposure
- ✅ **Simple**: Zero network configuration, automatic HTTPS
- ✅ **Scalable**: Support for multiple environments and horizontal scaling
- ✅ **Maintainable**: Clean separation of concerns, generated config
- ✅ **Reliable**: Automatic failover, easy disaster recovery
- ✅ **Flexible**: Two deployment modes for different use cases

**Key Architectural Principles**:
1. **Simplicity First**: Use Tailscale for all the hard parts (VPN, DNS, certs)
2. **Generated Config**: Never manually edit Caddyfile
3. **Path-Based Routing**: Single hostname, multiple environments
4. **Container Networking**: Docker handles service discovery
5. **Secure by Default**: VPN-only access, HTTPS everywhere

---

For implementation details, see [README.md](../README.md).
For troubleshooting, see [troubleshooting.md](troubleshooting.md).
