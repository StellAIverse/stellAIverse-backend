# Verification Script for Queue Metrics Implementation
Write-Host "`n🔍 Verifying Queue Metrics Implementation...`n" -ForegroundColor Cyan

$Passed = 0
$Failed = 0

function CheckFile($path) {
    if (Test-Path $path) {
        Write-Host "✓ Found: $path" -ForegroundColor Green
        $script:Passed++
    }
    else {
        Write-Host "✗ Missing: $path" -ForegroundColor Red
        $script:Failed++
    }
}

Write-Host "📁 Core Implementation Files" -ForegroundColor Yellow
CheckFile "src/config/metrics.ts"
CheckFile "src/compute-job-queue/compute-job.processor.ts"
CheckFile "src/compute-job-queue/queue.service.ts"
CheckFile "src/compute-job-queue/services/queue-metrics.service.ts"
CheckFile "src/compute-job-queue/compute-job-queue.module.ts"

Write-Host "`n🧪 Test Files" -ForegroundColor Yellow
CheckFile "src/compute-job-queue/queue-metrics.integration.spec.ts"

Write-Host "`n📚 Documentation Files" -ForegroundColor Yellow
CheckFile "docs/QUEUE_METRICS.md"
CheckFile "docs/QUEUE_METRICS_QUICK_START.md"
CheckFile "docs/METRICS_ARCHITECTURE.md"
CheckFile "docs/METRICS_MIGRATION_GUIDE.md"
CheckFile "docs/README_METRICS.md"

Write-Host "`n📝 Example Files" -ForegroundColor Yellow
CheckFile "src/examples/queue-metrics-usage.ts"

Write-Host "`n📊 Summary" -ForegroundColor Cyan
Write-Host "Passed: $Passed" -ForegroundColor Green
Write-Host "Failed: $Failed" -ForegroundColor Red

if ($Failed -eq 0) {
    Write-Host "`n✅ All checks passed! Implementation is complete.`n" -ForegroundColor Green
    Write-Host "Next steps:"
    Write-Host "1. Run tests: npm test -- queue-metrics.integration.spec.ts"
    Write-Host "2. Start app: npm run start:dev"
    Write-Host "3. Check metrics: curl http://localhost:3000/metrics"
}
else {
    Write-Host "`n❌ Some checks failed. Please review the missing items.`n" -ForegroundColor Red
}
