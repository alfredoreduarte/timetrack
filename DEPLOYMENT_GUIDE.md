# TimeTrack Deployment & Development Guide

> **Streamlined guide**: Simple Docker-based development and production deployment.

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
VITE_API_URL=http://localhost:3011
```

### 3. Start Development Environment
```bash
npm run dev
# OR
./deploy.sh dev
```

### 4. Access Your Application
- **Web UI**: http://localhost:3010
- **API**: http://localhost:3011
- **API Docs**: http://localhost:3011/api-docs
- **Database**: localhost:3012

---

## 💻 Daily Development Workflow

### 🚀 Start Development
```bash
npm run dev          # Start all services
npm run logs         # View logs
npm run status       # Check service status
```

### 🔄 Hot Reloading
- **Frontend changes** (packages/ui/): Automatic hot reload with Vite
- **Backend changes** (packages/api/): Automatic restart with nodemon (watches src/ and ../shared/src/)
- **Shared package changes** (packages/shared/): Automatic reload for both API and UI

### 🗄️ Database Operations
```bash
npm run migrate      # Run migrations in development
npm run backup       # Create database backup
```

For manual database access:
```bash
docker exec -it timetrack-api bash
npm run db:studio    # Open Prisma Studio
npx prisma migrate dev --name "your_migration_name"  # Create new migration
```

### 🛑 Stop Development
```bash
npm run stop         # Stop all services
```

### 🔧 Reset Everything (Nuclear Option)
```bash
npm run stop
docker system prune -a
docker volume prune
npm run dev
```

---

## 🌐 Production Deployment

### Server Setup
```bash
# On your server
git clone <your-repo-url>
cd timetrack-monorepo

# Setup production environment
cp docker.env.example docker.env
nano docker.env
```

### Production Environment Configuration
```env
# Security - Use strong values!
POSTGRES_PASSWORD=super_secure_production_password
JWT_SECRET=very_long_random_string_at_least_32_characters

# Domain configuration
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
VITE_API_URL=https://api.yourdomain.com

# Optional
LOG_LEVEL=info
RATE_LIMIT_MAX_REQUESTS=100
```

### Deploy Production
```bash
npm run prod
# OR
./deploy.sh prod
```

---

## 🔄 Production Updates

### Code Updates
```bash
git pull origin main
npm run restart prod
```

### Database Migrations
```bash
npm run migrate:prod
```

### Production Logs & Status
```bash
npm run logs prod
npm run status prod
```

---

## 🛠️ Maintenance & Troubleshooting

### Backup & Restore
```bash
# Create backup (works for both dev and prod)
npm run backup

# Manual restore
docker exec -i timetrack-postgres psql -U timetrack_user timetrack_db < backup_file.sql
```

### Monitor Resources
```bash
docker stats                    # Container resource usage
npm run logs                    # Application logs
npm run status                  # Service status
```

### Common Issues & Solutions

#### 🔴 Services Won't Start
```bash
npm run logs                    # Check what's failing
npm run stop && npm run dev     # Restart everything
```

#### 🔴 Database Issues
```bash
npm run logs                    # Check postgres logs
npm run migrate                 # Run migrations
```

#### 🔴 Hot Reload Not Working
```bash
# Check if volumes are mounted correctly
docker inspect timetrack-api | grep -A 10 Mounts

# Restart specific service
docker-compose restart api
docker-compose restart web
```

#### 🔴 Out of Disk Space
```bash
docker system prune -a          # Clean up Docker
docker volume prune             # Clean up volumes
```

---

## 📚 Reference

### Simplified Command Structure

| Command | Development | Production |
|---------|-------------|------------|
| **Start** | `npm run dev` | `npm run prod` |
| **Stop** | `npm run stop` | `npm run stop prod` |
| **Logs** | `npm run logs` | `npm run logs prod` |
| **Status** | `npm run status` | `npm run status prod` |
| **Restart** | `npm run restart` | `npm run restart prod` |
| **Migrate** | `npm run migrate` | `npm run migrate:prod` |
| **Backup** | `npm run backup` | `npm run backup` |

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_PASSWORD` | ✅ | - | Database password |
| `JWT_SECRET` | ✅ | - | JWT signing secret (32+ chars) |
| `ALLOWED_ORIGINS` | ❌ | `http://localhost:3010` | CORS allowed origins |
| `VITE_API_URL` | ❌ | `http://localhost:3011` | API URL for frontend |

### Port Reference

| Service | Development | Production |
|---------|-------------|------------|
| Web UI | 3010 | 80/443 |
| API | 3011 | 3011 |
| PostgreSQL | 3012 | Internal |
| Redis | 3013 | Internal |

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
├── deploy.sh             # Unified deployment script
└── package.json          # Root scripts (npm run dev, etc.)
```

---

## 🎯 Quick Reference Card

### First Time Setup
```bash
git clone <repo> && cd timetrack-monorepo
cp docker.env.example docker.env
# Edit docker.env
npm run dev
```

### Daily Development
```bash
npm run dev     # Start
npm run logs    # Debug
npm run stop    # Stop
```

### Production
```bash
npm run prod              # Deploy
npm run migrate:prod      # Migrate DB
npm run logs prod         # Check logs
```

**🚀 Simple, unified, and streamlined!**