import { useState } from 'react'
import { ArrowDownToLine, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { exportCsv } from '@/components/records'
import { prepareProductImport, productImportHeaders } from '@/lib/catalog-import'
import type { ImportIssue } from '@/lib/catalog-import'
import type { ArchiveState } from '@/lib/basic-data'
import type { CatalogState } from '@/lib/catalog'
import type { OrgScope, OrgState } from '@/lib/organization'
export function CatalogImport({ state, archives, org, scope, onClose, onImport }: { state: CatalogState; archives: ArchiveState; org: OrgState; scope: OrgScope | null; onClose: () => void; onImport: (source: string) => void }) {
  const [source, setSource] = useState(''), [error, setError] = useState(''), [count, setCount] = useState(0), [issues, setIssues] = useState<ImportIssue[]>([]), [busy, setBusy] = useState(false)
  const read = async (file?: File) => {
    setSource(''); setCount(0); setIssues([]); setError('')
    if (!file) return
    if (file.size > 2 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.csv')) { setError('请选择不超过 2 MB 的 UTF-8 CSV 文件。'); return }
    setBusy(true)
    try { const text = await file.text(), result = prepareProductImport(text, state, archives, org, scope); setSource(text); setCount(result.count); setIssues(result.issues) } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={open => !open && onClose()}><DialogContent className="catalog-dialog" closeLabel="关闭"><DialogHeader><DialogTitle>批量导入商品</DialogTitle><DialogDescription>按模板新增商品，每次最多 500 条。先检查全部行，有错误时整批不写入。</DialogDescription></DialogHeader><div className="catalog-review-note"><Upload size={17} /><div><strong>1. 下载模板 → 2. 填写商品 → 3. 上传并检查</strong><p>品牌、分类和单位使用基础档案编码，如 HANI、STICK、CTN、PCS。价格最多四位小数；多条码用分号分隔。商品默认新品待上市，冰淇淋固定冷冻和批次管理。</p></div></div><Button variant="outline" onClick={() => exportCsv(productImportHeaders, [], '商品导入模板.csv')}><ArrowDownToLine size={14} />下载导入模板</Button><label className="catalog-field"><span>选择 UTF-8 CSV 文件</span><input type="file" aria-label="选择商品导入文件" accept=".csv,text/csv" onChange={e => { void read(e.target.files?.[0]) }} /></label>{busy && <p role="status">正在检查商品数据…</p>}{error && <p className="catalog-error" role="alert">{error}</p>}{count > 0 && <div className="catalog-detail-note">共 {count} 行 · {issues.length ? `${issues.length} 行存在错误，请修改文件后重新上传` : '全部检查通过，可以导入'}</div>}{issues.length > 0 && <><div className="catalog-table-scroll"><table className="catalog-table"><thead><tr><th>数据行号</th><th>商品编码</th><th>错误原因</th></tr></thead><tbody>{issues.map(issue => <tr key={issue.row}><td>{issue.row}</td><td>{issue.code || '—'}</td><td>{issue.message}</td></tr>)}</tbody></table></div><Button variant="outline" onClick={() => exportCsv(['数据行号', '商品编码', '错误原因'], issues.map(i => [i.row, i.code, i.message]), '商品导入错误明细.csv')}>导出错误明细</Button></>}<div className="catalog-form-footer"><Button variant="outline" onClick={onClose}>取消</Button><Button disabled={busy || !source || !count || !!issues.length || !!error} onClick={() => { try { onImport(source) } catch (e) { setError((e as Error).message) } }}>确认导入 {count || ''} 个商品</Button></div></DialogContent></Dialog>
}
