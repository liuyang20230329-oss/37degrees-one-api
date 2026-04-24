@echo off
chcp 65001 >nul
echo ============================================================
echo 🌐 配置内网穿透工具
echo ============================================================

echo.
echo 1️⃣  方法1：使用ngrok（推荐）
echo    - 访问: https://ngrok.com
echo    - 下载：Stable版 for Windows
echo    - 解压后运行: ngrok.exe http 3001
echo.

echo 2️⃣ 方法2：使用Cloudflare Tunnel（免费）
echo    - 访问: https://dash.cloudflare.com
echo    - 需要：Cloudflare账号
echo    - 下载：cloudflared工具
echo    - 优势：免费、稳定、速度快
echo.

echo 3️⃣ 方法3：使用Localtunnel（免费）
echo    - 访问: https://localtunnel.github.io
echo    - 下载：Windows版本
echo    - 优势：简单、免费、无需账号
echo.

echo 4️⃣ 方法4：使用内网IP（无需工具）
echo    - 获取本地IP地址
echo    - 优点：无延迟、免费
echo    - 缺点：需要在同一WiFi网络
echo.

echo.
echo ============================================================
echo 📝 推荐使用步骤：
echo ============================================================
echo.
echo 1️⃣ 下载并安装ngrok（推荐）
echo    - 访问: https://ngrok.com/download
echo    - 下载Stable版 for Windows
echo    - 解压并运行: ngrok.exe http 3001
echo.
echo 2️⃣ 配置Flutter应用
echo    - 编辑 lib/config/api_config.dart
echo    - 将baseUrl改为ngrok显示的地址
echo.

echo 3️⃣ 测试连接
echo    - 在浏览器访问外网地址
echo    - 在手机浏览器访问外网地址
echo.

echo ============================================================
echo 💡 提示信息：
echo ============================================================
echo.
echo - API服务器运行在: http://localhost:3001
echo - 健康检查: http://localhost:3001/health
echo - API状态: http://localhost:3001/api/v1/status
echo.
echo - Flutter应用需要配置网络权限
echo - Android: 修改 AndroidManifest.xml
echo.
echo ============================================================

echo.
echo 🚀 立即行动：
echo ============================================================
echo.
echo 请选择一个方法开始配置内网穿透：
echo.
echo [1] 手动下载ngrok
echo [2] 访问https://ngrok.com/download下载
echo [3] 解压并运行 ngrok.exe http 3001
echo.
echo [4] 或访问其他免费穿透工具网站
echo.
echo ============================================================

echo.
echo 💻 获取帮助：
echo ============================================================
echo.
echo 如需帮助，请查看：
echo - D:\Codex\docs\local-dev-setup-summary.md
echo - 或联系技术支持
echo.
echo ============================================================

pause
