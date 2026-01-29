#!/bin/bash
# Script to generate secure random secrets for production deployment
# Usage: ./scripts/generate-secrets.sh

set -e

echo "==================================="
echo "StellAIverse Security Secrets Generator"
echo "==================================="
echo ""

# Check if openssl is available
if ! command -v openssl &> /dev/null; then
    echo "Error: openssl is required but not installed."
    exit 1
fi

echo "Generating secure random secrets..."
echo ""

# Generate JWT Secret (64 bytes)
JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
echo "JWT_SECRET (64 bytes):"
echo "$JWT_SECRET"
echo ""

# Generate Session Secret (32 bytes)
SESSION_SECRET=$(openssl rand -base64 32 | tr -d '\n')
echo "SESSION_SECRET (32 bytes):"
echo "$SESSION_SECRET"
echo ""

# Generate Database Password (32 bytes)
DATABASE_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')
echo "DATABASE_PASSWORD (32 bytes):"
echo "$DATABASE_PASSWORD"
echo ""

# Generate Redis Password (32 bytes)
REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '\n')
echo "REDIS_PASSWORD (32 bytes):"
echo "$REDIS_PASSWORD"
echo ""

echo "==================================="
echo "IMPORTANT SECURITY NOTES:"
echo "==================================="
echo "1. Store these secrets in a secure password manager"
echo "2. Use environment variables or secret management service (AWS Secrets Manager, HashiCorp Vault, etc.)"
echo "3. NEVER commit these values to version control"
echo "4. Rotate secrets regularly (every 90 days recommended)"
echo "5. Use different secrets for each environment (dev, staging, production)"
echo ""
echo "For Kubernetes, create secrets with:"
echo "kubectl create secret generic stellaiverse-secrets \\"
echo "  --from-literal=jwt-secret='\$JWT_SECRET' \\"
echo "  --from-literal=database-password='\$DATABASE_PASSWORD'"
echo ""
