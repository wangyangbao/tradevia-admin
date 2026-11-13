import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { createOrganizationSeed, organizationStorageKey } from '../src/lib/organization.ts'
import { registerAccount, saveSession } from '../src/lib/auth.ts'
import { changeCustomer, createCustomerSeed, customerMapUrl, customerStorageKey, fullAddress, linkCustomerSalesOrder } from '../src/lib/customers.ts'
import { getScope } from '../src/lib/organization.ts'
let server, App, AuthProvider, PreferenceProvider
before(async () => {
  // Render the real drawer markup inline for server-side content assertions; browser portals require a DOM.
  server = await createServer({ plugins: [{ name: 'inline-detail-portal-for-ssr', enforce: 'pre', transform(code, id) { if (id.endsWith('/src/components/ui/detail-drawer.tsx')) return code.replaceAll('<DialogPrimitive.Portal>', '<>').replaceAll('</DialogPrimitive.Portal>', '</>') } }], server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  App = (await server.ssrLoadModule('/src/App.tsx')).default
  AuthProvider = (await server.ssrLoadModule('/src/lib/auth-context.tsx')).AuthProvider
  PreferenceProvider = (await server.ssrLoadModule('/src/lib/preferences.tsx')).PreferenceProvider
})
after(async () => { await server?.close() })
beforeEach(() => {
  const storage = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) } }
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage(); globalThis.location = { hash: '#outlets' }
  localStorage.setItem(organizationStorageKey, JSON.stringify(createOrganizationSeed()))
})
function markup() { return renderToStaticMarkup(createElement(PreferenceProvider, null, createElement(AuthProvider, null, createElement(App)))) }
async function render(email = 'hq@tradevia.demo', hash = '#outlets') {
  const user = await registerAccount({ name: '客户模块验收', email, password: 'Demo123456' })
  saveSession(user, false); location.hash = hash
  return { html: markup(), user }
}
const profile = tab => `#outlets?customer=OUT-001&tab=${encodeURIComponent(tab)}`
test('store management provides the two menus and a single compact customer list', async () => {
  const { html } = await render()
  assert.match(html, /门店管理/); assert.match(html, /href="#outletCategories"/)
  assert.match(html, /<h1>客户<\/h1>/); assert.equal((html.match(/<h1>/g) ?? []).length, 1)
  assert.match(html, /<select aria-label="客户分类"[^>]*>/)
  assert.match(html, /<option value="all"[^>]*>全部客户分类<\/option>/)
  assert.match(html, /社区零售店 \/ 重点社区店/)
  assert.doesNotMatch(html, /class="customer-directory"|customer-category-row/)
  assert.match(html, /保存筛选/); assert.match(html, /新建客户/)
  assert.match(html, /Aling Nena Store/); assert.match(html, /Santos Mini Mart/)
  assert.match(html, /CU-BU-007-000001/); assert.match(html, /aria-label="每页条数"/)
  assert.match(html, /订单与收款均为演示数据/); assert.doesNotMatch(html, /class="page-heading"|small-stats-grid/)
})
test('dealer customer list contains own customers and never sibling or parent customer data', async () => {
  const { html } = await render('dealer@tradevia.demo')
  assert.match(html, /Aling Nena Store/); assert.match(html, /Del Rosario Mart/)
  assert.doesNotMatch(html, /Santos Mini Mart|Cebu Corner Shop|Reyes Family Store|沈星|陆川|苏晴/)
  assert.doesNotMatch(html, /当前组织暂无该模块的业务数据/)
})
test('profile deep links render all seven tabs, credit context, overdue balance and timeline', async () => {
  const { html } = await render('hq@tradevia.demo', profile('详细信息'))
  assert.match(html, /class="detail-drawer-title"[^>]*>Aling Nena Store<\/h2>/)
  assert.equal((html.match(/role="tab"/g) ?? []).length, 7)
  for (const tab of ['详细信息', '客户地址', '联系人', '外勤记录', '销售订单', '收款单', '修改记录']) assert.match(html, new RegExp(tab))
  assert.match(html, /客户动态/); assert.match(html, /发布跟进/); assert.match(html, /信用额度/); assert.match(html, /₱8,640.00/)
  assert.match(html, /逾期未收/); assert.match(html, /门头照片/); assert.match(html, /修改记录/)
  assert.doesNotMatch(html, /当前组织暂无该模块的业务数据|<h1>经营概览/)
  assert.match(html, /data-slot="detail-drawer"/)
  assert.match(html, /class="customer-list-scroll"/)
  assert.match(html, /aria-label="放大详情"/)
  assert.match(html, /aria-label="关闭详情"/)
})
test('addresses tab exposes structured address, six-decimal coordinates and genuine edit actions', async () => {
  const { html } = await render('dealer@tradevia.demo', profile('客户地址'))
  assert.match(html, /Mindanao Avenue/); assert.match(html, /Bagong Pag-asa/)
  assert.match(html, /14.646300/); assert.match(html, /121.041400/)
  assert.match(html, /默认地址/); assert.match(html, /新增地址/); assert.match(html, />编辑<\/button>/)
  assert.match(html, /查看定位/)
  assert.match(html, /href="https:\/\/www.google.com\/maps\/search\/\?api=1&amp;query=14.646300%2C121.041400" target="_blank" rel="noopener noreferrer"/)
})
test('profile emphasizes contact address and location without importing unrelated reference fields', async () => {
  const { html } = await render('dealer@tradevia.demo', profile('详细信息'))
  for (const label of ['联系信息', '主要联系人', '联系人职务', '联系电话', '地区定位与联系地址', '联系地址', '省 / Province', '市 / City', '区 / Barangay', '街道', '收货人', '收货电话', '门店定位', '修改地址与定位']) assert.ok(html.includes(label), label)
  assert.match(html, /class="customer-identity-address"/)
  assert.match(html, /18 号，临街一层, Mindanao Avenue, Bagong Pag-asa, Quezon City, Metro Manila/)
  assert.match(html, /纬度 14.646300 \/ 经度 121.041400/)
  assert.doesNotMatch(html, /传真|网址|锁定状态|ERP编码|认证状态|法人名称|月度协议数/)
})
test('read-only users can view location but cannot use the address edit shortcut', async () => {
  const { html } = await render('staff6@tradevia.demo', profile('详细信息'))
  assert.match(html, /地区定位与联系地址/); assert.match(html, /查看定位/)
  assert.doesNotMatch(html, /修改地址与定位|编辑客户/)
})
test('saved default address drives the profile and all tab headers after reopening', async () => {
  const org = createOrganizationSeed(), scope = getScope(org, { email: 'hq@tradevia.demo', demo: false }, 'hani')
  const seed = createCustomerSeed('hani'), oldAddress = seed.customers[0].addresses[0]
  const nextAddress = { ...oldAddress, id: 'new-default-address', label: '新门店地址', detail: '88 号，二楼，对面是市场', latitude: 14.654321, longitude: 121.012345, recipient: '配送负责人', phone: '+63 917 222 3333', primary: true }
  const state = changeCustomer(seed, 'OUT-001', { kind: 'address', value: nextAddress }, org, scope)
  localStorage.setItem(customerStorageKey('hani'), JSON.stringify(state))
  const { html } = await render('dealer@tradevia.demo', profile('详细信息'))
  assert.ok(html.includes(fullAddress(nextAddress)))
  assert.ok(html.includes(customerMapUrl(nextAddress).replaceAll('&', '&amp;')))
  assert.ok(!html.includes(customerMapUrl(oldAddress).replaceAll('&', '&amp;')))
  assert.match(html, /配送负责人/); assert.match(html, /\+63 917 222 3333/)
  location.hash = profile('销售订单')
  const ordersHtml = markup()
  assert.ok(ordersHtml.includes(fullAddress(nextAddress)))
  assert.ok(ordersHtml.includes(customerMapUrl(nextAddress).replaceAll('&', '&amp;')))
  assert.match(ordersHtml, /SO-261025-100/)
})
test('contacts tab contains a primary contact and details instead of placeholder rows', async () => {
  const { html } = await render('dealer@tradevia.demo', profile('联系人'))
  assert.match(html, /Ana Reyes/); assert.match(html, /主要/); assert.match(html, /\+63 917 800 1000/)
  assert.match(html, /新增联系人/); assert.match(html, /配送前可电话联系/)
  assert.doesNotMatch(html, /王小虎|2016-05/)
})
test('field visits contain visit content, actual source and next follow-up date', async () => {
  const { html } = await render('dealer@tradevia.demo', profile('外勤记录'))
  assert.match(html, /现场拜访/); assert.match(html, /补录外勤/)
  assert.match(html, /香草口味余量偏低/); assert.match(html, /2026-11-12/)
})
test('orders and receipts stay associated with the selected customer through independent tabs', async () => {
  await render('dealer@tradevia.demo', profile('销售订单'))
  let html = markup()
  assert.match(html, /SO-261107-0086/); assert.match(html, /SO-261025-100/)
  assert.match(html, /待收余额/); assert.match(html, /2026-11-01/)
  assert.doesNotMatch(html, /Santos Mini Mart|SO-261107-0085/)
  location.hash = profile('收款单'); html = markup()
  assert.match(html, /RC-261028-0001/); assert.match(html, /关联订单/); assert.match(html, /₱5,760.00/)
  assert.match(html, /GCash/); assert.match(html, /已确认/)
})
test('modification tab renders audit events while ordinary members never receive write controls', async () => {
  const { html } = await render('staff6@tradevia.demo', profile('修改记录'))
  assert.match(html, /客户建档/); assert.match(html, /客户动态/)
  assert.doesNotMatch(html, /编辑客户|变更状态|发布跟进|新增地址|新增联系人|补录外勤/)
})
test('opening another dealers customer directly never leaks its name, addresses or documents', async () => {
  const { html } = await render('dealer@tradevia.demo', '#outlets?customer=OUT-002&tab=联系人')
  assert.match(html, /客户不存在或不在当前组织范围内/)
  assert.doesNotMatch(html, /Santos Mini Mart|Marco Santos|SO-261107-0085|RC-261028-0002/)
})
test('switching tenant restores a separate empty customer workspace', async () => {
  const { user } = await render()
  sessionStorage.setItem(`tradevia-tenant-${user.id}`, 'island')
  const html = markup()
  assert.match(html, /还没有客户档案/); assert.match(html, /海岛食品总部/)
  assert.doesNotMatch(html, /Aling Nena Store|Santos Mini Mart|₱8,640.00/)
})
test('classification menu reuses existing master data and adds scoped customer statistics', async () => {
  const { html } = await render('dealer@tradevia.demo', '#outletCategories')
  assert.match(html, /<h1>门店分类<\/h1>/); assert.match(html, /客户数 \/ 活跃/); assert.match(html, /近 3 月月均销额/)
  assert.match(html, /仅统计当前组织范围内客户/); assert.match(html, /重点社区店/)
  assert.doesNotMatch(html, /新增门店分类|>编辑<\/button>|基础档案分类|class="basic-directory"|门店管理菜单/)
})
test('refresh renders saved edits and newly associated records without reverting seed data', async () => {
  const state = createCustomerSeed('hani'); state.customers[0].name = '已更新客户名称'
  state.customers[0].contacts.push({ id: 'contact-extra', name: '采购小林', role: '采购', phone: '+63 917 123 4567', email: '', note: '周四联系', primary: false })
  localStorage.setItem(customerStorageKey('hani'), JSON.stringify(state))
  const { html } = await render('dealer@tradevia.demo', profile('联系人'))
  assert.match(html, /class="detail-drawer-title"[^>]*>已更新客户名称<\/h2>/); assert.match(html, /采购小林/)
  assert.match(html, /SO-261025-100/)
})
test('corrupt customer storage shows recovery guidance and cannot silently reset or enable writes', async () => {
  const raw = 'do not overwrite corrupt customer storage'
  localStorage.setItem(customerStorageKey('hani'), raw)
  const { html } = await render()
  assert.match(html, /暂时无法读取客户数据/); assert.match(html, /重新读取/)
  assert.doesNotMatch(html, /新建客户|Aling Nena Store/)
  assert.equal(localStorage.getItem(customerStorageKey('hani')), raw)
})
test('sales list restores newly linked customer orders alongside legacy records after refresh', async () => {
  const org = createOrganizationSeed(), scope = getScope(org, { email: 'hq@tradevia.demo', demo: false }, 'hani')
  const order = { id: 'SO-261109-0001', outlet: 'Aling Nena Store', distributor: '马尼拉联合经销商', region: 'manila', date: '2026-11-09', amount: 720, status: 'pending', product: 'vanilla', quantity: 24, price: 30, payment: 'credit' }
  localStorage.setItem(customerStorageKey('hani'), JSON.stringify(linkCustomerSalesOrder(createCustomerSeed('hani'), 'OUT-001', order, org, scope)))
  const { html } = await render('hq@tradevia.demo', '#orders?history=1')
  assert.match(html, /SO-261109-0001/); assert.match(html, /SO-261107-0086/)
  location.hash = profile('销售订单')
  const customerHtml = markup()
  assert.match(customerHtml, /SO-261109-0001/); assert.match(customerHtml, /₱720.00/)
})
