// Browser-only accounts for the prototype. Production authentication belongs on a server.
export const authStorageKeys = {
  accounts: 'tradevia-demo-accounts-v1',
  persistentSession: 'tradevia-demo-session-v1',
  session: 'tradevia-demo-tab-session-v1',
} as const

export type AuthUser = { id: string; name: string; email: string; demo: boolean }
export type AuthSession = { user: AuthUser; expiresAt: number }
type Account = Omit<AuthUser, 'demo'> & { salt: string; passwordHash: string }
export type AuthErrorCode = 'invalidName' | 'invalidEmail' | 'invalidPassword' | 'emailTaken' | 'invalidCredentials' | 'storageUnavailable' | 'storageCorrupt' | 'cryptoUnavailable'
export class AuthError extends Error {
  code: AuthErrorCode
  constructor(code: AuthErrorCode) { super(code); this.name = 'AuthError'; this.code = code }
}

export function normalizeEmail(email: string) { return email.trim().toLowerCase() }
export function isValidEmail(email: string) { return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) }
export function isValidPassword(password: string) { return password.length >= 8 && password.length <= 72 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password) }
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
const isAccount = (value: unknown): value is Account => {
  if (!value || typeof value !== 'object') return false
  const a = value as Account
  return typeof a.id === 'string' && !!a.id && typeof a.name === 'string' && !!a.name.trim() && a.name.length <= 40 && typeof a.email === 'string' && isValidEmail(a.email) && a.email === normalizeEmail(a.email) && typeof a.salt === 'string' && /^[0-9a-f]{32}$/.test(a.salt) && typeof a.passwordHash === 'string' && /^[0-9a-f]{64}$/.test(a.passwordHash)
}
function readAccounts(): Account[] {
  let stored: string | null
  try { stored = localStorage.getItem(authStorageKeys.accounts) } catch { throw new AuthError('storageUnavailable') }
  if (!stored) return []
  try {
    const accounts: unknown = JSON.parse(stored)
    if (!Array.isArray(accounts) || !accounts.every(isAccount) || new Set(accounts.map(a => a.email)).size !== accounts.length || new Set(accounts.map(a => a.id)).size !== accounts.length) throw new Error('Invalid accounts')
    return accounts
  } catch { throw new AuthError('storageCorrupt') }
}
async function hashPassword(password: string, salt: string) {
  if (!globalThis.crypto?.subtle) throw new AuthError('cryptoUnavailable')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bytes = new Uint8Array(salt.match(/.{2}/g)!.map(byte => parseInt(byte, 16)))
  const result = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: bytes, iterations: 210_000, hash: 'SHA-256' }, key, 256)
  return hex(new Uint8Array(result))
}
function publicUser(account: Account): AuthUser { return { id: account.id, name: account.name, email: account.email, demo: false } }
export async function registerAccount(input: { name: string; email: string; password: string }): Promise<AuthUser> {
  const name = input.name.trim()
  const email = normalizeEmail(input.email)
  if (!name || name.length > 40) throw new AuthError('invalidName')
  if (!isValidEmail(email)) throw new AuthError('invalidEmail')
  if (!isValidPassword(input.password)) throw new AuthError('invalidPassword')
  if (readAccounts().some(account => account.email === email)) throw new AuthError('emailTaken')
  if (!globalThis.crypto?.subtle) throw new AuthError('cryptoUnavailable')
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
  const passwordHash = await hashPassword(input.password, salt)
  const accounts = readAccounts()
  if (accounts.some(account => account.email === email)) throw new AuthError('emailTaken')
  const account: Account = { id: crypto.randomUUID(), name, email, salt, passwordHash }
  try { localStorage.setItem(authStorageKeys.accounts, JSON.stringify([...accounts, account])) } catch { throw new AuthError('storageUnavailable') }
  return publicUser(account)
}
export async function loginAccount(emailInput: string, password: string): Promise<AuthUser> {
  const email = normalizeEmail(emailInput)
  if (!isValidEmail(email)) throw new AuthError('invalidEmail')
  const account = readAccounts().find(account => account.email === email)
  if (!account || password.length > 72) throw new AuthError('invalidCredentials')
  const actual = await hashPassword(password, account.salt)
  let difference = 0
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ account.passwordHash.charCodeAt(i)
  if (difference !== 0) throw new AuthError('invalidCredentials')
  return publicUser(account)
}
export const demoUser: AuthUser = { id: 'tradevia-demo', name: 'Tradevia Demo', email: 'demo@tradevia.example', demo: true }
export function saveSession(user: AuthUser, remember: boolean): AuthSession {
  const session = { user, expiresAt: Date.now() + (remember ? 7 * 24 : 8) * 60 * 60 * 1000 }
  try {
    if (remember) {
      localStorage.setItem(authStorageKeys.persistentSession, JSON.stringify(session))
      sessionStorage.removeItem(authStorageKeys.session)
    } else {
      sessionStorage.setItem(authStorageKeys.session, JSON.stringify(session))
      localStorage.removeItem(authStorageKeys.persistentSession)
    }
  } catch { throw new AuthError('storageUnavailable') }
  return session
}
export function readSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(authStorageKeys.session) || localStorage.getItem(authStorageKeys.persistentSession)
    if (!raw) return null
    const session = JSON.parse(raw) as AuthSession
    const user = session?.user
    if (!user || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now() || session.expiresAt > Date.now() + 7 * 24 * 60 * 60 * 1000 || typeof user.id !== 'string' || typeof user.name !== 'string' || typeof user.email !== 'string' || typeof user.demo !== 'boolean') return null
    if (user.demo) return user.id === demoUser.id && user.name === demoUser.name && user.email === demoUser.email ? session : null
    const account = readAccounts().find(account => account.id === user.id && account.email === user.email && account.name === user.name)
    return account ? { ...session, user: publicUser(account) } : null
  } catch { return null }
}
export function clearSession() {
  let failed = false
  for (const [storage, key] of [['localStorage', authStorageKeys.persistentSession], ['sessionStorage', authStorageKeys.session]] as const) {
    try { globalThis[storage].removeItem(key) } catch { failed = true }
  }
  if (failed) throw new AuthError('storageUnavailable')
}
