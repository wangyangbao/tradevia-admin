import type { TextKey } from './i18n'

export type Region = 'manila' | 'northLuzon' | 'visayas' | 'mindanao'
export const regions: Region[] = ['manila', 'northLuzon', 'visayas', 'mindanao']
export type Page = 'overview' | 'orders' | 'outlets' | 'distributors' | 'inventory' | 'receivables' | 'settings' | 'visitRoutes'
export type OrderStatus = 'pending' | 'delivering' | 'delivered' | 'cancelled'
export type Order = { id: string; outlet: string; distributor: string; region: Region; amount: number; status: OrderStatus; date: string; product: TextKey; quantity: number; price: number; payment: 'cash' | 'credit' | 'wallet' }

export const initialOrders: Order[] = [
  { id: 'SO-261107-0086', outlet: 'Aling Nena Store', distributor: 'Metro Manila Trading', region: 'manila', amount: 8640, status: 'pending', date: '2026-11-07', product: 'vanilla', quantity: 288, price: 30, payment: 'credit' },
  { id: 'SO-261107-0085', outlet: 'Santos Mini Mart', distributor: 'Luzon Distribution', region: 'northLuzon', amount: 12600, status: 'delivering', date: '2026-11-07', product: 'chocolate', quantity: 360, price: 35, payment: 'cash' },
  { id: 'SO-261107-0084', outlet: 'Cebu Corner Shop', distributor: 'Visayas Cold Chain', region: 'visayas', amount: 7200, status: 'delivered', date: '2026-11-07', product: 'strawberry', quantity: 240, price: 30, payment: 'wallet' },
  { id: 'SO-261107-0083', outlet: 'Reyes Family Store', distributor: 'Metro Manila Trading', region: 'manila', amount: 4800, status: 'delivered', date: '2026-11-07', product: 'mango', quantity: 240, price: 20, payment: 'cash' },
  { id: 'SO-261107-0082', outlet: 'Davao Fresh Market', distributor: 'Mindanao Food Supply', region: 'mindanao', amount: 16800, status: 'pending', date: '2026-11-07', product: 'cookies', quantity: 480, price: 35, payment: 'credit' },
  { id: 'SO-261106-0081', outlet: 'Marikit Convenience', distributor: 'Luzon Distribution', region: 'northLuzon', amount: 6000, status: 'delivering', date: '2026-11-06', product: 'milk', quantity: 240, price: 25, payment: 'cash' },
  { id: 'SO-261106-0080', outlet: 'Island Daily Store', distributor: 'Visayas Cold Chain', region: 'visayas', amount: 10800, status: 'delivered', date: '2026-11-06', product: 'vanilla', quantity: 360, price: 30, payment: 'wallet' },
  { id: 'SO-261106-0079', outlet: 'Del Rosario Mart', distributor: 'Metro Manila Trading', region: 'manila', amount: 4200, status: 'cancelled', date: '2026-11-06', product: 'chocolate', quantity: 120, price: 35, payment: 'credit' },
  { id: 'SO-261105-0078', outlet: 'Greenfield Mini Mart', distributor: 'Mindanao Food Supply', region: 'mindanao', amount: 9600, status: 'delivered', date: '2026-11-05', product: 'mango', quantity: 480, price: 20, payment: 'cash' },
  { id: 'SO-261105-0077', outlet: 'Sunrise Sari-sari', distributor: 'Luzon Distribution', region: 'northLuzon', amount: 14400, status: 'delivered', date: '2026-11-05', product: 'strawberry', quantity: 480, price: 30, payment: 'wallet' },
  { id: 'SO-261104-0076', outlet: 'Luna Neighborhood Store', distributor: 'Metro Manila Trading', region: 'manila', amount: 8400, status: 'pending', date: '2026-11-04', product: 'cookies', quantity: 240, price: 35, payment: 'credit' },
  { id: 'SO-261104-0075', outlet: 'Mabuhay Mini Market', distributor: 'Visayas Cold Chain', region: 'visayas', amount: 6000, status: 'delivered', date: '2026-11-04', product: 'milk', quantity: 240, price: 25, payment: 'cash' },
]

export const outlets = [
  { id: 'OUT-001', name: 'Aling Nena Store', region: 'manila', contact: 'Ana Reyes', channel: 'traditional', address: 'Quezon City, Metro Manila', balance: 8640, active: true },
  { id: 'OUT-002', name: 'Santos Mini Mart', region: 'northLuzon', contact: 'Marco Santos', channel: 'convenience', address: 'San Fernando, Pampanga', balance: 12600, active: true },
  { id: 'OUT-003', name: 'Cebu Corner Shop', region: 'visayas', contact: 'Maria Cruz', channel: 'traditional', address: 'Cebu City, Cebu', balance: 0, active: true },
  { id: 'OUT-004', name: 'Reyes Family Store', region: 'manila', contact: 'Juan Reyes', channel: 'traditional', address: 'Pasig City, Metro Manila', balance: 0, active: true },
  { id: 'OUT-005', name: 'Davao Fresh Market', region: 'mindanao', contact: 'Sofia Garcia', channel: 'supermarket', address: 'Davao City, Davao del Sur', balance: 16800, active: true },
  { id: 'OUT-006', name: 'Marikit Convenience', region: 'northLuzon', contact: 'Luis Mendoza', channel: 'convenience', address: 'Angeles City, Pampanga', balance: 6000, active: true },
  { id: 'OUT-007', name: 'Island Daily Store', region: 'visayas', contact: 'Isabel Flores', channel: 'traditional', address: 'Mandaue City, Cebu', balance: 0, active: true },
  { id: 'OUT-008', name: 'Del Rosario Mart', region: 'manila', contact: 'Carlo Ramos', channel: 'convenience', address: 'Makati City, Metro Manila', balance: 4200, active: false },
] as const

export const distributorData = [
  { id: 'DST-001', name: 'Metro Manila Trading', region: 'manila', owner: 'Miguel Santos', stores: 428, sales: 287385, share: 42, code: 'MM' },
  { id: 'DST-002', name: 'Luzon Distribution', region: 'northLuzon', owner: 'Elena Cruz', stores: 356, sales: 184748, share: 27, code: 'NL' },
  { id: 'DST-003', name: 'Visayas Cold Chain', region: 'visayas', owner: 'Rafael Garcia', stores: 284, sales: 130007, share: 19, code: 'VS' },
  { id: 'DST-004', name: 'Mindanao Food Supply', region: 'mindanao', owner: 'Camila Reyes', stores: 216, sales: 82110, share: 12, code: 'MD' },
] as const

export const products = [
  { id: 'SKU-001', name: 'vanilla', price: 30, available: 6480, reserved: 720, expiry: '2027-04-15', status: 'sufficient', warehouse: 'centralWarehouse', region: 'manila', color: 'cream' },
  { id: 'SKU-002', name: 'chocolate', price: 35, available: 4320, reserved: 480, expiry: '2027-03-20', status: 'sufficient', warehouse: 'centralWarehouse', region: 'manila', color: 'cocoa' },
  { id: 'SKU-003', name: 'strawberry', price: 30, available: 192, reserved: 120, expiry: '2027-02-10', status: 'low', warehouse: 'cebuWarehouse', region: 'visayas', color: 'berry' },
  { id: 'SKU-004', name: 'mango', price: 20, available: 2880, reserved: 240, expiry: '2026-11-28', status: 'expirySoon', warehouse: 'cebuWarehouse', region: 'visayas', color: 'mango' },
  { id: 'SKU-005', name: 'cookies', price: 35, available: 168, reserved: 96, expiry: '2027-05-01', status: 'low', warehouse: 'centralWarehouse', region: 'manila', color: 'cookie' },
  { id: 'SKU-006', name: 'milk', price: 25, available: 5760, reserved: 600, expiry: '2027-06-12', status: 'sufficient', warehouse: 'centralWarehouse', region: 'manila', color: 'milk' },
] as const

export const receivableData = [
  { id: 'AR-261107-001', outlet: 'Aling Nena Store', region: 'manila', amount: 8640, received: 0, due: '2026-11-14', status: 'unpaid' },
  { id: 'AR-261102-002', outlet: 'Santos Mini Mart', region: 'northLuzon', amount: 12600, received: 6000, due: '2026-11-09', status: 'partial' },
  { id: 'AR-261025-003', outlet: 'Davao Fresh Market', region: 'mindanao', amount: 16800, received: 0, due: '2026-11-01', status: 'overdue' },
  { id: 'AR-261101-004', outlet: 'Marikit Convenience', region: 'northLuzon', amount: 6000, received: 0, due: '2026-11-08', status: 'unpaid' },
  { id: 'AR-261024-005', outlet: 'Del Rosario Mart', region: 'manila', amount: 4200, received: 0, due: '2026-10-31', status: 'overdue' },
  { id: 'AR-261106-006', outlet: 'Cebu Corner Shop', region: 'visayas', amount: 7200, received: 7200, due: '2026-11-13', status: 'paid' },
] as const

export const dailySales = [
  { day: '11/01', sales: 72400, target: 85000 }, { day: '11/02', sales: 86800, target: 85000 },
  { day: '11/03', sales: 79150, target: 85000 }, { day: '11/04', sales: 108600, target: 100000 },
  { day: '11/05', sales: 96300, target: 100000 }, { day: '11/06', sales: 126800, target: 110000 },
  { day: '11/07', sales: 114200, target: 110000 },
]

export const monthlySales = [
  { day: '10/09', sales: 289600, target: 340000 }, { day: '10/14', sales: 347200, target: 340000 },
  { day: '10/19', sales: 316600, target: 340000 }, { day: '10/24', sales: 434400, target: 400000 },
  { day: '10/29', sales: 385200, target: 400000 }, { day: '11/03', sales: 507200, target: 440000 },
  { day: '11/07', sales: 342600, target: 330000 },
]
