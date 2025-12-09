#!/bin/bash

# EdgeVision Nexus - Setup & Start Script
# Starts the complete edge-to-cloud stack

set -e

echo "=========================================="
echo "EdgeVision Nexus - Setup & Start"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker is not installed${NC}"
    echo "Install from: https://docs.docker.com/get-docker/"
    exit 1
fi
echo -e "${GREEN}✓ Docker found${NC}"

# Check for Docker Compose (v1 or v2)
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
    echo -e "${GREEN}✓ Docker Compose V2 found${NC}"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
    echo -e "${GREEN}✓ Docker Compose V1 found${NC}"
else
    echo -e "${RED}✗ Docker Compose not installed${NC}"
    exit 1
fi

echo ""
echo "Starting services..."
$DOCKER_COMPOSE up -d

echo ""
echo "Setting up git hooks..."
if [ -d ".git" ] && [ -f ".git-hooks/pre-commit" ]; then
    cp .git-hooks/pre-commit .git/hooks/pre-commit
    chmod +x .git/hooks/pre-commit
    echo -e "${GREEN}✓ Git pre-commit hook installed${NC}"
else
    echo -e "${YELLOW}⚠ No .git directory or hook not found, skipping${NC}"
fi

echo ""
echo "Waiting for services..."
sleep 3

echo ""
echo "Checking service status..."

# Check services
services_ok=true

if curl -s http://localhost:8000/devices > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Gateway running (port 8000)${NC}"
else
    echo -e "${YELLOW}⚠ Gateway starting... (port 8000)${NC}"
    services_ok=false
fi

if curl -s http://localhost:5000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Edge node running (port 5000)${NC}"
else
    echo -e "${YELLOW}⚠ Edge node starting... (port 5000)${NC}"
    services_ok=false
fi

if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Dashboard running (port 3000)${NC}"
else
    echo -e "${YELLOW}⚠ Dashboard building/starting... (port 3000)${NC}"
    services_ok=false
fi

echo ""
echo "=========================================="
if [ "$services_ok" = true ]; then
    echo -e "${GREEN}All services running!${NC}"
else
    echo -e "${YELLOW}Services starting (may take 30-60 seconds)${NC}"
fi
echo "=========================================="
echo ""
echo "Dashboard: http://localhost:3000"
echo ""
echo "Useful commands:"
echo "  View logs:     $DOCKER_COMPOSE logs -f"
echo "  Stop:          $DOCKER_COMPOSE down"
echo "  Restart:       $DOCKER_COMPOSE restart"
echo "  Status:        $DOCKER_COMPOSE ps"
echo ""
echo "Next: Open http://localhost:3000 in your browser"
echo ""
