#!/bin/bash
# Supabase Local Setup Script for IntelliFlow CRM
# This script automates the setup of a local Supabase development environment
#
# Usage:
#   bash infra/supabase/setup-local.sh

set -e  # Exit on error

echo "======================================"
echo "IntelliFlow CRM - Supabase Local Setup"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}Error: Supabase CLI is not installed${NC}"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

echo -e "${GREEN}✓ Supabase CLI found${NC}"

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}Error: Docker is not running${NC}"
    echo "Please start Docker Desktop and try again"
    exit 1
fi

echo -e "${GREEN}✓ Docker is running${NC}"

# Navigate to project root
cd "$(dirname "$0")/../.." || exit

echo ""
echo "Step 1: Starting Supabase services..."
echo "This will start PostgreSQL, Auth, Storage, and other services"
echo ""

# Start Supabase
supabase start

echo ""
echo -e "${GREEN}✓ Supabase services started${NC}"

# Get connection details
SUPABASE_URL=$(supabase status -o json | grep -o '"API URL":"[^"]*"' | cut -d'"' -f4)
ANON_KEY=$(supabase status -o json | grep -o '"anon key":"[^"]*"' | cut -d'"' -f4)
SERVICE_ROLE_KEY=$(supabase status -o json | grep -o '"service_role key":"[^"]*"' | cut -d'"' -f4)
DB_URL=$(supabase status -o json | grep -o '"DB URL":"[^"]*"' | cut -d'"' -f4)

echo ""
echo "Step 2: Applying database migrations..."
echo ""

# Apply migrations
supabase db reset --yes

echo ""
echo -e "${GREEN}✓ Database migrations applied${NC}"

echo ""
echo "Step 3: Applying RLS policies..."
echo ""

# Apply RLS policies
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -f infra/supabase/rls-policies.sql

echo ""
echo -e "${GREEN}✓ RLS policies applied${NC}"

echo ""
echo "Step 4: Setting up storage buckets..."
echo ""

# Setup storage
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -f infra/supabase/storage-setup.sql

echo ""
echo -e "${GREEN}✓ Storage buckets configured${NC}"

echo ""
echo "Step 5: Creating .env.local file for edge functions..."
echo ""

# Create .env.local from example
if [ ! -f "infra/supabase/.env.local" ]; then
    cp infra/supabase/.env.local.example infra/supabase/.env.local
    echo -e "${YELLOW}Note: Please update infra/supabase/.env.local with your API keys${NC}"
fi

echo ""
echo -e "${GREEN}✓ Environment file created${NC}"

echo ""
echo "======================================"
echo -e "${GREEN}Setup Complete!${NC}"
echo "======================================"
echo ""
echo "Supabase is now running with the following details:"
echo ""
echo "  API URL:          ${SUPABASE_URL}"
echo "  Studio URL:       http://localhost:54323"
echo "  Database URL:     ${DB_URL}"
echo ""
echo "  Anon Key:         ${ANON_KEY}"
echo "  Service Role Key: ${SERVICE_ROLE_KEY}"
echo ""
echo "Useful commands:"
echo "  - View logs:           supabase logs"
echo "  - Stop services:       supabase stop"
echo "  - Restart services:    supabase restart"
echo "  - Open Studio:         http://localhost:54323"
echo "  - Run edge function:   supabase functions serve hello"
echo ""
echo "Next steps:"
echo "  1. Update .env file with the connection details above"
echo "  2. Update infra/supabase/.env.local with your API keys"
echo "  3. Run 'pnpm run dev' to start the application"
echo ""
echo -e "${GREEN}Happy coding!${NC}"
echo ""
