# 系统架构

Slite 是一个由 Nitro Node.js 服务端承载的纯客户端 Nuxt 应用。公开短链接解析优先于 API 认证执行；管理功能与 `/api/**` 请求必须携带站点令牌。

## 本地存储

所有持久化数据均保存在 `NUXT_DATA_DIR`（默认为 `/data`）目录下：

| 相对路径           | 职责                                          |
| ------------------ | --------------------------------------------- |
| `slite.sqlite`     | 权威链接数据与应用状态                        |
| `analytics.duckdb` | 访问分析事件与查询                            |
| `files/images`     | 上传的图片文件（unstorage filesystem 驱动）   |
| `backups`          | 链接导出备份文件（unstorage filesystem 驱动） |

SQLite 是系统的权威数据源。短链接缓存基于 unstorage memory 驱动实现：它属于进程内部缓存，可随时重建，绝非第二数据源。新进程启动时缓存为空，按需从 SQLite 回填。链接写入提交时会同步清理对应的缓存项。如果缓存操作发生故障，系统将停用缓存并直接回退至 SQLite 读取。上传的图片与链接导出备份通过 unstorage 文件系统驱动保存在 `files/images` 和 `backups`。

业务逻辑通过 `server/utils/link-store.ts` 操作链接持久化，通过 `server/services/link-store/cache.ts` 操作缓存。

## 进程模型

每个本地数据目录只能运行一个 Node.js 进程。SQLite、内存链接缓存与 DuckDB 均不是分布式存储层。不支持多副本横向扩展、多进程集群和网络文件系统。只有在保留持久化数据卷且旧进程已完全停止的情况下，容器重建或升级才是安全的。

## 可选服务

AI 功能通过 xsai 连接 OpenAI 兼容接口，日常短链接管理无需依赖 AI。Webhook 会将点击事件异步推送至指定的外部接口。地理位置元数据使用系统读取到的第一个有效 GeoIP 数据库，正式发布版 Docker 镜像已内置 DB-IP City Lite；若未找到有效数据库，查询会平稳回退，地理位置字段留空。City Lite 提供国家、地区、城市和坐标，不包含时区与邮编信息。详见 [GeoIP 数据库](/zh-CN/deployment/docker#geoip-数据库)。

实时仪表盘采用约 10 秒轮询与队列逐秒重放机制，并非 SSE 或 WebSocket 长连接。
