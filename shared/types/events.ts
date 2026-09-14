export interface LogEvent {
  id: string
  slug: string
  os?: string
  browser?: string
  country?: string
  city?: string
  latitude?: number
  longitude?: number
  timestamp: number
}
