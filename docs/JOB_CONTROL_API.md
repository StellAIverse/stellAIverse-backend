# Job Control API Documentation

## Overview

The Job Control API provides fine-grained control over compute jobs in the queue system. Operators and administrators can pause, resume, and cancel jobs, as well as query detailed job status information.

## Features

- **Pause Jobs**: Temporarily halt queued or delayed jobs
- **Resume Jobs**: Restart paused jobs
- **Cancel Jobs**: Remove jobs from the queue
- **Detailed Status**: Query comprehensive job information including progress, state, and metadata
- **Role-Based Access**: Enforces authentication and authorization for control operations

## Authentication & Authorization

All endpoints require JWT authentication via Bearer token:

```
Authorization: Bearer <your-jwt-token>
```

### Required Roles

| Endpoint | Required Role |
|----------|--------------|
| `GET /queue/jobs/:id/status` | `user`, `operator`, `admin` |
| `POST /queue/jobs/:id/pause` | `operator`, `admin` |
| `POST /queue/jobs/:id/resume` | `operator`, `admin` |
| `POST /queue/jobs/:id/cancel` | `operator`, `admin` |

## API Endpoints

### 1. Get Job Status

Retrieve detailed information about a specific job.

**Endpoint:** `GET /queue/jobs/:id/status`

**Parameters:**
- `id` (path): Job ID

**Response:** `200 OK`

```json
{
  "id": "data-processing-user-123-1234567890",
  "type": "data-processing",
  "state": "active",
  "progress": 45,
  "attemptsMade": 1,
  "createdAt": "2026-02-25T10:00:00Z",
  "processedOn": "2026-02-25T10:01:00Z",
  "finishedOn": null,
  "result": null,
  "failedReason": null,
  "metadata": {
    "userId": "user-123",
    "priority": "high",
    "source": "api"
  }
}
```

**Job States:**
- `waiting`: Job is queued and waiting to be processed
- `active`: Job is currently being processed
- `completed`: Job finished successfully
- `failed`: Job failed after all retry attempts
- `delayed`: Job is scheduled for future execution
- `paused`: Job has been manually paused

**Error Responses:**
- `404 Not Found`: Job does not exist

**Example:**

```bash
curl -X GET \
  https://api.example.com/queue/jobs/data-processing-user-123-1234567890/status \
  -H 'Authorization: Bearer <token>'
```

---

### 2. Pause Job

Temporarily halt a queued or delayed job. The job will not be processed until resumed.

**Endpoint:** `POST /queue/jobs/:id/pause`

**Parameters:**
- `id` (path): Job ID

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Job data-processing-user-123-1234567890 paused successfully",
  "jobId": "data-processing-user-123-1234567890",
  "previousState": "waiting",
  "newState": "paused"
}
```

**Constraints:**
- Only jobs in `waiting` or `delayed` state can be paused
- Active jobs cannot be paused (they must complete or fail first)
- Completed or failed jobs cannot be paused

**Error Responses:**
- `400 Bad Request`: Job cannot be paused in current state
- `404 Not Found`: Job does not exist
- `403 Forbidden`: Insufficient permissions

**Example:**

```bash
curl -X POST \
  https://api.example.com/queue/jobs/data-processing-user-123-1234567890/pause \
  -H 'Authorization: Bearer <token>'
```

---

### 3. Resume Job

Restart a paused job, returning it to the queue for processing.

**Endpoint:** `POST /queue/jobs/:id/resume`

**Parameters:**
- `id` (path): Job ID

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Job data-processing-user-123-1234567890 resumed successfully",
  "jobId": "data-processing-user-123-1234567890",
  "previousState": "paused",
  "newState": "waiting"
}
```

**Constraints:**
- Only paused jobs can be resumed
- Resumed jobs return to `waiting` state

**Error Responses:**
- `400 Bad Request`: Job is not paused
- `404 Not Found`: Job does not exist
- `403 Forbidden`: Insufficient permissions

**Example:**

```bash
curl -X POST \
  https://api.example.com/queue/jobs/data-processing-user-123-1234567890/resume \
  -H 'Authorization: Bearer <token>'
```

---

### 4. Cancel Job

Remove a job from the queue. This operation is irreversible.

**Endpoint:** `POST /queue/jobs/:id/cancel`

**Parameters:**
- `id` (path): Job ID

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Job data-processing-user-123-1234567890 cancelled successfully",
  "jobId": "data-processing-user-123-1234567890",
  "previousState": "waiting"
}
```

**Constraints:**
- Completed jobs cannot be cancelled
- Active jobs can be cancelled, but execution may not stop immediately
- Failed, waiting, delayed, and paused jobs can be cancelled

**Error Responses:**
- `400 Bad Request`: Job cannot be cancelled (e.g., already completed)
- `404 Not Found`: Job does not exist
- `403 Forbidden`: Insufficient permissions

**Example:**

```bash
curl -X POST \
  https://api.example.com/queue/jobs/data-processing-user-123-1234567890/cancel \
  -H 'Authorization: Bearer <token>'
```

---

## Usage Examples

### Complete Workflow

```typescript
// 1. Create a job
const createResponse = await fetch('https://api.example.com/queue/jobs', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 'data-processing',
    payload: { records: [...] },
    userId: 'user-123',
    priority: 5,
  }),
});

const { id: jobId } = await createResponse.json();

// 2. Check job status
const statusResponse = await fetch(
  `https://api.example.com/queue/jobs/${jobId}/status`,
  {
    headers: { 'Authorization': `Bearer ${token}` },
  }
);

const status = await statusResponse.json();
console.log('Job state:', status.state);

// 3. Pause the job if needed
if (status.state === 'waiting') {
  await fetch(`https://api.example.com/queue/jobs/${jobId}/pause`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });
}

// 4. Resume when ready
await fetch(`https://api.example.com/queue/jobs/${jobId}/resume`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
});

// 5. Cancel if no longer needed
await fetch(`https://api.example.com/queue/jobs/${jobId}/cancel`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
});
```

### Monitoring Long-Running Jobs

```typescript
async function monitorJob(jobId: string, token: string) {
  const checkInterval = 5000; // 5 seconds
  
  while (true) {
    const response = await fetch(
      `https://api.example.com/queue/jobs/${jobId}/status`,
      {
        headers: { 'Authorization': `Bearer ${token}` },
      }
    );
    
    if (response.status === 404) {
      console.log('Job not found or cancelled');
      break;
    }
    
    const status = await response.json();
    console.log(`Job ${jobId}: ${status.state} (${status.progress}%)`);
    
    if (status.state === 'completed') {
      console.log('Job completed:', status.result);
      break;
    }
    
    if (status.state === 'failed') {
      console.error('Job failed:', status.failedReason);
      break;
    }
    
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
}
```

### Batch Operations

```typescript
async function pauseAllUserJobs(userId: string, token: string) {
  // Get all jobs for user (assuming you have an endpoint for this)
  const jobsResponse = await fetch(
    `https://api.example.com/queue/jobs?userId=${userId}`,
    {
      headers: { 'Authorization': `Bearer ${token}` },
    }
  );
  
  const jobs = await jobsResponse.json();
  
  // Pause all waiting jobs
  const pausePromises = jobs
    .filter(job => job.state === 'waiting')
    .map(job => 
      fetch(`https://api.example.com/queue/jobs/${job.id}/pause`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      })
    );
  
  await Promise.all(pausePromises);
  console.log(`Paused ${pausePromises.length} jobs`);
}
```

## Best Practices

1. **Check Job State Before Operations**: Always verify the job state before attempting pause/resume/cancel operations to avoid errors.

2. **Handle Active Jobs Carefully**: Cancelling active jobs may not stop execution immediately. Consider waiting for completion or implementing graceful shutdown mechanisms.

3. **Use Pause for Temporary Holds**: Use pause/resume for temporary holds (e.g., maintenance windows). For permanent removal, use cancel.

4. **Monitor Job Progress**: Regularly poll job status for long-running operations to track progress and detect failures early.

5. **Implement Retry Logic**: Network issues may cause API calls to fail. Implement exponential backoff retry logic for critical operations.

6. **Respect Rate Limits**: Avoid excessive polling. Use reasonable intervals (5-10 seconds) when monitoring job status.

7. **Clean Up Completed Jobs**: Periodically cancel or remove old completed jobs to prevent queue bloat.

## Error Handling

```typescript
async function safeJobControl(
  jobId: string,
  operation: 'pause' | 'resume' | 'cancel',
  token: string
) {
  try {
    const response = await fetch(
      `https://api.example.com/queue/jobs/${jobId}/${operation}`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      
      switch (response.status) {
        case 404:
          console.error('Job not found');
          break;
        case 400:
          console.error('Invalid operation:', error.message);
          break;
        case 403:
          console.error('Insufficient permissions');
          break;
        default:
          console.error('Unexpected error:', error);
      }
      
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('Network error:', error);
    return null;
  }
}
```

## Testing

### Unit Tests

Run unit tests for job control service methods:

```bash
npm test -- job-control.service.spec.ts
```

### Integration Tests

Run integration tests for API endpoints:

```bash
npm test -- job-control.integration.spec.ts
```

### E2E Tests

Run end-to-end tests for complete workflows:

```bash
npm run test:e2e -- job-control.e2e-spec.ts
```

## Security Considerations

1. **Authentication Required**: All endpoints require valid JWT tokens
2. **Role-Based Access**: Control operations restricted to operators and admins
3. **Job Ownership**: Consider implementing job ownership checks to prevent unauthorized access
4. **Audit Logging**: All control operations should be logged for security audits
5. **Rate Limiting**: Implement rate limiting to prevent abuse

## Performance Considerations

1. **Redis Connection**: Job control operations interact with Redis. Ensure Redis is properly configured and monitored.
2. **Concurrent Operations**: Multiple pause/resume/cancel operations on the same job may cause race conditions. Implement proper locking if needed.
3. **Large Queues**: Status queries on large queues may be slow. Consider implementing pagination and caching.

## Troubleshooting

### Job Won't Pause

- Verify job is in `waiting` or `delayed` state
- Check if job has already started processing (state: `active`)
- Ensure you have operator or admin role

### Job Won't Resume

- Verify job is actually paused (check metadata.paused field)
- Ensure job wasn't cancelled while paused
- Check Redis connection health

### Job Status Returns 404

- Job may have been cancelled or removed
- Job ID may be incorrect
- Job may have expired (check removeOnComplete settings)

## Related Documentation

- [Queue Metrics](./QUEUE_METRICS.md)
- [Job Provenance](./PROVENANCE_IMPLEMENTATION.md)
- [Provider Plugin System](./PROVIDER_PLUGIN_SYSTEM.md)
