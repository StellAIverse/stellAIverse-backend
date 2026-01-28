#!/bin/bash
# Pre-commit hook to prevent committing secrets
# Install: ln -s ../../scripts/pre-commit-security.sh .git/hooks/pre-commit

set -e

echo "Running security pre-commit checks..."

# Check for common secret patterns
FORBIDDEN_PATTERNS=(
    "JWT_SECRET=.*[^E][^X][^A][^M][^P][^L][^E]"
    "DATABASE_PASSWORD=.*[^C][^H][^A][^N][^G][^E]"
    "PRIVATE_KEY="
    "api_key.*=.*[0-9a-zA-Z]{20,}"
    "password.*=.*[^e][^x][^a][^m][^p][^l][^e]"
    "-----BEGIN .* PRIVATE KEY-----"
)

FILES=$(git diff --cached --name-only)

for FILE in $FILES; do
    if [ -f "$FILE" ]; then
        for PATTERN in "${FORBIDDEN_PATTERNS[@]}"; do
            if grep -qE "$PATTERN" "$FILE"; then
                echo "❌ ERROR: Potential secret detected in $FILE"
                echo "   Pattern: $PATTERN"
                echo "   Commit blocked. Remove secrets before committing."
                exit 1
            fi
        done
    fi
done

# Check for .env files
if echo "$FILES" | grep -q "^\.env$"; then
    echo "❌ ERROR: Attempting to commit .env file"
    echo "   Use .env.example instead"
    exit 1
fi

# Run npm audit (if package.json changed)
if echo "$FILES" | grep -q "package.json"; then
    echo "📦 Running npm audit..."
    if ! npm audit --audit-level=moderate; then
        echo "⚠️  WARNING: npm audit found vulnerabilities"
        echo "   Consider fixing before committing"
        # Don't block commit, just warn
    fi
fi

echo "✅ Security checks passed"
exit 0
