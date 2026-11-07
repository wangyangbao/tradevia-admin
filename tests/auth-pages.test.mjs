import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { registerAccount, saveSession } from '../src/lib/auth.ts'

let server
let App
let AuthProvider
let PreferenceProvider
function memoryStorage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  App = (await server.ssrLoadModule('/src/App.tsx')).default
  AuthProvider = (await server.ssrLoadModule('/src/lib/auth-context.tsx')).AuthProvider
  PreferenceProvider = (await server.ssrLoadModule('/src/lib/preferences.tsx')).PreferenceProvider
})
after(async () => { await server?.close() })
beforeEach(() => {
  globalThis.localStorage = memoryStorage()
  globalThis.sessionStorage = memoryStorage()
  globalThis.location = { hash: '#login' }
})
function render() {
  return renderToStaticMarkup(createElement(PreferenceProvider, null, createElement(AuthProvider, null, createElement(App))))
}

test('signed-out users see the login form and a working demo entry', () => {
  const html = render()
  assert.match(html, /欢迎回来/)
  assert.match(html, /id="auth-email"/)
  assert.match(html, /autoComplete="current-password"/)
  assert.match(html, /体验演示工作台/)
  assert.doesNotMatch(html, /class="app-shell"/)
  assert.doesNotMatch(html, /id="auth-confirm"/)
})

test('registration has name and confirm-password fields with explicit demo boundaries', () => {
  location.hash = '#register'
  const html = render()
  for (const field of ['name', 'email', 'password', 'confirm']) assert.ok(html.includes(`id="auth-${field}"`))
  assert.match(html, /创建账号并进入/)
  assert.match(html, /账号仅保存在此浏览器/)
  assert.match(html, /autoComplete="new-password"/)
})

test('direct links to business pages never render the workspace while signed out', () => {
  for (const hash of ['#orders', '#settings', '#visitRoutes', '#overview']) {
    location.hash = hash
    const html = render()
    assert.match(html, /id="auth-email"/)
    assert.doesNotMatch(html, /class="app-shell"/)
  }
})

test('login and registration honor the saved English preference', () => {
  localStorage.setItem('tradevia-preferences', JSON.stringify({ locale: 'en' }))
  assert.match(render(), /Welcome back/)
  location.hash = '#register'
  const html = render()
  assert.match(html, /Confirm password/)
  assert.match(html, /Local demo only/)
  assert.doesNotMatch(html, /欢迎回来|确认密码/)
})

test('a signed-in account renders the existing workspace with its own name', async () => {
  const user = await registerAccount({ name: '注册体验员', email: 'reviewer@example.com', password: 'DemoOnly123' })
  saveSession(user, false)
  location.hash = '#settings'
  const html = render()
  assert.match(html, /class="app-shell"/)
  assert.match(html, /注册体验员/)
  assert.match(html, /个性化偏好/)
  assert.doesNotMatch(html, /id="auth-email"/)
})
