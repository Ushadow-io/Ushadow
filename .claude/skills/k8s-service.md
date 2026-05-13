---
name: k8s-service
description: Deploy a new service or namespace to the chakra Kubernetes cluster. Use when asked to "add a service", "deploy X to k8s", "create a namespace", "wire up network policies", "how do I expose a service", or "how do I deploy code to k8s".
---

## Overview

The chakra cluster enforces a **deny-all + explicit-allow** NetworkPolicy model via Calico CNI.
Every new namespace must be bootstrapped before pods can reach anything (DNS, postgres, casdoor, internet).

Infrastructure services use **label-based access** — label a namespace once to unlock a service for everything inside it.
App-specific traffic (frontend→backend, backend→external) lives in **policies you co-locate with your manifests**.

**Cluster details:** registry `anubis:32000`, kube context `anubis`, tailnet `spangled-kettle.ts.net`.

---

## 1 — Bootstrap the namespace

```bash
make ns-init NS=myapp
```

This applies four policies automatically:
- `deny-all` — default deny ingress+egress
- `allow-dns` — egress to kube-dns on port 53
- `allow-nginx-ingress` — ingress from both `ingress-nginx` **and** `tailscale-system` namespaces
- `allow-casdoor-egress` — egress to casdoor in the `root` namespace on port 8000

> `tailscale-system` is already covered by the baseline `allow-nginx-ingress` policy — no extra policy needed for Tailscale ingress traffic.

---

## 2 — Add app-specific policies alongside your manifests

Put policy files next to your deployment YAML so `kubectl apply -f k8s/` handles everything.

### Frontend → Backend

```yaml
# k8s/network-policy-frontend-to-backend.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  namespace: myapp
spec:
  podSelector:
    matchLabels:
      app: myapp-backend
  policyTypes: [Ingress]
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: myapp-frontend
    ports:
    - protocol: TCP
      port: 8080   # backend container port
```

### Backend → Postgres (label-based, no IP needed)

Covered by `POSTGRES=true` on the namespace — no extra policy file required.

### Backend → External Internet

```yaml
# k8s/network-policy-backend-egress.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-backend-egress
  namespace: myapp
spec:
  podSelector:
    matchLabels:
      app: myapp-backend
  policyTypes: [Egress]
  egress:
  - to:
    - ipBlock:
        cidr: 0.0.0.0/0
        except:
        - 10.0.0.0/8
        - 172.16.0.0/12
        - 192.168.0.0/16
    ports:
    - protocol: TCP
      port: 443
```

---

## 3 — Expose the service

### Internal cluster traffic (other pods)

Nothing extra — ClusterIP + the allow policies above are sufficient.

### Via nginx ingress (HTTP/HTTPS, .chakra domain)

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp
  namespace: myapp
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
  - host: myapp.chakra
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: myapp-frontend
            port:
              number: 80
```

### Via Tailscale — tailnet access (private, recommended default)

Accessible only to devices on your Tailscale network. Auto-TLS via Tailscale PKI. Uses the shared `ushadow-proxies` proxy pool (no extra proxy pod per service).

```yaml
# k8s/ingress-ts.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ts
  namespace: myapp
  annotations:
    tailscale.com/proxy-group: ushadow-proxies   # shared proxy pool — no extra pod
spec:
  ingressClassName: tailscale
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: myapp
                port:
                  number: 80
  tls:
    - hosts:
        - myapp    # becomes myapp.spangled-kettle.ts.net with auto TLS
```

### Via Tailscale Funnel — public internet (use intentionally)

> **Warning:** Funnel exposes the service to anyone on the internet with no auth gate. Only use for services that have their own authentication (e.g. OAuth-gated frontends).

```yaml
# k8s/ingress-ts-funnel.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ts-funnel
  namespace: myapp
  annotations:
    tailscale.com/funnel: "true"                 # PUBLIC — open to internet
    tailscale.com/proxy-group: ushadow-proxies
spec:
  ingressClassName: tailscale
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: myapp
                port:
                  number: 80
  tls:
    - hosts:
        - myapp
```

> **Tailnet vs Funnel:**
> - `proxy-group: ushadow-proxies` alone → tailnet-only (private, requires Tailscale membership)
> - `tailscale.com/funnel: "true"` + proxy-group → public internet, no auth gate
>
> The cluster default and policy is tailnet-only. Remove the funnel annotation when in doubt.

---

## 4 — Namespace labels to know

| Label | Effect |
|---|---|
| `postgres-access=true` | Postgres NetworkPolicy allows ingress from this namespace |
| `name=<namespace>` | Used by some policies' namespaceSelector — MicroK8s does not auto-add this |

Apply via `make ns-init` (handles both) or manually:
```bash
kubectl label namespace myapp name=myapp postgres-access=true
```

---

## 5 — Connecting to shared infrastructure

Cross-namespace DNS pattern: `<service>.<namespace>.svc.cluster.local:<port>`

| Service | Namespace | Port(s) | Connection string |
|---------|-----------|---------|-------------------|
| PostgreSQL | root | 5432 | `postgres-postgresql.root.svc.cluster.local:5432` |
| Redis | root | 6379 | `redis.root.svc.cluster.local:6379` |
| Neo4j HTTP | root | 7474 | `neo4j-mem0.root.svc.cluster.local:7474` |
| Neo4j Bolt | root | 7687 | `neo4j-mem0.root.svc.cluster.local:7687` |
| Qdrant | root | 6333 | `qdrant.root.svc.cluster.local:6333` |
| Ollama | chakra-sacral | 11434 | `ollama.chakra-sacral.svc.cluster.local:11434` |
| MongoDB | ushadow | 27017 | `mongo.ushadow.svc.cluster.local:27017` (ushadow ns only) |
| Casdoor (auth) | root | 8000 | `casdoor.root.svc.cluster.local:8000` |

**Access is granted via pod labels — add these to your pod template's `labels:` block:**

```yaml
# Grant only the access each pod actually needs:
access-postgres: "true"   # postgres-postgresql.root:5432
access-redis: "true"      # redis.root:6379
access-neo4j: "true"      # neo4j-mem0.root:7687 (bolt)
access-qdrant: "true"     # qdrant.root:6333
access-ollama: "true"     # ollama.chakra-sacral:11434
```

Central ingress policies on each service select `namespaceSelector: {}` + the pod label — so only labelled pods can connect, regardless of which namespace they live in. A compromised frontend pod with no access labels cannot reach any database even if it's on the same node.

**MongoDB** — deployed in `ushadow` namespace only; not a shared cluster service.

**You also need an egress policy** in your namespace for each service you connect to (deny-all blocks outbound too). Template:
```yaml
# k8s/netpol-egress-postgres.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-backend-to-postgres
  namespace: myapp
spec:
  podSelector:
    matchLabels:
      app: myapp-backend
  policyTypes: [Egress]
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: root
      podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
```

---

## 6 — Deploy your app

**Cluster registry:** `anubis:32000`  **Kube context:** `anubis`

### A. Skaffold (recommended — for apps you build and deploy)

Chakra uses a single root `skaffold.yaml` with one profile per service. Add a profile block:

```yaml
# Append to /repos/chakra/skaffold.yaml under profiles:

  # Helm chart deploy (most services)
  - name: myapp
    build:
      local:
        push: true
        useDockerCLI: true
      artifacts:
        - image: anubis:32000/myapp
          context: chakra-myns/myapp
          docker:
            dockerfile: Dockerfile
    deploy:
      kubeContext: anubis
      helm:
        releases:
          - name: myapp
            chartPath: chakra-myns/charts/myapp
            namespace: myns
            valuesFiles:
              - chakra-myns/charts/myapp/values.yaml
            setValueTemplates:
              image.repository: "{{.IMAGE_REPO_anubis_32000_myapp}}"
              image.tag: "{{.IMAGE_TAG_anubis_32000_myapp}}"

  # Plain manifests deploy (kubectl apply via kustomize)
  - name: myapp-plain
    build:
      local:
        push: true
        useDockerCLI: true
      artifacts:
        - image: anubis:32000/myapp
          context: chakra-myns/myapp
          docker:
            dockerfile: Dockerfile
    manifests:
      kustomize:
        paths:
          - chakra-myns/myapp/k8s
    deploy:
      kubeContext: anubis
      kubectl: {}
```

**kustomization.yaml rules:**
```yaml
# chakra-myns/myapp/k8s/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: myns
resources:
  - deployment.yaml
  - service.yaml
  - ingress.yaml
  # DO NOT include namespace.yaml — managed by make ns-init
  # DO NOT include PVCs — manage them separately so skaffold delete never wipes persistent data
```

**Commands:**
```bash
skaffold run -p myapp           # build → push to anubis:32000 → deploy
skaffold run -p myapp --tail    # same, then stream logs
skaffold dev  -p myapp          # build → deploy → watch source → hot-reload + port-forward
skaffold delete -p myapp        # remove from cluster
```

### B. Plain kubectl (static manifests, no build step)

```bash
kubectl apply -f k8s/
kubectl delete -f k8s/ --ignore-not-found
kubectl rollout restart deploy/myapp -n myns   # after a manual image push
```

### C. Helm only (chart with no custom image)

```bash
helm upgrade --install myapp ./charts/myapp -n myns -f values.yaml
helm uninstall myapp -n myns
```

---

## 7 — Checklist for a new service

- [ ] `make ns-init NS=myapp`
- [ ] Deployment + Service YAML in `k8s/` or Helm chart
- [ ] App-specific NetworkPolicy files (frontend↔backend, external egress, shared service egress)
- [ ] Ingress YAML — nginx (`myapp.chakra`) and/or Tailscale (`proxy-group: ushadow-proxies` + `tls` block)
- [ ] Add skaffold profile to root `skaffold.yaml`
- [ ] `skaffold run -p myapp` or `kubectl apply -f k8s/`

---

## 8 — Operational commands

```bash
# Tail logs
kubectl logs -n myapp deploy/myapp -f --tail=100

# Open a shell in a running pod
kubectl exec -n myapp -it deploy/myapp -- sh

# Port-forward a service to localhost
kubectl port-forward -n myapp svc/myapp 8080:80

# Check pod events (OOMKill, probe failures, image pull errors)
kubectl describe pod -n myapp -l app=myapp

# List all ingresses and their assigned hostnames
kubectl get ingress -A

# Check whether a Tailscale ingress got a hostname
kubectl get ingress -n myapp myapp-ts -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'

# mise shortcuts (run from chakra root)
mise run deploy:k8s-run myapp            # skaffold run -p myapp
mise run deploy:k8s-dev myapp            # skaffold dev -p myapp
mise run deploy:k8s-delete myapp         # skaffold delete -p myapp
mise run deploy:k8s-logs myns myapp      # kubectl logs -n myns deploy/myapp -f
mise run deploy:k8s-status myns          # kubectl get pods,ingress -n myns

# Port-forward to shared services
kubectl port-forward -n root          svc/postgres-postgresql 5432:5432
kubectl port-forward -n root          svc/redis               6379:6379
kubectl port-forward -n root          svc/neo4j-mem0          7474:7474
kubectl port-forward -n chakra-sacral svc/ollama              11434:11434
```

---

## 9 — Debugging policy issues

```bash
# Is the pod reaching DNS?
kubectl exec -n myapp deploy/myapp -- nslookup kubernetes.default

# Does a specific connection work?
kubectl exec -n myapp deploy/myapp-backend -- curl -sv http://postgres-postgresql.root.svc.cluster.local:5432

# Show all policies in a namespace
kubectl get networkpolicy -n myapp

# Calico policy evaluation order
# Note: Calico sees pod IPs after kube-proxy DNAT — use pod CIDRs (10.1.x.x), not ClusterIPs, in ipBlock rules
```
