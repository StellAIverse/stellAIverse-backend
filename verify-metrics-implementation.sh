#!/bin/bash

# Verification Script for Queue Metrics Implementation
# This script checks that all files are in place and properly configured

echo "🔍 Verifying Queue Metrics Implementation..."
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counter for checks
PASSED=0
FAILED=0

# Function to check file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} Found: $1"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} Missing: $1"
        ((FAILED++))
        return 1
    fi
}

# Function to check content in file
check_content() {
    if grep -q "$2" "$1" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $3"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $3"
        ((FAILED++))
        return 1
    fi
}

echo "📁 Checking Core Implementation Files..."
echo "----------------------------------------"
check_file "src/config/metrics.ts"
check_file "src/compute-job-queue/compute-job.processor.ts"
check_file "src/compute-job-queue/queue.service.ts"
check_file "src/compute-job-queue/services/queue-metrics.service.ts"
check_file "src/compute-job-queue/compute-job-queue.module.ts"
echo ""

echo "🧪 Checking Test Files..."
echo "----------------------------------------"
check_file "src/compute-job-queue/queue-metrics.integration.spec.ts"
echo ""

echo "📚 Checking Documentation Files..."
echo "----------------------------------------"
check_file "docs/QUEUE_METRICS.md"
check_file "docs/QUEUE_METRICS_QUICK_START.md"
check_file "docs/METRICS_ARCHITECTURE.md"
check_file "docs/METRICS_MIGRATION_GUIDE.md"
check_file "docs/README_METRICS.md"
echo ""

echo "📝 Checking Example Files..."
echo "----------------------------------------"
check_file "src/examples/queue-metrics-usage.ts"
echo ""

echo "🔧 Checking Metric Definitions..."
echo "----------------------------------------"
check_content "src/config/metrics.ts" "jobDuration" "jobDuration metric defined"
check_content "src/config/metrics.ts" "jobSuccessTotal" "jobSuccessTotal metric defined"
check_content "src/config/metrics.ts" "jobFailureTotal" "jobFailureTotal metric defined"
check_content "src/config/metrics.ts" "queueLength" "queueLength metric defined"
echo ""

echo "🔌 Checking Instrumentation..."
echo "----------------------------------------"
check_content "src/compute-job-queue/compute-job.processor.ts" "jobDuration.observe" "Job duration tracking in processor"
check_content "src/compute-job-queue/compute-job.processor.ts" "jobSuccessTotal.inc" "Success counter in processor"
check_content "src/compute-job-queue/compute-job.processor.ts" "jobFailureTotal.inc" "Failure counter in processor"
check_content "src/compute-job-queue/queue.service.ts" "queueLength.set" "Queue length tracking in service"
echo ""

echo "🏗️ Checking Module Integration..."
echo "----------------------------------------"
check_content "src/compute-job-queue/compute-job-queue.module.ts" "QueueMetricsService" "QueueMetricsService registered in module"
echo ""

echo "📊 Summary"
echo "=========================================="
echo -e "Passed: ${GREEN}${PASSED}${NC}"
echo -e "Failed: ${RED}${FAILED}${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Implementation is complete.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run tests: npm test -- queue-metrics.integration.spec.ts"
    echo "2. Start app: npm run start:dev"
    echo "3. Check metrics: curl http://localhost:3000/metrics"
    exit 0
else
    echo -e "${RED}❌ Some checks failed. Please review the missing items.${NC}"
    exit 1
fi
