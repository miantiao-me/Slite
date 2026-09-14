# 第三方集成

你可以通过 [REST API](/zh-CN/api/) 与自己的 Slite 域名进行对接。请将 `NUXT_SITE_TOKEN` 保存在受信任的服务器端，切勿将其硬编码在浏览器插件、公开网页或共享脚本中。

需要点击事件通知时，可配置 [Webhook](/zh-CN/configuration/webhooks)。需要 AI 辅助时，可配置 [OpenAI 兼容服务商](/zh-CN/features/ai)。日常重定向与短链接管理均无需上述集成。

在对接第三方系统前，请根据你当前实例的 OpenAPI 规范核对接口路由与导入格式。
