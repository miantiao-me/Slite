---
title: 第三方集成
description: 通过内置 MCP 服务端将 Slite 接入 AI 编码助手，另有 OpenAPI 转 MCP 代理、浏览器扩展、Raycast、Apple 快捷指令及移动端应用。
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

## MCP 服务端

Slite 在 `POST /api/mcp` 提供 Model Context Protocol 端点。它基于官方 [`@modelcontextprotocol/server`](https://www.npmjs.com/package/@modelcontextprotocol/server) SDK v2 入口，通过按请求创建的传输层服务现代客户端，并以无状态回退模式与 JSON 响应兼容 2025 年协议的旧客户端；SDK 自身完成协议版本协商，无需额外配置。

该端点与 REST API 使用相同的 Bearer 令牌鉴权，无需单独凭证。详见 [API 身份认证](/zh-CN/api/#身份认证)。

```sh
claude mcp add --transport http slite https://your-domain/api/mcp --header "Authorization: Bearer YOUR_SITE_TOKEN"
```

任何支持 HTTP 传输与自定义请求头的 MCP 客户端都可以相同方式接入：

```json
{
  "mcpServers": {
    "slite": {
      "type": "http",
      "url": "https://your-domain/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_SITE_TOKEN"
      }
    }
  }
}
```

### 工具列表

| 工具                     | 说明                                          |
| ------------------------ | --------------------------------------------- |
| `list_links`             | 按创建时间倒序列出短链接，支持游标分页。      |
| `search_links`           | 按关键词或精确目标 URL 搜索短链接。           |
| `get_link`               | 按短链码读取单条短链接。                      |
| `count_links`            | 按关键词、URL、标签或过期状态统计短链接数量。 |
| `list_tags`              | 列出所有在用标签及每个标签下的链接数。        |
| `create_link`            | 创建短链接，未提供短链码时自动生成。          |
| `update_link`            | 替换已有短链接的全部可写字段。                |
| `upsert_link`            | 返回该短链码已有记录，不存在时创建。          |
| `delete_link`            | 永久删除短链接。                              |
| `check_links`            | 检测已存储链接的目标地址，按短链码游标分页。  |
| `get_analytics_counters` | 访问量、独立访客与来源总数。                  |
| `get_analytics_views`    | 按分钟、小时或天聚合的访问量与访客数。        |
| `get_analytics_metrics`  | 单个访问日志维度的 Top 取值。                 |
| `get_analytics_heatmap`  | 按星期与小时聚合的访问量与访客数。            |

写入工具与 REST API 一样遵守 `NUXT_PUBLIC_PREVIEW_MODE`。对于 `update_link`，传入空 `password` 会清除密码保护，省略该字段则保留已存储的密码。

该端点位于 `/api/` 之下，因此不会占用短链命名空间：短链码不能包含斜杠，任何短链接都无法遮蔽它，也无需预留短链码。升级不会夺走实例中已存在的短链码。

## OpenAPI 转 MCP

当客户端无法直连内置端点（例如仅支持 stdio 服务端）时，可以使用 OpenAPI 代理作为替代方案。

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
