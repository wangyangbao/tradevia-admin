import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { authStorageKeys, clearSession, demoUser, loginAccount, readSession, registerAccount, saveSession, changeOwnPassword } from './auth'
import type { AuthSession } from './auth'
import { prepareOrganizationAccounts } from './organization-accounts'

type AuthContextValue = {
  user: AuthSession['user'] | null
  signIn: (email: string, password: string, remember: boolean) => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<void>
  enterDemo: () => Promise<void>
  changePassword: (current: string, next: string) => Promise<void>
  signOut: () => void
}
const AuthContext = createContext<AuthContextValue | null>(null)
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(readSession)
  useEffect(() => {
    if (!session) return
    const timer = window.setTimeout(() => {
      try { clearSession() } catch { /* Expired sessions are rejected on the next read as well. */ }
      setSession(null)
    }, Math.max(0, session.expiresAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [session])
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === authStorageKeys.persistentSession || event.key === authStorageKeys.accounts || event.key === null) setSession(readSession())
    }
    const refresh = () => setSession(readSession())
    window.addEventListener('storage', sync)
    window.addEventListener('focus', refresh)
    window.addEventListener('tradevia-auth-change', refresh)
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('focus', refresh); window.removeEventListener('tradevia-auth-change', refresh) }
  }, [])
  const signIn = async (email: string, password: string, remember: boolean) => {
    await prepareOrganizationAccounts()
    const user = await loginAccount(email, password)
    setSession(saveSession(user, remember))
  }
  const signUp = async (name: string, email: string, password: string) => {
    await prepareOrganizationAccounts()
    const user = await registerAccount({ name, email, password })
    setSession(saveSession(user, false))
  }
  const enterDemo = async () => { await prepareOrganizationAccounts(); setSession(saveSession(demoUser, false)) }
  const changePassword = async (current: string, next: string) => {
    if (!session || session.user.demo) return
    const user = await changeOwnPassword(session.user, current, next)
    setSession(saveSession(user, !!localStorage.getItem(authStorageKeys.persistentSession)))
  }
  const signOut = () => { clearSession(); setSession(null) }
  return <AuthContext.Provider value={{ user: session?.user ?? null, signIn, signUp, enterDemo, signOut, changePassword }}>{children}</AuthContext.Provider>
}
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider is required')
  return value
}
