import { ArrowUpRight, MapPin } from 'lucide-react'
import { customerMapUrl } from '@/lib/customers'
import type { CustomerAddress } from '@/lib/customers'

export function CustomerLocationLink({ address }: { address?: Pick<CustomerAddress, 'latitude' | 'longitude'> }) {
  const url = customerMapUrl(address)
  return url
    ? <a className="customer-location-link" href={url} target="_blank" rel="noopener noreferrer" aria-label="查看定位（在新窗口打开 Google 地图）"><MapPin size={13} />查看定位<ArrowUpRight size={12} /></a>
    : <span className="customer-location-unset">尚未设置定位</span>
}

export function CustomerLocationPreview({ address }: { address?: Pick<CustomerAddress, 'latitude' | 'longitude'> }) {
  const valid = !!customerMapUrl(address)
  return <div className="customer-location-preview">
    <span className="customer-location-icon"><MapPin size={20} /></span>
    <div><strong>门店定位</strong><p>{valid && address ? `纬度 ${address.latitude.toFixed(6)} / 经度 ${address.longitude.toFixed(6)}` : '填写门店经纬度后，可在地图上核对位置。'}</p><small>根据档案中保存的坐标，在 Google 地图查看门店位置。</small></div>
    <CustomerLocationLink address={address} />
  </div>
}
