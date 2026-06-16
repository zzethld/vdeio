# e2e/admin-lockout-flow.ps1 - E2E: Admin Login Lockout
# Tests: 5 failed login attempts lock the account; 6th attempt returns 403.
param([switch]$WhatIf)

. "$PSScriptRoot\common.ps1"
Set-E2EWhatIf $WhatIf.IsPresent

$Global:E2E_BASE_URL = if ($env:VDEIO_BASE_URL) { $env:VDEIO_BASE_URL } else { "http://localhost:3000/api/v1" }
$Global:E2E_PASS_COUNT = 0
$Global:E2E_FAIL_COUNT = 0

Write-Host "`n=== E2E: Admin Login Lockout ===" -ForegroundColor White

$EvidenceDir = Join-Path (Join-Path (Join-Path $PSScriptRoot "..") ".sisyphus") "evidence"
if (-not (Test-Path $EvidenceDir)) {
    New-Item -ItemType Directory -Path $EvidenceDir -Force | Out-Null
}
$EvidenceFile = Join-Path $EvidenceDir "task-admin-lockout-e2e.log"
$EvidenceLines = [System.Collections.Generic.List[string]]::new()
function Write-Evidence([string]$Line) {
    $timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    $entry = "[$timestamp] $Line"
    $EvidenceLines.Add($entry)
    Write-Host $entry
}

$username = "admin"
$wrongPassword = "wrong-password-$(Get-Random)"

# Step 1: Verify server reachable
Write-Step "1" "Verify server health endpoint"
try {
    if (Test-E2EServerReachable) {
        Write-Pass "Server is reachable"
        Write-Evidence "Step 1 PASS: Server reachable"
    }
    else {
        Write-Fail "Server is not reachable at $Global:E2E_BASE_URL"
        Write-Evidence "Step 1 FAIL: Server not reachable"
    }
}
catch {
    Write-Fail "Health check exception: $($_.Exception.Message)"
    Write-Evidence "Step 1 FAIL: Health check exception: $($_.Exception.Message)"
}

# Step 2: Fail login 5 times
Write-Step "2" "Fail admin login 5 times (expect 401)"
$all401 = $true
for ($i = 1; $i -le 5; $i++) {
    try {
        $result = Invoke-ApiCall -Method "POST" -Path "/admin/auth/login" -Body @{
            username = $username
            password = $wrongPassword
        } -ExpectedStatus 401

        if ($result.whatIf) {
            Write-Pass "Attempt $i returned 401 (WhatIf)"
            Write-Evidence "Step 2 PASS: Attempt $i (WhatIf)"
        }
        elseif ($result.status -eq 401) {
            Write-Pass "Attempt $i returned 401"
            Write-Evidence "Step 2 PASS: Attempt $i status=401"
        }
        else {
            Write-Fail "Attempt $i expected 401 but got status=$($result.status)"
            Write-Evidence "Step 2 FAIL: Attempt $i status=$($result.status)"
            $all401 = $false
        }
    }
    catch {
        Write-Fail "Attempt $i exception: $($_.Exception.Message)"
        Write-Evidence "Step 2 FAIL: Attempt $i exception: $($_.Exception.Message)"
        $all401 = $false
    }
}
if ($all401) {
    Write-Pass "All 5 failed attempts returned 401"
}

# Step 3: 6th attempt should be locked
Write-Step "3" "6th failed login attempt (expect 403 lockout)"
try {
    $lockoutResult = Invoke-ApiCall -Method "POST" -Path "/admin/auth/login" -Body @{
        username = $username
        password = $wrongPassword
    } -ExpectedStatus 403

    if ($lockoutResult.whatIf) {
        Write-Pass "6th attempt returned 403 (WhatIf)"
        Write-Evidence "Step 3 PASS: 6th attempt lockout (WhatIf)"
    }
    elseif ($lockoutResult.status -eq 403) {
        $bodyText = $lockoutResult.body | ConvertTo-Json -Compress
        if ($bodyText -match "15" -or $bodyText -match "lock" -or $bodyText -match "锁定") {
            Write-Pass "6th attempt returned 403 lockout - $bodyText"
            Write-Evidence "Step 3 PASS: 6th attempt lockout - $bodyText"
        }
        else {
            Write-Pass "6th attempt returned 403 (lockout) - $bodyText"
            Write-Evidence "Step 3 PASS: 6th attempt lockout - $bodyText"
        }
    }
    else {
        Write-Fail "Expected 403 lockout but got status=$($lockoutResult.status)"
        Write-Evidence "Step 3 FAIL: 6th attempt status=$($lockoutResult.status)"
    }
}
catch {
    Write-Fail "6th attempt exception: $($_.Exception.Message)"
    Write-Evidence "Step 3 FAIL: 6th attempt exception: $($_.Exception.Message)"
}

# Note: Automatic unlock after 15 minutes is not tested here to keep the flow fast.

$EvidenceLines | Out-File -FilePath $EvidenceFile -Encoding utf8
Write-Host "`nEvidence saved to: $EvidenceFile" -ForegroundColor Gray

Write-Summary "Admin Login Lockout"
