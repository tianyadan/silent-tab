# Silent Tab

Silent Tab 是一个独立的本机浏览器控制工具，由轻量级 Go 守护进程和 Chrome Manifest V3 扩展组成。它复用当前 Chrome 的网页登录态，通过固定 API 向 ChatGPT 网页发送消息并读取原始回复，不调用额外模型。

## 当前能力

- 左右布局管理后台：连接概览、网页适配器、API 调用和连接设置。
- ChatGPT Web：沿用当前会话或新建对话，支持完整 JSON 与 SSE 流式回复。
- 后台模式：默认在非激活标签页执行，不抢占当前窗口。
- 本机固定接口：AI 可直接调用，无需携带 Browser Token。
- DeepSeek Web：后台入口已预留，适配器尚未实现。

Go 服务和扩展都在本项目中，无需依赖其他应用。Chrome 和扩展必须保持运行；后台模式不会激活页面，但浏览器中仍会存在一个非激活标签页。

## 一键启动

需要 Go 1.22+、Node.js 20+ 和 `zip`：

```bash
cp .env.example .env
# 编辑 .env，生成 Token：openssl rand -hex 32
./scripts/start.sh
```

启动脚本默认在后台运行，并输出 PID、日志、Token、服务地址及 Chrome 加载目录。调试时可用 `./scripts/start.sh --foreground` 在前台运行。打开 `chrome://extensions`，开启开发者模式，选择“加载已解压的扩展程序”，加载：

停止后台服务：

```bash
kill "$(cat run/silent-tab.pid)"
```

```text
dist/extension
```

在扩展设置中填写 `http://127.0.0.1:8765` 和 `.env` 内的 `SILENT_TAB_TOKEN`。

## 最简调用

本机免 Token 同步接口：

```bash
curl -s http://127.0.0.1:8765/api/browser/local/chatgpt \
  -H 'Content-Type: application/json' \
  -d '{"text":"请用一句话介绍 Go","new_conversation":false}'
```

本机免 Token 流式接口：

```bash
curl -N http://127.0.0.1:8765/api/browser/local/chatgpt/stream \
  -H 'Content-Type: application/json' \
  -d '{"text":"请用一句话介绍 Go","new_conversation":true,"background":true}'
```

本机固定 ChatGPT 接口无需 Token；通用标签页和 DOM 接口必须携带 `Authorization: Bearer $SILENT_TAB_TOKEN`。服务默认只监听 loopback，扩展只执行固定动作并拒绝任意 JavaScript。

完整接口、参数和错误码见 [扩展文档](extension/README.md)。

## 目录

```text
cmd/silent-tab/          Go 服务入口
internal/               配置、HTTP 与浏览器任务调度
extension/              Chrome MV3 扩展源码
scripts/                构建与启动脚本
dist/                   扩展构建产物
```
