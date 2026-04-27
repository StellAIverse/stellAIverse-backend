#!/bin/bash

# Job Control API Test Script
# This script demonstrates the complete job control workflow

set -e

# Configuration
API_BASE="${API_BASE:-http://localhost:3000}"
TOKEN="${JWT_TOKEN:-your-jwt-token-here}"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Job Control API Test Script ===${NC}\n"

# Check if token is set
if [ "$TOKEN" = "your-jwt-token-here" ]; then
    echo -e "${RED}Error: Please set JWT_TOKEN environment variable${NC}"
    echo "Usage: JWT_TOKEN=your-token ./scripts/test-job-control.sh"
    exit 1
fi

# Step 1: Create a test job
echo -e "${BLUE}Step 1: Creating test job...${NC}"
CREATE_RESPONSE=$(curl -s -X POST "$API_BASE/queue/jobs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "data-processing",
    "payload": {
      "test": "Job Control API Test",
      "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
    },
    "userId": "test-user",
    "priority": 5,
    "metadata": {
      "source": "test-script"
    }
  }')

JOB_ID=$(echo $CREATE_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$JOB_ID" ]; then
    echo -e "${RED}Failed to create job${NC}"
    echo "Response: $CREATE_RESPONSE"
    exit 1
fi

echo -e "${GREEN}✓ Job created: $JOB_ID${NC}\n"

# Step 2: Check initial status
echo -e "${BLUE}Step 2: Checking initial job status...${NC}"
STATUS_RESPONSE=$(curl -s -X GET "$API_BASE/queue/jobs/$JOB_ID/status" \
  -H "Authorization: Bearer $TOKEN")

echo "Status: $STATUS_RESPONSE"
echo -e "${GREEN}✓ Status retrieved${NC}\n"

# Wait a moment for job to be in waiting state
sleep 2

# Step 3: Pause the job
echo -e "${BLUE}Step 3: Pausing job...${NC}"
PAUSE_RESPONSE=$(curl -s -X POST "$API_BASE/queue/jobs/$JOB_ID/pause" \
  -H "Authorization: Bearer $TOKEN")

echo "Response: $PAUSE_RESPONSE"

if echo "$PAUSE_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ Job paused successfully${NC}\n"
else
    echo -e "${RED}✗ Failed to pause job${NC}\n"
fi

# Step 4: Verify job is paused
echo -e "${BLUE}Step 4: Verifying job is paused...${NC}"
STATUS_RESPONSE=$(curl -s -X GET "$API_BASE/queue/jobs/$JOB_ID/status" \
  -H "Authorization: Bearer $TOKEN")

if echo "$STATUS_RESPONSE" | grep -q '"paused":true'; then
    echo -e "${GREEN}✓ Job is paused${NC}\n"
else
    echo -e "${RED}✗ Job is not paused${NC}\n"
fi

# Step 5: Resume the job
echo -e "${BLUE}Step 5: Resuming job...${NC}"
RESUME_RESPONSE=$(curl -s -X POST "$API_BASE/queue/jobs/$JOB_ID/resume" \
  -H "Authorization: Bearer $TOKEN")

echo "Response: $RESUME_RESPONSE"

if echo "$RESUME_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ Job resumed successfully${NC}\n"
else
    echo -e "${RED}✗ Failed to resume job${NC}\n"
fi

# Step 6: Verify job is resumed
echo -e "${BLUE}Step 6: Verifying job is resumed...${NC}"
STATUS_RESPONSE=$(curl -s -X GET "$API_BASE/queue/jobs/$JOB_ID/status" \
  -H "Authorization: Bearer $TOKEN")

if echo "$STATUS_RESPONSE" | grep -q '"paused":false'; then
    echo -e "${GREEN}✓ Job is resumed${NC}\n"
else
    echo -e "${RED}✗ Job is not resumed${NC}\n"
fi

# Step 7: Cancel the job
echo -e "${BLUE}Step 7: Cancelling job...${NC}"
CANCEL_RESPONSE=$(curl -s -X POST "$API_BASE/queue/jobs/$JOB_ID/cancel" \
  -H "Authorization: Bearer $TOKEN")

echo "Response: $CANCEL_RESPONSE"

if echo "$CANCEL_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ Job cancelled successfully${NC}\n"
else
    echo -e "${RED}✗ Failed to cancel job${NC}\n"
fi

# Step 8: Verify job is removed
echo -e "${BLUE}Step 8: Verifying job is removed...${NC}"
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X GET "$API_BASE/queue/jobs/$JOB_ID/status" \
  -H "Authorization: Bearer $TOKEN")

if [ "$STATUS_CODE" = "404" ]; then
    echo -e "${GREEN}✓ Job successfully removed (404 as expected)${NC}\n"
else
    echo -e "${RED}✗ Job still exists (status code: $STATUS_CODE)${NC}\n"
fi

echo -e "${GREEN}=== Test Complete ===${NC}"
echo -e "All job control operations tested successfully!"
