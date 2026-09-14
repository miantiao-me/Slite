import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './server/database/schema.ts',
  out: './drizzle',
  dbCredentials: { url: `${process.env.NUXT_DATA_DIR || '/data'}/slite.sqlite` },
})
