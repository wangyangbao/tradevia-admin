import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { createOrganizationSeed, getScope } from '../src/lib/organization.ts'
import { blankAction, blankRule, blankType, configVisible, createFieldSeed, fieldStorageKey, readFieldwork, removeFieldConfig, resolveFieldRules, reviewFieldVisit, saveFieldConfig, templateFields, visitSummary } from '../src/lib/fieldwork.ts'
const org = createOrganizationSeed(), scope = getScope(org, { email: 'hq@tradevia.demo' }, 'hani')
let state
beforeEach(() => { const map = new Map(); globalThis.localStorage = { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v) }; state = createFieldSeed('hani') })
const action = (patch = {}) => ({ ...blankAction('hq', 'photo'), code: 'ACT-NEW', name: '测试拍照', ...patch })
const type = (patch = {}) => ({ ...blankType('hq'), code: 'TYPE-NEW', name: '测试类型', steps: [{ actionId: 'fa-photo', required: true, allowSkip: false }], ...patch })
const rule = (patch = {}) => ({ ...blankRule('hq'), code: 'RULE-NEW', name: '测试规则', typeId: 'ft-standard', ...patch })
const save = (kind,row,s = state,sc = scope) => saveFieldConfig(s,kind,row,org,sc)
test('一期仅三个动作类别，四种上报模板且所有种子配置通过业务校验', () => {
  assert.deepEqual(state.actions.map(a => a.kind), ['photo','report','order'])
  for (const [kind, rows] of [['actions',state.actions],['types',state.types],['rules',state.rules]]) for (const row of rows) assert.doesNotThrow(() => save(kind,row))
  for (const name of ['陈列上报','销售上报','库存上报','自定义配置']) assert.ok(templateFields(name).length)
  assert.equal(createFieldSeed('island').visits.length,0)
})
test('编码不可重复或更改，动作类别不可更改，照片张数校验', () => {
  assert.throws(() => save('actions', action({ code:'ACT-001' })),/编码已存在/)
  assert.throws(() => save('actions', { ...state.actions[0], code:'CHANGED' }),/不可修改/)
  assert.throws(() => save('actions', { ...state.actions[0], kind:'report' }),/类别不可修改/)
  assert.throws(() => save('actions', action({ photo:{ min:3,max:2 } })),/最多照片数/)
  assert.throws(() => save('actions', action({ photo:{ min:1.5,max:3 } })),/最少照片数/)
})
test('自定义竞品上报支持字段，拦截空模板、重名字段与无效单选项', () => {
  const a = action({ kind:'report', report:{ template:'自定义配置', fields:[{ id:'brand',label:'竞品品牌',kind:'文本',required:true,options:'' },{ id:'price',label:'零售价',kind:'数字',required:true,options:'' }] } })
  assert.equal(save('actions',a).actions.at(-1).report.fields.length,2)
  assert.throws(() => save('actions',{ ...a,report:{ ...a.report,fields:[] } }),/1–20/)
  assert.throws(() => save('actions',{ ...a,report:{ ...a.report,fields:[a.report.fields[0],a.report.fields[0]] } }),/不能重复/)
  assert.throws(() => save('actions',{ ...a,report:{ ...a.report,fields:[{ ...a.report.fields[0],kind:'单选',options:'是,是' }] } }),/至少需要两个/)
})
test('外勤类型强制非空且不重复，必做不可跳过，同组织默认类型唯一', () => {
  assert.throws(() => save('types',type({ steps:[] })),/至少选择/)
  assert.throws(() => save('types',type({ steps:[{ actionId:'fa-photo',required:true,allowSkip:true }] })),/必做动作/)
  assert.throws(() => save('types',type({ isDefault:true })),/已有默认类型/)
  assert.throws(() => save('types',{ ...state.types[0],active:false }),/默认类型/)
  const s = structuredClone(state); s.actions[0].active = false
  assert.throws(() => save('types',type(),s),/停用或不适用/)
})
test('停用与删除保护引用关系，未引用停用配置允许删除', () => {
  assert.throws(() => save('actions',{ ...state.actions[0],active:false }),/外勤类型/)
  assert.throws(() => removeFieldConfig(state,'actions','fa-photo',org,scope),/先停用/)
  const row = action({ active:false }), next = save('actions',row)
  assert.equal(removeFieldConfig(next,'actions',row.id,org,scope).actions.length,state.actions.length)
  const stopped = structuredClone(state); stopped.actions[0].active=false
  assert.throws(() => removeFieldConfig(stopped,'actions','fa-photo',org,scope),/仍被引用/)
})
test('经销商只维护本级配置，上级共享配置只读，成员禁止写入', () => {
  const dealer = getScope(org,{ email:'dealer@tradevia.demo' },'hani')
  assert.equal(configVisible('hq',org,dealer),true)
  assert.equal(configVisible('dealer-lz',org,dealer),false)
  assert.throws(() => save('actions',action(),state,dealer),/权限/)
  assert.doesNotThrow(() => save('actions',action({unitId:'dealer-mm'}),state,dealer))
  const member = getScope(org,{ email:'staff6@tradevia.demo' },'hani')
  assert.throws(() => save('actions',action({unitId:'dealer-mm'}),state,member),/权限/)
})
test('规则校验组织人员交集、日期、半径、签到时间与停留区间', () => {
  assert.throws(() => save('rules',rule({units:[]})),/业务单元/)
  assert.throws(() => save('rules',rule({units:['dealer-mm'],people:['s-dealer-lz']})),/指定人员/)
  assert.throws(() => save('rules',rule({radius:49})),/签到半径/)
  assert.throws(() => save('rules',rule({timeStart:'19:00',timeEnd:'18:00'})),/开始时间/)
  assert.throws(() => save('rules',rule({start:'2027-01-01',end:'2026-11-01'})),/起止日期/)
  assert.throws(() => save('rules',rule({minStay:30,maxStay:20})),/最长停留/)
})
test('多规则按人员与分类命中，约束合并取严，动作必做取并集', () => {
  const extra = type({ id:'ft-extra',steps:[{actionId:'fa-order',required:true,allowSkip:false}] })
  let next = save('types',extra)
  next = save('rules',rule({ typeId:extra.id,units:['dealer-mm'],people:['s-dealer-mm'],categories:['cat-a'],radius:60,minStay:15,maxStay:30,timeStart:'09:00',timeEnd:'16:00',allowException:false,offline:false,priority:99 }),next)
  const resolved = resolveFieldRules(next,org,'s-dealer-mm','cat-a','2026-11-10')
  assert.equal(resolved.rules.length,2); assert.equal(resolved.typeName,'测试类型'); assert.equal(resolved.radius,60); assert.equal(resolved.minStay,15); assert.equal(resolved.maxStay,30); assert.equal(resolved.timeStart,'09:00'); assert.equal(resolved.offline,false); assert.equal(resolved.allowException,false)
  assert.equal(resolved.steps.find(a => a.actionId==='fa-order').required,true)
  assert.equal(resolveFieldRules(next,org,'s-dealer-mm','cat-b','2026-11-10').rules.length,1)
  assert.equal(resolveFieldRules(next,org,'s-dealer-pasig','cat-a','2026-11-10').rules.length,1)
})
test('规则冲突可试算发现，失效规则使用上级默认类型兜底', () => {
  const next = save('rules',rule({minStay:90,maxStay:100}))
  assert.throws(() => resolveFieldRules(next,org,'s-dealer-mm','cat','2026-11-10'),/冲突/)
  const expired = resolveFieldRules(state,org,'s-dealer-mm','cat','2028-11-10')
  assert.equal(expired.rules.length,0); assert.equal(expired.typeName,'标准访销拜访')
  const noDefault = structuredClone(state); noDefault.types[0].isDefault=false
  assert.equal(resolveFieldRules(noDefault,org,'s-dealer-mm','cat','2028-11-10'),null)
})
test('异常复核改变有效数，保留异常率、执行快照和原始事实', () => {
  const original = state.visits.find(v=>v.flags.length && v.status==='已完成'), before = visitSummary(state.visits)
  const next = reviewFieldVisit(state,original.id,'确认有效','核对现场情况，确认有效',org,scope)
  const after = visitSummary(next.visits)
  assert.equal(after.effective,before.effective+1); assert.equal(after.abnormal,before.abnormal); assert.equal(after.pending,before.pending-1)
  assert.deepEqual(next.visits.find(v=>v.id===original.id).flags,original.flags)
  assert.equal(next.visits.find(v=>v.id===original.id).constraint,original.constraint)
  assert.throws(() => reviewFieldVisit(next,original.id,'确认有效','再次复核',org,scope),/尚未处理/)
  assert.throws(() => reviewFieldVisit(state,original.id,'确认有效','',org,scope),/复核说明/)
  const repeated=structuredClone(state); repeated.visits.find(v=>v.id===original.id).flags=['重复拜访']
  assert.throws(() => reviewFieldVisit(repeated,original.id,'确认有效','检查',org,scope),/重复拜访/)
})
test('浏览器保存恢复、租户隔离，损坏数据保留原始内容', () => {
  localStorage.setItem(fieldStorageKey('hani'),JSON.stringify(state)); assert.equal(readFieldwork('hani').actions.length,3); assert.equal(readFieldwork('island').actions.length,0)
  const broken='{"version":1}'; localStorage.setItem(fieldStorageKey('hani'),broken)
  assert.throws(() => readFieldwork('hani'),/读取失败/); assert.equal(localStorage.getItem(fieldStorageKey('hani')),broken)
})
