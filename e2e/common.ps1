# e2e/common.ps1 - Shared E2E test functions
# This file is dot-sourced by all flow scripts. DO NOT run it directly.

# --- Configuration ---
$E2E_BASE_URL = if ($env:VDEIO_BASE_URL) { $env:VDEIO_BASE_URL } else { "http://localhost:3000/api/v1" }
$E2E_WHAT_IF = $false
$E2E_PASS_COUNT = 0
$E2E_FAIL_COUNT = 0

function Set-E2EWhatIf([bool]$Enabled) {
    $script:E2E_WHAT_IF = $Enabled
    Set-Variable -Name "E2E_WHAT_IF" -Value $Enabled -Scope Global
}

function Write-Step([string]$StepNum, [string]$Description) {
    Write-Host "`n[Step $StepNum] $Description" -ForegroundColor Cyan
}

function Write-Result([string]$Label, $Value) {
    Write-Host ("  " + $Label + ": " + $Value) -ForegroundColor Green
}

function Write-Fail([string]$Message) {
    Write-Host "  FAIL: $Message" -ForegroundColor Red
    $global:E2E_FAIL_COUNT++
}

function Write-Pass([string]$Message) {
    Write-Host "  PASS: $Message" -ForegroundColor Green
    $global:E2E_PASS_COUNT++
}

function Write-Info([string]$Message) {
    Write-Host "  INFO: $Message" -ForegroundColor Gray
}

function Get-E2EWhatIf {
    return (Get-Variable -Name "E2E_WHAT_IF" -Scope Global -ValueOnly)
}

# --- API call wrapper ---

function Invoke-ApiCall {
    param(
        [Parameter(Mandatory)][ValidateSet("GET", "POST", "PUT", "DELETE", "PATCH")][string]$Method,
        [Parameter(Mandatory)][string]$Path,
        [object]$Body,
        [string]$Token,
        [int]$ExpectedStatus = 200
    )

    $isWhatIf = Get-E2EWhatIf

    if ($isWhatIf) {
        Write-Host "  [WhatIf] $Method $Path" -ForegroundColor Yellow
        if ($Body) {
            Write-Host "  [WhatIf] Body: $($Body | ConvertTo-Json -Compress)" -ForegroundColor Yellow
        }
        return @{ status = $ExpectedStatus; body = @{ success = $true }; whatIf = $true }
    }

    # --- Actual API call (to be implemented in Wave 5) ---
    $headers = @{
        "Content-Type" = "application/json"
    }
    if ($Token) {
        $headers["Authorization"] = "Bearer $Token"
    }

    $baseUrl = (Get-Variable -Name "E2E_BASE_URL" -Scope Global -ValueOnly)
    $uri = "$baseUrl$Path"
    $params = @{
        Method  = $Method
        Uri     = $uri
        Headers = $headers
    }
    if ($Body -and $Method -ne "GET") {
        $params["Body"] = ($Body | ConvertTo-Json -Depth 10)
    }

    try {
        $response = Invoke-WebRequest @params -UseBasicParsing
        $respBody = $response.Content | ConvertFrom-Json
        return @{ status = [int]$response.StatusCode; body = $respBody; whatIf = $false }
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        return @{ status = $statusCode; body = @{ error = $_.Exception.Message }; whatIf = $false; error = $true }
    }
}

# --- Auth helpers (stubs for Wave 5) ---

function Get-AdminToken {
    param(
        [string]$Username = "admin",
        [string]$Password = "admin123"
    )

    Write-Info "Requesting admin token for user: $Username"
    $result = Invoke-ApiCall -Method "POST" -Path "/admin/auth/login" -Body @{
        username = $Username
        password = $Password
    }

    if ($result.whatIf) {
        Write-Result "Token" "(WhatIf - not real)"
        return "whatif-admin-token"
    }

    if ($result.status -eq 200 -and $result.body.accessToken) {
        return $result.body.accessToken
    }
    Write-Info "Failed to extract admin token: status=$($result.status)"
    return $null
}

function Get-DeviceToken {
    param(
        [string]$DeviceId,
        [string]$DeviceKey
    )

    Write-Info "Requesting device token for device: $DeviceId"
    $result = Invoke-ApiCall -Method "POST" -Path "/devices/register" -Body @{
        deviceId  = $DeviceId
        deviceKey = $DeviceKey
    }

    if ($result.whatIf) {
        Write-Result "Token" "(WhatIf - not real)"
        return "whatif-device-token"
    }

    if ($result.status -eq 200 -and $result.body.deviceToken) {
        return $result.body.deviceToken
    }
    Write-Info "Failed to extract device token: status=$($result.status)"
    return $null
}

# --- Summary ---

function Test-E2EServerReachable {
    try {
        $baseUrl = (Get-Variable -Name "E2E_BASE_URL" -Scope Global -ValueOnly)
        # The /health endpoint is mounted at the Express root, not under /api/v1
        $rootUrl = $baseUrl -replace '/api/v1$', ''
        $resp = Invoke-WebRequest -Uri "$rootUrl/health" -Method GET -UseBasicParsing -TimeoutSec 5
        return ($resp.StatusCode -eq 200)
    }
    catch {
        return $false
    }
}

function Write-Summary([string]$FlowName) {
    Write-Host "`n========================================" -ForegroundColor White
    Write-Host "  $FlowName - Summary" -ForegroundColor White
    Write-Host "========================================" -ForegroundColor White
    $passCount = (Get-Variable -Name "E2E_PASS_COUNT" -Scope Global -ValueOnly)
    $failCount = (Get-Variable -Name "E2E_FAIL_COUNT" -Scope Global -ValueOnly)
    Write-Host "  Passed: $passCount" -ForegroundColor Green
    Write-Host "  Failed: $failCount" -ForegroundColor $(if ($failCount -gt 0) { "Red" } else { "Green" })
    Write-Host "  Total:  $($passCount + $failCount)" -ForegroundColor White
    Write-Host "========================================`n" -ForegroundColor White

    if ($failCount -gt 0) {
        exit 1
    }
}
