import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { Window } from 'happy-dom'
import { createServer } from 'vite'
import { registerAccount, saveSession } from '../src/lib/auth.ts'
import { createOrganizationSeed, organizationStorageKey } from '../src/lib/organization.ts'

// Component interaction checks in a simulated DOM; this does not launch or control a browser.
const dom = new Window({ url: 'http://localhost/#fieldActions' })
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
let server, App, PreferenceProvider, AuthProvider, root, host

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
  window.scrollTo = () => {}
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
const fieldKey = 'tradevia-fieldwork-v1:hani'
const choose = async (label,value) => { const el=document.querySelector(`select[aria-label="${label}"]`); assert.ok(el); await act(async()=>{ el.value=value; el.dispatchEvent(new Event('change',{bubbles:true})) }) }
const fill = async (el,value) => { assert.ok(el); await act(async()=>{ Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,'value').set.call(el,value); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})) }) }
const submit = async within => { await act(async()=>within.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))) }
test('外勤六个菜单同组，原线路地址可用；本模块仅一个紧凑页头',async()=>{
  await mount('#fieldActions')
  assert.equal(document.querySelector('h1').textContent,'外勤动作')
  const group=document.querySelector('#nav-children-fieldworkNav')
  for(const page of ['fieldActions','fieldTypes','fieldRules','visitRoutes','fieldVisits','fieldStatistics']) assert.ok(group.querySelector(`a[href="#${page}"]`))
  assert.equal(group.querySelector('a[href="#visitRoutes"]').textContent,'线路规划')
  assert.equal(document.querySelectorAll('h1').length,1)
  assert.equal(document.querySelectorAll('.management-filters').length,1)
})
test('新增拍照动作仅三个选项，可保存并立即查看，刷新数据可恢复',async()=>{
  await mount('#fieldActions'); await click(button('新增外勤动作'))
  const chooser=document.querySelector('.fw-chooser'); assert.equal(chooser.querySelectorAll('.fw-choice-grid>button').length,3)
  await click([...chooser.querySelectorAll('button')].find(b=>b.textContent.includes('拍照动作')))
  const editor=document.querySelector('.fw-editor'), inputs=editor.querySelectorAll('input')
  await fill(inputs[0],'ACT-NEW'); await fill(inputs[1],'门头照片测试')
  assert.doesNotMatch(editor.textContent,/照片清晰度|布局与存储/)
  await submit(editor)
  assert.equal(document.querySelector('.fw-editor'),null)
  assert.match(drawer().textContent,/门头照片测试|固定包含时间/)
  assert.equal(JSON.parse(localStorage.getItem(fieldKey)).actions.at(-1).name,'门头照片测试')
})
test('规则试算输出人员命中结果，变更输入后清空旧结果',async()=>{
  await mount('#fieldRules'); await click(button('规则试算'))
  await choose('试算人员','s-dealer-mm'); await choose('试算分类','outletCategories-SARI')
  await click(button('开始试算'))
  assert.match(document.querySelector('.fw-preview-result').textContent,/RULE-001|100 米|标准访销拜访/)
  await choose('试算人员','s-dealer-lz')
  assert.equal(document.querySelector('.fw-preview-result'),null)
})
test('拜访详情原位打开，异常可复核并保存，异常标记不被覆盖',async()=>{
  await mount('#fieldVisits')
  await choose('状态筛选','待复核')
  assert.equal(document.querySelectorAll('tbody tr').length,2)
  await click(button('查看详情'))
  assert.match(drawer().textContent,/执行时规则快照|待复核|动作执行明细/)
  await fill(drawer().querySelector('textarea'),'已电话核实，现场情况属实')
  await click(button('保存复核结果',drawer()))
  assert.match(drawer().textContent,/确认有效|已电话核实/)
  const reviewed=JSON.parse(localStorage.getItem(fieldKey)).visits.find(v=>v.review)
  assert.equal(reviewed.review.result,'确认有效'); assert.ok(reviewed.flags.length)
  await click(drawer().querySelector('[aria-label="关闭详情"]'))
  assert.equal(document.querySelector('select[aria-label="状态筛选"]').value,'待复核')
  assert.equal(document.querySelectorAll('tbody tr').length,1)
})
test('统计能下钻指定人员，拜访查询不混入其他人员',async()=>{
  await mount('#fieldVisits?person=s-dealer-mm')
  const table=document.querySelector('tbody').textContent
  assert.match(table,/唐雨/); assert.doesNotMatch(table,/陆川|苏晴/)
  assert.equal(document.querySelector('select[aria-label="人员筛选"]').value,'s-dealer-mm')
})
test('经销商能查看共享配置，无法改写上级配置，拜访仅本级范围',async()=>{
  await mount('#fieldActions','dealer@tradevia.demo')
  assert.match(document.querySelector('tbody').textContent,/门头与陈列拍照/)
  assert.equal(button('编辑',document.querySelector('tbody')),undefined)
  assert.ok(button('新增外勤动作'))
})
test('上报四模板可切换，自定义字段保存后用于类型组装',async()=>{
  await mount('#fieldActions'); await click(button('新增外勤动作'))
  const chooser=document.querySelector('.fw-chooser')
  await click([...chooser.querySelectorAll('button')].find(b=>b.textContent.includes('数据上报')))
  let editor=document.querySelector('.fw-editor')
  assert.equal(editor.querySelectorAll('.fw-template-grid button').length,4)
  await click(button('自定义配置',editor))
  const inputs=editor.querySelectorAll('input')
  await fill(inputs[0],'COMPETITOR'); await fill(inputs[1],'竞品价格采集')
  await fill(editor.querySelector('[aria-label="字段 1 名称"]'),'竞品品牌')
  await click(button('添加字段',editor))
  await fill(editor.querySelector('[aria-label="字段 2 名称"]'),'竞品零售价')
  await choose('字段 2 类型','数字')
  await submit(editor)
  assert.equal(document.querySelector('.fw-editor'),null)
  const saved=JSON.parse(localStorage.getItem(fieldKey)).actions.at(-1)
  assert.equal(saved.report.template,'自定义配置'); assert.equal(saved.report.fields[1].kind,'数字')
})
test('订货动作三步配置和车销模式保存后均保留',async()=>{
  await mount('#fieldActions'); await click(button('新增外勤动作'))
  await click([...document.querySelector('.fw-chooser').querySelectorAll('button')].find(b=>b.textContent.includes('订货动作')))
  const editor=document.querySelector('.fw-editor'), inputs=editor.querySelectorAll('input')
  await fill(inputs[0],'VAN-ORDER'); await fill(inputs[1],'随车订货')
  await click([...editor.querySelectorAll('button')].find(b=>b.textContent.includes('车销模式')))
  await click(button('2. 订单确认',editor)); await click(editor.querySelector('.fw-order-step input[type="checkbox"]'))
  await click(button('3. 下单完成',editor)); await click(editor.querySelector('.fw-order-step input[type="checkbox"]'))
  await submit(editor)
  const saved=JSON.parse(localStorage.getItem(fieldKey)).actions.at(-1)
  assert.equal(saved.order.mode,'车销模式'); assert.equal(saved.order.remarkRequired,true); assert.equal(saved.order.print,true)
})
test('类型能添加排序动作，规则范围与人员可配置并保存',async()=>{
  await mount('#fieldTypes'); await click(button('新增外勤类型'))
  let editor=document.querySelector('.fw-editor'), inputs=editor.querySelectorAll('input')
  await fill(inputs[0],'TYPE-PHOTO'); await fill(inputs[1],'门头核查')
  await choose('添加外勤动作','fa-photo'); await click(button('添加动作',editor))
  assert.match(editor.textContent,/到店签到|门头与陈列拍照|离店签退/)
  await submit(editor)
  assert.equal(JSON.parse(localStorage.getItem(fieldKey)).types.at(-1).steps.length,1)
})
test('规则新建有范围校验并可保存',async()=>{
  await mount('#fieldRules'); await click(button('新增外勤规则'))
  const editor=document.querySelector('.fw-editor'), inputs=editor.querySelectorAll('input')
  await fill(inputs[0],'RULE-NEW'); await fill(inputs[1],'重点门店巡查')
  await choose('规则外勤类型','ft-standard')
  await submit(editor)
  assert.equal(document.querySelector('.fw-editor'),null)
  assert.equal(JSON.parse(localStorage.getItem(fieldKey)).rules.at(-1).name,'重点门店巡查')
})
test('统计按门店聚合并生成门店下钻地址，记录页可清除门店筛选',async()=>{
  await mount('#fieldStatistics')
  await choose('统计维度','customer')
  assert.match(document.querySelector('thead').textContent,/门店 \/ 所属组织/)
  const link=document.querySelector('tbody a[href^="#fieldVisits?customer="]')
  assert.ok(link); assert.match(document.querySelector('tbody').textContent,/Aling Nena Store/)
})
test('经销商只能查看本级拜访；普通成员没有复核入口',async()=>{
  await mount('#fieldVisits','staff8@tradevia.demo')
  assert.match(document.querySelector('tbody').textContent,/陆川/)
  assert.doesNotMatch(document.querySelector('tbody').textContent,/唐雨|苏晴/)
  await click(button('查看详情'))
  assert.match(drawer().textContent,/待复核/)
  assert.equal(button('保存复核结果',drawer()),undefined)
})
