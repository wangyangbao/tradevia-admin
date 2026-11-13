import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { createOrganizationSeed, deleteRecord, departmentEnabled, departmentPath, descendants, getScope, membershipsFor, saveDepartment, savePerson, saveUnit, scopedData, toggleRecord, visibleUnits } from '../src/lib/organization.ts'
import { authStorageKeys, changeOwnPassword, loginAccount, readSession, registerAccount, resetManagedPassword, saveSession, updateManagedAccount } from '../src/lib/auth.ts'
let state
const actor = email => ({ email, demo: false })
const scope = email => getScope(state, actor(email), 'hani')
const admin = () => scope('hq@tradevia.demo')
beforeEach(() => {
  state = createOrganizationSeed()
  const storage = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) } }
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage()
})
test('four administrator levels see only their own subtree, including all selectors and employees', () => {
  for (const [email, root, count] of [['hq', 'hq', 10], ['division', 'ice', 6], ['region', 'manila', 3], ['dealer', 'dealer-mm', 1]]) {
    const current = scope(`${email}@tradevia.demo`), data = scopedData(state, current)
    assert.equal(current.unitId, root); assert.equal(data.units.length, count)
    const ids = descendants(state.units.filter(u => u.tenantId === 'hani'), root)
    assert.ok(data.units.every(u => ids.has(u.id)))
    assert.ok(data.people.every(p => ids.has(p.unitId) && p.tenantId === 'hani'))
    assert.ok(data.departments.every(d => ids.has(d.unitId) && d.tenantId === 'hani'))
    if (root !== 'hq') assert.ok(!data.units.some(u => u.id === 'hq'))
  }
  assert.deepEqual(visibleUnits(state, scope('dealer@tradevia.demo')).map(u => u.id), ['dealer-mm'])
})
test('tenant access requires an explicit membership and never inherits another tenant', () => {
  const hq = actor('hq@tradevia.demo'), dealer = actor('dealer@tradevia.demo')
  assert.equal(membershipsFor(state, hq).length, 2)
  const island = getScope(state, hq, 'island')
  assert.deepEqual(visibleUnits(state, island).map(u => u.id), ['island-hq'])
  assert.equal(getScope(state, dealer, 'island'), null)
  assert.equal(getScope(state, actor('new@example.com'), 'hani'), null)
  assert.deepEqual(scopedData(state, null), { units: [], departments: [], people: [] })
})
test('disabled memberships and ancestors immediately revoke scope', () => {
  state.people.find(p => p.email === 'region@tradevia.demo').active = false
  assert.equal(scope('region@tradevia.demo'), null)
  state.units.find(u => u.id === 'ice').active = false
  assert.equal(scope('dealer@tradevia.demo'), null)
})
test('members can read but cannot perform any organization writes', () => {
  const member = scope('staff6@tradevia.demo'), unit = state.units.find(u => u.id === 'dealer-mm')
  assert.equal(member.admin, false)
  assert.equal(visibleUnits(state, member).length, 1)
  assert.throws(() => saveUnit(state, member, { ...unit, name: 'Changed' }), /没有权限/)
  assert.throws(() => toggleRecord(state, member, 'people', 's-dealer-mm', '停用'), /没有权限/)
})
test('administrator cannot edit parents, siblings or foreign tenant records', () => {
  const dealer = scope('dealer@tradevia.demo')
  for (const id of ['hq', 'dealer-pasig', 'island-hq']) {
    assert.throws(() => saveUnit(state, dealer, { ...state.units.find(u => u.id === id), name: '越权' }), /没有权限/)
    assert.throws(() => deleteRecord(state, dealer, 'units', id, '越权'), /没有权限/)
  }
  const foreign = state.people.find(p => p.unitId === 'dealer-pasig')
  assert.throws(() => savePerson(state, dealer, { ...foreign, name: '越权' }), /没有权限/)
})
test('business unit types are sequential, immutable, unique and stop at dealer level', () => {
  const parent = state.units.find(u => u.id === 'manila')
  const row = { ...parent, id: 'new-dealer', parentId: parent.id, level: 4, code: 'NEW-001', name: '新经销商', taxId: 'TIN-123', businessRefs: 0 }
  const next = saveUnit(state, admin(), row)
  assert.equal(next.units.length, state.units.length + 1)
  assert.throws(() => saveUnit(state, admin(), { ...row, level: 3 }), /四个层级/)
  assert.throws(() => saveUnit(state, admin(), { ...row, parentId: 'dealer-mm', level: 5 }), /四个层级/)
  assert.throws(() => saveUnit(state, admin(), { ...row, code: parent.code }), /编码已存在/)
  assert.throws(() => saveUnit(state, admin(), { ...parent, code: 'CHANGED' }), /不可修改/)
  assert.throws(() => saveUnit(state, admin(), { ...row, taxId: '' }), /纳税人/)
})
test('department path selection includes descendants but excludes sibling departments', () => {
  const ids = descendants(state.departments, 'dealer-mm-sales')
  assert.deepEqual([...ids], ['dealer-mm-sales', 'dealer-mm-team'])
  const people = scopedData(state, scope('dealer@tradevia.demo')).people.filter(p => ids.has(p.departmentId))
  assert.deepEqual(people.map(p => p.id), ['s-dealer-mm'])
  assert.equal(departmentPath(state.departments, 'dealer-mm-team'), '销售部 / 渠道一组')
})
test('department rejects cross-unit parent, duplicate code and excessive depth', () => {
  const row = { ...state.departments[0], id: 'new-dept', code: 'NEW-DP', name: '新部门', manager: '', parentId: 'dealer-mm-sales' }
  assert.throws(() => saveDepartment(state, admin(), row), /同一业务单元/)
  assert.throws(() => saveDepartment(state, admin(), { ...row, parentId: null, code: state.departments[0].code }), /重复/)
  let previous = 'hq-sales'
  for (let i = 0; i < 4; i++) { const id = `depth-${i}`; state = saveDepartment(state, admin(), { ...row, id, code: id, name: id, parentId: previous }); previous = id }
  assert.throws(() => saveDepartment(state, admin(), { ...row, parentId: previous }), /五级/)
})
test('disabled parent departments block employee assignment even if the child is enabled', () => {
  state.departments.find(d => d.id === 'dealer-mm-sales').active = false
  assert.equal(departmentEnabled(state, 'dealer-mm-team'), false)
  const person = state.people.find(p => p.id === 's-dealer-mm')
  assert.throws(() => savePerson(state, admin(), { ...person, name: '编辑' }), /部门必须启用/)
})
test('employee transfer updates membership immediately and rejects cross-unit department', () => {
  const person = state.people.find(p => p.id === 's-dealer-mm')
  assert.throws(() => savePerson(state, admin(), { ...person, departmentId: 'hq-sales' }), /属于所选/)
  const next = savePerson(state, admin(), { ...person, unitId: 'dealer-pasig', departmentId: 'dealer-pasig-sales', role: '管理员' })
  const moved = getScope(next, actor(person.email), 'hani')
  assert.equal(moved.unitId, 'dealer-pasig'); assert.equal(moved.admin, true)
  assert.ok(!scopedData(next, scope('dealer@tradevia.demo')).people.some(p => p.id === person.id))
})
test('cannot disable self, delete referenced units or stop a department with active employees', () => {
  assert.throws(() => toggleRecord(state, admin(), 'people', 'p-hq', '测试'), /当前登录/)
  assert.throws(() => deleteRecord(state, admin(), 'units', 'dealer-mm', '测试'), /不可删除/)
  assert.throws(() => deleteRecord(state, admin(), 'departments', 'dealer-mm-sales', '测试'), /下级部门/)
  assert.throws(() => toggleRecord(state, admin(), 'departments', 'dealer-mm-sales', '测试'), /在职人员/)
  assert.throws(() => toggleRecord(state, admin(), 'units', 'manila', '测试'), /在职人员/)
  assert.throws(() => toggleRecord(state, admin(), 'people', 's-dealer-mm', ''), /停用原因/)
})
test('deleting an empty department requires a reason and preserves other records', () => {
  const department = state.departments.find(d => d.id === 'dealer-cebu-team')
  state.people = state.people.filter(p => p.departmentId !== department.id)
  assert.throws(() => deleteRecord(state, admin(), 'departments', department.id, ''), /删除原因/)
  const next = deleteRecord(state, admin(), 'departments', department.id, '无人员的测试部门')
  assert.equal(next.departments.length, state.departments.length - 1)
  assert.equal(next.people.length, state.people.length)
})
test('managed email and phone edits change the real login account; disabling revokes existing sessions', async () => {
  const user = await registerAccount({ name: '员工', email: 'employee@example.com', password: 'Demo123456' })
  updateManagedAccount(user.email, { phone: '+639171234567' })
  assert.equal((await loginAccount('+639171234567', 'Demo123456')).id, user.id)
  saveSession(user, false)
  updateManagedAccount(user.email, { enabled: false })
  assert.equal(readSession(), null)
  await assert.rejects(loginAccount(user.email, 'Demo123456'))
  updateManagedAccount(user.email, { enabled: true, email: 'renamed@example.com' })
  await assert.rejects(loginAccount(user.email, 'Demo123456'))
  assert.equal((await loginAccount('renamed@example.com', 'Demo123456')).id, user.id)
})
test('password reset rejects old credentials and sessions, forces change and never stores plaintext', async () => {
  const user = await registerAccount({ name: '员工', email: 'employee@example.com', password: 'Demo123456' })
  saveSession(user, false)
  const changed = await resetManagedPassword(user.email, 'TempPass123')
  assert.equal(changed.passwordChangeRequired, true)
  assert.equal(readSession(), null)
  await assert.rejects(loginAccount(user.email, 'Demo123456'))
  assert.equal((await loginAccount(user.email, 'TempPass123')).passwordChangeRequired, true)
  await assert.rejects(changeOwnPassword(changed, 'wrong', 'FinalPass123'))
  const final = await changeOwnPassword(changed, 'TempPass123', 'FinalPass123')
  assert.equal(final.passwordChangeRequired, undefined)
  assert.equal((await loginAccount(user.email, 'FinalPass123')).credentialVersion, 2)
  const stored = localStorage.getItem(authStorageKeys.accounts)
  assert.ok(!stored.includes('TempPass123') && !stored.includes('FinalPass123'))
})
