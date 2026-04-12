-- IntelliFlow CRM - PostgreSQL Initialization Script
-- This script runs when the PostgreSQL container is first created

-- Create dedicated schema for extensions (best practice)
CREATE SCHEMA IF NOT EXISTS extensions;
COMMENT ON SCHEMA extensions IS 'Dedicated schema for PostgreSQL extensions to keep public schema clean';

-- Enable required extensions in the extensions schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "vector" SCHEMA extensions;

-- Create additional schemas if needed
-- CREATE SCHEMA IF NOT EXISTS analytics;
-- CREATE SCHEMA IF NOT EXISTS ai_processing;

-- Set default configuration
ALTER DATABASE intelliflow_dev SET timezone TO 'UTC';

-- Set search_path to include extensions schema for vector type/operator visibility
ALTER DATABASE intelliflow_dev SET search_path TO extensions, public;

-- Log successful initialization
DO $$
BEGIN
  RAISE NOTICE 'IntelliFlow CRM database initialized successfully';
  RAISE NOTICE 'Extensions enabled: uuid-ossp, vector (in extensions schema)';
END $$;
