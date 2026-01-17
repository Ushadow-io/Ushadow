#!/bin/bash
# IPv6 Connectivity Diagnostic Script
# Tests IPv6 functionality in Kubernetes pods to diagnose Calico NAT issues

set -e

echo "=========================================="
echo "IPv6 Connectivity Diagnostic"
echo "=========================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
}

fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
}

warn() {
    echo -e "${YELLOW}⚠ WARN${NC}: $1"
}

# 1. Show pod network configuration
echo "1. Pod Network Configuration"
echo "----------------------------"
hostname
echo ""
echo "IPv4 addresses:"
ip -4 addr show eth0 | grep "inet " || echo "No IPv4"
echo ""
echo "IPv6 addresses:"
ip -6 addr show eth0 | grep "inet6" || echo "No IPv6"
echo ""
echo ""

# 2. Test IPv6 ICMP (ping)
echo "2. IPv6 ICMP Test (ping)"
echo "------------------------"
if ping6 -c 3 -W 2 2001:4860:4860::8888 > /dev/null 2>&1; then
    pass "IPv6 ping to Google DNS (2001:4860:4860::8888)"
else
    fail "IPv6 ping to Google DNS"
fi
echo ""

# 3. Test IPv6 TCP connectivity
echo "3. IPv6 TCP Connectivity"
echo "------------------------"
if command -v nc > /dev/null 2>&1; then
    if timeout 5 nc -6 -zv 2001:4860:4860::8888 443 2>&1 | grep -q succeeded; then
        pass "IPv6 TCP connection to Google DNS port 443"
    else
        fail "IPv6 TCP connection to Google DNS port 443"
    fi
else
    warn "netcat (nc) not available, skipping TCP test"
fi
echo ""

# 4. Test DNS resolution (both A and AAAA)
echo "4. DNS Resolution Test"
echo "----------------------"
if command -v dig > /dev/null 2>&1; then
    echo "A records (IPv4) for pypi.org:"
    dig +short A pypi.org @10.152.183.10 || echo "Failed"
    echo ""
    echo "AAAA records (IPv6) for pypi.org:"
    dig +short AAAA pypi.org @10.152.183.10 || echo "No AAAA records (expected if blocked)"
elif command -v nslookup > /dev/null 2>&1; then
    echo "DNS lookup for pypi.org:"
    nslookup pypi.org || echo "Failed"
else
    warn "dig/nslookup not available, skipping DNS test"
fi
echo ""

# 5. Test IPv6 HTTPS with direct IP (bypass DNS)
echo "5. IPv6 HTTPS Test (Direct IP)"
echo "------------------------------"
if command -v curl > /dev/null 2>&1; then
    # Test Google's public IPv6
    echo "Testing HTTPS to Google IPv6 (2607:f8b0:4004:c07::66):"
    if curl -6 --connect-timeout 5 -I "https://[2607:f8b0:4004:c07::66]/" 2>&1 | grep -q "HTTP/"; then
        pass "IPv6 HTTPS to Google (direct IP)"
    else
        fail "IPv6 HTTPS to Google (direct IP)"
    fi
    echo ""

    # Test Cloudflare IPv6
    echo "Testing HTTPS to Cloudflare IPv6 (2606:4700::6810:85e5):"
    if curl -6 --connect-timeout 5 -I "https://[2606:4700::6810:85e5]/" 2>&1 | grep -q "HTTP/"; then
        pass "IPv6 HTTPS to Cloudflare (direct IP)"
    else
        fail "IPv6 HTTPS to Cloudflare (direct IP)"
    fi
else
    warn "curl not available, skipping HTTPS test"
fi
echo ""

# 6. Test IPv6 HTTPS with hostname (requires DNS)
echo "6. IPv6 HTTPS Test (Hostname)"
echo "-----------------------------"
if command -v curl > /dev/null 2>&1; then
    echo "Testing curl -6 https://www.google.com:"
    if curl -6 --connect-timeout 5 -I "https://www.google.com" 2>&1 | grep -q "HTTP/"; then
        pass "IPv6 HTTPS to www.google.com (hostname)"
    else
        fail "IPv6 HTTPS to www.google.com (hostname) - likely DNS AAAA blocking"
    fi
else
    warn "curl not available"
fi
echo ""

# 7. Test IPv4 for comparison
echo "7. IPv4 Test (for comparison)"
echo "-----------------------------"
if command -v curl > /dev/null 2>&1; then
    echo "Testing curl -4 https://pypi.org/simple/:"
    if curl -4 --connect-timeout 5 -I "https://pypi.org/simple/" 2>&1 | grep -q "HTTP/"; then
        pass "IPv4 HTTPS to pypi.org"
    else
        fail "IPv4 HTTPS to pypi.org"
    fi
else
    warn "curl not available"
fi
echo ""

# 8. Check routing
echo "8. Routing Information"
echo "----------------------"
echo "IPv6 default route:"
ip -6 route | grep default || echo "No IPv6 default route"
echo ""
echo "IPv4 default route:"
ip -4 route | grep default || echo "No IPv4 default route"
echo ""

# 9. Summary
echo "=========================================="
echo "Summary"
echo "=========================================="
echo ""
echo "Expected behavior with Calico IPv6 NAT bug:"
echo "  ✓ IPv6 ICMP (ping) works"
echo "  ✗ IPv6 TCP/HTTPS fails"
echo "  ✓ IPv4 works normally"
echo ""
echo "If IPv6 TCP works, the Calico NAT issue is resolved."
echo "If IPv6 TCP fails, consider per-pod IPv6 disable workaround."
echo ""
