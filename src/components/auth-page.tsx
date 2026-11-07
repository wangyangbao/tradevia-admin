import { companyName } from '@/lib/brand'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Check, CheckCheck, ChevronRight, Eye, EyeOff, Globe2, IceCreamCone, LoaderCircle, Mail, Moon, ShieldCheck, ShoppingBag, Store, Sun, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Logo } from '@/components/workspace-shell'
import { usePreferences } from '@/lib/preferences'
import { useAuth } from '@/lib/auth-context'
import { AuthError, isValidEmail, isValidPassword, normalizeEmail } from '@/lib/auth'
import { authEn, authZh } from '@/lib/auth-i18n'
import type { AuthTextKey } from '@/lib/auth-i18n'
import '@/styles/auth.css'

type Field = 'name' | 'email' | 'password' | 'confirm'
const copyrightYear = new Date().getFullYear()
export function AuthPage({ page }: { page: 'login' | 'register' }) {
  const registering = page === 'register'
  const { locale, setLocale, mode, setMode } = usePreferences()
  const { signIn, signUp, enterDemo } = useAuth()
  const copy = locale === 'zh' ? authZh : authEn
  const a = (key: AuthTextKey) => copy[key]
  const [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<Partial<Record<Field, AuthTextKey>>>({})
  const [error, setError] = useState<AuthTextKey | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { titleRef.current?.focus() }, [])
  const update = (field: Field, value: string) => {
    setValues(previous => ({ ...previous, [field]: value }))
    setErrors(previous => ({ ...previous, [field]: undefined, ...(field === 'password' ? { confirm: undefined } : {}) }))
    setError(null)
  }
  const reportError = (caught: unknown) => {
    const code = caught instanceof AuthError ? caught.code : 'unknownError'
    setError(code)
    if (code === 'emailTaken' || code === 'invalidEmail') { setErrors(previous => ({ ...previous, email: code })); document.getElementById('auth-email')?.focus() }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting.current) return
    const next: Partial<Record<Field, AuthTextKey>> = {}
    if (registering && (!values.name.trim() || values.name.trim().length > 40)) next.name = 'invalidName'
    if (!isValidEmail(normalizeEmail(values.email))) next.email = 'invalidEmail'
    if (registering ? !isValidPassword(values.password) : !values.password) next.password = registering ? 'invalidPassword' : 'required'
    if (registering && (!values.confirm || values.password !== values.confirm)) next.confirm = 'passwordMismatch'
    setErrors(next); setError(null)
    const first = (['name', 'email', 'password', 'confirm'] as const).find(field => next[field])
    if (first) { document.getElementById(`auth-${first}`)?.focus(); return }
    submitting.current = true; setBusy(true)
    try {
      if (registering) await signUp(values.name, values.email, values.password)
      else await signIn(values.email, values.password, remember)
      toast.success(a(registering ? 'registerSuccess' : 'loginSuccess'))
    } catch (caught) { reportError(caught) }
    finally { submitting.current = false; setBusy(false) }
  }
  const demo = () => {
    if (submitting.current) return
    try { enterDemo() } catch (caught) { reportError(caught) }
  }
  const fieldError = (field: Field) => errors[field] ? <p role="alert" className="auth-field-error" id={`auth-${field}-error`}>{a(errors[field]!)}</p> : null
  const navigate = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (busy) { event.preventDefault(); return }
  }
  return <div className="auth-layout">
    <aside className="auth-story" aria-label={companyName}>
      <Logo />
      <div className="auth-story-content">
        <span className="auth-eyebrow"><span />{a('eyebrow')}</span>
        <h2>{a('heroTitle')}</h2>
        <p className="auth-story-description">{a('heroDescription')}</p>
        <div className="auth-flow" aria-hidden="true">
          <div className="auth-flow-heading"><span>{a('previewLabel')}</span><span className="auth-flow-live"><span />{companyName}</span></div>
          <div className="auth-flow-nodes">{[{ icon: Store, title: 'outlet' }, { icon: ShoppingBag, title: 'order' }, { icon: Wallet, title: 'collection' }].map(({ icon: Icon, title }, index) => <div className="auth-flow-step" key={title}><div className="auth-flow-node"><span className="auth-flow-icon"><Icon size={21} strokeWidth={1.6} /></span><strong>{a(title as AuthTextKey)}</strong><span className="auth-flow-node-line" /></div>{index < 2 && <ChevronRight size={17} className="auth-flow-arrow" />}</div>)}</div>
          <div className="auth-flow-caption"><span><CheckCheck size={14} />{a('connected')}</span><span>{a('previewTitle')}</span></div>
        </div>
        <ul className="auth-features">{(['featureOne', 'featureTwo', 'featureThree'] as const).map(key => <li key={key}><span><Check size={12} strokeWidth={2.5} /></span>{a(key)}</li>)}</ul>
      </div>
      <div className="auth-story-footer"><span className="auth-footer-symbol"><IceCreamCone size={20} strokeWidth={1.8} aria-hidden="true" /></span><span>{a('heroFooter')}</span></div>
    </aside>
    <section className="auth-form-panel">
      <header className="auth-toolbar"><div className="auth-mobile-brand"><Logo /></div><div className="auth-toolbar-actions"><Button variant="ghost" className="auth-language" aria-label={locale === 'zh' ? '切换到英文' : 'Switch to Chinese'} onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}><Globe2 size={15} /><span>{locale === 'zh' ? '简体中文' : 'English'}</span></Button><span className="auth-toolbar-divider" /><Button variant="ghost" size="icon" aria-label={a('theme')} onClick={() => setMode((mode === 'system' ? document.documentElement.classList.contains('dark') : mode === 'dark') ? 'light' : 'dark')}>{mode === 'dark' || (mode === 'system' && document.documentElement.classList.contains('dark')) ? <Sun size={17} /> : <Moon size={17} />}</Button></div></header>
      <main className="auth-form-main">
        <div className="auth-form-container">
          <nav className="auth-tabs" aria-label={locale === 'zh' ? '账号入口' : 'Account access'}><a href="#login" aria-current={!registering ? 'page' : undefined} onClick={navigate}>{a('login')}</a><a href="#register" aria-current={registering ? 'page' : undefined} onClick={navigate}>{a('register')}</a></nav>
          <div className="auth-form-heading"><span className="auth-form-kicker">{a('workspaceKicker')}</span><h1 ref={titleRef} tabIndex={-1}>{a(registering ? 'registerTitle' : 'loginTitle')}<span className="auth-heading-dot">.</span></h1><p>{a(registering ? 'registerSubtitle' : 'loginSubtitle')}</p></div>
          <form onSubmit={submit} noValidate aria-busy={busy}>
            <fieldset disabled={busy} className="auth-fields">
              {registering && <div className="auth-field"><Label htmlFor="auth-name">{a('name')}</Label><Input id="auth-name" name="name" autoComplete="name" maxLength={40} placeholder={a('namePlaceholder')} value={values.name} onChange={e => update('name', e.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'auth-name-error' : undefined} required />{fieldError('name')}</div>}
              <div className="auth-field"><Label htmlFor="auth-email">{a('email')}</Label><div className="auth-input-wrap"><Mail size={16} aria-hidden="true" /><Input id="auth-email" name="email" type="email" autoComplete="username" maxLength={254} spellCheck={false} autoCapitalize="none" placeholder={a('emailPlaceholder')} value={values.email} onChange={e => update('email', e.target.value)} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'auth-email-error' : undefined} required /></div>{fieldError('email')}</div>
              <div className="auth-field"><Label htmlFor="auth-password">{a('password')}</Label><div className="auth-input-wrap auth-password-wrap"><Input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'} maxLength={72} placeholder={a(registering ? 'newPasswordPlaceholder' : 'passwordPlaceholder')} value={values.password} onChange={e => update('password', e.target.value)} aria-invalid={!!errors.password} aria-describedby={errors.password ? 'auth-password-error' : registering ? 'auth-password-hint' : undefined} required /><button type="button" className="auth-reveal" aria-label={a(showPassword ? 'hidePassword' : 'showPassword')} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>{fieldError('password')}{registering && !errors.password && <p className="auth-field-hint" id="auth-password-hint">{a('passwordHint')}</p>}</div>
              {registering && <div className="auth-field"><Label htmlFor="auth-confirm">{a('confirmPassword')}</Label><div className="auth-input-wrap auth-password-wrap"><Input id="auth-confirm" name="confirmPassword" type={showConfirm ? 'text' : 'password'} autoComplete="new-password" maxLength={72} placeholder={a('confirmPlaceholder')} value={values.confirm} onChange={e => update('confirm', e.target.value)} aria-invalid={!!errors.confirm} aria-describedby={errors.confirm ? 'auth-confirm-error' : undefined} required /><button type="button" className="auth-reveal" aria-label={`${a(showConfirm ? 'hidePassword' : 'showPassword')} · ${a('confirmPassword')}`} aria-pressed={showConfirm} onClick={() => setShowConfirm(value => !value)}>{showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>{fieldError('confirm')}{values.confirm && values.confirm === values.password && !errors.confirm && <p className="auth-field-success"><Check size={12} />{a('passwordMatch')}</p>}</div>}
              {!registering && <label className="auth-remember"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /><span>{a('remember')}</span></label>}
              {error && <div className="auth-error" role="alert">{a(error)}</div>}
              <Button type="submit" className="auth-submit">{busy ? <><LoaderCircle size={17} className="animate-spin" />{a('processing')}</> : <>{a(registering ? 'registerAction' : 'loginAction')}<ArrowRight size={16} /></>}</Button>
            </fieldset>
          </form>
          <p className="auth-switch">{a(registering ? 'hasAccount' : 'noAccount')}<a href={registering ? '#login' : '#register'} onClick={navigate}>{a(registering ? 'loginLink' : 'registerLink')}<ArrowRight size={12} /></a></p>
          <div className="auth-demo-divider"><span>{a('demoDivider')}</span></div>
          <Button type="button" variant="outline" className="auth-demo-button" onClick={demo} disabled={busy}><Store size={16} />{a('demoAction')}<ArrowRight size={14} /></Button>
          <p className="auth-demo-note"><ShieldCheck size={15} /><span>{a('demoNote')}</span></p>
        </div>
      </main>
      <footer className="auth-bottom"><span>© {copyrightYear} {companyName}</span><span>{a('rights')}</span></footer>
    </section>
  </div>
}
