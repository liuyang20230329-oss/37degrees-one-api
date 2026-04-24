@echo off
chcp 65001 >nul
echo ============================================================
echo 🧪 快速测试本地 API 环境
echo ============================================================

echo.
echo 📊 检查 API 健康状态...
curl -s http://localhost:3001/health --connect-timeout 5 >nul 2>&1
if errorlevel 1 (
    echo ❌ API 服务器未启动或 3001 不可访问
    echo    请先运行: D:\Codex\local-api\start.bat
) else (
    echo ✅ API 服务器运行正常
)

echo.
echo 📋 检查数据库文件...
if exist "D:\Codex\local-api\data\37degrees-v2.db" (
    echo ✅ 数据库文件存在
) else (
    echo ❌ 数据库文件不存在
)

echo.
echo 🌐 检查端口监听...
netstat -ano | findstr ":3001" >nul 2>&1
if errorlevel 1 (
    echo ❌ 端口 3001 未监听
) else (
    echo ✅ 端口 3001 已监听
)

echo.
echo 📱 检查 API 状态接口...
curl -s http://localhost:3001/api/v1/status --connect-timeout 5 >nul 2>&1
if errorlevel 1 (
    echo ❌ API 状态接口不可访问
) else (
    echo ✅ API 状态接口可访问
)

echo.
echo ============================================================
echo 🎯 检查完成
echo ============================================================
echo ✅ API服务器: http://localhost:3001
echo ✅ 数据库: D:\Codex\local-api\data\37degrees-v2.db
echo ✅ Flutter客户端: D:\Codex\lib\src\core\network\api_client.dart
echo.
echo 下一步:
echo 1. 局域网联调: flutter run --dart-define=APP_MODE=localApi --dart-define=LOCAL_API_BASE_URL=http://你的电脑IP:3001
echo 2. 外网联调: 先运行 D:\Codex\local-api\setup-tunnel.bat 或 ngrok http 3001
echo 3. APK打包: D:\Codex\scripts\build-android-release.ps1 -LocalApiBaseUrl https://你的公网地址 -ArtifactLabel public-api
echo ============================================================

pause
