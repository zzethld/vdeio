#!/bin/bash
set -e

echo "=========================================="
echo " 连锁门店视频管理系统 — 服务端一键部署"
echo "=========================================="

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "[错误] Docker 未安装，请先安装 Docker"
    echo "  Ubuntu: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

# 检查 Docker Compose
if ! docker compose version &> /dev/null; then
    echo "[错误] Docker Compose 未安装"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 配置环境变量
if [ ! -f .env ]; then
    echo ""
    echo "--- 配置环境变量 ---"
    cp .env.example .env
    
    # 生成随机密钥
    JWT_SECRET=$(openssl rand -hex 32)
    MASTER_KEY=$(openssl rand -hex 16)
    DB_PASSWORD=$(openssl rand -hex 12)
    
    sed -i "s/changeme-random-string-at-least-32-chars/$JWT_SECRET/" .env
    sed -i "s/changeme-32-byte-hex-string/$MASTER_KEY/" .env
    sed -i "s/DB_PASSWORD=changeme/DB_PASSWORD=$DB_PASSWORD/" .env
    
    echo "[OK] .env 已生成，请编辑填写钉钉 APP_KEY 和 APP_SECRET"
    echo "  vi .env"
    echo ""
    read -p "是否已填写钉钉配置？继续部署？(y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "请编辑 .env 后重新运行此脚本"
        exit 0
    fi
else
    echo "[OK] .env 已存在，跳过配置"
fi

# 拉取镜像
echo ""
echo "--- 拉取 Docker 镜像 ---"
docker compose pull

# 启动服务
echo ""
echo "--- 启动服务 ---"
docker compose up -d

# 等待服务就绪
echo ""
echo "--- 等待服务启动 ---"
MAX_WAIT=120
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
        echo "[OK] API 服务已就绪"
        break
    fi
    sleep 5
    WAITED=$((WAITED + 5))
    echo "  等待中... (${WAITED}s/${MAX_WAIT}s)"
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo "[警告] API 服务启动超时，请检查日志: docker compose logs server"
fi

# 输出访问信息
echo ""
echo "=========================================="
echo " 部署完成！"
echo "=========================================="
echo ""
echo "  管理后台:    http://$(hostname -I | awk '{print $1}'):5173"
echo "  API 服务:    http://$(hostname -I | awk '{print $1}'):3000"
echo "  MinIO 控制台: http://$(hostname -I | awk '{print $1}'):9001"
echo "  EMQX 控制台:  http://$(hostname -I | awk '{print $1}'):18083"
echo ""
echo "  默认管理员: admin / (查看 .env 中 ADMIN_DEFAULT_PASSWORD)"
echo ""
echo "  查看日志: docker compose logs -f server"
echo "  停止服务: docker compose down"
echo ""
