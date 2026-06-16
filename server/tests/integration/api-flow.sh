#!/bin/bash
# 连锁门店视频管理系统 — API 集成测试
# 用法: ./api-flow.sh [BASE_URL]
set -e

BASE_URL="${1:-http://localhost:3000/api/v1}"
PASS=0
FAIL=0

assert_ok() {
    local desc="$1"
    local status="$2"
    if [ "$status" -ge 200 ] && [ "$status" -lt 300 ]; then
        echo "  [PASS] $desc"
        PASS=$((PASS + 1))
    else
        echo "  [FAIL] $desc (HTTP $status)"
        FAIL=$((FAIL + 1))
    fi
}

assert_eq() {
    local desc="$1"
    local expected="$2"
    local actual="$3"
    if [ "$expected" = "$actual" ]; then
        echo "  [PASS] $desc"
        PASS=$((PASS + 1))
    else
        echo "  [FAIL] $desc (expected: $expected, got: $actual)"
        FAIL=$((FAIL + 1))
    fi
}

echo "=========================================="
echo " API 集成测试"
echo " Base URL: $BASE_URL"
echo "=========================================="
echo ""

# 1. Health check
echo "--- 1. 健康检查 ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/../health")
assert_ok "GET /health" "$STATUS"

# 2. Admin login
echo ""
echo "--- 2. 管理员登录 ---"
LOGIN_RESP=$(curl -s -X POST "$BASE_URL/admin/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123"}')
TOKEN=$(echo "$LOGIN_RESP" | jq -r '.accessToken // empty')
if [ -n "$TOKEN" ]; then
    echo "  [PASS] Admin login — got token"
    PASS=$((PASS + 1))
else
    echo "  [FAIL] Admin login — no token in response"
    FAIL=$((FAIL + 1))
    echo "  Response: $LOGIN_RESP"
    exit 1
fi

AUTH="Authorization: Bearer $TOKEN"

# 3. Video upload init
echo ""
echo "--- 3. 视频上传 ---"
INIT_RESP=$(curl -s -X POST "$BASE_URL/admin/videos/upload/init" \
    -H "Content-Type: application/json" \
    -H "$AUTH" \
    -d '{"fileName":"test.mp4","fileSize":1048576}')
UPLOAD_ID=$(echo "$INIT_RESP" | jq -r '.uploadId // empty')
CHUNK_COUNT=$(echo "$INIT_RESP" | jq -r '.chunkCount // empty')
assert_ok "Upload init — got uploadId" "$([ -n "$UPLOAD_ID" ] && echo 200 || echo 400)"

# 4. Upload chunk
if [ -n "$UPLOAD_ID" ]; then
    CHUNK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "$BASE_URL/admin/videos/upload/chunk?uploadId=$UPLOAD_ID&chunkIndex=0" \
        -H "$AUTH" \
        -H "Content-Type: application/octet-stream" \
        --data-binary @/dev/urandom \
        --max-time 5 2>/dev/null || echo "000")
    # May fail due to small data, but endpoint should respond
    echo "  [INFO] Chunk upload HTTP: $CHUNK_STATUS"
fi

# 5. Campaign CRUD
echo ""
echo "--- 4. 活动管理 ---"

# Create campaign
CREATE_RESP=$(curl -s -X POST "$BASE_URL/admin/campaigns" \
    -H "Content-Type: application/json" \
    -H "$AUTH" \
    -d '{"title":"测试活动","description":"集成测试","startTime":"2026-06-11T00:00:00Z","endTime":"2026-12-31T23:59:59Z"}')
CAMPAIGN_ID=$(echo "$CREATE_RESP" | jq -r '.id // empty')
assert_ok "Create campaign" "$([ -n "$CAMPAIGN_ID" ] && echo 200 || echo 400)"

# List campaigns
LIST_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/admin/campaigns" -H "$AUTH")
assert_ok "List campaigns" "$LIST_STATUS"

# Get campaign detail
if [ -n "$CAMPAIGN_ID" ]; then
    DETAIL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/admin/campaigns/$CAMPAIGN_ID" -H "$AUTH")
    assert_ok "Get campaign detail" "$DETAIL_STATUS"
fi

# 6. Dashboard stats
echo ""
echo "--- 5. 仪表盘统计 ---"
STATS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/admin/dashboard/stats" -H "$AUTH")
assert_ok "Dashboard stats" "$STATS_STATUS"

# 7. Device register
echo ""
echo "--- 6. 设备注册 ---"
REG_RESP=$(curl -s -X POST "$BASE_URL/devices/register" \
    -H "Content-Type: application/json" \
    -d '{"deviceName":"test-pc","osVersion":"win10"}')
DEVICE_ID=$(echo "$REG_RESP" | jq -r '.deviceId // empty')
DEVICE_TOKEN=$(echo "$REG_RESP" | jq -r '.deviceToken // empty')
assert_ok "Device register" "$([ -n "$DEVICE_ID" ] && echo 200 || echo 400)"

# 8. Results
echo ""
echo "=========================================="
echo " 测试结果: $PASS 通过, $FAIL 失败"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
