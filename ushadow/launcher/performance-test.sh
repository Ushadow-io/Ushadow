#!/bin/bash
# Performance diagnostic for Ushadow Launcher
# Measures the actual time taken by polling operations

echo "=== Ushadow Launcher Performance Test ==="
echo "This simulates what the app does every 30 seconds"
echo ""

# Test 1: Prerequisites check (6 commands)
echo "📊 Test 1: Prerequisites Check"
time {
  brew --version >/dev/null 2>&1
  docker --version >/dev/null 2>&1
  docker info >/dev/null 2>&1
  git --version >/dev/null 2>&1
  python3 --version >/dev/null 2>&1
  tailscale version >/dev/null 2>&1
}
echo ""

# Test 2: Docker discovery
echo "📊 Test 2: Docker Container Discovery"
time {
  docker ps -a --format "{{.Names}}|{{.Status}}|{{.Ports}}" >/dev/null 2>&1
}
echo ""

# Test 3: Tailscale URL checks (per running backend)
echo "📊 Test 3: Tailscale URL Discovery (per backend)"
# Find running backend containers
backends=$(docker ps --filter "name=ushadow.*backend" --format "{{.Ports}}" 2>/dev/null | grep -oE '[0-9]+' | head -5)
count=0
total_time=0

for port in $backends; do
  if [ -n "$port" ]; then
    count=$((count + 1))
    echo "  Checking backend on port $port..."
    start=$(date +%s%N)
    curl -s --connect-timeout 1 --max-time 2 "http://localhost:$port/api/unodes/leader/info" >/dev/null 2>&1
    end=$(date +%s%N)
    elapsed=$((($end - $start) / 1000000))
    echo "    → ${elapsed}ms"
  fi
done

if [ $count -eq 0 ]; then
  echo "  No running backends found"
else
  echo "  Total: $count backend(s) checked"
fi
echo ""

# Test 4: Full polling cycle
echo "📊 Test 4: Complete Polling Cycle (what happens every 30s)"
echo "Running full cycle..."
time {
  # Prerequisites
  brew --version >/dev/null 2>&1
  docker --version >/dev/null 2>&1
  docker info >/dev/null 2>&1
  git --version >/dev/null 2>&1
  python3 --version >/dev/null 2>&1
  tailscale version >/dev/null 2>&1

  # Discovery
  docker ps -a --format "{{.Names}}|{{.Status}}|{{.Ports}}" >/dev/null 2>&1

  # Tailscale URLs
  for port in $backends; do
    if [ -n "$port" ]; then
      curl -s --connect-timeout 1 --max-time 2 "http://localhost:$port/api/unodes/leader/info" >/dev/null 2>&1
    fi
  done
}
echo ""

echo "=== Summary ==="
echo "The app runs this full cycle every 30 seconds while running."
echo "If the 'real' time is >1s, that's causing UI lag."
echo ""
echo "Recommendations:"
echo "  • Increase polling interval (30s → 60s or 120s)"
echo "  • Cache Tailscale URLs longer (they rarely change)"
echo "  • Make Tailscale checks async/non-blocking"
echo "  • Only poll when app window is focused"
echo "  • Add 'Refresh' button for manual updates"
