export default defineAppConfig({
  title: 'Slite',
  documentation: 'https://github.com/miantiao-me/Slite#readme',
  github: 'https://github.com/miantiao-me/Slite',
  coffee: 'https://slite.cool/coffee',
  twitter: 'https://slite.cool/x',
  telegram: 'https://slite.cool/telegram',
  description: 'A Simple, Self-Hosted Link Shortener with Analytics.',
  image: '/banner.png',
  previewTTL: 300, // 5 minutes
  slugRegex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/i,
  reserveSlug: [
    'dashboard',
  ],
})
