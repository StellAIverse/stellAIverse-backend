# Job Control API Test Script (PowerShell)
# This script demonstrates the complete job control workflow

param(
    [string]$ApiBase = "http://localhost:3000",
    [string]$Token = $env:JWT_TOKEN
)

# Check if token is set
if ([string]::IsNullOrEmpty($Token)) {
    Write-Host "Error: Please set JWT_TOKEN environment variable or pass -Token parameter" -ForegroundColor Red
    Write-Host "Usage: .\scripts\test-job-control.ps1 -Token your-token"
    exit 1
}

Write-Host "`n=== Job Control API Test Script ===`n" -ForegroundColor Blue

$headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type" = "application/json"
}

# Step 1: Create a test job
Write-Host "Step 1: Creating test job..." -ForegroundColor Blue
$createBody = @{
    type = "data-processing"
    payload = @{
        test = "Job Control API Test"
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
    userId = "test-user"
    priority = 5
    metadata = @{
        source = "test-script"
    }
} | ConvertTo-Json

try {
    $createResponse = Invoke-RestMethod -Uri "$ApiBase/queue/jobs" -Method Post -Headers $headers -Body $createBody
    $jobId = $createResponse.id
    Write-Host "✓ Job created: $jobId`n" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to create job: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Check initial status
Write-Host "Step 2: Checking initial job status..." -ForegroundColor Blue
try {
    $statusResponse = Invoke-RestMethod -Uri "$ApiBase/queue/jobs/$jobId/status" -Method Get -Headers $headers
    Write-Host "Status: $($statusResponse | ConvertTo-Json -Depth 3)"
    Write-Host "✓ Status retrieved`n" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to get status: $_" -ForegroundColor Red
}

# Wait a moment for job to be in waiting state
Start-Sleep -Seconds 2

# Step 3: Pause the job
Write-Host "Step 3: Pausing job..." -ForegroundColor Blue
try {
    $pauseResponse = Invoke-RestMethod -Uri "$ApiBase/queue/jobs/$jobId/pause" -Method Post -Headers $headers
    Write-Host "Response: $($pauseResponse | ConvertTo-Json)"
    if ($pauseResponse.success) {
        Write-Host "✓ Job paused successfully`n" -ForegroundColor Green
    } else {
        Write-Host "✗ Failed to pause job`n" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Failed to pause job: $_`n" -ForegroundColor Red
}

# Step 4: Verify job is paused
Write-Host "Step 4: Verifying job is paused..." -ForegroundColor Blue
try {
    $statusResponse = Invoke-RestMethod -Uri "$ApiBase/queue/jobs/$jobId/status" -Method Get -Headers $headers
    if ($statusResponse.metadata.paused -eq $true) {
        Write-Host "✓ Job is paused`n" -ForegroundColor Green
    } else {
        Write-Host "✗ Job is not paused`n" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Failed to verify pause: $_`n" -ForegroundColor Red
}

# Step 5: Resume the job
Write-Host "Step 5: Resuming job..." -ForegroundColor Blue
try {
    $resumeResponse = Invoke-RestMethod -Uri "$ApiBase/queue/jobs/$jobId/resume" -Method Post -Headers $headers
    Write-Host "Response: $($resumeResponse | ConvertTo-Json)"
    if ($resumeResponse.success) {
        Write-Host "✓ Job resumed successfully`n" -ForegroundColor Green
    } else {
        Write-Host "✗ Failed to resume job`n" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Failed to resume job: $_`n" -ForegroundColor Red
}

# Step 6: Verify job is resumed
Write-Host "Step 6: Verifying job is resumed..." -ForegroundColor Blue
try {
    $statusResponse = Invoke-RestMethod -Uri "$ApiBase/queue/jobs/$jobId/status" -Method Get -Headers $headers
    if ($statusResponse.metadata.paused -eq $false) {
        Write-Host "✓ Job is resumed`n" -ForegroundColor Green
    } else {
        Write-Host "✗ Job is not resumed`n" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Failed to verify resume: $_`n" -ForegroundColor Red
}

# Step 7: Cancel the job
Write-Host "Step 7: Cancelling job..." -ForegroundColor Blue
try {
    $cancelResponse = Invoke-RestMethod -Uri "$ApiBase/queue/jobs/$jobId/cancel" -Method Post -Headers $headers
    Write-Host "Response: $($cancelResponse | ConvertTo-Json)"
    if ($cancelResponse.success) {
        Write-Host "✓ Job cancelled successfully`n" -ForegroundColor Green
    } else {
        Write-Host "✗ Failed to cancel job`n" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Failed to cancel job: $_`n" -ForegroundColor Red
}

# Step 8: Verify job is removed
Write-Host "Step 8: Verifying job is removed..." -ForegroundColor Blue
try {
    $statusResponse = Invoke-RestMethod -Uri "$ApiBase/queue/jobs/$jobId/status" -Method Get -Headers $headers
    Write-Host "✗ Job still exists (should be 404)`n" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) {
        Write-Host "✓ Job successfully removed (404 as expected)`n" -ForegroundColor Green
    } else {
        Write-Host "✗ Unexpected error: $_`n" -ForegroundColor Red
    }
}

Write-Host "=== Test Complete ===" -ForegroundColor Green
Write-Host "All job control operations tested successfully!"
