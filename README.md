# 37° Local API

本地 API 已支持在电脑本机运行，也支持通过局域网地址或外网穿透给手机访问。

当前默认配置:

- HTTP: `http://127.0.0.1:3001`
- Health: `http://127.0.0.1:3001/health`
- Status: `http://127.0.0.1:3001/api/v1/status`
- WebSocket: `ws://127.0.0.1:3001/ws/chat`
- SQLite: [`data/37degrees-v2.db`](/D:/Codex/local-api/data/37degrees-v2.db)

## 启动

```powershell
cd .\local-api
npm install
npm start
```

可选开发模式:

```powershell
cd .\local-api
npm run dev
```

## 自检

烟雾测试:

```powershell
cd .\local-api
npm run smoke
```

Windows 快速检查:

```powershell
.\quick-test.bat
```

## Flutter 对接

桌面端:

```powershell
flutter run --dart-define=APP_MODE=localApi --dart-define=LOCAL_API_BASE_URL=http://127.0.0.1:3001
```

Android 模拟器:

```powershell
flutter run --dart-define=APP_MODE=localApi --dart-define=LOCAL_API_BASE_URL=http://10.0.2.2:3001
```

真机同 Wi-Fi 联调:

```powershell
flutter run --dart-define=APP_MODE=localApi --dart-define=LOCAL_API_BASE_URL=http://<你的电脑局域网IP>:3001
```

## 外网访问

推荐顺序:

1. 先确保本地服务已启动在 `3001`
2. 再使用穿透工具把 `3001` 暴露出去
3. 最后把 Flutter 的 `LOCAL_API_BASE_URL` 指到公网地址

### ngrok

```powershell
ngrok http 3001
```

### 其他穿透工具

- Cloudflare Tunnel
- localtunnel
- frp

只要最后拿到公网 HTTPS 地址，例如:

```text
https://example-tunnel.ngrok-free.app
```

就可以这样运行或打包 Flutter:

```powershell
flutter run --dart-define=APP_MODE=localApi --dart-define=LOCAL_API_BASE_URL=https://example-tunnel.ngrok-free.app
```

## 打包可连外网服务器的 APK

在仓库根目录执行:

```powershell
.\scripts\build-android-release.ps1 -LocalApiBaseUrl https://example-tunnel.ngrok-free.app -ArtifactLabel public-api
```

这样生成的 APK 会把服务器地址直接写进包里，安装后可直接访问对应服务。

## 已提供的 API 资源组

- `/api/v1/auth/*`
- `/api/v1/users/*`
- `/api/v1/chat/*`
- `/api/v1/circle/*`
- `/api/v1/square/*`
- `/api/v1/notifications/*`
- `/api/v1/reviews/*`
- `/api/v1/admin/*`
- `/api/v1/search/*`
- `/api/v1/upload/*`
- `/ws/chat`

## 注意

- 如果你本地 `.env` 里还是旧的 `3000` 和 `37degrees.db`，服务端现在也会自动兼容并切回新的 `3001 + 37degrees-v2.db`。
- 手机安装现成 APK 时，必须确认它打包时写入的 `LOCAL_API_BASE_URL` 是你当前可访问的地址，否则会回退到 Demo 模式。
