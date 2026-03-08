import type { Shelter } from '@/types'

export type ShelterCategory =
  | 'public_shelter'
  | 'school'
  | 'high_school'
  | 'shopping_mall'
  | 'public_building'
  | 'underground_parking'
  | 'hospital'
  | 'transport_station'
  | 'community_center'
  | 'residential_building'
  | 'community_added'
  | 'unknown'

interface CategoryConfig {
  label: string
  emoji: string      // shown in cards
  mapSymbol: string  // shown on map pin (shorter)
  color: string      // background color of pin
  textColor: string
}

export const CATEGORY_CONFIG: Record<ShelterCategory, CategoryConfig> = {
  public_shelter:      { label: 'מקלט ציבורי',     emoji: '🛡️', mapSymbol: '🛡',  color: '#1c1c1c', textColor: '#ffffff' },
  school:              { label: 'בית ספר',           emoji: '🏫', mapSymbol: '📚', color: '#3b82f6', textColor: '#ffffff' },
  high_school:         { label: 'תיכון',             emoji: '🎓', mapSymbol: '🎓', color: '#6366f1', textColor: '#ffffff' },
  shopping_mall:       { label: 'קניון',             emoji: '🛍️', mapSymbol: '🛍', color: '#8b5cf6', textColor: '#ffffff' },
  public_building:     { label: 'מבנה ציבורי',      emoji: '🏛️', mapSymbol: '🏛', color: '#64748b', textColor: '#ffffff' },
  underground_parking: { label: 'חניון תת-קרקעי',  emoji: '🅿️', mapSymbol: 'P',  color: '#0ea5e9', textColor: '#ffffff' },
  hospital:            { label: 'בית חולים / מרפאה', emoji: '🏥', mapSymbol: '+',  color: '#ef4444', textColor: '#ffffff' },
  transport_station:   { label: 'תחנת תחבורה',      emoji: '🚉', mapSymbol: '🚉', color: '#f97316', textColor: '#ffffff' },
  community_center:    { label: 'מרכז קהילתי',      emoji: '🏢', mapSymbol: '🏢', color: '#14b8a6', textColor: '#ffffff' },
  residential_building:{ label: 'ממ"ד / בניין מגורים', emoji: '🏠', mapSymbol: '🏠', color: '#a3a3a3', textColor: '#ffffff' },
  community_added:     { label: 'דיווח קהילתי',       emoji: '🤝', mapSymbol: '🤝', color: '#22c55e', textColor: '#ffffff' },
  unknown:             { label: 'מקום מוגן',         emoji: '❓', mapSymbol: '?',  color: '#d1d5db', textColor: '#374151' },
}

// Hebrew keyword patterns for category inference
const PATTERNS: Array<{ pattern: RegExp; category: ShelterCategory }> = [
  // Parking / underground
  { pattern: /חניון|parking/i,                                     category: 'underground_parking' },
  // Hospital / clinic
  { pattern: /בית.?חולים|מרפאה|קופת.?חולים|hospital|clinic/i,     category: 'hospital' },
  // High school
  { pattern: /תיכון|גימנסיה|אולפנה|ulpana|high.?school/i,         category: 'high_school' },
  // School (after high school check)
  { pattern: /בית.?ספר|ביה"ס|בי"ס|ביס |school/i,                  category: 'school' },
  // Shopping mall
  { pattern: /קניון|מרכז.?מסחרי|mall|shopping/i,                   category: 'shopping_mall' },
  // Transport
  { pattern: /תחנה|רכבת|station|train|metro|נמל/i,                 category: 'transport_station' },
  // Community center
  { pattern: /מרכז.?קהילתי|community.?center|מועדון/i,             category: 'community_center' },
  // Municipality / public
  { pattern: /עירייה|מועצה|municipality|ממשלת|government|לשכה/i,   category: 'public_building' },
]

export function inferCategory(shelter: Shelter): ShelterCategory {
  const type = shelter.shelter_type ?? ''

  // Community-added shelters get their own category unless they have a specific type
  if (shelter.source === 'community' && !type) return 'community_added'

  // Explicit type mapping first
  if (type === 'mamad') return 'residential_building'
  if (type === 'public_shelter') return 'public_shelter'

  // Name-based inference
  const haystack = `${shelter.name} ${shelter.address} ${shelter.notes ?? ''}`
  for (const { pattern, category } of PATTERNS) {
    if (pattern.test(haystack)) return category
  }

  // Remaining shelter_type fallbacks
  if (type === 'building_shelter') return 'public_building'
  if (type === 'other') return shelter.source === 'community' ? 'community_added' : 'unknown'

  return shelter.source === 'community' ? 'community_added' : 'unknown'
}
