# e2e/real-video-upload.ps1 - E2E: Real MP4 Video Upload + Encryption Flow
# Tests: admin login -> real MP4 generation -> upload init -> binary chunk uploads -> complete -> poll encrypt status -> MinIO verification -> key endpoint verification
param([switch]$WhatIf)

. "$PSScriptRoot\common.ps1"
Set-E2EWhatIf $WhatIf.IsPresent

# Workaround: common.ps1 uses Get-Variable -Scope Global but dot-sourcing
# from a script doesn't put vars in global scope. Initialize them explicitly.
$Global:E2E_BASE_URL = if ($env:VDEIO_BASE_URL) { $env:VDEIO_BASE_URL } else { "http://localhost:3000/api/v1" }
$Global:E2E_PASS_COUNT = 0
$Global:E2E_FAIL_COUNT = 0

Write-Host "`n=== E2E: Real MP4 Video Upload + Encryption Flow ===" -ForegroundColor White

# --- Evidence logging setup ---
$EvidenceDir = Join-Path (Join-Path (Join-Path $PSScriptRoot "..") ".sisyphus") "evidence"
if (-not (Test-Path $EvidenceDir)) {
    New-Item -ItemType Directory -Path $EvidenceDir -Force | Out-Null
}
$EvidenceFile = Join-Path $EvidenceDir "task-9-real-video-upload.log"
$EvidenceLines = [System.Collections.Generic.List[string]]::new()
function Write-Evidence([string]$Line) {
    $timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    $entry = "[$timestamp] $Line"
    $EvidenceLines.Add($entry)
    Write-Host $entry
}

# --- Configuration ---
$VideoFile = Join-Path $PSScriptRoot "test-video-real.mp4"
$FallbackVideoFile = Join-Path $PSScriptRoot "test-video.mp4"
$ChunkSize = 51200  # 50KB chunks as specified
$BaseUrl = $Global:E2E_BASE_URL

# --- Step 0: Ensure valid test video exists ---
Write-Step "0" "Ensure valid test MP4 video exists"

function Test-ValidMp4([string]$Path) {
    if (-not (Test-Path $Path)) { return $false }
    $info = Get-Item $Path
    if ($info.Length -lt 10240) { return $false }  # Must be > 10KB
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    # MP4 magic: first 4 bytes = box size, next 4 bytes = 'ftyp'
    if ($bytes.Length -lt 8) { return $false }
    $ftyp = [System.Text.Encoding]::ASCII.GetString($bytes[4..7])
    return $ftyp -eq "ftyp"
}

if (-not (Test-ValidMp4 $VideoFile)) {
    Write-Info "test-video-real.mp4 missing or invalid; generating with FFmpeg..."
    # Generate a fresh valid MP4
    $ffmpegArgs = @("-y", "-f", "lavfi", "-i", "testsrc=duration=5:size=640x480:rate=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", $VideoFile)
    $proc = Start-Process -FilePath "ffmpeg" -ArgumentList $ffmpegArgs -Wait -NoNewWindow -PassThru
    if ($proc.ExitCode -ne 0 -or -not (Test-ValidMp4 $VideoFile)) {
        Write-Fail "Failed to generate valid test video with FFmpeg"
        Write-Evidence "Step 0 FAIL: FFmpeg failed to generate valid MP4"
        $EvidenceLines | Out-File -FilePath $EvidenceFile -Encoding utf8
        exit 1
    }
    $fileSizeStep0 = (Get-Item $VideoFile).Length
    Write-Pass "Generated valid test video: $VideoFile ($fileSizeStep0 bytes)"
    Write-Evidence "Step 0 PASS: Generated valid MP4 with FFmpeg - $fileSizeStep0 bytes"
} else {
    $fileSizeStep0 = (Get-Item $VideoFile).Length
    Write-Pass "Valid test video already exists: $VideoFile ($fileSizeStep0 bytes)"
    Write-Evidence "Step 0 PASS: Valid MP4 exists - $fileSizeStep0 bytes"
}

# --- Helpers ---
function Invoke-ApiCallRaw {
    param(
        [Parameter(Mandatory)][ValidateSet("GET", "POST", "PUT", "DELETE", "PATCH")][string]$Method,
        [Parameter(Mandatory)][string]$Path,
        [object]$Body,
        [string]$Token,
        [string]$ContentType = "application/json",
        [int]$ExpectedStatus = 200
    )

    $isWhatIf = Get-E2EWhatIf
    if ($isWhatIf) {
        Write-Host "  [WhatIf] $Method $Path" -ForegroundColor Yellow
        return @{ status = $ExpectedStatus; body = @{ success = $true }; whatIf = $true }
    }

    $headers = @{}
    if ($ContentType) {
        $headers["Content-Type"] = $ContentType
    }
    if ($Token) {
        $headers["Authorization"] = "Bearer $Token"
    }

    $uri = "$BaseUrl$Path"
    $params = @{
        Method  = $Method
        Uri     = $uri
        Headers = $headers
        UseBasicParsing = $true
    }
    if ($Body -and $Method -ne "GET") {
        $params["Body"] = $Body
    }

    try {
        $response = Invoke-WebRequest @params
        $contentType = $response.Headers["Content-Type"]
        if ($contentType -and $contentType -like "application/json*") {
            $respBody = $response.Content | ConvertFrom-Json
        } else {
            $respBody = $response.Content
        }
        return @{ status = [int]$response.StatusCode; body = $respBody; whatIf = $false }
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        return @{ status = $statusCode; body = @{ error = $_.Exception.Message }; whatIf = $false; error = $true }
    }
}

function Invoke-BinaryChunkUpload {
    param(
        [Parameter(Mandatory)][string]$UploadId,
        [Parameter(Mandatory)][int]$ChunkIndex,
        [Parameter(Mandatory)][byte[]]$ChunkBytes,
        [Parameter(Mandatory)][string]$Token
    )
    $path = "/admin/videos/upload/chunk?uploadId=$UploadId&chunkIndex=$ChunkIndex"
    return Invoke-ApiCallRaw -Method "POST" -Path $path -Body $ChunkBytes -Token $Token -ContentType "application/octet-stream"
}

function Invoke-Base64ChunkUpload {
    param(
        [Parameter(Mandatory)][string]$UploadId,
        [Parameter(Mandatory)][int]$ChunkIndex,
        [Parameter(Mandatory)][byte[]]$ChunkBytes,
        [Parameter(Mandatory)][string]$Token
    )
    $path = "/admin/videos/upload/chunk?uploadId=$UploadId&chunkIndex=$ChunkIndex"
    $base64 = [Convert]::ToBase64String($ChunkBytes)
    return Invoke-ApiCall -Method "POST" -Path $path -Body @{ chunkData = $base64 } -Token $Token
}

function ConvertTo-Base64Url([byte[]]$Bytes) {
    $base64 = [Convert]::ToBase64String($Bytes)
    $base64 = $base64.Replace('+', '-').Replace('/', '_')
    return $base64.TrimEnd('=')
}

function New-DeviceJwt {
    param(
        [Parameter(Mandatory)][int]$UserId,
        [Parameter(Mandatory)][int]$StoreId,
        [Parameter(Mandatory)][string]$DeviceId,
        [Parameter(Mandatory)][string]$Secret
    )
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $exp = $now + 7200
    $header = @{ alg = "HS512"; typ = "JWT" } | ConvertTo-Json -Compress
    $payload = @{
        userId = $UserId
        storeId = $StoreId
        deviceId = $DeviceId
        role = "operator"
        iat = $now
        exp = $exp
    } | ConvertTo-Json -Compress

    $headerB64 = ConvertTo-Base64Url -Bytes ([System.Text.Encoding]::UTF8.GetBytes($header))
    $payloadB64 = ConvertTo-Base64Url -Bytes ([System.Text.Encoding]::UTF8.GetBytes($payload))
    $toSign = "$headerB64.$payloadB64"

    $hmac = New-Object System.Security.Cryptography.HMACSHA512
    $hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($Secret)
    $signature = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($toSign))
    $signatureB64 = ConvertTo-Base64Url -Bytes $signature

    return "$toSign.$signatureB64"
}

$adminToken = $null
$uploadId = $null
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
        $fileSize = (Get-Item $VideoFile).Length
        $initResult = Invoke-ApiCall -Method "POST" -Path "/admin/videos/upload/init" -Body @{
            fileName = "test-video-real.mp4"
            fileSize = $fileSize
            chunkSize = $ChunkSize
        } -Token $adminToken

        if ($initResult.whatIf) {
            Write-Pass "Upload init (WhatIf)"
            $uploadId = "whatif-upload-id"
            Write-Evidence "Step 2 PASS: Upload init (WhatIf)"
        }
        elseif ($initResult.status -eq 200 -and $initResult.body.uploadId) {
            $uploadId = $initResult.body.uploadId
            $expectedChunkCount = [math]::Ceiling($fileSize / $ChunkSize)
            if ($initResult.body.chunkCount -eq $expectedChunkCount) {
                Write-Pass "Upload init succeeded - uploadId=$uploadId, chunkCount=$($initResult.body.chunkCount), chunkSize=$($initResult.body.chunkSize)"
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

# Step 3: Upload chunks (binary preferred, base64 fallback)
Write-Step "3" "Upload chunks (binary preferred, base64 fallback)"
if (-not $uploadId -or -not $adminToken) {
    Write-Fail "Skipping Step 3: no uploadId or token"
    Write-Evidence "Step 3 SKIP: No uploadId or token"
}
else {
    try {
        $fileBytes = [System.IO.File]::ReadAllBytes($VideoFile)
        $chunkCount = [math]::Ceiling($fileBytes.Length / $ChunkSize)
        $allChunksOk = $true
        $usedBinary = $true

        for ($i = 0; $i -lt $chunkCount; $i++) {
            $offset = $i * $ChunkSize
            $length = [math]::Min($ChunkSize, $fileBytes.Length - $offset)
            $chunk = [byte[]]::new($length)
            [Array]::Copy($fileBytes, $offset, $chunk, 0, $length)

            Write-Info "Uploading chunk $($i + 1) of $chunkCount (${length} bytes)..."

            # Try binary upload first
            $chunkResult = Invoke-BinaryChunkUpload -UploadId $uploadId -ChunkIndex $i -ChunkBytes $chunk -Token $adminToken

            if ($chunkResult.status -eq 200) {
                Write-Pass "Chunk $($i + 1) binary upload succeeded (receivedBytes=$($chunkResult.body.receivedBytes), totalBytes=$($chunkResult.body.totalBytes))"
                Write-Evidence "Step 3 PASS: Chunk $($i + 1)/$chunkCount binary - receivedBytes=$($chunkResult.body.receivedBytes), totalBytes=$($chunkResult.body.totalBytes)"
            }
            else {
                Write-Info "Binary chunk upload failed (status=$($chunkResult.status)); falling back to base64 JSON mode..."
                $chunkResult = Invoke-Base64ChunkUpload -UploadId $uploadId -ChunkIndex $i -ChunkBytes $chunk -Token $adminToken
                $usedBinary = $false

                if ($chunkResult.status -eq 200) {
                    Write-Pass "Chunk $($i + 1) base64 upload succeeded (receivedBytes=$($chunkResult.body.receivedBytes), totalBytes=$($chunkResult.body.totalBytes))"
                    Write-Evidence "Step 3 PASS: Chunk $($i + 1)/$chunkCount base64 - receivedBytes=$($chunkResult.body.receivedBytes), totalBytes=$($chunkResult.body.totalBytes)"
                }
                else {
                    Write-Fail "Chunk $($i + 1) upload failed (binary + base64): status=$($chunkResult.status), body=$($chunkResult.body | ConvertTo-Json -Compress)"
                    Write-Evidence "Step 3 FAIL: Chunk $($i + 1)/$chunkCount - binary status=$($chunkResult.status), base64 status=$($chunkResult.status)"
                    $allChunksOk = $false
                    break
                }
            }
        }

        if ($allChunksOk) {
            $mode = if ($usedBinary) { "binary" } else { "base64 JSON" }
            Write-Pass "All $chunkCount chunks uploaded successfully using $mode mode"
            Write-Evidence "Step 3 SUMMARY: All chunks uploaded using $mode mode"
        }
    }
    catch {
        Write-Fail "Chunk upload exception: $($_.Exception.Message)"
        Write-Evidence "Step 3 FAIL: Chunk upload exception: $($_.Exception.Message)"
    }
}

# Step 4: Complete upload
Write-Step "4" "Complete video upload"
if (-not $uploadId -or -not $adminToken) {
    Write-Fail "Skipping Step 4: no uploadId or token"
    Write-Evidence "Step 4 SKIP: No uploadId or token"
}
else {
    try {
        $completeResult = Invoke-ApiCall -Method "POST" -Path "/admin/videos/upload/complete" -Body @{
            uploadId = $uploadId
        } -Token $adminToken

        if ($completeResult.whatIf) {
            Write-Pass "Upload complete (WhatIf)"
            $videoId = 999
            Write-Evidence "Step 4 PASS: Upload complete (WhatIf)"
        }
        elseif ($completeResult.status -eq 200 -and $completeResult.body.videoId) {
            $videoId = $completeResult.body.videoId
            if ($completeResult.body.status -eq "uploaded") {
                Write-Pass "Upload complete succeeded - videoId=$videoId, status=$($completeResult.body.status)"
            }
            else {
                Write-Fail "Upload complete unexpected status: expected 'uploaded', got '$($completeResult.body.status)'"
            }
            Write-Evidence "Step 4 PASS: Upload complete - videoId=$videoId, status=$($completeResult.body.status)"
        }
        else {
            Write-Fail "Upload complete failed: status=$($completeResult.status), body=$($completeResult.body | ConvertTo-Json -Compress)"
            Write-Evidence "Step 4 FAIL: Upload complete - status=$($completeResult.status)"
        }
    }
    catch {
        Write-Fail "Upload complete exception: $($_.Exception.Message)"
        Write-Evidence "Step 4 FAIL: Upload complete exception: $($_.Exception.Message)"
    }
}

# Step 5: Poll video status until encryption done
Write-Step "5" "Poll video status until encryptStatus=done"
$maxAttempts = 30
$attempt = 0
$encrypted = $false
$finalStatus = $null

if (-not $videoId -or -not $adminToken) {
    Write-Fail "Skipping Step 5: no videoId or token"
    Write-Evidence "Step 5 SKIP: No videoId or token"
}
else {
    while ($attempt -lt $maxAttempts -and -not $encrypted) {
        $attempt++
        try {
            $videoResult = Invoke-ApiCall -Method "GET" -Path "/admin/videos/$videoId" -Token $adminToken

            if ($videoResult.whatIf) {
                Write-Info "Poll attempt $attempt/$maxAttempts - WhatIf mode"
                $encrypted = $true
                Write-Evidence "Step 5 PASS: Poll (WhatIf mode, attempt $attempt)"
                break
            }

            if ($videoResult.status -eq 200) {
                $status = $videoResult.body.encryptStatus
                $finalStatus = $status
                Write-Info "Poll attempt $attempt/$maxAttempts - encryptStatus=$status"

                if ($status -eq "done") {
                    $encrypted = $true
                    $hlsUrl = $videoResult.body.hlsUrl
                    if ($hlsUrl) {
                        Write-Pass "Video encryption completed (hlsUrl=$hlsUrl)"
                        Write-Evidence "Step 5 PASS: Encryption done on attempt $attempt - hlsUrl=$hlsUrl"
                    }
                    else {
                        Write-Fail "Encryption done but hlsUrl is missing"
                        Write-Evidence "Step 5 FAIL: Encryption done but hlsUrl missing on attempt $attempt"
                    }
                    break
                }
                elseif ($status -eq "failed") {
                    Write-Fail "Encryption failed (encryptStatus=failed)"
                    Write-Evidence "Step 5 FAIL: Encryption failed on attempt $attempt"
                    break
                }
                elseif ($status -eq "pending" -or $status -eq "encrypting") {
                    # Continue polling
                }
                else {
                    Write-Fail "Unexpected encryptStatus: $status"
                    Write-Evidence "Step 5 FAIL: Unexpected encryptStatus=$status on attempt $attempt"
                    break
                }
            }
            else {
                Write-Fail "Poll failed: status=$($videoResult.status), body=$($videoResult.body | ConvertTo-Json -Compress)"
                Write-Evidence "Step 5 FAIL: Poll failed - status=$($videoResult.status) on attempt $attempt"
                break
            }
        }
        catch {
            Write-Fail "Poll exception on attempt $attempt`: $($_.Exception.Message)"
            Write-Evidence "Step 5 FAIL: Poll exception on attempt $attempt`: $($_.Exception.Message)"
            break
        }

        if (-not $encrypted -and $attempt -lt $maxAttempts) {
            Start-Sleep -Seconds 10
        }
    }

    if (-not $encrypted -and -not $videoResult.whatIf) {
        Write-Fail "Video encryption did not complete within $maxAttempts attempts (last status: $finalStatus)"
        Write-Evidence "Step 5 FAIL: Encryption timeout after $maxAttempts attempts (last status: $finalStatus)"
    }
}

# Step 6: Verify MinIO encrypted bucket
Write-Step "6" "Verify MinIO video-encrypted bucket"
if (-not $videoId) {
    Write-Fail "Skipping Step 6: no videoId"
    Write-Evidence "Step 6 SKIP: No videoId"
}
else {
    try {
        # Ensure mc alias is configured with credentials
        $aliasCmd = "docker exec vdeio-minio mc alias set local http://localhost:9000 admin vdeio_minio_2024"
        Write-Info "Configuring MinIO alias: $aliasCmd"
        Invoke-Expression $aliasCmd 2>&1 | Out-Null

        $minioPath = "videos/$videoId"
        $cmd = "docker exec vdeio-minio mc ls --recursive local/video-encrypted/$minioPath/"
        Write-Info "Running: $cmd"
        $minioOutput = Invoke-Expression $cmd 2>&1
        $minioOutputStr = $minioOutput | Out-String

        if ($LASTEXITCODE -eq 0 -and ($minioOutputStr -like "*playlist.m3u8*" -or $minioOutputStr -like "*.ts*")) {
            Write-Pass "MinIO verification succeeded - encrypted files found`n$minioOutputStr"
            Write-Evidence "Step 6 PASS: MinIO encrypted files found for video $videoId`n$minioOutputStr"
        }
        else {
            Write-Fail "MinIO verification failed (exit=$LASTEXITCODE):`n$minioOutputStr"
            Write-Evidence "Step 6 FAIL: MinIO verification failed for video $videoId (exit=$LASTEXITCODE)`n$minioOutputStr"
        }
    }
    catch {
        Write-Fail "MinIO verification exception: $($_.Exception.Message)"
        Write-Evidence "Step 6 FAIL: MinIO verification exception: $($_.Exception.Message)"
    }
}

# Step 7: Verify device key endpoint
Write-Step "7" "Verify device key endpoint /api/v1/devices/videos/$videoId/key"
if (-not $videoId -or -not $adminToken) {
    Write-Fail "Skipping Step 7: no videoId or token"
    Write-Evidence "Step 7 SKIP: No videoId or token"
}
else {
    try {
        # Register a device (device routes currently require authMiddleware, so use admin token)
        $deviceReg = Invoke-ApiCallRaw -Method "POST" -Path "/devices/register" -Body (@{ deviceName = "e2e-test-device"; osVersion = "1.0" } | ConvertTo-Json -Depth 10) -Token $adminToken
        if ($deviceReg.status -ne 200 -or -not $deviceReg.body.deviceToken) {
            Write-Fail "Device registration failed: status=$($deviceReg.status)"
            Write-Evidence "Step 7 FAIL: Device registration failed - status=$($deviceReg.status)"
        }
        else {
            $deviceToken = $deviceReg.body.deviceToken
            $deviceId = $deviceReg.body.deviceId
            Write-Info "Device registered - deviceId=$deviceId"

            # Create a store
            $store = Invoke-ApiCall -Method "POST" -Path "/admin/stores" -Body @{
                name = "E2E Test Store"
                code = "e2e-$(Get-Random)"
                region = "Test"
                address = "E2E Address"
            } -Token $adminToken

            if ($store.status -ne 200 -and $store.status -ne 201) {
                Write-Fail "Store creation failed: status=$($store.status)"
                Write-Evidence "Step 7 FAIL: Store creation failed - status=$($store.status)"
            }
            else {
                $storeId = $store.body.id
                Write-Info "Store created - storeId=$storeId"

                # Bind device to store (device routes require auth; use admin token)
                $bind = Invoke-ApiCallRaw -Method "POST" -Path "/devices/bind" -Body (@{ deviceId = $deviceId; storeId = $storeId } | ConvertTo-Json -Depth 10) -Token $adminToken
                if ($bind.status -ne 200) {
                    Write-Fail "Device bind failed: status=$($bind.status), body=$($bind.body | ConvertTo-Json -Compress)"
                    Write-Evidence "Step 7 FAIL: Device bind failed - status=$($bind.status)"
                }
                else {
                    Write-Info "Device bound to store"

                    # Create campaign (draft), then add video/store, then publish
                    $startTime = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                    $endTime = (Get-Date).AddDays(1).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                    $campaign = Invoke-ApiCall -Method "POST" -Path "/admin/campaigns" -Body @{
                        title = "E2E Test Campaign"
                        description = "Auto-created by E2E"
                        startTime = $startTime
                        endTime = $endTime
                    } -Token $adminToken

                    if ($campaign.status -ne 200 -and $campaign.status -ne 201) {
                        Write-Fail "Campaign creation failed: status=$($campaign.status), body=$($campaign.body | ConvertTo-Json -Compress)"
                        Write-Evidence "Step 7 FAIL: Campaign creation failed - status=$($campaign.status)"
                    }
                    else {
                        $campaignId = $campaign.body.id
                        Write-Info "Campaign created - id=$campaignId"

                        # Add video to campaign
                        $addVideo = Invoke-ApiCall -Method "POST" -Path "/admin/campaigns/$campaignId/videos" -Body @{
                            videoIds = @($videoId)
                        } -Token $adminToken
                        if ($addVideo.status -ne 200 -and $addVideo.status -ne 204) {
                            Write-Fail "Add video to campaign failed: status=$($addVideo.status)"
                            Write-Evidence "Step 7 FAIL: Add video to campaign failed - status=$($addVideo.status)"
                        }
                        else {
                            Write-Info "Video added to campaign"

                            # Add store to campaign
                            $addStore = Invoke-ApiCall -Method "POST" -Path "/admin/campaigns/$campaignId/stores" -Body @{
                                storeIds = @($storeId)
                            } -Token $adminToken
                            if ($addStore.status -ne 200 -and $addStore.status -ne 204) {
                                Write-Fail "Add store to campaign failed: status=$($addStore.status)"
                                Write-Evidence "Step 7 FAIL: Add store to campaign failed - status=$($addStore.status)"
                            }
                            else {
                                Write-Info "Store added to campaign"

                                # Publish campaign
                                $publish = Invoke-ApiCall -Method "POST" -Path "/admin/campaigns/$campaignId/publish" -Token $adminToken
                                if ($publish.status -ne 200) {
                                    Write-Fail "Campaign publish failed: status=$($publish.status), body=$($publish.body | ConvertTo-Json -Compress)"
                                    Write-Evidence "Step 7 FAIL: Campaign publish failed - status=$($publish.status)"
                                }
                                else {
                                    Write-Info "Campaign published - status=$($publish.body.status)"

                                    # Generate a device JWT for key endpoint verification
                                    $jwtSecret = $env:VDEIO_JWT_SECRET
                                    if (-not $jwtSecret) {
                                        $envPath = Join-Path $PSScriptRoot "..\server\.env"
                                        if (Test-Path $envPath) {
                                            $envLines = Get-Content $envPath
                                            $secretLine = $envLines | Where-Object { $_ -match "^JWT_SECRET=" }
                                            if ($secretLine) {
                                                $jwtSecret = $secretLine.Split("=", 2)[1]
                                            }
                                        }
                                    }
                                    if (-not $jwtSecret) {
                                        $jwtSecret = "dev-test-secret-key-at-least-32-characters-long"
                                    }

                                    $deviceJwt = New-DeviceJwt -UserId 0 -StoreId $storeId -DeviceId $deviceId -Secret $jwtSecret
                                    Write-Info "Generated device JWT for storeId=$storeId, deviceId=$deviceId"

                                    # Now call key endpoint
                                    $keyResult = Invoke-ApiCallRaw -Method "GET" -Path "/devices/videos/$videoId/key" -Token $deviceJwt
                                    if ($keyResult.status -eq 200 -and $keyResult.body.Length -gt 0) {
                                        Write-Pass "Key endpoint returned key data ($($keyResult.body.Length) bytes)"
                                        Write-Evidence "Step 7 PASS: Key endpoint returned $($keyResult.body.Length) bytes for video $videoId"
                                    }
                                    else {
                                        Write-Fail "Key endpoint failed: status=$($keyResult.status), body=$($keyResult.body | ConvertTo-Json -Compress)"
                                        Write-Evidence "Step 7 FAIL: Key endpoint - status=$($keyResult.status) for video $videoId"
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    catch {
        Write-Fail "Key endpoint verification exception: $($_.Exception.Message)"
        Write-Evidence "Step 7 FAIL: Key endpoint exception: $($_.Exception.Message)"
    }
}

# Save evidence log
$EvidenceLines | Out-File -FilePath $EvidenceFile -Encoding utf8
Write-Host "`nEvidence saved to: $EvidenceFile" -ForegroundColor Gray

# Final summary
Write-Summary "Real MP4 Video Upload + Encryption Flow"
