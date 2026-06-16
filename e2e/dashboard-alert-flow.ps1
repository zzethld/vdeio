# e2e/dashboard-alert-flow.ps1 - E2E: Dashboard + Alert + Telemetry Flow
# Tests: admin login -> dashboard stats -> device register+bind -> connect event -> verify online -> telemetry -> disconnect event -> verify offline
param([switch]$WhatIf)

. "$PSScriptRoot\common.ps1"
Set-E2EWhatIf $WhatIf.IsPresent

# Workaround: common.ps1 uses Get-Variable -Scope Global but dot-sourcing
# from a script doesn't put vars in global scope. Initialize them explicitly.
$Global:E2E_BASE_URL = if ($env:VDEIO_BASE_URL) { $env:VDEIO_BASE_URL } else { "http://localhost:3000/api/v1" }
$Global:E2E_PASS_COUNT = 0
$Global:E2E_FAIL_COUNT = 0

Write-Host "`n=== E2E: Dashboard + Alert + Telemetry Flow ===" -ForegroundColor White

# --- Evidence logging setup ---
$EvidenceDir = Join-Path (Join-Path (Join-Path $PSScriptRoot "..") ".sisyphus") "evidence"
if (-not (Test-Path $EvidenceDir)) {
    New-Item -ItemType Directory -Path $EvidenceDir -Force | Out-Null
}
$EvidenceFile = Join-Path $EvidenceDir "task-28-dashboard-alert-e2e.log"
$EvidenceLines = [System.Collections.Generic.List[string]]::new()
function Write-Evidence([string]$Line) {
    $timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    $entry = "[$timestamp] $Line"
    $EvidenceLines.Add($entry)
    Write-Host $entry
}

$adminToken = $null
$deviceId = $null
$deviceToken = $null
$storeId = $null
$onlineDevicesBefore = $null
$onlineDevicesAfterConnect = $null
$onlineDevicesAfterDisconnect = $null

# Step 1: Admin login
Write-Step "1" "Admin login"
try {
    $loginResult = Invoke-ApiCall -Method "POST" -Path "/admin/auth/login" -Body @{
        username = "admin"
        password = "admin123"
    }

    if ($loginResult.whatIf) {
        Write-Pass "Admin login (WhatIf)"
        $adminToken = "whatif-admin-token"
        Write-Evidence "Step 1 PASS: Admin login (WhatIf)"
    }
    elseif ($loginResult.status -eq 200 -and $loginResult.body.accessToken) {
        $adminToken = $loginResult.body.accessToken
        Write-Pass "Admin login succeeded (token received)"
        Write-Evidence "Step 1 PASS: Admin login - status=$($loginResult.status)"
    }
    else {
        Write-Fail "Admin login failed: status=$($loginResult.status)"
        Write-Evidence "Step 1 FAIL: Admin login - status=$($loginResult.status)"
    }
}
catch {
    Write-Fail "Admin login exception: $($_.Exception.Message)"
    Write-Evidence "Step 1 FAIL: Admin login exception: $($_.Exception.Message)"
}

# Step 1b: Create a dedicated test store
Write-Step "1b" "Create test store"
if (-not $adminToken) {
    Write-Fail "Skipping Step 1b: no admin token"
    Write-Evidence "Step 1b SKIP: No admin token"
}
else {
    try {
        $storeResult = Invoke-ApiCall -Method "POST" -Path "/admin/stores" -Token $adminToken -Body @{
            code = "E2E-DASH-$(Get-Random)"
            name = "E2E Dashboard Store $(Get-Random)"
            address = "E2E Address"
            status = 1
        }
        if ($storeResult.whatIf) {
            $storeId = 1
            Write-Pass "Test store created (WhatIf)"
            Write-Evidence "Step 1b PASS: Test store (WhatIf)"
        }
        elseif (($storeResult.status -eq 200 -or $storeResult.status -eq 201) -and $storeResult.body.id) {
            $storeId = $storeResult.body.id
            Write-Pass "Test store created - storeId=$storeId"
            Write-Evidence "Step 1b PASS: Test store created - storeId=$storeId"
        }
        else {
            Write-Fail "Test store creation failed: status=$($storeResult.status)"
            Write-Evidence "Step 1b FAIL: Test store status=$($storeResult.status)"
        }
    }
    catch {
        Write-Fail "Test store exception: $($_.Exception.Message)"
        Write-Evidence "Step 1b FAIL: Test store exception: $($_.Exception.Message)"
    }
}

# Step 2: Get initial dashboard stats
Write-Step "2" "Get initial dashboard stats"
if (-not $adminToken) {
    Write-Fail "Skipping Step 2: no admin token"
    Write-Evidence "Step 2 SKIP: No admin token"
}
else {
    try {
        $statsResult = Invoke-ApiCall -Method "GET" -Path "/admin/dashboard/stats" -Token $adminToken

        if ($statsResult.whatIf) {
            Write-Pass "Dashboard stats retrieved (WhatIf)"
            $onlineDevicesBefore = 0
            Write-Evidence "Step 2 PASS: Dashboard stats (WhatIf)"
        }
        elseif ($statsResult.status -eq 200) {
            $onlineDevicesBefore = $statsResult.body.onlineDevices
            Write-Pass "Dashboard stats - totalVideos=$($statsResult.body.totalVideos), activeCampaigns=$($statsResult.body.activeCampaigns), onlineDevices=$onlineDevicesBefore, totalDevices=$($statsResult.body.totalDevices)"
            Write-Evidence "Step 2 PASS: Dashboard stats - onlineDevices=$onlineDevicesBefore, totalDevices=$($statsResult.body.totalDevices)"
        }
        else {
            Write-Fail "Dashboard stats failed: status=$($statsResult.status)"
            Write-Evidence "Step 2 FAIL: Dashboard stats - status=$($statsResult.status)"
        }
    }
    catch {
        Write-Fail "Dashboard stats exception: $($_.Exception.Message)"
        Write-Evidence "Step 2 FAIL: Dashboard stats exception: $($_.Exception.Message)"
    }
}

# Step 3: Register device
Write-Step "3" "Register device"
if (-not $adminToken) {
    Write-Fail "Skipping Step 3: no admin token"
    Write-Evidence "Step 3 SKIP: No admin token"
}
else {
    try {
        $registerResult = Invoke-ApiCall -Method "POST" -Path "/devices/register" -Body @{
            deviceName = "e2e-dashboard-device-$(Get-Random)"
            osVersion = "Windows-Test-1.0"
        } -Token $adminToken

        if ($registerResult.whatIf) {
            Write-Pass "Device registered (WhatIf)"
            $deviceId = "whatif-dashboard-device"
            $deviceToken = "whatif-device-token"
            Write-Evidence "Step 3 PASS: Device registered (WhatIf)"
        }
        elseif ($registerResult.status -eq 200 -and $registerResult.body.deviceId -and $registerResult.body.deviceToken) {
            $deviceId = $registerResult.body.deviceId
            $deviceToken = $registerResult.body.deviceToken
            Write-Pass "Device registered - deviceId=$deviceId"
            Write-Evidence "Step 3 PASS: Device registered - deviceId=$deviceId"
        }
        else {
            Write-Fail "Device registration failed: status=$($registerResult.status)"
            Write-Evidence "Step 3 FAIL: Device registration - status=$($registerResult.status)"
        }
    }
    catch {
        Write-Fail "Device registration exception: $($_.Exception.Message)"
        Write-Evidence "Step 3 FAIL: Device registration exception: $($_.Exception.Message)"
    }
}

# Step 4: Bind device to store
Write-Step "4" "Bind device to store"
if (-not $deviceId -or -not $adminToken -or -not $storeId) {
    Write-Fail "Skipping Step 4: missing deviceId=$deviceId, storeId=$storeId, or token"
    Write-Evidence "Step 4 SKIP: Missing deviceId=$deviceId storeId=$storeId"
}
else {
    try {
        $bindResult = Invoke-ApiCall -Method "POST" -Path "/devices/bind" -Body @{
            storeId = $storeId
            deviceId = $deviceId
        } -Token $adminToken

        if ($bindResult.whatIf) {
            Write-Pass "Device bound to store (WhatIf)"
            Write-Evidence "Step 4 PASS: Device bound to store (WhatIf)"
        }
        elseif ($bindResult.status -eq 200 -and $bindResult.body.success) {
            if ($bindResult.body.deviceToken) {
                $deviceToken = $bindResult.body.deviceToken
            }
            Write-Pass "Device bound to store - deviceId=$deviceId, storeId=$storeId"
            Write-Evidence "Step 4 PASS: Device bound - deviceId=$deviceId, storeId=$storeId"
        }
        else {
            Write-Fail "Bind device failed: status=$($bindResult.status)"
            Write-Evidence "Step 4 FAIL: Bind device - status=$($bindResult.status)"
        }
    }
    catch {
        Write-Fail "Bind device exception: $($_.Exception.Message)"
        Write-Evidence "Step 4 FAIL: Bind device exception: $($_.Exception.Message)"
    }
}

# Step 5: Simulate device connect (EMQX webhook)
Write-Step "5" "Simulate MQTT connect event (EMQX webhook)"
if (-not $deviceId) {
    Write-Fail "Skipping Step 5: no deviceId"
    Write-Evidence "Step 5 SKIP: No deviceId"
}
else {
    try {
        $connectResult = Invoke-ApiCall -Method "POST" -Path "/webhooks/emqx" -Body @{
            event = "client.connected"
            username = $deviceId
            clientid = $deviceId
        }

        if ($connectResult.whatIf) {
            Write-Pass "Connect event processed (WhatIf)"
            Write-Evidence "Step 5 PASS: Connect event (WhatIf)"
        }
        elseif ($connectResult.status -eq 200 -and $connectResult.body.success) {
            Write-Pass "Connect event processed - deviceId=$deviceId"
            Write-Evidence "Step 5 PASS: Connect event - deviceId=$deviceId"
        }
        else {
            Write-Fail "Connect event failed: status=$($connectResult.status)"
            Write-Evidence "Step 5 FAIL: Connect event - status=$($connectResult.status)"
        }
    }
    catch {
        Write-Fail "Connect event exception: $($_.Exception.Message)"
        Write-Evidence "Step 5 FAIL: Connect event exception: $($_.Exception.Message)"
    }
}

# Step 6: Check dashboard after connect
Write-Step "6" "Check dashboard - verify onlineDevices increased"
if (-not $adminToken) {
    Write-Fail "Skipping Step 6: no admin token"
    Write-Evidence "Step 6 SKIP: No admin token"
}
else {
    try {
        $statsConnectResult = Invoke-ApiCall -Method "GET" -Path "/admin/dashboard/stats" -Token $adminToken

        if ($statsConnectResult.whatIf) {
            Write-Pass "Dashboard verified after connect (WhatIf)"
            Write-Evidence "Step 6 PASS: Dashboard after connect (WhatIf)"
        }
        elseif ($statsConnectResult.status -eq 200) {
            $onlineDevicesAfterConnect = $statsConnectResult.body.onlineDevices
            if ($onlineDevicesAfterConnect -gt $onlineDevicesBefore) {
                Write-Pass "Online devices increased - before=$onlineDevicesBefore, after=$onlineDevicesAfterConnect"
                Write-Evidence "Step 6 PASS: Online devices increased - $onlineDevicesBefore -> $onlineDevicesAfterConnect"
            }
            else {
                Write-Fail "Online devices did not increase - before=$onlineDevicesBefore, after=$onlineDevicesAfterConnect"
                Write-Evidence "Step 6 FAIL: Online devices did not increase - $onlineDevicesBefore -> $onlineDevicesAfterConnect"
            }
        }
        else {
            Write-Fail "Dashboard stats failed: status=$($statsConnectResult.status)"
            Write-Evidence "Step 6 FAIL: Dashboard stats - status=$($statsConnectResult.status)"
        }
    }
    catch {
        Write-Fail "Dashboard stats exception: $($_.Exception.Message)"
        Write-Evidence "Step 6 FAIL: Dashboard stats exception: $($_.Exception.Message)"
    }
}

# Step 7: Send device telemetry
Write-Step "7" "Send device telemetry"
if (-not $deviceToken) {
    Write-Fail "Skipping Step 7: no device token"
    Write-Evidence "Step 7 SKIP: No device token"
}
else {
    try {
        $telemetryResult = Invoke-ApiCall -Method "POST" -Path "/devices/telemetry" -Body @{
            cpu = 30
            memory = 50
            diskFree = 90
            networkLatency = 5
            appVersion = "1.0.0"
        } -Token $deviceToken

        if ($telemetryResult.whatIf) {
            Write-Pass "Telemetry sent (WhatIf)"
            Write-Evidence "Step 7 PASS: Telemetry sent (WhatIf)"
        }
        elseif ($telemetryResult.status -eq 200 -and $telemetryResult.body.success) {
            Write-Pass "Telemetry sent successfully"
            Write-Evidence "Step 7 PASS: Telemetry sent"
        }
        else {
            Write-Fail "Telemetry failed: status=$($telemetryResult.status)"
            Write-Evidence "Step 7 FAIL: Telemetry - status=$($telemetryResult.status)"
        }
    }
    catch {
        Write-Fail "Telemetry exception: $($_.Exception.Message)"
        Write-Evidence "Step 7 FAIL: Telemetry exception: $($_.Exception.Message)"
    }
}

# Step 8: Simulate device disconnect (EMQX webhook)
Write-Step "8" "Simulate MQTT disconnect event (EMQX webhook)"
if (-not $deviceId) {
    Write-Fail "Skipping Step 8: no deviceId"
    Write-Evidence "Step 8 SKIP: No deviceId"
}
else {
    try {
        $disconnectResult = Invoke-ApiCall -Method "POST" -Path "/webhooks/emqx" -Body @{
            event = "client.disconnected"
            username = $deviceId
            clientid = $deviceId
        }

        if ($disconnectResult.whatIf) {
            Write-Pass "Disconnect event processed (WhatIf)"
            Write-Evidence "Step 8 PASS: Disconnect event (WhatIf)"
        }
        elseif ($disconnectResult.status -eq 200 -and $disconnectResult.body.success) {
            Write-Pass "Disconnect event processed - deviceId=$deviceId"
            Write-Evidence "Step 8 PASS: Disconnect event - deviceId=$deviceId"
        }
        else {
            Write-Fail "Disconnect event failed: status=$($disconnectResult.status)"
            Write-Evidence "Step 8 FAIL: Disconnect event - status=$($disconnectResult.status)"
        }
    }
    catch {
        Write-Fail "Disconnect event exception: $($_.Exception.Message)"
        Write-Evidence "Step 8 FAIL: Disconnect event exception: $($_.Exception.Message)"
    }
}

# Step 9: Check dashboard after disconnect
Write-Step "9" "Check dashboard - verify offline"
if (-not $adminToken) {
    Write-Fail "Skipping Step 9: no admin token"
    Write-Evidence "Step 9 SKIP: No admin token"
}
else {
    try {
        $statsDisconnectResult = Invoke-ApiCall -Method "GET" -Path "/admin/dashboard/stats" -Token $adminToken

        if ($statsDisconnectResult.whatIf) {
            Write-Pass "Dashboard verified after disconnect (WhatIf)"
            Write-Evidence "Step 9 PASS: Dashboard after disconnect (WhatIf)"
        }
        elseif ($statsDisconnectResult.status -eq 200) {
            $onlineDevicesAfterDisconnect = $statsDisconnectResult.body.onlineDevices
            if ($onlineDevicesAfterDisconnect -lt $onlineDevicesAfterConnect) {
                Write-Pass "Online devices decreased - afterConnect=$onlineDevicesAfterConnect, afterDisconnect=$onlineDevicesAfterDisconnect"
                Write-Evidence "Step 9 PASS: Online devices decreased - $onlineDevicesAfterConnect -> $onlineDevicesAfterDisconnect"
            }
            else {
                Write-Fail "Online devices did not decrease - afterConnect=$onlineDevicesAfterConnect, afterDisconnect=$onlineDevicesAfterDisconnect"
                Write-Evidence "Step 9 FAIL: Online devices did not decrease - $onlineDevicesAfterConnect -> $onlineDevicesAfterDisconnect"
            }
        }
        else {
            Write-Fail "Dashboard stats failed: status=$($statsDisconnectResult.status)"
            Write-Evidence "Step 9 FAIL: Dashboard stats - status=$($statsDisconnectResult.status)"
        }
    }
    catch {
        Write-Fail "Dashboard stats exception: $($_.Exception.Message)"
        Write-Evidence "Step 9 FAIL: Dashboard stats exception: $($_.Exception.Message)"
    }
}

# Save evidence log
$EvidenceLines | Out-File -FilePath $EvidenceFile -Encoding utf8
Write-Host "`nEvidence saved to: $EvidenceFile" -ForegroundColor Gray

# Final summary
Write-Summary "Dashboard + Alert + Telemetry Flow"
