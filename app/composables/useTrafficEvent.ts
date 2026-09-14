import type { ComputedRef } from 'vue'
import type { RippleData } from './globe/types'
import type { LogEvent } from '@/types'

const RIPPLE_DURATION = 960

export interface TrafficEventContext {
  rippleColor: ComputedRef<string>
  globe: {
    isReady: () => boolean
    drawRipple: (rippleData: RippleData) => void
  }
}

export function useTrafficEvent(ctx: TrafficEventContext) {
  function handleTrafficEvent(item: LogEvent) {
    if (!ctx.globe.isReady())
      return

    const { latitude, longitude, city } = item
    if (latitude == null || longitude == null) {
      if (import.meta.dev)
        console.info('Skipping traffic event without coordinates', item.id)
      return
    }

    if (import.meta.dev)
      console.info(`Access from ${city} (${latitude}, ${longitude})`)

    ctx.globe.drawRipple({
      lat: latitude,
      lng: longitude,
      maxRadius: 3,
      duration: RIPPLE_DURATION,
      color: ctx.rippleColor.value,
    })
  }

  return {
    handleTrafficEvent,
  }
}
