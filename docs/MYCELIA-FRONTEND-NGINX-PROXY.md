# Mycelia Frontend nginx Proxy Tweak

## Problem

Fresh browser sessions visiting `mycelia.spangled-kettle.ts.net` (or whatever
your mycelia Tailscale URL is) get redirected to `/setup` and cannot save
tokens. POSTing to the setup form returns a silent 405. Existing browser
sessions with cached auth tokens keep working — masking the bug.

## Root cause

The upstream image `ghcr.io/ushadow-io/mycelia/frontend:latest` ships nginx
with **only** static-file handling. There are no `proxy_pass` rules for
`/api`, `/oauth`, or `/ws`, so the SPA's same-origin API calls fall through
to the static-file handler. nginx's static handler answers `GET`/`HEAD` and
returns **405 Method Not Allowed** for `POST`. That's the 405 you see in the
frontend pod's access log.

Two giveaway signs that this is the bug, not auth/MongoDB/network:
- Old browser windows keep working (cached tokens never trigger the broken
  endpoints).
- Frontend access log shows `POST /oauth/token HTTP/1.1" 405`. nginx 405 ⇒
  the request reached an HTTP server and got an HTTP response — so it's
  config, not network.

## Fix (Option A — same-origin proxy)

`k8s/tweaks/mycelia-frontend-nginx.yaml` adds:
1. A `ConfigMap` (`mycelia-frontend-nginx`) holding a complete `nginx.conf`
   that mirrors the upstream config **plus** `proxy_pass` rules for `/api`,
   `/oauth`, and `/ws` pointing at the in-cluster backend
   `http://mycelia-backend:5173`.
2. A `Deployment` patch that mounts the ConfigMap over
   `/etc/nginx/nginx.conf` via `subPath`.

The SPA continues to make same-origin requests; nginx silently forwards the
ones that should hit the backend. No CORS, no second Tailscale URL, no
mycelia code change.

## Apply

```sh
kubectl apply -f k8s/tweaks/mycelia-frontend-nginx.yaml

kubectl patch deployment mycelia-frontend -n ushadow --type=json -p '[
  {"op": "replace", "path": "/spec/template/spec/volumes",
   "value": [{
     "name": "nginx-conf",
     "configMap": {"name": "mycelia-frontend-nginx",
                   "items": [{"key": "nginx.conf", "path": "nginx.conf"}]}
   }]
  },
  {"op": "replace", "path": "/spec/template/spec/containers/0/volumeMounts",
   "value": [{
     "name": "nginx-conf",
     "mountPath": "/etc/nginx/nginx.conf",
     "subPath": "nginx.conf"
   }]
  }
]'

kubectl rollout restart deployment/mycelia-frontend -n ushadow
```

## Verify

From any pod in the cluster:

```sh
# Was 405; should now be a backend response (400 on empty body is fine)
kubectl exec -n ushadow <any-pod> -- curl -sS -X POST -o /dev/null \
  -w "HTTP %{http_code}\n" \
  http://mycelia-frontend.ushadow.svc.cluster.local:8080/oauth/token

# Was 200 with 454-byte index.html (SPA fallback); should now be real
# backend response (404 if path doesn't exist on backend)
kubectl exec -n ushadow <any-pod> -- curl -sS -o /dev/null \
  -w "HTTP %{http_code}\n" \
  http://mycelia-frontend.ushadow.svc.cluster.local:8080/api/setup

# Should still serve SPA
kubectl exec -n ushadow <any-pod> -- curl -sS -o /dev/null \
  -w "HTTP %{http_code}\n" \
  http://mycelia-frontend.ushadow.svc.cluster.local:8080/
```

End-to-end: open a private/incognito window at the mycelia Tailscale URL and
complete the setup flow.

## Caveat: this tweak is fragile across re-deploys

`k8s/tweaks/` is **not** in `k8s/kustomization.yaml`, and ushadow's
`KubernetesManifestBuilder` doesn't know about this ConfigMap or volume
mount. So:

- A `skaffold dev/run` cycle won't drop the live changes (kustomize doesn't
  manage the deployment patch).
- But if you redeploy `mycelia-frontend` via the **ushadow UI** (Services →
  redeploy), ushadow regenerates the Deployment from scratch and **drops
  the volumeMount**. The ConfigMap survives, but the pod stops mounting it.
  Symptom: 405s return.

Recovery after a ushadow-driven redeploy: re-run the `kubectl patch` block
above, or `kubectl apply` an overlay that re-adds the mount.

## Durable fix (future)

The proper fix is to teach `KubernetesManifestBuilder` to attach this
ConfigMap + mount whenever it deploys a service whose template declares it
needs an nginx-proxy override. Sketch:

1. Add an `nginx_proxy:` key to the `mycelia-frontend` entry in
   `compose/mycelia-compose.yml` listing the backend target.
2. Have the manifest builder generate the ConfigMap + mount alongside the
   Deployment.
3. Drop `k8s/tweaks/mycelia-frontend-nginx.yaml` once that's in place.

Until then, the tweak file is the single source of truth.

## See also

- `compose/mycelia-compose.yml` lines 73-77 — `MYCELIA_BACKEND_INTERNAL_URL`
  was clearly the original intent (envsubst into nginx template) but the
  `:latest` image doesn't honor it.
- `ushadow/backend/src/services/kubernetes/kubernetes_manifest_builder.py` —
  where the durable fix would land.
