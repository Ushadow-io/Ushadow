# Share Gateway

Public-facing proxy for accessing ushadow shared resources.

## Purpose

This service allows **external users** (not on your Tailscale network) to access shared conversations via share links, while keeping your main ushadow instance completely private.

## Architecture

```
Public Internet
    ↓
Share Gateway (this service, on public VPS)
    ↓ (via Tailscale)
Your Private Tailnet
    └── ushadow backend
```

## Security Model

- **Only exposes** `/c/{token}` endpoint
- **Validates** share tokens before proxying
- **Rate limited** to 10 requests/minute per IP
- **Audit logs** all access
- **No direct access** to your ushadow APIs
- **Tailscale-secured** connection to backend

## Deployment

### Option 1: Public VPS (DigitalOcean, Linode, AWS, etc.)

1. Create a $5/month VPS
2. Install Tailscale:
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   tailscale up
   ```

3. Clone this directory to the VPS:
   ```bash
   scp -r share-gateway/ user@your-vps:/opt/share-gateway
   ```

4. Configure environment:
   ```bash
   cat > /opt/share-gateway/.env <<EOF
   MONGODB_URI=mongodb://mongo:27017  # Accessible via Tailscale
   MONGODB_DATABASE=ushadow
   USHADOW_BACKEND_URL=http://ushadow.your-tailnet.ts.net:8080
   EOF
   ```

5. Run with Docker:
   ```bash
   cd /opt/share-gateway
   docker build -t share-gateway .
   docker run -d \
     --name share-gateway \
     --restart unless-stopped \
     --env-file .env \
     -p 80:8000 \
     share-gateway
   ```

6. Point your domain to the VPS:
   ```
   share.yourdomain.com → VPS IP
   ```

7. Add HTTPS (optional but recommended):
   ```bash
   # Using certbot
   apt install certbot python3-certbot-nginx
   certbot --nginx -d share.yourdomain.com
   ```

### Option 2: Cloudflare Workers (Serverless)

For lower cost, you can deploy this as a Cloudflare Worker with Durable Objects for rate limiting.

## Configuration

### Environment Variables

- `MONGODB_URI` - MongoDB connection string (must be accessible via Tailscale)
- `MONGODB_DATABASE` - Database name (default: ushadow)
- `USHADOW_BACKEND_URL` - Your ushadow backend URL on Tailscale (e.g., `http://ushadow.your-tailnet.ts.net:8080`)

### Getting Your Tailscale Hostname

```bash
# On your ushadow backend machine
tailscale status

# Look for your machine name, e.g.:
# 100.64.0.5   ushadow              your-user@   linux   -
```

Then use: `http://ushadow.your-tailnet.ts.net:8080`

## Testing

```bash
# Test gateway health
curl https://share.yourdomain.com/

# Test share access (replace token)
curl https://share.yourdomain.com/c/550e8400-e29b-41d4-a716-446655440000
```

## Monitoring

View logs:
```bash
docker logs -f share-gateway
```

Check rate limiting:
```bash
# Should see 429 after 10 requests/minute
for i in {1..15}; do
  curl https://share.yourdomain.com/c/test-token
done
```

## Security Considerations

1. **Rate Limiting**: 10 requests/minute per IP (adjustable in `main.py`)
2. **No Auth Bypass**: Auth-required shares are rejected at gateway
3. **Audit Trail**: All access logged to MongoDB
4. **Minimal Attack Surface**: Only one endpoint exposed
5. **Tailscale Security**: Backend connection is encrypted and authenticated

## Troubleshooting

### Gateway can't reach backend

**Check Tailscale connection**:
```bash
# On gateway VPS
tailscale status
tailscale ping ushadow
```

### Database connection fails

**Verify MongoDB is accessible via Tailscale**:
```bash
# On gateway VPS
nc -zv mongo.your-tailnet.ts.net 27017
```

### Rate limiting too strict

**Adjust in `main.py`**:
```python
@limiter.limit("10/minute")  # Change to "100/minute" or whatever
```
