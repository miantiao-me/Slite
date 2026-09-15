---
title: 配置参考
description: Slite 支持的全部环境变量——核心配置、可选 AI、公共覆盖项、运行时选项与高级默认值。
---

# 配置参考

所有环境变量均为字符串格式。布尔开关接受 `true` 与 `false`。修改环境变量配置后需重启 Node.js 进程或重新创建 Docker 容器。

## 核心配置

| 环境变量                   | 默认值  | 用途                                                                                                                           |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `NUXT_SITE_TOKEN`          | 空      | 仪表盘与 API 鉴权令牌（至少 8 个字符且不能包含空白字符）。未设置时生成仅存活于内存的随机令牌，后台与 API 无法登录。            |
| `NUXT_DATA_DIR`            | `/data` | 本地持久化数据目录，用于存放 SQLite、DuckDB、图片与备份文件。                                                                  |
| `NUXT_TRUST_PROXY`         | `false` | 设为 `true` 仅在应用严格运行于受信任的反向代理后端，且代理会重写不可信的客户端转发头时生效。                                   |
| `NUXT_CLIENT_IP_HEADER`    | 空      | 可选的代理头名称（如 `CF-Connecting-IP`）。设置后系统仅信任该头传递客户端真实 IP，优先级高于 `X-Forwarded-For`。               |
| `NUXT_GEOIP_PATH`          | 空      | 自定义 MMDB 文件路径；优先级高于 `/data/geoip.mmdb` 及镜像内置的 DB-IP City Lite 数据库。                                      |
| `NUXT_DISABLE_AUTO_BACKUP` | `false` | 设为 `true` 停用自动链接备份（默认在服务启动后每 24 小时执行一次）。系统自动保留最近 30 份备份；手动创建的备份不会被自动清理。 |

::: warning 请务必配置 `NUXT_SITE_TOKEN`
生产环境中请显式配置 `NUXT_SITE_TOKEN`，长度须至少为 8 个字符且不能包含空白字符。若留空或未设置，Slite 会在启动时生成仅在当前进程内存中存活的随机令牌。公开短链接可正常跳转，但仪表盘和受保护 API 将拒绝登录。
:::

## 可选 AI 功能

在**同时**配置 `NUXT_AI_BASE_URL` 与 `NUXT_AI_MODEL` 之前，AI 功能完全处于停用状态。未配置时相关接口直接返回 HTTP `501`，且不发起任何外部请求。详见[可选 AI 支持](/zh-CN/features/ai)。

| 环境变量            | 默认值 | 用途                                                                               |
| ------------------- | ------ | ---------------------------------------------------------------------------------- |
| `NUXT_AI_BASE_URL`  | 空     | OpenAI 兼容接口 Base URL，包含所需的路径前缀（例如 `https://api.openai.com/v1`）。 |
| `NUXT_AI_MODEL`     | 空     | 服务商支持的模型标识符（例如 `gpt-4o-mini`）。                                     |
| `NUXT_AI_API_KEY`   | 空     | AI 服务商 API 密钥；若使用无需鉴权的本地或自建模型（如 Ollama）可留空。            |
| `NUXT_AI_PROMPT`    | 内置   | 自定义短链码生成提示词。必须保留 `{slugRegex}` 占位符。                            |
| `NUXT_AI_OG_PROMPT` | 内置   | 自定义 OpenGraph 社交分享标题与描述提示词。                                        |

## 公共覆盖项

作用于前端页面与界面展示维度的设置：

| 环境变量                          | 默认值  | 用途                                                                                       |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| `NUXT_PUBLIC_PREVIEW_MODE`        | `false` | 只读演示模式：禁止新建链接的编辑与删除，新建链接在 5 分钟后自动过期。                      |
| `NUXT_PUBLIC_SLUG_DEFAULT_LENGTH` | `6`     | 自动随机生成短链码的字符长度。                                                             |
| `NUXT_PUBLIC_IMPORT_BATCH_LIMIT`  | `50`    | 仪表盘导入分批大小；单次批量请求最多携带该数值的一半（默认 25 条）。导出分页固定为 50 条。 |

## 可选运行时配置

| 环境变量                  | 默认值 | 用途                                                                                                  |
| ------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `NUXT_HOME_URL`           | 空     | 将根路径 `/` 重定向至该 URL；留空时显示 Slite 内置默认首页。                                          |
| `NUXT_NOT_FOUND_REDIRECT` | 空     | 未命中短链码的重定向目标 URL（**始终为 HTTP 302**）。                                                 |
| `NUXT_SAFE_BROWSING_DOH`  | 空     | 用于不安全链接检测的 DNS-over-HTTPS JSON 端点（例如 `https://family.cloudflare-dns.com/dns-query`）。 |
| `NUXT_WEBHOOK_URL`        | 空     | 异步[点击 Webhook](/zh-CN/configuration/webhooks) 接收端点 HTTP(S) 地址。                             |
| `NUXT_WEBHOOK_SECRET`     | 空     | Webhook 的 HMAC 签名密钥；必须以 `whsec_` 开头。                                                      |

## 高级默认值

| 环境变量                      | 默认值  | 用途                                                                                                |
| ----------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `NUXT_REDIRECT_STATUS_CODE`   | `301`   | 短链接成功命中的重定向 HTTP 状态码（支持 `301`、`302`、`307`、`308`）。未匹配短链的跳转始终为 302。 |
| `NUXT_REDIRECT_WITH_QUERY`    | `false` | 设为 `true` 时把访客请求的查询参数（如 `?utm_source=...`）透传至目标 URL。                          |
| `NUXT_REDIRECT_NO_STORE`      | `false` | 设为 `true` 时要求浏览器不缓存重定向响应（响应头包含 `Cache-Control: no-store`）。                  |
| `NUXT_CASE_SENSITIVE`         | `false` | 设为 `true` 时自定义短链码区分大小写（`Docs` ≠ `docs`）。自动生成的短链码始终为小写。               |
| `NUXT_IMPORT_REQUEST_LIMIT`   | `100`   | `POST /api/link/import` 单次请求允许提交的最大链接数量。                                            |
| `NUXT_LIST_QUERY_LIMIT`       | `500`   | 仪表盘列表查询返回的最大记录条数。                                                                  |
| `NUXT_DISABLE_BOT_ACCESS_LOG` | `false` | 设为 `true` 时从 DuckDB 访问分析统计与 Webhook 投递中剔除检测到的爬虫与机器人流量。                 |
| `NUXT_API_CORS`               | `false` | 仅源码构建选项：设为 `true` 在源码构建与 `nuxt dev` 下启用 `/api/**` 的跨域访问。发布镜像已固化。   |

## 安全与存储注意事项

- **保护 `/data` 目录：** 严禁通过 Nginx、Caddy 或其他 Web 服务器将 `/data` 目录作为静态文件直接向外公开。
- **单进程独占：** 每个持久化数据目录仅允许一个 Node.js 进程独占访问，切勿启动多个实例挂载相同的 SQLite 或 DuckDB 文件。
- **Compose 环境变量覆盖规则：** 执行 `docker compose` 时，Shell 环境变量优先于 `.env`，而 `.env` 优先于 `compose.yaml` 中编写的默认值。
- **反向代理信任：** 仅在应用前端部署了能可靠清洗客户端请求头的反向代理时，才开启 `NUXT_TRUST_PROXY=true`。
