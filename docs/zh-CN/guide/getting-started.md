---
title: 快速开始
description: 准备本地存储、通过 Docker 或 Compose 运行 Slite、配置站点令牌并创建第一个短链接。
---

# 快速开始

Slite 是一款自托管短链接与访问分析应用。它作为单一 Node.js 进程运行在你的服务器或工作站上，无需依赖云平台账号。

## 1. 获取 Slite

将仓库克隆到宿主机：

```sh
git clone https://github.com/miantiao-me/Slite.git
cd Slite
```

如果直接使用 Docker Compose 部署，也可以只下载 `compose.yaml` 与 `.env.example`。

## 2. 选择运行方式

- **[Docker 与 Compose](/zh-CN/deployment/docker)** — 生产与自托管推荐
- **源码运行：** 需要 Node.js 24 或更高版本以及 pnpm 11.11.0：

```sh
pnpm install
pnpm dev
```

开发服务器默认监听 `5483` 端口，并将数据保存在 `./data` 目录。

## 3. 了解本地存储

所有持久化数据均保存在单一本地目录中（容器内默认为 `/data`，由 `NUXT_DATA_DIR` 控制）：

| 相对路径           | 存储角色       | 说明                                 |
| ------------------ | -------------- | ------------------------------------ |
| `slite.sqlite`     | 权威数据库     | 保存全部短链接与应用核心状态         |
| `analytics.duckdb` | 访问分析数据库 | 记录访问事件并支撑仪表盘统计分析     |
| `files/images`     | 图片存储       | 保存上传的社交分享预览图片           |
| `backups`          | 备份存储       | 保存自动与手动生成的短链接 JSON 快照 |

请将**持久化的本地数据卷**挂载到 `/data`。Slite 不需要外置数据库服务，SQLite 与 DuckDB 均由进程直接在本地管理。

## 4. 配置环境变量

将 `.env.example` 复制为 `.env` 并填写配置：

```dotenv
NUXT_SITE_TOKEN=replace-with-a-strong-private-token
NUXT_DATA_DIR=/data
NUXT_TRUST_PROXY=false
```

::: warning 请自行设置 `NUXT_SITE_TOKEN`
这是你的**仪表盘登录密码**，也是 API 工具鉴权使用的密码。长度必须至少为 8 个字符且不能包含空白字符。请保持其稳定，修改该值会导致已登录会话失效。

如果未设置或留空，Slite 仍会正常处理公开短链接跳转，但会生成一个仅存在于当前进程内存中的随机令牌，且绝不对外打印或落盘。在配置固定令牌并重启容器之前，仪表盘和受保护 API 均无法登录。
:::

更多环境变量设置见[配置参考](/zh-CN/configuration/)。

## 5. 首次登录并创建链接

1. 使用 Docker Compose 启动服务：

```sh
docker compose up -d
```

2. 在浏览器中打开 `http://localhost:5483/dashboard`（或你的反向代理域名）
3. 输入设置的 `NUXT_SITE_TOKEN` 登录
4. 创建你的第一个短链接

不同于依赖云端存储初始化的架构，Slite 在启动时会自动完成 SQLite 数据库结构的初始化，其进程内短链接缓存也会按需自动填充，无需执行额外的迁移或手动预热步骤。

仪表盘支持多语言。产品文档提供英文与简体中文。
