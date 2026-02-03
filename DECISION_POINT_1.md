# Decision Point #1: Resource Validation

## Current Status

✅ **Feature is ready to use** - Sharing works with lazy validation (no resource checking)
📝 **Your choice** - Implement strict validation if you want to prevent broken share links

## How It Works Now

When you create a share link, the system:
1. ✅ Creates share token in MongoDB
2. ✅ Generates share URL
3. ⚠️ **Does NOT verify** the conversation/resource exists
4. ✅ Returns link to user

**Result**: Share links are created instantly, but might be broken if the resource doesn't exist.

---

## Enabling Strict Validation

### Step 1: Set Environment Variable

Add to your `.env` file:
```bash
SHARE_VALIDATE_RESOURCES=true
```

This tells the share service to validate resources before creating share links.

### Step 2: Implement Validation Logic

**Location**: `ushadow/backend/src/services/share_service.py` line ~340

I've prepared the function structure. You need to add **5-10 lines** of code to validate the resource exists.

---

## Implementation Options

Since Mycelia uses a resource-based API (not REST), you have two approaches:

### Option A: Validate via Mycelia Objects API (Recommended)

```python
# In _validate_resource_exists(), around line 340:

if resource_type == ResourceType.CONVERSATION:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Call Mycelia objects resource with "get" action
            response = await client.post(
                "http://mycelia-backend:8000/api/resource/tech.mycelia.objects",
                json={
                    "action": "get",
                    "id": resource_id
                },
                headers={"Authorization": f"Bearer {self._get_service_token()}"}
            )

            if response.status_code == 404:
                raise ValueError(f"Conversation {resource_id} not found in Mycelia")
            elif response.status_code != 200:
                raise ValueError(f"Failed to validate conversation: {response.status_code}")

    except httpx.RequestError as e:
        logger.error(f"Failed to connect to Mycelia: {e}")
        raise ValueError("Could not connect to Mycelia to validate conversation")
```

**Pros**: Validates against Mycelia directly
**Cons**: Requires service token for authentication

---

### Option B: Validate via Ushadow Generic Proxy

```python
if resource_type == ResourceType.CONVERSATION:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Use ushadow's generic proxy to Mycelia
            response = await client.post(
                "http://localhost:8080/api/services/mycelia-backend/proxy/api/resource/tech.mycelia.objects",
                json={
                    "action": "get",
                    "id": resource_id
                }
            )

            if response.status_code == 404:
                raise ValueError(f"Conversation {resource_id} not found")
            elif response.status_code != 200:
                raise ValueError(f"Failed to validate conversation: {response.status_code}")

    except httpx.RequestError as e:
        logger.error(f"Mycelia validation failed: {e}")
        raise ValueError("Could not validate conversation")
```

**Pros**: Leverages existing proxy, handles auth automatically
**Cons**: Assumes ushadow proxy is available

---

### Option C: Skip Validation (Current Behavior)

Don't set `SHARE_VALIDATE_RESOURCES=true` and leave the TODO as-is.

**Pros**: Instant share creation, no API calls
**Cons**: Users might create broken share links

---

## Trade-offs to Consider

| Aspect | Lazy Validation | Strict Validation |
|--------|----------------|-------------------|
| **Speed** | ✅ Instant (~5ms) | ⚠️ Slower (~50-100ms) |
| **Reliability** | ⚠️ Might create broken links | ✅ Only valid links |
| **UX** | ✅ Fast feedback | ⚠️ Slight delay |
| **Dependencies** | ✅ No backend calls | ⚠️ Requires Mycelia/Chronicle |
| **Error handling** | ⚠️ Broken links fail silently | ✅ Immediate error feedback |

---

## My Recommendation

**Start with Lazy Validation (current behavior)** because:
1. It's simpler - no extra code needed
2. Users rarely share non-existent conversations
3. When they access a broken link, they get a clear "not found" error
4. You can always add strict validation later if needed

**Implement Strict Validation if:**
- You have frequent issues with broken share links
- You want immediate feedback during share creation
- The ~50-100ms delay is acceptable for your UX

---

## Testing Your Implementation

Once you've implemented validation:

```bash
# Test with valid conversation
curl -X POST http://localhost:8080/api/share/create \
  -H "Content-Type: application/json" \
  -H "Cookie: ushadow_auth=YOUR_TOKEN" \
  -d '{
    "resource_type": "conversation",
    "resource_id": "VALID_CONVERSATION_ID",
    "permissions": ["read"]
  }'

# Expected: 201 Created with share URL

# Test with invalid conversation
curl -X POST http://localhost:8080/api/share/create \
  -H "Content-Type: application/json" \
  -H "Cookie: ushadow_auth=YOUR_TOKEN" \
  -d '{
    "resource_type": "conversation",
    "resource_id": "INVALID_ID_12345",
    "permissions": ["read"]
  }'

# Expected: 400 Bad Request with "Conversation not found" error
```

---

## Questions?

**Q: What if Mycelia/Chronicle is down during validation?**
A: The validation will fail with "Could not connect" error, preventing share creation. Consider adding retry logic or circuit breaker.

**Q: Should I validate memories too?**
A: Yes, add similar logic for `ResourceType.MEMORY` if users can share individual memories.

**Q: Can I validate asynchronously (background job)?**
A: Not recommended - user needs immediate feedback. If validation is slow, consider caching resource existence.

---

## Next Steps

1. **Decide**: Lazy vs Strict validation
2. **If Strict**: Set `SHARE_VALIDATE_RESOURCES=true` in `.env`
3. **Implement**: Add 5-10 lines in `share_service.py` (see options above)
4. **Test**: Create shares with valid/invalid IDs
5. **Move to Decision Point #2**: User authorization checks
