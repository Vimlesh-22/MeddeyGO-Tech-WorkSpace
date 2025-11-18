# Quick server diagnostic script
Write-Host "🔍 Checking server status..." -ForegroundColor Cyan
Write-Host ""

# Check if port 4090 is listening
$port4090 = netstat -ano | findstr ":4090" | findstr "LISTENING"
if ($port4090) {
    Write-Host "✅ Port 4090 is listening" -ForegroundColor Green
    Write-Host "   $port4090" -ForegroundColor Gray
} else {
    Write-Host "❌ Port 4090 is NOT listening" -ForegroundColor Red
    Write-Host "   Server may not be running" -ForegroundColor Yellow
}

Write-Host ""

# Check if .env file exists
$envPath = Join-Path $PSScriptRoot ".env"
if (Test-Path $envPath) {
    Write-Host "✅ .env file exists" -ForegroundColor Green
} else {
    Write-Host "❌ .env file is MISSING!" -ForegroundColor Red
    Write-Host "   This is required after environment centralization" -ForegroundColor Yellow
    Write-Host "   Copy .env.example to .env and fill in values" -ForegroundColor Yellow
}

Write-Host ""

# Test HTTP connection
Write-Host "🌐 Testing HTTP connection..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "http://localhost:4090" -Method GET -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    Write-Host "✅ Server is responding!" -ForegroundColor Green
    Write-Host "   Status Code: $($response.StatusCode)" -ForegroundColor Gray
    Write-Host "   URL: http://localhost:4090" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Server is NOT responding" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "💡 Try these solutions:" -ForegroundColor Cyan
    Write-Host "   1. Make sure you're accessing: http://localhost:4090 (NOT :3000)" -ForegroundColor White
    Write-Host "   2. Check if server crashed - look for error messages in terminal" -ForegroundColor White
    Write-Host "   3. Restart the server: npm run dev" -ForegroundColor White
    Write-Host "   4. Check .env file has all required variables" -ForegroundColor White
}

Write-Host ""
Write-Host "📋 Quick Fixes:" -ForegroundColor Cyan
Write-Host "   • Access: http://localhost:4090 (not http://localhost)" -ForegroundColor White
Write-Host "   • If server crashed, check terminal for missing env variable errors" -ForegroundColor White
Write-Host "   • Restart: npm run dev" -ForegroundColor White

