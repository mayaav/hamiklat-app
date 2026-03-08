export type ShelterSource = 'official' | 'community'
export type ShelterStatus = 'active' | 'unverified' | 'verified' | 'closed' | 'flagged'
export type ReportType = 'locked' | 'inaccessible' | 'dirty' | 'unsafe' | 'closed' | 'fake' | 'other'

export interface Shelter {
  id: string
  name: string
  address: string
  city: string
  lat: number
  lng: number
  source: ShelterSource
  status: ShelterStatus
  shelter_type: string | null
  floor: string | null
  capacity: number | null
  is_accessible: boolean
  accessibility_notes: string | null
  hours: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  verification_count: number
  report_count: number
  avg_rating: number | null
  rating_count?: number
  photo_count: number
  // joined from photos
  photos?: Photo[]
  // computed
  distance?: number
  category?: import('@/lib/shelterCategory').ShelterCategory
}

export interface Comment {
  id: string
  shelter_id: string
  user_id: string
  content: string
  created_at: string
  users?: { display_name: string | null }
}

export interface Rating {
  id: string
  shelter_id: string
  user_id: string
  score: number
  created_at: string
}

export interface Photo {
  id: string
  shelter_id: string
  user_id: string
  url: string
  caption: string | null
  created_at: string
}

export interface Report {
  id: string
  shelter_id: string
  type: ReportType
  description: string | null
  created_at: string
}

export interface User {
  id: string
  display_name: string | null
  avatar_url: string | null
  role: 'user' | 'moderator' | 'admin'
}
