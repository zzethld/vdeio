# e2e/encryption-policy-flow.ps1 - E2E: Configurable Encryption Policy Flow
# Tests: admin login -> pick video -> set code policy -> create access code ->
#        device register/bind -> key denied (403) without code -> unlock with code ->
#        key granted (200) with code -> switch to open -> key granted without code -> cleanup.
#
# Dry run (no HTTP):  powershell -ExecutionPolicy Bypass -File .\e2e\encryption-policy-flow.ps1 -WhatIf
# Live run:           powershell -ExecutionPolicy Bypass -File .\e2e\encryption-policy-flow.ps1
param([switch]$WhatIf)

. "$PSScriptRoot\common.ps1"
Set-E2EWhatIf $WhatIf.IsPresent

# Workaround: common.ps1 uses Get-Variable -Scope Global but dot-sourcing
# from a script doesn't put vars in global scope. Initialize them explicitly.
$Global:E2E_BASE_URL = if ($env:VDEIO_BASE_URL) { $env:VDEIO_BASE_URL } else { "http://localhost:3000/api/v1" }
$Global:E2E_PASS_COUNT = 0
$Global:E2E_FAIL_COUNT = 0

Write-Host "`n=== E2E: Configurable Encryption Policy Flow ===" -ForegroundColor White

# --- Evidence logging setup ---
$EvidenceDir = Join-Path (Join-Path (Join-Path $PSScriptRoot "..") ".sisyphus") "evidence"
if (-not (Test-Path $EvidenceDir)) {
    New-Item -ItemType Directory -Path $EvidenceDir -Force | Out-Null
}
$EvidenceFile = Join-Path $EvidenceDir "task-16-encryption-policy-e2e.log"
$EvidenceLines = [System.Collections.Generic.List[string]]::new()
function Write-Evidence([string]$Line) {
    $timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    $EvidenceLines.Add("[$timestamp] $Line")
}

# --- Binary key endpoint helper ---
# GET /devices/videos/:id/key returns the raw AES key bytes, NOT JSON.
# The shared Invoke-ApiCall would fail JSON-parsing a 200 binary body, so this
# helper captures only the HTTP status code (which is all the assertions need).
function Invoke-BinaryKey {
    param(
        [Parameter(Mandatory)][string]$Path,
        [string]$Token,
        [int]$ExpectedStatus = 200
    )
    $isWhatIf = Get-E2EWhatIf
    if ($isWhatIf) {
        Write-Host "  [WhatIf] GET $Path" -ForegroundColor Yellow
        return @{ status = $ExpectedStatus; whatIf = $true }
    }
    $headers = @{}
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    $baseUrl = (Get-Variable -Name "E2E_BASE_URL" -Scope Global -ValueOnly)
    $uri = "$baseUrl$Path"
    try {
        $response = Invoke-WebRequest -Uri $uri -Method GET -Headers $headers -UseBasicParsing
        return @{ status = [int]$response.StatusCode; whatIf = $false }
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        return @{ status = $statusCode; whatIf = $false; error = $true }
    }
}

# --- State ---
$adminToken   = $null
$deviceToken  = $null
$videoId      = $null
$storeId      = $null
$codeId       = $null
$accessCode   = "E2E-TEST-001"
$deviceId     = "e2e-dev-" + [guid]::NewGuid().ToString("N").Substring(0, 8)

# ============================================================
# Step 1: Admin login
# ============================================================
Write-Step "1" "Admin login (POST /admin/auth/login)"
try {
    $loginResult = Invoke-ApiCall -Method "POST" -Path "/admin/auth/login" -Body @{
        username = "admin"
        password = "admin123"
    }
    if ($loginResult.whatIf) {
        $adminToken = "whatif-admin-token"
        Write-Pass "Admin login (WhatIf)"
        Write-Evidence "Step 1 PASS: Admin login (WhatIf)"
    }
    elseif ($loginResult.status -eq 200 -and $loginResult.body.accessToken) {
        $adminToken = $loginResult.body.accessToken
        Write-Pass "Admin login succeeded (token received)"
        Write-Evidence "Step 1 PASS: Admin login - status=$($loginResult.status)"
    }
    else {
        Write-Fail "Admin login failed: status=$($loginResult.status), body=$($loginResult.body | ConvertTo-Json -Compress)"
        Write-Evidence "Step 1 FAIL: Admin login - status=$($loginResult.status)"
    }
}
catch {
    Write-Fail "Admin login exception: $($_.Exception.Message)"
    Write-Evidence "Step 1 FAIL: Admin login exception: $($_.Exception.Message)"
}

# ============================================================
# Step 2: Select an existing video (GET /admin/videos, first row)
# ============================================================
Write-Step "2" "Select an existing video (GET /admin/videos)"
if (-not $adminToken) {
    Write-Fail "Skipping Step 2: no admin token"
    Write-Evidence "Step 2 SKIP: No admin token"
}
else {
    try {
        $listResult = Invoke-ApiCall -Method "GET" -Path "/admin/videos" -Token $adminToken
        if ($listResult.whatIf) {
            $videoId = 999
            Write-Pass "Video selected (WhatIf) -> id=$videoId"
            Write-Evidence "Step 2 PASS: Video selected (WhatIf) id=$videoId"
        }
        elseif ($listResult.status -eq 200) {
            $rows = $listResult.body.rows
            if ($rows -and $rows.Count -gt 0) {
                $videoId = $rows[0].id
                Write-Pass "Video selected -> id=$videoId, title=$($rows[0].title)"
                Write-Evidence "Step 2 PASS: Video selected id=$videoId title=$($rows[0].title)"
            }
            else {
                Write-Fail "No videos exist; cannot run encryption-policy flow without a video"
                Write-Evidence "Step 2 FAIL: No videos returned from /admin/videos"
            }
        }
        else {
            Write-Fail "List videos failed: status=$($listResult.status)"
            Write-Evidence "Step 2 FAIL: List videos - status=$($listResult.status)"
        }
    }
    catch {
        Write-Fail "List videos exception: $($_.Exception.Message)"
        Write-Evidence "Step 2 FAIL: List videos exception: $($_.Exception.Message)"
    }
}

# ============================================================
# Step 3: Set policy accessMode=code, offlineAllowed=false, keyTtlHours=0
# ============================================================
Write-Step "3" "Set video policy: accessMode=code, offlineAllowed=false, keyTtlHours=0"
if (-not $videoId -or -not $adminToken) {
    Write-Fail "Skipping Step 3: no videoId or admin token"
    Write-Evidence "Step 3 SKIP: No videoId or admin token"
}
else {
    try {
        $policyResult = Invoke-ApiCall -Method "PUT" -Path "/admin/videos/$videoId" -Body @{
            accessMode     = "code"
            offlineAllowed = $false
            keyTtlHours    = 0
        } -Token $adminToken
        if ($policyResult.whatIf) {
            Write-Pass "Policy update (WhatIf)"
            Write-Evidence "Step 3 PASS: Policy update (WhatIf)"
        }
        elseif ($policyResult.status -eq 200) {
            Write-Pass "Policy updated -> accessMode=code, offlineAllowed=false, keyTtlHours=0"
            Write-Evidence "Step 3 PASS: Policy updated - status=$($policyResult.status)"
        }
        else {
            Write-Fail "Policy update failed: status=$($policyResult.status), body=$($policyResult.body | ConvertTo-Json -Compress)"
            Write-Evidence "Step 3 FAIL: Policy update - status=$($policyResult.status)"
        }
    }
    catch {
        Write-Fail "Policy update exception: $($_.Exception.Message)"
        Write-Evidence "Step 3 FAIL: Policy update exception: $($_.Exception.Message)"
    }
}

# ============================================================
# Step 4: Create an access code (POST /admin/videos/:id/codes)
# ============================================================
Write-Step "4" "Create access code '$accessCode' (POST /admin/videos/$videoId/codes)"
if (-not $videoId -or -not $adminToken) {
    Write-Fail "Skipping Step 4: no videoId or admin token"
    Write-Evidence "Step 4 SKIP: No videoId or admin token"
}
else {
    try {
        $codeResult = Invoke-ApiCall -Method "POST" -Path "/admin/videos/$videoId/codes" -Body @{
            code = $accessCode
        } -Token $adminToken -ExpectedStatus 201
        if ($codeResult.whatIf) {
            $codeId = 888
            Write-Pass "Access code created (WhatIf) -> codeId=$codeId"
            Write-Evidence "Step 4 PASS: Access code created (WhatIf) codeId=$codeId"
        }
        elseif ($codeResult.status -eq 201 -or $codeResult.status -eq 200) {
            $codeId = $codeResult.body.id
            if (-not $codeId) { $codeId = $codeResult.body.codeId }
            Write-Pass "Access code created -> codeId=$codeId"
            Write-Evidence "Step 4 PASS: Access code created codeId=$codeId status=$($codeResult.status)"
        }
        else {
            Write-Fail "Access code create failed: status=$($codeResult.status), body=$($codeResult.body | ConvertTo-Json -Compress)"
            Write-Evidence "Step 4 FAIL: Access code create - status=$($codeResult.status)"
        }
    }
    catch {
        Write-Fail "Access code create exception: $($_.Exception.Message)"
        Write-Evidence "Step 4 FAIL: Access code create exception: $($_.Exception.Message)"
    }
}

# ============================================================
# Step 5: Register + bind a test device
# ============================================================
Write-Step "5" "Register + bind test device (deviceId=$deviceId)"
if (-not $adminToken) {
    Write-Fail "Skipping Step 5: no admin token"
    Write-Evidence "Step 5 SKIP: No admin token"
}
else {
    try {
        # 5a: pick a store for binding (GET /admin/stores, first row)
        $storeResult = Invoke-ApiCall -Method "GET" -Path "/admin/stores" -Token $adminToken
        if ($storeResult.whatIf) {
            $storeId = 777
            Write-Info "Store selected (WhatIf) -> id=$storeId"
        }
        elseif ($storeResult.status -eq 200 -and $storeResult.body.rows -and $storeResult.body.rows.Count -gt 0) {
            $storeId = $storeResult.body.rows[0].id
            Write-Info "Store selected -> id=$storeId ($($storeResult.body.rows[0].name))"
        }
        else {
            Write-Info "No stores available (status=$($storeResult.status)); binding will be skipped"
        }

        # 5b: register device (POST /devices/register { deviceId })
        $regResult = Invoke-ApiCall -Method "POST" -Path "/devices/register" -Body @{
            deviceId = $deviceId
        }
        if ($regResult.whatIf) {
            $deviceToken = "whatif-device-token"
            Write-Pass "Device register (WhatIf)"
        }
        elseif ($regResult.status -eq 200 -or $regResult.status -eq 201) {
            $deviceToken = $regResult.body.accessToken
            if (-not $deviceToken) { $deviceToken = $regResult.body.deviceToken }
            if ($deviceToken) {
                Write-Pass "Device registered -> token received"
            }
            else {
                Write-Fail "Device register returned 2xx but no token in body"
                Write-Evidence "Step 5 FAIL: Device register 2xx but token missing"
            }
        }
        else {
            Write-Fail "Device register failed: status=$($regResult.status)"
            Write-Evidence "Step 5 FAIL: Device register - status=$($regResult.status)"
        }

        # 5c: bind device to store (POST /devices/bind { storeId }) -> re-issued token
        if ($deviceToken -and $storeId) {
            $bindResult = Invoke-ApiCall -Method "POST" -Path "/devices/bind" -Body @{
                storeId = $storeId
            } -Token $deviceToken
            if ($bindResult.whatIf) {
                Write-Pass "Device bind (WhatIf) -> storeId=$storeId"
                Write-Evidence "Step 5 PASS: Device register+bind (WhatIf) storeId=$storeId"
            }
            elseif ($bindResult.status -eq 200 -or $bindResult.status -eq 201) {
                # The re-issued token may live under accessToken or deviceToken
                $reissued = $bindResult.body.accessToken
                if (-not $reissued) { $reissued = $bindResult.body.deviceToken }
                if ($reissued) { $deviceToken = $reissued }
                Write-Pass "Device bound -> storeId=$storeId"
                Write-Evidence "Step 5 PASS: Device register+bind storeId=$storeId"
            }
            else {
                Write-Fail "Device bind failed: status=$($bindResult.status)"
                Write-Evidence "Step 5 FAIL: Device bind - status=$($bindResult.status)"
            }
        }
        elseif ($deviceToken) {
            Write-Info "Proceeding without binding (no store available)"
            Write-Evidence "Step 5 PASS: Device registered without bind (no store)"
        }
    }
    catch {
        Write-Fail "Device setup exception: $($_.Exception.Message)"
        Write-Evidence "Step 5 FAIL: Device setup exception: $($_.Exception.Message)"
    }
}

# ============================================================
# Step 6: WITHOUT code -> GET key -> expect 403 (code mode requires a code)
# ============================================================
Write-Step "6" "GET /devices/videos/$videoId/key WITHOUT code -> expect 403"
if (-not $videoId -or -not $deviceToken) {
    Write-Fail "Skipping Step 6: no videoId or device token"
    Write-Evidence "Step 6 SKIP: No videoId or device token"
}
else {
    try {
        $keyResult = Invoke-BinaryKey -Path "/devices/videos/$videoId/key" -Token $deviceToken -ExpectedStatus 403
        if ($keyResult.whatIf) {
            Write-Pass "Key denied without code (WhatIf, simulated 403)"
            Write-Evidence "Step 6 PASS: Key 403 without code (WhatIf)"
        }
        elseif ($keyResult.status -eq 403) {
            Write-Pass "Key correctly denied without code -> 403"
            Write-Evidence "Step 6 PASS: Key denied status=$($keyResult.status)"
        }
        else {
            Write-Fail "Expected 403, got status=$($keyResult.status)"
            Write-Evidence "Step 6 FAIL: Expected 403, got $($keyResult.status)"
        }
    }
    catch {
        Write-Fail "Key (no code) exception: $($_.Exception.Message)"
        Write-Evidence "Step 6 FAIL: Key (no code) exception: $($_.Exception.Message)"
    }
}

# ============================================================
# Step 7: POST /devices/unlock { code } -> expect 200 with video metadata
# ============================================================
Write-Step "7" "POST /devices/unlock { code: '$accessCode' } -> expect 200"
if (-not $deviceToken) {
    Write-Fail "Skipping Step 7: no device token"
    Write-Evidence "Step 7 SKIP: No device token"
}
else {
    try {
        $unlockResult = Invoke-ApiCall -Method "POST" -Path "/devices/unlock" -Body @{
            code = $accessCode
        } -Token $deviceToken
        if ($unlockResult.whatIf) {
            Write-Pass "Unlock (WhatIf)"
            Write-Evidence "Step 7 PASS: Unlock (WhatIf)"
        }
        elseif ($unlockResult.status -eq 200) {
            $uvId   = $unlockResult.body.videoId
            $uvTtl  = $unlockResult.body.title
            $uvMode = $unlockResult.body.accessMode
            Write-Pass "Unlock succeeded -> videoId=$uvId, title=$uvTtl, accessMode=$uvMode"
            Write-Evidence "Step 7 PASS: Unlock videoId=$uvId mode=$uvMode"
        }
        else {
            Write-Fail "Unlock failed: status=$($unlockResult.status), body=$($unlockResult.body | ConvertTo-Json -Compress)"
            Write-Evidence "Step 7 FAIL: Unlock - status=$($unlockResult.status)"
        }
    }
    catch {
        Write-Fail "Unlock exception: $($_.Exception.Message)"
        Write-Evidence "Step 7 FAIL: Unlock exception: $($_.Exception.Message)"
    }
}

# ============================================================
# Step 8: WITH code -> GET key?code=... -> expect 200 (authorized via code)
# ============================================================
Write-Step "8" "GET /devices/videos/$videoId/key?code=$accessCode -> expect 200"
if (-not $videoId -or -not $deviceToken) {
    Write-Fail "Skipping Step 8: no videoId or device token"
    Write-Evidence "Step 8 SKIP: No videoId or device token"
}
else {
    try {
        $encodedCode = [uri]::EscapeDataString($accessCode)
        $keyPath = "/devices/videos/$videoId/key?code=$encodedCode"
        $keyResult = Invoke-BinaryKey -Path $keyPath -Token $deviceToken -ExpectedStatus 200
        if ($keyResult.whatIf) {
            Write-Pass "Key granted with code (WhatIf, simulated 200)"
            Write-Evidence "Step 8 PASS: Key 200 with code (WhatIf)"
        }
        elseif ($keyResult.status -eq 200) {
            Write-Pass "Key granted with code -> 200"
            Write-Evidence "Step 8 PASS: Key granted 200 with code"
        }
        else {
            Write-Fail "Expected 200, got status=$($keyResult.status)"
            Write-Evidence "Step 8 FAIL: Expected 200, got $($keyResult.status)"
        }
    }
    catch {
        Write-Fail "Key (with code) exception: $($_.Exception.Message)"
        Write-Evidence "Step 8 FAIL: Key (with code) exception: $($_.Exception.Message)"
    }
}

# ============================================================
# Step 9: Switch accessMode=open -> GET key WITHOUT code -> expect 200
# ============================================================
Write-Step "9" "Switch accessMode=open, then GET key WITHOUT code -> expect 200"
if (-not $videoId -or -not $adminToken -or -not $deviceToken) {
    Write-Fail "Skipping Step 9: missing prerequisites"
    Write-Evidence "Step 9 SKIP: Missing prerequisites"
}
else {
    try {
        $openResult = Invoke-ApiCall -Method "PUT" -Path "/admin/videos/$videoId" -Body @{
            accessMode = "open"
        } -Token $adminToken
        if ($openResult.whatIf) {
            Write-Info "Policy switch to open (WhatIf)"
        }
        elseif ($openResult.status -eq 200) {
            Write-Info "Policy switched to accessMode=open"
        }
        else {
            Write-Fail "Policy switch to open failed: status=$($openResult.status), body=$($openResult.body | ConvertTo-Json -Compress)"
            Write-Evidence "Step 9 FAIL: Policy switch to open - status=$($openResult.status)"
        }

        if ($openResult.whatIf -or $openResult.status -eq 200) {
            $keyResult = Invoke-BinaryKey -Path "/devices/videos/$videoId/key" -Token $deviceToken -ExpectedStatus 200
            if ($keyResult.whatIf) {
                Write-Pass "Key granted in open mode (WhatIf, simulated 200)"
                Write-Evidence "Step 9 PASS: Key 200 open mode (WhatIf)"
            }
            elseif ($keyResult.status -eq 200) {
                Write-Pass "Key granted in open mode without code -> 200"
                Write-Evidence "Step 9 PASS: Key granted 200 open mode"
            }
            else {
                Write-Fail "Expected 200 in open mode, got status=$($keyResult.status)"
                Write-Evidence "Step 9 FAIL: Expected 200 open mode, got $($keyResult.status)"
            }
        }
    }
    catch {
        Write-Fail "Open-mode key exception: $($_.Exception.Message)"
        Write-Evidence "Step 9 FAIL: Open-mode key exception: $($_.Exception.Message)"
    }
}

# ============================================================
# Step 10: Cleanup -> delete access code + restore default policy
# ============================================================
Write-Step "10" "Cleanup: delete access code + restore default policy"
if (-not $videoId -or -not $adminToken) {
    Write-Fail "Skipping Step 10: no videoId or admin token"
    Write-Evidence "Step 10 SKIP: No videoId or admin token"
}
else {
    try {
        # 10a: delete the access code created in step 4
        if ($codeId) {
            $delResult = Invoke-ApiCall -Method "DELETE" -Path "/admin/codes/$codeId" -Token $adminToken -ExpectedStatus 204
            if ($delResult.whatIf) {
                Write-Pass "Delete access code (WhatIf)"
            }
            elseif ($delResult.status -eq 204 -or $delResult.status -eq 200) {
                Write-Pass "Access code deleted -> codeId=$codeId"
            }
            else {
                Write-Fail "Delete access code failed: status=$($delResult.status)"
                Write-Evidence "Step 10 FAIL: Delete code - status=$($delResult.status)"
            }
        }
        else {
            Write-Info "No codeId to delete (skipping code cleanup)"
        }

        # 10b: restore default policy (accessMode=campaign, offlineAllowed=true, keyTtlHours=168)
        $restoreResult = Invoke-ApiCall -Method "PUT" -Path "/admin/videos/$videoId" -Body @{
            accessMode     = "campaign"
            offlineAllowed = $true
            keyTtlHours    = 168
        } -Token $adminToken
        if ($restoreResult.whatIf) {
            Write-Pass "Restore default policy (WhatIf)"
            Write-Evidence "Step 10 PASS: Cleanup (WhatIf)"
        }
        elseif ($restoreResult.status -eq 200) {
            Write-Pass "Default policy restored -> accessMode=campaign, offlineAllowed=true, keyTtlHours=168"
            Write-Evidence "Step 10 PASS: Default policy restored"
        }
        else {
            Write-Fail "Restore policy failed: status=$($restoreResult.status), body=$($restoreResult.body | ConvertTo-Json -Compress)"
            Write-Evidence "Step 10 FAIL: Restore policy - status=$($restoreResult.status)"
        }
    }
    catch {
        Write-Fail "Cleanup exception: $($_.Exception.Message)"
        Write-Evidence "Step 10 FAIL: Cleanup exception: $($_.Exception.Message)"
    }
}

# Save evidence log
$EvidenceLines | Out-File -FilePath $EvidenceFile -Encoding utf8
Write-Host "`nEvidence saved to: $EvidenceFile" -ForegroundColor Gray

# Final summary (exits 1 if any failures, 0 otherwise)
Write-Summary "Configurable Encryption Policy Flow"
