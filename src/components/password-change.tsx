import { useState } from 'react'
import type { FormEvent } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
export function PasswordChange({ forced = false, open = false, onClose }: { forced?: boolean; open?: boolean; onClose?: () => void }) {
  const { changePassword, signOut } = useAuth()
  const [current, setCurrent] = useState(''), [next, setNext] = useState(''), [confirm, setConfirm] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return
    if (next !== confirm) return setError('两次输入的新密码不一致。')
    setBusy(true); setError('')
    try { await changePassword(current, next); setCurrent(''); setNext(''); setConfirm(''); onClose?.(); toast.success('密码已修改') }
    catch { setError('原密码不正确，或新密码不符合要求。新密码需包含字母和数字，且不能与原密码相同。') }
    finally { setBusy(false) }
  }
  return <Dialog open={forced || open} onOpenChange={value => { if (!value && !forced && !busy) onClose?.() }}><DialogContent closeLabel="关闭" showCloseButton={!forced} onInteractOutside={e => forced && e.preventDefault()} onEscapeKeyDown={e => forced && e.preventDefault()}><DialogHeader><DialogTitle>{forced ? '首次登录，请修改密码' : '修改我的密码'}</DialogTitle><DialogDescription>新密码须为 8–72 位，包含字母和数字，且与原密码不同。</DialogDescription></DialogHeader><form className="org-form" onSubmit={save}><Label htmlFor="current-password">{forced ? '临时密码' : '原密码'}</Label><Input id="current-password" type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} required maxLength={72} /><Label htmlFor="next-password">新密码</Label><Input id="next-password" type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} minLength={8} maxLength={72} required /><Label htmlFor="confirm-password">确认新密码</Label><Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} minLength={8} maxLength={72} required />{error && <p role="alert" className="org-form-error">{error}</p>}<div className="org-form-footer">{forced && <Button variant="outline" type="button" disabled={busy} onClick={signOut}>退出登录</Button>}<Button type="submit" disabled={busy}>{busy ? '正在保存…' : '确认修改'}</Button></div></form></DialogContent></Dialog>
}
