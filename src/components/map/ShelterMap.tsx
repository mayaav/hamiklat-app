'use client'

import { useEffect, useRef, useCallback } from 'react'
import Map, { Marker, useMap } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Shelter } from '@/types'
import { inferCategory, CATEGORY_CONFIG } from '@/lib/shelterCategory'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!
const MAPBOX_STYLE = 'mapbox://styles/mayaav/cmmi105xi002501qw7k6qc267'

// ─── Marker HTML factories ────────────────────────────────────────────────────

function shelterMarkerHtml(shelter: Shelter, highlighted = false): string {
  const category = shelter.category ?? inferCategory(shelter)
  const cfg = CATEGORY_CONFIG[category]

  if (highlighted) {
    const size = 48
    return `<div style="
      position:relative;width:${size}px;height:${size + 10}px;
      display:flex;flex-direction:column;align-items:center;
      cursor:pointer;
    ">
      <style>@keyframes sh-p{0%,100%{box-shadow:0 0 0 0 ${cfg.color}44}50%{box-shadow:0 0 0 8px ${cfg.color}00}}</style>
      <div style="
        width:${size}px;height:${size}px;
        background:${cfg.color}33;
        border:2px solid ${cfg.color};
        border-radius:50%;
        box-shadow:0 2px 12px ${cfg.color}66;
        display:flex;align-items:center;justify-content:center;
        font-size:22px;line-height:1;
        animation:sh-p 1.8s ease-out infinite;
        pointer-events:none;
      ">${cfg.mapSymbol}</div>
      <div style="
        width:0;height:0;
        border-left:6px solid transparent;
        border-right:6px solid transparent;
        border-top:10px solid ${cfg.color};
        margin-top:-1px;
        pointer-events:none;
      "></div>
    </div>`
  }

  const size = 32
  const isTextSymbol = cfg.mapSymbol === 'P' || cfg.mapSymbol === '+'
  const symbolStyle = isTextSymbol
    ? 'font-family:system-ui,sans-serif;font-weight:900;font-size:13px;'
    : 'font-size:15px;'
  const border = `1.5px solid ${cfg.color}99`
  const badge = ''
  return `<div style="
    position:relative;
    width:${size}px;height:${size}px;
    background:${cfg.color}33;
    border:${border};
    border-radius:50%;
    box-shadow:0 1px 6px rgba(0,0,0,0.12);
    display:flex;align-items:center;justify-content:center;
    ${symbolStyle}
    cursor:pointer;line-height:1;
  "><span style="pointer-events:none">${cfg.mapSymbol}</span>${badge}</div>`
}

// ─── Main component ────────────────────────────────────────────────────────────

interface ShelterMapProps {
  shelters: Shelter[]
  userLocation: [number, number] | null
  flyTarget?: { coords: [number, number]; seq: number }
  highlightedShelterId?: string
  sheetFraction?: number
  onShelterClick: (shelter: Shelter) => void
  onBoundsChange: (bounds: { getSouth: () => number; getWest: () => number; getNorth: () => number; getEast: () => number }) => void
  onRecenter?: () => void
}

export default function ShelterMap(props: ShelterMapProps) {
  return (
    <Map
      initialViewState={{ longitude: 35.2137, latitude: 31.7683, zoom: 8 }}
      style={{ width: '100%', height: '100%' }}
      mapStyle={MAPBOX_STYLE}
      mapboxAccessToken={MAPBOX_TOKEN}
      attributionControl={false}
    >
      <MapInner {...props} />
    </Map>
  )
}

function MapInner({
  shelters,
  userLocation,
  flyTarget,
  highlightedShelterId,
  sheetFraction = 0,
  onShelterClick,
  onBoundsChange,
  onRecenter,
}: ShelterMapProps) {
  const { current: map } = useMap()
  const prevSeq = useRef(-1)

  // Fly to target when seq changes
  useEffect(() => {
    if (!map || !flyTarget) return
    if (flyTarget.seq === prevSeq.current) return
    prevSeq.current = flyTarget.seq
    map.flyTo({ center: [flyTarget.coords[1], flyTarget.coords[0]], zoom: 16, duration: 1200 })
  }, [flyTarget, map])

  // Bounds change
  const handleMoveEnd = useCallback(() => {
    if (!map) return
    const b = map.getBounds()
    onBoundsChange({
      getSouth: () => b.getSouth(),
      getWest: () => b.getWest(),
      getNorth: () => b.getNorth(),
      getEast: () => b.getEast(),
    })
  }, [map, onBoundsChange])

  useEffect(() => {
    if (!map) return
    map.on('moveend', handleMoveEnd)
    map.on('zoomend', handleMoveEnd)
    return () => {
      map.off('moveend', handleMoveEnd)
      map.off('zoomend', handleMoveEnd)
    }
  }, [map, handleMoveEnd])

  return (
    <>
      {/* User location dot */}
      {userLocation && (
        <Marker longitude={userLocation[1]} latitude={userLocation[0]} anchor="center">
          <div style={{
            width: 16, height: 16,
            background: '#4285f4',
            border: '2.5px solid white',
            borderRadius: '50%',
            boxShadow: '0 0 0 5px rgba(66,133,244,0.2)',
          }} />
        </Marker>
      )}

      {/* Shelter markers */}
      {shelters.map((shelter) => {
        const isHighlighted = shelter.id === highlightedShelterId
        return (
          <Marker
            key={shelter.id}
            longitude={shelter.lng}
            latitude={shelter.lat}
            anchor={isHighlighted ? 'bottom' : 'center'}
            onClick={() => onShelterClick(shelter)}
            style={{ zIndex: isHighlighted ? 10 : 1 }}
          >
            <div
              dangerouslySetInnerHTML={{ __html: shelterMarkerHtml(shelter, isHighlighted) }}
              onClick={() => onShelterClick(shelter)}
            />
          </Marker>
        )
      })}

      {/* Zoom + recenter controls */}
      <div style={{
        position: 'absolute',
        right: 14,
        bottom: `calc(${Math.round((sheetFraction) * 100)}% + 16px)`,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        background: 'white',
        borderRadius: 14,
        boxShadow: '0 2px 12px rgba(0,0,0,0.13)',
        overflow: 'hidden',
      }}>
        <button
          style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 300, borderBottom: '1px solid #f0f0f0', cursor: 'pointer', background: 'none', border: 'none' }}
          onClick={() => map?.zoomIn()}
          aria-label="Zoom in"
        >+</button>
        <button
          style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 300, cursor: 'pointer', background: 'none', border: 'none', borderBottom: userLocation ? '1px solid #f0f0f0' : 'none' }}
          onClick={() => map?.zoomOut()}
          aria-label="Zoom out"
        >−</button>
        {userLocation && (
          <button
            style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, cursor: 'pointer', background: 'none', border: 'none' }}
            onClick={() => onRecenter?.()}
            aria-label="Recenter"
          >⊙</button>
        )}
      </div>
    </>
  )
}
