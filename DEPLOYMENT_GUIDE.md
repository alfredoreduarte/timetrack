# TimeTrack Deployment & Development Guide

> **One guide for everything**: Daily development, first deployment, and production updates.

## 📋 Table of Contents

- [🚀 Quick Start (First Time)](#-quick-start-first-time)
- [💻 Daily Development Workflow](#-daily-development-workflow)
- [🌐 Production Deployment](#-production-deployment)
- [🔄 Production Updates](#-production-updates)
- [🛠️ Maintenance & Troubleshooting](#️-maintenance--troubleshooting)
- [📚 Reference](#-reference)

---

## 🚀 Quick Start (First Time)

### Prerequisites
- Docker Desktop installed and running
- Git
- Text editor

### 1. Clone & Setup
```bash
git clone <your-repo-url>
cd timetrack-monorepo
cp docker.env.example docker.env
```

### 2. Configure Environment
Edit `docker.env` with your settings:
```env
# Required - Change these!
POSTGRES_PASSWORD=your_secure_password_here
JWT_SECRET=your_very_long_random_secret_key_here

# Optional - Customize as needed
ALLOWED_ORIGINS=http://localhost:3010,https://yourdomain.com
REACT_APP_API_URL=http://localhost:3011
```

### 3. Start Development Environment
```bash
./deploy.sh dev
```

### 4. Access Your Application
- **Web UI**: http://localhost:3010
- **API**: http://localhost:3011
- **API Docs**: http://localhost:3011/api-docs
- **Database**: localhost:3012 (user: `timetrack_user`)

---

## 💻 Daily Development Workflow

### Start Development
```bash
# Start all services
./deploy.sh dev

# Or use docker-compose directly
docker-compose up -d
```

### Check Status
```bash
# Quick status check
./deploy.sh status

# Detailed container info
docker-compose ps
```

### View Logs
```bash
# All services
./deploy.sh logs

# Specific service
docker-compose logs -f api
docker-compose logs -f web
docker-compose logs -f postgres
```

### Make Code Changes

**Frontend changes** (packages/ui/):
- Changes are automatically reflected (hot reload)
- If not working: `docker-compose restart web`

**Backend changes** (packages/api/):
- Restart API service: `docker-compose restart api`
- For major changes: `docker-compose up -d --build api`

**Database schema changes**:
```bash
# Enter API container
docker exec -it timetrack-api bash

# Run migrations
npm run db:migrate:dev
npm run db:generate
```

### Stop Development
```bash
# Stop all services
./deploy.sh stop

# Or completely remove (including data)
docker-compose down -v
```

### Reset Everything (Nuclear Option)
```bash
./deploy.sh stop
docker system prune -a
docker volume prune
./deploy.sh dev
```

---

## 🌐 Production Deployment

### Option A: DigitalOcean (Recommended)

#### 1. Create Droplet
- Choose "Docker" from Marketplace
- Minimum: 2GB RAM, 1 vCPU
- Add your SSH key

#### 2. Server Setup
```bash
# Connect to server
ssh root@your-droplet-ip

# Clone repository
git clone <your-repo-url>
cd timetrack-monorepo

# Setup environment
cp docker.env.example docker.env
nano docker.env
```

#### 3. Production Environment Configuration
```env
# Security - Use strong values!
POSTGRES_PASSWORD=super_secure_production_password
JWT_SECRET=very_long_random_string_at_least_32_characters

# Domain configuration
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
REACT_APP_API_URL=https://api.yourdomain.com

# Optional
LOG_LEVEL=info
RATE_LIMIT_MAX_REQUESTS=100
```

#### 4. Deploy Production
```bash
# Deploy with production config
./deploy.sh prod

# Or manually
docker-compose -f docker-compose.prod.yml up -d
```

#### 5. SSL Setup (Let's Encrypt)
```bash
# Install certbot
apt update && apt install certbot nginx

# Get certificates
certbot certonly --standalone -d yourdomain.com -d api.yourdomain.com

# Setup rate limiting (optional but recommended)
cp nginx-rate-limits.conf /etc/nginx/conf.d/rate-limits.conf

# Copy nginx config template
cp nginx-host-config.example /etc/nginx/sites-available/timetrack
ln -s /etc/nginx/sites-available/timetrack /etc/nginx/sites-enabled/

# Edit nginx config with your domain
nano /etc/nginx/sites-available/timetrack

# If you set up rate limiting, uncomment the limit_req lines in the config

# Test and reload nginx
nginx -t
systemctl reload nginx
```

### Option B: Any Docker Host

```bash
# Clone and setup
git clone <your-repo-url>
cd timetrack-monorepo
cp docker.env.example docker.env

# Edit docker.env for production
nano docker.env

# Deploy
docker-compose -f docker-compose.prod.yml up -d
```

---

## 🔄 Production Updates

### Code Updates
```bash
# On production server
cd timetrack-monorepo

# Pull latest changes
git pull origin main

# Rebuild and restart
./deploy.sh restart

# Or manually
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build
```

### Database Migrations
```bash
# Enter API container
docker exec -it timetrack-api-prod bash

# Run migrations
npm run db:migrate:prod
npm run db:generate

# Exit container
exit

# Restart API to ensure changes are loaded
docker-compose -f docker-compose.prod.yml restart api
```

### Zero-Downtime Updates (Advanced)
```bash
# Scale up API instances
docker-compose -f docker-compose.prod.yml up -d --scale api=2

# Update one instance at a time
docker-compose -f docker-compose.prod.yml up -d --no-deps api

# Scale back down
docker-compose -f docker-compose.prod.yml up -d --scale api=1
```

---

## 🛠️ Maintenance & Troubleshooting

### Backup Database
```bash
# Create backup
./deploy.sh backup

# Manual backup
DATE=$(date +%Y%m%d_%H%M%S)
docker exec timetrack-postgres-prod pg_dump -U timetrack_user timetrack_db > "backup_${DATE}.sql"
```

### Restore Database
```bash
# Restore from backup
docker exec -i timetrack-postgres-prod psql -U timetrack_user timetrack_db < backup_file.sql
```

### Monitor Resources
```bash
# Check container resource usage
docker stats

# Check disk space
df -h

# Check logs size
du -sh /var/lib/docker/containers/*/
```

### Common Issues & Solutions

#### 🔴 Container Won't Start
```bash
# Check logs
./deploy.sh logs

# Check specific service
docker-compose logs api
docker-compose logs postgres
```

#### 🔴 Database Connection Issues
```bash
# Check if postgres is healthy
docker-compose ps

# Check database connectivity
docker exec -it timetrack-api-prod bash
npm run db:status
```

#### 🔴 CORS Errors
```bash
# Update ALLOWED_ORIGINS in docker.env
nano docker.env

# Restart services
./deploy.sh restart
```

#### 🔴 Assets Not Loading (404 errors)
```bash
# Rebuild web container
docker-compose up -d --build web

# Check nginx logs
docker-compose logs web
```

#### 🔴 Out of Disk Space
```bash
# Clean up Docker
docker system prune -a
docker volume prune

# Clean up old images
docker image prune -a
```

#### 🔴 Performance Issues
```bash
# Check resource usage
docker stats

# Scale API if needed
docker-compose up -d --scale api=2

# Check database performance
docker exec -it timetrack-postgres-prod bash
psql -U timetrack_user timetrack_db
\dt+  -- Check table sizes
```

---

## 📚 Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_PASSWORD` | ✅ | - | Database password |
| `JWT_SECRET` | ✅ | - | JWT signing secret (32+ chars) |
| `ALLOWED_ORIGINS` | ❌ | `http://localhost:3010` | CORS allowed origins |
| `REACT_APP_API_URL` | ❌ | `http://localhost:3011` | API URL for frontend |
| `LOG_LEVEL` | ❌ | `info` | Logging level |
| `RATE_LIMIT_MAX_REQUESTS` | ❌ | `100` | Rate limit per window |

### Useful Commands

```bash
# Development
./deploy.sh dev          # Start development environment
./deploy.sh stop         # Stop all services
./deploy.sh logs         # View logs
./deploy.sh status       # Check service status
./deploy.sh restart      # Restart all services

# Production
./deploy.sh prod         # Deploy production
./deploy.sh backup       # Create database backup

# Docker Compose (manual)
docker-compose up -d                    # Start development
docker-compose -f docker-compose.prod.yml up -d  # Start production
docker-compose down                     # Stop and remove containers
docker-compose down -v                  # Stop and remove volumes
docker-compose logs -f [service]        # Follow logs
docker-compose ps                       # List containers
docker-compose restart [service]        # Restart service
docker-compose up -d --build [service]  # Rebuild and restart service
```

### Port Reference

| Service | Development | Production |
|---------|-------------|------------|
| Web UI | 3010 | 80/443 |
| API | 3011 | 3011 |
| PostgreSQL | 3012 | 5432 |
| Redis | 3013 | 6379 |

### File Structure
```
timetrack-monorepo/
├── packages/
│   ├── api/              # Backend API
│   ├── ui/               # Frontend React app
│   └── shared/           # Shared utilities
├── docker-compose.yml    # Development config
├── docker-compose.prod.yml # Production config
├── docker.env            # Environment variables
├── deploy.sh             # Deployment script
└── DEPLOYMENT_GUIDE.md   # This file
```

---

## 🎯 Quick Reference Card

### First Time Setup
```bash
git clone <repo> && cd timetrack-monorepo
cp docker.env.example docker.env
# Edit docker.env
./deploy.sh dev
```

### Daily Development
```bash
./deploy.sh dev     # Start
./deploy.sh logs    # Debug
./deploy.sh stop    # Stop
```

### Production Deployment
```bash
# On server
git clone <repo> && cd timetrack-monorepo
cp docker.env.example docker.env
# Edit docker.env for production
./deploy.sh prod
```

### Production Updates
```bash
git pull origin main
./deploy.sh restart
```

**🚀 That's it! You now have everything you need for both development and production deployment.**