import type { ModuleOptions, Nuxt } from 'nuxt/schema'
import { cp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import tailwindcss from '@tailwindcss/vite'
import { currentLocales } from './i18n/i18n'

// The shadcn registry's unused `message-scroller` directory has template type
// errors under strict Vue checking. Drop it from component scanning (this
// hook registers after `shadcn-nuxt`) so the generated component declarations
// cannot pull it back into the type-check program despite the `exclude` below.
function ignoreUnusedMessageScroller(_options: ModuleOptions, nuxt: Nuxt) {
  const messageScrollerDir = '/components/ui/message-scroller/'
  nuxt.hook('components:extend', (components) => {
    for (let index = components.length - 1; index >= 0; index--) {
      if (components[index]?.filePath.includes(messageScrollerDir))
        components.splice(index, 1)
    }
  })
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  modules: [
    '@nuxtjs/color-mode',
    '@nuxtjs/i18n',
    '@nuxt/eslint',
    '@pinia/nuxt',
    'shadcn-nuxt',
    ignoreUnusedMessageScroller,
  ],
  devtools: { enabled: true },
  css: ['@/assets/css/tailwind.css'],
  colorMode: {
    classSuffix: '',
  },
  runtimeConfig: {
    siteToken: '',
    // `nuxt dev` keeps runtime data inside the repo; builds and Docker use /data.
    dataDir: process.env.NODE_ENV === 'development' ? './data' : '/data',
    geoipPath: '',
    trustProxy: false,
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
    safeBrowsingDoh: '', // Empty disables the DoH check; set a DNS-over-HTTPS JSON endpoint to enable it
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
      // The unused shadcn `message-scroller` components fail strict template
      // checking; keep the directory out of the app type-check program.
      exclude: ['../app/components/ui/message-scroller/**'],
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
        description: 'A self-hosted link shortener with analytics.\n\n[Return to this instance](/)',
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
    worker: {
      format: 'es',
    },
    optimizeDeps: {
      include: [
        '@internationalized/date',
        '@lucide/vue',
        '@number-flow/vue',
        '@tanstack/vue-form',
        '@unovis/vue',
        '@vue/devtools-core',
        '@vue/devtools-kit',
        '@vueuse/core',
        'class-variance-authority',
        'clsx',
        'd3-geo',
        'd3-scale',
        'nanoid',
        'qr-code-styling', // CJS
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
    /**
     * Prefix for all the imported component
     */
    prefix: '',
    /**
     * Directory that the component lives in.
     * @default "./components/ui"
     */
    componentDir: './app/components/ui',
  },
})
