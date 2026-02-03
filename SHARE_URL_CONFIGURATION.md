# Share URL Configuration for Tailscale Deployments

## The Challenge

When running ushadow behind Tailscale, you face a fundamental question: **Who should be able to access shared links?**

Your share links will look like:
```
https://YOUR_BASE_URL/share/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

But what should `YOUR_BASE_URL` be?

---

## Three Sharing Strategies

### Strategy 1: Tailnet-Only Sharing (Simplest)

**Best for:** Sharing with colleagues/friends who are already on your Tailnet

**Setup:**
```bash
# In your .env file
SHARE_BASE_URL=https://ushadow.tail12345.ts.net
```

**How it works:**
1. User clicks "Share" in conversation detail page
2. Gets link like: `https://ushadow.tail12345.ts.net/share/{token}`
3. Only people connected to your Tailnet can access

**Implementation:**
```python
# In ushadow/backend/src/routers/share.py, implement _get_share_base_url():
def _get_share_base_url() -> str:
    # Try explicit override first
    if base_url := os.getenv("SHARE_BASE_URL"):
        return base_url.rstrip("/")

    # Use Tailscale hostname
    try:
        config = read_tailscale_config()
        if config and config.hostname:
            return f"https://{config.hostname}"
    except Exception:
        pass

    # Fallback
    return "http://localhost:3000"
```

**Pros:**
- ✅ Simple - no extra infrastructure
- ✅ Secure - protected by Tailscale ACLs
- ✅ Works immediately

**Cons:**
- ❌ Recipients must join your Tailnet
- ❌ Not suitable for external friends

---

### Strategy 2: Tailscale Funnel (Public Access via Tailscale)

**Best for:** Sharing with external friends without deploying separate infrastructure

**Setup:**
```bash
# Enable Funnel for specific paths
tailscale funnel --bg --https=443 --set-path=/share https+insecure://localhost:8010

# In your .env file
SHARE_BASE_URL=https://ushadow.tail12345.ts.net
```

**How it works:**
1. Tailscale Funnel exposes `/share/*` endpoints publicly through Tailscale's infrastructure
2. Share links use your Tailscale hostname
3. External users access via public internet → Tailscale Funnel → Your ushadow instance

**Implementation:** Same as Strategy 1 (Funnel is transparent to your app)

**Pros:**
- ✅ No separate VPS needed
- ✅ Tailscale handles SSL certificates
- ✅ Can selectively expose endpoints

**Cons:**
- ❌ Requires Tailscale Funnel configuration
- ❌ Funnel has bandwidth limits
- ❌ May not work with all Tailscale plans

---

### Strategy 3: Public Gateway (Maximum Flexibility)

**Best for:** Production deployments with external sharing and fine-grained control

**Setup:**
1. Deploy `share-gateway/` to a public VPS (e.g., DigitalOcean)
2. Configure gateway to proxy back to your Tailscale network
3. Set environment variable:

```bash
# In your .env file
SHARE_PUBLIC_GATEWAY=https://share.yourdomain.com
```

**How it works:**
1. User clicks "Share" in conversation
2. Gets link like: `https://share.yourdomain.com/share/{token}`
3. Gateway validates token with your ushadow backend via Tailscale
4. Gateway proxies the conversation data back to external user

**Implementation:**
```python
def _get_share_base_url() -> str:
    # Public gateway for external sharing (highest priority)
    if gateway_url := os.getenv("SHARE_PUBLIC_GATEWAY"):
        return gateway_url.rstrip("/")

    # Explicit override
    if base_url := os.getenv("SHARE_BASE_URL"):
        return base_url.rstrip("/")

    # Fallback to Tailscale hostname
    try:
        config = read_tailscale_config()
        if config and config.hostname:
            return f"https://{config.hostname}"
    except Exception:
        pass

    return "http://localhost:3000"
```

**Gateway Deployment:**
```bash
cd share-gateway/
docker build -t ushadow-share-gateway .
docker run -d -p 443:8000 \
  -e USHADOW_BACKEND_URL=https://ushadow.tail12345.ts.net \
  -e RATE_LIMIT_PER_IP=10 \
  ushadow-share-gateway
```

**Pros:**
- ✅ Full control over public endpoint
- ✅ Custom domain and SSL
- ✅ Rate limiting and security controls
- ✅ No bandwidth limits

**Cons:**
- ❌ Requires deploying separate service
- ❌ Monthly VPS cost (~$5-10/month)
- ❌ More complex architecture

---

## Recommended Implementation

Here's the complete implementation for `_get_share_base_url()` in `ushadow/backend/src/routers/share.py`:

```python
def _get_share_base_url() -> str:
    """Determine the base URL for share links.

    Strategy hierarchy:
    1. SHARE_BASE_URL environment variable (highest priority)
    2. SHARE_PUBLIC_GATEWAY environment variable (for external sharing)
    3. Tailscale hostname (for Tailnet-only sharing)
    4. Fallback to localhost (development only)

    Returns:
        Base URL string (e.g., "https://ushadow.tail12345.ts.net")
    """
    # Explicit override (for testing or custom deployments)
    if base_url := os.getenv("SHARE_BASE_URL"):
        logger.info(f"Using explicit SHARE_BASE_URL: {base_url}")
        return base_url.rstrip("/")

    # Public gateway for external sharing
    if gateway_url := os.getenv("SHARE_PUBLIC_GATEWAY"):
        logger.info(f"Using public gateway: {gateway_url}")
        return gateway_url.rstrip("/")

    # Use Tailscale hostname (works with or without Funnel)
    try:
        config = read_tailscale_config()
        if config and config.hostname:
            tailscale_url = f"https://{config.hostname}"
            logger.info(f"Using Tailscale hostname: {tailscale_url}")
            return tailscale_url
    except Exception as e:
        logger.warning(f"Failed to read Tailscale config: {e}")

    # Fallback for development
    logger.warning("Using localhost fallback - shares will only work locally!")
    return "http://localhost:3000"
```

---

## Quick Start

**For immediate Tailnet-only sharing:**
```bash
# No configuration needed! Just use the Tailscale hostname detection
# Share links will automatically use: https://ushadow.tail{xxx}.ts.net
```

**To override:**
```bash
# Add to your .env file
SHARE_BASE_URL=https://your-custom-url.com
```

---

## Testing Your Configuration

1. Start ushadow backend
2. Check logs for: `Share service initialized with base_url: ...`
3. Create a share link from conversation detail page
4. Verify the URL format matches your expected base URL

---

## Security Considerations

### Tailnet-Only Sharing
- Protected by Tailscale ACLs
- No public exposure
- Requires recipients to join Tailnet

### Funnel Sharing
- Only `/share/*` endpoints exposed
- Still uses Tailscale authentication for admin features
- Funnel has rate limiting built-in

### Public Gateway Sharing
- Gateway validates all tokens before proxying
- Rate limiting per IP (default: 10 requests/minute)
- Admin endpoints still require Tailscale access
- Consider adding additional authentication for sensitive shares
