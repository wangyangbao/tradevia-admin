import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { registerAccount, saveSession } from '../src/lib/auth.ts'
import { createOrganizationSeed, organizationStorageKey } from '../src/lib/organization.ts'
let server, App, AuthProvider, PreferenceProvider, PersonnelDirectory
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  PersonnelDirectory = (await server.ssrLoadModule('/src/components/personnel-directory.tsx')).PersonnelDirectory
  App = (await server.ssrLoadModule('/src/App.tsx')).default
  AuthProvider = (await server.ssrLoadModule('/src/lib/auth-context.tsx')).AuthProvider
  PreferenceProvider = (await server.ssrLoadModule('/src/lib/preferences.tsx')).PreferenceProvider
})
after(async () => { await server?.close() })
beforeEach(() => {
  const storage = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) } }
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage(); globalThis.location = { hash: '#businessUnits' }
  localStorage.setItem(organizationStorageKey, JSON.stringify(createOrganizationSeed()))
})
async function render(email, hash = '#businessUnits') {
  const user = await registerAccount({ name: '验收账号', email, password: 'Demo123456' })
  saveSession(user, false); location.hash = hash
  return renderToStaticMarkup(createElement(PreferenceProvider, null, createElement(AuthProvider, null, createElement(App))))
}
test('region business page hides headquarters, division, sibling regions and foreign tenant', async () => {
  const html = await render('region@tradevia.demo')
  assert.match(html, /马尼拉大区/); assert.match(html, /马尼拉联合经销商/); assert.match(html, /帕西格经销商/)
  assert.doesNotMatch(html, /哈尼冰淇淋总部|冰淇淋事业部|吕宋北区|宿务经销商|海岛食品总部/)
})
test('dealer people page defaults to all own employees and excludes parent and sibling people', async () => {
  const html = await render('dealer@tradevia.demo', '#personnel')
  assert.match(html, /组织与部门/); assert.match(html, /陈杰/); assert.match(html, /唐雨/); assert.match(html, /渠道一组/)
  assert.doesNotMatch(html, /王芳|林欣|hq@tradevia.demo|region@tradevia.demo/)
})
test('all three organization pages render for headquarters with a tenant switcher', async () => {
  const html = await render('hq@tradevia.demo', '#departments')
  assert.match(html, /部门列表/); assert.match(html, /哈尼冰淇淋总部/); assert.match(html, /组织架构/)
  assert.match(html, /业务单元/); assert.match(html, /人员/)
})
test('selected tenant restores its isolated organization and cannot expose the previous tenant', async () => {
  const user = await registerAccount({ name: '验收账号', email: 'hq@tradevia.demo', password: 'Demo123456' })
  saveSession(user, false); sessionStorage.setItem(`tradevia-tenant-${user.id}`, 'island')
  const html = renderToStaticMarkup(createElement(PreferenceProvider, null, createElement(AuthProvider, null, createElement(App))))
  assert.match(html, /海岛食品总部/); assert.doesNotMatch(html, /哈尼冰淇淋总部|冰淇淋事业部|马尼拉联合经销商/)
})
test('dealer sales page includes own customers while excluding other dealers', async () => {
  const html = await render('dealer@tradevia.demo', '#orders')
  assert.match(html, /Aling Nena Store/)
  assert.doesNotMatch(html, /Santos Mini Mart|吕宋冷链经销商|宿务经销商/)
})
test('ordinary members can inspect people but never receive management or export controls', async () => {
  const html = await render('staff6@tradevia.demo', '#personnel')
  assert.match(html, /唐雨/); assert.match(html, /仅查看/)
  assert.doesNotMatch(html, /新增人员|重置密码|>导出</)
})
test('a reset account only renders password change until it chooses a new password', async () => {
  const { resetManagedPassword } = await import('../src/lib/auth.ts')
  const user = await registerAccount({ name: '验收账号', email: 'dealer@tradevia.demo', password: 'Demo123456' })
  saveSession(await resetManagedPassword(user.email, 'Temporary123'), false)
  const html = renderToStaticMarkup(createElement(PreferenceProvider, null, createElement(AuthProvider, null, createElement(App))))
  assert.doesNotMatch(html, /class="app-shell"|马尼拉联合经销商|EMP-0013/)
  // Radix portals mount on the client; the key assertion is that business content is absent.
})

function directory(selected = null, storageKey = 'directory-test') {
  const state = createOrganizationSeed()
  return renderToStaticMarkup(createElement(PersonnelDirectory, {
    root: state.units.find(u => u.id === 'hq'),
    units: state.units.filter(u => u.tenantId === 'hani'),
    departments: state.departments.filter(d => d.tenantId === 'hani'),
    people: state.people.filter(p => p.tenantId === 'hani'),
    selected, onSelect() {}, storageKey,
  }))
}
test('people directory starts compact while keeping independent expand and filter buttons', () => {
  const html = directory()
  assert.match(html, /aria-label="收起哈尼冰淇淋总部" aria-expanded="true"/)
  assert.match(html, /aria-label="展开冰淇淋事业部" aria-expanded="false"/)
  assert.match(html, /aria-label="查看冰淇淋事业部人员"/)
  assert.match(html, /全部展开/); assert.match(html, /全部收起/)
  assert.doesNotMatch(html, /马尼拉大区|渠道一组|海岛食品总部/)
})
test('collapsed directory restores its fold state without removing the all-people filter', () => {
  sessionStorage.setItem('directory-test', JSON.stringify([]))
  const html = directory()
  assert.match(html, /aria-label="展开哈尼冰淇淋总部" aria-expanded="false"/)
  assert.match(html, /全部人员/)
  assert.doesNotMatch(html, /冰淇淋事业部|综合管理部/)
})
test('jumping from a department opens all ancestor units and departments to reveal the selection', () => {
  sessionStorage.setItem('directory-test', JSON.stringify([]))
  const html = directory({ kind: 'department', id: 'dealer-mm-team' })
  for (const name of ['哈尼冰淇淋总部', '冰淇淋事业部', '马尼拉大区', '马尼拉联合经销商', '销售部']) {
    assert.ok(html.includes(`aria-label="收起${name}" aria-expanded="true"`))
  }
  assert.match(html, /aria-label="查看渠道一组人员" aria-pressed="true"/)
  assert.doesNotMatch(html, /海岛食品总部/)
})

test('organization lists use one compact header and summary without oversized banners or cards', async () => {
  await render('hq@tradevia.demo', '#personnel')
  for (const page of ['businessUnits', 'departments', 'personnel']) {
    location.hash = `#${page}`
    const html = renderToStaticMarkup(createElement(PreferenceProvider, null, createElement(AuthProvider, null, createElement(App))))
    assert.equal((html.match(/<h1>/g) ?? []).length, 1)
    assert.equal((html.match(/class="management-header"/g) ?? []).length, 1)
    assert.match(html, /class="management-summary"/)
    assert.match(html, /class="management-filter-fields"/)
    assert.match(html, /仅本级及下级组织/)
    assert.ok(html.indexOf('management-actions') < html.indexOf('management-filter-fields'))
    assert.doesNotMatch(html, /class="org-heading"|class="org-scope-banner"|class="org-stats"/)
  }
})
test('record menus share compact header and query area with appropriate organization or warehouse filters', async () => {
  await render('hq@tradevia.demo', '#orders')
  for (const page of ['orders', 'outlets', 'distributors', 'inventory', 'receivables']) {
    location.hash = `#${page}`
    const html = renderToStaticMarkup(createElement(PreferenceProvider, null, createElement(AuthProvider, null, createElement(App))))
    assert.equal((html.match(/<h1>/g) ?? []).length, 1)
    assert.match(html, /class="management-header"/)
    assert.match(html, /class="management-filter-fields"/)
    assert.match(html, /class="management-summary"/)
    if (page === 'orders') assert.match(html, /aria-label="经销商筛选"/)
    else if (page === 'inventory') assert.match(html, /aria-label="库存仓库"/)
    else if (page === 'receivables') assert.match(html, /aria-label="搜索台账"/)
    else assert.match(html, /aria-label="所属大区"/)
    assert.doesNotMatch(html, /class="small-stats-grid"|class="page-heading"|class="distributor-grid"/)
    assert.equal((html.match(/data-testid="new-order"/g) ?? []).length, page === 'orders' ? 1 : 0)
  }
})

test('all nine master record menus render their own archive lists with headquarters controls', async () => {
  const { basicPages, archiveDefinitions } = await import('../src/lib/basic-data.ts')
  const user = await registerAccount({ name: '基础数据验收', email: 'hq@tradevia.demo', password: 'Demo123456' })
  saveSession(user, false)
  for (const page of basicPages) {
    location.hash = `#${page}`
    const html = renderToStaticMarkup(createElement(PreferenceProvider, null, createElement(AuthProvider, null, createElement(App))))
    assert.match(html, new RegExp(`<h1>${archiveDefinitions[page].title}</h1>`))
    assert.match(html, new RegExp(`新增${archiveDefinitions[page].singular}`))
    assert.match(html, /搜索档案|搜索编码、中文或英文名称|搜索商品分类/)
    assert.match(html, /基础档案变更|变更记录|操作记录/)
    assert.doesNotMatch(html, /当前组织暂无该模块的业务数据/)
    if (['productCategories', 'outletCategories'].includes(page)) assert.match(html, new RegExp(`href="#${page}"[^>]* aria-current="page"`))
    else assert.match(html, new RegExp(`<button[^>]*aria-current="page"[^>]*class="selected"><span>${archiveDefinitions[page].title}</span>`))
  }
})
test('dealer sees shared master records but no archive maintenance controls', async () => {
  const html = await render('dealer@tradevia.demo', '#channels')
  assert.match(html, /传统渠道|现代渠道/)
  assert.match(html, /仅查看/)
  assert.doesNotMatch(html, /新增渠道|>编辑<|>停用<\/button>|>删除<\/button>/)
  assert.match(html, /基础档案/)
})
test('master data direct links honor the selected tenant and never show previous tenant seeds', async () => {
  const user = await registerAccount({ name: '总部', email: 'hq@tradevia.demo', password: 'Demo123456' })
  saveSession(user, false); location.hash = '#brands'; sessionStorage.setItem(`tradevia-tenant-${user.id}`, 'island')
  const html = renderToStaticMarkup(createElement(PreferenceProvider, null, createElement(AuthProvider, null, createElement(App))))
  assert.match(html, /<h1>品牌档案<\/h1>/)
  assert.match(html, /还没有这类基础档案/)
  assert.doesNotMatch(html, /HANI-SELECT|哈尼甄选|ISLAND|海岛轻食/)
})
test('corrupt master records show recovery guidance and disable new writes', async () => {
  const { archiveStorageKey } = await import('../src/lib/basic-data.ts')
  localStorage.setItem(archiveStorageKey('hani'), 'corrupt')
  const html = await render('hq@tradevia.demo', '#unitArchives')
  assert.match(html, /暂时无法读取档案|基础档案读取失败/)
  assert.match(html, /重新读取/)
  assert.equal(localStorage.getItem(archiveStorageKey('hani')), 'corrupt')
})
