#!/usr/bin/env python3
"""
Force fresh Chronicle image pull in Kubernetes.

Deletes all Chronicle pods to force the deployment to recreate them
with imagePullPolicy: Always, ensuring a fresh image pull.
"""
import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent / "ushadow" / "backend"))

from src.services.kubernetes_manager import KubernetesManager
from motor.motor_asyncio import AsyncIOMotorClient
import os


async def main():
    cluster_id = "003fd5798ebbea9f"
    namespace = "ushadow"

    # Connect to MongoDB
    mongo_uri = os.environ.get("MONGODB_URI", "mongodb://mongo:27017")
    mongo_db = os.environ.get("MONGODB_DATABASE", "ushadow_purple")
    client = AsyncIOMotorClient(mongo_uri)
    db = client[mongo_db]

    # Initialize K8s manager
    km = KubernetesManager(db)

    print(f"🔍 Checking Chronicle pods in cluster {cluster_id}, namespace {namespace}...")

    try:
        # Get pods
        pods = await km.list_pods(cluster_id, namespace)
        chronicle_pods = [p for p in pods if 'chronicle' in p['name'].lower()]

        if not chronicle_pods:
            print("ℹ️  No Chronicle pods found.")
            return

        print(f"\n📋 Found {len(chronicle_pods)} Chronicle pod(s):")
        for pod in chronicle_pods:
            print(f"  • {pod['name']} - {pod['status']}")

        # Get API client
        core_api, _ = km._get_kube_client(cluster_id)

        print(f"\n🗑️  Deleting pods to force fresh image pull...")
        for pod in chronicle_pods:
            pod_name = pod['name']
            core_api.delete_namespaced_pod(name=pod_name, namespace=namespace)
            print(f"  ✓ Deleted {pod_name}")

        print(f"\n✅ Done! Kubernetes will now recreate the pods with imagePullPolicy: Always")
        print(f"   This will force a fresh pull of: ghcr.io/ushadow-io/chronicle/backend:nodeps1")
        print(f"\n💡 Check pod status with: kubectl get pods -n {namespace}")

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
