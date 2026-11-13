import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { registerAccount, saveSession } from '../src/lib/auth.ts'
import { createOrganizationSeed, organizationStorageKey } from '../src/lib/organization.ts'
import { createCatalogSeed, catalogStorageKey } from '../src/lib/catalog.ts'
let server, App, AuthProvider, PreferenceProvider
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  App = (await server.ssrLoadModule('/src/App.tsx')).default
  AuthProvider = (await server.ssrLoadModule('/src/lib/auth-context.tsx')).AuthProvider
  PreferenceProvider = (await server.ssrLoadModule('/src/lib/preferences.tsx')).PreferenceProvider
})
after(async () => { await server?.close() })
beforeEach(() => {
  const storage = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) } }
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage(); globalThis.location = { hash: '#productCategories' }
  localStorage.setItem(organizationStorageKey, JSON.stringify(createOrganizationSeed()))
})
const markup = () => renderToStaticMarkup(createElement(PreferenceProvider, null, createElement(AuthProvider, null, createElement(App))))
async function render(page, email = 'hq@tradevia.demo') {
  const user = await registerAccount({ name: '商品管理验收', email, password: 'Demo123456' }); saveSession(user, false); location.hash = `#${page}`
  return { html: markup(), user }
}
test('all three catalog menus have a single compact header and correct active navigation', async () => {
  await render('productCategories')
  for (const [page, title] of [['productCategories', '商品分类'], ['products', '商品'], ['priceLists', '价目表']]) {
    location.hash = `#${page}`; const html = markup()
    assert.match(html, /商品管理/); assert.equal((html.match(/<h1>/g) ?? []).length, 1)
    assert.match(html, new RegExp(`<h1>${title}</h1>`)); assert.match(html, new RegExp(`href="#${page}"[^>]* aria-current="page"`))
    assert.doesNotMatch(html, /当前组织暂无该模块的业务数据|class="page-heading"/)
  }
})
test('category tree provides same-level and child creation with brand, tax and required-distribution fields', async () => {
  const { html } = await render('productCategories')
  for (const text of ['新建同级', '新建下级', '所属品牌', '默认税率', '必铺品项', '最多两级', '棒冰', '甜筒', '收起冰淇淋']) assert.ok(html.includes(text), text)
  assert.match(html, /class="catalog-category-name child"/)
})
test('product list restores saved edits and lists SKU, units, pack, pricing and status', async () => {
  const state = createCatalogSeed('hani'); state.products[0].name = '保存后的新名称'; state.products[0].status = '停售'
  localStorage.setItem(catalogStorageKey('hani'), JSON.stringify(state))
  const { html } = await render('products')
  for (const text of ['保存后的新名称', 'SKU-001', '1 箱 = 24 支', '标准零售价', '最低售价', '停售', '保质期', '新建商品']) assert.ok(html.includes(text), text)
})
test('read-only dealer sees inherited goods and applicable prices without maintenance or unrelated exclusive pricing', async () => {
  const state = createCatalogSeed('hani'); const other = { ...structuredClone(state.lists[0]), id: 'exclusive-other', code: 'PL-OTHER', name: '吕宋客户专属底价', scope: '指定客户', customers: ['OUT-002'], type: '客户专属价' }; state.lists.push(other)
  localStorage.setItem(catalogStorageKey('hani'), JSON.stringify(state))
  const { html } = await render('priceLists', 'dealer@tradevia.demo')
  assert.match(html, /2026 年冰淇淋标准价/); assert.match(html, /仅查看/)
  assert.doesNotMatch(html, /吕宋客户专属底价|新建价目表|>编辑<\/button>|>停用<\/button>|操作记录/)
  location.hash = '#products'; const products = markup()
  assert.match(products, /哈尼香草冰淇淋棒/); assert.doesNotMatch(products, /新建商品|>下架<\/button>|>删除<\/button>/)
})
test('tenant switching cannot restore another tenant catalog and broken storage stays intact', async () => {
  const { user } = await render('products')
  sessionStorage.setItem(`tradevia-tenant-${user.id}`, 'island'); const html = markup()
  assert.match(html, /暂无数据/); assert.doesNotMatch(html, /SKU-001|哈尼香草冰淇淋棒/)
  sessionStorage.setItem(`tradevia-tenant-${user.id}`, 'hani'); localStorage.setItem(catalogStorageKey('hani'), 'broken')
  const broken = markup(); assert.match(broken, /原数据已保留/); assert.equal(localStorage.getItem(catalogStorageKey('hani')), 'broken')
})
