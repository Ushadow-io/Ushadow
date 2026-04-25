# Kubernetes recipes

_secrets_k8s := "./config/SECRETS/secrets_k8s.yaml"
_k8s_namespace := "ushadow"

# Apply ushadow-secret to k8s from config/SECRETS/secrets_k8s.yaml (k8s_secret section)
k8s-apply-secret:
    #!/usr/bin/env python3
    import subprocess, sys
    try:
        import yaml
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "pyyaml"], check=True)
        import yaml

    secrets_file = "{{_secrets_k8s}}"
    namespace = "{{_k8s_namespace}}"

    with open(secrets_file) as f:
        data = yaml.safe_load(f)

    k8s_secret = data.get("k8s_secret")
    if not k8s_secret:
        print("ERROR: no k8s_secret section found in", secrets_file, file=sys.stderr)
        sys.exit(1)

    manifest = {
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {"name": "ushadow-secret", "namespace": namespace},
        "type": "Opaque",
        "stringData": {k: str(v) for k, v in k8s_secret.items()},
    }

    proc = subprocess.run(
        ["kubectl", "apply", "-f", "-"],
        input=yaml.dump(manifest),
        text=True,
        capture_output=True,
    )
    print(proc.stdout.strip() or proc.stderr.strip())
    if proc.returncode != 0:
        sys.exit(proc.returncode)
    print("✓ ushadow-secret applied from", secrets_file)
