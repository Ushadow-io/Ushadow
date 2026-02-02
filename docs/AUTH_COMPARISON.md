# Authentication System Comparison

## Executive Summary

For **voice message sharing with external users**, **Keycloak** is the recommended solution.

| Criterion | Current (Custom JWT) | Keycloak | Matrix MAS |
|-----------|---------------------|----------|------------|
| **Voice Sharing Support** | ❌ Would need custom build | ✅ Built-in (UMA) | ⚠️ Limited docs |
| **External Users** | ❌ All users need accounts | ✅ Social login, guest access | ⚠️ Matrix-focused |
| **Granular Permissions** | ❌ App-level only | ✅ Resource-level | ⚠️ Limited |
| **Revocable Shares** | ❌ App-level tracking | ✅ Built-in | ❓ Unknown |
| **Time-Limited Shares** | ❌ App-level logic | ✅ Built-in policies | ❓ Unknown |
| **Production Ready** | ✅ Working now | ✅ Enterprise-grade | ⚠️ Experimental |
| **Setup Complexity** | ✅ Already done | ⚠️ Medium (2-3 days) | ❌ High (4-5 days) |
| **Infrastructure** | ✅ Minimal | ⚠️ +1 service, ~1GB RAM | ✅ Lightweight |
| **License** | ✅ Your code | ✅ Apache 2.0 | ❌ Proprietary (Element) |
| **Community** | N/A | ✅ Large, mature | ⚠️ Small |

---

## Detailed Comparison

### 1. Voice Message Sharing Requirements

#### Current System (Custom JWT)
```python
# You would need to build:
class SharePermission:
    user_id: str
    voice_message_id: str
    scopes: list[str]  # view, share, delete
    expires_at: datetime

# Track in MongoDB
# Check on every request
# Implement expiration logic
# Handle revocation manually
```

**Estimate**: 3-5 days to build + ongoing maintenance

#### Keycloak (UMA Protocol)
```python
# Already built-in:
await grant_voice_message_access(
    message_id="msg-123",
    user_id="recipient-uuid",
    scopes=["view"],
)

# Keycloak handles:
# - Permission storage
# - Access evaluation
# - Expiration (via policies)
# - Revocation
# - Audit logs
```

**Estimate**: 2-3 days integration, no maintenance

#### Matrix MAS
```
# Unknown - limited documentation for non-Matrix use cases
# Would likely require similar custom implementation as current system
```

**Estimate**: Unknown, likely 5+ days

---

### 2. External User Access

#### Scenario: Alice wants to share a voice message with Bob (who doesn't have an account)

**Current System:**
1. Bob must create an account
2. Alice shares with Bob's user ID
3. Bob logs in to access

**Keycloak:**
1. Alice shares message
2. Bob clicks link → "Login with Google"
3. Keycloak auto-creates account
4. Bob immediately accesses message

**Matrix MAS:**
- Unclear how this would work for non-Matrix use cases

---

### 3. Permission Granularity

| Use Case | Current | Keycloak | Matrix MAS |
|----------|---------|----------|------------|
| User owns all their messages | ✅ App logic | ✅ Resource owner | ❓ |
| User can view shared messages | ✅ App logic | ✅ Scope: view | ❓ |
| User can re-share messages | ❌ Build it | ✅ Scope: share | ❓ |
| User can delete own messages | ✅ App logic | ✅ Scope: delete | ❓ |
| Time-limited access | ❌ Build it | ✅ Policy | ❓ |
| IP-restricted access | ❌ Build it | ✅ Policy | ❓ |
| Business hours only | ❌ Build it | ✅ Policy | ❓ |

---

### 4. Migration Impact

#### Keep Current System
- ✅ No migration needed
- ❌ Must build sharing logic (~5 days)
- ❌ Must maintain permission system
- ❌ Limited to registered users
- ❌ No social login
- ❌ Manual expiration/revocation

#### Migrate to Keycloak
- ⚠️ 8-10 days migration (can run in parallel)
- ✅ Sharing built-in (UMA protocol)
- ✅ Automatic maintenance (Keycloak team)
- ✅ Social login for free
- ✅ Enterprise SSO ready
- ✅ Automatic expiration/revocation

#### Migrate to Matrix MAS
- ❌ 10-15 days migration (many unknowns)
- ❓ Sharing capabilities unclear
- ⚠️ Small community, less documentation
- ❌ Proprietary license (Element-owned)
- ❓ May still need custom permission logic

---

### 5. Security Considerations

#### Share Link Security

**Current System (if you build it):**
```
https://ushadow.app/share/abc123

Problems:
- Token in URL (visible in logs, browser history)
- Need to track token validity
- Need to implement revocation check
- Need to handle token refresh
```

**Keycloak:**
```
https://ushadow.app/voice-messages/msg-123
(User authenticates first, then permission checked)

Benefits:
- No tokens in URLs
- Permission checked on Keycloak side
- Instant revocation (delete permission)
- Audit trail built-in
- Can add policies (time, IP, etc.)
```

---

### 6. Future-Proofing

#### Scenarios Keycloak Handles Well:
- **Multiple services**: Chronicle, Mycelia, etc. all use same auth
- **Enterprise sales**: "Does it support SAML?" → Yes
- **Compliance**: GDPR, HIPAA → Keycloak has certifications
- **Mobile app**: Native OIDC support on iOS/Android
- **API keys**: Keycloak can issue service account tokens
- **Rate limiting**: Can integrate with policies
- **Multi-tenancy**: Realms per organization

#### Scenarios Current System Would Struggle:
- All of the above would require significant custom development

---

### 7. Real-World Examples

#### Dropbox-Style Sharing
```python
# Keycloak approach (simplified):

# 1. User uploads file
await create_voice_message_resource("msg-123", owner="alice-id")

# 2. Alice shares with bob@example.com
await grant_voice_message_access("msg-123", user_id="bob-id", scopes=["view"])

# 3. Bob accesses (Keycloak checks permission automatically)
@router.get("/voice-messages/{id}")
async def get(id: str, user: KeycloakUser = Depends(...)):
    # Permission already validated by Keycloak
    return serve_file(id)

# 4. Alice revokes
await revoke_voice_message_access("msg-123", user_id="bob-id")

# 5. Bob tries again → 403 Forbidden (instant)
```

#### Custom JWT Approach (what you'd build):
```python
# 1. User uploads file
await VoiceMessage.create(id="msg-123", owner="alice-id")

# 2. Alice shares
await SharePermission.create(
    message_id="msg-123",
    user_id="bob-id",
    scopes=["view"],
    expires_at=datetime.now() + timedelta(days=7)
)

# 3. Bob accesses
@router.get("/voice-messages/{id}")
async def get(id: str, user: User = Depends(...)):
    # Manual permission check
    perm = await SharePermission.find_one({
        "message_id": id,
        "user_id": user.id,
        "scopes": "view",
        "expires_at": {"$gt": datetime.now()}
    })
    if not perm:
        raise HTTPException(403)
    return serve_file(id)

# 4. Alice revokes
await SharePermission.delete_many({"message_id": id, "user_id": "bob-id"})

# 5. Bob tries again → 403 (works)

# Problems:
# - Manual expiration logic
# - No audit trail
# - Can't do complex policies (IP restrictions, time-based, etc.)
# - Have to maintain this code forever
```

---

## Recommendation: Keycloak

### Why Keycloak Wins for Voice Sharing

1. **Built-in UMA support** - Designed for exactly this use case
2. **Less code to maintain** - Outsource permission management
3. **Better security** - Experts maintain it, not you
4. **Flexibility** - Can add policies without code changes
5. **Future-proof** - Enterprise features when you need them

### Implementation Timeline

- **Week 1**: Keycloak setup + parallel auth (8 days)
- **Week 2**: Voice sharing implementation (2 days)
- **Total**: 10 days to production-ready sharing

vs.

- **Custom implementation**: 5 days initial + ongoing maintenance + limited features

### ROI Calculation

| Approach | Initial Time | Maintenance/Year | Total Year 1 |
|----------|-------------|------------------|--------------|
| Custom | 5 days | 10 days | 15 days |
| Keycloak | 10 days | 1 day | 11 days |

**Keycloak saves time starting Year 1**, plus you get better features.

---

## Decision Framework

**Choose Current System (Custom JWT) if:**
- You only need simple auth (login/logout)
- All users are trusted members
- No external sharing required
- You enjoy building auth systems

**Choose Keycloak if:**
- ✅ You need external sharing (your use case!)
- ✅ You want social login
- ✅ You want fine-grained permissions
- ✅ You want less code to maintain
- ✅ You might need enterprise features

**Choose Matrix MAS if:**
- You're building a Matrix-based system
- You enjoy bleeding-edge tech
- You have extra time for unknowns
- You're okay with proprietary licenses

---

## Sources

- [Keycloak Authorization Services](https://www.keycloak.org/docs/latest/authorization_services/)
- [Resource-Based Authorization in Keycloak](https://medium.com/@kasturepadmakar4u/resource-and-scope-based-authorization-in-keycloak-1fdb90408e91)
- [User-Managed Access (UMA) Protocol](https://www.keycloak.org/docs/latest/authorization_services/#_service_user_managed_access)
- [Matrix Authentication Service](https://matrix-org.github.io/matrix-authentication-service/)
