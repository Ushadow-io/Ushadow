#!/bin/bash
# Quick IPv6 test - run this after making changes to verify if issue is fixed

echo "Quick IPv6 Test - Testing all nodes..."
echo ""

for node in ra babel anubis; do
    echo "[$node] Testing..."
    result=$(kubectl exec ipv6-test-$node -- sh -c '
        # Test IPv6 HTTPS with hostname (pypi.org)
        if curl -6 --connect-timeout 3 -I "https://pypi.org/simple/" 2>&1 | grep -q "HTTP/2"; then
            https="✓"
        else
            https="✗"
        fi

        # Test IPv4 HTTPS for comparison
        if curl -4 --connect-timeout 3 -I "https://pypi.org/simple/" 2>&1 | grep -q "HTTP/2"; then
            ipv4="✓"
        else
            ipv4="✗"
        fi

        echo "IPv6:$https IPv4:$ipv4"
    ' 2>&1 | tail -1)
    echo "[$node] $result"
done

echo ""
echo "Legend: ✓ = Working, ✗ = Broken"
echo "Expected when working: IPv6:✓ IPv4:✓"
