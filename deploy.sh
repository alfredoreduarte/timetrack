#!/bin/bash

# TimeTrack Deployment Script for Local Development & Production
# This script automates the deployment process

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.yml"
PROD_COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="docker.env"

# Docker Compose command detection
DOCKER_COMPOSE_CMD=""

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to run docker compose with the correct command
docker_compose() {
    if [ -z "$DOCKER_COMPOSE_CMD" ]; then
        log_error "Docker Compose command not initialized. Call check_requirements first."
        exit 1
    fi

    if [ "$DOCKER_COMPOSE_CMD" = "docker-compose" ]; then
        docker-compose "$@"
    else
        docker compose "$@"
    fi
}

check_requirements() {
    log_info "Checking requirements..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    # Check for docker-compose (legacy) first
    if command -v docker-compose &> /dev/null; then
        DOCKER_COMPOSE_CMD="docker-compose"
        log_info "Found legacy docker-compose command"
    # Check for docker compose plugin
    elif docker compose version &> /dev/null; then
        DOCKER_COMPOSE_CMD="docker compose"
        log_info "Found Docker Compose plugin (docker compose)"
    else
        log_error "Docker Compose is not installed. Please install either:"
        log_error "  - Legacy: docker-compose standalone binary"
        log_error "  - Modern: Docker Compose plugin (docker compose)"
        exit 1
    fi

    log_info "Requirements check passed using: $DOCKER_COMPOSE_CMD"
}

setup_environment() {
    log_info "Setting up environment..."

    if [ ! -f "$ENV_FILE" ]; then
        if [ -f "docker.env.example" ]; then
            cp docker.env.example "$ENV_FILE"
            log_warn "Created $ENV_FILE from example. Please update it with your configuration."
            log_warn "Edit $ENV_FILE and run this script again."
            exit 1
        else
            log_error "No environment file found. Please create $ENV_FILE"
            exit 1
        fi
    fi

    # Source environment file
    set -a
    source "$ENV_FILE"
    set +a

    # Check required variables
    if [ -z "$POSTGRES_PASSWORD" ]; then
        log_error "POSTGRES_PASSWORD is not set in $ENV_FILE"
        exit 1
    fi

    if [ -z "$JWT_SECRET" ]; then
        log_error "JWT_SECRET is not set in $ENV_FILE"
        exit 1
    fi

    log_info "Environment setup complete"
}

deploy() {
    local mode="$1"
    local compose_file="$COMPOSE_FILE"
    local container_prefix="timetrack"

    if [ "$mode" = "prod" ]; then
        compose_file="$PROD_COMPOSE_FILE"
        container_prefix="timetrack-prod"
        log_info "Deploying in production mode..."

        # Create automatic backup before production deployment
        if docker ps | grep -q "${container_prefix}-postgres"; then
            local timestamp=$(date +%Y%m%d_%H%M%S)
            local backup_file="backup_prod_${timestamp}.sql"
            docker exec ${container_prefix}-postgres pg_dump -U timetrack_user timetrack_db > "$backup_file"
            log_info "Pre-deployment backup created: $backup_file"
        fi
    else
        log_info "Deploying in development mode..."
    fi

    # Debug information
    log_info "Current directory: $(pwd)"
    log_info "Using compose file: $compose_file"

    # Check required files
    if [ ! -f "$compose_file" ]; then
        log_error "Compose file not found: $compose_file"
        exit 1
    fi

    # Export environment variables for docker-compose ${VAR} substitution
    # The env_file directive loads vars into containers, but ${VAR} syntax
    # in docker-compose.yml requires vars in the shell environment
    log_info "Loading environment variables from $ENV_FILE"
    set -a
    source "$ENV_FILE"
    set +a

    # Stop existing containers
    docker_compose -f "$compose_file" down

    # Build and start services
    docker_compose -f "$compose_file" up -d --build

    log_info "$mode deployment complete!"
    log_info "Access the application at:"
    log_info "  Web UI: http://localhost:${WEB_PORT:-3010}"
    log_info "  API: http://localhost:${API_PORT:-3011}"
    log_info "  API Docs: http://localhost:${API_PORT:-3011}/api-docs"
    log_info "  Landing: http://localhost:${LANDING_PORT:-3014}"
    if [ "$mode" != "prod" ]; then
        log_info "  PostgreSQL: localhost:${POSTGRES_PORT:-3012}"
        log_info "  Redis: localhost:${REDIS_PORT:-3013}"
    fi
}

show_logs() {
    local compose_file="$COMPOSE_FILE"
    if [ "$2" = "prod" ]; then
        compose_file="$PROD_COMPOSE_FILE"
    fi
    log_info "Showing logs..."
    docker_compose -f "$compose_file" logs -f
}

show_status() {
    local compose_file="$COMPOSE_FILE"
    if [ "$2" = "prod" ]; then
        compose_file="$PROD_COMPOSE_FILE"
    fi
    log_info "Service status:"
    docker_compose -f "$compose_file" ps
}

backup_database() {
    log_info "Creating database backup..."
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="backup_${timestamp}.sql"

    if docker ps | grep -q "timetrack-postgres"; then
        docker exec timetrack-postgres pg_dump -U timetrack_user timetrack_db > "$backup_file"
        log_info "Database backup created: $backup_file"
    elif docker ps | grep -q "timetrack-postgres-prod"; then
        docker exec timetrack-postgres-prod pg_dump -U timetrack_user timetrack_db > "$backup_file"
        log_info "Production database backup created: $backup_file"
    else
        log_error "No PostgreSQL container found"
        exit 1
    fi
}

migrate_database() {
    local environment="${1:-dev}"
    local container_name="timetrack-api"
    local compose_file="$COMPOSE_FILE"

    if [ "$environment" = "prod" ]; then
        container_name="timetrack-api-prod"
        compose_file="$PROD_COMPOSE_FILE"
        log_info "Running database migrations in production..."
    else
        log_info "Running database migrations in development..."
    fi

    if docker ps | grep -q "$container_name"; then
        docker_compose -f "$compose_file" exec api npm run migrate:deploy
        log_info "$environment database migrations completed"
    else
        log_error "$container_name container not found"
        exit 1
    fi
}

stop_services() {
    local compose_file="$COMPOSE_FILE"
    if [ "$2" = "prod" ]; then
        compose_file="$PROD_COMPOSE_FILE"
    fi
    docker_compose -f "$compose_file" down
    log_info "Services stopped"
}

restart_services() {
    local compose_file="$COMPOSE_FILE"
    if [ "$2" = "prod" ]; then
        compose_file="$PROD_COMPOSE_FILE"
    fi
    docker_compose -f "$compose_file" restart
    log_info "Services restarted"
}

show_help() {
    echo "TimeTrack Deployment Script"
    echo ""
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  dev                Deploy in development mode"
    echo "  prod               Deploy in production mode"
    echo "  logs [prod]        Show application logs"
    echo "  status [prod]      Show service status"
    echo "  backup             Create database backup"
    echo "  migrate [dev|prod] Run database migrations"
    echo "  stop [prod]        Stop all services"
    echo "  restart [prod]     Restart all services"
    echo "  help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 dev             # Start development environment"
    echo "  $0 prod            # Deploy production"
    echo "  $0 logs            # Show development logs"
    echo "  $0 logs prod       # Show production logs"
    echo "  $0 migrate prod    # Run migrations in production"
    echo "  $0 stop prod       # Stop production services"
}

# Main script
case "$1" in
    "dev")
        check_requirements
        setup_environment
        deploy "dev"
        ;;
    "prod")
        check_requirements
        setup_environment
        deploy "prod"
        ;;
    "logs")
        check_requirements
        show_logs "$@"
        ;;
    "status")
        check_requirements
        show_status "$@"
        ;;
    "backup")
        check_requirements
        backup_database
        ;;
    "migrate")
        check_requirements
        migrate_database "$2"
        ;;
    "stop")
        check_requirements
        stop_services "$@"
        ;;
    "restart")
        check_requirements
        restart_services "$@"
        ;;
    "help"|"--help"|"-h"|"")
        show_help
        ;;
    *)
        log_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
