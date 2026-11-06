# Silent Tab 独立化设计

## 目标

将 Chrome MV3 浏览器控制扩展与最小 Go 守护进程组成独立项目 `silent-tab`。项目能够单独启动、构建和使用，不依赖其他应用。

## 约束

- Chrome 扩展继续使用原生 JavaScript 和 Manifest V3。
- 后端使用独立 Go 进程，仅依赖 `gorilla/websocket`。
- 默认只监听 `127.0.0.1:8765`，通用任务接口与扩展 WebSocket 使用同一 Token。
- 本机固定 ChatGPT 同步及 SSE 接口保持免 Token，但只能从 loopback 调用。
- 不支持任意 JavaScript 执行；域名白名单默认仅包含本机与 ChatGPT。
- 后台调用使用非激活标签页；Chrome 与扩展仍需保持运行。
- 本轮不新增单元测试，使用语法检查、已有协议测试、Go 编译和手工 HTTP 冒烟验证。

## 方案选择

1. 仅提供扩展源码：维护简单，但缺少 REST 与 WebSocket 调度服务。
2. 搭配完整业务后端：能运行但包含数据库、Agent、认证等无关模块，过重。
3. 提取最小 Go 守护进程与扩展：只保留任务调度、WebSocket、REST/SSE 和安全配置。

采用方案 3。它保留现有协议与适配器能力，同时保持项目轻量和独立。

## 架构

```text
本机调用方
  -> Silent Tab Go REST/SSE (127.0.0.1:8765)
  -> WebSocket
  -> Silent Tab Chrome 扩展
  -> 已登录的 ChatGPT 网页
```

Go 服务负责配置、鉴权、任务 ID、超时、断线处理和统一响应；扩展负责标签页及 DOM 操作。后续 DeepSeek 通过新增站点适配器接入，不修改任务传输层。

## 命名与兼容

- 项目目录、Go module、二进制、扩展名称统一为 `silent-tab` / `Silent Tab`。
- 环境变量统一使用 `SILENT_TAB_*`。
- HTTP 路径统一使用 `/api/browser/*`。
