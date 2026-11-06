const DEFAULT_BACKEND = 'http://127.0.0.1:8765'

function commands(backendUrl, newConversation) {
  const flag = newConversation ? 'true' : 'false'
  return [
    { id: 'sync', title: '同步问答', meta: 'JSON', command: `curl -s ${backendUrl}/api/browser/local/chatgpt -H 'Content-Type: application/json' -d '{"text":"请在这里填写问题","new_conversation":${flag}}'` },
    { id: 'stream', title: '流式问答', meta: 'SSE', command: `curl -N ${backendUrl}/api/browser/local/chatgpt/stream -H 'Content-Type: application/json' -d '{"text":"请在这里填写问题","new_conversation":${flag}}'` },
  ]
}

let backendUrl = DEFAULT_BACKEND
let newConversation = false

function renderCommands() {
  document.querySelector('#popup-api-list').innerHTML = `
    <label class="conversation-toggle"><input id="new-conversation" type="checkbox" ${newConversation ? 'checked' : ''}><span></span><b>每次新建对话</b></label>
    ${commands(backendUrl, newConversation).map((item) => `
      <article class="popup-api-item" data-api-item="${item.id}">
        <button class="popup-api-trigger" type="button"><span><b>${item.title}</b><small>${item.meta}</small></span><i>⌄</i></button>
        <div class="popup-api-detail"><code>${item.command}</code><button type="button" data-copy="${item.id}">复制调用命令</button></div>
      </article>
    `).join('')}
  `
}

async function refresh() {
  const status = await chrome.runtime.sendMessage({ type: 'status' })
  const connected = Boolean(status?.connected)
  document.querySelector('#status-dot').className = `status-dot ${connected ? 'online' : 'offline'}`
  document.querySelector('#status-text').textContent = connected ? '已连接' : '未连接'
  backendUrl = String(status?.backendUrl || DEFAULT_BACKEND).replace(/\/$/, '')
  renderCommands()
}

document.querySelector('#popup-api-list').addEventListener('click', async (event) => {
  const trigger = event.target.closest('.popup-api-trigger')
  if (trigger) trigger.closest('.popup-api-item').classList.toggle('open')
  const copyButton = event.target.closest('[data-copy]')
  if (!copyButton) return
  const command = commands(backendUrl, newConversation).find((item) => item.id === copyButton.dataset.copy)?.command
  if (!command) return
  await navigator.clipboard.writeText(command)
  copyButton.textContent = '已复制，可直接发给 AI'
  setTimeout(() => { copyButton.textContent = '复制调用命令' }, 1400)
})
document.querySelector('#popup-api-list').addEventListener('change', (event) => {
  if (event.target.id !== 'new-conversation') return
  newConversation = event.target.checked
  renderCommands()
})
document.querySelector('#reconnect').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'reconnect' })
  setTimeout(refresh, 500)
})
document.querySelector('#options').addEventListener('click', () => chrome.runtime.openOptionsPage())
refresh()
