# REST API

你可以直接访问当前实例自带的 API 文档：

- `/_docs/openapi.json`：OpenAPI 规范定义
- `/_docs/scalar`：交互式 API 参考文档
- `/_docs/swagger`：Swagger UI

API 请求需携带配置的站点令牌进行认证：

```http
Authorization: Bearer YOUR_SITE_TOKEN
```

令牌必须与 `NUXT_SITE_TOKEN` 一致。严禁将令牌暴露在公开客户端应用中。

| 分组      | 接口路由                                                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 链接      | `/api/link/create`, `/api/link/edit`, `/api/link/upsert`, `/api/link/delete`, `/api/link/query`, `/api/link/search`, `/api/link/list`, `/api/link/check`, `/api/link/tags` |
| 导入/导出 | `/api/link/import`, `/api/link/export`                                                                                                                                     |
| 可选 AI   | `/api/link/ai`, `/api/link/og-ai`                                                                                                                                          |
| 访问分析  | `/api/stats/**`, `/api/logs/**`                                                                                                                                            |
| 实用工具  | `/api/verify`, `/api/location`, `/api/upload/image`, `/api/backup`                                                                                                         |

`upsert` 在遇到已存在的活跃短链码时直接返回该项，而不进行覆盖。`check` 由服务端主动探测目标 URL。上传图片通过 unstorage 文件系统驱动保存在 `/data/files/images` 目录下。地理位置相关字段来自系统加载的 GeoIP 数据库：正式发布版 Docker 镜像内置了 DB-IP City Lite，没有可读数据库的实例平稳回退并留空相关字段。详见 [GeoIP 数据库](/zh-CN/deployment/docker#geoip-database)。

迁移数据前请查阅[导入与导出](/zh-CN/features/import-export)和[备份范围说明](/zh-CN/features/backups)。
