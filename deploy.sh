#!/bin/bash

# TimeTrack Deployment Script for Local Development, Staging & Production
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
STAGING_COMPOSE_FILE="docker-compose.staging.yml"
ENV_FILE="docker.env"
STAGING_ENV_FILE="docker.staging.env"

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
    local env_file="${1:-$ENV_FILE}"
    log_info "Setting up environment from $env_file..."

    if [ ! -f "$env_file" ]; then
        local example_file="${env_file%.env}.env.example"
        # Fallback: if the derived example name doesn't exist, try the base example
        if [ ! -f "$example_file" ]; then
            example_file="docker.env.example"
        fi
        if [ -f "$example_file" ]; then
            cp "$example_file" "$env_file"
            log_warn "Created $env_file from example. Please update it with your configuration."
            log_warn "Edit $env_file and run this script again."
            exit 1
        else
            log_error "No environment file found. Please create $env_file"
            exit 1
        fi
    fi

    # Source environment file
    set -a
    source "$env_file"
    set +a

    # Check required variables
    if [ -z "$POSTGRES_PASSWORD" ]; then
        log_error "POSTGRES_PASSWORD is not set in $env_file"
        exit 1
    fi

    if [ -z "$JWT_SECRET" ]; then
        log_error "JWT_SECRET is not set in $env_file"
        exit 1
    fi

    log_info "Environment setup complete"
}

deploy() {
    local mode="$1"
    local compose_file="$COMPOSE_FILE"
    local container_prefix="timetrack"
    local env_file="$ENV_FILE"

    if [ "$mode" = "prod" ]; then
        compose_file="$PROD_COMPOSE_FILE"
        container_prefix="timetrack-prod"
        log_info "Deploying in production mode..."

        # Create automatic backup before production deployment
        if docker ps | grep -q "timetrack-postgres-prod"; then
            local timestamp=$(date +%Y%m%d_%H%M%S)
            local backup_file="backup_prod_${timestamp}.sql"
            docker exec timetrack-postgres-prod pg_dump -U timetrack_user timetrack_db > "$backup_file"
            log_info "Pre-deployment backup created: $backup_file"
        fi
    elif [ "$mode" = "staging" ]; then
        compose_file="$STAGING_COMPOSE_FILE"
        container_prefix="timetrack-staging"
        env_file="$STAGING_ENV_FILE"
        log_info "Deploying in staging mode..."

        # Create automatic backup before staging deployment
        if docker ps | grep -q "timetrack-postgres-staging"; then
            local timestamp=$(date +%Y%m%d_%H%M%S)
            local backup_file="backup_staging_${timestamp}.sql"
            docker exec timetrack-postgres-staging pg_dump -U timetrack_user timetrack_db > "$backup_file"
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
    log_info "Loading environment variables from $env_file"
    set -a
    source "$env_file"
    set +a

    if [ "$mode" = "prod" ] || [ "$mode" = "staging" ]; then
        # Build new images while old containers keep serving traffic.
        # Sequential builds avoid overwhelming the server when cache is cold.
        log_info "Building new images (old containers still serving traffic)..."
        docker_compose -f "$compose_file" build api
        docker_compose -f "$compose_file" build web
        docker_compose -f "$compose_file" build landing

        # Recreate only containers whose image/config changed.
        # Postgres and redis are untouched (stock images, no rebuild needed).
        log_info "Replacing containers with new images..."
        docker_compose -f "$compose_file" up -d --remove-orphans
    else
        # Dev: full restart is fine
        docker_compose -f "$compose_file" down --remove-orphans
        docker_compose -f "$compose_file" up -d --build
    fi

    log_info "$mode deployment complete!"
    log_info "Access the application at:"
    log_info "  Web UI: http://localhost:${WEB_PORT:-3010}"
    log_info "  API: http://localhost:${API_PORT:-3011}"
    log_info "  API Docs: http://localhost:${API_PORT:-3011}/api-docs"
    log_info "  Landing: http://localhost:${LANDING_PORT:-3014}"
    if [ "$mode" != "prod" ] && [ "$mode" != "staging" ]; then
        log_info "  PostgreSQL: localhost:${POSTGRES_PORT:-3012}"
        log_info "  Redis: localhost:${REDIS_PORT:-3013}"
    fi
}

# Resolve compose file for a given environment argument
resolve_compose_file() {
    local env="$1"
    case "$env" in
        prod)    echo "$PROD_COMPOSE_FILE" ;;
        staging) echo "$STAGING_COMPOSE_FILE" ;;
        *)       echo "$COMPOSE_FILE" ;;
    esac
}

show_logs() {
    local compose_file
    compose_file=$(resolve_compose_file "$2")
    log_info "Showing logs..."
    docker_compose -f "$compose_file" logs -f
}

show_status() {
    local compose_file
    compose_file=$(resolve_compose_file "$2")
    log_info "Service status:"
    docker_compose -f "$compose_file" ps
}

backup_database() {
    local env="${1:-}"
    log_info "Creating database backup..."
    local timestamp=$(date +%Y%m%d_%H%M%S)

    if [ "$env" = "staging" ]; then
        if docker ps | grep -q "timetrack-postgres-staging"; then
            local backup_file="backup_staging_${timestamp}.sql"
            docker exec timetrack-postgres-staging pg_dump -U timetrack_user timetrack_db > "$backup_file"
            log_info "Staging database backup created: $backup_file"
        else
            log_error "No staging PostgreSQL container found"
            exit 1
        fi
    elif docker ps | grep -q "timetrack-postgres-prod"; then
        local backup_file="backup_prod_${timestamp}.sql"
        docker exec timetrack-postgres-prod pg_dump -U timetrack_user timetrack_db > "$backup_file"
        log_info "Production database backup created: $backup_file"
    elif docker ps | grep -q "timetrack-postgres"; then
        local backup_file="backup_${timestamp}.sql"
        docker exec timetrack-postgres pg_dump -U timetrack_user timetrack_db > "$backup_file"
        log_info "Database backup created: $backup_file"
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
    elif [ "$environment" = "staging" ]; then
        container_name="timetrack-api-staging"
        compose_file="$STAGING_COMPOSE_FILE"
        log_info "Running database migrations in staging..."
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
    local compose_file
    compose_file=$(resolve_compose_file "$2")
    docker_compose -f "$compose_file" down
    log_info "Services stopped"
}

restart_services() {
    local compose_file
    compose_file=$(resolve_compose_file "$2")
    docker_compose -f "$compose_file" restart
    log_info "Services restarted"
}

show_help() {
    echo "TimeTrack Deployment Script"
    echo ""
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  dev                       Deploy in development mode"
    echo "  prod                      Deploy in production mode"
    echo "  staging                   Deploy in staging mode"
    echo "  logs [prod|staging]       Show application logs"
    echo "  status [prod|staging]     Show service status"
    echo "  backup [staging]          Create database backup"
    echo "  migrate [dev|prod|staging] Run database migrations"
    echo "  stop [prod|staging]       Stop all services"
    echo "  restart [prod|staging]    Restart all services"
    echo "  help                      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 dev                # Start development environment"
    echo "  $0 prod               # Deploy production"
    echo "  $0 staging            # Deploy staging"
    echo "  $0 logs               # Show development logs"
    echo "  $0 logs prod          # Show production logs"
    echo "  $0 logs staging       # Show staging logs"
    echo "  $0 migrate staging    # Run migrations in staging"
    echo "  $0 stop staging       # Stop staging services"
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
    "staging")
        check_requirements
        setup_environment "$STAGING_ENV_FILE"
        deploy "staging"
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
        backup_database "$2"
        ;;
    "migrate")
        check_requirements
        if [ "$2" = "staging" ]; then
            setup_environment "$STAGING_ENV_FILE"
        else
            setup_environment
        fi
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
