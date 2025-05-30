#!/bin/bash

# TimeTrack Deployment Script for DigitalOcean
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

deploy_development() {
    log_info "Deploying in development mode..."

    # Debug information
    log_info "Current directory: $(pwd)"
    log_info "Checking required files..."

    if [ ! -f "$COMPOSE_FILE" ]; then
        log_error "Development compose file not found: $COMPOSE_FILE"
        exit 1
    fi

    if [ ! -f "packages/api/Dockerfile" ]; then
        log_error "API Dockerfile not found: packages/api/Dockerfile"
        exit 1
    fi

    if [ ! -f "packages/ui/Dockerfile" ]; then
        log_error "UI Dockerfile not found: packages/ui/Dockerfile"
        exit 1
    fi

    log_info "All required files found"

    # Stop existing containers
    docker_compose down

    # Build and start services
    docker_compose up -d --build

    log_info "Development deployment complete!"
    log_info "Access the application at:"
    log_info "  Web UI: http://localhost:${WEB_PORT:-3010}"
    log_info "  API: http://localhost:${API_PORT:-3011}"
    log_info "  API Docs: http://localhost:${API_PORT:-3011}/api-docs"
    log_info "  PostgreSQL: localhost:${POSTGRES_PORT:-3012}"
    log_info "  Redis: localhost:${REDIS_PORT:-3013}"
}

deploy_production() {
    log_info "Deploying in production mode..."

    # Debug information
    log_info "Current directory: $(pwd)"
    log_info "Checking required files..."

    if [ ! -f "$PROD_COMPOSE_FILE" ]; then
        log_error "Production compose file not found: $PROD_COMPOSE_FILE"
        exit 1
    fi

    if [ ! -f "packages/api/Dockerfile" ]; then
        log_error "API Dockerfile not found: packages/api/Dockerfile"
        exit 1
    fi

    if [ ! -f "packages/ui/Dockerfile" ]; then
        log_error "UI Dockerfile not found: packages/ui/Dockerfile"
        exit 1
    fi

    log_info "All required files found"

    # Create automatic backup before deployment
    log_info "Creating automatic backup before deployment..."
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="backup_prod_${timestamp}.sql"

    if docker ps | grep -q "timetrack-postgres-prod"; then
        docker exec timetrack-postgres-prod pg_dump -U timetrack_user timetrack_db > "$backup_file"
        log_info "Pre-deployment backup created: $backup_file"
    else
        log_warn "PostgreSQL container not running - skipping backup"
        backup_file="(no backup created - database not running)"
    fi

    # Stop existing containers (but keep database running)
    log_info "Stopping application services (keeping database running)..."
    docker_compose -f "$PROD_COMPOSE_FILE" stop api web redis

    # Pull latest images and build
    docker_compose -f "$PROD_COMPOSE_FILE" pull
    docker_compose -f "$PROD_COMPOSE_FILE" up -d --build

    log_info "Production deployment complete!"
    log_info "Services are starting up. Check status with:"
    log_info "  $DOCKER_COMPOSE_CMD -f $PROD_COMPOSE_FILE ps"
    if docker ps | grep -q "timetrack-postgres-prod"; then
        log_info "Database backup was saved as: $backup_file"
    fi
}

show_logs() {
    local compose_file="$1"
    if [ -z "$compose_file" ]; then
        compose_file="$COMPOSE_FILE"
    fi

    log_info "Showing logs..."
    docker_compose -f "$compose_file" logs -f
}

show_status() {
    local compose_file="$1"
    if [ -z "$compose_file" ]; then
        compose_file="$COMPOSE_FILE"
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
    else
        log_error "PostgreSQL container not found"
        exit 1
    fi
}

migrate_database() {
    local environment="${1:-dev}"

    if [ "$environment" = "prod" ]; then
        log_info "Running database migrations in production..."
        if docker ps | grep -q "timetrack-postgres-prod"; then
            # Create backup before migration
            local timestamp=$(date +%Y%m%d_%H%M%S)
            local backup_file="backup_pre_migration_${timestamp}.sql"
            docker exec timetrack-postgres-prod pg_dump -U timetrack_user timetrack_db > "$backup_file"
            log_info "Pre-migration backup created: $backup_file"

            # Run migrations
            docker_compose -f "$PROD_COMPOSE_FILE" exec api sh -c "cd /app/packages/api && npx prisma migrate deploy"
            log_info "Production database migrations completed"
        else
            log_error "Production PostgreSQL container not found"
            exit 1
        fi
    else
        log_info "Running database migrations in development..."
        if docker ps | grep -q "timetrack-postgres"; then
            docker_compose exec api sh -c "cd /app/packages/api && npx prisma migrate deploy"
            log_info "Development database migrations completed"
        else
            log_error "Development PostgreSQL container not found"
            exit 1
        fi
    fi
}

show_help() {
    echo "TimeTrack Deployment Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  dev         Deploy in development mode"
    echo "  prod        Deploy in production mode"
    echo "  logs        Show application logs"
    echo "  status      Show service status"
    echo "  backup      Create database backup"
    echo "  migrate     Run database migrations (usage: migrate [dev|prod])"
    echo "  stop        Stop all services"
    echo "  restart     Restart all services"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 dev              # Deploy for development"
    echo "  $0 prod             # Deploy for production"
    echo "  $0 logs             # Show logs"
    echo "  $0 backup           # Create database backup"
    echo "  $0 migrate prod     # Run migrations in production"
}

# Main script
case "$1" in
    "dev")
        check_requirements
        setup_environment
        deploy_development
        ;;
    "prod")
        check_requirements
        setup_environment
        deploy_production
        ;;
    "logs")
        check_requirements
        if [ "$2" = "prod" ]; then
            show_logs "$PROD_COMPOSE_FILE"
        else
            show_logs
        fi
        ;;
    "status")
        check_requirements
        if [ "$2" = "prod" ]; then
            show_status "$PROD_COMPOSE_FILE"
        else
            show_status
        fi
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
        if [ "$2" = "prod" ]; then
            docker_compose -f "$PROD_COMPOSE_FILE" down
        else
            docker_compose down
        fi
        log_info "Services stopped"
        ;;
    "restart")
        check_requirements
        if [ "$2" = "prod" ]; then
            docker_compose -f "$PROD_COMPOSE_FILE" restart
        else
            docker_compose restart
        fi
        log_info "Services restarted"
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
