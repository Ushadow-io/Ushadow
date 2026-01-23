#!/bin/bash
# Generate Kubernetes manifests for ushadow deployment
# This creates raw K8s YAML that you can apply manually

set -e

NAMESPACE="${NAMESPACE:-ushadow}"
BACKEND_IMAGE="${BACKEND_IMAGE:-ghcr.io/ushadow-io/ushadow/backend:latest}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-ghcr.io/ushadow-io/ushadow/frontend:latest}"
OUTPUT_DIR="${OUTPUT_DIR:-./k8s/ushadow}"

echo "============================================="
echo "Generate Ushadow K8s Manifests"
echo "============================================="
echo ""
echo "Namespace: $NAMESPACE"
echo "Backend Image: $BACKEND_IMAGE"
echo "Frontend Image: $FRONTEND_IMAGE"
echo "Output: $OUTPUT_DIR"
echo ""

mkdir -p "$OUTPUT_DIR"

# Generate namespace
cat > "$OUTPUT_DIR/00-namespace.yaml" <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: $NAMESPACE
  labels:
    app.kubernetes.io/name: ushadow
    app.kubernetes.io/managed-by: kubectl
EOF

# Generate PVC for config files (read-write)
cat > "$OUTPUT_DIR/10-config-pvc.yaml" <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ushadow-config
  namespace: $NAMESPACE
  labels:
    app.kubernetes.io/name: ushadow
spec:
  accessModes:
    - ReadWriteOnce  # Single node read-write
  resources:
    requests:
      storage: 1Gi  # Adjust size as needed
  # Optional: specify storageClass
  # storageClassName: standard
EOF

# Generate init Job to populate config PVC
cat > "$OUTPUT_DIR/12-init-config-job.yaml" <<EOF
# One-time job to initialize config PVC with files from local machine
# Run this manually: kubectl create -f this-file.yaml
#
# Prerequisites:
# 1. Create a ConfigMap with your initial config files:
#    kubectl create configmap ushadow-initial-config \\
#      --from-file=config/config.yml \\
#      --from-file=config/capabilities.yaml \\
#      --from-file=config/feature_flags.yaml \\
#      --from-file=config/wiring.yaml \\
#      --from-file=config/defaults.yml \\
#      -n $NAMESPACE
#
# 2. Then run this job to copy files to PVC
apiVersion: batch/v1
kind: Job
metadata:
  name: ushadow-init-config
  namespace: $NAMESPACE
spec:
  template:
    spec:
      restartPolicy: OnFailure
      containers:
      - name: init
        image: busybox
        command:
        - sh
        - -c
        - |
          echo "Copying config files to PVC..."
          cp -v /init-config/* /config/
          echo "Creating subdirectories..."
          mkdir -p /config/kubeconfigs
          mkdir -p /config/SECRETS
          mkdir -p /config/providers
          echo "Setting permissions..."
          chmod 755 /config
          chmod 700 /config/kubeconfigs
          chmod 700 /config/SECRETS
          echo "Config PVC initialized successfully!"
          ls -la /config/
        volumeMounts:
        - name: config-pvc
          mountPath: /config
        - name: initial-config
          mountPath: /init-config
      volumes:
      - name: config-pvc
        persistentVolumeClaim:
          claimName: ushadow-config
      - name: initial-config
        configMap:
          name: ushadow-initial-config
EOF

# Generate Secret
cat > "$OUTPUT_DIR/15-secret.yaml" <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ushadow-secrets
  namespace: $NAMESPACE
  labels:
    app.kubernetes.io/name: ushadow
type: Opaque
stringData:
  AUTH_SECRET_KEY: "$(openssl rand -hex 32)"
  # Add other secrets as needed
  # ADMIN_PASSWORD: "your-password"
EOF

# Generate Backend Deployment
cat > "$OUTPUT_DIR/20-backend-deployment.yaml" <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ushadow-backend
  namespace: $NAMESPACE
  labels:
    app.kubernetes.io/name: ushadow-backend
    app.kubernetes.io/component: backend
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: ushadow-backend
  template:
    metadata:
      labels:
        app.kubernetes.io/name: ushadow-backend
    spec:
      # Use ClusterFirst for K8s service DNS
      dnsPolicy: ClusterFirst
      # Fix ndots:5 for uv/Rust DNS (see docs/IPV6_DNS_FIX.md)
      dnsConfig:
        options:
          - name: ndots
            value: "1"
      containers:
      - name: backend
        image: $BACKEND_IMAGE
        imagePullPolicy: Always
        ports:
        - name: http
          containerPort: 8000
          protocol: TCP
        env:
        - name: HOST
          value: "0.0.0.0"
        - name: PORT
          value: "8000"
        - name: CONFIG_DIR
          value: "/config"
        - name: REDIS_URL
          value: "redis://redis.root.svc.cluster.local:6379/0"
        - name: MONGODB_URI
          value: "mongodb://mongodb.root.svc.cluster.local:27017/ushadow"
        - name: MONGODB_DATABASE
          value: "ushadow"
        - name: CORS_ORIGINS
          value: "http://ushadow-frontend.$NAMESPACE.svc.cluster.local"
        envFrom:
        - secretRef:
            name: ushadow-secrets
        volumeMounts:
        - name: config
          mountPath: /config
          # NOT read-only - ushadow writes to config (kubeconfigs, service_configs, etc.)
        - name: data
          mountPath: /app/data
        livenessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 20
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 10
          periodSeconds: 5
      volumes:
      - name: config
        persistentVolumeClaim:
          claimName: ushadow-config
      - name: data
        emptyDir: {}
EOF

# Generate Backend Service
cat > "$OUTPUT_DIR/25-backend-service.yaml" <<EOF
apiVersion: v1
kind: Service
metadata:
  name: ushadow-backend
  namespace: $NAMESPACE
  labels:
    app.kubernetes.io/name: ushadow-backend
spec:
  type: ClusterIP
  ports:
  - name: http
    port: 8000
    targetPort: http
    protocol: TCP
  selector:
    app.kubernetes.io/name: ushadow-backend
EOF

# Generate Frontend Deployment
cat > "$OUTPUT_DIR/30-frontend-deployment.yaml" <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ushadow-frontend
  namespace: $NAMESPACE
  labels:
    app.kubernetes.io/name: ushadow-frontend
    app.kubernetes.io/component: frontend
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: ushadow-frontend
  template:
    metadata:
      labels:
        app.kubernetes.io/name: ushadow-frontend
    spec:
      containers:
      - name: frontend
        image: $FRONTEND_IMAGE
        imagePullPolicy: Always
        ports:
        - name: http
          containerPort: 80
          protocol: TCP
        env:
        - name: VITE_BACKEND_URL
          value: "http://ushadow-backend.$NAMESPACE.svc.cluster.local:8000"
        - name: VITE_ENV_NAME
          value: "k8s"
EOF

# Generate Frontend Service
cat > "$OUTPUT_DIR/35-frontend-service.yaml" <<EOF
apiVersion: v1
kind: Service
metadata:
  name: ushadow-frontend
  namespace: $NAMESPACE
  labels:
    app.kubernetes.io/name: ushadow-frontend
spec:
  type: ClusterIP
  ports:
  - name: http
    port: 80
    targetPort: http
    protocol: TCP
  selector:
    app.kubernetes.io/name: ushadow-frontend
EOF

# Generate Ingress (optional)
cat > "$OUTPUT_DIR/40-ingress.yaml" <<EOF
# Optional: Expose ushadow via Ingress
# Uncomment and customize for your ingress controller
#
# apiVersion: networking.k8s.io/v1
# kind: Ingress
# metadata:
#   name: ushadow
#   namespace: $NAMESPACE
#   annotations:
#     # Add your ingress annotations here
#     # nginx.ingress.kubernetes.io/rewrite-target: /
# spec:
#   rules:
#   - host: ushadow.example.com
#     http:
#       paths:
#       - path: /
#         pathType: Prefix
#         backend:
#           service:
#             name: ushadow-frontend
#             port:
#               name: http
#       - path: /api
#         pathType: Prefix
#         backend:
#           service:
#             name: ushadow-backend
#             port:
#               name: http
EOF

echo "✅ Manifests generated in $OUTPUT_DIR/"
echo ""
echo "============================================="
echo "Deployment Steps"
echo "============================================="
echo ""
echo "1. Create namespace and PVC:"
echo "   kubectl apply -f $OUTPUT_DIR/00-namespace.yaml"
echo "   kubectl apply -f $OUTPUT_DIR/10-config-pvc.yaml"
echo ""
echo "2. Initialize config PVC with your local config files:"
echo "   kubectl create configmap ushadow-initial-config \\"
echo "     --from-file=config/config.yml \\"
echo "     --from-file=config/capabilities.yaml \\"
echo "     --from-file=config/feature_flags.yaml \\"
echo "     --from-file=config/wiring.yaml \\"
echo "     --from-file=config/defaults.yml \\"
echo "     -n $NAMESPACE"
echo ""
echo "   kubectl create -f $OUTPUT_DIR/12-init-config-job.yaml"
echo "   kubectl wait --for=condition=complete job/ushadow-init-config -n $NAMESPACE --timeout=60s"
echo ""
echo "3. Create secrets (EDIT FIRST!):"
echo "   vim $OUTPUT_DIR/15-secret.yaml  # Add your AUTH_SECRET_KEY"
echo "   kubectl apply -f $OUTPUT_DIR/15-secret.yaml"
echo ""
echo "4. Deploy backend and frontend:"
echo "   kubectl apply -f $OUTPUT_DIR/20-backend-deployment.yaml"
echo "   kubectl apply -f $OUTPUT_DIR/25-backend-service.yaml"
echo "   kubectl apply -f $OUTPUT_DIR/30-frontend-deployment.yaml"
echo "   kubectl apply -f $OUTPUT_DIR/35-frontend-service.yaml"
echo ""
echo "5. (Optional) Configure Ingress:"
echo "   vim $OUTPUT_DIR/40-ingress.yaml  # Uncomment and configure"
echo "   kubectl apply -f $OUTPUT_DIR/40-ingress.yaml"
echo ""
echo "============================================="
echo "Verification"
echo "============================================="
echo ""
echo "Check init job status:"
echo "  kubectl logs job/ushadow-init-config -n $NAMESPACE"
echo ""
echo "Check deployment:"
echo "  kubectl get pods -n $NAMESPACE"
echo "  kubectl logs -n $NAMESPACE -l app.kubernetes.io/name=ushadow-backend -f"
echo ""
echo "Check config PVC contents:"
echo "  kubectl run -it --rm debug --image=busybox -n $NAMESPACE \\"
echo "    --overrides='{\"spec\":{\"containers\":[{\"name\":\"debug\",\"image\":\"busybox\",\"command\":[\"ls\",\"-la\",\"/config\"],\"volumeMounts\":[{\"name\":\"config\",\"mountPath\":\"/config\"}]}],\"volumes\":[{\"name\":\"config\",\"persistentVolumeClaim\":{\"claimName\":\"ushadow-config\"}}]}}'"
echo ""
echo "Access services:"
echo "  kubectl port-forward -n $NAMESPACE svc/ushadow-backend 8000:8000"
echo "  kubectl port-forward -n $NAMESPACE svc/ushadow-frontend 3000:80"
