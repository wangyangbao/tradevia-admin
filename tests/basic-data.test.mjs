import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { addArchiveRate, archiveStorageKey, basicPages, canMaintainArchives, createArchiveSeed, currentRate, readArchives, referenceCount, removeArchive, saveArchive, toggleArchive } from '../src/lib/basic-data.ts'
import { createOrganizationSeed, getScope } from '../src/lib/organization.ts'
let state, org, scope
const row = code => state.rows.find(r => r.code === code)
const edit = (code, values) => ({ ...structuredClone(row(code)), values: { ...row(code).values, ...values } })
const newCategory = (id, parentId) => ({ ...structuredClone(row('ICE')), id, code: id, name: id, en: id, refs: 0, values: { ...row('ICE').values, parentId } })
beforeEach(() => {
  org = createOrganizationSeed(); scope = getScope(org, { email: 'hq@tradevia.demo', demo: false }, 'hani'); state = createArchiveSeed('hani')
  const map = new Map(); globalThis.localStorage = { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v) }
})
test('all nine archive types are present and seeds satisfy save validation', () => {
  assert.equal(basicPages.length, 9)
  for (const kind of basicPages) assert.ok(state.rows.some(r => r.kind === kind))
  for (const record of state.rows) assert.doesNotThrow(() => saveArchive(state, record, org, scope), `${record.kind}:${record.code}`)
})
test('headquarters alone maintains; division, region, dealer and members can never write', () => {
  assert.equal(canMaintainArchives(org, scope), true)
  for (const email of ['division@tradevia.demo', 'region@tradevia.demo', 'dealer@tradevia.demo', 'staff6@tradevia.demo']) {
    const other = getScope(org, { email, demo: false }, 'hani')
    assert.equal(canMaintainArchives(org, other), false)
    assert.throws(() => saveArchive(state, row('BOX'), org, other), /仅总部/)
    assert.throws(() => toggleArchive(state, row('BOX').id, org, other), /仅总部/)
    assert.throws(() => removeArchive(state, row('BOX').id, org, other), /仅总部/)
    assert.throws(() => addArchiveRate(state, row('USD').id, 60, '2026-11-10', org, other), /仅总部/)
  }
  assert.equal(canMaintainArchives(org, null), false)
})
test('separate tenant storage does not expose Hani brands or categories', () => {
  localStorage.setItem(archiveStorageKey('hani'), JSON.stringify(state))
  const other = readArchives('island')
  assert.equal(other.rows.some(r => r.kind === 'brands'), false)
  assert.equal(other.rows.some(r => r.kind === 'channels'), false)
  assert.ok(other.rows.some(r => r.code === 'PHP'))
  assert.equal(readArchives('hani').rows.length, state.rows.length)
})
test('corrupt persisted data fails without overwriting the original', () => {
  const key = archiveStorageKey('hani')
  for (const raw of ['broken', '{"version":1,"rows":[]}']) {
    localStorage.setItem(key, raw); assert.throws(() => readArchives('hani'), /读取失败/)
    assert.equal(localStorage.getItem(key), raw)
  }
})
test('code/name uniqueness, code immutability, required names and numeric limits are enforced', () => {
  assert.throws(() => saveArchive(state, { ...row('BOX'), code: 'NEW' }, org, scope), /编码不可修改/)
  assert.throws(() => saveArchive(state, { ...row('BOX'), id: 'new', code: 'PCS', name: '新单位', en: 'New unit' }, org, scope), /已存在/)
  assert.throws(() => saveArchive(state, { ...row('BOX'), name: '支' }, org, scope), /已存在/)
  assert.throws(() => saveArchive(state, { ...row('BOX'), en: ' ' }, org, scope), /填写中英文/)
  assert.throws(() => saveArchive(state, { ...row('BOX'), name: '😀' }, org, scope), /表情/)
  assert.throws(() => saveArchive(state, { ...row('BOX'), sort: NaN }, org, scope), /排序号/)
  assert.throws(() => saveArchive(state, edit('TRAD', { creditDays: 91 }), org, scope), /默认账期/)
  assert.throws(() => saveArchive(state, edit('TRAD', { creditDays: '' }), org, scope), /请填写/)
})
test('integer conversion, base/type checks and used-unit locks preserve inventory meaning', () => {
  assert.throws(() => saveArchive(state, edit('CTN', { factor: 12 }), org, scope), /已被使用/)
  assert.throws(() => saveArchive(state, edit('CTN', { factor: 0.5 }), org, scope), /正|整数/)
  assert.throws(() => saveArchive(state, edit('BAG', { base: false, baseId: row('CTN').id }), org, scope), /基本单位/)
  assert.throws(() => saveArchive(state, edit('BAG', { base: false, baseId: row('PCS').id, type: '重量单位' }), org, scope), /同类型/)
  const next = saveArchive(state, edit('BAG', { base: true, factor: 99 }), org, scope)
  assert.equal(next.rows.find(r => r.code === 'BAG').values.factor, 1)
  assert.throws(() => toggleArchive(state, row('PCS').id, org, scope), /启用档案引用/)
})
test('referenced records cannot be deleted and deleted codes cannot be reused', () => {
  assert.ok(referenceCount(state, row('ICE')) > 0)
  assert.throws(() => removeArchive(state, row('ICE').id, org, scope), /引用/)
  assert.throws(() => removeArchive(state, row('CTN').id, org, scope), /引用/)
  const saved = structuredClone(row('BOX'))
  state = removeArchive(state, saved.id, org, scope)
  assert.equal(state.rows.some(r => r.id === saved.id), false)
  assert.throws(() => saveArchive(state, { ...saved, id: 'new-box' }, org, scope), /不可复用/)
})
test('brand stop requires selling products to be removed; division must belong to this tenant', () => {
  assert.throws(() => toggleArchive(state, row('HANI').id, org, scope), /6 个在售商品/)
  assert.throws(() => saveArchive(state, edit('HANI', { divisionId: 'food' }), org, scope), /已被使用/)
  assert.throws(() => saveArchive(state, edit('HANI-SELECT', { divisionId: 'island-hq' }), org, scope), /不存在/)
  state = toggleArchive(state, row('HANI-SELECT').id, org, scope)
  assert.equal(row('HANI-SELECT').active, false)
})
test('classification detects cycles and rejects a move that makes existing descendants too deep', () => {
  assert.throws(() => saveArchive(state, edit('ICE', { parentId: row('STICK').id }), org, scope), /下级/)
  assert.throws(() => saveArchive(state, newCategory('LEVEL3', row('STICK').id), org, scope), /2 级/)
  state = saveArchive(state, newCategory('ROOT2', ''), org, scope)
  assert.throws(() => saveArchive(state, edit('ICE', { parentId: row('ROOT2').id }), org, scope), /2 级/)
})
test('outlet child inherits parent channel and maximum depth is two', () => {
  const record = { ...structuredClone(row('KEY-SARI')), id: 'CHILD', code: 'CHILD', name: '新子分类', en: 'New child', values: { ...row('KEY-SARI').values, channelId: row('MODERN').id } }
  state = saveArchive(state, record, org, scope)
  assert.equal(row('CHILD').values.channelId, row('TRAD').id)
  assert.throws(() => saveArchive(state, edit('CHILD', { parentId: row('KEY-SARI').id }), org, scope), /2 级/)
  assert.throws(() => saveArchive(state, edit('SARI', { channelId: row('MODERN').id }), org, scope), /子分类/)
})
test('stop checks active dependent archives; restart rejects a disabled channel', () => {
  assert.throws(() => toggleArchive(state, row('TRAD').id, org, scope), /启用档案引用/)
  state = toggleArchive(state, row('KEY-SARI').id, org, scope)
  state = toggleArchive(state, row('SARI').id, org, scope)
  state = toggleArchive(state, row('TRAD').id, org, scope)
  assert.throws(() => toggleArchive(state, row('SARI').id, org, scope), /已停用/)
})
test('PHP stays the sole base currency, cannot stop, delete, change precision or exchange rate', () => {
  assert.throws(() => toggleArchive(state, row('PHP').id, org, scope), /本位币/)
  assert.throws(() => removeArchive(state, row('PHP').id, org, scope), /本位币/)
  assert.throws(() => addArchiveRate(state, row('PHP').id, 2, '2026-11-10', org, scope), /辅助币种/)
  assert.throws(() => saveArchive(state, edit('PHP', { precision: 3 }), org, scope), /已被使用|本位币/)
  assert.throws(() => saveArchive(state, edit('USD', { base: true }), org, scope), /不可切换/)
  const eur = { ...structuredClone(row('USD')), id: 'EUR', code: 'EUR', name: '欧元', en: 'Euro', values: { ...row('USD').values, base: true, symbol: '€' } }
  state = saveArchive(state, eur, org, scope)
  assert.equal(row('EUR').values.base, false)
  assert.equal(state.rows.filter(r => r.kind === 'currencies' && r.values.base).length, 1)
})
test('rates use the effective day, preserve historical snapshots and never overwrite a date', () => {
  const id = row('USD').id
  state = addArchiveRate(state, id, 59.125678, '2026-11-10', org, scope)
  state = addArchiveRate(state, id, 60.1, '2026-12-01', org, scope)
  assert.equal(currentRate(state, id, '2026-11-09').rate, 58.25)
  assert.equal(currentRate(state, id, '2026-11-10').rate, 59.125678)
  assert.equal(currentRate(state, id, '2026-12-01').rate, 60.1)
  assert.equal(currentRate(state, id, '2026-10-01'), undefined)
  assert.throws(() => addArchiveRate(state, id, 61, '2026-11-10', org, scope), /不可覆盖/)
  assert.throws(() => saveArchive(state, edit('USD', { rate: 61 }), org, scope), /维护汇率/)
})
test('rates reject invalid dates, zero, nonfinite and excessive precision', () => {
  for (const value of [0, -1, NaN, Infinity, 12.1234567]) assert.throws(() => addArchiveRate(state, row('USD').id, value, '2026-11-10', org, scope), /汇率/)
  assert.throws(() => addArchiveRate(state, row('USD').id, 60, '2026-02-30', org, scope), /有效/)
  state = toggleArchive(state, row('USD').id, org, scope)
  assert.throws(() => addArchiveRate(state, row('USD').id, 60, '2026-11-10', org, scope), /辅助币种/)
})
test('credit type determines credit check and PNG uploads enforce format and size', () => {
  const next = saveArchive(state, edit('CREDIT', { credit: false }), org, scope)
  assert.equal(next.rows.find(r => r.code === 'CREDIT').values.credit, true)
  assert.throws(() => saveArchive(state, edit('HANI-SELECT', { logo: 'data:image/svg+xml,bad' }), org, scope), /PNG/)
  assert.throws(() => saveArchive(state, edit('HANI-SELECT', { logo: 'data:image/png;base64,' + 'A'.repeat(1400001) }), org, scope), /PNG/)
})
