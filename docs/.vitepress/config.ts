import { defineConfig } from 'vitepress'

const repo = 'https://github.com/miantiao-me/Slite'

export default defineConfig({
  title: 'Slite Documentation',
  description: 'A Simple, Self-Hosted Link Shortener with Analytics.',
  cleanUrls: true,
  lastUpdated: true,
  locales: {
    'root': {
      label: 'English',
      lang: 'en-US',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/guide/getting-started' },
          { text: 'Deployment', link: '/deployment/docker' },
          { text: 'Features', link: '/features/links' },
          { text: 'API', link: '/api/' },
        ],
        sidebar: [
          { text: 'Introduction', link: '/' },
          { text: 'Guide', items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Architecture', link: '/guide/architecture' },
          ] },
          { text: 'Deployment', items: [
            { text: 'Docker and Compose', link: '/deployment/docker' },
            { text: 'Upgrading', link: '/deployment/upgrading' },
          ] },
          { text: 'Configuration', items: [
            { text: 'Environment Variables', link: '/configuration/' },
            { text: 'Webhooks', link: '/configuration/webhooks' },
          ] },
          { text: 'Features', items: [
            { text: 'Links', link: '/features/links' },
            { text: 'Analytics', link: '/features/analytics' },
            { text: 'Optional AI', link: '/features/ai' },
          ] },
          { text: 'Operations', items: [
            { text: 'Import and Export', link: '/features/import-export' },
            { text: 'Backups', link: '/features/backups' },
          ] },
          { text: 'Integrations', link: '/integrations/' },
          { text: 'API', link: '/api/' },
          { text: 'Troubleshooting', link: '/faqs' },
        ],
      },
    },
    'zh-CN': {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh-CN/',
      title: 'Slite 文档',
      description: '简洁自托管短链接与访问分析应用。',
      themeConfig: {
        nav: [
          { text: '指南', link: '/zh-CN/guide/getting-started' },
          { text: '部署', link: '/zh-CN/deployment/docker' },
          { text: '功能', link: '/zh-CN/features/links' },
          { text: 'API', link: '/zh-CN/api/' },
        ],
        sidebar: [
          { text: '简介', link: '/zh-CN/' },
          { text: '指南', items: [
            { text: '快速开始', link: '/zh-CN/guide/getting-started' },
            { text: '系统架构', link: '/zh-CN/guide/architecture' },
          ] },
          { text: '部署', items: [
            { text: 'Docker 与 Compose', link: '/zh-CN/deployment/docker' },
            { text: '版本升级', link: '/zh-CN/deployment/upgrading' },
          ] },
          { text: '配置', items: [
            { text: '环境变量', link: '/zh-CN/configuration/' },
            { text: 'Webhook', link: '/zh-CN/configuration/webhooks' },
          ] },
          { text: '功能', items: [
            { text: '短链接', link: '/zh-CN/features/links' },
            { text: '访问分析', link: '/zh-CN/features/analytics' },
            { text: '可选 AI 支持', link: '/zh-CN/features/ai' },
          ] },
          { text: '运维', items: [
            { text: '导入与导出', link: '/zh-CN/features/import-export' },
            { text: '数据备份', link: '/zh-CN/features/backups' },
          ] },
          { text: '集成', link: '/zh-CN/integrations/' },
          { text: 'API', link: '/zh-CN/api/' },
          { text: '故障排除', link: '/zh-CN/faqs' },
        ],
        lastUpdated: { text: '最后更新于' },
        outline: { label: '页面导航' },
        docFooter: { prev: '上一页', next: '下一页' },
        darkModeSwitchLabel: '外观',
        lightModeSwitchTitle: '切换到浅色主题',
        darkModeSwitchTitle: '切换到深色主题',
        sidebarMenuLabel: '菜单',
        returnToTopLabel: '返回顶部',
        langMenuLabel: '切换语言',
        skipToContentLabel: '跳到主要内容',
      },
    },
  },
  themeConfig: {
    socialLinks: [{ icon: 'github', link: repo, ariaLabel: 'Slite on GitHub' }],
    search: {
      provider: 'local',
      options: {
        locales: {
          'zh-CN': {
            translations: {
              button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
              modal: {
                noResultsText: '无法找到相关结果',
                resetButtonTitle: '清除查询条件',
                footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
              },
            },
          },
        },
      },
    },
  },
})
