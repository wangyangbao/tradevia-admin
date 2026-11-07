import { outlets, regions } from './data.ts'
import type { Region } from './data'

export type VisitRoute = {
  id: string
  name: string
  executorId: string
  ownerId: string
  region: Region
  visitType: 'routine' | 'merchandising' | 'collectionVisit'
  frequency: 'weekly' | 'monthly'
  days: number[]
  policy: 'shared' | 'exclusive'
  status: 'enabled' | 'paused'
  outletIds: string[]
}

export const visitStaff = [
  { id: 'EMP-001', name: 'Miguel Santos', initials: 'MS', region: 'manila' },
  { id: 'EMP-002', name: 'Elena Cruz', initials: 'EC', region: 'northLuzon' },
  { id: 'EMP-003', name: 'Rafael Garcia', initials: 'RG', region: 'visayas' },
  { id: 'EMP-004', name: 'Camila Reyes', initials: 'CR', region: 'mindanao' },
  { id: 'EMP-005', name: 'Daniel Ramos', initials: 'DR', region: 'manila' },
  { id: 'EMP-006', name: 'Sofia Mendoza', initials: 'SM', region: 'northLuzon' },
  { id: 'EMP-007', name: 'Isabel Flores', initials: 'IF', region: 'visayas' },
  { id: 'EMP-008', name: 'Gabriel Cruz', initials: 'GC', region: 'mindanao' },
] as const

// Sample positions illustrate the existing demo outlets; they are not verified store addresses.
const positions: Record<string, [number, number]> = {
  'OUT-001': [14.6463, 121.0414],
  'OUT-002': [15.0343, 120.6841],
  'OUT-003': [10.3157, 123.8854],
  'OUT-004': [14.5764, 121.0851],
  'OUT-005': [7.0731, 125.6128],
  'OUT-006': [15.1450, 120.5887],
  'OUT-007': [10.3333, 123.9422],
  'OUT-008': [14.5547, 121.0244],
}

export const visitOutlets = outlets.map(outlet => ({
  ...outlet,
  position: positions[outlet.id],
  salespersonId: ({ 'OUT-004': 'EMP-005', 'OUT-006': 'EMP-006', 'OUT-007': 'EMP-007' } as Record<string, string>)[outlet.id] || visitStaff.find(person => person.region === outlet.region)!.id,
}))
export type VisitOutlet = typeof visitOutlets[number]
export const routeStorageKey = 'tradevia-visit-routes-v1'

const seedRoutes: VisitRoute[] = [
  { id: 'RT-0001', name: 'Manila · Core stores', executorId: 'EMP-001', ownerId: 'EMP-001', region: 'manila', visitType: 'routine', frequency: 'weekly', days: [1, 4], policy: 'shared', status: 'enabled', outletIds: ['OUT-001', 'OUT-004'] },
  { id: 'RT-0002', name: 'Pampanga · Retail', executorId: 'EMP-002', ownerId: 'EMP-001', region: 'northLuzon', visitType: 'merchandising', frequency: 'weekly', days: [2], policy: 'exclusive', status: 'enabled', outletIds: ['OUT-002'] },
  { id: 'RT-0003', name: 'Cebu · Neighborhood', executorId: 'EMP-003', ownerId: 'EMP-003', region: 'visayas', visitType: 'routine', frequency: 'monthly', days: [5, 20], policy: 'shared', status: 'enabled', outletIds: ['OUT-003', 'OUT-007'] },
  { id: 'RT-0004', name: 'Davao · Key accounts', executorId: 'EMP-004', ownerId: 'EMP-004', region: 'mindanao', visitType: 'collectionVisit', frequency: 'weekly', days: [5], policy: 'shared', status: 'paused', outletIds: [] },
]

export function initialVisitRoutes(): VisitRoute[] {
  return structuredClone(seedRoutes)
}

export function isVisitRoute(value: unknown): value is VisitRoute {
  if (!value || typeof value !== 'object') return false
  const r = value as VisitRoute
  return typeof r.id === 'string' && /^RT-[A-Za-z0-9-]+$/.test(r.id)
    && typeof r.name === 'string' && r.name.trim().length > 0 && r.name.length <= 40
    && visitStaff.some(person => person.id === r.executorId && person.region === r.region)
    && visitStaff.some(person => person.id === r.ownerId)
    && regions.includes(r.region)
    && ['routine', 'merchandising', 'collectionVisit'].includes(r.visitType)
    && ['weekly', 'monthly'].includes(r.frequency)
    && Array.isArray(r.days) && r.days.length > 0 && new Set(r.days).size === r.days.length
    && r.days.every(day => Number.isInteger(day) && day >= 1 && day <= (r.frequency === 'weekly' ? 7 : 31))
    && ['shared', 'exclusive'].includes(r.policy) && ['enabled', 'paused'].includes(r.status)
    && Array.isArray(r.outletIds) && new Set(r.outletIds).size === r.outletIds.length
    && r.outletIds.every(id => visitOutlets.some(outlet => outlet.id === id && outlet.active && outlet.region === r.region))
}

export function readVisitRoutes(): VisitRoute[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(routeStorageKey) || 'null')
    if (Array.isArray(saved) && saved.every(isVisitRoute) && new Set(saved.map(r => r.id)).size === saved.length) {
      const valid = saved.every(r => r.policy !== 'exclusive' || !saved.some(other => other.id !== r.id && other.outletIds.some(id => r.outletIds.includes(id))))
      if (valid) return saved
    }
  } catch { /* Invalid or unavailable browser storage falls back to the sample routes. */ }
  return initialVisitRoutes()
}

export function routeConflicts(routes: VisitRoute[], route: VisitRoute): VisitRoute[] {
  return routes.filter(other => other.id !== route.id && other.outletIds.some(id => route.outletIds.includes(id)) && (route.policy === 'exclusive' || other.policy === 'exclusive'))
}

export function applyRouteChange(routes: VisitRoute[], route: VisitRoute): VisitRoute[] {
  if (!isVisitRoute(route)) throw new Error('Invalid route')
  if (route.policy === 'shared' && routeConflicts(routes, route).length) throw new Error('Exclusive outlet conflict')
  const exists = routes.some(other => other.id === route.id)
  const next = routes.map(other => other.id === route.id ? route : route.policy === 'exclusive' ? { ...other, outletIds: other.outletIds.filter(id => !route.outletIds.includes(id)) } : other)
  return exists ? next : [route, ...next]
}

export function nextRouteId(routes: VisitRoute[]) {
  const highest = Math.max(0, ...routes.map(route => Number(route.id.slice(3))).filter(Number.isFinite))
  return `RT-${String(highest + 1).padStart(4, '0')}`
}
