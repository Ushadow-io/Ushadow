#!/usr/bin/env python3
"""
Test script for Kubernetes deployment API.

Tests the deployment flow end-to-end and helps debug issues.
"""

import json
import requests
import sys
from pprint import pprint

# Configuration
BASE_URL = "http://localhost:8400"
CLUSTER_ID = "003fd5798ebbea9f"
SERVICE_ID = "openmemory-compose:mem0-ui"
NAMESPACE = "ushadow"

# Get auth token (adjust as needed)
def get_auth_token():
    """Get authentication token."""
    # For testing, you might need to adjust this based on your auth setup
    # Option 1: Login
    # response = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "...", "password": "..."})
    # return response.json()["access_token"]

    # Option 2: Use existing token
    # return "your-token-here"

    # Option 3: No auth (if auth is disabled for testing)
    return None

def test_get_available_services():
    """Test: Get list of available services."""
    print("\n" + "="*80)
    print("TEST: Get Available Services")
    print("="*80)

    response = requests.get(f"{BASE_URL}/api/kubernetes/services/available")
    print(f"Status: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        services = data.get("services", [])
        print(f"Found {len(services)} services")

        # Find mem0-ui
        mem0_ui = next((s for s in services if s["service_name"] == "mem0-ui"), None)
        if mem0_ui:
            print("\nmem0-ui service:")
            pprint(mem0_ui)
            return mem0_ui
        else:
            print("ERROR: mem0-ui not found in services")
            return None
    else:
        print(f"ERROR: {response.text}")
        return None

def test_get_env_config(service_name):
    """Test: Get environment configuration for service."""
    print("\n" + "="*80)
    print(f"TEST: Get Env Config for {service_name}")
    print("="*80)

    response = requests.get(f"{BASE_URL}/api/services/{service_name}/env")
    print(f"Status: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        print(f"Required env vars: {len(data.get('required_env_vars', []))}")
        print(f"Optional env vars: {len(data.get('optional_env_vars', []))}")
        return data
    else:
        print(f"ERROR: {response.text}")
        return None

def test_create_envmap():
    """Test: Create ConfigMap and Secret."""
    print("\n" + "="*80)
    print("TEST: Create Envmap")
    print("="*80)

    payload = {
        "service_name": "mem0-ui",
        "namespace": NAMESPACE,
        "env_vars": {
            "VITE_API_URL": "8765",
            "API_URL": "http://mem0:8765"
        }
    }

    print("Request payload:")
    pprint(payload)

    response = requests.post(
        f"{BASE_URL}/api/kubernetes/{CLUSTER_ID}/envmap",
        json=payload
    )
    print(f"\nStatus: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        print("Response:")
        pprint(data)
        return data
    else:
        print(f"ERROR: {response.text}")
        return None

def test_deploy_service():
    """Test: Deploy service to Kubernetes."""
    print("\n" + "="*80)
    print("TEST: Deploy Service")
    print("="*80)

    payload = {
        "service_id": SERVICE_ID,
        "namespace": NAMESPACE
    }

    print("Request payload:")
    pprint(payload)

    response = requests.post(
        f"{BASE_URL}/api/kubernetes/{CLUSTER_ID}/deploy",
        json=payload
    )
    print(f"\nStatus: {response.status_code}")
    print("Response:")

    try:
        data = response.json()
        pprint(data)

        if response.status_code == 200:
            print("\n✅ DEPLOYMENT SUCCESSFUL!")
            return True
        else:
            print(f"\n❌ DEPLOYMENT FAILED")
            print(f"Error: {data.get('detail', 'Unknown error')}")
            return False
    except Exception as e:
        print(f"Failed to parse response: {e}")
        print(response.text)
        return False

def check_backend_version():
    """Check if backend has latest code."""
    print("\n" + "="*80)
    print("TEST: Check Backend Code Version")
    print("="*80)

    # Try to deploy and check logs
    print("Checking if image variables are resolved...")
    print("Looking for: image=ghcr.io/ushadow-io/u-mem0-ui:latest (resolved)")
    print("NOT: image=ghcr.io/ushadow-io/u-mem0-ui:${OPENMEMORY_IMAGE_TAG:-latest} (unresolved)")
    print("\nCheck backend logs for 'Service definition:' line")

def main():
    """Run all tests."""
    print("="*80)
    print("Kubernetes Deployment API Test Suite")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Cluster ID: {CLUSTER_ID}")
    print(f"Service ID: {SERVICE_ID}")
    print(f"Namespace: {NAMESPACE}")

    # Test 1: Check backend version
    check_backend_version()

    # Test 2: Get available services
    service = test_get_available_services()
    if not service:
        print("\n❌ Failed to get services")
        sys.exit(1)

    # Test 3: Get env config
    env_config = test_get_env_config("mem0-ui")
    if not env_config:
        print("\n❌ Failed to get env config")
        sys.exit(1)

    # Test 4: Create envmap
    envmap = test_create_envmap()
    if not envmap:
        print("\n❌ Failed to create envmap")
        sys.exit(1)

    # Test 5: Deploy service
    success = test_deploy_service()

    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    if success:
        print("✅ All tests passed - deployment successful!")
        sys.exit(0)
    else:
        print("❌ Deployment failed - check logs above")
        print("\nNext steps:")
        print("1. Check backend logs: docker logs ushadow-purple-backend")
        print("2. Check generated manifest: docker exec ushadow-purple-backend cat /tmp/k8s-manifests/{cluster-id}/ushadow/mem0-ui-deployment.yaml")
        print("3. Check K8s deployment: kubectl get deployments,pods -n ushadow")
        sys.exit(1)

if __name__ == "__main__":
    main()
