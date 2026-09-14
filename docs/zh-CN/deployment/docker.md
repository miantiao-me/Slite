# Docker 与 Compose

你可以直接运行来自 GHCR 的正式发布镜像，也可以通过仓库中的 Dockerfile 和 Compose 配置在本地构建。运行镜像基于 [distroless](https://github.com/GoogleContainerTools/distroless)：内部仅包含 Node.js 运行时，不包含 Shell 或包管理器，并以非 root 用户 `5483` 运行。

## 配置

将 `.env.example` 复制为 `.env`，然后配置：

```dotenv
NUXT_SITE_TOKEN=replace-with-a-long-random-secret
NUXT_DATA_DIR=/data
NUXT_TRUST_PROXY=false
```

提供的 Compose 服务通过 `env_file` 加载 `.env`，其中的变量会直接传入容器。执行 `docker compose` 时，`environment` 中的配置项会参与插值：Shell 环境变量优先于 `.env`，而 `.env` 优先于 `compose.yaml` 中编写的默认值。

确保 Compose 服务将持久化**本地**数据卷挂载到 `/data`。容器运行用户必须拥有写入权限；镜像已将 `/data` 预设给用户 `5483`，因此使用默认的具名卷无需额外权限配置。根据 Compose 配置，通过主机或反向代理发布应用端口。上传的图片与链接备份通过 unstorage 文件系统驱动保存在 `/data/files/images` 和 `/data/backups`。

## 站点令牌

`NUXT_SITE_TOKEN` 用于保护 `/dashboard` 以及除公开兼容端点 `GET /api/location` 以外的所有 `/api/**` 请求；配置时长度必须至少为 8 个字符。服务在未配置该变量时仍可启动，但进程会为自身生成一个仅存活于当前周期的随机令牌：公开短链接重定向正常工作，管理仪表盘与受保护 API 均不可访问，该令牌不会记录到日志，也不会写入磁盘，且每次重启都会改变。配置有效令牌并重启容器即可管理实例。

## 官方发布镜像

`compose.yaml` 默认使用发布的官方镜像，直接启动即可：

```sh
docker compose up -d
```

向默认 `master` 分支推送代码会发布 `latest` 镜像（无需打 Tag）；推送 Tag 则仅发布对应版本的镜像：

```sh
docker pull ghcr.io/miantiao-me/slite:vX.Y.Z
```

将 `vX.Y.Z` 替换为具体的发布版本号。[`Container` 工作流](https://github.com/miantiao-me/Slite/actions/workflows/docker.yml)同样支持手动触发执行。

## 本地构建

使用 Compose 从源码构建；`slite` 服务保留了 `build: .` 并将生成镜像标记为官方镜像引用：

```sh
docker compose up -d --build
docker compose logs -f
```

请使用 Node.js 24 或更高版本。SQLite 使用内置的 `node:sqlite` 模块，而 DuckDB 是原生模块：依赖项应在镜像内部针对目标运行时、操作系统和架构进行安装，不要直接将宿主机的 `node_modules` 复制进去。

示例 Compose 配置将宿主机端口 `5483` 映射至容器端口 `5483`，并将具名卷 `slite-data` 挂载到 `/data`。宿主机目录绑定挂载（bind mount）会保留宿主机属主，因此启动前需先创建目录并授予容器用户写权限（若源目录不存在，Docker 会以 `root` 身份自动创建，容器无法写入并会在启动时报 `unable to open database file`）：

```sh
mkdir -p /srv/slite
sudo chown -R 5483:5483 /srv/slite
```

同时确保该目录位于 Docker 构建上下文之外，或在 `.dockerignore` 中排除整个目录；仅排除数据库文件无法防止上传文件和备份被复制进构建产物。

自行构建镜像时，可通过 `DBIP_VERSION=YYYY-MM` 参数指定特定月份的 [DB-IP](https://db-ip.com) City Lite 版本：

```sh
docker build --build-arg DBIP_VERSION=2026-09 -t slite:local .
```

若未传递该参数，构建过程会优先下载当月数据，失败时回退至上月。

在浏览器中打开实例的 `/dashboard` 路径，输入站点令牌完成登录。

自动链接备份默认每日运行一次，并保留最近 30 份自动备份文件；手动备份不会被自动清理机制删除。如需关闭自动备份，可在 `.env` 中设置 `NUXT_DISABLE_AUTO_BACKUP=true` 并重新创建容器。

## GeoIP 数据库 {#geoip-database}

镜像在 `/app/geoip/dbip-city-lite.mmdb` 中内置了按月发布的 DB-IP City Lite 数据库，无需额外配置即可使用地理位置分析。DB-IP City Lite 遵循 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 许可；镜像将署名说明存放在 `/app/geoip/ATTRIBUTION.txt`，上游数据发布于 [db-ip.com](https://db-ip.com)。

数据库解析优先级如下：

1. `NUXT_GEOIP_PATH`：指向现存文件时优先使用。用于挂载自定义或商业数据库。
2. `/data/geoip.mmdb`：若存在，挂载至数据卷即可覆盖镜像内置版本。
3. `/data/dbip-city-lite.mmdb`：若存在则使用。
4. 镜像内置的 `/app/geoip/dbip-city-lite.mmdb`。

地理位置查询遵循平稳回退（fail open）原则：缺少可读数据库时，地理位置相关字段保持为空，应用其余功能正常工作。City Lite 包含国家、地区、城市和坐标数据，但不包含时区数据，因此 Slite 不会基于该数据库输出时区。环境变量说明见[配置参考](/zh-CN/configuration/)。

## 运行约束

- 仅运行单个容器与单一 Node.js 进程。切勿扩容副本或启用进程管理器的集群模式。
- 严禁在多个运行实例间共享 `/data`，不要使用网络文件系统挂载数据卷。
- 重建或升级容器时务必保留数据卷。`docker compose down -v` 会删除具名卷，常规升级绝对不要使用此命令。
- 公网部署应在前端配置启用 TLS 的反向代理。仅在直接访问已被阻止且代理会重写不可信的转发头时，才将 `NUXT_TRUST_PROXY` 设置为 `true`。
- 切勿通过静态 Web 服务器直接暴露数据库文件、备份文件或环境配置文件。
- AI 功能为可选；详见[配置参考](/zh-CN/configuration/)。

如需完整数据快照，请先停止容器，然后完整复制 `/data` 目录，包括 `slite.sqlite`、`analytics.duckdb`、`files/images` 和 `backups`。短链接缓存采用 unstorage 内存驱动，属于进程内状态，启动后会自动重建。链接 JSON 备份不包含此类内存缓存。在进行[版本升级](/zh-CN/deployment/upgrading)前，请先查阅[数据备份](/zh-CN/features/backups)。
