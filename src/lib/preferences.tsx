import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { zh, en } from './i18n'
import type { Locale, TextKey } from './i18n'

export const accents = [
  { id: 'emerald', hex: '#188567', light: '#168064', dark: '#54caa5' },
  { id: 'blue', hex: '#3674dc', light: '#306bd3', dark: '#78a6ff' },
  { id: 'violet', hex: '#8659dc', light: '#7950cf', dark: '#b89af5' },
  { id: 'orange', hex: '#ce7028', light: '#b85b15', dark: '#efad6c' },
  { id: 'rose', hex: '#d45878', light: '#c54166', dark: '#f38da8' },
] as const
export type Accent = typeof accents[number]['id']
export type Mode = 'light' | 'dark' | 'system'
type Preferences = { locale: Locale; mode: Mode; accent: Accent }
const defaults: Preferences = { locale: 'zh', mode: 'light', accent: 'emerald' }
function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem('tradevia-preferences') || '{}')
    return {
      locale: ['zh', 'en'].includes(saved.locale) ? saved.locale : defaults.locale,
      mode: ['light', 'dark', 'system'].includes(saved.mode) ? saved.mode : defaults.mode,
      accent: accents.some(c => c.id === saved.accent) ? saved.accent : defaults.accent,
    }
  } catch { return defaults }
}
type PreferenceContext = Preferences & {
  setLocale: (v: Locale) => void; setMode: (v: Mode) => void; setAccent: (v: Accent) => void
  t: (key: TextKey) => string; money: (value: number, decimals?: boolean) => string
  number: (value: number) => string; reset: () => void
}
const Context = createContext<PreferenceContext | null>(null)
export function PreferenceProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(readPreferences)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = prefs.mode === 'dark' || (prefs.mode === 'system' && media.matches)
      const root = document.documentElement
      root.classList.toggle('dark', dark)
      root.lang = prefs.locale === 'zh' ? 'zh-CN' : 'en'
      root.style.colorScheme = dark ? 'dark' : 'light'
      const c = accents.find(x => x.id === prefs.accent)!
      root.style.setProperty('--primary', c[dark ? 'dark' : 'light'])
      root.style.setProperty('--primary-foreground', dark ? '#10231c' : '#ffffff')
      root.style.setProperty('--ring', c[dark ? 'dark' : 'light'])
      root.style.setProperty('--sidebar-primary', c[dark ? 'dark' : 'light'])
      root.style.setProperty('--chart-1', c[dark ? 'dark' : 'light'])
      root.dataset.accent = prefs.accent
      document.title = prefs.locale === 'zh' ? 'Tradevia · 经销商运营工作台' : 'Tradevia · Distribution workspace'
    }
    apply()
    media.addEventListener('change', apply)
    try { localStorage.setItem('tradevia-preferences', JSON.stringify(prefs)) } catch { /* Preferences are optional when browser storage is disabled. */ }
    return () => media.removeEventListener('change', apply)
  }, [prefs])
  const t = (key: TextKey) => (prefs.locale === 'zh' ? zh : en)[key]
  const number = (value: number) => new Intl.NumberFormat(prefs.locale === 'zh' ? 'zh-CN' : 'en-PH').format(value)
  const money = (value: number, decimals = false) => `₱${new Intl.NumberFormat(prefs.locale === 'zh' ? 'zh-CN' : 'en-PH', { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: decimals ? 2 : 0 }).format(value)}`
  return <Context.Provider value={{ ...prefs, t, money, number, setLocale: locale => setPrefs(p => ({ ...p, locale })), setMode: mode => setPrefs(p => ({ ...p, mode })), setAccent: accent => setPrefs(p => ({ ...p, accent })), reset: () => setPrefs(p => ({ ...defaults, locale: p.locale })) }}>{children}</Context.Provider>
}
export function usePreferences() {
  const value = useContext(Context)
  if (!value) throw new Error('PreferenceProvider is required')
  return value
}
