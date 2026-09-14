import { describe, expect, it } from 'vitest'
import { fetch, useTestServer } from '../utils'

useTestServer()

interface SecurityRequirement {
  bearerAuth: unknown[]
}

interface JsonSchema {
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  description?: string
}

interface Operation {
  security?: SecurityRequirement[]
  requestBody?: {
    content?: Record<string, { schema?: JsonSchema }>
  }
}

describe('openapi document', () => {
  it('documents bearer auth for every /api route except the public location endpoint', async () => {
    const response = await fetch('/_docs/openapi.json')
    expect(response.status).toBe(200)

    const spec = await response.json() as {
      components?: { securitySchemes?: Record<string, unknown> }
      paths: Record<string, Record<string, Operation>>
    }

    expect(spec.components?.securitySchemes?.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    })

    const apiPaths = Object.entries(spec.paths).filter(([path]) => path.startsWith('/api/'))
    expect(apiPaths.length).toBeGreaterThan(0)

    for (const [path, methods] of apiPaths) {
      for (const [method, operation] of Object.entries(methods)) {
        if (!['get', 'post', 'put', 'delete', 'patch'].includes(method))
          continue
        if (path === '/api/location') {
          expect(operation.security, 'GET /api/location must stay public').toBeUndefined()
          continue
        }
        expect(operation.security, `${method.toUpperCase()} ${path} must require bearer auth`).toEqual([{ bearerAuth: [] }])
      }
    }
  })

  it('publishes geo routing in the create, edit, upsert, and import request schemas', async () => {
    const response = await fetch('/_docs/openapi.json')
    expect(response.status).toBe(200)

    const spec = await response.json() as {
      paths: Record<string, Record<string, Operation>>
    }

    expect(JSON.stringify(spec)).toContain('Geo-routing rules')

    const requestSchemas: Array<[string, JsonSchema | undefined]> = [
      ['POST /api/link/create', spec.paths['/api/link/create']?.post?.requestBody?.content?.['application/json']?.schema],
      ['PUT /api/link/edit', spec.paths['/api/link/edit']?.put?.requestBody?.content?.['application/json']?.schema],
      ['POST /api/link/upsert', spec.paths['/api/link/upsert']?.post?.requestBody?.content?.['application/json']?.schema],
    ]
    for (const [label, schema] of requestSchemas) {
      const geo = schema?.properties?.geo
      expect(geo, `${label} must publish geo`).toMatchObject({ type: 'object' })
      expect(geo?.description, `${label} geo must follow the Sink contract`).toMatch(/Geo-routing rules/)
    }

    const importGeo = spec.paths['/api/link/import']?.post?.requestBody?.content?.['application/json']?.schema?.properties?.links?.items?.properties?.geo
    expect(importGeo?.description).toMatch(/round-trip preserved/i)
    expect(importGeo?.description).toMatch(/country-based redirects/i)
  })
})
