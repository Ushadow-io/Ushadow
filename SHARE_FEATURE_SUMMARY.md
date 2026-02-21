# Share Feature - Complete Implementation Summary

## What Users Will See

When clicking "Share" on a conversation, users will get URLs in this format:

### Default (No Configuration)
If you have Tailscale configured:
```
https://your-machine.tail12345.ts.net/share/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

If Tailscale is not configured (development):
```
http://localhost:3000/share/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### With Environment Variable Override
If you set `SHARE_BASE_URL` in `.env`:
```bash
SHARE_BASE_URL=https://ushadow.mycompany.com
```
Users get:
```
https://ushadow.mycompany.com/share/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### With Public Gateway
If you set `SHARE_PUBLIC_GATEWAY` in `.env`:
```bash
SHARE_PUBLIC_GATEWAY=https://share.yourdomain.com
```
Users get:
```
https://share.yourdomain.com/share/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

---

## How Share Links Work

1. **User clicks "Share" button** in conversation detail page
2. **ShareDialog opens** with options:
   - Expiration date (optional)
   - Max view count (optional)
   - Require authentication (toggle)
   - Tailscale-only access (toggle)
3. **Backend creates token** with ownership validation
4. **Frontend displays link** with copy-to-clipboard button
5. **Recipient clicks link** → Token validated → Conversation displayed

---

## Complete Feature Set

### ✅ Frontend Integration
- **ConversationsPage** (`/conversations`) - Multi-source list view (Chronicle + Mycelia)
- **ConversationDetailPage** (`/conversations/{id}?source={source}`) - Full conversation view with:
  - Audio playback (full + segment-level)
  - Memory integration
  - Transcript display
  - **Share button** (green button next to "Play Full Audio")
- **ShareDialog** - Full-featured modal with all share options
- **useShare hook** - State management for share dialog

### ✅ Backend API
- `POST /api/share/create` - Create new share token
- `GET /api/share/{token}` - Access shared resource (public endpoint)
- `DELETE /api/share/{token}` - Revoke share token
- `GET /api/share/resource/{type}/{id}` - List shares for resource
- `GET /api/share/{token}/logs` - View access logs
- `POST /api/share/conversations/{id}` - Convenience endpoint for conversations

### ✅ Security Features
- **Ownership validation** - Users can only share their own conversations
- **Superuser bypass** - Admins can share anything
- **Optional features** (environment variable gates):
  - Resource validation (`SHARE_VALIDATE_RESOURCES`)
  - Tailscale IP validation (`SHARE_VALIDATE_TAILSCALE`)
- **Access logging** - Audit trail of all share access
- **Expiration** - Time-based token expiry
- **View limits** - Maximum number of accesses

### ✅ URL Configuration
- **Strategy hierarchy** (priority order):
  1. `SHARE_BASE_URL` environment variable
  2. `SHARE_PUBLIC_GATEWAY` environment variable
  3. Tailscale hostname (auto-detected)
  4. Localhost fallback (development)

---

## Testing the Feature

### 1. Start ushadow
```bash
# Check that backend logs show:
# "Share service initialized with base_url: https://..."
docker-compose up -d
docker-compose logs -f backend | grep "Share service"
```

### 2. Navigate to conversations
```
http://localhost:3010/conversations
```

### 3. Click any conversation to view details
```
http://localhost:3010/conversations/{id}?source=mycelia
```

### 4. Click "Share" button
- Creates share token
- Displays URL with your configured base URL
- Shows existing shares below

### 5. Test the share link
- Copy the generated URL
- Open in incognito/private window
- Should show conversation details (if public)
- OR require Tailscale access (if `tailscale_only: true`)

---

## Configuration Examples

### Scenario 1: Development (No Config Needed)
```bash
# No environment variables set
# URLs will be: http://localhost:3000/share/{token}
```

### Scenario 2: Tailscale Deployment
```bash
# Tailscale auto-detected from tailscale-config.json
# URLs will be: https://ushadow.tail12345.ts.net/share/{token}
```

### Scenario 3: Custom Domain
```bash
# In .env:
SHARE_BASE_URL=https://ushadow.mycompany.com

# URLs will be: https://ushadow.mycompany.com/share/{token}
```

### Scenario 4: Public Gateway
```bash
# In .env:
SHARE_PUBLIC_GATEWAY=https://share.yourdomain.com

# URLs will be: https://share.yourdomain.com/share/{token}
# Requires deploying share-gateway/ to public VPS
```

---

## Next Steps (Optional)

### Implement Resource Fetching
Currently the share access endpoint returns placeholder data. To show actual conversation content, implement resource fetching in:
- `ushadow/backend/src/routers/share.py` line 136
- Call Mycelia API to fetch conversation data
- Filter sensitive fields before returning

### Deploy Share Gateway (For External Sharing)
If you want external friends to access shares:
1. Deploy `share-gateway/` to public VPS
2. Set `SHARE_PUBLIC_GATEWAY` environment variable
3. Configure gateway to proxy back through Tailscale

### Enable Tailscale Funnel (Alternative to Gateway)
If you want external access without deploying a gateway:
```bash
tailscale funnel --bg --https=443 --set-path=/share https+insecure://localhost:8010
```

---

## Architecture Decision: Why This Approach?

★ **Flexible URL Configuration**
The hierarchy allows you to start simple (Tailscale auto-detection) and upgrade later (public gateway) without changing code. Just set an environment variable.

★ **Security by Default**
Ownership validation ensures users can only share their own content. Superuser bypass provides admin flexibility for support/moderation.

★ **Progressive Enhancement**
- Basic: Tailnet-only sharing (zero config)
- Intermediate: Funnel for selective public access
- Advanced: Full public gateway with rate limiting

This matches your "behind Tailscale" deployment while keeping external sharing as an option when you're ready.
