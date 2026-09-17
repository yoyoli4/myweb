'use client'

import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { places, type Place } from '@/data/content'
import { formatDate } from '@/lib/date'
import Lightbox from './Lightbox'

/** 金色光点标记 */
const goldIcon = L.divIcon({
  html: '<div class="map-pin"><span class="ring"></span><span class="dot"></span></div>',
  className: 'map-pin-icon',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
})

/**
 * 图源方案：
 * - carto：CARTO 深色底图，坐标为 WGS-84，海外访问快，视觉最贴合
 * - gaode：高德底图，国内访问稳定；用 CSS 滤镜反色成暗紫金调
 *   （注：高德为 GCJ-02 坐标，国内标记会有几百米偏移，城市级展示可忽略）
 * 页面加载时先探测 CARTO，超时则自动降级，海外部署 Vercel 时会优先用 CARTO。
 */
type Provider = 'carto' | 'gaode'

const TILE_CONFIG: Record<
  Provider,
  { url: string; subdomains: string[]; attribution: string; maxZoom: number }
> = {
  carto: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: ['a', 'b', 'c', 'd'],
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
  },
  gaode: {
    url: 'https://webrd{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    subdomains: ['01', '02', '03', '04'],
    attribution: '&copy; 高德地图',
    maxZoom: 18,
  },
}

/** 探测某张瓦片能否在 5 秒内加载 */
function probeTile(url: string, timeout = 5000) {
  return new Promise<boolean>((resolve) => {
    const img = new Image()
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      img.onload = img.onerror = null
      resolve(ok)
    }
    img.onload = () => finish(true)
    img.onerror = () => finish(false)
    img.src = url
    window.setTimeout(() => finish(false), timeout)
  })
}

/** 打开时自动缩放到包含所有地点的视野 */
function FitBounds({ coords }: { coords: [number, number][] }) {
  const map = useMap()
  const signature = coords.map((c) => c.join(',')).join('|')

  useEffect(() => {
    if (coords.length === 0) return
    const bounds = L.latLngBounds(
      coords.map(([lat, lng]) => L.latLng(lat, lng)),
    )
    // 窄屏（手机）上如果所有点跨度太大，fit 出来的视野会缩到世界地图、
    // 大片海洋反色后近黑；此时改为居中放大，牺牲边缘个别点换可读性。
    const fitZoom = map.getBoundsZoom(bounds, false, L.point(64, 100))
    if (map.getSize().x < 640 && fitZoom < 4) {
      map.setView(bounds.getCenter(), 4, { animate: false })
    } else {
      map.fitBounds(bounds, {
        paddingTopLeft: [60, 96],
        paddingBottomRight: [48, 110],
        maxZoom: 11,
        animate: false,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature])

  return null
}

/** 标记点开后的回忆卡片 */
function PlaceCard({
  place,
  onOpenPhoto,
}: {
  place: Place
  onOpenPhoto: (index: number) => void
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-gold/25 bg-[#150E22]/95 shadow-[0_28px_80px_rgba(0,0,0,0.7)] backdrop-blur-xl">
      {place.photos[0] && (
        <button
          type="button"
          onClick={() => onOpenPhoto(0)}
          className="group relative block h-44 w-full overflow-hidden bg-ink-600"
          aria-label={`放大查看 ${place.name} 的照片`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={place.photos[0]}
            alt={place.name}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-[#150E22]/70 via-transparent to-transparent" />
          <span className="absolute bottom-2 right-3 rounded-full border border-gold/40 bg-black/40 px-2 py-0.5 text-[10px] tracking-[0.2em] text-gold-bright">
            点击放大
          </span>
        </button>
      )}

      <div className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-serif text-xl tracking-wide text-gold-bright">
            {place.name}
          </h3>
          <time className="shrink-0 text-[11px] tracking-[0.18em] text-mute">
            {formatDate(place.date)}
          </time>
        </div>

        <p className="mt-3 text-[13px] leading-7 text-[#C9C0DC]">{place.text}</p>

        {place.photos.length > 1 && (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {place.photos.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => onOpenPhoto(i)}
                className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-ink-600 transition-opacity hover:opacity-100 ${
                  i === 0 ? 'border-gold/40 opacity-70' : 'border-gold/25 opacity-80'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

export default function WorldMap() {
  const [provider, setProvider] = useState<Provider | null>(null)
  const [lightbox, setLightbox] = useState<{
    photos: string[]
    index: number
  } | null>(null)

  const coords = useMemo<[number, number][]>(
    () => places.map((p) => [p.lat, p.lng]),
    [],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cartoOk = await probeTile(
        'https://a.basemaps.cartocdn.com/dark_all/8/210/99.png',
        5000,
      )
      if (!cancelled) setProvider(cartoOk ? 'carto' : 'gaode')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const tiles = provider ? TILE_CONFIG[provider] : null

  return (
    <div className={`relative h-full w-full map-mode-${provider ?? 'loading'}`}>
      <MapContainer
        center={[32, 112]}
        zoom={4}
        minZoom={2}
        maxZoom={18}
        zoomControl={false}
        worldCopyJump
        className="h-full w-full"
      >
        {tiles && (
          <TileLayer
            key={provider}
            url={tiles.url}
            subdomains={tiles.subdomains}
            maxZoom={tiles.maxZoom}
            maxNativeZoom={tiles.maxZoom}
            attribution={tiles.attribution}
          />
        )}
        <ZoomControl position="bottomright" />
        <FitBounds coords={coords} />

        {places.map((place) => (
          <Marker
            key={place.id}
            position={[place.lat, place.lng]}
            icon={goldIcon}
          >
            <Popup
              className="place-popup"
              offset={[0, -8]}
              autoPan
              autoPanPadding={[16, 88]}
              closeButton={false}
            >
              <PlaceCard
                place={place}
                onOpenPhoto={(index) =>
                  setLightbox({ photos: place.photos, index })
                }
              />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* 地图氛围罩 */}
      <div className="map-tint" />

      {/* 图源探测中的加载层 */}
      {!provider && (
        <div className="absolute inset-0 z-[600] flex flex-col items-center justify-center gap-5 bg-ink">
          <div className="map-pin" style={{ width: 34, height: 34 }}>
            <span className="ring" />
            <span className="dot" />
          </div>
          <p className="text-xs tracking-[0.5em] text-mute">正在点亮地图…</p>
        </div>
      )}

      {/* 照片灯箱 */}
      {lightbox && (
        <Lightbox
          photos={lightbox.photos}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={(index) => setLightbox({ ...lightbox, index })}
        />
      )}
    </div>
  )
}
