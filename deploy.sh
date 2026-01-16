#!/bin/bash
# Ushadow Kubernetes Deployment Script
# Converts Docker Compose to Kubernetes manifests using kompose
# and applies production-ready adjustments

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
K8S_DIR="k8s"
NAMESPACE="ushadow"
ENV_NAME="${ENV_NAME:-purple}"

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Function to check if kompose is installed
check_kompose() {
    if ! command -v kompose &> /dev/null; then
        print_error "kompose is not installed!"
        echo ""
        echo "Install kompose:"
        echo "  macOS:   brew install kompose"
        echo "  Linux:   curl -L https://github.com/kubernetes/kompose/releases/download/v1.34.0/kompose-linux-amd64 -o kompose && chmod +x kompose && sudo mv kompose /usr/local/bin/"
        echo "  Windows: choco install kubernetes-kompose"
        echo ""
        echo "Or download from: https://github.com/kubernetes/kompose/releases"
        exit 1
    fi
    print_success "kompose is installed ($(kompose version))"
}

# Function to check if kubectl is installed
check_kubectl() {
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl is not installed!"
        echo ""
        echo "Install kubectl: https://kubernetes.io/docs/tasks/tools/"
        exit 1
    fi
    print_success "kubectl is installed ($(kubectl version --client -o yaml | grep gitVersion | head -1 | awk '{print $2}'))"
}

# Function to clean up old k8s manifests
clean_k8s_dir() {
    print_info "Cleaning up old Kubernetes manifests..."
    rm -rf "${K8S_DIR}"
    mkdir -p "${K8S_DIR}"/{infra,base,tweaks}
    print_success "Created fresh k8s directory structure"
}

# Function to convert infrastructure services
convert_infra() {
    print_info "Converting infrastructure services (MongoDB, Redis, Qdrant, etc.)..."

    # Create a temporary infrastructure compose file without profiles
    # Kompose doesn't handle profiles well, so we create a flat version
    cat > /tmp/ushadow-infra.yml <<EOF
name: infra

services:
  mongo:
    image: mongo:8.0
    container_name: mongo
    ports:
      - "27017:27017"
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: redis
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    restart: unless-stopped

  qdrant:
    image: qdrant/qdrant:latest
    container_name: qdrant
    ports:
      - "6333:6333"
      - "6334:6334"
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    container_name: postgres
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=ushadow
      - POSTGRES_PASSWORD=ushadow
      - POSTGRES_DB=ushadow
    restart: unless-stopped
EOF

    # Convert the simplified infrastructure file
    kompose convert \
        -f /tmp/ushadow-infra.yml \
        -o "${K8S_DIR}/infra/" \
        --with-kompose-annotation=false

    # Clean up temp file
    rm -f /tmp/ushadow-infra.yml

    print_success "Infrastructure manifests generated"
}

# Function to convert application services
convert_app() {
    print_info "Converting application services (backend, frontend)..."

    # Create a temporary merged compose file for production
    # This combines base configs with production overrides
    cat > /tmp/ushadow-prod-compose.yml <<EOF
name: ushadow

services:
  backend:
    build:
      context: ./ushadow/backend
      dockerfile: Dockerfile
    container_name: \${COMPOSE_PROJECT_NAME:-ushadow}-backend
    ports:
      - "\${BACKEND_PORT:-8000}:8000"
    environment:
      - HOST=0.0.0.0
      - PORT=8000
      - BACKEND_PORT=\${BACKEND_PORT:-8000}
      - REDIS_URL=redis://redis:6379/\${REDIS_DATABASE:-0}
      - MONGODB_DATABASE=\${MONGODB_DATABASE:-ushadow}
      - CORS_ORIGINS=\${CORS_ORIGINS:-http://localhost:3000}
    restart: unless-stopped

  webui:
    build:
      context: ./ushadow/frontend
      dockerfile: Dockerfile
      args:
        VITE_ENV_NAME: \${VITE_ENV_NAME:-}
        VITE_BACKEND_URL: \${VITE_BACKEND_URL:-}
    container_name: \${COMPOSE_PROJECT_NAME:-ushadow}-webui
    ports:
      - "\${WEBUI_PORT:-3000}:80"
    environment:
      - NODE_ENV=production
      - VITE_BACKEND_URL=\${VITE_BACKEND_URL:-http://localhost:8000}
      - VITE_ENV_NAME=\${VITE_ENV_NAME:-}
    restart: unless-stopped
EOF

    # Convert the merged compose file
    kompose convert \
        -f /tmp/ushadow-prod-compose.yml \
        -o "${K8S_DIR}/base/" \
        --with-kompose-annotation=false

    # Clean up temp file
    rm -f /tmp/ushadow-prod-compose.yml

    print_success "Application manifests generated"
}

# Function to create namespace manifest
create_namespace() {
    print_info "Creating namespace manifest..."

    cat > "${K8S_DIR}/namespace.yaml" <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: ${NAMESPACE}
  labels:
    name: ${NAMESPACE}
    env: ${ENV_NAME}
EOF

    print_success "Namespace manifest created"
}

# Function to create ConfigMap from .env file
create_configmap() {
    print_info "Creating ConfigMap from .env file..."

    if [ ! -f .env ]; then
        print_warning ".env file not found, skipping ConfigMap creation"
        return
    fi

    # Create ConfigMap from .env (excluding sensitive data)
    cat > "${K8S_DIR}/configmap.yaml" <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: ushadow-config
  namespace: ${NAMESPACE}
data:
  ENV_NAME: "${ENV_NAME}"
  # Add other non-sensitive env vars from .env as needed
  # BACKEND_PORT, WEBUI_PORT, etc.
EOF

    print_success "ConfigMap manifest created"
}

# Function to create Secret placeholder
create_secret() {
    print_info "Creating Secret placeholder..."

    cat > "${K8S_DIR}/secret.yaml" <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ushadow-secret
  namespace: ${NAMESPACE}
type: Opaque
stringData:
  # TODO: Add your secrets here or use kubectl create secret
  # Example:
  # MONGODB_URI: "mongodb://mongo:27017/ushadow"
  # REDIS_PASSWORD: "your-redis-password"
  # API_KEYS: "your-api-keys"
EOF

    print_warning "Secret placeholder created - YOU MUST POPULATE THIS MANUALLY"
}

# Function to apply post-conversion tweaks
apply_tweaks() {
    print_info "Applying production-ready tweaks..."

    # Create a script for manual adjustments
    cat > "${K8S_DIR}/tweaks/README.md" <<EOF
# Manual Adjustments Needed

Kompose does a good job, but these adjustments are recommended for production:

## 1. Infrastructure Services - Use StatefulSets

For MongoDB, Redis, Qdrant, PostgreSQL, Neo4j:
- Convert Deployment → StatefulSet
- Add proper volumeClaimTemplates
- Configure podManagementPolicy: Parallel or OrderedReady
- Add headless service for stable network identities

## 2. Persistent Storage

Add StorageClass and PersistentVolumeClaims:
\`\`\`yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mongo-data
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: standard  # or your storage class
\`\`\`

## 3. Resource Limits

Add resource requests and limits to all deployments:
\`\`\`yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
\`\`\`

## 4. Ingress for External Access

Create an Ingress resource (see ingress-example.yaml)

## 5. Network Policies

Add NetworkPolicy for security (optional but recommended)

## 6. ConfigMaps and Secrets

- Move environment variables to ConfigMaps
- Move sensitive data to Secrets
- Use external secret management (e.g., Sealed Secrets, External Secrets Operator)

## Files Generated

- \`infra/\` - Infrastructure services (databases, cache)
- \`base/\` - Application services (backend, frontend)
- \`namespace.yaml\` - Namespace definition
- \`configmap.yaml\` - Configuration data
- \`secret.yaml\` - Secrets (template only)
EOF

    # Create example Ingress
    cat > "${K8S_DIR}/tweaks/ingress-example.yaml" <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ushadow-ingress
  namespace: ${NAMESPACE}
  annotations:
    # nginx.ingress.kubernetes.io/rewrite-target: /
    # cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx  # or your ingress class
  rules:
  - host: ushadow.example.com  # CHANGE THIS
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: webui
            port:
              number: 80
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: backend
            port:
              number: 8000
  # tls:
  # - hosts:
  #   - ushadow.example.com
  #   secretName: ushadow-tls
EOF

    # Create StatefulSet example for MongoDB
    cat > "${K8S_DIR}/tweaks/mongo-statefulset-example.yaml" <<EOF
apiVersion: v1
kind: Service
metadata:
  name: mongo-headless
  namespace: ${NAMESPACE}
spec:
  clusterIP: None
  selector:
    app: mongo
  ports:
  - port: 27017
    name: mongodb
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mongo
  namespace: ${NAMESPACE}
spec:
  serviceName: mongo-headless
  replicas: 1
  selector:
    matchLabels:
      app: mongo
  template:
    metadata:
      labels:
        app: mongo
    spec:
      containers:
      - name: mongo
        image: mongo:8.0
        ports:
        - containerPort: 27017
          name: mongodb
        volumeMounts:
        - name: mongo-data
          mountPath: /data/db
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
  volumeClaimTemplates:
  - metadata:
      name: mongo-data
    spec:
      accessModes: [ "ReadWriteOnce" ]
      resources:
        requests:
          storage: 10Gi
      # storageClassName: "standard"  # Specify your storage class
EOF

    print_success "Tweak guides and examples created in k8s/tweaks/"
}

# Function to create kustomization.yaml
create_kustomization() {
    print_info "Creating kustomization files..."

    # Base kustomization
    cat > "${K8S_DIR}/kustomization.yaml" <<EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: ${NAMESPACE}

resources:
  - namespace.yaml
  - configmap.yaml
  - secret.yaml
  - infra/
  - base/
  # - tweaks/ingress-example.yaml  # Uncomment when ready

# Add common labels to all resources
commonLabels:
  app: ushadow
  env: ${ENV_NAME}

# Add annotations
commonAnnotations:
  managed-by: kustomize
  deployed-from: docker-compose
EOF

    print_success "Kustomization file created"
}

# Main deployment function
main() {
    echo ""
    echo "╔════════════════════════════════════════════╗"
    echo "║  Ushadow Kubernetes Deployment Generator  ║"
    echo "╔════════════════════════════════════════════╝"
    echo ""

    # Check prerequisites
    check_kompose
    check_kubectl

    echo ""
    print_info "Starting conversion process..."
    echo ""

    # Clean and prepare
    clean_k8s_dir

    # Convert compose files
    convert_infra
    convert_app

    # Create additional manifests
    create_namespace
    create_configmap
    create_secret

    # Apply tweaks and create examples
    apply_tweaks

    # Create kustomization
    create_kustomization

    echo ""
    print_success "Kubernetes manifests generated successfully!"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    print_info "Next steps:"
    echo ""
    echo "  1. Review generated manifests in ${K8S_DIR}/"
    echo "  2. Read ${K8S_DIR}/tweaks/README.md for manual adjustments"
    echo "  3. Update secrets in ${K8S_DIR}/secret.yaml"
    echo "  4. Customize ${K8S_DIR}/tweaks/ingress-example.yaml"
    echo ""
    echo "  Deploy to Kubernetes:"
    echo "    kubectl apply -k ${K8S_DIR}/"
    echo ""
    echo "  Or deploy step by step:"
    echo "    kubectl apply -f ${K8S_DIR}/namespace.yaml"
    echo "    kubectl apply -f ${K8S_DIR}/infra/"
    echo "    kubectl apply -f ${K8S_DIR}/base/"
    echo ""
    print_warning "Review all manifests before applying to production!"
    echo ""
}

# Run main function
main "$@"
