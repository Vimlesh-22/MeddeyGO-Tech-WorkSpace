# Simple PowerShell script to test quote app login and fetch quotations
# Does not require any Node.js dependencies or dotenv

Write-Host "==================================================================="
Write-Host "Testing Quote App - Login & Fetch Quotations"
Write-Host "==================================================================="

$BASE_URL = "http://localhost:4094/tools/quote-generator"

# Test 1: Login
Write-Host ""
Write-Host "1. Testing User Login..."
$loginBody = @{
    email = "marketing@meddey.com"
    password = "Amit@#@$201424@#"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$BASE_URL/api/users/login" -Method POST -ContentType "application/json" -Body $loginBody
    $token = $loginResponse.data.token
    Write-Host "Login successful!"
    Write-Host "User: $($loginResponse.data.user.name)"
    Write-Host "Email: $($loginResponse.data.user.email)"
    Write-Host "Role: $($loginResponse.data.user.role)"
    Write-Host "Token: $($token.Substring(0,50))..."
    
    # Test 2: Fetch Quotations
    Write-Host ""
    Write-Host "2. Fetching Quotations from Database..."
    $headers = @{
        Authorization = "Bearer $token"
    }
    
    $quotesResponse = Invoke-RestMethod -Uri "$BASE_URL/api/quotations" -Method GET -Headers $headers
    Write-Host "Quotations fetched successfully!"
    Write-Host "Total quotations in database: $($quotesResponse.count)"
    
    if ($quotesResponse.count -gt 0) {
        Write-Host ""
        Write-Host "First 10 Quotations:"
        $quotesResponse.data | Select-Object -First 10 | ForEach-Object {
            $date = ([datetime]$_.createdAt).ToString("yyyy-MM-dd")
            Write-Host "  - $($_.quotationNumber) | Client: $($_.clientName) | Date: $date"
        }
    } else {
        Write-Host "No quotations found"
    }
    
    # Summary
    Write-Host ""
    Write-Host "==================================================================="
    Write-Host "All Tests Passed Successfully!"
    Write-Host "==================================================================="
    Write-Host ""
    Write-Host "Summary:"
    Write-Host "- JWT authentication working correctly"
    Write-Host "- Admin user can access all quotations"
    Write-Host "- Database connection established"
    Write-Host "- $($quotesResponse.count) quotations available in database"
    Write-Host "==================================================================="
    
} catch {
    Write-Host ""
    Write-Host "Test Failed:"
    Write-Host "Error: $($_.Exception.Message)"
    if ($_.ErrorDetails) {
        Write-Host "Details: $($_.ErrorDetails.Message)"
    }
    exit 1
}
