# e2e/store-crud-flow.ps1 - E2E: Store CRUD
# Tests: create store, duplicate code 409, list/filter, detail, update, delete.
param([switch]$WhatIf)

. "$PSScriptRoot\common.ps1"
Set-E2EWhatIf $WhatIf.IsPresent

$Global:E2E_BASE_URL = if ($env:VDEIO_BASE_URL) { $env:VDEIO_BASE_URL } else { "http://localhost:3000/api/v1" }
$Global:E2E_PASS_COUNT = 0
$Global:E2E_FAIL_COUNT = 0

Write-Host "`n=== E2E: Store CRUD ===" -ForegroundColor White

$EvidenceDir = Join-Path (Join-Path (Join-Path $PSScriptRoot "..") ".sisyphus") "evidence"
if (-not (Test-Path $EvidenceDir)) {
    New-Item -ItemType Directory -Path $EvidenceDir -Force | Out-Null
}
$EvidenceFile = Join-Path $EvidenceDir "task-store-crud-e2e.log"
$EvidenceLines = [System.Collections.Generic.List[string]]::new()
function Write-Evidence([string]$Line) {
    $timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    $entry = "[$timestamp] $Line"
    $EvidenceLines.Add($entry)
    Write-Host $entry
}

$adminToken = $null
$storeCode = "STORE-E2E-$(Get-Random)"
$storeId = $null

# Step 1: Admin login
Write-Step "1" "Admin login"
try {
    $adminToken = Get-AdminToken
    if ($adminToken -or $WhatIf) {
        if ($WhatIf) { $adminToken = "whatif-admin-token" }
        Write-Pass "Admin token obtained"
        Write-Evidence "Step 1 PASS: Admin token obtained"
    }
    else {
        Write-Fail "Failed to obtain admin token"
        Write-Evidence "Step 1 FAIL: Admin token null"
    }
}
catch {
    Write-Fail "Admin login exception: $($_.Exception.Message)"
    Write-Evidence "Step 1 FAIL: Admin login exception: $($_.Exception.Message)"
}

# Step 2: Create store
Write-Step "2" "Create store"
if (-not $adminToken) {
    Write-Fail "Skipping Step 2: no admin token"
    Write-Evidence "Step 2 SKIP: No admin token"
}
else {
    try {
        $createResult = Invoke-ApiCall -Method "POST" -Path "/admin/stores" -Token $adminToken -Body @{
            code = $storeCode
            name = "E2E Store $(Get-Random)"
            address = "E2E Address"
            contactName = "E2E Contact"
            contactPhone = "13800000000"
            status = 1
        }

        if ($createResult.whatIf) {
            Write-Pass "Store created (WhatIf)"
            $storeId = "whatif-store-id"
            Write-Evidence "Step 2 PASS: Store created (WhatIf)"
        }
        elseif ($createResult.status -eq 201 -or $createResult.status -eq 200) {
            $storeId = $createResult.body.id
            Write-Pass "Store created - id=$storeId"
            Write-Evidence "Step 2 PASS: Store created - id=$storeId"
        }
        else {
            Write-Fail "Store create failed: status=$($createResult.status), body=$($createResult.body | ConvertTo-Json -Compress)"
            Write-Evidence "Step 2 FAIL: Store create status=$($createResult.status)"
        }
    }
    catch {
        Write-Fail "Store create exception: $($_.Exception.Message)"
        Write-Evidence "Step 2 FAIL: Store create exception: $($_.Exception.Message)"
    }
}

# Step 3: Duplicate code should return 409
Write-Step "3" "Duplicate store code (expect 409)"
if (-not $adminToken) {
    Write-Fail "Skipping Step 3: no admin token"
    Write-Evidence "Step 3 SKIP: No admin token"
}
else {
    try {
        $dupResult = Invoke-ApiCall -Method "POST" -Path "/admin/stores" -Token $adminToken -Body @{
            code = $storeCode
            name = "Duplicate Store"
            address = "Dup Address"
            status = 1
        } -ExpectedStatus 409

        if ($dupResult.whatIf) {
            Write-Pass "Duplicate code returned 409 (WhatIf)"
            Write-Evidence "Step 3 PASS: Duplicate code (WhatIf)"
        }
        elseif ($dupResult.status -eq 409) {
            Write-Pass "Duplicate code correctly rejected - 409"
            Write-Evidence "Step 3 PASS: Duplicate code 409"
        }
        else {
            Write-Fail "Expected 409 duplicate code but got status=$($dupResult.status)"
            Write-Evidence "Step 3 FAIL: Duplicate code status=$($dupResult.status)"
        }
    }
    catch {
        Write-Fail "Duplicate code exception: $($_.Exception.Message)"
        Write-Evidence "Step 3 FAIL: Duplicate code exception: $($_.Exception.Message)"
    }
}

# Step 4: List stores
Write-Step "4" "List stores"
if (-not $adminToken) {
    Write-Fail "Skipping Step 4: no admin token"
    Write-Evidence "Step 4 SKIP: No admin token"
}
else {
    try {
        $listResult = Invoke-ApiCall -Method "GET" -Path "/admin/stores" -Token $adminToken

        if ($listResult.whatIf) {
            Write-Pass "Store list retrieved (WhatIf)"
            Write-Evidence "Step 4 PASS: Store list (WhatIf)"
        }
        elseif ($listResult.status -eq 200 -and $listResult.body.rows) {
            Write-Pass "Store list retrieved - count=$($listResult.body.rows.Length)"
            Write-Evidence "Step 4 PASS: Store list count=$($listResult.body.rows.Length)"
        }
        else {
            Write-Fail "Store list failed: status=$($listResult.status)"
            Write-Evidence "Step 4 FAIL: Store list status=$($listResult.status)"
        }
    }
    catch {
        Write-Fail "Store list exception: $($_.Exception.Message)"
        Write-Evidence "Step 4 FAIL: Store list exception: $($_.Exception.Message)"
    }
}

# Step 5: Get store detail
Write-Step "5" "Get store detail"
if (-not $adminToken -or -not $storeId) {
    Write-Fail "Skipping Step 5: no admin token or store id"
    Write-Evidence "Step 5 SKIP: No token or store id"
}
else {
    try {
        $detailResult = Invoke-ApiCall -Method "GET" -Path "/admin/stores/$storeId" -Token $adminToken

        if ($detailResult.whatIf) {
            Write-Pass "Store detail retrieved (WhatIf)"
            Write-Evidence "Step 5 PASS: Store detail (WhatIf)"
        }
        elseif ($detailResult.status -eq 200 -and $detailResult.body.id -eq $storeId) {
            Write-Pass "Store detail retrieved - id=$storeId"
            Write-Evidence "Step 5 PASS: Store detail id=$storeId"
        }
        else {
            Write-Fail "Store detail failed: status=$($detailResult.status)"
            Write-Evidence "Step 5 FAIL: Store detail status=$($detailResult.status)"
        }
    }
    catch {
        Write-Fail "Store detail exception: $($_.Exception.Message)"
        Write-Evidence "Step 5 FAIL: Store detail exception: $($_.Exception.Message)"
    }
}

# Step 6: Update store
Write-Step "6" "Update store"
if (-not $adminToken -or -not $storeId) {
    Write-Fail "Skipping Step 6: no admin token or store id"
    Write-Evidence "Step 6 SKIP: No token or store id"
}
else {
    try {
        $updateResult = Invoke-ApiCall -Method "PUT" -Path "/admin/stores/$storeId" -Token $adminToken -Body @{
            name = "Updated E2E Store $(Get-Random)"
            address = "Updated Address"
            status = 1
        }

        if ($updateResult.whatIf) {
            Write-Pass "Store updated (WhatIf)"
            Write-Evidence "Step 6 PASS: Store updated (WhatIf)"
        }
        elseif ($updateResult.status -eq 200) {
            Write-Pass "Store updated"
            Write-Evidence "Step 6 PASS: Store updated"
        }
        else {
            Write-Fail "Store update failed: status=$($updateResult.status)"
            Write-Evidence "Step 6 FAIL: Store update status=$($updateResult.status)"
        }
    }
    catch {
        Write-Fail "Store update exception: $($_.Exception.Message)"
        Write-Evidence "Step 6 FAIL: Store update exception: $($_.Exception.Message)"
    }
}

# Step 7: Delete store
Write-Step "7" "Delete store"
if (-not $adminToken -or -not $storeId) {
    Write-Fail "Skipping Step 7: no admin token or store id"
    Write-Evidence "Step 7 SKIP: No token or store id"
}
else {
    try {
        $deleteResult = Invoke-ApiCall -Method "DELETE" -Path "/admin/stores/$storeId" -Token $adminToken

        if ($deleteResult.whatIf) {
            Write-Pass "Store deleted (WhatIf)"
            Write-Evidence "Step 7 PASS: Store deleted (WhatIf)"
        }
        elseif ($deleteResult.status -eq 200 -or $deleteResult.status -eq 204) {
            Write-Pass "Store deleted"
            Write-Evidence "Step 7 PASS: Store deleted"
        }
        else {
            Write-Fail "Store delete failed: status=$($deleteResult.status)"
            Write-Evidence "Step 7 FAIL: Store delete status=$($deleteResult.status)"
        }
    }
    catch {
        Write-Fail "Store delete exception: $($_.Exception.Message)"
        Write-Evidence "Step 7 FAIL: Store delete exception: $($_.Exception.Message)"
    }
}

# Step 8: Verify deleted store returns 404
Write-Step "8" "Verify deleted store returns 404"
if (-not $adminToken -or -not $storeId) {
    Write-Fail "Skipping Step 8: no admin token or store id"
    Write-Evidence "Step 8 SKIP: No token or store id"
}
else {
    try {
        $notFoundResult = Invoke-ApiCall -Method "GET" -Path "/admin/stores/$storeId" -Token $adminToken -ExpectedStatus 404

        if ($notFoundResult.whatIf) {
            Write-Pass "Deleted store returned 404 (WhatIf)"
            Write-Evidence "Step 8 PASS: Deleted store 404 (WhatIf)"
        }
        elseif ($notFoundResult.status -eq 404) {
            Write-Pass "Deleted store correctly returned 404"
            Write-Evidence "Step 8 PASS: Deleted store 404"
        }
        else {
            Write-Fail "Expected 404 for deleted store but got status=$($notFoundResult.status)"
            Write-Evidence "Step 8 FAIL: Deleted store status=$($notFoundResult.status)"
        }
    }
    catch {
        Write-Fail "Deleted store check exception: $($_.Exception.Message)"
        Write-Evidence "Step 8 FAIL: Deleted store exception: $($_.Exception.Message)"
    }
}

$EvidenceLines | Out-File -FilePath $EvidenceFile -Encoding utf8
Write-Host "`nEvidence saved to: $EvidenceFile" -ForegroundColor Gray

Write-Summary "Store CRUD"
