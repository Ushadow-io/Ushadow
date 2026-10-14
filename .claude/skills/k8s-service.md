---
name: k8s-service
description: Deploy the current project's service to the shared "chakra" Kubernetes cluster and integrate it with shared infra (postgres, neo4j, redis, qdrant, casdoor). Works from ANY project repo — it operates across two repos plus the live cluster. Use when asked to "add a service", "deploy X to k8s", "move this local service to the cluster", "create a namespace", "wire up network policies", "get DB credentials", "expose a service", or "deploy to k8s".
---

## ⚠ Read this before anything else — the access mechanism is NOT fixed

This cluster's NetworkPolicy mechanism has **drifted at the mechanism level** (not just
renames). Real deploys have observed *all* of these gating styles in use simultaneously
for different shared services:

- namespace-label gated (`namespaceSelector: {postgres-access: "true"}`)
- pod-label gated (`podSelector: {access-mem0: "true"}`)
- per-consumer-namespace policies (`allow-neo4j-from-chakra-3eye` — admits *only* that ns)
- **no cross-namespace access at all** (`ingress: []` → must run your own in-ns copy)

The chakra repo's `deploy/network-policies.yaml` **file is itself drifted from the live
cluster** — do not trust it, the repo tables here, or any prior assumption. **This skill
deliberately contains no authoritative service/label/credential tables.** The only
correct procedure is: read the *live* policy guarding your target service (§2) and
replicate exactly what it requires. The live cluster always wins.

---

## 0 — Orient: two repos + one cluster

Ships via `ushadow-sdk`, runs in **any** project repo. Do not assume cwd is the chakra
infra repo. Three places:

| Place | What it is | What lives there | Reach it via |
|---|---|---|---|
| **Project repo** (cwd) | the service to deploy | `Dockerfile`, source, optionally its chart/`k8s/` | you're here |
| **Chakra infra repo** (`$CHAKRA`) | cluster control plane | `deploy/network-policies.yaml`, `deploy/chakra-ingress.yaml`, `deploy/service-registry.yaml`, `.env-prod`, `sync-secrets-k8s.sh`, `Makefile`, `skaffold.yaml` | locate it (below) |
| **The live cluster** | the running chakra cluster | the **authoritative** Services/Secrets/NetworkPolicies/ConfigMaps | `kubectl` (works anywhere) |

**Rule of thumb:** *discover* against the cluster; *author* cluster-wide changes in
`$CHAKRA` and commit there; keep your service's image + chart in the project repo.

### Locate the chakra infra repo

```bash
CHAKRA=$(for d in ~/repos/chakra ~/chakra ../chakra "$(git -C . rev-parse --show-toplevel 2>/dev/null)"; do
  [ -f "$d/deploy/network-policies.yaml" ] && echo "$d" && break; done)
echo "${CHAKRA:?chakra infra repo not found — clone it, then re-run}"
```

If absent: ask for its path or clone it (`~/repos/chakra`). Without it you can still
discover + `kubectl apply` ad-hoc; cluster-wide changes just won't be version-controlled
until they land in `$CHAKRA`.

### Preflight — identify the cluster by capability, NOT by context name

```bash
kubectl config current-context           # informational only — the NAME varies
# Confirm it IS the chakra cluster by what it contains (names like "anubis",
# "microk8s", "default" are all normal — microk8s is the node distro):
kubectl get ns | grep -Eq '(^|\s)root\b' && kubectl get ns | grep -q 'chakra-' \
  && echo "chakra cluster ✓" || echo "NOT the chakra cluster — ask the user, do NOT switch blindly"
kubectl get ns >/dev/null                # reachability + RBAC
```

Never switch away from a working context just because its name isn't "anubis".

**Stable cluster facts:** image registry `anubis:32000` (build `--platform linux/amd64`,
nodes are amd64), tailnet `spangled-kettle.ts.net`, deny-all NetworkPolicy model (Calico,
both Ingress *and* Egress). These rarely drift; everything about *which service / which
label / which secret key* does — discover it.

> Discovery uses `jq` (always present). `yq` is **not** assumed. A `python3` fallback is
> given for YAML-in-ConfigMap. Each discovery command lists its **expected output shape**
> so you can tell "the cluster really is like this" from "the command failed".

---

## 1 — Bootstrap the namespace

`deny-all` blocks everything (even DNS) until bootstrapped. Helper lives in `$CHAKRA`:

```bash
make -C "$CHAKRA" ns-init NS=myapp
```

Structural and stable — this part you can rely on. It: creates ns `myapp`; labels it
`name=myapp`; applies 4 baseline policies (all `podSelector: {}`):
- `deny-all` — default deny **ingress + egress**
- `allow-dns` — egress to `kube-system` TCP/UDP 53
- `allow-nginx-ingress` — ingress from `ingress-nginx` **and** `tailscale-system`
- `allow-casdoor-egress` — egress to `root` casdoor:8000

Do **not** add any shared-service access here, and do **not** assume which label unlocks
what — that is entirely §2's job, decided from the live cluster. (If `$CHAKRA` is
unavailable: `kubectl create ns` + `kubectl label ns myapp name=myapp` + recreate the 4
trivial policies, but prefer locating the repo.)

---

## 2 — Connect to a shared service: discover the live gate, then mirror it

There is **no table here on purpose.** Follow the procedure.

### Step A — find the policy(ies) actually guarding the target service

```bash
SVC=postgres            # the service you want (postgres|neo4j|redis|qdrant|…)
# Where does it run + what do its pods look like?
kubectl get svc -A | grep -i "$SVC"                 # -> ns, ClusterIP, port(s)
kubectl get pod -A -l app="$SVC" -o wide 2>/dev/null \
  || kubectl get pod -A | grep -i "$SVC"            # confirm the pod label key/value

# Every NetworkPolicy whose podSelector matches that service, with its ingress rules:
kubectl get netpol -A -o json | jq -r --arg svc "$SVC" '
  .items[]
  | select((.spec.podSelector.matchLabels // {} | tostring | test($svc;"i")))
  | "── \(.metadata.namespace)/\(.metadata.name)\n   selects: \(.spec.podSelector.matchLabels)\n   ingress: \(.spec.ingress // "NONE (all ingress denied)")"'
```

*Expected output shape* — one or more blocks like:

```
── root/allow-postgres-from-chakra
   selects: {"app":"postgres"}
   ingress: [{"from":[{"namespaceSelector":{"matchLabels":{"postgres-access":"true"}}}],"ports":[{"port":5432}]}]
```

An empty result, or `ingress: NONE`, or rules that name only *other* namespaces, are all
**valid real states** — not command failures. Interpret per Step B.

### Step B — classify what the live `ingress.from` requires, and do exactly that

| Live rule shape | What it means | Your action |
|---|---|---|
| `namespaceSelector: {matchLabels: {K: V}}` | namespace-label gated | `kubectl label ns <yourns> K=V` (commit the label intent in `$CHAKRA` notes) |
| `podSelector: {matchLabels: {K: V}}` (± `namespaceSelector: {}`) | pod-label gated | add `K: "V"` to your Deployment's `spec.template.metadata.labels` |
| `from:` lists only *other* namespaces (`allow-<svc>-from-<otherns>`) | per-consumer-namespace gating | **add a sibling provider policy** `allow-<svc>-from-<yourns>` in `$CHAKRA/deploy/network-policies.yaml` cloning the existing one for your ns, then apply |
| `ingress: []` / `NONE` / nothing can ever admit your ns | not cross-namespace reachable | **do not** wire to it cross-ns — run your own instance *in your namespace* (§3) |
| `from: [{namespaceSelector: {}, podSelector:{K:V}}]` | label-gated, any ns | label your pod `K: "V"` |

> Existing ≠ "no provider change needed". A long-standing shared service (e.g. neo4j)
> may still gate per-consumer-namespace, so onboarding a *new* consumer namespace
> **requires a new `allow-<svc>-from-<yourns>` provider policy**. Discover; don't assume
> it already admits you.

If you must add a per-namespace provider policy, copy the *existing* sibling verbatim and
change only the consumer ns, so you match whatever mechanism that service really uses:

```bash
kubectl get netpol -n <svc-ns> <existing-allow-svc-from-otherns> -o yaml \
  | yq 'del(.metadata.uid,.metadata.resourceVersion,.metadata.creationTimestamp,.status)' 2>/dev/null \
  || kubectl get netpol -n <svc-ns> <existing> -o json | jq 'del(.metadata.uid,.metadata.resourceVersion,.metadata.creationTimestamp,.status)'
# edit the consumer ns, save into $CHAKRA/deploy/network-policies.yaml, then apply (below)
```

### Step C — you ALWAYS also need the consumer-side egress

`deny-all` blocks *your* egress regardless of the provider's ingress. Add this in
`$CHAKRA/deploy/network-policies.yaml` under your namespace's `### … NAMESPACE ###`
section, ports/target taken from Step A's discovery (do not hardcode):

```yaml
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-myapp-egress-to-<svc>
  namespace: myapp
spec:
  podSelector: { matchLabels: { app: myapp-backend } }   # the consuming pods
  policyTypes: [Egress]
  egress:
  - to:
    - namespaceSelector:
        matchLabels: { kubernetes.io/metadata.name: <svc-namespace-from-step-A> }
    ports:
    - { protocol: TCP, port: <port-from-step-A> }
```

Build the connection string from Step A: `<svc>.<svc-namespace>.svc.cluster.local:<port>`
(verify the exact Service name from the `kubectl get svc` output — neo4j commonly uses
its **bolt** port for clients, not the HTTP port; confirm which port the policy opens).

### Apply & commit

```bash
"$CHAKRA"/deploy/apply-network-policies.sh      # labels namespaces + applies whole file
# or apply only the new docs to avoid unrelated drift:
kubectl apply -f - <<'EOF'
<paste just the new/edited policy docs>
EOF
```
Commit the edits in `$CHAKRA` so they survive the next full apply.

### Catalogue (optional, for orientation only — NOT authoritative)

```bash
kubectl get cm service-registry -n infrastructure -o jsonpath='{.data.registry\.yaml}' 2>/dev/null \
  | python3 -c 'import sys,yaml;d=yaml.safe_load(sys.stdin) or {};print(yaml.safe_dump(d))' \
  || echo "(no registry ConfigMap — rely on Step A live discovery)"
```
Treat its contents as a stale hint at best; Step A on the live cluster overrides it.

---

## 3 — App-to-app traffic *within* your namespace (and in-ns dependencies)

**`deny-all` blocks egress too — including pod-to-pod inside the same namespace.** So
every intra-namespace hop is *also two-sided* (same principle as §2): an **Ingress** rule
on the receiver **and** an **Egress** rule on the sender. Shipping only the Ingress half
(a common mistake) leaves the connection dead — the sender's packets never leave. Both
docs go in `$CHAKRA/deploy/network-policies.yaml`, your namespace's section:

```yaml
---
# Receiver side: backend accepts from frontend
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-myapp-frontend-to-backend
  namespace: myapp
spec:
  podSelector: { matchLabels: { app: myapp-backend } }
  policyTypes: [Ingress]
  ingress:
  - from:
    - podSelector: { matchLabels: { app: myapp-frontend } }
    ports:
    - { protocol: TCP, port: 8080 }   # backend container port
---
# Sender side: frontend may egress to backend — REQUIRED, deny-all blocks this
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-myapp-frontend-egress-to-backend
  namespace: myapp
spec:
  podSelector: { matchLabels: { app: myapp-frontend } }
  policyTypes: [Egress]
  egress:
  - to:
    - podSelector: { matchLabels: { app: myapp-backend } }
    ports:
    - { protocol: TCP, port: 8080 }
```

**This section is also the answer when §2 Step B says a shared service is not
cross-namespace reachable** (`ingress: []` or admits only other namespaces): deploy your
own instance of that dependency (redis, qdrant, …) *inside `myapp`* and wire to it with
the two-sided pair above (client Egress + dependency Ingress), even though they share a
namespace.

Public-internet egress: an `Egress` policy with
`ipBlock: { cidr: 0.0.0.0/0, except: [10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16] }`
on 443.

---

## 4 — Credentials & secrets (discover the keys; never assume names)

```bash
# Secrets that exist in your namespace:
kubectl get secret -n <ns> -o name
# Keys inside one (values stay base64/unread):
kubectl get secret <name> -n <ns> -o json | jq -r '.data | keys[]'
# How an existing consumer wires a credential — copy its proven pattern:
kubectl get deploy -n <ns> -o json \
  | jq -r '.items[].spec.template.spec.containers[].env[]? | select(.valueFrom.secretKeyRef) | "\(.name) <- \(.valueFrom.secretKeyRef.name):\(.valueFrom.secretKeyRef.key)"'
```

*Expected output shape:* a list like `NEO4J_PASSWORD <- 3eye-secrets:NEO4J_AUTH`. Use
**those discovered key names** — the example below is illustrative format only, the real
keys/secret-names come from the commands above.

**Mechanism:** `$CHAKRA/.env-prod` is split by `# ==== SECRETS ====` / `# ==== CONFIG
====` markers. `sync-secrets-k8s.sh` turns the SECRETS block into a plain k8s Secret
(delete-then-recreate). No SealedSecrets/SOPS.

```bash
sed -n '/^# ==== SECRETS ====/,/^# ==== CONFIG ====/p' "$CHAKRA/.env-prod" \
  | grep -E '^[A-Z]' | cut -d= -f1            # key names only, never echo values
"$CHAKRA"/sync-secrets-k8s.sh "$CHAKRA/.env-prod" <secret-name> <namespace>
make -C "$CHAKRA" <chakra>-sync-secrets       # e.g. root-sync-secrets / 3eye-sync-secrets
```

Consume (mem0 pattern — `envFrom` bulk + `valueFrom` per key, with *discovered* names):

```yaml
envFrom:
  - configMapRef: { name: myapp-config }
  - secretRef:    { name: <discovered-secret> }
env:
  - name: NEO4J_PASSWORD
    valueFrom:
      secretKeyRef: { name: <discovered-secret>, key: <discovered-key> }
```

> New credential → add to SECRETS block of `$CHAKRA/.env-prod`, run the matching
> `*-sync-secrets`, commit in `$CHAKRA`. App DB/user on postgres: find the live pod
> (`kubectl get pod -n <pgns> -l app=postgres`), issue each statement as its own exec
> (`CREATE DATABASE` can't run in a txn), create the user before `CREATE DATABASE … OWNER`.

---

## 5 — Expose the service (hostnames)

### nginx ingress — `*.chakra` (tailnet-internal HTTP)

For standard chakra namespaces, **add a host rule to the existing per-namespace Ingress
in `$CHAKRA/deploy/chakra-ingress.yaml`** and commit there. A brand-new isolated app
namespace may instead ship its own Ingress in the project repo:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp
  namespace: myapp
  annotations: { nginx.ingress.kubernetes.io/rewrite-target: / }
spec:
  ingressClassName: nginx
  rules:
  - host: myapp.chakra
    http:
      paths:
      - { path: /, pathType: Prefix, backend: { service: { name: myapp, port: { number: 80 } } } }
```

### Tailscale — `<name>.spangled-kettle.ts.net` (private; recommended default)

```bash
make -C "$CHAKRA" ts-expose SVC=myapp NS=myapp PORT=80
# -> https://myapp.spangled-kettle.ts.net   (shared ushadow-proxies pool)
```

Reproducible Ingress alternative:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ts
  namespace: myapp
  annotations: { tailscale.com/proxy-group: ushadow-proxies }
spec:
  ingressClassName: tailscale
  rules:
    - http: { paths: [ { path: /, pathType: Prefix, backend: { service: { name: myapp, port: { number: 80 } } } } ] }
  tls: [ { hosts: [ myapp ] } ]
```

Helm-Service alternative: annotate the Service `tailscale.com/expose: "true"`,
`tailscale.com/hostname: "myapp"`, `tailscale.com/proxy-group: "ushadow-proxies"`.
**Public internet:** add `tailscale.com/funnel: "true"` — **no auth gate**, only for
self-authenticating services. Default is tailnet-only.

---

## 6 — Where manifests live (two patterns — match existing services)

Image + chart/manifests belong with the service's source. Discover which layout a
*similar* existing service uses (`grep -r <similar-svc> "$CHAKRA"/skaffold.yaml`):

- **In-monorepo** — `chakra-<chakra>/charts/<app>/` (Helm) or `chakra-<chakra>/<app>/k8s/`.
- **External project repo** (your case here) — chart/manifests stay in *your* repo;
  `$CHAKRA` references it via a skaffold profile whose `context:` points at the project
  (often a git submodule under `$CHAKRA`). Match existing external services.

**Cluster-wide assets always live in `$CHAKRA`**, never the project repo:
`deploy/network-policies.yaml`, `deploy/chakra-ingress.yaml`,
`deploy/service-registry.yaml`, `.env-prod`, `skaffold.yaml`.

Namespace purposes (orientation only): `chakra-3eye` memory/cognition, `chakra-heart`
agents, `chakra-crown` MCP/home, `chakra-sacral` LLM/ML, `chakra-throat` audio,
`chakra-plexus` integration, `root` shared infra.

**kustomization.yaml:** list deployment/service/ingress; **never** include
`namespace.yaml` (managed by `ns-init`) or PVCs (so `skaffold delete` can't wipe data).

---

## 7 — Build & deploy

```bash
docker buildx build --platform linux/amd64 -t anubis:32000/myapp:latest --push .
```

Orchestrated by `$CHAKRA/skaffold.yaml` (one profile per service). For an external
project point `context:` at the project path/submodule:

```yaml
  - name: myapp
    build:
      local: { push: true, useDockerCLI: true }
      artifacts:
        - image: anubis:32000/myapp
          context: <path-to-project-or-submodule>
          docker: { dockerfile: Dockerfile }
    deploy:
      kubeContext: <current-context-name>      # NOT hardcoded "anubis" — use the live one
      helm:                                    # or: kubectl: {} + manifests.kustomize
        releases:
          - name: myapp
            chartPath: <chart path>
            namespace: myns
            valuesFiles: [ <values.yaml> ]
            setValueTemplates:
              image.repository: "{{.IMAGE_REPO_anubis_32000_myapp}}"
              image.tag: "{{.IMAGE_TAG_anubis_32000_myapp}}"
```

```bash
( cd "$CHAKRA" && skaffold run -p myapp )       # build -> push -> deploy
( cd "$CHAKRA" && skaffold dev -p myapp )       # + watch/hot-reload
( cd "$CHAKRA" && mise run deploy:k8s-run myapp )   # mise wrappers: k8s-dev/-delete/-logs/-status
```

Without a profile: `docker push` then `helm upgrade --install` / `kubectl apply` /
`kubectl rollout restart deploy/myapp -n myns`.

---

## 8 — End-to-end (a local service → cluster, integrating a DB + a domain)

0. **Orient (§0):** export `$CHAKRA`; confirm the cluster *by capability* (chakra ns exist).
1. **Discover (§2 Step A/B + §4):** for each dependency, read the live policy guarding it
   and classify the gate; resolve FQDN/port and secret keys. Use those, not literals.
2. **Build & push:** `docker buildx build --platform linux/amd64 -t anubis:32000/myapp:latest --push .`
3. **Namespace:** `make -C "$CHAKRA" ns-init NS=<ns>` (idempotent).
4. **Satisfy each gate (§2 Step B):** namespace label *or* pod label *or* a new
   `allow-<svc>-from-<ns>` provider policy *or* (if unreachable) an in-ns instance (§3).
5. **Consumer egress (§2 Step C):** add `allow-myapp-egress-to-<svc>`; apply; commit in `$CHAKRA`.
6. **Credentials (§4):** ensure keys in `.env-prod` SECRETS; `make -C "$CHAKRA" <chakra>-sync-secrets`;
   wire via discovered key names; create app DB/user on the live postgres pod.
7. **Connect** using the FQDN/port from Step A (graph DB via its bolt port).
8. **Domain (§5):** host rule in `$CHAKRA/deploy/chakra-ingress.yaml` and/or `ts-expose`.
9. **Deploy (§7):** skaffold profile in `$CHAKRA/skaffold.yaml`; `skaffold run -p myapp`; verify (§9).

---

## 9 — Verify & debug

```bash
kubectl rollout status deploy/myapp -n myapp
kubectl describe pod -n myapp -l app=myapp           # OOMKill / probe / ImagePull
kubectl logs -n myapp deploy/myapp -f --tail=100
kubectl exec -n myapp deploy/myapp -- nslookup <db-fqdn>     # DNS (proves allow-dns)

# Reachability — NetworkPolicy drops are silent TCP connect HANGS / 504, never 4xx:
kubectl run nettest -n myapp --rm -it --image=curlimages/curl:latest --restart=Never \
  -- curl -sv --max-time 5 telnet://<db-fqdn>:<port>

kubectl get netpol -n myapp
kubectl get ingress -A
kubectl get ingress -n myapp myapp-ts -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

**Most common failure — a pod can't reach a dependency, silently.** In order:
(1) re-run §2 Step A against the live cluster — did the gate change?  (2) did you satisfy
the *actual* gate from Step B (right ns label / pod label / a `from-<yourns>` provider
policy / or it's simply not cross-ns reachable → §3)?  (3) is the consumer-side **egress**
(§2 Step C) present *and applied*?  (4) right port (graph DB bolt, not HTTP)?  (5) Service
FQDN current (`kubectl get svc -A`)?

---

## 10 — Checklist

**Project repo**
- [ ] Image `--platform linux/amd64`, pushed to `anubis:32000`
- [ ] Chart/manifests carry whatever §2 Step B discovery actually required + discovered secret refs

**`$CHAKRA` (commit there)**
- [ ] `make -C "$CHAKRA" ns-init NS=<ns>` if new
- [ ] Per-dependency: the discovered gate satisfied (ns label / pod label / new `allow-<svc>-from-<ns>` / in-ns fallback)
- [ ] Consumer-side egress policy (§2 Step C) added + applied
- [ ] Secrets in `.env-prod` + `make -C "$CHAKRA" <chakra>-sync-secrets`
- [ ] Hostname in `deploy/chakra-ingress.yaml` and/or `ts-expose`
- [ ] Skaffold profile (`context:` → project/submodule; `kubeContext:` = live context name)

**Then**
- [ ] `( cd "$CHAKRA" && skaffold run -p <app> )`, verified per §9 against the live cluster
