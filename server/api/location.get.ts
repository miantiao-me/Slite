import { lookupGeo } from '../services/geo'
import { requestClientIp } from '../utils/client-ip'

defineRouteMeta({
  openAPI: {
    description: 'Get the location of the user',
    responses: {
      200: {
        description: 'The location of the user',
      },
    },
  },
})

export default eventHandler((event) => {
  const location = lookupGeo(requestClientIp(event))

  // Sink/CurrentLocation semantics: omit missing coordinates so the JSON body is {}.
  return {
    latitude: location?.latitude ?? undefined,
    longitude: location?.longitude ?? undefined,
  }
})
