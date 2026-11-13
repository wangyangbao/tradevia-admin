import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { Window } from 'happy-dom'
import { createServer } from 'vite'
import { registerAccount, saveSession } from '../src/lib/auth.ts'
import { createOrganizationSeed, organizationStorageKey } from '../src/lib/organization.ts'

// Component interaction checks in a simulated DOM; this does not launch or control a browser.
const dom = new Window({ url: 'http://localhost/#unitArchives' })
for (const key of ['window', 'document', 'localStorage', 'sessionStorage', 'history', 'location', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'Node', 'NodeFilter', 'DocumentFragment', 'MutationObserver', 'CustomEvent', 'Event', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'FocusEvent']) {
  globalThis[key] = key === 'window' ? dom : dom[key]
}
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.navigator })
globalThis.getComputedStyle = dom.getComputedStyle.bind(dom)
globalThis.requestAnimationFrame = dom.requestAnimationFrame.bind(dom)
globalThis.cancelAnimationFrame = dom.cancelAnimationFrame.bind(dom)
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { act, createElement } = await import('react')
const { createRoot } = await import('react-dom/client')
let server, App, PreferenceProvider, AuthProvider, root, host, scrollCalls

before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  App = (await server.ssrLoadModule('/src/App.tsx')).default
  PreferenceProvider = (await server.ssrLoadModule('/src/lib/preferences.tsx')).PreferenceProvider
  AuthProvider = (await server.ssrLoadModule('/src/lib/auth-context.tsx')).AuthProvider
})
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear()
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-scroll-locked')
  localStorage.setItem(organizationStorageKey, JSON.stringify(createOrganizationSeed()))
  scrollCalls = 0; window.scrollTo = options => { if (options?.behavior === 'instant') scrollCalls++ }
})
afterEach(async () => { await act(async () => { root?.unmount() }); root = null; host?.remove() })
after(async () => { await server?.close(); await dom.happyDOM.close() })

async function mount(hash, email = 'hq@tradevia.demo') {
  history.replaceState(null, '', hash)
  const user = await registerAccount({ name: '交互验收', email, password: 'Demo123456' })
  saveSession(user, false)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => { root.render(createElement(PreferenceProvider, null, createElement(AuthProvider, null, createElement(App)))) })
}
const button = (text, within = document) => [...within.querySelectorAll('button')].find(b => b.textContent.trim() === text || b.firstElementChild?.textContent.trim() === text)
const click = async element => { assert.ok(element, '点击目标存在'); await act(async () => { element.focus(); element.click() }) }
const drawer = () => document.querySelector('[data-slot="detail-drawer"]')
const directory = () => document.querySelector('aside[aria-label="基础档案分类"]')

test('archive categories switch in place, retain the directory and keep the basic-data menu active', async () => {
  await mount('#unitArchives')
  const hash = location.hash
  await click(button('商品分类', directory()))
  assert.equal(location.hash, hash)
  assert.equal(document.querySelector('.breadcrumb-current')?.textContent, '基础档案')
  assert.equal(document.querySelector('h1')?.textContent, '商品分类')
  assert.ok(directory())
  assert.ok(document.querySelector('a[href="#unitArchives"][aria-current="page"]'))
  assert.match(document.querySelector('.catalog-table').textContent, /冰淇淋|所属品牌|上级分类/)
  assert.equal(scrollCalls, 0)
  await click(button('门店分类', directory()))
  assert.equal(location.hash, hash)
  assert.equal(document.querySelector('h1')?.textContent, '门店分类')
  assert.ok(directory())
  assert.match(document.querySelector('.basic-table').textContent, /社区零售店|客户数 \/ 活跃/)
  assert.ok(button('门店分类', directory()).matches('[aria-current="page"]'))
  await click(button('单位档案', directory()))
  assert.equal(document.querySelector('h1')?.textContent, '单位档案')
  assert.equal(location.hash, hash)
})

test('a read-only dealer can browse both categories in place without maintenance controls', async () => {
  await mount('#unitArchives', 'dealer@tradevia.demo')
  await click(button('商品分类', directory()))
  assert.equal(document.querySelector('h1')?.textContent, '商品分类')
  assert.equal(button('新增商品分类'), undefined)
  assert.equal(button('编辑', document.querySelector('.catalog-table')), undefined)
  await click(button('门店分类', directory()))
  assert.equal(button('新增门店分类'), undefined)
  assert.equal(location.hash, '#unitArchives')
})

test('customer detail opens over the same list and closes without losing filters, scroll or focus', async () => {
  await mount('#outlets')
  const list = document.querySelector('.customer-list-scroll'), status = document.querySelector('select[aria-label="客户状态"]')
  await act(async () => { status.value = '活跃'; status.dispatchEvent(new Event('change', { bubbles: true })) })
  list.scrollTop = 140; list.scrollLeft = 80
  const opener = button('查看档案')
  await click(opener)
  assert.ok(drawer()?.classList.contains('customer-detail-drawer'))
  assert.strictEqual(document.querySelector('.customer-list-scroll'), list)
  assert.ok(document.body.contains(list))
  assert.equal(list.scrollTop, 140)
  assert.equal(scrollCalls, 0)
  assert.equal(status.value, '活跃')
  await click(drawer().querySelector('[aria-label="放大详情"]'))
  assert.equal(drawer().dataset.expanded, 'true')
  await click(drawer().querySelector('[aria-label="还原详情宽度"]'))
  assert.equal(drawer().dataset.expanded, 'false')
  await click(drawer().querySelector('[aria-label="关闭详情"]'))
  assert.equal(drawer(), null)
  assert.strictEqual(document.querySelector('.customer-list-scroll'), list)
  assert.equal(status.value, '活跃')
  assert.equal(list.scrollLeft, 80)
  assert.equal(list.scrollTop, 140)
  assert.strictEqual(document.activeElement, opener)
  assert.equal(location.hash, '#outlets')
})

test('customer drawer preserves its shell across adjacent customers and exposes editors above it', async () => {
  await mount('#outlets')
  await click(button('查看档案'))
  const panel = drawer(), firstTitle = panel.querySelector('.detail-drawer-title').textContent
  await click(panel.querySelector('[aria-label="下一条"]'))
  assert.strictEqual(drawer(), panel)
  assert.notEqual(panel.querySelector('.detail-drawer-title').textContent, firstTitle)
  await click(button('编辑客户', panel))
  const editor = document.querySelector('.customer-editor')
  assert.ok(editor)
  assert.ok(Number(editor.style.zIndex) > Number(getComputedStyle(panel).zIndex || 51))
  await click(button('取消', editor))
  assert.ok(drawer())
  assert.equal(document.querySelector('.customer-editor'), null)
  await click(button('变更状态', panel))
  const statusDialog = [...document.querySelectorAll('[data-slot="dialog-content"]')].find(d => d.textContent.includes('变更客户状态'))
  assert.ok(statusDialog)
  assert.ok(Number(statusDialog.style.zIndex) > Number(getComputedStyle(panel).zIndex || 51))
  await click(button('取消', statusDialog))
})

test('associated documents reuse the customer drawer and Esc returns to the customer before closing', async () => {
  await mount('#outlets?customer=OUT-001&tab=销售订单')
  const customerPanel = drawer()
  const order = [...customerPanel.querySelectorAll('button')].find(b => b.textContent === 'SO-261025-100')
  const body = customerPanel.querySelector('.detail-drawer-body'); body.scrollTop = 240
  await click(order)
  assert.equal(body.scrollTop, 0)
  const panels = [...document.querySelectorAll('[data-slot="detail-drawer"]')]
  assert.equal(panels.length, 1)
  assert.strictEqual(drawer(), customerPanel)
  assert.equal(drawer().querySelector('.detail-drawer-title').textContent, 'SO-261025-100')
  await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
  assert.equal(document.querySelectorAll('[data-slot="detail-drawer"]').length, 1)
  assert.equal(drawer().querySelector('.detail-drawer-title').textContent, 'Aling Nena Store')
  assert.equal(body.scrollTop, 240)
  assert.strictEqual(document.activeElement, order)
  await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
  assert.equal(drawer(), null)
})
