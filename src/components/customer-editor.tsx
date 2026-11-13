import { useState } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, Camera, Check, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useOrganization } from '@/lib/organization-context'
import { criticalCustomerChanges, duplicateCustomers, localDate } from '@/lib/customers'
import type { Customer, CustomerState, RelatedChange } from '@/lib/customers'
import type { ArchiveState } from '@/lib/basic-data'
import type { VisitRoute } from '@/lib/visit-routes'
import { CustomerLocationPreview } from './customer-location'

export function CustomerField({ title, required, children, wide, hint }: { title: string; required?: boolean; children: ReactNode; wide?: boolean; hint?: string }) {
  return <label className={`customer-field${wide ? ' wide' : ''}`}><span>{title}{required && <em> *</em>}</span>{children}{hint && <small>{hint}</small>}</label>
}
async function readStorePhoto(file: File, name: string): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('请选择 5 MB 以内的 JPG、PNG 或 WebP 图片。')
  const src = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('图片读取失败，请重试。')); reader.readAsDataURL(file) })
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('图片无法解码，请重新选择。')); img.src = src })
  const canvas = document.createElement('canvas'), scale = Math.min(1, 1000 / Math.max(image.width, image.height))
  canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale))
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('浏览器暂不支持图片处理。')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const band = Math.max(24, Math.min(42, canvas.height * .12))
  ctx.fillStyle = '#102c28b8'; ctx.fillRect(0, canvas.height - band, canvas.width, band); ctx.fillStyle = '#ffffff'; ctx.font = `${Math.max(10, Math.min(14, canvas.width / 30))}px sans-serif`; ctx.fillText(`${name || '客户门头照'} · ${localDate()} · PC建档`, 12, canvas.height - band / 2 + 5, canvas.width - 24)
  return canvas.toDataURL('image/jpeg', .78)
}
export function CustomerEditor({ customer, state, archives, routes, onClose, onSave }: { customer: Customer; state: CustomerState; archives: ArchiveState; routes: VisitRoute[]; onClose: () => void; onSave: (customer: Customer, confirmed: boolean, duplicateConfirmed: boolean) => void }) {
  const org = useOrganization()
  const [draft, setDraft] = useState(() => structuredClone(customer)), [error, setError] = useState(''), [confirmed, setConfirmed] = useState(false), [duplicatesConfirmed, setDuplicatesConfirmed] = useState(false), [savingPhoto, setSavingPhoto] = useState(false)
  const old = state.customers.find(c => c.id === draft.id), changed = old ? criticalCustomerChanges(old, draft) : [], duplicates = old ? [] : duplicateCustomers(state, draft)
  const primaryAddress = draft.addresses.find(a => a.primary)!, primaryContact = draft.contacts.find(a => a.primary)!
  const set = <K extends keyof Customer>(key: K, value: Customer[K]) => { setDraft(d => ({ ...d, [key]: value })); setConfirmed(false); setDuplicatesConfirmed(false) }
  const address = (key: keyof typeof primaryAddress, value: string | number) => set('addresses', draft.addresses.map(a => a.id === primaryAddress.id ? { ...a, [key]: value } : a))
  const contact = (key: keyof typeof primaryContact, value: string) => set('contacts', draft.contacts.map(a => a.id === primaryContact.id ? { ...a, [key]: value } : a))
  const categories = archives.rows.filter(a => a.kind === 'outletCategories' && (a.active || a.id === draft.categoryId)), channels = archives.rows.filter(a => a.kind === 'channels' && (a.active || a.id === draft.channelId))
  const dealers = org.units.filter(u => u.level === 4 && u.active), people = org.people.filter(p => p.unitId === draft.dealerId && p.active && p.role === '成员')
  const selectCategory = (value: string) => { const category = categories.find(c => c.id === value); const channel = channels.find(c => c.id === category?.values.channelId); setDraft(d => ({ ...d, categoryId: value, channelId: String(category?.values.channelId ?? ''), grade: String(category?.values.grade ?? 'B'), frequency: String(category?.values.frequency ?? '每周 1 次'), keyOutlet: !!category?.values.keyOutlet, creditDays: Number(channel?.values.creditDays ?? 0) })); setConfirmed(false) }
  return <Dialog open onOpenChange={open => !open && onClose()}><DialogContent layer={70} closeLabel="关闭" className="customer-editor"><DialogHeader><DialogTitle>{old ? '编辑客户档案' : '新建客户'}</DialogTitle><DialogDescription>{old ? `${draft.code} · 关键业务字段变更需确认` : '完善客户信息，建立可追踪的门店档案。带 * 的为必填项。'}</DialogDescription></DialogHeader>
    <form onSubmit={e => { e.preventDefault(); try { onSave(draft, confirmed, duplicatesConfirmed) } catch (e) { setError((e as Error).message) } }}>
      <div className="customer-form-scroll"><fieldset><legend>基本信息</legend><div className="customer-form-grid">
        <CustomerField title="客户名称" required><Input aria-label="客户名称" required maxLength={80} value={draft.name} onChange={e => set('name', e.target.value)} placeholder="按门店招牌填写" /></CustomerField>
        <CustomerField title="简称 / 别名"><Input maxLength={40} value={draft.alias} onChange={e => set('alias', e.target.value)} placeholder="便于快速查找" /></CustomerField>
        <CustomerField title="所属经销商" required><select required disabled={!!old} value={draft.dealerId} onChange={e => { const owner = org.people.find(p => p.unitId === e.target.value && p.active && p.role === '成员'); setDraft(d => ({ ...d, dealerId: e.target.value, ownerId: owner?.id ?? '', routeId: '' })) }}><option value="">请选择经销商</option>{dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></CustomerField>
        <CustomerField title="负责业务员" required><select required value={draft.ownerId} onChange={e => set('ownerId', e.target.value)}><option value="">请选择本经销商业务员</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></CustomerField>
        <CustomerField title="门店分类" required><select required value={draft.categoryId} onChange={e => selectCategory(e.target.value)}><option value="">请选择分类</option>{categories.map(c => <option key={c.id} value={c.id}>{c.values.parentId ? '└ ' : ''}{c.name}{!c.active ? '（已停用）' : ''}</option>)}</select></CustomerField>
        <CustomerField title="渠道" required><select required value={draft.channelId} onChange={e => { set('channelId', e.target.value); set('creditDays', Number(channels.find(c => c.id === e.target.value)?.values.creditDays ?? 0)) }}><option value="">请选择渠道</option>{channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></CustomerField>
        <CustomerField title="门店等级" required><select value={draft.grade} onChange={e => set('grade', e.target.value)}>{['A', 'B', 'C', 'D'].map(g => <option key={g}>{g}</option>)}</select></CustomerField>
        <CustomerField title="默认拜访频次" required><select value={draft.frequency} onChange={e => set('frequency', e.target.value)}>{['每周 2 次', '每周 1 次', '每两周 1 次', '每月 1 次'].map(g => <option key={g}>{g}</option>)}</select></CustomerField>
        <CustomerField title="主线路" hint="此处记录客户主线路；不改动路线模块的分配计划。"><select value={draft.routeId} onChange={e => set('routeId', e.target.value)}><option value="">暂未分配</option>{routes.map(r => <option key={r.id} value={r.id}>{r.name}{r.status === 'paused' ? '（暂停）' : ''}</option>)}</select></CustomerField>
        <div className="customer-field customer-check"><label><input type="checkbox" checked={draft.keyOutlet} onChange={e => set('keyOutlet', e.target.checked)} />重点门店</label><small>在客户列表中突出显示</small></div>
      </div></fieldset>
      <fieldset><legend>主要联系人</legend><div className="customer-form-grid">
        <CustomerField title="联系人姓名" required><Input required maxLength={40} value={primaryContact.name} onChange={e => contact('name', e.target.value)} /></CustomerField>
        <CustomerField title="联系电话" required hint="多个号码使用英文分号 ; 分隔"><Input required type="tel" value={primaryContact.phone} onChange={e => contact('phone', e.target.value)} placeholder="+63 917 000 0000" /></CustomerField>
        <CustomerField title="职务" required><Input required maxLength={40} value={primaryContact.role} onChange={e => contact('role', e.target.value)} /></CustomerField>
        <CustomerField title="联系邮箱"><Input type="email" value={primaryContact.email} onChange={e => contact('email', e.target.value)} /></CustomerField>
      </div></fieldset>
      <fieldset><legend>联系地址与定位 <span>与客户地址页签中的默认地址同步</span></legend><div className="customer-form-grid">
        {(['province', 'city', 'barangay', 'street'] as const).map((k, i) => <CustomerField key={k} title={['省 / Province', '市 / City', '区 / Barangay', '街道'][i]} required={i < 3}><Input required={i < 3} maxLength={80} value={primaryAddress[k]} onChange={e => address(k, e.target.value)} /></CustomerField>)}
        <CustomerField title="详细地址 / 地标" required wide hint="请填写门牌号、楼层或附近地标，便于拜访和配送。"><Input required maxLength={200} value={primaryAddress.detail} onChange={e => address('detail', e.target.value)} placeholder="门牌号、楼层、附近地标" /></CustomerField>
        <CustomerField title="纬度" required><Input required type="number" min={-90} max={90} step="0.000001" value={Number.isFinite(primaryAddress.latitude) ? primaryAddress.latitude : ''} onChange={e => address('latitude', e.target.value === '' ? NaN : Number(e.target.value))} placeholder="如 14.646300" /></CustomerField>
        <CustomerField title="经度" required><Input required type="number" min={-180} max={180} step="0.000001" value={Number.isFinite(primaryAddress.longitude) ? primaryAddress.longitude : ''} onChange={e => address('longitude', e.target.value === '' ? NaN : Number(e.target.value))} placeholder="如 121.041400" /></CustomerField>
        <div className="customer-field wide"><CustomerLocationPreview address={primaryAddress} /></div>
        <CustomerField title="收货人" required><Input required value={primaryAddress.recipient} maxLength={40} onChange={e => address('recipient', e.target.value)} /></CustomerField>
        <CustomerField title="收货电话" required><Input required type="tel" value={primaryAddress.phone} onChange={e => address('phone', e.target.value)} /></CustomerField>
      </div></fieldset>
      <fieldset><legend>信用与结算 <span>金额单位：菲律宾比索 PHP</span></legend><div className="customer-form-grid">
        <CustomerField title="信用额度" required hint="0 表示现款现货；大幅调整需财务审批。"><Input required type="number" min="0" max="999999" step="0.01" value={Number.isFinite(draft.creditLimit) ? draft.creditLimit / 100 : ''} onChange={e => set('creditLimit', e.target.value === '' ? NaN : Math.round(Number(e.target.value) * 100))} /></CustomerField>
        <CustomerField title="账期（天）" required><Input required type="number" min="0" max="90" step="1" value={Number.isFinite(draft.creditDays) ? draft.creditDays : ''} onChange={e => set('creditDays', e.target.value === '' ? NaN : Number(e.target.value))} /></CustomerField>
        <div className="customer-field wide"><span>结算方式 <em>*</em></span><div className="customer-checkboxes">{archives.rows.filter(r => r.kind === 'settlementMethods' && (r.active || draft.settlements.includes(r.name))).map(r => <label key={r.id}><input type="checkbox" checked={draft.settlements.includes(r.name)} onChange={e => set('settlements', e.target.checked ? [...draft.settlements, r.name] : draft.settlements.filter(x => x !== r.name))} />{r.name}</label>)}</div></div>
        <CustomerField title="开票信息" required={draft.settlements.includes('赊销')} wide><Input required={draft.settlements.includes('赊销')} maxLength={200} value={draft.taxInfo} onChange={e => set('taxInfo', e.target.value)} placeholder="纳税人识别号与开票抬头" /></CustomerField>
      </div></fieldset>
      <fieldset><legend>经营信息</legend><div className="customer-form-grid">
        <CustomerField title="营业时间"><Input maxLength={40} value={draft.hours} onChange={e => set('hours', e.target.value)} /></CustomerField>
        <CustomerField title="门店类型"><select value={draft.storeType} onChange={e => set('storeType', e.target.value)}>{['独立店', '连锁店', '市场摊位', '流动摊点'].map(x => <option key={x}>{x}</option>)}</select></CustomerField>
        {draft.storeType === '连锁店' && <CustomerField title="连锁名称" required><Input required maxLength={80} value={draft.chain} onChange={e => set('chain', e.target.value)} /></CustomerField>}
        <CustomerField title="冰柜数量"><Input required type="number" min="0" max="20" step="1" value={Number.isFinite(draft.freezers) ? draft.freezers : ''} onChange={e => set('freezers', e.target.value === '' ? NaN : Number(e.target.value))} /></CustomerField>
        <CustomerField title="冰柜品牌归属"><select value={draft.freezerBrand} onChange={e => set('freezerBrand', e.target.value)}>{['蒙牛投放', '门店自有', '竞品投放', '无冰柜'].map(x => <option key={x}>{x}</option>)}</select></CustomerField>
        <div className="customer-field wide"><span>主要竞品</span><div className="customer-checkboxes">{archives.rows.filter(r => r.kind === 'competitors' && r.active).map(r => <label key={r.id}><input type="checkbox" checked={draft.competitors.includes(r.id)} onChange={e => set('competitors', e.target.checked ? [...draft.competitors, r.id] : draft.competitors.filter(x => x !== r.id))} />{r.name}</label>)}</div></div>
        <CustomerField title="门头照片" required={!old} wide hint="5 MB 内的 JPG / PNG / WebP，上传后压缩并添加日期水印。"><span className="customer-photo-upload">{draft.photo ? <img src={draft.photo} alt="门头照片预览" /> : <Camera size={26} />}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={savingPhoto} onChange={async e => { const file = e.target.files?.[0]; if (!file) return; setSavingPhoto(true); try { const data = await readStorePhoto(file, draft.name); set('photo', data); setError('') } catch (error) { setError((error as Error).message) } finally { setSavingPhoto(false) } }} /></span></CustomerField>
        <CustomerField title="备注" wide><textarea rows={3} maxLength={500} value={draft.note} onChange={e => set('note', e.target.value)} placeholder="记录配送偏好、经营情况等" /></CustomerField>
      </div></fieldset>
      {!!changed.length && <div className="customer-confirm-box"><ShieldCheck size={17} /><div><strong>请确认关键字段变更：{changed.join('、')}</strong><label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />我已核对本次变更，确认保存</label></div></div>}
      {!!duplicates.length && <div className="customer-confirm-box warning"><AlertCircle size={17} /><div><strong>疑似重复客户：{duplicates.map(c => c.name).join('、')}</strong><p>名称相似且距离小于 50 米，请核对地址和门店信息。</p><label><input type="checkbox" checked={duplicatesConfirmed} onChange={e => setDuplicatesConfirmed(e.target.checked)} />已核对，仍需建立独立档案</label></div></div>}
      {error && <p role="alert" className="customer-error">{error}</p>}</div>
      <div className="customer-modal-footer"><span><ShieldCheck size={13} />保存至当前浏览器</span><Button type="button" variant="outline" onClick={onClose}>取消</Button><Button type="submit" disabled={savingPhoto || (!!changed.length && !confirmed) || (!!duplicates.length && !duplicatesConfirmed)}><Check size={14} />{savingPhoto ? '正在处理照片…' : '保存客户'}</Button></div>
    </form></DialogContent></Dialog>
}

export type RelatedEditorValue = Extract<RelatedChange, { kind: 'address' | 'contact' | 'visit' }>
export function CustomerRelatedEditor({ initial, onClose, onSave }: { initial: RelatedEditorValue; onClose: () => void; onSave: (change: RelatedEditorValue) => void }) {
  const [draft, setDraft] = useState(initial), [error, setError] = useState('')
  const title = draft.kind === 'address' ? '维护联系地址与定位' : draft.kind === 'contact' ? '维护联系人' : '补录外勤记录'
  const patch = (key: string, value: string | number | boolean) => setDraft(d => { if (d.kind === 'address') return { ...d, value: { ...d.value, [key]: value } }; if (d.kind === 'contact') return { ...d, value: { ...d.value, [key]: value } }; return { ...d, value: { ...d.value, [key]: value } } })
  return <Dialog open onOpenChange={open => !open && onClose()}><DialogContent layer={70} closeLabel="关闭" className="customer-related-editor"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{draft.kind === 'visit' ? '记录已发生的拜访，不产生现场签到或定位凭证。' : '信息保存后会同步出现在客户档案和变更记录中。'}</DialogDescription></DialogHeader><form onSubmit={e => { e.preventDefault(); try { onSave(draft) } catch (e) { setError((e as Error).message) } }}><div className="customer-form-scroll"><div className="customer-form-grid">
    {draft.kind === 'address' && <>
      <CustomerField title="地址名称" required wide><Input required maxLength={40} value={draft.value.label} onChange={e => patch('label', e.target.value)} /></CustomerField>
      {(['province', 'city', 'barangay', 'street', 'detail', 'recipient', 'phone'] as const).map((k, i) => <CustomerField key={k} title={['省 / Province', '市 / City', '区 / Barangay', '街道', '详细地址 / 地标', '收货人', '收货电话'][i]} required={k !== 'street'} wide={k === 'detail'}><Input required={k !== 'street'} type={k === 'phone' ? 'tel' : 'text'} placeholder={k === 'detail' ? '门牌号、楼层、附近地标' : undefined} maxLength={k === 'detail' ? 200 : 80} value={draft.value[k]} onChange={e => patch(k, e.target.value)} /></CustomerField>)}
      {(['latitude', 'longitude'] as const).map((k, i) => <CustomerField key={k} title={i ? '经度' : '纬度'} required><Input required type="number" step="0.000001" min={i ? -180 : -90} max={i ? 180 : 90} value={Number.isFinite(draft.value[k]) ? draft.value[k] : ''} onChange={e => patch(k, e.target.value === '' ? NaN : Number(e.target.value))} /></CustomerField>)}
      <div className="customer-field wide"><CustomerLocationPreview address={draft.value} /></div>
      <div className="customer-check wide"><label><input type="checkbox" checked={draft.value.primary} onChange={e => patch('primary', e.target.checked)} />设为默认地址</label></div>
    </>}
    {draft.kind === 'contact' && <>
      {(['name', 'role', 'phone', 'email', 'note'] as const).map((k, i) => <CustomerField key={k} title={['联系人姓名', '职务', '联系电话', '邮箱', '备注'][i]} required={i < 3} wide={k === 'note'}><Input required={i < 3} type={k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'text'} maxLength={k === 'note' ? 200 : 80} value={draft.value[k]} onChange={e => patch(k, e.target.value)} /></CustomerField>)}
      <div className="customer-check wide"><label><input type="checkbox" checked={draft.value.primary} onChange={e => patch('primary', e.target.checked)} />设为主要联系人</label></div>
    </>}
    {draft.kind === 'visit' && <>
      <CustomerField title="拜访时间" required><Input required type="datetime-local" value={draft.value.date} onChange={e => patch('date', e.target.value)} /></CustomerField>
      <CustomerField title="拜访人" required><Input required maxLength={40} value={draft.value.actor} onChange={e => patch('actor', e.target.value)} /></CustomerField>
      <CustomerField title="拜访类型" required><select value={draft.value.type} onChange={e => patch('type', e.target.value)}>{['日常拜访', '陈列检查', '收款拜访', '客情维护'].map(x => <option key={x}>{x}</option>)}</select></CustomerField>
      <CustomerField title="拜访结果" required><select value={draft.value.result} onChange={e => patch('result', e.target.value)}>{['已完成', '需继续跟进', '门店未营业'].map(x => <option key={x}>{x}</option>)}</select></CustomerField>
      <CustomerField title="拜访内容" required wide><textarea rows={4} required maxLength={1000} value={draft.value.content} onChange={e => patch('content', e.target.value)} placeholder="客户反馈、库存陈列情况、下一步安排" /></CustomerField>
      <CustomerField title="下次跟进日期"><Input type="date" min={draft.value.date.slice(0, 10)} value={draft.value.nextDate} onChange={e => patch('nextDate', e.target.value)} /></CustomerField>
    </>}
  </div>{error && <p className="customer-error" role="alert">{error}</p>}</div><div className="customer-modal-footer"><Button type="button" variant="outline" onClick={onClose}>取消</Button><Button type="submit">保存</Button></div></form></DialogContent></Dialog>
}
