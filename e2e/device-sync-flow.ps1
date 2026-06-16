# e2e/device-sync-flow.ps1 - E2E: Device Registration + Sync + Playback Flow
# Tests: register -> bind -> campaign+video+store+publish -> sync -> playlist -> key -> segment -> report -> telemetry -> single-device constraint
param([switch]$WhatIf)

. "$PSScriptRoot\common.ps1"
Set-E2EWhatIf $WhatIf.IsPresent

# Workaround: common.ps1 uses Get-Variable -Scope Global but dot-sourcing
# from a script doesn't put vars in global scope. Initialize them explicitly.
$Global:E2E_BASE_URL = if ($env:VDEIO_BASE_URL) { $env:VDEIO_BASE_URL } else { "http://localhost:3000/api/v1" }
$Global:E2E_PASS_COUNT = 0
$Global:E2E_FAIL_COUNT = 0

Write-Host "`n=== E2E: Device Sync + Playback Flow ===" -ForegroundColor White

# --- Evidence logging setup ---
$EvidenceDir = Join-Path (Join-Path (Join-Path $PSScriptRoot "..") ".sisyphus") "evidence"
if (-not (Test-Path $EvidenceDir)) {
    New-Item -ItemType Directory -Path $EvidenceDir -Force | Out-Null
}
$EvidenceFile = Join-Path $EvidenceDir "task-26-device-sync-e2e.log"
$EvidenceLines = [System.Collections.Generic.List[string]]::new()
function Write-Evidence([string]$Line) {
    $timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    $entry = "[$timestamp] $Line"
    $EvidenceLines.Add($entry)
    Write-Host $entry
}

# --- Helpers ---
function Get-ValidVideoChunks {
    # Generate a tiny valid MP4 on-the-fly using ffmpeg, split into 3 base64 chunks
    $tmpFile = [System.IO.Path]::GetTempFileName() + ".mp4"
    $ffmpeg = "ffmpeg"
    $args = @("-f", "lavfi", "-i", "testsrc=duration=0.04:size=16x16:rate=1", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", "-t", "1", "-y", $tmpFile)
    $proc = Start-Process -FilePath $ffmpeg -ArgumentList $args -Wait -NoNewWindow -PassThru
    if ($proc.ExitCode -ne 0 -or -not (Test-Path $tmpFile)) {
        throw "ffmpeg not available or failed; cannot produce a valid test video"
    }
    $bytes = [System.IO.File]::ReadAllBytes($tmpFile)
    Remove-Item $tmpFile -Force
    $chunkSizeBytes = [math]::Ceiling($bytes.Length / 3)
    $b1 = $bytes[0..($chunkSizeBytes - 1)]
    $b2 = $bytes[$chunkSizeBytes..(2 * $chunkSizeBytes - 1)]
    $b3 = $bytes[(2 * $chunkSizeBytes)..($bytes.Length - 1)]
    $c1 = [Convert]::ToBase64String($b1)
    $c2 = [Convert]::ToBase64String($b2)
    $c3 = [Convert]::ToBase64String($b3)
    return @{
        fileSize = $bytes.Length
        chunkSize = $chunkSizeBytes
        chunks = @($c1, $c2, $c3)
    }
}

$adminToken = $null
$deviceId = $null
$deviceToken = $null
$storeId = $null
$campaignId = $null
$videoId = $null

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

# Step 1b: Create a dedicated test store (avoids conflicts from previous runs)
Write-Step "1b" "Create test store"
if (-not $adminToken) {
    Write-Fail "Skipping Step 1b: no admin token"
    Write-Evidence "Step 1b SKIP: No admin token"
}
else {
    try {
        $storeResult = Invoke-ApiCall -Method "POST" -Path "/admin/stores" -Token $adminToken -Body @{
            code = "E2E-STORE-$(Get-Random)"
            name = "E2E Device Sync Store $(Get-Random)"
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

# Step 2: Register device
Write-Step "2" "Register device"
if (-not $adminToken) {
    Write-Fail "Skipping Step 2: no admin token"
    Write-Evidence "Step 2 SKIP: No admin token"
}
else {
    try {
        $registerResult = Invoke-ApiCall -Method "POST" -Path "/devices/register" -Body @{
            deviceName = "e2e-test-device-$(Get-Random)"
            osVersion = "Windows-Test-1.0"
        } -Token $adminToken

        if ($registerResult.whatIf) {
            Write-Pass "Device registered (WhatIf)"
            $deviceId = "whatif-device-id"
            $deviceToken = "whatif-device-token"
            Write-Evidence "Step 2 PASS: Device registered (WhatIf)"
        }
        elseif ($registerResult.status -eq 200 -and $registerResult.body.deviceId -and $registerResult.body.deviceToken) {
            $deviceId = $registerResult.body.deviceId
            $deviceToken = $registerResult.body.deviceToken
            Write-Pass "Device registered - deviceId=$deviceId"
            Write-Evidence "Step 2 PASS: Device registered - deviceId=$deviceId"
        }
        else {
            Write-Fail "Device registration failed: status=$($registerResult.status), body=$($registerResult.body | ConvertTo-Json -Compress)"
            Write-Evidence "Step 2 FAIL: Device registration - status=$($registerResult.status)"
        }
    }
    catch {
        Write-Fail "Device registration exception: $($_.Exception.Message)"
        Write-Evidence "Step 2 FAIL: Device registration exception: $($_.Exception.Message)"
    }
}

# Step 3: Bind device to store
Write-Step "3" "Bind device to store"
if (-not $deviceId -or -not $adminToken -or -not $storeId) {
    Write-Fail "Skipping Step 3: missing deviceId=$deviceId, storeId=$storeId, or token"
    Write-Evidence "Step 3 SKIP: Missing deviceId=$deviceId storeId=$storeId"
}
else {
    try {
        $bindResult = Invoke-ApiCall -Method "POST" -Path "/devices/bind" -Body @{
            storeId = $storeId
            deviceId = $deviceId
        } -Token $adminToken

        if ($bindResult.whatIf) {
            Write-Pass "Device bound to store (WhatIf)"
            Write-Evidence "Step 3 PASS: Device bound to store (WhatIf)"
        }
        elseif ($bindResult.status -eq 200 -and $bindResult.body.success) {
            # Server re-issues the device token with the new storeId
            if ($bindResult.body.deviceToken) {
                $deviceToken = $bindResult.body.deviceToken
            }
            Write-Pass "Device bound to store - deviceId=$deviceId, storeId=$storeId"
            Write-Evidence "Step 3 PASS: Device bound - deviceId=$deviceId, storeId=$storeId"
        }
        else {
            Write-Fail "Bind device failed: status=$($bindResult.status), body=$($bindResult.body | ConvertTo-Json -Compress)"
            Write-Evidence "Step 3 FAIL: Bind device - status=$($bindResult.status)"
        }
    }
    catch {
        Write-Fail "Bind device exception: $($_.Exception.Message)"
        Write-Evidence "Step 3 FAIL: Bind device exception: $($_.Exception.Message)"
    }
}

# Step 4: Upload a valid test video and wait for encryption
Write-Step "4" "Upload and encrypt test video"
if (-not $adminToken) {
    Write-Fail "Skipping Step 4: no admin token"
    Write-Evidence "Step 4 SKIP: No admin token"
}
else {
    try {
        $videoChunks = Get-ValidVideoChunks
        $initResult = Invoke-ApiCall -Method "POST" -Path "/admin/videos/upload/init" -Body @{
            fileName = "e2e-device-sync-video.mp4"
            fileSize = $videoChunks.fileSize
            chunkSize = $videoChunks.chunkSize
        } -Token $adminToken

        if ($initResult.whatIf) {
            $videoId = 999
            Write-Pass "Video uploaded (WhatIf)"
            Write-Evidence "Step 4 PASS: Video uploaded (WhatIf)"
        }
        elseif ($initResult.status -eq 200 -and $initResult.body.uploadId) {
            $uploadId = $initResult.body.uploadId
            for ($i = 0; $i -lt 3; $i++) {
                $chunkResult = Invoke-ApiCall -Method "POST" -Path "/admin/videos/upload/chunk?uploadId=$uploadId&chunkIndex=$i" -Body @{
                    chunkData = $videoChunks.chunks[$i]
                } -Token $adminToken
                if (-not $chunkResult.whatIf -and $chunkResult.status -ne 200) {
                    Write-Fail "Chunk $($i+1) failed: status=$($chunkResult.status)"
                }
            }

            $completeResult = Invoke-ApiCall -Method "POST" -Path "/admin/videos/upload/complete" -Body @{
                uploadId = $uploadId
            } -Token $adminToken

            if ($completeResult.status -eq 200 -and $completeResult.body.videoId) {
                $videoId = $completeResult.body.videoId

                # Poll until encryption completes
                $encrypted = $false
                for ($attempt = 1; $attempt -le 30; $attempt++) {
                    $pollResult = Invoke-ApiCall -Method "GET" -Path "/admin/videos/$videoId" -Token $adminToken
                    if ($pollResult.status -eq 200 -and $pollResult.body.encryptStatus -eq "done") {
                        $encrypted = $true
                        break
                    }
                    Start-Sleep -Seconds 1
                }

                if ($encrypted) {
                    Write-Pass "Video uploaded and encrypted - videoId=$videoId"
                    Write-Evidence "Step 4 PASS: Video uploaded and encrypted - videoId=$videoId"
                }
                else {
                    Write-Fail "Video encryption did not complete for videoId=$videoId"
                    Write-Evidence "Step 4 FAIL: Video encryption timeout - videoId=$videoId"
                }
            }
            else {
                Write-Fail "Upload complete failed: status=$($completeResult.status)"
                Write-Evidence "Step 4 FAIL: Upload complete - status=$($completeResult.status)"
            }
        }
        else {
            Write-Fail "Upload init failed: status=$($initResult.status)"
            Write-Evidence "Step 4 FAIL: Upload init - status=$($initResult.status)"
        }
    }
    catch {
        Write-Fail "Video upload exception: $($_.Exception.Message)"
        Write-Evidence "Step 4 FAIL: Video upload exception: $($_.Exception.Message)"
    }
}

# Step 5: Create campaign and add video+store
Write-Step "5" "Create campaign, add video and store"
if (-not $adminToken -or -not $videoId -or -not $storeId) {
    Write-Fail "Skipping Step 5: missing token, videoId=$videoId, or storeId=$storeId"
    Write-Evidence "Step 5 SKIP: Missing videoId=$videoId storeId=$storeId"
}
else {
    try {
        $startTime = (Get-Date).AddDays(-1).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        $endTime = (Get-Date).AddDays(30).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        $campaignResult = Invoke-ApiCall -Method "POST" -Path "/admin/campaigns" -Body @{
            title = "e2e-device-sync-campaign-$(Get-Random)"
            description = "E2E device sync campaign"
            startTime = $startTime
            endTime = $endTime
        } -Token $adminToken

        if ($campaignResult.whatIf) {
            $campaignId = 1
        }
        elseif ($campaignResult.status -eq 201 -and $campaignResult.body.id) {
            $campaignId = $campaignResult.body.id
        }
        else {
            Write-Fail "Campaign creation failed: status=$($campaignResult.status)"
            Write-Evidence "Step 5 FAIL: Campaign creation - status=$($campaignResult.status)"
        }

        if ($campaignId) {
            $addVideoResult = Invoke-ApiCall -Method "POST" -Path "/admin/campaigns/$campaignId/videos" -Body @{
                videoIds = @($videoId)
            } -Token $adminToken
            if (-not $addVideoResult.whatIf -and $addVideoResult.status -ne 204) {
                Write-Fail "Add video to campaign failed: status=$($addVideoResult.status)"
            }

            $addStoreResult = Invoke-ApiCall -Method "POST" -Path "/admin/campaigns/$campaignId/stores" -Body @{
                storeIds = @($storeId)
            } -Token $adminToken
            if (-not $addStoreResult.whatIf -and $addStoreResult.status -ne 204) {
                Write-Fail "Add store to campaign failed: status=$($addStoreResult.status)"
            }

            $publishResult = Invoke-ApiCall -Method "POST" -Path "/admin/campaigns/$campaignId/publish" -Token $adminToken
            if ($publishResult.whatIf) {
                Write-Pass "Campaign created and published (WhatIf)"
                Write-Evidence "Step 5 PASS: Campaign created and published (WhatIf)"
            }
            elseif ($publishResult.status -eq 200 -and $publishResult.body.status -eq "active") {
                Write-Pass "Campaign created and published - campaignId=$campaignId"
                Write-Evidence "Step 5 PASS: Campaign published - campaignId=$campaignId"
            }
            else {
                Write-Fail "Campaign publish failed: status=$($publishResult.status)"
                Write-Evidence "Step 5 FAIL: Campaign publish - status=$($publishResult.status)"
            }
        }
    }
    catch {
        Write-Fail "Campaign setup exception: $($_.Exception.Message)"
        Write-Evidence "Step 5 FAIL: Campaign setup exception: $($_.Exception.Message)"
    }
}

# Step 6: Device sync
Write-Step "6" "Device sync"
if (-not $deviceToken) {
    Write-Fail "Skipping Step 6: no device token"
    Write-Evidence "Step 6 SKIP: No device token"
}
else {
    try {
        $syncResult = Invoke-ApiCall -Method "POST" -Path "/devices/sync" -Body @{
            cachedVideoIds = @()
        } -Token $deviceToken

        if ($syncResult.whatIf) {
            Write-Pass "Device sync (WhatIf)"
            Write-Evidence "Step 6 PASS: Device sync (WhatIf)"
        }
        elseif ($syncResult.status -eq 200) {
            Write-Pass "Device sync succeeded"
            Write-Evidence "Step 6 PASS: Device sync - status=$($syncResult.status)"
        }
        else {
            Write-Fail "Device sync failed: status=$($syncResult.status), body=$($syncResult.body | ConvertTo-Json -Compress)"
            Write-Evidence "Step 6 FAIL: Device sync - status=$($syncResult.status)"
        }
    }
    catch {
        Write-Fail "Device sync exception: $($_.Exception.Message)"
        Write-Evidence "Step 6 FAIL: Device sync exception: $($_.Exception.Message)"
    }
}

# Step 7: Get video list
Write-Step "7" "Get device video list"
if (-not $deviceToken) {
    Write-Fail "Skipping Step 7: no device token"
    Write-Evidence "Step 7 SKIP: No device token"
}
else {
    try {
        $videosResult = Invoke-ApiCall -Method "GET" -Path "/devices/videos" -Token $deviceToken

        if ($videosResult.whatIf) {
            Write-Pass "Video list retrieved (WhatIf)"
            Write-Evidence "Step 7 PASS: Video list (WhatIf)"
        }
        elseif ($videosResult.status -eq 200) {
            Write-Pass "Video list retrieved - campaigns=$($videosResult.body.campaigns.Length)"
            Write-Evidence "Step 7 PASS: Video list - campaigns=$($videosResult.body.campaigns.Length)"
        }
        else {
            Write-Fail "Video list failed: status=$($videosResult.status)"
            Write-Evidence "Step 7 FAIL: Video list - status=$($videosResult.status)"
        }
    }
    catch {
        Write-Fail "Video list exception: $($_.Exception.Message)"
        Write-Evidence "Step 7 FAIL: Video list exception: $($_.Exception.Message)"
    }
}

# Step 8: Get playlist for video
Write-Step "8" "Get video playlist"
if (-not $deviceToken -or -not $videoId) {
    Write-Fail "Skipping Step 8: missing deviceToken or videoId=$videoId"
    Write-Evidence "Step 8 SKIP: Missing videoId=$videoId"
}
else {
    try {
        $playlistResult = Invoke-ApiCall -Method "GET" -Path "/devices/videos/$videoId/playlist" -Token $deviceToken

        if ($playlistResult.whatIf) {
            Write-Pass "Playlist retrieved (WhatIf)"
            Write-Evidence "Step 8 PASS: Playlist (WhatIf)"
        }
        elseif ($playlistResult.status -eq 200) {
            Write-Pass "Playlist retrieved - url=$($playlistResult.body.url)"
            Write-Evidence "Step 8 PASS: Playlist - url=$($playlistResult.body.url)"
        }
        else {
            Write-Fail "Playlist failed: status=$($playlistResult.status)"
            Write-Evidence "Step 8 FAIL: Playlist - status=$($playlistResult.status)"
        }
    }
    catch {
        Write-Fail "Playlist exception: $($_.Exception.Message)"
        Write-Evidence "Step 8 FAIL: Playlist exception: $($_.Exception.Message)"
    }
}

# Step 9: Get AES key
Write-Step "9" "Get video AES key"
if (-not $deviceToken -or -not $videoId) {
    Write-Fail "Skipping Step 9: missing deviceToken or videoId=$videoId"
    Write-Evidence "Step 9 SKIP: Missing videoId=$videoId"
}
else {
    try {
        $keyResult = Invoke-ApiCall -Method "GET" -Path "/devices/videos/$videoId/key" -Token $deviceToken

        if ($keyResult.whatIf) {
            Write-Pass "AES key retrieved (WhatIf)"
            Write-Evidence "Step 9 PASS: AES key (WhatIf)"
        }
        elseif ($keyResult.status -eq 200) {
            Write-Pass "AES key retrieved - binary data received"
            Write-Evidence "Step 9 PASS: AES key - binary data received"
        }
        else {
            Write-Fail "AES key failed: status=$($keyResult.status)"
            Write-Evidence "Step 9 FAIL: AES key - status=$($keyResult.status)"
        }
    }
    catch {
        Write-Fail "AES key exception: $($_.Exception.Message)"
        Write-Evidence "Step 9 FAIL: AES key exception: $($_.Exception.Message)"
    }
}

# Step 10: Get segment
Write-Step "10" "Download video segment"
if (-not $deviceToken -or -not $videoId) {
    Write-Fail "Skipping Step 10: missing deviceToken or videoId=$videoId"
    Write-Evidence "Step 10 SKIP: Missing videoId=$videoId"
}
else {
    try {
        $segmentResult = Invoke-ApiCall -Method "GET" -Path "/devices/videos/$videoId/segment/000" -Token $deviceToken

        if ($segmentResult.whatIf) {
            Write-Pass "Segment retrieved (WhatIf)"
            Write-Evidence "Step 10 PASS: Segment (WhatIf)"
        }
        elseif ($segmentResult.status -eq 200) {
            Write-Pass "Segment retrieved - binary data received"
            Write-Evidence "Step 10 PASS: Segment - binary data received"
        }
        else {
            Write-Fail "Segment failed: status=$($segmentResult.status)"
            Write-Evidence "Step 10 FAIL: Segment - status=$($segmentResult.status)"
        }
    }
    catch {
        Write-Fail "Segment exception: $($_.Exception.Message)"
        Write-Evidence "Step 10 FAIL: Segment exception: $($_.Exception.Message)"
    }
}

# Step 11: Report playback
Write-Step "11" "Report playback event"
if (-not $deviceToken -or -not $videoId) {
    Write-Fail "Skipping Step 11: missing deviceToken or videoId=$videoId"
    Write-Evidence "Step 11 SKIP: Missing videoId=$videoId"
}
else {
    try {
        $reportResult = Invoke-ApiCall -Method "POST" -Path "/devices/videos/$videoId/report-play" -Body @{
            event = "play"
            position = 0
            duration = 300
        } -Token $deviceToken

        if ($reportResult.whatIf) {
            Write-Pass "Playback reported (WhatIf)"
            Write-Evidence "Step 11 PASS: Playback reported (WhatIf)"
        }
        elseif ($reportResult.status -eq 200 -and $reportResult.body.success) {
            Write-Pass "Playback reported successfully"
            Write-Evidence "Step 11 PASS: Playback reported"
        }
        else {
            Write-Fail "Playback report failed: status=$($reportResult.status)"
            Write-Evidence "Step 11 FAIL: Playback report - status=$($reportResult.status)"
        }
    }
    catch {
        Write-Fail "Playback report exception: $($_.Exception.Message)"
        Write-Evidence "Step 11 FAIL: Playback report exception: $($_.Exception.Message)"
    }
}

# Step 12: Send telemetry
Write-Step "12" "Send device telemetry"
if (-not $deviceToken) {
    Write-Fail "Skipping Step 12: no device token"
    Write-Evidence "Step 12 SKIP: No device token"
}
else {
    try {
        $telemetryResult = Invoke-ApiCall -Method "POST" -Path "/devices/telemetry" -Body @{
            cpu = 45
            memory = 60
            diskFree = 80
            networkLatency = 12
            appVersion = "1.0.0"
        } -Token $deviceToken

        if ($telemetryResult.whatIf) {
            Write-Pass "Telemetry sent (WhatIf)"
            Write-Evidence "Step 12 PASS: Telemetry sent (WhatIf)"
        }
        elseif ($telemetryResult.status -eq 200 -and $telemetryResult.body.success) {
            Write-Pass "Telemetry sent successfully"
            Write-Evidence "Step 12 PASS: Telemetry sent"
        }
        else {
            Write-Fail "Telemetry failed: status=$($telemetryResult.status)"
            Write-Evidence "Step 12 FAIL: Telemetry - status=$($telemetryResult.status)"
        }
    }
    catch {
        Write-Fail "Telemetry exception: $($_.Exception.Message)"
        Write-Evidence "Step 12 FAIL: Telemetry exception: $($_.Exception.Message)"
    }
}

# Step 13: Test single device constraint
Write-Step "13" "Test single device constraint (expect 409)"
if (-not $adminToken -or -not $storeId) {
    Write-Fail "Skipping Step 13: no admin token or storeId"
    Write-Evidence "Step 13 SKIP: No admin token or storeId"
}
else {
    try {
        $register2Result = Invoke-ApiCall -Method "POST" -Path "/devices/register" -Body @{
            deviceName = "e2e-test-device-2-$(Get-Random)"
            osVersion = "Windows-Test-2.0"
        } -Token $adminToken

        $device2Id = $null
        if ($register2Result.whatIf) {
            $device2Id = "whatif-device-2"
        }
        elseif ($register2Result.status -eq 200 -and $register2Result.body.deviceId) {
            $device2Id = $register2Result.body.deviceId
        }
        else {
            Write-Fail "Device 2 registration failed: status=$($register2Result.status)"
            Write-Evidence "Step 13 FAIL: Device 2 registration - status=$($register2Result.status)"
        }

        if ($device2Id) {
            $bind2Result = Invoke-ApiCall -Method "POST" -Path "/devices/bind" -Body @{
                storeId = $storeId
                deviceId = $device2Id
            } -Token $adminToken

            if ($bind2Result.whatIf) {
                Write-Pass "Single device constraint tested (WhatIf)"
                Write-Evidence "Step 13 PASS: Single device constraint (WhatIf)"
            }
            elseif ($bind2Result.status -eq 409) {
                Write-Pass "Single device constraint enforced - 409 returned as expected"
                Write-Evidence "Step 13 PASS: Single device constraint - 409 returned"
            }
            else {
                Write-Fail "Expected 409 but got status=$($bind2Result.status)"
                Write-Evidence "Step 13 FAIL: Expected 409, got status=$($bind2Result.status)"
            }
        }
    }
    catch {
        Write-Fail "Single device constraint exception: $($_.Exception.Message)"
        Write-Evidence "Step 13 FAIL: Single device constraint exception: $($_.Exception.Message)"
    }
}

# Save evidence log
$EvidenceLines | Out-File -FilePath $EvidenceFile -Encoding utf8
Write-Host "`nEvidence saved to: $EvidenceFile" -ForegroundColor Gray

# Final summary
Write-Summary "Device Sync + Playback Flow"
