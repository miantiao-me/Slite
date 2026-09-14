import type { GeoLocation } from '../services/geo'

export interface GeoRoutableLink {
  geo?: Record<string, string> | null
}

// Country keys are normalized to uppercase by the link schema, and geo lookup
// returns an uppercase ISO code, so a direct lookup is enough.
export function selectGeoRedirectUrl(link: GeoRoutableLink, location: Pick<GeoLocation, 'country'> | undefined): string | undefined {
  const country = location?.country
  if (!country)
    return undefined

  return link.geo?.[country] || undefined
}
