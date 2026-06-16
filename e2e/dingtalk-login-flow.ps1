# e2e/dingtalk-login-flow.ps1 - E2E: DingTalk Login Flow
# Tests: QR code -> callback (mock) -> poll -> verify token -> refresh -> verify old refresh rejected -> logout -> verify blacklisted
param([switch]$WhatIf)

. "$PSScriptRoot\common.ps1"
Set-E2EWhatIf $WhatIf.IsPresent

# Workaround: common.ps1 uses Get-Variable -Scope Global but dot-sourcing
# from a script doesn't put vars in global scope. Initialize them explicitly.
$Global:E2E_BASE_URL = if ($env:VDEIO_BASE_URL) { $env:VDEIO_BASE_URL } else { "http://localhost:3000/api/v1" }
$Global:E2E_PASS_COUNT = 0
$Global:E2E_FAIL_COUNT = 0

Write-Host "`n=== E2E: DingTalk Login Flow ===" -ForegroundColor White

# --- Evidence logging setup ---
$EvidenceDir = Join-Path (Join-Path (Join-Path $PSScriptRoot "..") ".sisyphus") "evidence"
if (-not (Test-Path $EvidenceDir)) {
    New-Item -ItemType Directory -Path $EvidenceDir -Force | Out-Null
}
$EvidenceFile = Join-Path $EvidenceDir "task-27-dingtalk-login-e2e.log"
$EvidenceLines = [System.Collections.Generic.List[string]]::new()
function Write-Evidence([string]$Line) {
    $timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    $entry = "[$timestamp] $Line"
    $EvidenceLines.Add($entry)
    Write-Host $entry
}

$qrState = $null
$accessToken = $null
$refreshToken = $null
$newAccessToken = $null
$newRefreshToken = $null

# Step 1: Get QR code for DingTalk login
Write-Step "1" "Get DingTalk QR code"
try {
    $qrResult = Invoke-ApiCall -Method "GET" -Path "/auth/dingtalk/qrcode"

    if ($qrResult.whatIf) {
        Write-Pass "QR code retrieved (WhatIf)"
        $qrState = "whatif-state-$(Get-Random)"
        Write-Evidence "Step 1 PASS: QR code (WhatIf)"
    }
    elseif ($qrResult.status -eq 200 -and $qrResult.body.state -and ($qrResult.body.qrCodeUrl -or $qrResult.body.mockMode)) {
        $qrState = $qrResult.body.state
        if ($qrResult.body.mockMode) {
            Write-Pass "QR code retrieved in mock mode - state=$qrState"
            Write-Evidence "Step 1 PASS: QR code (mock mode) - state=$qrState"
        }
        else {
            Write-Pass "QR code retrieved - state=$qrState"
            Write-Evidence "Step 1 PASS: QR code - state=$qrState, url=$($qrResult.body.qrCodeUrl)"
        }
    }
    else {
        Write-Fail "QR code failed: status=$($qrResult.status), body=$($qrResult.body | ConvertTo-Json -Compress)"
        Write-Evidence "Step 1 FAIL: QR code - status=$($qrResult.status)"
    }
}
catch {
    Write-Fail "QR code exception: $($_.Exception.Message)"
    Write-Evidence "Step 1 FAIL: QR code exception: $($_.Exception.Message)"
}

# Step 2: DingTalk callback (mock mode)
Write-Step "2" "DingTalk auth callback (mock)"
if (-not $qrState) {
    Write-Fail "Skipping Step 2: no state"
    Write-Evidence "Step 2 SKIP: No state"
}
else {
    try {
        $callbackResult = Invoke-ApiCall -Method "POST" -Path "/auth/dingtalk/callback" -Body @{
            state = $qrState
            authCode = "mock-auth-code-$(Get-Random)"
        }

        if ($callbackResult.whatIf) {
            Write-Pass "Auth callback succeeded (WhatIf)"
            Write-Evidence "Step 2 PASS: Auth callback (WhatIf)"
        }
        elseif ($callbackResult.status -eq 200 -and $callbackResult.body.success) {
            Write-Pass "Auth callback succeeded"
            Write-Evidence "Step 2 PASS: Auth callback - success=$($callbackResult.body.success)"
        }
        else {
            Write-Fail "Auth callback failed: status=$($callbackResult.status), body=$($callbackResult.body | ConvertTo-Json -Compress)"
            Write-Evidence "Step 2 FAIL: Auth callback - status=$($callbackResult.status)"
        }
    }
    catch {
        Write-Fail "Auth callback exception: $($_.Exception.Message)"
        Write-Evidence "Step 2 FAIL: Auth callback exception: $($_.Exception.Message)"
    }
}

# Step 2a: GET callback HTML success page
Write-Step "2a" "Verify GET /auth/dingtalk/callback returns HTML success page"
if (-not $qrState) {
    Write-Fail "Skipping Step 2a: no state"
    Write-Evidence "Step 2a SKIP: No state"
}
else {
    try {
        $baseUrl = (Get-Variable -Name "E2E_BASE_URL" -Scope Global -ValueOnly)
        $getCallbackUri = "$baseUrl/auth/dingtalk/callback?state=$qrState&authCode=mock-auth-code-get-$(Get-Random)"
        $getCallbackResult = Invoke-WebRequest -Method "GET" -Uri $getCallbackUri -UseBasicParsing
        if ($getCallbackResult.StatusCode -eq 200 -and $getCallbackResult.Content -match "登录成功") {
            Write-Pass "GET callback returned HTML success page"
            Write-Evidence "Step 2a PASS: GET callback HTML success"
        }
        else {
            Write-Fail "GET callback did not return expected HTML: status=$($getCallbackResult.StatusCode)"
            Write-Evidence "Step 2a FAIL: GET callback status=$($getCallbackResult.StatusCode)"
        }
    }
    catch {
        Write-Fail "GET callback exception: $($_.Exception.Message)"
        Write-Evidence "Step 2a FAIL: GET callback exception: $($_.Exception.Message)"
    }
}

# Step 2b: GET callback missing params error page
Write-Step "2b" "Verify GET /auth/dingtalk/callback missing params returns HTML error"
try {
    $baseUrl = (Get-Variable -Name "E2E_BASE_URL" -Scope Global -ValueOnly)
    $getCallbackErrUri = "$baseUrl/auth/dingtalk/callback"
    $errStatus = $null
    $errContent = $null
    try {
        $getCallbackErrResult = Invoke-WebRequest -Method "GET" -Uri $getCallbackErrUri -UseBasicParsing -ErrorAction Stop
        $errStatus = [int]$getCallbackErrResult.StatusCode
        $errContent = $getCallbackErrResult.Content
    }
    catch {
        $errResp = $_.Exception.Response
        if ($errResp -and [int]$errResp.StatusCode -eq 400) {
            $errStatus = 400
            $stream = $errResp.GetResponseStream()
            if ($stream.CanSeek) { $stream.Position = 0 }
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
            $errContent = $reader.ReadToEnd()
            $reader.Close()
        }
        else {
            throw
        }
    }
    if ($errStatus -eq 400 -and $errContent -match "参数缺失") {
        Write-Pass "GET callback missing params returned HTML error page"
        Write-Evidence "Step 2b PASS: GET callback missing params HTML error"
    }
    else {
        Write-Fail "GET callback missing params did not return expected HTML: status=$errStatus"
        Write-Evidence "Step 2b FAIL: GET callback missing params status=$errStatus"
    }
}
catch {
    Write-Fail "GET callback missing params exception: $($_.Exception.Message)"
    Write-Evidence "Step 2b FAIL: GET callback missing params exception: $($_.Exception.Message)"
}

# Step 3: Poll auth status with retry
Write-Step "3" "Poll auth status (with retry)"
if (-not $qrState) {
    Write-Fail "Skipping Step 3: no state"
    Write-Evidence "Step 3 SKIP: No state"
}
else {
    $pollSuccess = $false
    $maxRetries = 10
    $retryDelayMs = 500
    for ($i = 0; $i -lt $maxRetries; $i++) {
        try {
            $pollResult = Invoke-ApiCall -Method "GET" -Path "/auth/poll?state=$qrState"

            if ($pollResult.whatIf) {
                Write-Pass "Auth poll succeeded (WhatIf)"
                $accessToken = "whatif-access-token"
                $refreshToken = "whatif-refresh-token"
                $pollSuccess = $true
                Write-Evidence "Step 3 PASS: Auth poll (WhatIf)"
                break
            }
            elseif ($pollResult.status -eq 200) {
                if ($pollResult.body.status -eq "success" -and $pollResult.body.accessToken) {
                    $accessToken = $pollResult.body.accessToken
                    $refreshToken = $pollResult.body.refreshToken
                    Write-Pass "Auth poll succeeded after $($i + 1) attempt(s) - accessToken received, user=$($pollResult.body.user.name)"
                    Write-Evidence "Step 3 PASS: Auth poll - status=success, user=$($pollResult.body.user.name)"
                    $pollSuccess = $true
                    break
                }
                elseif ($pollResult.body.status -eq "pending" -and $i -lt ($maxRetries - 1)) {
                    Write-Info "Poll pending, retrying in ${retryDelayMs}ms..."
                    Start-Sleep -Milliseconds $retryDelayMs
                }
                else {
                    Write-Fail "Auth poll unexpected status: $($pollResult.body.status)"
                    Write-Evidence "Step 3 FAIL: Auth poll - status=$($pollResult.body.status)"
                    break
                }
            }
            else {
                Write-Fail "Auth poll failed: status=$($pollResult.status)"
                Write-Evidence "Step 3 FAIL: Auth poll - status=$($pollResult.status)"
                break
            }
        }
        catch {
            Write-Fail "Auth poll exception: $($_.Exception.Message)"
            Write-Evidence "Step 3 FAIL: Auth poll exception: $($_.Exception.Message)"
            break
        }
    }
    if (-not $pollSuccess -and -not $WhatIf) {
        Write-Fail "Auth poll did not succeed after $maxRetries attempts"
        Write-Evidence "Step 3 FAIL: Auth poll exhausted retries"
    }
}

# Step 3b: Poll invalid state returns 400
Write-Step "3b" "Verify poll with invalid state returns 400"
try {
    $invalidPollResult = Invoke-ApiCall -Method "GET" -Path "/auth/poll?state=invalid-state-$(Get-Random)" -ExpectedStatus 400
    if ($invalidPollResult.status -eq 400) {
        Write-Pass "Invalid state poll returned 400"
        Write-Evidence "Step 3b PASS: Invalid state poll 400"
    }
    else {
        Write-Fail "Expected 400 for invalid state poll but got status=$($invalidPollResult.status)"
        Write-Evidence "Step 3b FAIL: Invalid state poll status=$($invalidPollResult.status)"
    }
}
catch {
    Write-Fail "Invalid state poll exception: $($_.Exception.Message)"
    Write-Evidence "Step 3b FAIL: Invalid state poll exception: $($_.Exception.Message)"
}

# Step 4: Verify token works
Write-Step "4" "Verify token works (GET /devices/videos)"
if (-not $accessToken) {
    Write-Fail "Skipping Step 4: no access token"
    Write-Evidence "Step 4 SKIP: No access token"
}
else {
    try {
        $verifyResult = Invoke-ApiCall -Method "GET" -Path "/devices/videos" -Token $accessToken

        if ($verifyResult.whatIf) {
            Write-Pass "Token verified (WhatIf)"
            Write-Evidence "Step 4 PASS: Token verified (WhatIf)"
        }
        elseif ($verifyResult.status -eq 200) {
            Write-Pass "Token works - campaigns=$($verifyResult.body.campaigns.Length)"
            Write-Evidence "Step 4 PASS: Token works - status=$($verifyResult.status)"
        }
        elseif ($verifyResult.status -eq 403) {
            # 403 is acceptable if user has no store binding
            Write-Pass "Token works (403 expected - no store binding)"
            Write-Evidence "Step 4 PASS: Token works - status=403 (no store binding)"
        }
        else {
            Write-Fail "Token verification failed: status=$($verifyResult.status)"
            Write-Evidence "Step 4 FAIL: Token verification - status=$($verifyResult.status)"
        }
    }
    catch {
        Write-Fail "Token verification exception: $($_.Exception.Message)"
        Write-Evidence "Step 4 FAIL: Token verification exception: $($_.Exception.Message)"
    }
}

# Step 5: Refresh token
Write-Step "5" "Refresh access token"
if (-not $refreshToken) {
    Write-Fail "Skipping Step 5: no refresh token"
    Write-Evidence "Step 5 SKIP: No refresh token"
}
else {
    try {
        $refreshResult = Invoke-ApiCall -Method "POST" -Path "/auth/refresh" -Body @{
            refreshToken = $refreshToken
        }

        if ($refreshResult.whatIf) {
            Write-Pass "Token refreshed (WhatIf)"
            $newAccessToken = "whatif-new-access-token"
            $newRefreshToken = "whatif-new-refresh-token"
            Write-Evidence "Step 5 PASS: Token refreshed (WhatIf)"
        }
        elseif ($refreshResult.status -eq 200 -and $refreshResult.body.accessToken -and $refreshResult.body.refreshToken) {
            $newAccessToken = $refreshResult.body.accessToken
            $newRefreshToken = $refreshResult.body.refreshToken
            Write-Pass "Token refreshed - new accessToken received"
            Write-Evidence "Step 5 PASS: Token refreshed - new tokens received"
        }
        else {
            Write-Fail "Token refresh failed: status=$($refreshResult.status)"
            Write-Evidence "Step 5 FAIL: Token refresh - status=$($refreshResult.status)"
        }
    }
    catch {
        Write-Fail "Token refresh exception: $($_.Exception.Message)"
        Write-Evidence "Step 5 FAIL: Token refresh exception: $($_.Exception.Message)"
    }
}

# Step 6: Verify old refreshToken rejected
Write-Step "6" "Verify old refreshToken rejected (expect 401)"
if (-not $refreshToken) {
    Write-Fail "Skipping Step 6: no old refresh token"
    Write-Evidence "Step 6 SKIP: No refresh token"
}
else {
    try {
        $oldRefreshResult = Invoke-ApiCall -Method "POST" -Path "/auth/refresh" -Body @{
            refreshToken = $refreshToken
        }

        if ($oldRefreshResult.whatIf) {
            Write-Pass "Old refreshToken rejected (WhatIf)"
            Write-Evidence "Step 6 PASS: Old refreshToken rejected (WhatIf)"
        }
        elseif ($oldRefreshResult.status -eq 401) {
            Write-Pass "Old refreshToken correctly rejected - 401"
            Write-Evidence "Step 6 PASS: Old refreshToken rejected - 401"
        }
        else {
            Write-Fail "Expected 401 but got status=$($oldRefreshResult.status)"
            Write-Evidence "Step 6 FAIL: Expected 401, got status=$($oldRefreshResult.status)"
        }
    }
    catch {
        Write-Fail "Old refreshToken test exception: $($_.Exception.Message)"
        Write-Evidence "Step 6 FAIL: Old refreshToken exception: $($_.Exception.Message)"
    }
}

# Step 7: Logout
Write-Step "7" "Logout"
$tokenToLogout = if ($newAccessToken) { $newAccessToken } else { $accessToken }
if (-not $tokenToLogout) {
    Write-Fail "Skipping Step 7: no access token"
    Write-Evidence "Step 7 SKIP: No access token"
}
else {
    try {
        $logoutResult = Invoke-ApiCall -Method "POST" -Path "/auth/logout" -Token $tokenToLogout

        if ($logoutResult.whatIf) {
            Write-Pass "Logout succeeded (WhatIf)"
            Write-Evidence "Step 7 PASS: Logout (WhatIf)"
        }
        elseif ($logoutResult.status -eq 200 -and $logoutResult.body.success) {
            Write-Pass "Logout succeeded"
            Write-Evidence "Step 7 PASS: Logout - success=$($logoutResult.body.success)"
        }
        else {
            Write-Fail "Logout failed: status=$($logoutResult.status)"
            Write-Evidence "Step 7 FAIL: Logout - status=$($logoutResult.status)"
        }
    }
    catch {
        Write-Fail "Logout exception: $($_.Exception.Message)"
        Write-Evidence "Step 7 FAIL: Logout exception: $($_.Exception.Message)"
    }
}

# Step 8: Verify token blacklisted
Write-Step "8" "Verify token blacklisted (expect 401)"
if (-not $tokenToLogout) {
    Write-Fail "Skipping Step 8: no token to verify"
    Write-Evidence "Step 8 SKIP: No token to verify"
}
else {
    try {
        $blacklistResult = Invoke-ApiCall -Method "GET" -Path "/devices/videos" -Token $tokenToLogout

        if ($blacklistResult.whatIf) {
            Write-Pass "Token blacklisted (WhatIf)"
            Write-Evidence "Step 8 PASS: Token blacklisted (WhatIf)"
        }
        elseif ($blacklistResult.status -eq 401) {
            Write-Pass "Token correctly blacklisted - 401"
            Write-Evidence "Step 8 PASS: Token blacklisted - 401"
        }
        else {
            Write-Fail "Expected 401 but got status=$($blacklistResult.status)"
            Write-Evidence "Step 8 FAIL: Token blacklisted - status=$($blacklistResult.status)"
        }
    }
    catch {
        Write-Fail "Token blacklist test exception: $($_.Exception.Message)"
        Write-Evidence "Step 8 FAIL: Token blacklist exception: $($_.Exception.Message)"
    }
}

# Save evidence log
$EvidenceLines | Out-File -FilePath $EvidenceFile -Encoding utf8
Write-Host "`nEvidence saved to: $EvidenceFile" -ForegroundColor Gray

# Final summary
Write-Summary "DingTalk Login Flow"
