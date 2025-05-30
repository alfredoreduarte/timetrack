-- PostgreSQL initialization script for TimeTrack
-- This script runs when the PostgreSQL container starts for the first time

-- Create extensions if they don't exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Grant necessary permissions to the timetrack_user
GRANT ALL PRIVILEGES ON DATABASE timetrack_db TO timetrack_user;
GRANT ALL PRIVILEGES ON SCHEMA public TO timetrack_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO timetrack_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO timetrack_user;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO timetrack_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO timetrack_user;