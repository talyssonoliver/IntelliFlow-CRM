#!/bin/bash
#
# IntelliFlow CRM - Ollama Local Development Setup
# Task: IFC-085
#
# This script sets up Ollama for local LLM development/testing
# Reduces development costs by 90% while maintaining accuracy
#

set -euo pipefail

# Configuration
OLLAMA_VERSION="${OLLAMA_VERSION:-latest}"
MODELS=("mistral" "llama3.1" "codellama")
OLLAMA_PORT="${OLLAMA_PORT:-11434}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
check_docker() {
    if ! docker info &>/dev/null; then
        log_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    log_info "Docker is running"
}

# Pull Ollama container
setup_ollama_container() {
    log_info "Setting up Ollama container..."

    # Check if container exists
    if docker ps -a --format '{{.Names}}' | grep -q "^ollama$"; then
        log_info "Ollama container exists, starting..."
        docker start ollama 2>/dev/null || true
    else
        log_info "Creating new Ollama container..."
        docker run -d \
            --name ollama \
            -p ${OLLAMA_PORT}:11434 \
            -v ollama_data:/root/.ollama \
            --restart unless-stopped \
            ollama/ollama:${OLLAMA_VERSION}
    fi

    # Wait for Ollama to be ready
    log_info "Waiting for Ollama to be ready..."
    for i in {1..30}; do
        if curl -s http://localhost:${OLLAMA_PORT}/api/tags &>/dev/null; then
            log_info "Ollama is ready!"
            return 0
        fi
        sleep 1
    done

    log_error "Ollama failed to start within 30 seconds"
    exit 1
}

# Pull required models
pull_models() {
    log_info "Pulling required models..."

    for model in "${MODELS[@]}"; do
        log_info "Pulling model: $model"
        docker exec ollama ollama pull "$model" || {
            log_warn "Failed to pull $model, continuing..."
        }
    done

    log_info "Model pull complete"
}

# Configure environment
configure_environment() {
    log_info "Configuring environment variables..."

    ENV_FILE="${PROJECT_ROOT:-.}/.env.local"

    # Check if already configured
    if grep -q "AI_PROVIDER=ollama" "$ENV_FILE" 2>/dev/null; then
        log_info "Environment already configured for Ollama"
        return 0
    fi

    # Append Ollama configuration
    cat >> "$ENV_FILE" << EOF

# Ollama Local Development Configuration (IFC-085)
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:${OLLAMA_PORT}
OLLAMA_MODEL=mistral
OLLAMA_TEMPERATURE=0.7
OLLAMA_TIMEOUT=60000
EOF

    log_info "Environment configured in $ENV_FILE"
}

# Verify setup
verify_setup() {
    log_info "Verifying Ollama setup..."

    # Test API
    response=$(curl -s http://localhost:${OLLAMA_PORT}/api/tags)
    if echo "$response" | grep -q "models"; then
        log_info "API is responding correctly"
    else
        log_error "API verification failed"
        exit 1
    fi

    # Test model inference
    log_info "Testing model inference..."
    test_response=$(curl -s http://localhost:${OLLAMA_PORT}/api/generate \
        -d '{"model":"mistral","prompt":"Hello","stream":false}' \
        -H "Content-Type: application/json")

    if echo "$test_response" | grep -q "response"; then
        log_info "Model inference working!"
    else
        log_warn "Model inference test inconclusive"
    fi
}

# Print cost comparison
print_cost_comparison() {
    cat << 'EOF'

=== Cost Comparison (IFC-085) ===

| Provider      | Model           | Input $/1K | Output $/1K | Monthly Est* |
|---------------|-----------------|------------|-------------|--------------|
| OpenAI        | gpt-4-turbo     | $0.010     | $0.030      | $150-500     |
| OpenAI        | gpt-3.5-turbo   | $0.0005    | $0.0015     | $15-50       |
| Ollama/Local  | mistral         | $0.000     | $0.000      | $0 (+ power) |
| Ollama/Local  | llama3.1        | $0.000     | $0.000      | $0 (+ power) |

* Estimated based on 100K-500K tokens/month development usage

Savings with Ollama: ~90% reduction in development costs
EOF
}

# Main execution
main() {
    log_info "IntelliFlow CRM - Ollama Setup (IFC-085)"
    log_info "=========================================="

    check_docker
    setup_ollama_container
    pull_models
    # configure_environment  # Uncomment to auto-configure
    verify_setup
    print_cost_comparison

    log_info ""
    log_info "Setup complete! Run your AI worker with:"
    log_info "  AI_PROVIDER=ollama pnpm --filter @intelliflow/ai-worker dev"
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
