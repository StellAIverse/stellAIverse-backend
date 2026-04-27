# Job Control API - Quick Start Guide

## Getting Started in 5 Minutes

This guide will help you quickly start using the Job Control API to manage compute jobs.

## Prerequisites

- Running stellAIverse backend instance
- Valid JWT authentication token
- User account with `operator` or `admin` role (for control operations)

## Step 1: Create a Test Job

```bash
curl -X POST http://localhost:3000/queue/jobs \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "data-processing",
    "payload": {
      "message": "Hello from Job Control API"
    },
    "userId": "test-user",
    "priority": 5
  }'
```

**Response:**
```json
{
  "id": "data-processing-test-user-1708876543210",
  "type": "data-processing",
  "status": "pending",
  "attemptsMade": 0,
  "createdAt": "2026-02-25T10:15:43.210Z"
}
```

Save the `id` value - you'll need it for the next steps!

## Step 2: Check Job Status

```bash
curl -X GET http://localhost:3000/queue/jobs/YOUR_JOB_ID/status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "id": "data-processing-test-user-1708876543210",
  "type": "data-processing",
  "state": "waiting",
  "progress": 0,
  "attemptsMade": 0,
  "createdAt": "2026-02-25T10:15:43.210Z",
  "metadata": {
    "userId": "test-user"
  }
}
```

## Step 3: Pause the Job

```bash
curl -X POST http://localhost:3000/queue/jobs/YOUR_JOB_ID/pause \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "Job data-processing-test-user-1708876543210 paused successfully",
  "jobId": "data-processing-test-user-1708876543210",
  "previousState": "waiting",
  "newState": "paused"
}
```

## Step 4: Resume the Job

```bash
curl -X POST http://localhost:3000/queue/jobs/YOUR_JOB_ID/resume \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "Job data-processing-test-user-1708876543210 resumed successfully",
  "jobId": "data-processing-test-user-1708876543210",
  "previousState": "paused",
  "newState": "waiting"
}
```

## Step 5: Cancel the Job

```bash
curl -X POST http://localhost:3000/queue/jobs/YOUR_JOB_ID/cancel \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "Job data-processing-test-user-1708876543210 cancelled successfully",
  "jobId": "data-processing-test-user-1708876543210",
  "previousState": "waiting"
}
```

## Common Use Cases

### 1. Pause All Jobs During Maintenance

```bash
#!/bin/bash
# Get all waiting jobs
JOBS=$(curl -s http://localhost:3000/queue/stats \
  -H "Authorization: Bearer $TOKEN" | jq -r '.compute.waiting')

echo "Found $JOBS waiting jobs"

# In production, you'd iterate through actual job IDs
# This is a simplified example
```

### 2. Monitor Job Progress

```bash
#!/bin/bash
JOB_ID="your-job-id"
TOKEN="your-token"

while true; do
  STATUS=$(curl -s http://localhost:3000/queue/jobs/$JOB_ID/status \
    -H "Authorization: Bearer $TOKEN")
  
  STATE=$(echo $STATUS | jq -r '.state')
  PROGRESS=$(echo $STATUS | jq -r '.progress')
  
  echo "Job $JOB_ID: $STATE ($PROGRESS%)"
  
  if [ "$STATE" = "completed" ] || [ "$STATE" = "failed" ]; then
    break
  fi
  
  sleep 5
done
```

### 3. Cancel Long-Running Jobs

```bash
#!/bin/bash
# Cancel jobs running longer than 1 hour
# (This requires custom logic to track job start times)

JOB_ID="long-running-job-id"
TOKEN="your-token"

curl -X POST http://localhost:3000/queue/jobs/$JOB_ID/cancel \
  -H "Authorization: Bearer $TOKEN"
```

## JavaScript/TypeScript Example

```typescript
import axios from 'axios';

const API_BASE = 'http://localhost:3000';
const TOKEN = 'your-jwt-token';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
  },
});

async function jobControlDemo() {
  // 1. Create job
  const { data: job } = await api.post('/queue/jobs', {
    type: 'data-processing',
    payload: { test: 'data' },
    userId: 'demo-user',
  });
  
  console.log('Created job:', job.id);
  
  // 2. Check status
  const { data: status } = await api.get(`/queue/jobs/${job.id}/status`);
  console.log('Job state:', status.state);
  
  // 3. Pause job
  await api.post(`/queue/jobs/${job.id}/pause`);
  console.log('Job paused');
  
  // 4. Wait a bit
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 5. Resume job
  await api.post(`/queue/jobs/${job.id}/resume`);
  console.log('Job resumed');
  
  // 6. Cancel job
  await api.post(`/queue/jobs/${job.id}/cancel`);
  console.log('Job cancelled');
}

jobControlDemo().catch(console.error);
```

## Python Example

```python
import requests
import time

API_BASE = 'http://localhost:3000'
TOKEN = 'your-jwt-token'

headers = {
    'Authorization': f'Bearer {TOKEN}',
    'Content-Type': 'application/json'
}

def job_control_demo():
    # 1. Create job
    response = requests.post(
        f'{API_BASE}/queue/jobs',
        headers=headers,
        json={
            'type': 'data-processing',
            'payload': {'test': 'data'},
            'userId': 'demo-user'
        }
    )
    job = response.json()
    job_id = job['id']
    print(f'Created job: {job_id}')
    
    # 2. Check status
    response = requests.get(
        f'{API_BASE}/queue/jobs/{job_id}/status',
        headers=headers
    )
    status = response.json()
    print(f"Job state: {status['state']}")
    
    # 3. Pause job
    requests.post(
        f'{API_BASE}/queue/jobs/{job_id}/pause',
        headers=headers
    )
    print('Job paused')
    
    # 4. Wait a bit
    time.sleep(2)
    
    # 5. Resume job
    requests.post(
        f'{API_BASE}/queue/jobs/{job_id}/resume',
        headers=headers
    )
    print('Job resumed')
    
    # 6. Cancel job
    requests.post(
        f'{API_BASE}/queue/jobs/{job_id}/cancel',
        headers=headers
    )
    print('Job cancelled')

if __name__ == '__main__':
    job_control_demo()
```

## Troubleshooting

### "403 Forbidden" Error

You need operator or admin role to use control operations. Regular users can only view job status.

**Solution:** Request role upgrade from your administrator.

### "404 Not Found" Error

The job doesn't exist or has been removed.

**Solution:** Verify the job ID is correct and the job hasn't been cancelled.

### "400 Bad Request" Error

The operation is not valid for the current job state.

**Solution:** Check the job status first and ensure the operation is appropriate for that state.

## Next Steps

- Read the [full API documentation](./JOB_CONTROL_API.md)
- Learn about [Queue Metrics](./QUEUE_METRICS.md)
- Explore [Job Provenance](./PROVENANCE_IMPLEMENTATION.md)
- Check out [Provider Plugin System](./PROVIDER_PLUGIN_SYSTEM.md)

## Getting Help

- Check the [API documentation](./JOB_CONTROL_API.md) for detailed information
- Review test files for more examples
- Contact your system administrator for access issues
