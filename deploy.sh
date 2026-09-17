#!/usr/bin/env bash
# =============================================================================
#  一键更新脚本（在服务器上执行）
#
#  用法：
#    cd /www/wwwroot/sicksuckworld
#    bash deploy.sh
#
#  做的事：git pull → 装依赖 → 构建 → 重启 PM2 → 清理旧构建
# =============================================================================
set -e

echo "==> [1/5] 拉取最新代码"
git pull origin main

echo "==> [2/5] 安装依赖"
npm install --omit=dev

echo "==> [3/5] 构建生产版本"
npm run build

echo "==> [4/5] 重启服务"
# 如果 PM2 里没有这个进程，就启动；否则重启
pm2 describe sicksuckworld > /dev/null 2>&1 \
  && pm2 restart sicksuckworld \
  || pm2 start ecosystem.config.cjs

echo "==> [5/5] 保存 PM2 状态（开机自启）"
pm2 save

echo ""
echo "✅ 更新完成！"
echo "   查看状态：pm2 status"
echo "   查看日志：pm2 logs sicksuckworld --lines 50"
