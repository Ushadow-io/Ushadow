# Authentication System Decision

## TL;DR: Use Keycloak

**Reason**: Voice message sharing requires fine-grained, revocable permissions with external user access - exactly what Keycloak's User-Managed Access (UMA) protocol provides out of the box.

---

## The Voice Sharing Problem

You want users to:
1. ✅ Upload voice messages (private by default)
2. ✅ Share with specific people (even if they don't have accounts)
3. ✅ Control permissions (view-only vs. can-reshare)
4. ✅ Revoke access anytime (share link stops working)
5. ✅ Optionally set expiration times

### What This Requires From Auth:

- **Resource-level permissions** (not just user-level roles)
- **Dynamic permission grants** (can't pre-define who shares what)
- **Instant revocation** (no cache invalidation issues)
- **External user support** (social login or guest access)
- **Audit trail** (who accessed what, when)

---

## Why Not Current System?

Your current fastapi-users + JWT setup is **excellent for closed systems**, but:

❌ No built-in resource permissions (you'd build a custom permission table)
❌ No external user federation (all users need accounts)
❌ No social login (Google, GitHub, etc.)
❌ Revocation requires tracking every token (stateful)
❌ Would take ~5 days to build + ongoing maintenance

**Verdict**: Great for what you have, insufficient for what you need.

---

## Why Not Matrix MAS?

Matrix Authentication Service seems promising, but:

❌ Proprietary license since v0.12.0 (Element-owned, not open source)
❌ Designed for Matrix homeservers (not general-purpose IAM)
❌ Limited documentation for non-Matrix use cases
❌ Small community (harder to find help)
❌ Unknown support for resource-based permissions
❌ Would likely require custom permission logic anyway

**Verdict**: Interesting technology, wrong tool for this job.

---

## Why Keycloak?

Keycloak has **User-Managed Access (UMA)** - a protocol specifically designed for resource sharing:

### The Perfect Match

| Your Requirement | Keycloak Feature |
|------------------|------------------|
| Share voice message with Alice | ✅ `grant_permission(resource="msg-123", user="alice")` |
| Alice can view but not reshare | ✅ Scopes: `["view"]` (not `["share"]`) |
| Revoke Alice's access | ✅ `delete_permission(resource="msg-123", user="alice")` |
| Share link expires in 7 days | ✅ Time-based policies |
| Only allow access from US | ✅ IP-based policies |
| Bob clicks link, no account | ✅ Social login (Google, GitHub) |
| Audit who accessed what | ✅ Built-in event logging |

### Real-World Example

```python
# Upload voice message
await keycloak.create_resource(
    name="voice-message-123",
    owner="alice-user-id",
    scopes=["view", "share", "delete"]
)

# Share with Bob
await keycloak.grant_permission(
    resource="voice-message-123",
    user="bob-user-id",
    scopes=["view"]
)

# Bob accesses (automatic permission check)
@router.get("/voice-messages/{id}")
async def get_message(id: str, user: KeycloakUser = Depends(...)):
    # Keycloak already validated user has "view" permission
    return FileResponse(f"storage/{id}.webm")

# Revoke Bob's access
await keycloak.revoke_permission(
    resource="voice-message-123",
    user="bob-user-id"
)
# Bob immediately gets 403 on next access
```

**Compare to building this yourself**: 50+ lines of permission checking, expiration logic, and database queries.

---

## Migration Strategy

### Parallel Running (No Downtime)

```python
# Week 1-2: Accept both token types
async def get_current_user_hybrid(
    keycloak_user = Depends(get_current_user_keycloak),  # New
    legacy_user = Depends(get_current_user),              # Old
):
    return keycloak_user or legacy_user
```

### Gradual Cutover

1. **Day 1-2**: Deploy Keycloak, configure realm
2. **Day 3-4**: Update backend to validate Keycloak tokens
3. **Day 5-6**: Update frontend to use OIDC login
4. **Day 7-8**: Implement voice sharing with UMA
5. **Day 9-10**: Migrate existing users, deprecate legacy auth

### Rollback Plan

If something breaks: remove `Keycloak` dependency, switch back to `Depends(get_current_user)`. Your old auth stays intact during migration!

---

## Cost-Benefit Analysis

### Option 1: Build It Yourself (Custom JWT)

**Initial**: 5 days
- Permission table design (1 day)
- Permission check middleware (1 day)
- Expiration logic (1 day)
- Revocation handling (1 day)
- Testing (1 day)

**Ongoing**: ~10 days/year
- Bug fixes
- Security patches
- Feature requests
- Maintenance

**Features**: Basic permissions only
**Risk**: Security vulnerabilities in custom code

### Option 2: Use Keycloak

**Initial**: 10 days
- Infrastructure setup (2 days)
- Backend integration (3 days)
- Frontend migration (3 days)
- Voice sharing implementation (2 days)

**Ongoing**: ~1 day/year
- Version updates
- Configuration tweaks

**Features**: UMA, social login, SSO, MFA, policies, audit logs
**Risk**: Low (enterprise-grade, maintained by Red Hat)

### Winner: Keycloak

- ✅ Saves time starting Year 1
- ✅ More features
- ✅ Less maintenance
- ✅ Better security
- ✅ Future-proof

---

## What You Get

### Immediately
- OIDC authentication (standard, secure)
- Token validation (introspection endpoint)
- User management (admin UI)
- Session management (refresh tokens, SSO)

### With Integration (~10 days)
- Voice message sharing with permissions
- Social login (Google, GitHub, etc.)
- Revocable share links
- Time-limited access
- Permission scopes (view, share, delete)

### Future (When You Need It)
- Enterprise SSO (SAML, Azure AD, Okta)
- Multi-factor authentication
- Custom policies (IP restrictions, business hours)
- API key management
- Mobile app support (native OIDC)
- Multi-tenancy (realms per organization)

---

## Risks & Mitigation

### Risk 1: Learning Curve
**Mitigation**: Extensive documentation, large community, provided examples

### Risk 2: Infrastructure Overhead
**Mitigation**: ~512MB RAM, single Docker container, same server

### Risk 3: Migration Complexity
**Mitigation**: Parallel running, gradual cutover, rollback plan

### Risk 4: Vendor Lock-in
**Mitigation**: Standard OIDC (can switch to Auth0, Okta, etc. anytime)

---

## Decision

**Adopt Keycloak** for centralized federated authentication.

**Reasoning**:
1. Voice sharing is a core requirement
2. Building it yourself is more expensive long-term
3. Keycloak's UMA protocol is purpose-built for this
4. Migration path is safe (parallel running)
5. Future-proofs the system

**Timeline**: 10 days to production
**Risk**: Low
**ROI**: Positive Year 1

---

## Next Steps

1. ✅ Review this decision
2. ⏳ Start Keycloak infrastructure (compose/keycloak.yml)
3. ⏳ Run setup script (scripts/setup_keycloak.py)
4. ⏳ Follow migration guide (docs/KEYCLOAK_MIGRATION.md)

---

## Questions?

- **"Can we use Keycloak AND keep custom auth?"** Yes! Parallel running is the migration strategy.
- **"What if we only need simple sharing?"** Still cheaper than building it (2 days vs 5 days).
- **"What about Matrix later?"** Keycloak can be an upstream IdP for Matrix MAS if needed.
- **"Is Keycloak overkill?"** For voice sharing, no - UMA is exactly the right tool.

---

## References

See full analysis in:
- `docs/AUTH_COMPARISON.md` - Detailed comparison table
- `docs/KEYCLOAK_MIGRATION.md` - Step-by-step migration guide
- `config/keycloak/README.md` - Setup instructions
- `src/routers/voice_messages.py` - Example implementation

Sources:
- [Keycloak Authorization Services](https://www.keycloak.org/docs/latest/authorization_services/)
- [Resource-Based Authorization](https://medium.com/@kasturepadmakar4u/resource-and-scope-based-authorization-in-keycloak-1fdb90408e91)
- [Keycloak RBAC Guide](https://www.permit.io/blog/implementing-dynamic-keycloak-rbac-with-permitio)
- [Matrix Authentication Service Docs](https://matrix-org.github.io/matrix-authentication-service/)
