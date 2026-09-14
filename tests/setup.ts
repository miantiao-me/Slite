import { afterAll, beforeAll } from 'vitest'
import { server } from './utils'

beforeAll(async () => {
  if (server.requested)
    await server.start()
})

afterAll(async () => {
  await server.dispose()
})
