import { describe, expect, it } from 'vitest'
import { fetch, useTestServer } from '../utils'

useTestServer()

type JsonObject = Record<string, any>

interface SecurityRequirement {
  bearerAuth: unknown[]
}

async function getOpenApiSpec(): Promise<JsonObject> {
  const response = await fetch('/_docs/openapi.json')
  expect(response.status).toBe(200)
  const spec = await response.json() as JsonObject
  expect(spec.openapi).toBe('3.1.0')
  return spec
}

/** Link request bodies are component $refs injected by server/plugins/openapi.ts. */
function resolveSchema(spec: JsonObject, schema: JsonObject | undefined): JsonObject | undefined {
  const ref = typeof schema?.$ref === 'string' ? schema.$ref : ''
  const match = ref.match(/^#\/components\/schemas\/(.+)$/)
  return match?.[1] ? spec.components?.schemas?.[match[1]] : schema
}

function jsonBodySchema(spec: JsonObject, path: string, method: string) {
  const requestBody = spec.paths?.[path]?.[method]?.requestBody
  expect(requestBody, `${method.toUpperCase()} ${path} requestBody`).toBeTruthy()
  expect(requestBody.required).toBe(true)
  const media = requestBody.content?.['application/json']
  // Regression guard: Nitro's route-meta extractor used to emit {} here.
  expect(media, `${method.toUpperCase()} ${path} application/json`).not.toEqual({})
  return media?.schema
}

describe('openapi document', () => {
  it('documents bearer auth for every /api route except the public location endpoint', async () => {
    const spec = await getOpenApiSpec()

    expect(spec.components?.securitySchemes?.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    })

    const apiPaths = Object.entries(spec.paths as Record<string, Record<string, { security?: SecurityRequirement[] }>>)
      .filter(([path]) => path.startsWith('/api/'))
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

  it('injects request body schemas into the link routes', async () => {
    const spec = await getOpenApiSpec()

    expect(spec.components?.schemas?.CreateLink).toBeTruthy()
    expect(spec.components?.schemas?.EditLink).toBeTruthy()
    expect(spec.components?.schemas?.ImportData).toBeTruthy()

    expect(jsonBodySchema(spec, '/api/link/create', 'post')).toEqual({ $ref: '#/components/schemas/CreateLink' })
    expect(jsonBodySchema(spec, '/api/link/upsert', 'post')).toEqual({ $ref: '#/components/schemas/CreateLink' })
    expect(jsonBodySchema(spec, '/api/link/edit', 'put')).toEqual({ $ref: '#/components/schemas/EditLink' })
    expect(jsonBodySchema(spec, '/api/link/import', 'post')).toEqual({ $ref: '#/components/schemas/ImportData' })
  })

  it('documents CreateLink without write-time generated defaults', async () => {
    const spec = await getOpenApiSpec()
    const createLink = spec.components?.schemas?.CreateLink

    expect(createLink?.required).toEqual(['url'])
    expect(createLink?.properties?.url?.format).toBe('uri')
    expect(createLink?.properties?.id).toBeTruthy()
    expect(createLink?.properties?.slug).toBeTruthy()
    expect(createLink?.properties?.createdAt).toBeTruthy()
    expect(createLink?.properties?.updatedAt).toBeTruthy()
    expect(createLink?.properties?.id?.default).toBeUndefined()
    expect(createLink?.properties?.slug?.default).toBeUndefined()
    expect(createLink?.properties?.createdAt?.default).toBeUndefined()
    expect(createLink?.properties?.updatedAt?.default).toBeUndefined()
  })

  it('documents EditLink with a clearable password', async () => {
    const spec = await getOpenApiSpec()
    const password = spec.components?.schemas?.EditLink?.properties?.password

    expect(password?.type).toBe('string')
    // An empty string clears the password, so no minLength may be published.
    expect(password?.minLength).toBeUndefined()
    expect(password?.description).toContain('empty string clears')
  })

  it('documents ImportData with full link items', async () => {
    const spec = await getOpenApiSpec()
    const importData = spec.components?.schemas?.ImportData

    expect(importData?.required).toEqual(expect.arrayContaining(['version', 'links']))
    const items = importData?.properties?.links?.items
    expect(items?.type).toBe('object')
    expect(items?.required).toEqual(expect.arrayContaining(['url', 'slug']))
    expect(items?.properties?.url?.format).toBe('uri')
    expect(items?.properties?.tags?.type).toBe('array')
  })

  it('publishes geo routing in the create, edit, upsert, and import request schemas', async () => {
    const spec = await getOpenApiSpec()

    expect(JSON.stringify(spec.components?.schemas)).toContain('Geo-routing rules')

    const requestSchemas: Array<[string, JsonObject | undefined]> = [
      ['POST /api/link/create', resolveSchema(spec, jsonBodySchema(spec, '/api/link/create', 'post'))],
      ['PUT /api/link/edit', resolveSchema(spec, jsonBodySchema(spec, '/api/link/edit', 'put'))],
      ['POST /api/link/upsert', resolveSchema(spec, jsonBodySchema(spec, '/api/link/upsert', 'post'))],
      ['POST /api/link/import', resolveSchema(spec, jsonBodySchema(spec, '/api/link/import', 'post'))?.properties?.links?.items],
    ]
    for (const [label, schema] of requestSchemas) {
      const geo = schema?.properties?.geo
      expect(geo, `${label} must publish geo`).toMatchObject({ type: 'object' })
      expect(geo?.description, `${label} geo must follow the Sink contract`).toMatch(/Geo-routing rules/)
    }
  })
})
