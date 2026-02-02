# Federation Models Explained

## The Question

> "Bob redirected to keycloak. An existing centralized server? A centralized server we need to deploy and host? Or a local keycloak server Alice has installed on her ushadow instance?"

**Answer: Option 3** - Alice has Keycloak installed on HER ushadow instance.

---

## Visual Comparison

### ❌ WRONG: Centralized Keycloak (What I Initially Described)

```
                    ┌─────────────────────────┐
                    │   keycloak.ushadow.com  │
                    │   (YOUR central server) │
                    │                         │
                    │   All users:            │
                    │   - Alice               │
                    │   - Bob                 │
                    │   - Charlie             │
                    │   - Everyone            │
                    └────────────┬────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌────────────────┐      ┌────────────────┐     ┌────────────────┐
│ Alice's        │      │ Bob's          │     │ Charlie's      │
│ ushadow        │      │ ushadow        │     │ ushadow        │
│ instance       │      │ instance       │     │ instance       │
└────────────────┘      └────────────────┘     └────────────────┘
```

**Problems**:
- ❌ Single point of failure
- ❌ YOU must host keycloak.ushadow.com (cost, maintenance)
- ❌ All user data in one place (privacy concern)
- ❌ Breaks self-hosting philosophy

---

### ✅ CORRECT: Distributed Keycloak (Per-Instance)

```
Alice's Server              Bob's Server              Charlie's Server
┌──────────────────┐       ┌──────────────────┐      ┌──────────────────┐
│ Alice's Keycloak │       │ Bob's Keycloak   │      │ Charlie's KC     │
│  Users:          │       │  Users:          │      │  Users:          │
│  - Alice (owner) │       │  - Bob (owner)   │      │  - Charlie       │
│  - Alice's team  │       │  - Bob's friends │      │  - Colleagues    │
├──────────────────┤       ├──────────────────┤      ├──────────────────┤
│ Alice's Ushadow  │       │ Bob's Ushadow    │      │ Charlie's Ushadow│
│ Voice messages   │       │ Voice messages   │      │ Voice messages   │
└──────────────────┘       └──────────────────┘      └──────────────────┘
```

**Benefits**:
- ✅ Fully self-hosted (no central server)
- ✅ Each person controls their own auth
- ✅ Privacy (data stays on your server)
- ✅ No single point of failure

---

## How Sharing Works

### Scenario: Alice Shares Voice Message With Bob

#### Step-by-Step Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Alice Creates Voice Message                         │
└─────────────────────────────────────────────────────────────┘

Alice's Server (alice-ushadow.com)
┌───────────────────────────────┐
│ Alice's Keycloak              │
│  Users: [Alice]               │
├───────────────────────────────┤
│ Alice's Ushadow               │
│  Voice Messages:              │
│  - msg-123.webm (Owner: Alice)│
└───────────────────────────────┘


┌─────────────────────────────────────────────────────────────┐
│ Step 2: Alice Shares With bob@gmail.com                     │
└─────────────────────────────────────────────────────────────┘

Alice's Server
┌───────────────────────────────┐
│ Pending Shares:               │
│  msg-123 → bob@gmail.com      │
└───────────────────────────────┘

Bob receives email:
"Alice shared a voice message: alice-ushadow.com/voice/msg-123"


┌─────────────────────────────────────────────────────────────┐
│ Step 3: Bob Clicks Link (First Time)                        │
└─────────────────────────────────────────────────────────────┘

Bob visits: alice-ushadow.com/voice/msg-123

Alice's Server shows:
┌───────────────────────────────┐
│ 🔒 Login Required             │
│                               │
│ [Login with Google]           │
│ [Login with GitHub]           │
│ [Create Account]              │
└───────────────────────────────┘


┌─────────────────────────────────────────────────────────────┐
│ Step 4: Bob Logs In With Google                             │
└─────────────────────────────────────────────────────────────┘

Bob clicks "Login with Google"
↓
Redirected to Google
↓
Google asks: "Allow alice-ushadow.com to access your profile?"
↓
Bob confirms
↓
Google returns Bob to alice-ushadow.com with token
↓
Alice's Keycloak creates new user:
┌───────────────────────────────┐
│ Alice's Keycloak              │
│  Users:                       │
│  - Alice (local account)      │
│  - Bob (Google federated) ← NEW!
└───────────────────────────────┘


┌─────────────────────────────────────────────────────────────┐
│ Step 5: Permission Granted Automatically                     │
└─────────────────────────────────────────────────────────────┘

Alice's Ushadow checks:
- Is there a pending share for bob@gmail.com? ✓ Yes
- Did Bob just log in with that email? ✓ Yes
- Grant permission!

Keycloak UMA:
┌───────────────────────────────┐
│ Resource: voice-message-123   │
│  Owner: Alice                 │
│  Permissions:                 │
│  - Alice: view, share, delete │
│  - Bob: view ← GRANTED!       │
└───────────────────────────────┘


┌─────────────────────────────────────────────────────────────┐
│ Step 6: Bob Downloads File                                   │
└─────────────────────────────────────────────────────────────┘

Bob sees:
┌───────────────────────────────┐
│ Voice Message from Alice      │
│ Duration: 1:23                │
│ [▶ Play] [⬇ Download]        │
└───────────────────────────────┘
```

---

## The Two-Account Reality

After this flow, Bob has **two accounts**:

```
Bob's Accounts:

1. bob-ushadow.com (Bob's own server)
   ├─ Keycloak User ID: 12345
   ├─ Email: bob@gmail.com
   ├─ Login: Google OAuth
   └─ Access: Bob's own voice messages

2. alice-ushadow.com (Alice's server)
   ├─ Keycloak User ID: 67890
   ├─ Email: bob@gmail.com
   ├─ Login: Google OAuth (same credentials!)
   └─ Access: Alice's shared voice messages
```

**Key insight**: Bob uses the **same Google login** for both, so it's transparent to him. He doesn't manage two passwords.

---

## Comparison to Other Systems

### Email (True Federation)
```
Alice@gmail.com → sends to → Bob@outlook.com

Gmail server ↔ Outlook server communicate
Bob doesn't need Gmail account
```

### Mastodon (Federated Hosting)
```
Alice@mastodon.social → shares post → Bob@infosec.exchange

Bob sees Alice's post on HIS server (federation)
Bob doesn't need mastodon.social account
```

### Ushadow with Keycloak (Guest Account Model)
```
Alice@alice-ushadow.com → shares voice → Bob@gmail.com

Bob clicks link → creates account on alice-ushadow.com
Bob now has account on Alice's server (guest)
```

**This is somewhere between**:
- Not true federation (Bob needs account on Alice's server)
- Not centralized (each server independent)
- **Federated authentication** (Bob uses Google, doesn't need password)

---

## Why Not True Federation?

True federation (like email) would require:

### Discovery Problem
```
Alice shares with "bob@bob-ushadow.com"
Question: How does Alice find bob-ushadow.com?
- DNS lookup? (requires standard)
- Directory service? (defeats decentralization)
- Manual entry? (poor UX)
```

### Trust Problem
```
Alice's server receives token from bob-ushadow.com
Question: Should Alice trust bob-ushadow.com?
- Pre-configured trust? (manual setup)
- Web of trust? (complex)
- Public key infrastructure? (blockchain?)
```

### Availability Problem
```
Alice's server wants to verify Bob
Question: What if bob-ushadow.com is offline?
- Cache credentials? (security risk)
- Fail open? (security risk)
- Fail closed? (availability problem)
```

**Guest account model avoids all these** by having Bob authenticate on Alice's server.

---

## Future: True Federation (Optional)

If you want email-like federation later:

### Keycloak Identity Brokering
```yaml
# Alice's Keycloak configuration
identityProviders:
  - alias: bob-ushadow
    providerId: oidc
    config:
      issuerUrl: https://bob-ushadow.com/auth/realms/ushadow
      clientId: alice-ushadow
      clientSecret: <negotiated-secret>
      trustEmail: true
```

Then:
1. Alice shares with "bob@bob-ushadow.com"
2. Bob clicks link → alice-ushadow.com
3. Alice's Keycloak: "Login via bob-ushadow.com"
4. Redirect to Bob's server for authentication
5. Bob authenticates on HIS server
6. Redirect back to Alice's server with token
7. Alice's Keycloak verifies token signature
8. Access granted

**No account created** - Bob authenticated on his own server.

But this requires:
- Service discovery (how to find bob-ushadow.com)
- Trust negotiation (manual or automated?)
- Both servers online (availability dependency)

**Start simple (guest accounts), add federation later if needed.**

---

## Summary

| Question | Answer |
|----------|--------|
| Where does Keycloak run? | On each ushadow instance (Docker container) |
| Is there a central Keycloak? | No - each instance has its own |
| When Bob visits Alice's server? | Bob logs in on Alice's Keycloak (creates guest account) |
| Does Bob need his own ushadow? | No - Bob just needs email (for login link) |
| Can Bob use Google login? | Yes - Alice's Keycloak supports social login |
| Does Bob have two accounts? | Yes - on his own server + guest on Alice's server |
| Is this true P2P? | No - but it's decentralized hosting with federated auth |

**Architecture**: Distributed Keycloak instances with guest account sharing

**User Experience**: Like logging into any website with "Login with Google"

**Self-Hosting**: Fully preserved - no central server, run your own instance
