'use client'

import { useCallback } from 'react'
import Map, { Marker } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!
const MAPBOX_STYLE = 'mapbox://styles/mayaav/cmmi105xi002501qw7k6qc267'

interface PinDropMapProps {
  lat: number
  lng: number
  onChange: (lat: number, lng: number) => void
}

export default function PinDropMap({ lat, lng, onChange }: PinDropMapProps) {
  const handleClick = useCallback((e: { lngLat: { lat: number; lng: number } }) => {
    onChange(e.lngLat.lat, e.lngLat.lng)
  }, [onChange])

  return (
    <Map
      initialViewState={{ longitude: lng, latitude: lat, zoom: 17 }}
      style={{ width: '100%', height: '100%' }}
      mapStyle={MAPBOX_STYLE}
      mapboxAccessToken={MAPBOX_TOKEN}
      attributionControl={false}
      onClick={handleClick}
    >
      <Marker
        longitude={lng}
        latitude={lat}
        anchor="bottom"
        draggable
        onDragEnd={(e) => onChange(e.lngLat.lat, e.lngLat.lng)}
      >
        <div style={{ fontSize: 28, lineHeight: 1, cursor: 'grab' }}>📍</div>
      </Marker>
    </Map>
  )
}
