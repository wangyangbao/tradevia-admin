import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyRouteChange, initialVisitRoutes, isVisitRoute, nextRouteId, readVisitRoutes, routeConflicts, routeStorageKey } from '../src/lib/visit-routes.ts'

test('sample plans are valid and copies do not mutate the original', () => {
  const routes = initialVisitRoutes()
  assert.equal(routes.length, 4)
  assert.ok(routes.every(isVisitRoute))
  routes[0].outletIds.length = 0
  assert.equal(initialVisitRoutes()[0].outletIds.length, 2)
  assert.equal(nextRouteId(routes), 'RT-0005')
})

test('shared allocations preserve other shared routes', () => {
  const routes = initialVisitRoutes()
  const route = { ...routes[0], id: 'RT-0005', executorId: 'EMP-005', name: 'Shared trial' }
  assert.deepEqual(routeConflicts(routes, route), [])
  const next = applyRouteChange(routes, route)
  assert.equal(next.filter(item => item.outletIds.includes('OUT-001')).length, 2)
  assert.deepEqual(next.find(item => item.id === routes[0].id), routes[0])
})

test('exclusive transfers remove only overlapping outlets from every other route', () => {
  const seed = initialVisitRoutes()
  const shared = { ...seed[0], id: 'RT-0005', name: 'Shared trial' }
  const routes = applyRouteChange(seed, shared)
  const exclusive = { ...shared, id: 'RT-0006', name: 'Exclusive trial', policy: 'exclusive', outletIds: ['OUT-001'] }
  assert.equal(routeConflicts(routes, exclusive).length, 2)
  const next = applyRouteChange(routes, exclusive)
  assert.equal(next.filter(item => item.outletIds.includes('OUT-001')).length, 1)
  assert.deepEqual(next.find(item => item.id === 'RT-0001').outletIds, ['OUT-004'])
  assert.deepEqual(next.find(item => item.id === 'RT-0005').outletIds, ['OUT-004'])
  assert.deepEqual(next.find(item => item.id === 'RT-0002'), seed[1])
  assert.deepEqual(seed[0].outletIds, ['OUT-001', 'OUT-004'])
})

test('shared allocations cannot take outlets from exclusive routes, including paused routes', () => {
  const routes = initialVisitRoutes()
  routes[1].status = 'paused'
  const route = { ...routes[1], id: 'RT-0005', name: 'Blocked shared trial', policy: 'shared' }
  assert.equal(routeConflicts(routes, route).length, 1)
  assert.throws(() => applyRouteChange(routes, route), /Exclusive outlet conflict/)
})

test('editing a route does not conflict with its own allocation', () => {
  const routes = initialVisitRoutes()
  const route = { ...routes[1], days: [2, 4], ownerId: 'EMP-006' }
  assert.deepEqual(routeConflicts(routes, route), [])
  const next = applyRouteChange(routes, route)
  assert.equal(next.length, routes.length)
  assert.deepEqual(next[1].days, [2, 4])
  assert.deepEqual(next[1].outletIds, ['OUT-002'])
})

test('route validation enforces recurrence dates and required fields', () => {
  const route = initialVisitRoutes()[0]
  for (const invalid of [{ days: [] }, { days: [0] }, { days: [8] }, { days: [1.5] }, { days: [1, 1] }, { name: ' ' }, { name: 'a'.repeat(41) }, { executorId: '' }, { ownerId: 'unknown' }]) {
    assert.equal(isVisitRoute({ ...route, ...invalid }), false, JSON.stringify(invalid))
  }
  assert.equal(isVisitRoute({ ...route, frequency: 'monthly', days: [1, 29, 31] }), true)
  assert.equal(isVisitRoute({ ...route, frequency: 'monthly', days: [32] }), false)
})

test('allocations reject inactive, unknown, duplicate and cross-region outlets', () => {
  const route = initialVisitRoutes()[0]
  for (const outletIds of [['OUT-008'], ['unknown'], ['OUT-001', 'OUT-001'], ['OUT-005']]) {
    assert.equal(isVisitRoute({ ...route, outletIds }), false)
    assert.throws(() => applyRouteChange(initialVisitRoutes(), { ...route, outletIds }), /Invalid route/)
  }
  assert.equal(isVisitRoute({ ...route, executorId: 'EMP-004' }), false)
  assert.equal(isVisitRoute({ ...route, outletIds: [] }), true)
})

test('browser persistence restores plans and recovers safely from corrupt data', () => {
  const values = new Map()
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const routes = initialVisitRoutes()
  routes[0].name = 'Saved visit plan'
  localStorage.setItem(routeStorageKey, JSON.stringify(routes))
  assert.deepEqual(readVisitRoutes(), routes)
  for (const value of ['broken JSON', '{}', JSON.stringify([{ id: 'bad' }]), JSON.stringify([...routes, routes[0]]), JSON.stringify([...routes, { ...routes[0], id: 'RT-0005', policy: 'exclusive' }])]) {
    localStorage.setItem(routeStorageKey, value)
    assert.deepEqual(readVisitRoutes(), initialVisitRoutes())
  }
  localStorage.setItem(routeStorageKey, '[]')
  assert.deepEqual(readVisitRoutes(), [])
  globalThis.localStorage = { getItem() { throw new Error('Storage unavailable') } }
  assert.deepEqual(readVisitRoutes(), initialVisitRoutes())
  delete globalThis.localStorage
})
