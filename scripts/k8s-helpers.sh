#!/bin/bash
# Kubernetes Helper Scripts for Ushadow
# Common operations for managing Ushadow on Kubernetes

set -e

NAMESPACE="${NAMESPACE:-ushadow}"
K8S_DIR="${K8S_DIR:-k8s}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_info() { echo -e "${BLUE}ℹ${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }

# Function to check cluster connection
check_cluster() {
    print_info "Checking Kubernetes cluster connection..."
    if kubectl cluster-info &> /dev/null; then
        print_success "Connected to cluster: $(kubectl config current-context)"
    else
        print_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
}

# Function to deploy infrastructure only
deploy_infra() {
    print_info "Deploying infrastructure services (MongoDB, Redis, etc.)..."
    kubectl apply -f "${K8S_DIR}/namespace.yaml"
    kubectl apply -f "${K8S_DIR}/infra/" -n "${NAMESPACE}"
    print_success "Infrastructure deployed"
}

# Function to deploy application only
deploy_app() {
    print_info "Deploying application services (backend, frontend)..."
    kubectl apply -f "${K8S_DIR}/namespace.yaml"
    kubectl apply -f "${K8S_DIR}/configmap.yaml"
    kubectl apply -f "${K8S_DIR}/secret.yaml"
    kubectl apply -f "${K8S_DIR}/base/" -n "${NAMESPACE}"
    print_success "Application deployed"
}

# Function to deploy everything
deploy_all() {
    print_info "Deploying all services..."
    kubectl apply -k "${K8S_DIR}/"
    print_success "All services deployed"
}

# Function to get status
get_status() {
    print_info "Getting status of all resources in namespace ${NAMESPACE}..."
    echo ""
    kubectl get all -n "${NAMESPACE}"
    echo ""
    print_info "Persistent Volume Claims:"
    kubectl get pvc -n "${NAMESPACE}"
}

# Function to get logs
get_logs() {
    local service=$1
    if [ -z "$service" ]; then
        print_error "Usage: $0 logs <service-name>"
        echo "Available services:"
        kubectl get pods -n "${NAMESPACE}" -o jsonpath='{.items[*].metadata.labels.app}' | tr ' ' '\n' | sort -u
        exit 1
    fi

    print_info "Getting logs for ${service}..."
    kubectl logs -n "${NAMESPACE}" -l app="${service}" --tail=100 -f
}

# Function to restart a service
restart_service() {
    local service=$1
    if [ -z "$service" ]; then
        print_error "Usage: $0 restart <service-name>"
        exit 1
    fi

    print_info "Restarting ${service}..."
    kubectl rollout restart deployment/"${service}" -n "${NAMESPACE}"
    print_success "Restart initiated for ${service}"
}

# Function to scale a service
scale_service() {
    local service=$1
    local replicas=$2

    if [ -z "$service" ] || [ -z "$replicas" ]; then
        print_error "Usage: $0 scale <service-name> <replicas>"
        exit 1
    fi

    print_info "Scaling ${service} to ${replicas} replicas..."
    kubectl scale deployment/"${service}" --replicas="${replicas}" -n "${NAMESPACE}"
    print_success "Scaled ${service} to ${replicas} replicas"
}

# Function to port-forward to a service
port_forward() {
    local service=$1
    local port=$2

    if [ -z "$service" ] || [ -z "$port" ]; then
        print_error "Usage: $0 port-forward <service-name> <local-port:remote-port>"
        echo "Example: $0 port-forward backend 8000:8000"
        exit 1
    fi

    print_info "Port forwarding ${service} on ${port}..."
    kubectl port-forward -n "${NAMESPACE}" "svc/${service}" "${port}"
}

# Function to delete all resources
delete_all() {
    print_warning "This will delete ALL resources in namespace ${NAMESPACE}"
    read -p "Are you sure? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        print_info "Deletion cancelled"
        exit 0
    fi

    print_info "Deleting all resources..."
    kubectl delete namespace "${NAMESPACE}"
    print_success "All resources deleted"
}

# Function to create a secret from .env file
create_secret_from_env() {
    if [ ! -f .env ]; then
        print_error ".env file not found"
        exit 1
    fi

    print_info "Creating secret from .env file..."
    kubectl create secret generic ushadow-env-secret \
        --from-env-file=.env \
        -n "${NAMESPACE}" \
        --dry-run=client -o yaml | kubectl apply -f -

    print_success "Secret created from .env"
}

# Function to execute command in a pod
exec_pod() {
    local service=$1
    shift
    local cmd="$@"

    if [ -z "$service" ]; then
        print_error "Usage: $0 exec <service-name> <command>"
        echo "Example: $0 exec backend bash"
        exit 1
    fi

    local pod=$(kubectl get pods -n "${NAMESPACE}" -l app="${service}" -o jsonpath='{.items[0].metadata.name}')

    if [ -z "$pod" ]; then
        print_error "No pod found for service ${service}"
        exit 1
    fi

    print_info "Executing in pod ${pod}..."
    kubectl exec -it -n "${NAMESPACE}" "${pod}" -- ${cmd}
}

# Main menu
show_menu() {
    echo ""
    echo "╔════════════════════════════════════════════╗"
    echo "║     Ushadow Kubernetes Helper Scripts     ║"
    echo "╚════════════════════════════════════════════╝"
    echo ""
    echo "Usage: $0 <command> [args]"
    echo ""
    echo "Commands:"
    echo "  deploy-infra          Deploy infrastructure only"
    echo "  deploy-app            Deploy application only"
    echo "  deploy-all            Deploy everything"
    echo "  status                Get status of all resources"
    echo "  logs <service>        Tail logs for a service"
    echo "  restart <service>     Restart a service"
    echo "  scale <svc> <count>   Scale a service"
    echo "  port-forward <svc> <port>  Port forward to service"
    echo "  exec <svc> <cmd>      Execute command in pod"
    echo "  create-secret         Create secret from .env file"
    echo "  delete-all            Delete all resources (careful!)"
    echo ""
    echo "Environment Variables:"
    echo "  NAMESPACE=${NAMESPACE}"
    echo "  K8S_DIR=${K8S_DIR}"
    echo ""
}

# Main command dispatcher
main() {
    local command=$1
    shift || true

    case "$command" in
        check)
            check_cluster
            ;;
        deploy-infra)
            check_cluster
            deploy_infra
            ;;
        deploy-app)
            check_cluster
            deploy_app
            ;;
        deploy-all)
            check_cluster
            deploy_all
            ;;
        status)
            check_cluster
            get_status
            ;;
        logs)
            check_cluster
            get_logs "$@"
            ;;
        restart)
            check_cluster
            restart_service "$@"
            ;;
        scale)
            check_cluster
            scale_service "$@"
            ;;
        port-forward)
            check_cluster
            port_forward "$@"
            ;;
        exec)
            check_cluster
            exec_pod "$@"
            ;;
        create-secret)
            check_cluster
            create_secret_from_env
            ;;
        delete-all)
            check_cluster
            delete_all
            ;;
        *)
            show_menu
            exit 1
            ;;
    esac
}

main "$@"
