# Tailscale Integration Troubleshooting Guide

Comprehensive troubleshooting guide for common issues with Tailscale + Caddy integration.

---

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Installation Issues](#installation-issues)
- [Connection Issues](#connection-issues)
- [Certificate Issues](#certificate-issues)
- [Routing Issues](#routing-issues)
- [Caddy Issues](#caddy-issues)
- [Mobile Device Issues](#mobile-device-issues)
- [Performance Issues](#performance-issues)
- [Error Messages](#error-messages)

---

## Quick Diagnostics

Run these commands to quickly identify issues:

```bash
# Check Tailscale installation
command -v tailscale && echo "✅ Installed" || echo "❌ Not installed"

# Check Tailscale status
tailscale status && echo "✅ Running" || echo "❌ Not running"

# Check Tailscale hostname
tailscale status --json | grep DNSName | cut -d'"' -f4 | sed 's/\.$//'

# Check tailscale serve configuration
tailscale serve status

# Check Caddy status
docker ps | grep caddy && echo "✅ Caddy running" || echo "❌ Caddy not running"

# Check Caddyfile exists
[ -f "caddy/Caddyfile" ] && echo "✅ Caddyfile exists" || echo "❌ Caddyfile missing"

# Check certificates
ls -la certs/ 2>/dev/null || echo "❌ Certs directory missing"

# Test local backend
curl -s http://localhost:8000/health && echo "✅ Backend responding" || echo "❌ Backend not responding"
```

**Create a diagnostic script**:
```bash
#!/bin/bash
# Save as: diagnose.sh

echo "🔍 Tailscale + Caddy Diagnostics"
echo "================================"
echo ""

echo "1. Tailscale Installation:"
command -v tailscale && echo "   ✅ Installed" || echo "   ❌ Not installed"

echo ""
echo "2. Tailscale Status:"
tailscale status >/dev/null 2>&1 && echo "   ✅ Running" || echo "   ❌ Not running"

echo ""
echo "3. Tailscale Hostname:"
HOSTNAME=$(tailscale status --json 2>/dev/null | grep DNSName | cut -d'"' -f4 | sed 's/\.$//')
[ -n "$HOSTNAME" ] && echo "   ✅ $HOSTNAME" || echo "   ❌ Not detected"

echo ""
echo "4. Caddy Container:"
docker ps | grep -q caddy && echo "   ✅ Running" || echo "   ❌ Not running"

echo ""
echo "5. Caddyfile:"
[ -f "caddy/Caddyfile" ] && echo "   ✅ Exists" || echo "   ❌ Missing"

echo ""
echo "6. Certificates:"
ls certs/*.crt >/dev/null 2>&1 && echo "   ✅ Found" || echo "   ❌ Missing"

echo ""
echo "7. Backend Health:"
curl -s http://localhost:8000/health >/dev/null 2>&1 && echo "   ✅ Responding" || echo "   ❌ Not responding"

echo ""
echo "8. Environment Files:"
ls environments/*.env >/dev/null 2>&1 && echo "   ✅ Found" || echo "   ❌ None found"

echo ""
```

---

## Installation Issues

### Issue: "tailscale: command not found"

**Symptom**: Running `tailscale` command shows "command not found"

**Cause**: Tailscale not installed or not in PATH

**Solution**:

1. **Verify installation**:
   ```bash
   # Check if binary exists but not in PATH
   find /usr /opt -name tailscale 2>/dev/null
   ```

2. **Reinstall Tailscale**:
   ```bash
   # Universal installer
   curl -fsSL https://tailscale.com/install.sh | sh

   # Verify
   command -v tailscale
   ```

3. **Add to PATH** (if found but not in PATH):
   ```bash
   # Add to .bashrc or .zshrc
   export PATH=$PATH:/usr/local/bin
   source ~/.bashrc
   ```

### Issue: "Permission denied" when running tailscale

**Symptom**: `tailscale: permission denied`

**Cause**: Need sudo or root access

**Solution**:
```bash
# Tailscale requires root privileges
sudo tailscale up
sudo tailscale status
```

### Issue: Tailscale installed but "tailscaled not running"

**Symptom**: `tailscaled is not running`

**Cause**: Tailscale daemon not started

**Solution**:

**SystemD (Linux)**:
```bash
# Start tailscale service
sudo systemctl start tailscaled

# Enable on boot
sudo systemctl enable tailscaled

# Check status
sudo systemctl status tailscaled
```

**macOS (Homebrew)**:
```bash
# Start service
sudo brew services start tailscale

# Check status
brew services list | grep tailscale
```

**Windows**:
- Open Services app (services.msc)
- Find "Tailscale"
- Right-click → Start
- Set Startup type to "Automatic"

---

## Connection Issues

### Issue: Can't connect to Tailscale network

**Symptom**: `tailscale status` shows no devices or connection errors

**Diagnosis**:
```bash
# Check connection status
tailscale status

# Check ping connectivity
tailscale ping <other-device-hostname>

# Check network diagnostic
tailscale netcheck
```

**Solution 1: Reauthenticate**:
```bash
# Log out and back in
sudo tailscale logout
sudo tailscale up

# Follow authentication URL
```

**Solution 2: Check firewall**:
```bash
# Ensure UDP port 41641 is allowed
sudo ufw allow 41641/udp  # Ubuntu
sudo firewall-cmd --add-port=41641/udp  # Fedora
```

**Solution 3: Check internet connectivity**:
```bash
# Test if you can reach Tailscale coordination server
ping -c 3 controlplane.tailscale.com
```

### Issue: Devices don't see each other

**Symptom**: Phone can't see computer (or vice versa) in Tailscale

**Cause**: Logged into different Tailscale accounts

**Diagnosis**:
```bash
# On computer
tailscale status
# Note the account email shown

# On phone
# Open Tailscale app → Settings → Check logged-in account
```

**Solution**:
1. **Log out of Tailscale on BOTH devices**
2. **Log back in with the SAME account** on both
3. **Wait 30 seconds** for device discovery
4. **Verify**:
   ```bash
   tailscale status
   # Should show both devices
   ```

### Issue: "Tailnet unreachable" or "Not connected"

**Symptom**: Status shows "not connected" or "unreachable"

**Cause**: Network issues, firewall, or NAT problems

**Solution**:

1. **Restart Tailscale**:
   ```bash
   sudo tailscale down
   sudo tailscale up
   ```

2. **Force DERP relay** (if direct connection fails):
   ```bash
   tailscale up --force-reauth --accept-routes
   ```

3. **Check NAT traversal**:
   ```bash
   tailscale netcheck
   # Look for "DERP" latency - should show reachable DERP servers
   ```

---

## Certificate Issues

### Issue: "Certificate not found" or "Certificate expired"

**Symptom**: Browser shows certificate error or Caddy won't start

**Diagnosis**:
```bash
# Check if certificates exist
ls -la certs/

# Check certificate validity
openssl x509 -in certs/YOUR_HOSTNAME.tail12345.ts.net.crt -text -noout | grep "Not After"
```

**Solution: Re-provision certificates**:
```bash
# Get fresh certificates from Tailscale
tailscale cert YOUR_HOSTNAME.tail12345.ts.net

# Move to certs directory
mkdir -p certs
mv YOUR_HOSTNAME.tail12345.ts.net.* certs/

# Verify permissions
chmod 600 certs/*.key
chmod 644 certs/*.crt

# Restart Caddy
docker compose -f compose/caddy.yml restart
```

### Issue: "Permission denied" when provisioning certificates

**Symptom**: `tailscale cert` fails with permission error

**Cause**: Need sudo or cert permissions

**Solution**:
```bash
# Run with sudo
sudo tailscale cert YOUR_HOSTNAME.tail12345.ts.net

# Then move certs (may need sudo)
sudo mv YOUR_HOSTNAME.tail12345.ts.net.* certs/
sudo chown $USER:$USER certs/*
```

### Issue: Caddy can't read certificates

**Symptom**: Caddy logs show "permission denied" for certificate files

**Solution**:
```bash
# Fix permissions
sudo chown root:root certs/*.crt certs/*.key
sudo chmod 644 certs/*.crt
sudo chmod 600 certs/*.key

# If Caddy runs as non-root user
sudo chown caddy:caddy certs/*
```

---

## Routing Issues

### Issue: "404 Not Found" when accessing environment

**Symptom**: `https://hostname/dev/` returns 404

**Diagnosis**:
```bash
# Check if environment is running
docker ps | grep dev

# Check Caddyfile has the route
grep -A 10 "handle_path /dev/" caddy/Caddyfile

# Check backend is responding
curl http://localhost:8000/health
```

**Solution 1: Regenerate Caddyfile**:
```bash
# Regenerate from environments
./scripts/generate-caddyfile.sh

# Restart Caddy
docker compose -f compose/caddy.yml restart

# Verify route exists
grep "/dev/" caddy/Caddyfile
```

**Solution 2: Check environment is running**:
```bash
# Start environment
./start-env.sh dev

# Verify containers running
docker ps | grep friend-lite-dev
```

**Solution 3: Check container names match**:
```bash
# In Caddyfile
reverse_proxy friend-lite-dev-friend-backend-1:8000

# Check actual container name
docker ps --format "{{.Names}}" | grep backend
# Should match exactly!
```

### Issue: Backend routes work but frontend doesn't (or vice versa)

**Symptom**: `/api/health` works but `/` shows error

**Cause**: Frontend container not running or wrong port

**Diagnosis**:
```bash
# Check frontend container
docker ps | grep webui

# Test frontend directly
curl http://localhost:3010
```

**Solution**:
```bash
# Restart environment
docker compose -f compose/your-environment.yml restart webui

# Check logs
docker compose -f compose/your-environment.yml logs webui
```

### Issue: WebSocket connection fails

**Symptom**: `/ws_pcm` endpoint doesn't upgrade to WebSocket

**Diagnosis**:
```bash
# Test WebSocket upgrade
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: test" \
  https://hostname.tail12345.ts.net/dev/ws_pcm
```

**Solution**:

Caddy automatically handles WebSocket upgrades. Check backend:
```bash
# Test backend WebSocket directly
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  http://localhost:8000/ws_pcm
```

If backend works but Caddy doesn't, check Caddyfile routing for `/ws*`.

---

## Caddy Issues

### Issue: Caddy won't start

**Symptom**: `docker compose up` fails for Caddy

**Diagnosis**:
```bash
# Check Caddy logs
docker compose -f compose/caddy.yml logs

# Common errors:
# - "Caddyfile not found"
# - "certificate not found"
# - "port already in use"
```

**Solution 1: Caddyfile missing**:
```bash
# Generate Caddyfile
./scripts/generate-caddyfile.sh

# Verify it exists
ls -la caddy/Caddyfile
```

**Solution 2: Certificates missing**:
```bash
# Provision certificates
tailscale cert YOUR_HOSTNAME.tail12345.ts.net
mv *.crt *.key certs/
```

**Solution 3: Port 443 in use**:
```bash
# Check what's using port 443
sudo lsof -i :443
# or
sudo netstat -tulpn | grep :443

# Stop conflicting service
sudo systemctl stop apache2  # Example: Apache
sudo systemctl stop nginx    # Example: Nginx
```

### Issue: Caddy running but not routing

**Symptom**: Caddy container is up but requests fail

**Diagnosis**:
```bash
# Check Caddy can reach backend
docker exec -it chronicle-caddy /bin/sh
wget -O- http://friend-lite-dev-backend-1:8000/health

# Check Caddy logs
docker compose -f compose/caddy.yml logs -f
```

**Solution: Check Docker network**:
```bash
# Verify Caddy and backend on same network
docker network inspect chronicle-network

# Look for both containers in "Containers" section

# If missing, recreate network
docker network rm chronicle-network
docker network create chronicle-network

# Restart services
docker compose -f compose/caddy.yml restart
./start-env.sh dev
```

### Issue: Caddyfile syntax error

**Symptom**: Caddy logs show "Caddyfile syntax error"

**Diagnosis**:
```bash
# Validate Caddyfile syntax
docker run --rm -v $(pwd)/caddy:/etc/caddy caddy:2-alpine caddy validate
```

**Solution**:
```bash
# Regenerate Caddyfile
./scripts/generate-caddyfile.sh

# If manually edited, check for:
# - Mismatched braces { }
# - Missing semicolons (Caddy doesn't use them!)
# - Incorrect indentation
```

---

## Mobile Device Issues

### Issue: Can't connect from phone

**Symptom**: Phone Tailscale app shows "Not connected" or can't access services

**Checklist**:
```
□ Tailscale app installed on phone
□ Logged into SAME account as computer
□ Tailscale enabled in phone settings
□ Phone shows "Connected" (green status)
□ Computer appears in phone's device list
□ Phone appears in computer's tailscale status
```

**Solution 1: Verify same account**:
- On computer: `tailscale status` → note email
- On phone: Tailscale app → Settings → verify email matches

**Solution 2: Restart Tailscale on phone**:
- iPhone: Swipe up → force quit Tailscale app → reopen
- Android: Settings → Apps → Tailscale → Force stop → reopen

**Solution 3: Toggle VPN**:
- iPhone: Settings → VPN → Toggle Tailscale off/on
- Android: Settings → Network & Internet → VPN → Toggle Tailscale

### Issue: "VPN permission denied" on mobile

**Symptom**: iOS/Android won't allow VPN configuration

**Solution**:

**iOS**:
1. Settings → General → VPN & Device Management
2. Find Tailscale
3. Tap "Trust"
4. Reopen Tailscale app

**Android**:
1. Settings → Network & Internet → VPN
2. Find Tailscale
3. Ensure "Always-on VPN" is OFF (unless you want it on)
4. Grant VPN permission when prompted

### Issue: Mobile shows "Failed to authenticate"

**Symptom**: Can't log into Tailscale app

**Solution**:
1. **Clear app data**:
   - iOS: Delete app → Reinstall
   - Android: Settings → Apps → Tailscale → Clear data

2. **Try different browser** for authentication:
   - Some browsers block Tailscale redirect
   - Use Safari (iOS) or Chrome (Android)

3. **Check internet connection**:
   - Must have internet to authenticate
   - Try cellular data if WiFi fails

---

## Performance Issues

### Issue: Slow connection speed

**Symptom**: Noticeably slow when accessing via Tailscale

**Diagnosis**:
```bash
# Check Tailscale latency
tailscale ping <other-device>

# Check if using direct connection or DERP relay
tailscale status
# Look for IP addresses - if 100.x.x.x only, using DERP relay
```

**Solution 1: Force direct connection**:
```bash
# Enable UPnP (if possible)
tailscale up --advertise-exit-node=false --accept-routes

# Check network diagnostic
tailscale netcheck
```

**Solution 2: Use better DERP region**:
Tailscale auto-selects best DERP relay, but you can test:
```bash
tailscale netcheck
# Shows latency to all DERP regions
# Closer region = faster relay
```

**Solution 3: Check local network**:
```bash
# Test backend speed directly
time curl http://localhost:8000/api/large-response

# If slow locally, issue is not Tailscale
```

### Issue: High CPU usage

**Symptom**: Tailscale or Caddy using high CPU

**Diagnosis**:
```bash
# Check Tailscale CPU
top | grep tailscale

# Check Caddy CPU
docker stats chronicle-caddy
```

**Solution**:

**If Tailscale high**:
- Usually temporary during connection establishment
- Check for continuous reconnection (log loop)
- Restart Tailscale: `sudo tailscale down && sudo tailscale up`

**If Caddy high**:
- Check for request loop
- Check logs for errors
- Ensure no infinite redirect loop

---

## Error Messages

### "Failed to connect to https://hostname/dev/"

**Possible causes**:
1. Tailscale not running on client
2. Tailscale not running on server
3. tailscale serve not configured
4. Caddy not running (if using Caddy mode)

**Solution checklist**:
```bash
# On server
tailscale status          # Should show connected
tailscale serve status    # Should show routes
docker ps | grep caddy    # Should show running (if Caddy mode)

# On client
tailscale status          # Should show server in list
```

### "SSL_ERROR_BAD_CERT_DOMAIN"

**Cause**: Certificate doesn't match hostname

**Solution**:
```bash
# Ensure certificate matches hostname
# Certificate: hostname.tail12345.ts.net
# Accessing:   https://hostname.tail12345.ts.net/

# Re-provision if needed
tailscale cert hostname.tail12345.ts.net
mv *.crt *.key certs/
```

### "502 Bad Gateway"

**Cause**: Caddy can't reach backend container

**Diagnosis**:
```bash
# Check backend is running
docker ps | grep backend

# Check backend health
curl http://localhost:8000/health

# Check Docker network
docker network inspect chronicle-network
```

**Solution**:
```bash
# Restart backend
docker compose -f compose/your-env.yml restart backend

# Restart Caddy
docker compose -f compose/caddy.yml restart

# Check logs
docker compose -f compose/your-env.yml logs backend
docker compose -f compose/caddy.yml logs
```

### "ERR_CONNECTION_REFUSED"

**Cause**: Service not running or wrong port

**Diagnosis**:
```bash
# Check what's listening on expected ports
sudo lsof -i :443    # Caddy or tailscale serve
sudo lsof -i :8000   # Backend
sudo lsof -i :3010   # Frontend
```

**Solution**:
```bash
# Start missing service
./start-env.sh dev
docker compose -f compose/caddy.yml up -d

# Configure tailscale serve
tailscale serve https:443 http://localhost:443
```

---

## Advanced Debugging

### Enable Debug Logging

**Tailscale**:
```bash
# Verbose logging
sudo tailscaled --verbose=2

# Or check logs
sudo journalctl -u tailscaled -f
```

**Caddy**:
```
# Add to Caddyfile
{
    debug
    log {
        output file /var/log/caddy/debug.log
        level DEBUG
    }
}
```

### Network Packet Capture

**Capture Tailscale traffic**:
```bash
# Capture on Tailscale interface
sudo tcpdump -i tailscale0 -w tailscale-capture.pcap

# Analyze with Wireshark
wireshark tailscale-capture.pcap
```

### Test Individual Components

**Test Tailscale directly**:
```bash
# From another device on Tailscale network
curl -k https://hostname.tail12345.ts.net/health
```

**Test backend directly**:
```bash
# Bypass Caddy
curl http://localhost:8000/health
```

**Test Caddy directly**:
```bash
# From localhost
curl -k https://localhost:443/dev/health
```

**Test container connectivity**:
```bash
# From Caddy container
docker exec -it chronicle-caddy /bin/sh
wget -O- http://friend-lite-dev-backend-1:8000/health
```

---

## Getting Help

If issues persist after trying solutions above:

**1. Gather Information**:
```bash
# Run diagnostic script
./diagnose.sh > diagnostics.txt 2>&1

# Collect logs
tailscale status > tailscale-status.txt
docker compose -f compose/caddy.yml logs > caddy-logs.txt
docker ps -a > containers.txt
```

**2. Check Resources**:
- Tailscale Documentation: https://tailscale.com/kb/
- Caddy Documentation: https://caddyserver.com/docs/
- Friend-Lite Issues: https://github.com/BasedHardware/Friend/issues

**3. Ask for Help**:
- Include diagnostic output
- Describe what you expected vs what happened
- Share relevant configuration (redact sensitive info!)

---

## Prevention Tips

**Best Practices**:
1. ✅ Keep Tailscale updated
2. ✅ Backup `.env.secrets` and `config-docker.env`
3. ✅ Document custom changes to Caddyfile
4. ✅ Test in dev environment before prod
5. ✅ Monitor Caddy logs for errors
6. ✅ Use same Tailscale account on all devices

**Common Mistakes to Avoid**:
- ❌ Editing generated Caddyfile manually
- ❌ Forgetting to restart Caddy after config changes
- ❌ Not running `tailscale serve` after configuring Caddy
- ❌ Using different Tailscale accounts on devices
- ❌ Committing certificates to git
- ❌ Skipping certificate provisioning

---

**Most issues can be resolved by**: Restarting Tailscale, regenerating Caddyfile, or re-provisioning certificates! 🚀
