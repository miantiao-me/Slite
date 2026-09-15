---
title: REST API 参考
description: Slite 的交互式 OpenAPI 规范、Bearer 身份认证、CORS 与端点分组参考。
---

# REST API 参考

Slite 提供经过认证保护的 REST API，用于处理仪表盘管理、短链接解析配置与数据导出。

## 交互式文档

每个运行中的 Slite 实例均自带完整的交互式 API 文档：

- `https://your-domain/_docs/openapi.json` — 机器可读的 OpenAPI 3.0 规范定义
- `https://your-domain/_docs/scalar` — 现代化的交互式 API 调试界面
- `https://your-domain/_docs/swagger` — 经典的 Swagger UI 界面

## 身份认证

在 HTTP 请求的 `Authorization` 请求头中携带站点令牌完成认证：

```http
Authorization: Bearer YOUR_SITE_TOKEN
```

该令牌必须与实例配置的 `NUXT_SITE_TOKEN` 完全一致且长度不少于 8 个字符。除公开的 `GET /api/location` 兼容接口外，所有未携带有效令牌的 `/api/**` 请求均会被拦截并返回 HTTP `401`。

## CORS 跨域配置

默认情况下，浏览器发起的跨域 `/api/**` 请求会被阻止。若从源码构建或进行本地开发，可在构建时设置 `NUXT_API_CORS=true` 启用 CORS。该设置会在构建阶段烘焙至服务端产物中；官方发布的 Docker 容器镜像默认不启用 CORS。

## 关键端点行为说明

- **`upsert`：** 短链码空闲时执行创建；若短链码已存在，则直接返回已有记录并标记 `status: "existing"`，绝不覆盖已有数据。
- **`search`：** 支持在短链码、目标 URL、备注与标签之间进行模糊搜索匹配。
- **`check`：** 从服务端发起目标地址连通性探测。自动拦截回环地址及内网私有 IP，防御 SSRF 攻击。
- **`verify`：** 校验当前 Bearer 令牌的有效性并返回登录状态。
- **`location`：** 返回基于本地 GeoIP 数据库解析出的地理坐标与位置元数据。
- **图片上传：** `multipart/form-data` 格式，必须同时提供 `file` 和目标链接 `slug`。支持最大 5 MB 的 JPEG、PNG、WebP 与 GIF 文件，通过 unstorage 文件系统驱动保存在 `/data/files/images` 目录下。

## 端点分组概览

| 分组       | 路由列表                                                                                   | 说明                                                                          |
| ---------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 短链接     | `/api/link/create`, `edit`, `upsert`, `delete`, `query`, `search`, `list`, `check`, `tags` | 核心短链接增删改查、健康检测与标签管理                                        |
| 导入与导出 | `/api/link/import`, `/api/link/export`                                                     | 分页批量短链接导出与导入（详见[导入与导出](/zh-CN/features/import-export)）   |
| 可选 AI    | `/api/link/ai`, `/api/link/og-ai`                                                          | AI 建议短链码与社交分享预览（详见[可选 AI 支持](/zh-CN/features/ai)）         |
| 访问分析   | `/api/stats/**`, `/api/logs/**`                                                            | 统计报表、维度汇总与访问事件日志（详见[访问分析](/zh-CN/features/analytics)） |
| 实用工具   | `/api/verify`, `/api/location`, `/api/upload/image`, `/api/backup`                         | 鉴权校验、地理位置查询、图片上传与短链接备份快照                              |

各接口的完整请求参数与响应格式，请直接访问实例运行时的 `/_docs/scalar` 查看。
