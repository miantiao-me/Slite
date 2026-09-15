---
title: Docker 与 Compose 部署
description: 使用官方 GHCR 容器镜像或本地 Compose 源码构建部署 Slite，并配置持久化本地存储。
---

# Docker 与 Compose 部署

Slite 作为轻量容器镜像发布于 GitHub Container Registry（GHCR），亦可直接使用仓库中的 Dockerfile 和 Compose 配置完成本地源码构建与运行。

运行镜像基于 [distroless](https://github.com/GoogleContainerTools/distroless) 构建：内部仅包含 Node.js 运行时，不包含 Shell 或系统包管理器，并以非 root 用户 UID `5483` 运行。

## 1. 使用 Compose 快速启动

仓库内置的 `compose.yaml` 默认直接拉取官方发布镜像：

```sh
git clone https://github.com/miantiao-me/Slite.git
cd Slite
cp .env.example .env
docker compose up -d
```

该命令将启动 Slite 服务，映射宿主机 `5483` 端口，并将具名 Docker 数据卷 `slite-data` 挂载至 `/data`。在浏览器打开 `http://localhost:5483/dashboard`，输入配置的 `NUXT_SITE_TOKEN` 完成登录。

若希望从当前源码直接构建镜像运行，只需执行：

```sh
docker compose up -d --build
docker compose logs -f
```

## 2. 持久化存储与权限

所有权威链接数据、访问分析事件、上传图片与备份文件均保存在 `/data` 目录中：

- **具名数据卷（推荐）：** `compose.yaml` 中预设的 `slite-data` 具名卷会自动适配容器内 `5483` 用户的读写权限。
- **宿主机目录绑定挂载（Bind Mount）：** 若将宿主机目录挂载至容器（例如 `/srv/slite:/data`），须在宿主机上将该目录所有权赋予 UID `5483`：

```sh
mkdir -p /srv/slite
sudo chown -R 5483:5483 /srv/slite
```

::: warning 避免将挂载目录放入构建上下文
自定义宿主机数据目录应置于 Git 代码仓库目录之外，或在 `.dockerignore` 中明确排除。否则，本地 SQLite 数据库、上传图片和备份文件可能会被打包进 Docker 构建产物中。
:::

## 3. 站点令牌与安全规范

`NUXT_SITE_TOKEN` 用于保护 `/dashboard` 后台管理界面以及所有 `/api/**` 接口（公开兼容接口 `GET /api/location` 除外）。

- 显式设置的 `NUXT_SITE_TOKEN` 长度必须至少为 8 个字符且不能包含空白字符。
- 若留空或未设置，Slite 会为当前进程生成一个仅存活于内存中的随机令牌。短链接重定向保持正常可用，但后台仪表盘和 API 将无法登录。
- 公网生产环境建议在 Slite 前端部署 TLS 反向代理（如 Caddy、Nginx 或 Traefik）。除非所有外部流量严格经过该代理且代理会重写转发头，否则请保持 `NUXT_TRUST_PROXY=false`。

## 4. GeoIP 数据库 {#geoip-database}

发布版 Docker 镜像在 `/app/geoip/dbip-city-lite.mmdb` 中内置了按月更新的 **DB-IP City Lite** 数据库，地理位置分析开箱即用。

DB-IP City Lite 遵循 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 许可：

> Contains the DB-IP City Lite database (https://db-ip.com). DB-IP City Lite is licensed under the Creative Commons Attribution 4.0 International License.

数据库加载优先级如下：

1. `NUXT_GEOIP_PATH`（指向自定义或商业 MMDB 文件）
2. `/data/geoip.mmdb`（挂载至持久化卷）
3. `/data/dbip-city-lite.mmdb`（挂载至持久化卷）
4. `/app/geoip/dbip-city-lite.mmdb`（镜像内置版本）

地理位置查询遵循**平稳回退**（fail-open）原则：若未找到有效数据库，地理位置字段保持为空，短链接跳转与访问分析日志记录照常进行。注意 City Lite 包含国家、地区、城市和坐标数据，但不包含时区数据。

## 5. 自定义镜像构建

自行构建镜像时，可通过构建参数锁定特定月份的 [DB-IP](https://db-ip.com) City Lite 版本：

```sh
docker build --build-arg DBIP_VERSION=2026-09 -t slite:local .
```

若省略该参数，构建过程会自动下载当月最新数据，若不可用则回退至上月。

## 6. 运行约束

- **单进程运行：** 每个数据目录只允许运行单个容器与单一 Node.js 进程。不支持多副本横向扩展或进程管理器集群模式。
- **本地存储限定：** 严禁在多个运行实例间共享 `/data`，不要将数据卷挂载在网络文件系统（NFS、SMB）上。
- **数据卷保留：** 日常运维或升级时切勿执行 `docker compose down -v`，该命令会彻底删除具名数据卷。
- **自动备份：** 自动短链接备份默认在服务进程启动后每 24 小时运行一次，并保留最近 30 份快照。在 `.env` 中设置 `NUXT_DISABLE_AUTO_BACKUP=true` 可停用该定时任务。

版本升级说明见[升级 Slite](/zh-CN/deployment/upgrading)。
