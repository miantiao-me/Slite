# 环境变量配置

在 Node.js 进程中直接设置运行时环境变量，或通过 Compose 传入。请以 `.env.example` 为模板配置。修改运行时配置后需重启进程。

## 核心配置

| 环境变量                   | 要求 / 默认值           | 用途                                                                                                             |
| -------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `NUXT_SITE_TOKEN`          | 可选；若设置须至少 8 位 | 仪表盘与 API 鉴权密钥；未设置时生成仅存活于当前进程的随机令牌，不落盘且不记录日志                                |
| `NUXT_DATA_DIR`            | `/data`                 | 可写的本地持久化目录                                                                                             |
| `NUXT_TRUST_PROXY`         | `false`                 | 仅在受控代理后端运行时才信任转发的客户端信息                                                                     |
| `NUXT_GEOIP_PATH`          | 空                      | 自定义 MMDB 文件路径；优先级高于 `/data/geoip.mmdb` 和镜像内置的 DB-IP City Lite 数据库                          |
| `NUXT_DISABLE_AUTO_BACKUP` | `false`                 | 设为 `true` 停用每日自动链接备份；系统保留最近 30 份自动备份，手动备份不会被自动清理                             |

## 可选 AI 功能

在明确配置 `NUXT_AI_BASE_URL` 和 `NUXT_AI_MODEL` 之前，AI 功能处于禁用状态；任意一项为空时，AI 相关接口均直接返回 `501`，不发起任何外网请求。接口细节及数据隐私说明见 [AI 支持](/zh-CN/features/ai)。

| 环境变量           | 默认值 | 用途                                                                 |
| ------------------ | ------ | -------------------------------------------------------------------- |
| `NUXT_AI_BASE_URL` | 空     | OpenAI 兼容接口 Base URL，须包含服务商的前缀路径；须与模型配合启用 AI |
| `NUXT_AI_MODEL`    | 空     | 服务商支持的模型标识符；须与 Base URL 配合启用 AI                    |
| `NUXT_AI_API_KEY`  | 空     | AI 服务商 API Key；若服务商无需鉴权可留空                             |
| `NUXT_AI_PROMPT`   | 内置   | 自定义 slug 助手提示词；须保留 `{slugRegex}` 占位符                   |
| `NUXT_AI_OG_PROMPT` | 内置  | 自定义 OpenGraph 标题与描述提示词                                    |

## 公共覆盖项

| 环境变量                          | 默认值  | 用途                                                                    |
| --------------------------------- | ------- | ----------------------------------------------------------------------- |
| `NUXT_PUBLIC_PREVIEW_MODE`        | `false` | 只读预览部署：拒绝链接编辑与删除，新链接在 5 分钟预览 TTL 后过期        |
| `NUXT_PUBLIC_SLUG_DEFAULT_LENGTH` | `6`     | 自动生成 slug 的长度                                                    |
| `NUXT_PUBLIC_IMPORT_BATCH_LIMIT`  | `50`    | 仪表盘导入分页大小；单次导入请求最多发送该值的一半                      |

## 可选运行时配置

| 环境变量                  | 默认值 | 用途                                                            |
| ------------------------- | ------ | --------------------------------------------------------------- |
| `NUXT_HOME_URL`           | 空     | 将 `/` 重定向至该 URL；留空则显示内置首页                       |
| `NUXT_NOT_FOUND_REDIRECT` | 空     | 未命中 slug 的重定向目标（始终为 HTTP 302）                     |
| `NUXT_SAFE_BROWSING_DOH`  | 空     | 用于不安全链接检测的 DNS-over-HTTPS JSON 端点；留空停用检测     |
| `NUXT_WEBHOOK_URL`        | 可选   | 点击事件接收端点                                                |
| `NUXT_WEBHOOK_SECRET`     | 可选   | Webhook 签名密钥；必须以 `whsec_` 开头                          |

## 高级默认值

| 环境变量                      | 默认值  | 用途                                                                                                          |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `NUXT_REDIRECT_STATUS_CODE`   | `301`   | 链接命中时的重定向状态码（`302` / `307` / `308` 亦可）；未命中 slug 的重定向始终为 `302`                     |
| `NUXT_REDIRECT_WITH_QUERY`    | `false` | 设为 `true` 时把访问者的查询参数附加到目标 URL                                                                |
| `NUXT_REDIRECT_NO_STORE`      | `false` | 设为 `true` 时要求浏览器不缓存重定向                                                                          |
| `NUXT_CASE_SENSITIVE`         | `false` | 设为 `true` 时保留自定义 slug 大小写（`Docs` ≠ `docs`）；`false` 时优先尝试小写 slug                          |
| `NUXT_IMPORT_REQUEST_LIMIT`   | `100`   | `POST /api/link/import` 单次请求接受的最大链接数                                                              |
| `NUXT_LIST_QUERY_LIMIT`       | `500`   | 仪表盘列表查询返回的最大行数                                                                                  |
| `NUXT_DISABLE_BOT_ACCESS_LOG` | `false` | 设为 `true` 时从统计与 Webhook 投递中剔除检测到的机器人                                                       |
| `NUXT_API_CORS`               | `false` | 仅构建时生效：源码构建或 `nuxt dev` 下设为 `true` 可为 `/api/**` 启用 CORS；该值烘焙进服务端产物，对发布镜像无效 |

## 安全与持久化

切勿将真实密钥提交至代码仓库。任何持有站点令牌的人都可以管理你的实例。请将 `/data` 保留在公开静态目录之外，并挂载在本地持久化存储上。严禁多个进程同时访问该目录。

未设置或置空 `NUXT_SITE_TOKEN` 时，进程会生成一个仅保存在内存中的随机令牌：公开短链接重定向保持可用，但 `/dashboard` 和 `/api/**` 在配置固定令牌并重启前无法完成认证。该随机值不会记入日志、不会写入磁盘，也不会通过任何 API 暴露，且每次重启都会变化。若显式配置的令牌长度少于 8 个字符，应用将拒绝启动。

若在宿主机使用自定义数据目录，请确保其位于 Docker 构建上下文之外，或在 `.dockerignore` 中排除整个目录，防止上传文件和备份被打包进镜像。使用 Compose 时，`NUXT_DATA_DIR` 是容器内路径，而非宿主机卷路径。提供的 Compose 服务通过 `env_file` 加载 `.env`，定义的环境变量会传入容器；执行 `docker compose` 时其 `environment` 配置项会进行插值：Shell 环境变量优先于 `.env`，而 `.env` 优先于 `compose.yaml` 中的预设值。

若应用直接暴露在公网，请保持代理信任关闭。仅在受信任的反向代理会清理或重写转发头、且客户端无法绕过该代理直接访问应用时，才开启代理信任。代理信任仅决定查询 GeoIP 数据库时采用哪个客户端 IP，其本身并不提供地理位置元数据。

## GeoIP

地理位置元数据为可选功能。Slite 按顺序读取首个有效的数据库：首先是 `NUXT_GEOIP_PATH`，其次是 `/data/geoip.mmdb`，然后是 `/data/dbip-city-lite.mmdb`，最后是发布版镜像中内置的 DB-IP City Lite 数据库。未找到数据库时查询平稳回退，且 City Lite 不包含时区数据。关于内置数据及 CC BY 4.0 署名协议，见 [Docker 与 Compose](/zh-CN/deployment/docker#geoip-database)。
