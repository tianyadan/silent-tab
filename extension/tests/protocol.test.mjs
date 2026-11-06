import test from 'node:test'
import assert from 'node:assert/strict'

import { clampTimeout, isAllowedURL, normalizeBackendURL, normalizeDomains, websocketURL } from '../lib/protocol.mjs'

test('backend only accepts loopback addresses', () => {
  assert.equal(normalizeBackendURL('http://localhost:8080/'), 'http://localhost:8080')
  assert.equal(websocketURL('http://127.0.0.1:8765'), 'ws://127.0.0.1:8765/api/browser/ws')
  assert.throws(() => normalizeBackendURL('https://example.com'), /仅连接本机/)
})

test('domain allowlist supports exact hosts and subdomain wildcards', () => {
  const domains = normalizeDomains(['example.com', '*.silent-tab.test'])
  assert.equal(isAllowedURL('https://example.com/a', domains), true)
  assert.equal(isAllowedURL('https://api.silent-tab.test/a', domains), true)
  assert.equal(isAllowedURL('https://silent-tab.test/a', domains), false)
  assert.equal(isAllowedURL('chrome://settings', domains), false)
  assert.equal(isAllowedURL('https://evil.example/a', domains), false)
})

test('long-running ChatGPT tasks can use a bounded five minute timeout', () => {
  assert.equal(clampTimeout(180000), 180000)
  assert.equal(clampTimeout(600000), 300000)
  assert.equal(clampTimeout(10), 100)
})
