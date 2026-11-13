import type { ArchiveState } from './basic-data'
import type { OrgScope, OrgState } from './organization'
import { blankProduct, price4, saveProduct } from './catalog.ts'
import type { CatalogState } from './catalog'
export const productImportHeaders = ['商品编码', '商品名称', '英文名称', '品牌编码', '分类编码', '规格描述', '基本单位编码', '销售单位编码', '箱规', '保质期天数', '税率', '价格含税', '标准成本', '最低售价', '标准零售价', '条码', '商品状态', '允许质量退货', '备注']
export type ImportIssue = { row: number; code: string; message: string }
export function parseProductCsv(source: string): string[][] {
  const text = source.replace(/^\uFEFF/, ''), rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false, afterQuote = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') { quoted = false; afterQuote = true }
      else cell += c
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(cell.trim()); cell = ''; afterQuote = false
      if (c !== ',') { if (row.some(v => v)) rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++ }
    } else if (c === '"' && !cell && !afterQuote) quoted = true
    else if (afterQuote && c.trim()) throw new Error('CSV 引号格式错误，请按模板保存为 UTF-8 CSV。')
    else if (!afterQuote) cell += c
  }
  if (quoted) throw new Error('CSV 引号未闭合，请检查后重试。')
  row.push(cell.trim()); if (row.some(v => v)) rows.push(row)
  if (rows.length > 501) throw new Error('每次最多导入 500 个商品，请拆分文件。')
  return rows
}
export function prepareProductImport(source: string, state: CatalogState, archives: ArchiveState, org: OrgState, scope: OrgScope | null) {
  const rows = parseProductCsv(source), headers = rows.shift() ?? []
  if (productImportHeaders.some(h => !headers.includes(h)) || new Set(headers).size !== headers.length) throw new Error('文件列名与模板不一致，请下载最新模板填写。')
  if (!rows.length) throw new Error('文件中没有商品数据，请在模板表头下填写商品。')
  let next = state
  const issues: ImportIssue[] = []
  const number = (v: string, fallback: number) => { if (!v) return fallback; if (!/^\d+(\.\d{1,4})?$/.test(v)) throw new Error('数值须为非负数，最多四位小数。'); return Number(v) }
  const bool = (v: string, fallback: boolean) => { if (!v) return fallback; if (!['是', '否'].includes(v)) throw new Error('布尔字段请填写“是”或“否”。'); return v === '是' }
  rows.forEach((cells, index) => {
    const get = (name: string) => cells[headers.indexOf(name)] ?? ''
    try {
      if (cells.length !== headers.length) throw new Error('数据列数与表头不一致。')
      const findId = (kind: string, code: string) => archives.rows.find(r => r.kind === kind && r.code === code.toUpperCase())?.id ?? ''
      const categoryId = findId('productCategories', get('分类编码')), category = archives.rows.find(r => r.id === categoryId)
      const p = { ...blankProduct(), code: get('商品编码'), name: get('商品名称'), en: get('英文名称'), brandId: findId('brands', get('品牌编码')), categoryId, spec: get('规格描述'), baseUnitId: findId('unitArchives', get('基本单位编码')), salesUnitId: findId('unitArchives', get('销售单位编码')), pack: number(get('箱规'), 24), shelfDays: number(get('保质期天数'), 365), tax: number(get('税率'), Number(category?.values.tax ?? 12)), taxIncluded: bool(get('价格含税'), true), cost4: price4(number(get('标准成本'), 0)), minimum4: price4(number(get('最低售价'), 0)), retail4: price4(number(get('标准零售价'), 0)), barcodes: get('条码').split(/[;；\n]/).filter(Boolean), status: (get('商品状态') || '新品待上市') as ReturnType<typeof blankProduct>['status'], qualityReturn: bool(get('允许质量退货'), true), note: get('备注') }
      next = saveProduct(next, p, archives, org, scope)
    } catch (e) { issues.push({ row: index + 2, code: get('商品编码'), message: (e as Error).message }) }
  })
  // The caller can only persist when all records pass. Do not return a partially imported state.
  return { state: issues.length ? state : next, count: rows.length, issues }
}
