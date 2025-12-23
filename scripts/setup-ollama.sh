#!/bin/bash
# IFC-085: Ollama Local Development Setup Script
#
# This script sets up Ollama for local AI development, reducing costs by 90%
#
# Prerequisites:
#   - Docker installed and running
#   - At least 8GB RAM available
#   - (Optional) NVIDIA GPU with CUDA for acceleration
#
# Usage:
#   ./scripts/setup-ollama.sh

set -e

echo "=== IntelliFlow CRM - Ollama Setup ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    echo "Please install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

echo -e "${GREEN}✓ Docker found${NC}"

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}Error: Docker daemon is not running${NC}"
    echo "Please start Docker and try again"
    exit 1
fi

echo -e "${GREEN}✓ Docker is running${NC}"

# Navigate to project root
cd "$(dirname "$0")/.."

# Start Ollama container
echo ""
echo "Starting Ollama container..."
docker-compose -f infra/docker/docker-compose.ollama.yml up -d ollama

# Wait for Ollama to be ready
echo "Waiting for Ollama to initialize..."
sleep 10

# Check if Ollama is healthy
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Ollama is ready${NC}"
        break
    fi
    echo "Waiting for Ollama... ($((RETRY_COUNT + 1))/$MAX_RETRIES)"
    sleep 2
    RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}Error: Ollama failed to start${NC}"
    exit 1
fi

# Pull required models
echo ""
echo "Pulling recommended models..."
echo -e "${YELLOW}Note: This may take a while depending on your internet connection${NC}"

# Llama 3.1 8B - Primary model for lead scoring
echo ""
echo "Pulling Llama 3.1 8B (recommended for lead scoring)..."
docker exec intelliflow-ollama ollama pull llama3.1:8b || {
    echo -e "${YELLOW}Warning: Failed to pull llama3.1:8b${NC}"
}

# Mistral 7B - Alternative smaller model
echo ""
echo "Pulling Mistral 7B (alternative smaller model)..."
docker exec intelliflow-ollama ollama pull mistral:7b || {
    echo -e "${YELLOW}Warning: Failed to pull mistral:7b${NC}"
}

# List available models
echo ""
echo "=== Available Models ==="
docker exec intelliflow-ollama ollama list

# Print configuration
echo ""
echo "=== Configuration ==="
echo -e "Ollama API URL: ${GREEN}http://localhost:11434${NC}"
echo ""
echo "To use Ollama in your .env:"
echo "  AI_PROVIDER=ollama"
echo "  OLLAMA_URL=http://localhost:11434"
echo "  OLLAMA_MODEL=llama3.1:8b"
echo ""

# Optional: Start Web UI
read -p "Would you like to start the Ollama Web UI? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Starting Ollama Web UI..."
    docker-compose -f infra/docker/docker-compose.ollama.yml up -d ollama-webui
    echo -e "Web UI available at: ${GREEN}http://localhost:3080${NC}"
fi

echo ""
echo -e "${GREEN}=== Ollama setup complete! ===${NC}"
echo ""
echo "Cost comparison:"
echo "  OpenAI GPT-4: ~$0.03/1K tokens"
echo "  Ollama (local): $0.00/1K tokens"
echo "  Estimated savings: 90-100%"
echo ""
echo "To stop Ollama:"
echo "  docker-compose -f infra/docker/docker-compose.ollama.yml down"
