@echo off
chcp 65001 >nul
echo ============================================================
echo 🚀 37° 本地API服务器启动脚本
echo ============================================================

echo.
echo 📦 检查依赖...
if not exist "node_modules" (
    echo 📥 首次运行，正在安装依赖...
    call npm install
    echo ✅ 依赖安装完成
)

echo.
echo 🔧 检查环境...
if not exist ".env" (
    echo ⚠️  .env 文件不存在，使用默认配置
)

echo.
echo 🗄️  检查数据库...
if not exist "data" (
    mkdir data
    echo ✅ 数据目录已创建
)

echo.
echo 🚀 启动API服务器...
echo ============================================================
echo 📡 本地地址: http://localhost:3001
echo 🔍 健康检查: http://localhost:3001/health
echo 📋 API状态: http://localhost:3001/api/v1/status
echo.
echo 💡 提示: 按 Ctrl+C 停止服务器
echo ============================================================
echo.

set API_PORT=3001
set DB_PATH=D:\Codex\local-api\data\37degrees-v2.db
call node server.js

pause
