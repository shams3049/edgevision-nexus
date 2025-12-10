#!/bin/bash

# EdgeVision Nexus - Clean Stop Script
# Stops all services cleanly

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}🛑 Stopping EdgeVision Nexus...${NC}"
echo ""

# Check for Docker Compose (v1 or v2)
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo -e "${YELLOW}⚠ Docker Compose not found${NC}"
    exit 1
fi

# Stop containers
echo "  → Stopping containers..."
$DOCKER_COMPOSE down -v --remove-orphans

# Kill any lingering processes
echo "  → Cleaning up processes..."
pkill -f "python.*gateway.py" 2>/dev/null || true
pkill -f "python.*zed_app.py" 2>/dev/null || true
pkill -f "npm.*dev" 2>/dev/null || true

echo ""
echo -e "${GREEN}✅ All services stopped${NC}"
echo ""
echo "To restart: ./start.sh"
echo ""
