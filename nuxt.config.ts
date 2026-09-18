import { cp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import tailwindcss from '@tailwindcss/vite'
import { currentLocales } from './i18n/i18n'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  modules: [
    '@nuxtjs/color-mode',
    '@nuxtjs/i18n',
    '@nuxt/eslint',
    '@pinia/nuxt',
    'shadcn-nuxt',
  ],
  css: ['@/assets/css/tailwind.css'],
  runtimeConfig: {
    siteToken: '',
    // `nuxt dev` keeps runtime data inside the repo; builds and Docker use /data.
    dataDir: process.env.NODE_ENV === 'development' ? './data' : '/data',
    geoipPath: '',
    trustProxy: false,
    clientIpHeader: '',
    redirectStatusCode: '301',
    redirectWithQuery: false,
    redirectNoStore: false,
    homeURL: '',
    aiApiKey: '',
    aiBaseUrl: '',
    aiModel: '',
    aiPrompt: `You are a URL shortening assistant, please shorten the URL provided by the user into a SLUG. The SLUG information should be derived from the URL and page content (if provided). Do not make any assumptions beyond the given information. A SLUG is human-readable and should not exceed three words and can be validated using regular expressions {slugRegex} . Only the best one is returned, the format must be JSON reference {"slug": "example-slug"}`,
    aiOgPrompt: `You are an OpenGraph metadata assistant. Please summarize the page content provided by the user into a perfect title and description for an OpenGraph preview. Do not make any assumptions beyond the given information. Only the best one is returned, the format must be JSON reference {"title": "Example Title", "description": "Example description that summarizes the page accurately."}`,
    caseSensitive: false,
    importRequestLimit: 100,
    listQueryLimit: 500,
    disableBotAccessLog: false,
    disableAutoBackup: false,
    notFoundRedirect: '',
    safeBrowsingDoh: '', // Set to DoH URL to enable auto-detection, e.g. https://family.cloudflare-dns.com/dns-query
    webhookUrl: '',
    webhookSecret: '',
    public: {
      previewMode: '',
      slugDefaultLength: '6',
      importBatchLimit: '50',
    },
  },
  routeRules: {
    '/dashboard': {
      redirect: '/dashboard/links',
    },
    '/api/**': {
      cors: process.env.NUXT_API_CORS === 'true',
    },
    '/_docs/**': {
      headers: { 'X-Robots-Tag': 'noindex, follow' },
    },
    '/sphere.bin': {
      headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' },
    },
    '/*.json': {
      headers: { 'Cache-Control': 'public, max-age=2592000, immutable' },
    },
    '/*.geojson': {
      headers: { 'Cache-Control': 'public, max-age=2592000, immutable' },
    },
  },
  experimental: {
    enforceModuleCompatibility: true,
  },
  typescript: {
    tsConfig: {
      compilerOptions: {
        types: ['vite/client'],
      },
    },
  },
  compatibilityDate: '2026-07-13',
  hooks: {
    'nitro:build:before': (nitro) => {
      if (nitro.options.dev)
        return
      nitro.hooks.hook('compiled', async () => {
        const source = join(nitro.options.rootDir, 'drizzle')
        const target = join(nitro.options.output.serverDir, 'drizzle')
        await rm(target, { recursive: true, force: true })
        await cp(source, target, { recursive: true })
      })
    },
  },
  nitro: {
    preset: 'node-server',
    rollupConfig: {
      // `node:sqlite` is still experimental and absent from `builtinModules`,
      // so declare it external to keep Rollup from warning on the import.
      external: ['node:sqlite'],
    },
    // maxmind is CommonJS and requires `assert`; the default 'auto' require
    // proxy returns Node's assert namespace, which is not callable. Prefer the
    // default export for assert only so the bundled maxmind keeps working.
    commonJS: {
      requireReturnsDefault: (id: string) => (id === 'assert' || id === 'node:assert' ? 'preferred' : 'auto'),
    },
    externals: {
      // Only the native DuckDB module stays external; `pnpm deploy --prod`
      // provides it in the runtime node_modules.
      external: ['@duckdb/node-api', '@duckdb/node-bindings'],
      // Pure JavaScript server dependencies are bundled so the runtime image
      // does not need them installed in node_modules.
      inline: [
        '@xsai/generate-text',
        '@xsai/shared',
        '@xsai/shared-chat',
        'anymatch',
        'destr',
        'drizzle-orm',
        'maxmind',
        'mmdb-lib',
        'normalize-path',
        'picomatch',
        'tiny-lru',
        'unstorage',
      ],
      traceInclude: ['node_modules/@duckdb/**/*'],
    },
    experimental: {
      openAPI: true,
    },
    timing: true,
    openAPI: {
      production: 'runtime',
      meta: {
        title: 'Slite API',
        description: 'A Simple, Self-Hosted Link Shortener with Analytics.\n\n[Return to this instance](/)',
      },
      route: '/_docs/openapi.json',
      ui: {
        scalar: {
          route: '/_docs/scalar',
        },
        swagger: {
          route: '/_docs/swagger',
        },
      },
    },
  },
  vite: {
    plugins: [
      tailwindcss(),
    ],
    optimizeDeps: {
      include: [
        '@internationalized/date',
        '@lucide/vue',
        '@number-flow/vue',
        '@tanstack/vue-form',
        '@unovis/vue',
        '@vueuse/core',
        'class-variance-authority',
        'clsx',
        'd3-geo',
        'd3-scale',
        'nanoid',
        'qr-code-styling',
        'reka-ui',
        'reka-ui/date',
        'tailwind-merge',
        'twgl.js',
        'vaul-vue',
        'virtua/vue',
        'vue-sonner',
        'vue3-simple-icons',
        'zod',
      ],
    },
  },
  eslint: {
    config: {
      standalone: false,
    },
  },
  i18n: {
    locales: currentLocales,
    compilation: {
      strictMessage: false,
      escapeHtml: true,
    },
    strategy: 'no_prefix',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'slite_i18n_redirected',
      redirectOn: 'root',
    },
    baseUrl: '/',
    defaultLocale: 'en-US',
  },
  shadcn: {
    prefix: '',
  },
})
