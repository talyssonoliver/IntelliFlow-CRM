-- IntelliFlow CRM - PostgreSQL Initialization Script
-- This script runs when the PostgreSQL container is first created

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create additional schemas if needed
-- CREATE SCHEMA IF NOT EXISTS analytics;
-- CREATE SCHEMA IF NOT EXISTS ai_processing;

-- Set default configuration
ALTER DATABASE intelliflow_dev SET timezone TO 'UTC';

-- Log successful initialization
DO $$
BEGIN
  RAISE NOTICE 'IntelliFlow CRM database initialized successfully';
  RAISE NOTICE 'Extensions enabled: uuid-ossp, vector';
END $$;
