# 快速开始

1. 克隆 [Slite](https://github.com/miantiao-me/Slite)。
2. 将 `.env.example` 复制为 `.env`，并将 `NUXT_SITE_TOKEN` 设置为至少 8 位的强密码。
3. 参考 [Docker 部署](/zh-CN/deployment/docker)，配置持久化的本地 `/data` 数据卷。
4. 打开 `/dashboard`，登录并创建短链接。

未设置 `NUXT_SITE_TOKEN` 时，Slite 仍会正常处理公开短链接重定向，但会生成一个仅在当前进程有效的随机令牌：仪表盘和 API 均无法认证，该令牌不会记录到日志，也不会写入磁盘，且每次重启都会变化。请配置固定令牌并重启服务后再管理实例。

本地开发需要安装 Node.js 24 或更高版本以及 pnpm 11.11.0：

```sh
pnpm install
pnpm dev
```

开发服务器监听 5483 端口，并将运行时数据保存在 `./data`。切勿将开发进程和生产进程指向同一个数据目录。

已有实例的数据迁移请参考[手动导出与导入链接](/zh-CN/features/import-export)。
