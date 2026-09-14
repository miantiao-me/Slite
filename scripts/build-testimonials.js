import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Manual utility only: run with `node scripts/build-testimonials.js`.
// It is intentionally not wired into the build pipeline because it needs network access.

// Tweet IDs to fetch
const TWEET_IDS = [
  '1794162548776079701', // @miantiao_me
]

const API_BASE = 'https://react-tweet.vercel.app/api/tweet'
const BATCH_SIZE = 5

async function fetchTweet(id) {
  try {
    const res = await fetch(`${API_BASE}/${id}`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.warn(`Failed to fetch tweet ${id}: ${res.status}`)
      return null
    }

    const json = await res.json()
    const tweet = json.data

    if (!tweet) {
      console.warn(`No data for tweet ${id}`)
      return null
    }

    // Clean up tweet text: remove t.co links and extra whitespace
    const cleanContent = tweet.text
      .replace(/https:\/\/t\.co\/\w+/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    // Skip reply-style tweets that open with @mentions
    if (cleanContent.startsWith('@')) {
      console.warn(`Skipping @-prefixed tweet ${id}`)
      return null
    }

    return {
      id: tweet.id_str,
      name: tweet.user.name,
      username: tweet.user.screen_name,
      content: cleanContent,
      url: `https://x.com/${tweet.user.screen_name}/status/${tweet.id_str}`,
      verified: tweet.user.is_blue_verified || false,
      date: tweet.created_at,
    }
  }
  catch (error) {
    console.warn(`Failed to fetch tweet ${id}:`, error)
    return null
  }
}

async function main() {
  console.log('Fetching testimonials from Twitter...')

  const shuffledIds = [...TWEET_IDS]
  for (let i = shuffledIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffledIds[i], shuffledIds[j]] = [shuffledIds[j], shuffledIds[i]]
  }

  const results = []
  for (let i = 0; i < shuffledIds.length; i += BATCH_SIZE) {
    const batch = shuffledIds.slice(i, i + BATCH_SIZE)
    results.push(...await Promise.all(batch.map(fetchTweet)))
  }
  const testimonials = results.filter(Boolean)

  if (testimonials.length === 0) {
    console.error('No testimonials fetched!')
    process.exit(1)
  }

  // Ensure data directory exists
  const dataDir = join(import.meta.dirname, '../app/data')
  mkdirSync(dataDir, { recursive: true })

  const outputPath = join(dataDir, 'testimonials.json')
  writeFileSync(outputPath, JSON.stringify(testimonials, null, 2), 'utf8')

  console.log(`✓ Generated ${testimonials.length} testimonials to ${outputPath}`)
}

main().catch((err) => {
  console.error('Failed to build testimonials:', err)
  process.exit(1)
})
