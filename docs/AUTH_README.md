# Authentication System Documentation

This directory contains research and implementation plans for ushadow's centralized federated authentication system.

## Quick Links

| Document | Purpose | Read If... |
|----------|---------|------------|
| [**AUTH_DECISION.md**](./AUTH_DECISION.md) | Executive summary and recommendation | You want the TL;DR |
| [**AUTH_COMPARISON.md**](./AUTH_COMPARISON.md) | Detailed comparison: Custom JWT vs Keycloak vs Matrix MAS | You want to understand the options |
| [**KEYCLOAK_MIGRATION.md**](./KEYCLOAK_MIGRATION.md) | Step-by-step implementation guide | You're ready to implement |

## The Problem

Voice message sharing requires:
- External user access (people without accounts)
- Fine-grained permissions (who can view/share/delete)
- Revocable access (owner can unshare anytime)
- Time-limited shares (optional expiration)

Current auth system (fastapi-users + JWT) doesn't support this without significant custom development.

## The Solution: Keycloak

Keycloak provides **User-Managed Access (UMA)** - a protocol designed exactly for resource sharing scenarios like voice messages.

### What You Get

✅ Resource-level permissions (not just user roles)
✅ Social login (Google, GitHub) for external users
✅ Instant revocation (delete permission = immediate effect)
✅ Time-based policies (shares expire automatically)
✅ Audit trail (who accessed what, when)
✅ Enterprise-ready (SSO, SAML, MFA when needed)

### Implementation Timeline

- **Week 1**: Keycloak setup + backend integration (5 days)
- **Week 2**: Frontend migration + voice sharing (5 days)
- **Total**: 10 days to production

## Files Created

### Infrastructure
- `compose/keycloak.yml` - Docker Compose service definition
- `config/keycloak/README.md` - Setup instructions
- `scripts/setup_keycloak.py` - Automated realm configuration

### Backend Code
- `ushadow/backend/src/services/keycloak_auth.py` - OIDC token validation
- `ushadow/backend/src/routers/voice_messages.py` - Example implementation

### Documentation
- `docs/AUTH_DECISION.md` - Why Keycloak? (Executive summary)
- `docs/AUTH_COMPARISON.md` - Detailed comparison table
- `docs/KEYCLOAK_MIGRATION.md` - Step-by-step implementation guide

## Getting Started

### 1. Review the Decision

Read [AUTH_DECISION.md](./AUTH_DECISION.md) to understand why Keycloak was chosen.

### 2. Start Keycloak

```bash
# Add to .env (see KEYCLOAK_MIGRATION.md for full list)
KEYCLOAK_PORT=8080
KEYCLOAK_ADMIN_PASSWORD=changeme

# Start Keycloak
docker compose -f compose/keycloak.yml up -d

# Run setup script
python scripts/setup_keycloak.py
```

### 3. Follow Migration Guide

See [KEYCLOAK_MIGRATION.md](./KEYCLOAK_MIGRATION.md) for detailed steps.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│  (React + @react-keycloak/web)                              │
└──────────────┬──────────────────────────────────────────────┘
               │
               │ OIDC Auth Flow (Authorization Code + PKCE)
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│                        Keycloak                              │
│  • Authentication (login, register, SSO)                    │
│  • Authorization (UMA permissions)                          │
│  • User Management                                          │
└──────────────┬──────────────────────────────────────────────┘
               │
               │ Token Validation (OIDC introspection)
               │ Permission Checks (UMA evaluation)
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Ushadow Backend                           │
│  • Validates OIDC tokens                                    │
│  • Checks UMA permissions before serving files              │
│  • Creates/grants/revokes resources                         │
└─────────────────────────────────────────────────────────────┘
```

## Voice Sharing Flow

```
1. Upload
   User uploads voice.webm
   → Backend creates Keycloak resource "voice-message-123"
   → Assigns owner permissions automatically

2. Share
   User shares with bob@example.com
   → Backend looks up Bob's Keycloak user ID
   → Grants permission: "Bob can view voice-message-123"
   → Returns share link: /voice-messages/123

3. Access
   Bob clicks link
   → Redirected to Keycloak login (or auto-logged via SSO)
   → Keycloak validates Bob has "view" permission
   → Backend serves file

4. Revoke
   User revokes Bob's access
   → Backend deletes permission in Keycloak
   → Bob immediately gets 403 on next access
```

## Key Concepts

### Resources
Protected items in Keycloak (voice messages, documents, etc.)
```python
await create_voice_message_resource(
    message_id="msg-123",
    owner_user_id="alice-keycloak-id"
)
```

### Scopes
Actions that can be performed on resources
- `view` - Can access/download the voice message
- `share` - Can grant others access
- `delete` - Can delete the message

### Permissions
Grants linking users to resources with specific scopes
```python
await grant_voice_message_access(
    message_id="msg-123",
    user_id="bob-keycloak-id",
    scopes=["view"]  # Bob can only view, not share or delete
)
```

### Policies
Rules that determine access (time-based, IP-based, etc.)
- User-based: "Only Alice can delete"
- Time-based: "Expires after 7 days"
- IP-based: "Only from US IPs"

## FAQ

**Q: Can we keep our current auth during migration?**
A: Yes! The migration guide uses parallel running - both systems work simultaneously.

**Q: What happens to existing users?**
A: They'll be migrated to Keycloak and prompted to reset passwords.

**Q: What if Keycloak goes down?**
A: Auth fails (like any auth system). Consider high-availability setup for production.

**Q: Can we switch away from Keycloak later?**
A: Yes - it uses standard OIDC, so you can switch to Auth0, Okta, etc.

**Q: Is this overkill for simple auth?**
A: For login/logout, yes. For voice message sharing, no - UMA is the right tool.

**Q: What about Matrix MAS?**
A: Evaluated but rejected due to proprietary license, limited docs, and unknown UMA support.

**Q: Do we need to rewrite all our auth code?**
A: No - see `keycloak_auth.py` for drop-in replacements for existing dependencies.

## Alternatives Considered

### 1. Keep Current System + Build Custom Sharing
- **Time**: 5 days initial + 10 days/year maintenance
- **Features**: Basic permissions only
- **Risk**: Security vulnerabilities in custom code
- **Verdict**: More expensive long-term

### 2. Matrix Authentication Service (MAS)
- **Pros**: Lightweight, Rust-based
- **Cons**: Proprietary license, Matrix-focused, limited docs
- **Verdict**: Wrong tool for this job

### 3. Third-Party Services (Auth0, Okta)
- **Pros**: Fully managed, no infrastructure
- **Cons**: Monthly costs, vendor lock-in
- **Verdict**: Could work, but Keycloak is free and self-hosted

## Support & Resources

### Documentation
- [Keycloak Docs](https://www.keycloak.org/documentation)
- [Authorization Services Guide](https://www.keycloak.org/docs/latest/authorization_services/)
- [UMA Protocol Spec](https://docs.kantarainitiative.org/uma/wg/rec-oauth-uma-grant-2.0.html)

### Community
- [Keycloak Discussions](https://github.com/keycloak/keycloak/discussions)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/keycloak)

### Examples
- [FastAPI + Keycloak](https://github.com/code-specialist/fastapi-keycloak)
- [Resource-Based Auth Tutorial](https://medium.com/@kasturepadmakar4u/resource-and-scope-based-authorization-in-keycloak-1fdb90408e91)

## License

Keycloak is Apache 2.0 licensed - free for commercial use, no restrictions.

---

**Ready to get started?** → [KEYCLOAK_MIGRATION.md](./KEYCLOAK_MIGRATION.md)
