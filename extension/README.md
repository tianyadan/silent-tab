# Silent Tab Chrome Extension

轻量级 Chrome Manifest V3 扩展。扩展运行在用户主动加载的 Chrome 配置中，因而可以复用该配置已有的网页登录态；Silent Tab Go 服务通过固定 REST 动作派发任务，扩展通过 WebSocket 执行并回传统一 JSON 结果。`chatgpt.send_message` 可直接向已登录的 ChatGPT 网页发送问题并返回原始回复文本，不调用额外模型。

## 安全边界

- 通用 REST API 使用独立 `SILENT_TAB_TOKEN`，WebSocket 首个 `hello` 消息使用同一 Token。
- `/api/browser/local/chatgpt` 与 `/api/browser/local/chatgpt/stream` 是仅限 loopback 的固定 ChatGPT 接口，不携带 Token，也不能执行任意浏览器动作。
- 默认只接受 `127.0.0.1` / `::1` 请求；`SILENT_TAB_ALLOW_REMOTE=1` 才允许非本机 API 客户端。
- 默认只允许访问本机测试页、`chatgpt.com` 与兼容旧地址 `chat.openai.com`；通过 `SILENT_TAB_ALLOWED_DOMAINS` 添加精确域名或 `*.example.com`。
- 扩展只实现固定动作，不接收、拼接或执行任意 JavaScript。
- Chrome 会在加载扩展时展示 `tabs`、页面读取和截图等权限，必须由用户确认，不会绕过权限提示。

## 构建与安装

在当前独立项目根目录构建扩展：

```bash
./scripts/build-extension.sh
```

然后打开 `chrome://extensions`，开启开发者模式，选择“加载已解压的扩展程序”，加载：

```text
dist/extension
```

先运行 `./scripts/start.sh`，再点击扩展图标进入设置，把脚本输出的 Token 保存即可。保存后会进入左右布局的管理后台，可查看连接状态、网页适配器和可复制的 API 命令。当前启用 ChatGPT，DeepSeek 入口已预留。建议在项目 `.env` 中持久化配置：

```dotenv
SILENT_TAB_TOKEN=使用 openssl rand -hex 32 生成
SILENT_TAB_ALLOWED_DOMAINS=localhost,127.0.0.1,chatgpt.com,chat.openai.com
SILENT_TAB_ALLOW_REMOTE=0
```

## REST API

### 本机免 Token ChatGPT 接口

这是交给本机 AI 或自动化脚本调用的最简入口，仅接受本机请求。`background` 默认为 `true`：扩展优先复用非激活的 ChatGPT 标签页，没有时创建非激活标签页，不抢占当前窗口；Chrome 及扩展仍需保持运行。

```bash
curl -s http://127.0.0.1:8765/api/browser/local/chatgpt \
  -H 'Content-Type: application/json' \
  -d '{"text":"请用一句话介绍 Go","new_conversation":false}'

curl -N http://127.0.0.1:8765/api/browser/local/chatgpt/stream \
  -H 'Content-Type: application/json' \
  -d '{"text":"请用一句话介绍 Go","new_conversation":true,"background":true}'
```

`new_conversation` 默认为 `false`，表示沿用目标标签页当前会话；设为 `true` 时从新对话发送。需要观察页面操作时可显式传 `"background":false`。

### 通用 Token 接口

所有结果结构一致：

```json
{
  "ok": true,
  "task_id": "task-...",
  "data": {},
  "duration_ms": 12
}
```

失败时返回 `ok=false`、`error` 和稳定的 `code`。支持动作：

| 动作 | 主要参数 | 说明 |
| --- | --- | --- |
| `tabs.list` | 无 | 仅返回白名单域名标签页 |
| `tabs.open` | `url`, `active` | 打开白名单网页 |
| `dom.read` | `tab_id`, `selector`, `max_length` | 读取匹配元素文本、HTML、属性和值 |
| `dom.input` | `tab_id`, `selector`, `text` | 输入文本并触发 input/change |
| `dom.click` | `tab_id`, `selector` | 滚动到元素并点击 |
| `page.content` | `tab_id`, `include_html`, `max_length` | 获取标题、URL、正文及可选 HTML |
| `page.screenshot` | `tab_id`, `format`, `quality`, `activate` | 截取活动标签页；非活动页需显式 `activate=true` |
| `chatgpt.send_message` | `text`, `tab_id`, `open_new`, `new_conversation` | 复用 ChatGPT 登录态发送问题，等待回复结束并返回完整文本 |

### 发送 ChatGPT 消息

先在安装扩展的 Chrome 中登录 `https://chatgpt.com`。调用时可以省略 `tab_id`：扩展会优先复用已经打开的 ChatGPT 标签页，没有则自动打开新标签页。`new_conversation=true` 会先把选中的 ChatGPT 标签页切换到新对话再发送；省略或传 `false` 时沿用该标签页当前会话。为避免回复串台，同一时间只允许一个 ChatGPT 任务运行。

```bash
TOKEN='替换为 SILENT_TAB_TOKEN'
curl -s http://127.0.0.1:8765/api/browser/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"chatgpt.send_message","timeout_ms":180000,"params":{"text":"请用三句话介绍 Go 语言"}}'
```

新建 ChatGPT 对话并发送：

```bash
curl -s http://127.0.0.1:8765/api/browser/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"chatgpt.send_message","timeout_ms":180000,"params":{"text":"请介绍 Go 语言","new_conversation":true}}'
```

### 流式接收 ChatGPT 回复

SSE 接口会依次输出 `meta`、`started`、若干 `delta`，最后输出 `done` 或 `error`。每个 `delta` 同时包含本次增量 `data.delta` 和当前累计文本 `data.response`；当 ChatGPT 回改已有内容时，`data.replace=true`，调用方应以累计文本覆盖本地内容。

适配器会忽略 Intelligent UI 重渲染期间出现的“ChatGPT 说：”等无障碍占位节点，并在同一 Assistant 单元存在多个渲染副本时选择最完整正文。`done.data.response` 始终作为最终权威结果。

```bash
curl -N http://127.0.0.1:8765/api/browser/chatgpt/stream \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"timeout_ms":180000,"params":{"text":"请流式介绍 Go 语言","new_conversation":true}}'
```

流式接口同样支持 `tab_id`、`open_new` 和 `new_conversation`；省略 `new_conversation` 时沿用当前会话。`done` 事件的 `data.response` 是最终完整回复，可用于校正前端累计结果。

成功结果的 `data.response` 是 ChatGPT 页面中最新一条 Assistant 回复的原始文本，同时返回 `conversation_url`、页面标题和标签页信息。登录失效返回 `CHATGPT_LOGIN_REQUIRED`，页面结构不兼容返回 `CHATGPT_COMPOSER_NOT_FOUND`；回复超时和并发占用也会返回稳定的 `CHATGPT_*` 错误码。

### ChatGPT 页面适配层

ChatGPT 的输入框、发送按钮、Assistant 回复和生成状态识别集中在 `adapters/chatgpt.mjs`。适配器同时保留多代选择器，并通过可见性、按钮语义和回复单元标识进行运行时探测；页面改版时只需维护该文件，无需修改 WebSocket 或任务调度代码。

DOM 无法识别时会在数秒内返回错误，并在 `data.diagnostics` 中附带 URL、标题、各选择器命中数及候选元素属性。诊断数据不会包含输入内容、回复正文或整页 HTML。

连接状态：

```bash
TOKEN='替换为 SILENT_TAB_TOKEN'
curl -s http://127.0.0.1:8765/api/browser/status \
  -H "Authorization: Bearer $TOKEN"
```

列出标签页：

```bash
curl -s http://127.0.0.1:8765/api/browser/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"tabs.list","timeout_ms":10000,"params":{}}'
```

打开网页：

```bash
curl -s http://127.0.0.1:8765/api/browser/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"task_id":"demo-open-01","action":"tabs.open","params":{"url":"http://127.0.0.1:5173","active":true}}'
```

DOM 输入与点击：

```bash
curl -s http://127.0.0.1:8765/api/browser/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"dom.input","params":{"tab_id":123,"selector":"#search","text":"Silent Tab"}}'

curl -s http://127.0.0.1:8765/api/browser/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"dom.click","params":{"tab_id":123,"selector":"button[type=submit]"}}'
```

## 构建与测试

```bash
./scripts/build-extension.sh
```

构建脚本会检查 Manifest 和 JavaScript 语法，并运行插件协议测试。启动服务后可通过本文 curl 示例完成 HTTP 与 WebSocket 人工验收。

`chatgpt.send_message` 不纳入自动化测试：独立测试 Profile 没有用户的 ChatGPT 登录态。安装后请使用上面的 curl 示例完成一次人工验收。
