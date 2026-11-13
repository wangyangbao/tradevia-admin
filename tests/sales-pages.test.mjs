import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { Window } from 'happy-dom'
import { createServer } from 'vite'
import { registerAccount, saveSession } from '../src/lib/auth.ts'
import { createOrganizationSeed, organizationStorageKey } from '../src/lib/organization.ts'
import { localDate } from '../src/lib/customers.ts'
const dom = new Window({ url: 'http://localhost/#orders' })
for (const key of ['window', 'document', 'localStorage', 'sessionStorage', 'history', 'location', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'Node', 'NodeFilter', 'DocumentFragment', 'MutationObserver', 'CustomEvent', 'Event', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'FocusEvent', 'FileReader']) globalThis[key] = key === 'window' ? dom : dom[key]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.navigator })
globalThis.getComputedStyle = dom.getComputedStyle.bind(dom); globalThis.requestAnimationFrame = dom.requestAnimationFrame.bind(dom); globalThis.cancelAnimationFrame = dom.cancelAnimationFrame.bind(dom); globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { act, createElement } = await import('react'), { createRoot } = await import('react-dom/client')
let server, App, PreferenceProvider, AuthProvider, root, host
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  App = (await server.ssrLoadModule('/src/App.tsx')).default; PreferenceProvider = (await server.ssrLoadModule('/src/lib/preferences.tsx')).PreferenceProvider; AuthProvider = (await server.ssrLoadModule('/src/lib/auth-context.tsx')).AuthProvider
})
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); document.body.innerHTML = ''; document.documentElement.removeAttribute('data-scroll-locked'); localStorage.setItem(organizationStorageKey, JSON.stringify(createOrganizationSeed())); window.scrollTo = () => {} })
afterEach(async () => { await act(async () => root?.unmount()); root = null; host?.remove() })
after(async () => { await server?.close(); await dom.happyDOM.close() })
async function mount(hash = '#orders', email = 'hq@tradevia.demo') {
  history.replaceState(null, '', hash); const user = await registerAccount({ name: '销售交互验收', email, password: 'Demo123456' }); saveSession(user, false)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => root.render(createElement(PreferenceProvider, null, createElement(AuthProvider, null, createElement(App)))))
}
const pauseRoute = () => new Promise(r => setTimeout(r, 5))
const button = (text, within = document) => [...within.querySelectorAll('button')].find(b => b.textContent.trim() === text)
const click = async el => { assert.ok(el, '点击目标存在'); await act(async () => { el.focus(); el.click(); await pauseRoute() }) }
const choose = async (label, value) => { const el = document.querySelector(`select[aria-label="${label}"]`); assert.ok(el, label); await act(async () => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })) }) }
const fill = async (label, value) => { const el = document.querySelector(`[aria-label="${label}"]`); assert.ok(el, label); await act(async () => { Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }) }
const submit = async within => { assert.ok(within); await act(async () => { within.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await pauseRoute() }) }
const drawer = () => document.querySelector('[data-slot="detail-drawer"]')
const state = () => JSON.parse(localStorage.getItem('tradevia-sales-v1-hani'))
async function startOrder(mode = '访销订单') {
  await click(button('新建订单')); const chooser = document.querySelector('.sales-chooser'); assert.ok(chooser)
  await click([...chooser.querySelectorAll('button')].find(b => b.textContent.includes(mode)))
  assert.ok(document.querySelector('.sales-editor')); assert.equal(document.querySelector('.sales-chooser'), null); assert.equal(document.querySelectorAll('[role="dialog"]').length, 0)
  await choose('订单客户', 'OUT-001'); await fill('配送日期', localDate()); await choose('添加订单商品', 'SKU-001'); await click(button('添加商品'))
}

test('四个销售菜单归在同一分组，列表单页头、单筛选区与20条分页', async () => {
  await mount()
  const group = document.querySelector('#nav-children-salesManagementNav')
  for (const page of ['orders', 'shipments', 'outbounds', 'invoices']) assert.ok(group.querySelector(`a[href="#${page}"]`))
  assert.equal(document.querySelectorAll('h1').length, 1); assert.equal(document.querySelectorAll('.management-filters').length, 1); assert.equal(document.querySelectorAll('.sales-list-card tbody tr').length, 20)
  await click(button('下一页') ?? document.querySelector('[aria-label="下一页"]'))
  assert.match(document.querySelector('.sales-pagination').textContent, /21–40/)
})
test('完整访销页面流程：下单审核→全页发货→自动出库→签收→收款→开票', async () => {
  await mount(); const oldOrders = state().orders.length; await startOrder()
  await submit(document.querySelector('.sales-editor')); assert.equal(document.querySelector('.sales-form-error'), null)
  let saved = state(), order = saved.orders[0]; assert.equal(saved.orders.length, oldOrders + 1); assert.equal(order.status, '待审核'); assert.ok(drawer())
  await click(button('审核通过', drawer())); assert.equal(state().orders[0].status, '已审核')
  await click(button('生成发货单', drawer())); assert.ok(document.querySelector('.sales-editor')); assert.match(document.querySelector('h1').textContent, /新建发货单/)
  await fill('配送车辆', '测试冷链车 01'); await submit(document.querySelector('.sales-editor'))
  assert.equal(document.querySelector('.sales-form-error'), null); saved = state(); const d = saved.shipments.at(-1); assert.equal(d.status, '配送中'); assert.ok(saved.outbounds.some(b => b.shipmentId === d.id)); assert.ok(drawer())
  await click(button('登记签收', drawer())); await submit(document.querySelector('.sales-task-dialog')); assert.equal(state().shipments.at(-1).status, '已签收')
  await click(button('登记收款', drawer())); await submit(document.querySelector('.sales-task-dialog')); assert.equal(state().receipts.at(-1).orderId, order.id); assert.equal(state().receipts.at(-1).amount, 72000)
  await click(button('生成销售发票', drawer())); assert.match(document.querySelector('h1').textContent, /新建销售发票/)
  await fill('发票凭证号', 'UI-INV-10001'); await submit(document.querySelector('.sales-editor'))
  assert.equal(document.querySelector('.sales-form-error'), null); const i = state().invoices.at(-1); assert.equal(i.status, '已开票'); assert.equal(i.amount, 72000); assert.equal(i.orderId, order.id)
})
test('车销先确认实收再原子交付，页面可直接看到生成单据与已结清', async () => {
  await mount(); await startOrder('车销订单')
  await submit(document.querySelector('.sales-editor')); assert.match(document.querySelector('.sales-form-error').textContent, /现场实收/)
  await click(document.querySelector('.sales-onsite-confirm input'))
  await submit(document.querySelector('.sales-editor')); assert.equal(document.querySelector('.sales-form-error'), null)
  const saved = state(), o = saved.orders[0]
  assert.equal(o.mode, '车销订单'); assert.equal(o.status, '已审核'); assert.equal(saved.shipments.at(-1).status, '已签收'); assert.equal(saved.receipts.at(-1).orderId, o.id); assert.match(drawer().textContent, /已结清/)
})
test('查询须点击或回车生效，关闭详情保留查询条件和分页', async () => {
  await mount(); const before = document.querySelectorAll('tbody tr').length
  await fill('搜索单据', '不匹配的门店'); assert.equal(document.querySelectorAll('tbody tr').length, before)
  await submit(document.querySelector('.sales-list-card')); assert.equal(document.querySelectorAll('tbody tr').length, 0); assert.match(document.querySelector('.sales-empty').textContent, /清除筛选/)
  await click(button('重置')); assert.equal(document.querySelectorAll('tbody tr').length, 20)
  await choose('单据状态', '待审核'); await submit(document.querySelector('.sales-list-card')); const count = document.querySelectorAll('tbody tr').length
  await click(button('详情')); assert.ok(drawer()); await click(drawer().querySelector('[aria-label="关闭详情"]'))
  assert.equal(document.querySelector('select[aria-label="单据状态"]').value, '待审核'); assert.equal(document.querySelectorAll('tbody tr').length, count)
})
test('订单关联页签齐全；关联发货与出库可原位切换', async () => {
  await mount(); const o = state().orders.find(o => state().shipments.some(d => d.orderId === o.id && d.status === '已签收'))
  await act(async () => { location.hash = `orders?document=${o.id}`; await pauseRoute() })
  assert.ok(drawer()); const tabs = [...drawer().querySelectorAll('[role="tab"]')]
  for (const name of ['订单产品', '回款明细', '外勤', '退货单', '审批流程', '发货单', '出库单', '销售发票', '修改记录']) assert.ok(tabs.some(t => t.textContent.startsWith(name)), name)
  await click(tabs.find(t => t.textContent.startsWith('发货单'))); await click(drawer().querySelector('.sales-related-list button'))
  assert.match(drawer().textContent, /发货单产品/); assert.doesNotMatch(drawer().textContent, /订单产品/)
  await click([...drawer().querySelectorAll('[role="tab"]')].find(t => t.textContent.startsWith('出库单'))); await click(drawer().querySelector('.sales-related-list button'))
  assert.match(drawer().textContent, /出库商品/)
})
test('未保存编辑通过取消及侧栏跳转均需确认，继续编辑保留内容', async () => {
  await mount(); await startOrder(); await fill('订单备注', '未保存内容必须保留')
  await click(button('取消', document.querySelector('.sales-editor'))); assert.ok(button('继续编辑'))
  await click(button('继续编辑')); assert.equal(document.querySelector('[aria-label="订单备注"]').value, '未保存内容必须保留')
  await click(document.querySelector('a[href="#shipments"]')); assert.ok(button('放弃修改并离开')); assert.match(location.hash, /orders/)
  await click(button('继续编辑')); assert.equal(document.querySelector('[aria-label="订单备注"]').value, '未保存内容必须保留')
  await click(button('取消', document.querySelector('.sales-editor'))); await click(button('放弃修改并离开')); assert.equal(document.querySelector('.sales-editor'), null)
})
test('出库新增须选择有效草稿发货单，已出库记录无直接改数或作废操作', async () => {
  await mount('#outbounds'); await click(button('生成出库单')); assert.match(document.querySelector('.sales-chooser').textContent, /从发货单生成出库/)
  const source = document.querySelector('.sales-source-list button'); assert.ok(source); await click(source)
  assert.match(document.querySelector('h1').textContent, /确认销售出库/); assert.ok(document.querySelector('[aria-label="配送车辆"]'))
})
test('普通成员审核按钮置灰，不能查看其他经销商的订单', async () => {
  await mount('#orders', 'staff6@tradevia.demo')
  assert.match(document.querySelector('tbody').textContent, /Aling Nena Store|Del Rosario/); assert.doesNotMatch(document.querySelector('tbody').textContent, /Santos Mini Mart|吕宋冷链/)
  const o = state().orders.find(o => o.dealerId === 'dealer-mm' && o.status === '待审核')
  if (o) { await act(async () => { location.hash = `orders?document=${o.id}`; await pauseRoute() }); assert.equal(button('审核通过', drawer()).disabled, true) }
})
test('历史台账保留旧订单；库存与应收页面展示当前销售流水口径', async () => {
  await mount(); await click([...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.startsWith('历史台账')))
  assert.match(document.querySelector('.sales-list-card').textContent, /SO-261107-0086/)
  await act(async () => { location.hash = 'inventory'; await pauseRoute() }); assert.match(document.querySelector('h1').textContent, /销售库存台账/); assert.match(document.querySelector('tbody').textContent, /LOT-/)
  await act(async () => { location.hash = 'receivables'; await pauseRoute() }); assert.match(document.querySelector('h1').textContent, /销售应收台账/); assert.match(document.querySelector('thead').textContent, /退货冲减.*净回款.*待退款/)
})
test('销售数据损坏时展示重试，不覆盖原数据', async () => {
  localStorage.setItem('tradevia-sales-v1-hani', 'broken'); await mount()
  assert.match(document.querySelector('.sales-error').textContent, /原数据已保留/); assert.equal(localStorage.getItem('tradevia-sales-v1-hani'), 'broken'); assert.ok(button('重新读取'))
})

test('部分签收页面可上传现场照片并登记拒收回仓，只有接受数量形成应收', async () => {
  await mount('#shipments')
  const d = state().shipments.find(d => d.status === '配送中'), o = state().orders.find(o => o.id === d.orderId), l = d.lines[0]
  await act(async () => { location.hash = `shipments?document=${d.id}`; await pauseRoute() })
  await click(button('登记签收', drawer())); await choose('本次配送结果', '部分签收'); await fill(`实际签收数量 ${l.lineId}`, String(l.quantity - 2)); await fill('拒收原因', '门店临时调整需求，拒收两支')
  const data = new dom.DataTransfer(); data.items.add(new dom.File([Uint8Array.from([137,80,78,71])], 'test.png', { type: 'image/png' }))
  await act(async () => { const el = document.querySelector('[aria-label="签收现场照片"]'); el.files = data.files; el.dispatchEvent(new Event('change', { bubbles: true })); await pauseRoute() })
  assert.ok(document.querySelector('.sales-task-dialog img'))
  await click(document.querySelector('[aria-label="确认拒收商品已回仓"]')); await submit(document.querySelector('.sales-task-dialog'))
  assert.equal(document.querySelector('.sales-form-error'), null)
  const saved = state(), signed = saved.shipments.find(x => x.id === d.id), returned = saved.returns.at(-1)
  assert.equal(signed.result, '部分签收'); assert.equal(signed.accepted[0].quantity, l.quantity - 2); assert.equal(returned.kind, '拒收退回'); assert.equal(returned.amount, 0); assert.equal(returned.orderId, o.id)
})
