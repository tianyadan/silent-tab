import { normalizeBackendURL } from './lib/protocol.mjs'

const DEFAULT_BACKEND = 'http://127.0.0.1:8765'
const pageTitles = { overview: '运行概览', adapters: '网页适配器', api: 'API 调用', settings: '连接设置' }
const adapters = [
  { id: 'chatgpt', name: 'ChatGPT Web', host: 'chatgpt.com', state: 'active', description: '支持同步问答、SSE 流式输出、新建对话和后台静默调用。' },
  { id: 'deepseek', name: 'DeepSeek Web', host: 'chat.deepseek.com', state: 'planned', description: '适配入口已预留，后续接入网页版登录态与回复流。' },
]

const connectView = document.querySelector('#connect-view')
const consoleView = document.querySelector('#console-view')
const connectMessage = document.querySelector('#connect-message')
const settingsMessage = document.querySelector('#settings-message')
let currentConfig = { backendUrl: DEFAULT_BACKEND, token: '' }

function apiCommands(backendUrl) {
  const base = normalizeBackendURL(backendUrl || DEFAULT_BACKEND)
  return [
    {
      id: 'sync', label: '同步问答', method: 'POST', endpoint: '/api/browser/local/chatgpt',
      description: '等待 ChatGPT 回复完成后返回完整 JSON。',
      command: `curl -s ${base}/api/browser/local/chatgpt -H 'Content-Type: application/json' -d '{"text":"请在这里填写问题","new_conversation":false}'`,
    },
    {
      id: 'stream', label: '流式问答', method: 'SSE', endpoint: '/api/browser/local/chatgpt/stream',
      description: '持续返回 delta，最后通过 done 给出完整回复。',
      command: `curl -N ${base}/api/browser/local/chatgpt/stream -H 'Content-Type: application/json' -d '{"text":"请在这里填写问题","new_conversation":false}'`,
    },
  ]
}

function setMessage(element, text, type = '') {
  element.textContent = text
  element.className = `form-message ${type}`.trim()
}

async function copyText(text, button) {
  await navigator.clipboard.writeText(text)
  const previous = button.textContent
  button.textContent = '已复制'
  button.classList.add('copied')
  setTimeout(() => {
    button.textContent = previous
    button.classList.remove('copied')
  }, 1400)
}

function renderAdapters() {
  document.querySelector('#adapter-grid').innerHTML = adapters.map((adapter) => `
    <article class="adapter-card ${adapter.state}">
      <div class="adapter-symbol">${adapter.name.slice(0, 2).toUpperCase()}</div>
      <div class="adapter-meta"><span>${adapter.host}</span><h4>${adapter.name}</h4><p>${adapter.description}</p></div>
      <div class="adapter-state">${adapter.state === 'active' ? '<i></i> 当前启用' : '待接入'}</div>
    </article>
  `).join('')
}

function renderCommands() {
  const commandList = apiCommands(currentConfig.backendUrl)
  document.querySelector('#api-list').innerHTML = commandList.map((item) => `
    <article class="api-card">
      <div class="api-card-head"><div><span>${item.method}</span><h4>${item.label}</h4></div><code>${item.endpoint}</code></div>
      <p>${item.description}</p>
      <div class="code-block" id="api-${item.id}"><code>${item.command}</code><button type="button" data-copy-target="api-${item.id}">复制命令</button></div>
    </article>
  `).join('')
  document.querySelector('#overview-command code').textContent = commandList[1].command
}

function openPage(name) {
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.page === name))
  document.querySelectorAll('[data-page-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.pagePanel === name))
  document.querySelector('#page-title').textContent = pageTitles[name] || pageTitles.overview
}

async function refreshStatus() {
  const status = await chrome.runtime.sendMessage({ type: 'status' })
  const connected = Boolean(status?.connected)
  document.querySelector('#sidebar-status-dot').className = `status-dot ${connected ? 'online' : 'offline'}`
  document.querySelector('#sidebar-status-title').textContent = connected ? 'Silent Tab 已连接' : 'Silent Tab 未连接'
  document.querySelector('#sidebar-status-detail').textContent = connected ? '后台通道运行正常' : (status?.lastError || '请检查本机后端')
  document.querySelector('#hero-status').textContent = connected ? '浏览器通道运行中' : '等待本机服务'
  document.querySelector('#hero-copy').textContent = connected
    ? 'ChatGPT Web 已就绪，AI 可以通过本机接口发起同步或流式调用。'
    : (status?.lastError || '扩展已配置，但暂时无法连接 Silent Tab 服务。')
}

function showConsole() {
  connectView.hidden = true
  consoleView.hidden = false
  document.querySelector('#settings-backend-url').value = currentConfig.backendUrl
  document.querySelector('#settings-token').value = currentConfig.token
  renderAdapters()
  renderCommands()
  openPage('overview')
  refreshStatus()
}

function showConnect() {
  consoleView.hidden = true
  connectView.hidden = false
  document.querySelector('#backend-url').value = currentConfig.backendUrl
  document.querySelector('#token').value = currentConfig.token
}

async function saveConfig(backendValue, tokenValue) {
  const backendUrl = normalizeBackendURL(backendValue)
  const token = tokenValue.trim()
  if (!token) throw new Error('Browser Token 不能为空')
  currentConfig = { backendUrl, token }
  await chrome.storage.local.set(currentConfig)
  await chrome.runtime.sendMessage({ type: 'reconnect' })
}

document.querySelector('#connect-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  try {
    await saveConfig(document.querySelector('#backend-url').value, document.querySelector('#token').value)
    setMessage(connectMessage, '配置已保存，正在进入后台…', 'success')
    showConsole()
    setTimeout(refreshStatus, 700)
  } catch (error) {
    setMessage(connectMessage, error.message, 'error')
  }
})

document.querySelector('#settings-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  try {
    await saveConfig(document.querySelector('#settings-backend-url').value, document.querySelector('#settings-token').value)
    renderCommands()
    setMessage(settingsMessage, '已保存，正在重新连接。', 'success')
    setTimeout(refreshStatus, 700)
  } catch (error) {
    setMessage(settingsMessage, error.message, 'error')
  }
})

document.querySelector('#disconnect').addEventListener('click', async () => {
  await chrome.storage.local.remove('token')
  currentConfig.token = ''
  showConnect()
})
document.querySelector('#reconnect').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'reconnect' })
  setTimeout(refreshStatus, 500)
})
document.addEventListener('click', (event) => {
  const nav = event.target.closest('[data-page]')
  if (nav) openPage(nav.dataset.page)
  const opener = event.target.closest('[data-open-page]')
  if (opener) openPage(opener.dataset.openPage)
  const copy = event.target.closest('[data-copy-target]')
  if (copy) {
    const code = document.querySelector(`#${copy.dataset.copyTarget} code`)?.textContent
    if (code) copyText(code, copy)
  }
})

const stored = await chrome.storage.local.get(['backendUrl', 'token'])
currentConfig = { backendUrl: stored.backendUrl || DEFAULT_BACKEND, token: stored.token || '' }
if (currentConfig.token) showConsole()
else showConnect()
