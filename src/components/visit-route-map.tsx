import { useEffect, useRef, useState } from 'react'
import * as L from 'leaflet'
import { Expand, MapPinned, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePreferences } from '@/lib/preferences'
import { visitEn, visitZh } from '@/lib/visit-route-i18n'
import type { VisitOutlet } from '@/lib/visit-routes'
import 'leaflet/dist/leaflet.css'

export function VisitRouteMap({ outlets, selectedIds, assignedIds, focusId, onToggle }: {
  outlets: VisitOutlet[]
  selectedIds: string[]
  assignedIds: Set<string>
  focusId: string | null
  onToggle: (id: string) => void
}) {
  const { mode, locale } = usePreferences()
  const text = locale === 'zh' ? visitZh : visitEn
  const element = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const tiles = useRef<L.TileLayer | null>(null)
  const fitKey = useRef('')
  const lastFocus = useRef<string | null>(null)
  const [tileStatus, setTileStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const fit = () => {
    if (!map.current || !outlets.length) return
    map.current.fitBounds(L.latLngBounds(outlets.map(outlet => outlet.position)), { padding: [50, 55], maxZoom: 13, animate: false })
  }

  useEffect(() => {
    if (!element.current) return
    const instance = L.map(element.current, { zoomControl: false, scrollWheelZoom: false }).setView([12.5, 122], 6)
    map.current = instance
    L.control.zoom({ position: 'bottomright', zoomInTitle: locale === 'zh' ? '放大' : 'Zoom in', zoomOutTitle: locale === 'zh' ? '缩小' : 'Zoom out' }).addTo(instance)
    const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    tiles.current = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(instance)
    tiles.current.on('tileload', () => setTileStatus('ready'))
    tiles.current.on('tileerror', () => setTileStatus('error'))
    layer.current = L.layerGroup().addTo(instance)
    fitKey.current = ''
    const resize = new ResizeObserver(() => instance.invalidateSize({ pan: false }))
    resize.observe(element.current)
    return () => { resize.disconnect(); instance.remove(); map.current = null; layer.current = null; tiles.current = null }
  }, [locale, mode])

  useEffect(() => {
    if (!map.current || !layer.current) return
    layer.current.clearLayers()
    outlets.forEach(outlet => {
      const index = selectedIds.indexOf(outlet.id)
      const state = index >= 0 ? 'selected' : assignedIds.has(outlet.id) ? 'assigned' : 'unassigned'
      const icon = L.divIcon({ className: `visit-map-pin pin-${state}`, html: `<span>${index >= 0 ? index + 1 : '<i></i>'}</span>`, iconSize: [30, 36], iconAnchor: [15, 34], tooltipAnchor: [0, -32] })
      const marker = L.marker(outlet.position, { icon, title: outlet.name, alt: outlet.name, keyboard: true, zIndexOffset: index >= 0 ? 100 : 0 })
      const tooltip = document.createElement('div')
      tooltip.textContent = outlet.name
      marker.bindTooltip(tooltip, { direction: 'top' })
      marker.on('click', () => onToggle(outlet.id))
      marker.addTo(layer.current!)
      marker.getElement()?.setAttribute('aria-label', `${outlet.name} · ${state === 'selected' ? text.selected : state === 'assigned' ? text.assigned : text.unassigned}`)
      marker.getElement()?.setAttribute('aria-pressed', String(index >= 0))
    })
    const key = `${locale}:${mode}:${outlets.map(outlet => outlet.id).join(',')}`
    if (key !== fitKey.current && outlets.length) {
      map.current.invalidateSize({ pan: false })
      map.current.fitBounds(L.latLngBounds(outlets.map(outlet => outlet.position)), { padding: [50, 55], maxZoom: 13, animate: false })
      fitKey.current = key
    }
  }, [outlets, selectedIds, assignedIds, onToggle, locale, mode, text])

  useEffect(() => {
    if (!focusId) { lastFocus.current = null; return }
    if (lastFocus.current === focusId) return
    const outlet = outlets.find(item => item.id === focusId)
    if (outlet && map.current) { map.current.setView(outlet.position, 14, { animate: false }); lastFocus.current = focusId }
  }, [focusId, outlets])

  useEffect(() => {
    if (tileStatus !== 'loading') return
    const timeout = window.setTimeout(() => setTileStatus(current => current === 'loading' ? 'error' : current), 12000)
    return () => window.clearTimeout(timeout)
  }, [tileStatus])

  return <div className="visit-map-panel">
    <div ref={element} className="visit-leaflet" role="region" aria-label={text.mapTitle} />
    <div className="visit-map-caption"><MapPinned size={15} /><span>{text.mapSample}</span></div>
    <Button variant="outline" size="icon" className="visit-map-fit" aria-label={text.fitMap} title={text.fitMap} onClick={fit}><Expand size={17} /></Button>
    {tileStatus === 'loading' && <span className="visit-map-loading">{text.mapLoading}</span>}
    {tileStatus === 'error' && <div className="visit-map-error"><span>{text.mapUnavailable}</span><Button size="sm" variant="outline" onClick={() => { setTileStatus('loading'); tiles.current?.redraw() }}><RefreshCw size={13} />{text.mapRetry}</Button></div>}
  </div>
}
