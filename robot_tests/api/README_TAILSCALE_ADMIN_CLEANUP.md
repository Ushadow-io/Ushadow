# Tailscale Certificate Provisioning Test with Unique Hostnames

## Overview

The `Provision Tailscale Certificate` test creates a **unique temporary Tailscale container** for each test run, provisions a certificate for it, then cleans up everything including removing the device from your Tailscale admin console. This ensures:

- ✅ **Fresh certificate every run** (not reusing cached certs)
- ✅ **Unique hostname per test** (e.g., `test-1705350123.spangled-kettle.ts.net`)
- ✅ **No tailnet pollution** (devices automatically removed after test)
- ✅ **True integration test** (full container lifecycle + cert provisioning)

## How It Works

**Setup Phase:**
1. Generates unique timestamp-based container name (e.g., `ushadow-test-1705350123-tailscale`)
2. Creates temporary Docker volume and certs directory
3. Starts Tailscale container with auth key for automatic authentication
4. Waits for authentication to complete
5. Extracts the unique hostname from container status

**Test Phase:**
- Runs `tailscale cert` command directly in the temp container
- Provisions certificate for the unique hostname
- Verifies cert and key files exist

**Teardown Phase:**
- Stops and removes temporary container
- Deletes temporary volume
- Cleans up temporary cert directory
- **Removes device from Tailscale admin** (if API key configured)

## Configuration

### Required: Auth Key

To enable this test, you **must** provide a Tailscale auth key for automatic container authentication:

```bash
# Required for automated authentication of temporary containers
TAILSCALE_AUTH_KEY=tskey-auth-xxxxxxxxxxxxx
```

### Optional: API Key for Admin Cleanup

To enable automatic device cleanup from Tailscale admin, also add:

```bash
# Optional: for automatic admin console cleanup
TAILSCALE_API_KEY=tskey-api-xxxxxxxxxxxxx
TAILSCALE_TAILNET=example.com  # Or user@example.com
```

### Getting a Tailscale Auth Key

1. Go to [Tailscale Admin Console](https://login.tailscale.com/admin/settings/keys)
2. Navigate to **Settings → Keys → Auth Keys**
3. Click **Generate Auth Key**
4. Configure the key:
   - **Reusable**: ✅ Enable (allows multiple test containers)
   - **Ephemeral**: ✅ Enable (devices auto-removed when container stops)
   - **Pre-approved**: ✅ Enable (no manual approval needed)
   - **Tags**: Optional (e.g., `tag:test`)
5. Copy the generated key (starts with `tskey-auth-`)
6. Add to `.env` as `TAILSCALE_AUTH_KEY`

**Important**: Keep this key secret! It allows automated device registration on your tailnet.

### Getting a Tailscale API Key (Optional)

Only needed if you want automatic admin console cleanup:

1. Go to [Tailscale Admin Console](https://login.tailscale.com/admin/settings/keys)
2. Navigate to **Settings → Keys → API Access Tokens**
3. Click **Generate API Key**
4. Select capabilities:
   - **Devices: Read** (to list devices)
   - **Devices: Write** (to delete devices)
5. Copy the generated key (starts with `tskey-api-`)
6. Add to `.env` as `TAILSCALE_API_KEY`

### Finding Your Tailnet Name

Your tailnet name is typically:
- Your custom domain: `example.com`
- Or your email: `user@example.com`

You can find it in the Tailscale admin console URL:
```
https://login.tailscale.com/admin/machines/<YOUR_TAILNET>
```

## Behavior

### With Auth Key Only:
```
🔧 Creating temporary Tailscale container for cert test
✅ Temporary container started: ushadow-test-1705350123-tailscale
✅ Temporary container authenticated with hostname: test-1705350123
✅ Certificate provisioned successfully for test-1705350123.spangled-kettle.ts.net
✅ Temporary container removed
✅ Temporary volume removed
⚠️ TAILSCALE_API_KEY not configured - cannot auto-cleanup from admin
⚠️ Manual cleanup required: https://login.tailscale.com/admin/machines
```

### With Auth Key + API Key (Recommended):
```
🔧 Creating temporary Tailscale container for cert test
✅ Temporary container started: ushadow-test-1705350123-tailscale
✅ Temporary container authenticated with hostname: test-1705350123
✅ Certificate provisioned successfully for test-1705350123.spangled-kettle.ts.net
✅ Temporary container removed
✅ Temporary volume removed
✅ Device removed from Tailscale admin
✅ Cleanup complete
```

### Without Auth Key:
```
Test skipped: TAILSCALE_AUTH_KEY not set in .env - cannot auto-authenticate temporary container
```

## Manual Cleanup

**Important Note**: If you enable **Ephemeral** on your auth key (recommended), devices are automatically removed from your tailnet when the container stops. This means you may not need the API key for cleanup!

However, if you want immediate cleanup via API or didn't enable ephemeral, you can manually remove test machines from:
https://login.tailscale.com/admin/machines

Look for machines with names starting with `test-` (e.g., `test-1705350123`).

## Security Note

**Never commit your Tailscale API key to git!**

The `.env` file should be listed in `.gitignore`. If you need to share configuration:
1. Create `.env.example` with placeholder values
2. Commit only the example file
3. Each developer creates their own `.env` from the example

## Troubleshooting

### "Could not remove device from Tailscale admin"

Check:
- API key is valid and not expired
- API key has "Devices: Write" permission
- Tailnet name is correct
- Device hostname matches exactly (check the test logs for the hostname being used)

### "Device not found in tailnet"

This can happen if:
- The device was already removed manually
- The hostname doesn't match (check for tailnet suffix)
- The device was never successfully registered

This is not an error - the test will log a warning and continue.
