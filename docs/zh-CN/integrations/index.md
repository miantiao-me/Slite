---
title: 第三方集成
description: 将 Slite 连接到 AI 编码助手、OpenAPI 转 MCP 代理、浏览器扩展、Raycast、Apple 快捷指令及移动端应用。
---

# 第三方集成

Slite 提供经过认证保护的 REST API 与自动生成的 OpenAPI 规范文档，便于自动化工作流与第三方客户端对接。

由于 Slite 与 Sink 保持完全一致的 API 协议约定，任何针对 Sink 开发且支持配置自定义服务域名与站点令牌的生态工具，均可无缝连接至你的自托管 Slite 实例。

## AI Skills

安装官方针对 AI 编程助手提供的 Slite Skill：

```sh
npx skills add miantiao-me/Slite
```

Skill 配置文件位于代码仓库中的 [`skills/slite/SKILL.md`](https://github.com/miantiao-me/Slite/blob/master/skills/slite/SKILL.md)。

## OpenAPI 转 MCP

虽然 Slite 本身未内置原生 Model Context Protocol（MCP）服务端，但可以通过标准的 OpenAPI 代理将实例的 API 开放给任何 MCP 客户端使用。

前置条件：安装 [`uv`](https://github.com/astral-sh/uv) 以便系统能够执行 `uvx` 命令。

```json
{
  "mcpServers": {
    "slite": {
      "command": "uvx",
      "args": ["mcp-openapi-proxy"],
      "env": {
        "OPENAPI_SPEC_URL": "https://your-domain/_docs/openapi.json",
        "API_KEY": "YOUR_SITE_TOKEN",
        "TOOL_WHITELIST": "/api/link"
      }
    }
  }
}
```

请将 `https://your-domain` 替换为你实际部署的 Slite 域名，将 `YOUR_SITE_TOKEN` 替换为实例配置的 `NUXT_SITE_TOKEN`。请将包含该凭证的客户端配置文件视作密钥妥善保护。

## 兼容的应用与扩展

- **浏览器通用扩展：** [Sink Tool](https://github.com/zhuzhuyule/sink-extension)
- **Chrome 扩展：** [Sink Quick Shorten](https://chromewebstore.google.com/detail/sink-quick-shorten/emlojomjpenjgkaphajcokijobpkejih)
- **Raycast 插件：** [Raycast-Sink](https://github.com/foru17/raycast-sink)
- **Apple 快捷指令：** [Sink Shortcuts](https://s.search1api.com/sink001)
- **iOS 客户端：** [Sink for iOS](https://apps.apple.com/app/id6745417598)

在第三方客户端的配置界面中，填入你的 Slite 访问地址（如 `https://links.example.com`）以及你的 `NUXT_SITE_TOKEN` 即可直接使用。

::: tip 浏览器扩展与跨域（CORS）
由于 `NUXT_API_CORS` 是构建期选项，官方发布版 Docker 镜像无法在运行时通过环境变量开启 CORS；若浏览器扩展需要在浏览器页面上下文中直接跨域调用 `/api/**`，请在前端反向代理（如 Caddy、Nginx）中配置允许的 CORS 响应头与 Origin。
:::

::: warning 保护你的站点令牌
切勿将 `NUXT_SITE_TOKEN` 硬编码在公开代码仓库、前端网页或不可信的自动化脚本中。任何持有站点令牌的人都将拥有对你的短链接与全部数据的完全管理权限。
:::
