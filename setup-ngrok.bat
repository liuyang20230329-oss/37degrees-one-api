@echo off
chcp 65001 >nul
echo ============================================================
echo 🌐 配置内网穿透 - ngrok
echo ============================================================

echo.
echo 1️⃣ 下载ngrok...
echo.

if not exist "ngrok.exe" (
    echo 正在下载ngrok...
    
    :: 尝试使用curl下载
    curl -L https://bin.equinox.io/ngrok/ngrok-stable-windows-amd64.zip -o ngrok.zip
    
    if exist ngrok.zip (
        echo 解压ngrok...
        powershell -Command "Expand-Archive ngrok.zip -DestinationPath ."
        
        if exist ngrok.exe (
            echo ✅ ngrok下载并安装完成！
            echo.
            echo 2️⃣ 启动ngrok...
            echo.
            echo 提示: ngrok窗口会保持打开状态
            echo       按 Ctrl+C 停止ngrok
            echo.
            ngrok http 3001
        ) else (
            echo ❌ ngrok.exe未找到，请检查下载
        )
    ) else (
        echo ❌ ngrok下载失败
    )
) else (
    echo ✅ ngrok已安装！
    echo.
    echo 2️⃣ 启动ngrok...
    echo.
    echo 提示: ngrok窗口会保持打开状态
    echo       按 Ctrl+C 停止ngrok
    echo.
    ngrok http 3001
)

echo.
echo ============================================================
echo 🎯 配置完成！
echo ============================================================

pause
