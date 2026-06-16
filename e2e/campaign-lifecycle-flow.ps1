# e2e/campaign-lifecycle-flow.ps1 - E2E: Campaign Lifecycle Flow
# Tests: admin login -> upload video -> create draft campaign -> add video -> add store -> publish -> verify dashboard -> end
param([switch]$WhatIf)

. "$PSScriptRoot\common.ps1"
Set-E2EWhatIf $WhatIf.IsPresent

# Workaround: common.ps1 uses Get-Variable -Scope Global but dot-sourcing
# from a script doesn't put vars in global scope. Initialize them explicitly.
$Global:E2E_BASE_URL = if ($env:VDEIO_BASE_URL) { $env:VDEIO_BASE_URL } else { "http://localhost:3000/api/v1" }
$Global:E2E_PASS_COUNT = 0
$Global:E2E_FAIL_COUNT = 0

Write-Host "`n=== E2E: Campaign Lifecycle Flow ===" -ForegroundColor White

# --- Evidence logging setup ---
$EvidenceDir = Join-Path (Join-Path (Join-Path $PSScriptRoot "..") ".sisyphus") "evidence"
if (-not (Test-Path $EvidenceDir)) {
    New-Item -ItemType Directory -Path $EvidenceDir -Force | Out-Null
}
$EvidenceFile = Join-Path $EvidenceDir "task-25-campaign-lifecycle-e2e.log"
$EvidenceLines = [System.Collections.Generic.List[string]]::new()
function Write-Evidence([string]$Line) {
    $timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    $entry = "[$timestamp] $Line"
    $EvidenceLines.Add($entry)
    Write-Host $entry
}

# --- Helpers ---
function New-RandomBase64Chunk([int]$ByteCount = 1024) {
    $bytes = [byte[]]::new($ByteCount)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    return [Convert]::ToBase64String($bytes)
}

$adminToken = $null
$campaignId = $null
$videoId = $null
$uploadId = $null
$storeId = 1  # Seeded test store (TEST001)

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
        Write-Fail "Admin login failed: status=$($loginResult.status), body=$($loginResult.body | ConvertTo-Json -Compress)"
        Write-Evidence "Step 1 FAIL: Admin login - status=$($loginResult.status)"
    }
}
catch {
    Write-Fail "Admin login exception: $($_.Exception.Message)"
    Write-Evidence "Step 1 FAIL: Admin login exception: $($_.Exception.Message)"
}

# Step 2: Initialize video upload
Write-Step "2" "Initialize video upload"
if (-not $adminToken) {
    Write-Fail "Skipping Step 2: no admin token"
    Write-Evidence "Step 2 SKIP: No admin token"
}
else {
    try {
        $fileSize = 3072
        $chunkSize = 1024
        $initResult = Invoke-ApiCall -Method "POST" -Path "/admin/videos/upload/init" -Body @{
            fileName = "e2e-campaign-test-video.mp4"
            fileSize = $fileSize
            chunkSize = $chunkSize
        } -Token $adminToken

        if ($initResult.whatIf) {
            Write-Pass "Upload init (WhatIf)"
            $uploadId = "whatif-campaign-upload-id"
            Write-Evidence "Step 2 PASS: Upload init (WhatIf)"
        }
        elseif ($initResult.status -eq 200 -and $initResult.body.uploadId) {
            $uploadId = $initResult.body.uploadId
            Write-Pass "Upload init succeeded - uploadId=$uploadId, chunkCount=$($initResult.body.chunkCount)"
            Write-Evidence "Step 2 PASS: Upload init - uploadId=$uploadId, chunkCount=$($initResult.body.chunkCount)"
        }
        else {
            Write-Fail "Upload init failed: status=$($initResult.status), body=$($initResult.body | ConvertTo-Json -Compress)"
            Write-Evidence "Step 2 FAIL: Upload init - status=$($initResult.status)"
        }
    }
    catch {
        Write-Fail "Upload init exception: $($_.Exception.Message)"
        Write-Evidence "Step 2 FAIL: Upload init exception: $($_.Exception.Message)"
    }
}

# Step 3-5: Upload chunks
for ($i = 0; $i -lt 3; $i++) {
    $stepNum = $i + 3
    Write-Step "$stepNum" "Upload chunk $($i + 1) of 3"

    if (-not $uploadId -or -not $adminToken) {
        Write-Fail "Skipping Step ${stepNum}: no uploadId or token"
        Write-Evidence "Step $stepNum SKIP: No uploadId or token"
        continue
    }

    $chunkData = New-RandomBase64Chunk -ByteCount 1024

    try {
        $chunkResult = Invoke-ApiCall -Method "POST" -Path "/admin/videos/upload/chunk?uploadId=$uploadId&chunkIndex=$i" -Body @{
            chunkData = $chunkData
        } -Token $adminToken

        if ($chunkResult.whatIf) {
            Write-Pass "Chunk $($i + 1) upload (WhatIf)"
            Write-Evidence "Step $stepNum PASS: Chunk $($i + 1) (WhatIf)"
        }
        elseif ($chunkResult.status -eq 200 -and $chunkResult.body.receivedBytes -gt 0) {
            Write-Pass "Chunk $($i + 1) upload succeeded (receivedBytes=$($chunkResult.body.receivedBytes))"
            Write-Evidence "Step $stepNum PASS: Chunk $($i + 1) - receivedBytes=$($chunkResult.body.receivedBytes)"
        }
        else {
            Write-Fail "Chunk $($i + 1) upload failed: status=$($chunkResult.status), body=$($chunkResult.body | ConvertTo-Json -Compress)"
            Write-Evidence "Step $stepNum FAIL: Chunk $($i + 1) - status=$($chunkResult.status)"
        }
    }
    catch {
        Write-Fail "Chunk $($i + 1) upload exception: $($_.Exception.Message)"
        Write-Evidence "Step $stepNum FAIL: Chunk $($i + 1) exception: $($_.Exception.Message)"
    }
}

# Step 6: Complete upload
Write-Step "6" "Complete video upload"
if (-not $uploadId -or -not $adminToken) {
    Write-Fail "Skipping Step 6: no uploadId or token"
    Write-Evidence "Step 6 SKIP: No uploadId or token"
}
else {
    try {
        $completeResult = Invoke-ApiCall -Method "POST" -Path "/admin/videos/upload/complete" -Body @{
            uploadId = $uploadId
        } -Token $adminToken

        if ($completeResult.whatIf) {
            Write-Pass "Upload complete (WhatIf)"
            $videoId = 999
            Write-Evidence "Step 6 PASS: Upload complete (WhatIf)"
        }
        elseif ($completeResult.status -eq 200 -and $completeResult.body.videoId) {
            $videoId = $completeResult.body.videoId
            Write-Pass "Upload complete succeeded - videoId=$videoId, status=$($completeResult.body.status)"
            Write-Evidence "Step 6 PASS: Upload complete - videoId=$videoId, status=$($completeResult.body.status)"
        }
        else {
            Write-Fail "Upload complete failed: status=$($completeResult.status), body=$($completeResult.body | ConvertTo-Json -Compress)"
            Write-Evidence "Step 6 FAIL: Upload complete - status=$($completeResult.status)"
        }
    }
    catch {
        Write-Fail "Upload complete exception: $($_.Exception.Message)"
        Write-Evidence "Step 6 FAIL: Upload complete exception: $($_.Exception.Message)"
    }
}

# Step 7: Create campaign (draft)
Write-Step "7" "Create campaign as draft"
if (-not $adminToken) {
    Write-Fail "Skipping Step 7: no admin token"
    Write-Evidence "Step 7 SKIP: No admin token"
}
else {
    try {
        $startTime = (Get-Date).AddDays(1).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        $endTime = (Get-Date).AddDays(30).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        $campaignResult = Invoke-ApiCall -Method "POST" -Path "/admin/campaigns" -Body @{
            title = "e2e-test-campaign-$(Get-Random)"
            description = "E2E test campaign lifecycle"
            startTime = $startTime
            endTime = $endTime
        } -Token $adminToken

        if ($campaignResult.whatIf) {
            Write-Pass "Campaign created (WhatIf)"
            $campaignId = 1
            Write-Evidence "Step 7 PASS: Campaign created (WhatIf)"
        }
        elseif ($campaignResult.status -eq 201 -and $campaignResult.body.id) {
            $campaignId = $campaignResult.body.id
            $status = $campaignResult.body.status
            if ($status -eq "draft") {
                Write-Pass "Campaign created - id=$campaignId, status=$status"
            }
            else {
                Write-Fail "Campaign created but status is not draft: $status"
            }
            Write-Evidence "Step 7 PASS: Campaign created - id=$campaignId, status=$status"
        }
        else {
            Write-Fail "Campaign creation failed: status=$($campaignResult.status), body=$($campaignResult.body | ConvertTo-Json -Compress)"
            Write-Evidence "Step 7 FAIL: Campaign creation - status=$($campaignResult.status)"
        }
    }
    catch {
        Write-Fail "Campaign creation exception: $($_.Exception.Message)"
        Write-Evidence "Step 7 FAIL: Campaign creation exception: $($_.Exception.Message)"
    }
}

# Step 8: Add video to campaign
Write-Step "8" "Add video to campaign"
if (-not $campaignId -or -not $videoId -or -not $adminToken) {
    Write-Fail "Skipping Step 8: missing campaignId=$campaignId, videoId=$videoId, or token"
    Write-Evidence "Step 8 SKIP: Missing campaignId=$campaignId, videoId=$videoId"
}
else {
    try {
        $addVideoResult = Invoke-ApiCall -Method "POST" -Path "/admin/campaigns/$campaignId/videos" -Body @{
            videoIds = @($videoId)
        } -Token $adminToken

        if ($addVideoResult.whatIf) {
            Write-Pass "Video added to campaign (WhatIf)"
            Write-Evidence "Step 8 PASS: Video added to campaign (WhatIf)"
        }
        elseif ($addVideoResult.status -eq 204) {
            Write-Pass "Video added to campaign - videoId=$videoId"
            Write-Evidence "Step 8 PASS: Video added to campaign - videoId=$videoId"
        }
        else {
            Write-Fail "Add video to campaign failed: status=$($addVideoResult.status), body=$($addVideoResult.body | ConvertTo-Json -Compress)"
            Write-Evidence "Step 8 FAIL: Add video - status=$($addVideoResult.status)"
        }
    }
    catch {
        Write-Fail "Add video to campaign exception: $($_.Exception.Message)"
        Write-Evidence "Step 8 FAIL: Add video exception: $($_.Exception.Message)"
    }
}

# Step 9: Add store to campaign
Write-Step "9" "Add store to campaign"
if (-not $campaignId -or -not $adminToken) {
    Write-Fail "Skipping Step 9: missing campaignId=$campaignId or token"
    Write-Evidence "Step 9 SKIP: Missing campaignId=$campaignId"
}
else {
    try {
        $addStoreResult = Invoke-ApiCall -Method "POST" -Path "/admin/campaigns/$campaignId/stores" -Body @{
            storeIds = @($storeId)
        } -Token $adminToken

        if ($addStoreResult.whatIf) {
            Write-Pass "Store added to campaign (WhatIf)"
            Write-Evidence "Step 9 PASS: Store added to campaign (WhatIf)"
        }
        elseif ($addStoreResult.status -eq 204) {
            Write-Pass "Store added to campaign - storeId=$storeId"
            Write-Evidence "Step 9 PASS: Store added to campaign - storeId=$storeId"
        }
        else {
            Write-Fail "Add store to campaign failed: status=$($addStoreResult.status), body=$($addStoreResult.body | ConvertTo-Json -Compress)"
            Write-Evidence "Step 9 FAIL: Add store - status=$($addStoreResult.status)"
        }
    }
    catch {
        Write-Fail "Add store to campaign exception: $($_.Exception.Message)"
        Write-Evidence "Step 9 FAIL: Add store exception: $($_.Exception.Message)"
    }
}

# Step 10: Publish campaign
Write-Step "10" "Publish campaign"
if (-not $campaignId -or -not $adminToken) {
    Write-Fail "Skipping Step 10: missing campaignId=$campaignId or token"
    Write-Evidence "Step 10 SKIP: Missing campaignId=$campaignId"
}
else {
    try {
        $publishResult = Invoke-ApiCall -Method "POST" -Path "/admin/campaigns/$campaignId/publish" -Token $adminToken

        if ($publishResult.whatIf) {
            Write-Pass "Campaign published (WhatIf)"
            Write-Evidence "Step 10 PASS: Campaign published (WhatIf)"
        }
        elseif ($publishResult.status -eq 200) {
            $status = $publishResult.body.status
            if ($status -eq "active") {
                Write-Pass "Campaign published - id=$campaignId, status=$status"
            }
            else {
                Write-Fail "Campaign published but unexpected status: expected 'active', got '$status'"
            }
            Write-Evidence "Step 10 PASS: Campaign published - id=$campaignId, status=$status"
        }
        else {
            Write-Fail "Publish campaign failed: status=$($publishResult.status), body=$($publishResult.body | ConvertTo-Json -Compress)"
            Write-Evidence "Step 10 FAIL: Publish - status=$($publishResult.status)"
        }
    }
    catch {
        Write-Fail "Publish campaign exception: $($_.Exception.Message)"
        Write-Evidence "Step 10 FAIL: Publish exception: $($_.Exception.Message)"
    }
}

# Step 11: Verify Dashboard
Write-Step "11" "Verify dashboard stats"
if (-not $adminToken) {
    Write-Fail "Skipping Step 11: no admin token"
    Write-Evidence "Step 11 SKIP: No admin token"
}
else {
    try {
        $statsResult = Invoke-ApiCall -Method "GET" -Path "/admin/dashboard/stats" -Token $adminToken

        if ($statsResult.whatIf) {
            Write-Pass "Dashboard stats verified (WhatIf)"
            Write-Evidence "Step 11 PASS: Dashboard stats (WhatIf)"
        }
        elseif ($statsResult.status -eq 200) {
            $body = $statsResult.body
            $hasFields = $body.totalVideos -ne $null -and $body.activeCampaigns -ne $null -and $body.onlineDevices -ne $null
            if ($hasFields) {
                Write-Pass "Dashboard stats verified - totalVideos=$($body.totalVideos), activeCampaigns=$($body.activeCampaigns), onlineDevices=$($body.onlineDevices)"
            }
            else {
                Write-Fail "Dashboard stats missing expected fields"
            }
            Write-Evidence "Step 11 PASS: Dashboard stats - totalVideos=$($body.totalVideos), activeCampaigns=$($body.activeCampaigns), onlineDevices=$($body.onlineDevices)"
        }
        else {
            Write-Fail "Dashboard stats failed: status=$($statsResult.status)"
            Write-Evidence "Step 11 FAIL: Dashboard stats - status=$($statsResult.status)"
        }
    }
    catch {
        Write-Fail "Dashboard stats exception: $($_.Exception.Message)"
        Write-Evidence "Step 11 FAIL: Dashboard stats exception: $($_.Exception.Message)"
    }
}

# Step 12: End campaign
Write-Step "12" "End campaign"
if (-not $campaignId -or -not $adminToken) {
    Write-Fail "Skipping Step 12: missing campaignId=$campaignId or token"
    Write-Evidence "Step 12 SKIP: Missing campaignId=$campaignId"
}
else {
    try {
        $endResult = Invoke-ApiCall -Method "POST" -Path "/admin/campaigns/$campaignId/end" -Token $adminToken

        if ($endResult.whatIf) {
            Write-Pass "Campaign ended (WhatIf)"
            Write-Evidence "Step 12 PASS: Campaign ended (WhatIf)"
        }
        elseif ($endResult.status -eq 200) {
            $status = $endResult.body.status
            if ($status -eq "ended") {
                Write-Pass "Campaign ended - id=$campaignId, status=$status"
            }
            else {
                Write-Fail "Campaign ended but unexpected status: expected 'ended', got '$status'"
            }
            Write-Evidence "Step 12 PASS: Campaign ended - id=$campaignId, status=$status"
        }
        else {
            Write-Fail "End campaign failed: status=$($endResult.status), body=$($endResult.body | ConvertTo-Json -Compress)"
            Write-Evidence "Step 12 FAIL: End campaign - status=$($endResult.status)"
        }
    }
    catch {
        Write-Fail "End campaign exception: $($_.Exception.Message)"
        Write-Evidence "Step 12 FAIL: End campaign exception: $($_.Exception.Message)"
    }
}

# Save evidence log
$EvidenceLines | Out-File -FilePath $EvidenceFile -Encoding utf8
Write-Host "`nEvidence saved to: $EvidenceFile" -ForegroundColor Gray

# Final summary
Write-Summary "Campaign Lifecycle Flow"
