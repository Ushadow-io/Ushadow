# Ushadow Authentication Architecture

## The Self-Hosted Reality

**Ushadow is self-hosted** - each user (or organization) runs their own ushadow instance with their own Keycloak.

This document explains how auth and sharing work in this distributed model.

---

## Architecture: Per-Instance Keycloak

### What Gets Deployed

When Alice runs ushadow, she gets:

```
Alice's Server (alice-ushadow.com)
┌─────────────────────────────────────┐
│ Alice's Keycloak (Docker container) │
│  - Manages users on Alice's server  │
│  - Issues tokens for Alice's server │
│  - Handles social login (Google)    │
├─────────────────────────────────────┤
│ Alice's Ushadow Backend             │
│  - Validates tokens from Keycloak   │
│  - Stores voice messages            │
│  - Enforces UMA permissions         │
├─────────────────────────────────────┤
│ MongoDB, Redis, etc.                │
└─────────────────────────────────────┘
```

When Bob runs ushadow, he gets **the same setup** on his own server.

---

## Two Sharing Models

### Model A: Guest Accounts (Recommended - Simple)

**When Alice shares a voice message with Bob:**

1. **Alice uploads** to her server
2. **Alice shares** by entering Bob's email: `bob@gmail.com`
3. **Bob clicks link** → redirected to `alice-ushadow.com`
4. **Bob sees login screen**:
   - "Login with Google"
   - "Login with GitHub"
   - "Create account"
5. **Bob logs in with Google**
6. **Alice's Keycloak** creates a new user account for Bob
7. **Alice's Ushadow** grants Bob permission to view the message
8. **Bob downloads** the voice message

**Result**: Bob now has two accounts:
- Account on his own server (bob-ushadow.com)
- Account on Alice's server (alice-ushadow.com)

**This is how most federated systems work**:
- Email: You can receive mail from anyone, but you have one account
- Mastodon: You have account on your server, but can see posts from other servers
- WordPress: Each site has its own users

**Pros**:
- ✅ Simple to implement
- ✅ Standard OIDC flow
- ✅ No server-to-server trust needed
- ✅ Works with existing Keycloak setup

**Cons**:
- ⚠️ Bob has multiple accounts (but he logs in with Google, so same credentials)
- ⚠️ Alice's server stores Bob's user info

---

### Model B: True Federation (Advanced - Like Email)

**When Alice shares with Bob (if both run ushadow):**

```
1. Alice shares with "bob@bob-ushadow.com"
2. Bob clicks link → alice-ushadow.com
3. Alice's server asks Bob to prove identity
4. Bob authenticates on HIS server (bob-ushadow.com)
5. Bob's server issues signed token: "This is Bob"
6. Alice's server verifies signature from bob-ushadow.com
7. Alice's server checks: "Does Bob have permission?"
8. → Serve file
```

**Result**: Bob only has account on his own server

**This requires**:
- Keycloak identity federation configuration
- DNS/discovery (Alice needs to find bob-ushadow.com)
- Trust establishment (Alice's Keycloak trusts Bob's Keycloak)
- More complex error handling

**Pros**:
- ✅ True federation (like email)
- ✅ Bob only has one account
- ✅ Privacy (Alice doesn't store Bob's info)

**Cons**:
- ❌ Complex setup (Keycloak identity brokering)
- ❌ Discovery problem (how to find Bob's server?)
- ❌ Trust management (Alice must trust Bob's server)
- ❌ Availability (requires Bob's server to be online)

---

## Recommended Implementation: Model A

For ushadow's initial implementation, **Model A (Guest Accounts)** is recommended:

### Why Model A?

1. **Works with any email** - Bob doesn't need to run ushadow
2. **Social login** - Bob can login with Google/GitHub
3. **Simple** - Standard OIDC, no federation complexity
4. **Reliable** - Doesn't depend on Bob's server being online

### User Experience (Model A)

```
Alice's Perspective:
1. Records voice message
2. Clicks "Share" → enters bob@gmail.com
3. Gets share link: https://alice-ushadow.com/voice/msg-123
4. Sends link to Bob

Bob's Perspective:
1. Clicks link
2. Sees: "Alice shared a voice message with you"
3. "Login with Google" or "Create account"
4. Clicks "Login with Google"
5. (First time) Sees: "Allow alice-ushadow.com to access your Google profile?"
6. Confirms
7. Downloads voice message
```

**Key insight**: Bob doesn't need to understand "Keycloak" or "federation" - it just works like any modern web app with social login.

---

## Deployment: Keycloak Runs On Your Server

### Docker Compose Setup

```yaml
# compose/keycloak.yml (runs on each ushadow instance)

services:
  keycloak:
    image: quay.io/keycloak/keycloak:26.0
    container_name: ushadow-keycloak
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_HOSTNAME: ${YOUR_DOMAIN}  # e.g., alice-ushadow.com
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: ${ADMIN_PASSWORD}
    ports:
      - "8080:8080"
```

Each ushadow instance has its own Keycloak. No shared/central server.

---

## Voice Message Sharing Flow (Model A)

### 1. Alice Uploads Voice Message

```python
# On alice-ushadow.com

@router.post("/voice-messages")
async def upload(file: UploadFile, user: KeycloakUser):
    # Save file
    message_id = save_file(file)

    # Create resource in Alice's Keycloak
    await keycloak.create_resource(
        name=f"voice-message-{message_id}",
        owner=user.sub,  # Alice's Keycloak user ID
        scopes=["view", "share", "delete"]
    )

    return {"id": message_id, "url": f"/voice/{message_id}"}
```

### 2. Alice Shares With Bob

```python
# Alice enters: bob@gmail.com

@router.post("/voice-messages/{id}/share")
async def share(id: str, email: str, user: KeycloakUser):
    # Email might not exist yet - that's OK!
    # When Bob logs in, we'll grant permission

    # Create pending share
    await PendingShare.create({
        "message_id": id,
        "recipient_email": email,
        "scopes": ["view"],
        "created_by": user.sub
    })

    # Send email to Bob
    await send_share_email(
        to=email,
        link=f"https://alice-ushadow.com/voice/{id}"
    )

    return {"share_link": f"https://alice-ushadow.com/voice/{id}"}
```

### 3. Bob Clicks Link (First Time)

```python
# On alice-ushadow.com

@router.get("/voice/{id}")
async def get_message(id: str, user: Optional[KeycloakUser] = None):
    if not user:
        # Bob not logged in → redirect to login
        return RedirectResponse("/auth/login?redirect=/voice/{id}")

    # Bob just logged in with Google
    # Check for pending shares for his email
    pending = await PendingShare.find_one({
        "message_id": id,
        "recipient_email": user.email
    })

    if pending:
        # Grant permission NOW
        await keycloak.grant_permission(
            resource=f"voice-message-{id}",
            user_id=user.sub,  # Bob's NEW Keycloak ID on Alice's server
            scopes=pending["scopes"]
        )
        await pending.delete()

    # Check permission
    has_access = await keycloak.check_permission(
        resource=f"voice-message-{id}",
        user_id=user.sub,
        scope="view"
    )

    if not has_access:
        raise HTTPException(403, "Access denied")

    return FileResponse(f"/storage/{id}.webm")
```

### 4. Bob Clicks Link (Subsequent Times)

```python
# Bob already has account on alice-ushadow.com
# Browser has cookie → auto-logged in
# Permission already granted → instant access
```

---

## Key Differences From Centralized Keycloak

### What I Said Before (Wrong)
```
Everyone uses keycloak.ushadow.com ← One central server YOU host
```

### What Actually Happens (Correct)
```
Alice runs keycloak on alice-ushadow.com
Bob runs keycloak on bob-ushadow.com
Each is independent, no central server
```

### How Sharing Works
```
Before: All users in one Keycloak ← Everyone knows everyone
After:  Each server has its own Keycloak ← Guests created on-demand
```

---

## Migration Path Still Valid

The migration guide I provided is **still correct**, just understand:

- "Deploy Keycloak" means **on YOUR ushadow instance** (Docker Compose)
- "Users" means **users of YOUR instance** (you + people you invite)
- "Sharing" creates **guest accounts** on your instance (via social login)

---

## Future: True Federation (Model B)

If you later want true federation (Model B):

```yaml
# Alice's Keycloak config
identityProviders:
  - alias: bob-ushadow
    providerId: oidc
    config:
      authorizationUrl: https://bob-ushadow.com/auth/realms/ushadow/protocol/openid-connect/auth
      tokenUrl: https://bob-ushadow.com/auth/realms/ushadow/protocol/openid-connect/token
      clientId: alice-ushadow
      clientSecret: <shared-secret>
```

Then Alice's Keycloak can say: "If someone claims to be from bob-ushadow.com, verify with Bob's Keycloak."

But this is advanced - start with Model A!

---

## Summary

**Deployment**: Each ushadow instance runs its own Keycloak (Docker container)

**Authentication**: Users authenticate against the Keycloak on the server they're accessing

**Sharing**: When Alice shares with Bob:
1. Bob gets email with link to Alice's server
2. Bob clicks → redirected to Alice's Keycloak login
3. Bob logs in with Google (social login)
4. Alice's Keycloak creates account for Bob
5. Alice's Ushadow grants permission
6. Bob accesses file

**No central server needed** - fully distributed, self-hosted.

**This is federated hosting**, not peer-to-peer, but it preserves self-hosting philosophy while enabling sharing!
