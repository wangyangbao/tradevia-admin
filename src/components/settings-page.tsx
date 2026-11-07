import { companyName } from '@/lib/brand'
import { Check, CheckCheck, Globe2, Monitor, Moon, Palette, RotateCcw, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePreferences } from '@/lib/preferences'
import type { Locale } from '@/lib/i18n'
import { ThemeControls } from './workspace-shell'

export function SettingsPage() {
  const { t, locale, setLocale, reset } = usePreferences()
  return <div className="settings-page page-enter"><Card className="preferences-card"><div className="preferences-header"><span className="preferences-icon"><SettingsIcon /></span><div><h2>{t('preferences')}</h2><p>{t('preferencesHint')}</p></div></div><div className="settings-row"><div><h3><Globe2 size={17} />{t('language')}</h3><p>{t('languageHint')}</p></div><Select value={locale} onValueChange={v => setLocale(v as Locale)}><SelectTrigger className="settings-language" aria-label={t('language')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="zh">简体中文</SelectItem><SelectItem value="en">English</SelectItem></SelectContent></Select></div><div className="settings-theme"><div className="settings-section-title"><h3><Palette size={17} />{t('appearance')}</h3><p>{t('accentHint')}</p></div><ThemeControls /></div><div className="settings-bottom"><span><CheckCheck size={16} />{t('saved')}</span><Button variant="outline" size="sm" onClick={() => { reset(); toast.success(t('resetDone')) }}><RotateCcw size={14} />{t('reset')}</Button></div></Card><Card className="appearance-preview"><div><span className="preview-eyebrow">{t('preview')}</span><h2>{t('previewHint')}</h2><p>{t('modeHint')}</p></div><div className="mini-window"><div className="mini-window-top"><span /><span /><span /><i>{companyName}</i></div><div className="mini-window-body"><div className="mini-sidebar"><span className="mini-logo" /><span className="mini-active" /><span /><span /><span /></div><div className="mini-content"><div className="mini-title" /><div className="mini-cards"><span /><span /><span /></div><div className="mini-chart"><svg viewBox="0 0 240 70" aria-hidden="true"><path d="M0 64C20 59 24 25 47 35s23 26 48 7 26-24 49-14 34-18 50-16 30 3 46-10V70H0Z" fill="var(--primary)" opacity=".12" /><path d="M0 64C20 59 24 25 47 35s23 26 48 7 26-24 49-14 34-18 50-16 30 3 46-10" stroke="var(--primary)" fill="none" strokeWidth="2.5" /></svg></div></div></div></div><div className="preview-buttons"><Button><Check size={15} />{t('exampleButton')}</Button><Button variant="outline">{t('secondaryButton')}</Button></div><p className="settings-demo-note">{t('demoNotice')}</p></Card></div>
}
function SettingsIcon() { return <div className="settings-symbol"><Sun size={18} /><Moon size={13} /><Monitor size={14} /></div> }
