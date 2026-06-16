# e2e/video-upload-flow.ps1 - E2E: Video Upload + Encryption Flow
# Tests: admin login -> upload init -> chunk uploads -> complete -> poll encrypt status
param([switch]$WhatIf)

. "$PSScriptRoot\common.ps1"
Set-E2EWhatIf $WhatIf.IsPresent

# Workaround: common.ps1 uses Get-Variable -Scope Global but dot-sourcing
# from a script doesn't put vars in global scope. Initialize them explicitly.
$Global:E2E_BASE_URL = if ($env:VDEIO_BASE_URL) { $env:VDEIO_BASE_URL } else { "http://localhost:3000/api/v1" }
$Global:E2E_PASS_COUNT = 0
$Global:E2E_FAIL_COUNT = 0

Write-Host "`n=== E2E: Video Upload + Encryption Flow ===" -ForegroundColor White

# --- Evidence logging setup ---
$EvidenceDir = Join-Path (Join-Path (Join-Path $PSScriptRoot "..") ".sisyphus") "evidence"
if (-not (Test-Path $EvidenceDir)) {
    New-Item -ItemType Directory -Path $EvidenceDir -Force | Out-Null
}
$EvidenceFile = Join-Path $EvidenceDir "task-24-video-upload-e2e.log"
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

function Get-ValidVideoChunks {
    # Generate a tiny valid MP4 on-the-fly using ffmpeg, split into 3 base64 chunks
    $tmpFile = [System.IO.Path]::GetTempFileName() + ".mp4"
    $ffmpeg = "ffmpeg"
    $args = @("-f", "lavfi", "-i", "testsrc=duration=0.04:size=16x16:rate=1", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", "-t", "1", "-y", $tmpFile)
    $proc = Start-Process -FilePath $ffmpeg -ArgumentList $args -Wait -NoNewWindow -PassThru
    if ($proc.ExitCode -ne 0 -or -not (Test-Path $tmpFile)) {
        Write-Warning "ffmpeg not available or failed; falling back to random data (encryption will fail)"
        return @{
            fileSize = 3072
            chunkSize = 1024
            chunks = @((New-RandomBase64Chunk 1024), (New-RandomBase64Chunk 1024), (New-RandomBase64Chunk 1024))
        }
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

$videoChunks = Get-ValidVideoChunks
$chunkData1 = $videoChunks.chunks[0]
$chunkData2 = $videoChunks.chunks[1]
$chunkData3 = $videoChunks.chunks[2]

$uploadId = $null
$videoId = $null
$adminToken = $null

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
        $fileSize = $videoChunks.fileSize
        $chunkSize = $videoChunks.chunkSize
        $initResult = Invoke-ApiCall -Method "POST" -Path "/admin/videos/upload/init" -Body @{
            fileName = "e2e-test-video.mp4"
            fileSize = $fileSize
            chunkSize = $chunkSize
        } -Token $adminToken

        if ($initResult.whatIf) {
            Write-Pass "Upload init (WhatIf)"
            $uploadId = "whatif-upload-id"
        }
        elseif ($initResult.status -eq 200 -and $initResult.body.uploadId) {
            $uploadId = $initResult.body.uploadId
            $expectedChunkCount = [math]::Ceiling($fileSize / $chunkSize)
            if ($initResult.body.chunkCount -eq $expectedChunkCount) {
                Write-Pass "Upload init succeeded - uploadId=$uploadId, chunkCount=$($initResult.body.chunkCount)"
            }
            else {
                Write-Fail "Upload init chunkCount mismatch: expected $expectedChunkCount, got $($initResult.body.chunkCount)"
            }
            Write-Evidence "Step 2 PASS: Upload init - uploadId=$uploadId, chunkCount=$($initResult.body.chunkCount), chunkSize=$($initResult.body.chunkSize)"
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

    $chunkData = switch ($i) {
        0 { $chunkData1 }
        1 { $chunkData2 }
        2 { $chunkData3 }
    }

    try {
        # Chunk endpoint expects uploadId and chunkIndex as query params, chunkData in body
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
            if ($completeResult.body.status -eq "uploaded") {
                Write-Pass "Upload complete succeeded - videoId=$videoId, status=$($completeResult.body.status)"
            }
            else {
                Write-Fail "Upload complete unexpected status: expected 'uploaded', got '$($completeResult.body.status)'"
            }
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

# Step 7: Poll video status until encryption done
Write-Step "7" "Poll video status until encryptStatus=done"
$maxAttempts = 30
$attempt = 0
$encrypted = $false

if (-not $videoId -or -not $adminToken) {
    Write-Fail "Skipping Step 7: no videoId or token"
    Write-Evidence "Step 7 SKIP: No videoId or token"
}
else {
    while ($attempt -lt $maxAttempts -and -not $encrypted) {
        $attempt++
        try {
            $videoResult = Invoke-ApiCall -Method "GET" -Path "/admin/videos/$videoId" -Token $adminToken

            if ($videoResult.whatIf) {
                Write-Info "Poll attempt $attempt/$maxAttempts - WhatIf mode"
                $encrypted = $true
                Write-Evidence "Step 7 PASS: Poll (WhatIf mode, attempt $attempt)"
                break
            }

            if ($videoResult.status -eq 200) {
                $status = $videoResult.body.encryptStatus
                Write-Info "Poll attempt $attempt/$maxAttempts - encryptStatus=$status"

                if ($status -eq "done") {
                    $encrypted = $true
                    $hlsUrl = $videoResult.body.hlsUrl
                    if ($hlsUrl) {
                        Write-Pass "Video encryption completed (hlsUrl=$hlsUrl)"
                        Write-Evidence "Step 7 PASS: Encryption done on attempt $attempt - hlsUrl=$hlsUrl"
                    }
                    else {
                        Write-Fail "Encryption done but hlsUrl is missing"
                        Write-Evidence "Step 7 FAIL: Encryption done but hlsUrl missing on attempt $attempt"
                    }
                    break
                }
                elseif ($status -eq "pending" -or $status -eq "processing" -or $status -eq "encrypting") {
                    # Continue polling
                }
                else {
                    Write-Fail "Unexpected encryptStatus: $status"
                    Write-Evidence "Step 7 FAIL: Unexpected encryptStatus=$status on attempt $attempt"
                    break
                }
            }
            else {
                Write-Fail "Poll failed: status=$($videoResult.status), body=$($videoResult.body | ConvertTo-Json -Compress)"
                Write-Evidence "Step 7 FAIL: Poll failed - status=$($videoResult.status) on attempt $attempt"
                break
            }
        }
        catch {
            Write-Fail "Poll exception on attempt $attempt`: $($_.Exception.Message)"
            Write-Evidence "Step 7 FAIL: Poll exception on attempt $attempt`: $($_.Exception.Message)"
            break
        }

        if (-not $encrypted -and $attempt -lt $maxAttempts) {
            Start-Sleep -Seconds 5
        }
    }

    if (-not $encrypted -and -not $videoResult.whatIf) {
        Write-Fail "Video encryption did not complete within $maxAttempts attempts"
        Write-Evidence "Step 7 FAIL: Encryption timeout after $maxAttempts attempts"
    }
}

# Step 8: Verify video in DB (via API)
Write-Step "8" "Verify video exists with hlsUrl"
if (-not $videoId -or -not $adminToken) {
    Write-Fail "Skipping Step 8: no videoId or token"
    Write-Evidence "Step 8 SKIP: No videoId or token"
}
else {
    try {
        $verifyResult = Invoke-ApiCall -Method "GET" -Path "/admin/videos/$videoId" -Token $adminToken

        if ($verifyResult.whatIf) {
            Write-Pass "Video verification (WhatIf)"
            Write-Evidence "Step 8 PASS: Video verification (WhatIf)"
        }
        elseif ($verifyResult.status -eq 200) {
            $v = $verifyResult.body
            if ($v.id -eq $videoId -and $v.title -and $v.hlsUrl) {
                Write-Pass "Video verified: id=$($v.id), title=$($v.title), hlsUrl=$($v.hlsUrl)"
                Write-Evidence "Step 8 PASS: Video verified - id=$($v.id), title=$($v.title), hlsUrl=$($v.hlsUrl)"
            }
            elseif ($v.id -eq $videoId) {
                Write-Fail "Video exists but hlsUrl is missing"
                Write-Evidence "Step 8 FAIL: Video exists but hlsUrl missing"
            }
            else {
                Write-Fail "Video ID mismatch: expected $videoId, got $($v.id)"
                Write-Evidence "Step 8 FAIL: Video ID mismatch"
            }
        }
        else {
            Write-Fail "Video verification failed: status=$($verifyResult.status)"
            Write-Evidence "Step 8 FAIL: Video verification - status=$($verifyResult.status)"
        }
    }
    catch {
        Write-Fail "Video verification exception: $($_.Exception.Message)"
        Write-Evidence "Step 8 FAIL: Video verification exception: $($_.Exception.Message)"
    }
}

# Save evidence log
$EvidenceLines | Out-File -FilePath $EvidenceFile -Encoding utf8
Write-Host "`nEvidence saved to: $EvidenceFile" -ForegroundColor Gray

# Final summary
Write-Summary "Video Upload + Encryption Flow"
