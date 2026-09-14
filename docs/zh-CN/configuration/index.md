# 环境变量配置

在 Node.js 进程中直接设置运行时环境变量，或通过 Compose 传入。请以 `.env.example` 为模板配置。修改运行时配置后需重启进程。

| 环境变量                   | 要求 / 默认值           | 用途                                                                                                             |
| -------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `NUXT_SITE_TOKEN`          | 可选；若设置须至少 8 位 | 仪表盘与 API 鉴权密钥；未设置时生成仅存活于当前进程的随机令牌，不落盘且不记录日志                                |
| `NUXT_DATA_DIR`            | `/data`                 | 可写的本地持久化目录                                                                                             |
| `NUXT_TRUST_PROXY`         | `false`                 | 仅在受控代理后端运行时才信任转发的客户端信息                                                                     |
| `NUXT_GEOIP_PATH`          | 空                      | 自定义 MMDB 文件路径；优先级高于 `/data/geoip.mmdb` 和镜像内置的 DB-IP City Lite 数据库                          |
| `NUXT_DISABLE_AUTO_BACKUP` | `false`                 | 设为 `true` 停用每日自动链接备份；系统保留最近 30 份自动备份，手动备份不会被自动清理                             |
| `NUXT_AI_BASE_URL`         | 空                      | OpenAI 兼容接口 Base URL，须包含服务商的前缀路径；该项与模型未同时配置时，AI 接口返回 `501` 且不发起任何外部请求 |
| `NUXT_AI_MODEL`            | 空                      | 服务商支持的模型标识符；须与 Base URL 配合启用 AI                                                                |
| `NUXT_AI_API_KEY`          | 空                      | AI 服务商 API Key；若服务商无需鉴权可留空                                                                        |
| `NUXT_WEBHOOK_URL`         | 可选                    | 点击事件接收端点                                                                                                 |
| `NUXT_WEBHOOK_SECRET`      | 可选                    | Webhook 签名密钥；必须以 `whsec_` 开头                                                                           |

## 安全与持久化

切勿将真实密钥提交至代码仓库。任何持有站点令牌的人都可以管理你的实例。请将 `/data` 保留在公开静态目录之外，并挂载在本地持久化存储上。严禁多个进程同时访问该目录。

未设置或置空 `NUXT_SITE_TOKEN` 时，进程会生成一个仅保存在内存中的随机令牌：公开短链接重定向保持可用，但 `/dashboard` 和 `/api/**` 在配置固定令牌并重启前无法完成认证。该随机值不会记入日志、不会写入磁盘，也不会通过任何 API 暴露，且每次重启都会变化。若显式配置的令牌长度少于 8 个字符，应用将拒绝启动。

若在宿主机使用自定义数据目录，请确保其位于 Docker 构建上下文之外，或在 `.dockerignore` 中排除整个目录，防止上传文件和备份被打包进镜像。使用 Compose 时，`NUXT_DATA_DIR` 是容器内路径，而非宿主机卷路径。提供的 Compose 服务通过 `env_file` 加载 `.env`，定义的环境变量会传入容器；执行 `docker compose` 时其 `environment` 配置项会进行插值：Shell 环境变量优先于 `.env`，而 `.env` 优先于 `compose.yaml` 中的预设值。

若应用直接暴露在公网，请保持代理信任关闭。仅在受信任的反向代理会清理或重写转发头、且客户端无法绕过该代理直接访问应用时，才开启代理信任。代理信任仅决定查询 GeoIP 数据库时采用哪个客户端 IP，其本身并不提供地理位置元数据。

## GeoIP

地理位置元数据为可选功能。Slite 按顺序读取首个有效的数据库：首先是 `NUXT_GEOIP_PATH`，其次是 `/data/geoip.mmdb`，然后是 `/data/dbip-city-lite.mmdb`，最后是发布版镜像中内置的 DB-IP City Lite 数据库。未找到数据库时查询平稳回退，且 City Lite 不包含时区数据。关于内置数据及 CC BY 4.0 署名协议，见 [Docker 与 Compose](/zh-CN/deployment/docker#geoip-database)。

## 可选 AI 功能

在明确配置 `NUXT_AI_BASE_URL` 和 `NUXT_AI_MODEL` 之前，AI 功能处于禁用状态；任意一项为空时，AI 相关接口均直接返回 `501`，不发起任何外网请求。服务商不需要密钥时，`NUXT_AI_API_KEY` 可保持为空。接口细节及数据隐私说明见 [AI 支持](/zh-CN/features/ai)。
