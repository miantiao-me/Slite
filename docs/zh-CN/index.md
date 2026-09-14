# Slite

简洁的自托管短链接与访问分析应用。

创建并管理短链接，查看访问分析，并将数据完整保留在自己的服务器上。Slite 运行单一 Node.js 进程，采用 SQLite 作为权威存储，基于 unstorage memory 驱动实现进程内短链接内存缓存，通过 DuckDB 提供访问分析，并基于 unstorage 文件系统驱动存储上传图片与备份。AI 功能为可选。

- [快速开始](/zh-CN/guide/getting-started)
- [通过 Docker 或 Compose 部署](/zh-CN/deployment/docker)
- [配置实例](/zh-CN/configuration/)
- [数据备份与恢复](/zh-CN/features/backups)
- [源代码](https://github.com/miantiao-me/Slite)

从源码构建需要 Node.js 24 或更高版本以及 pnpm 11.11.0。每个本地数据目录仅允许运行一个实例。
