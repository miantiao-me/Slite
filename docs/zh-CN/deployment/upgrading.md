---
title: 升级 Slite
description: 使用 Docker Compose 升级 Slite，完成数据冷备份，并在部署后验证服务。
---

# 升级 Slite

使用 Docker Compose 升级 Slite 流程清晰稳定。由于 SQLite 与 DuckDB 为本地单进程文件数据库，在升级前执行规范的数据备份至关重要。

## 1. 升级前准备

1. **执行停机完整冷备份：** 复制数据目录前务必先停止容器运行：
   ```sh
   docker compose stop
   ```
   复制或打包挂载的整个 `/data` 目录（包括 `slite.sqlite`、`analytics.duckdb`、`files/images` 和 `backups`）。切勿在数据库运行时直接拷贝文件，在线复制无法保证数据一致性。
2. 妥善备份你的 `.env` 配置文件，并记录当前使用的镜像标签或 Git 提交版本。
3. 查阅上游 Release Notes，确认是否存在重大变更或配置项调整。

## 2. 标准升级步骤

拉取最新官方镜像或更新本地源码仓库：

```sh
# 若使用官方发布镜像：
docker compose pull
docker compose up -d

# 若基于本地源码构建：
git pull origin master
docker compose up -d --build
```

::: danger 切勿删除数据卷
升级过程中绝对不要运行 `docker compose down -v`。`-v` 参数会永久销毁具名数据卷，导致权威数据库与所有访问分析历史丢失。
:::

同一时间仅允许一个进程打开数据目录。严禁新旧容器同时挂载该目录运行。

## 3. 跨服务器或跨实例迁移

如果需要将数据从其他短链接服务或另一台服务器的旧实例迁入 Slite：

1. 使用[导入与导出](/zh-CN/features/import-export)功能将短链接导出为 JSON 文件。
2. 在新 Slite 实例中导入该 JSON 数据。
3. 将 `files/images` 下上传的预览图片同步至新服务器。
4. 在新实例完成短链接重定向验证前，请保持旧实例正常运行。

注意：链接 JSON 导出不包含 DuckDB 访问分析数据。若要在跨服务器迁移时完整保留历史统计，请在停机状态下完整复制整个 `/data` 目录。

## 4. 升级后检查清单

重启容器后，建议完成以下验证：

1. 查看容器运行日志：
   ```sh
   docker compose logs -f
   ```
2. 使用 `NUXT_SITE_TOKEN` 登录 `/dashboard`。
3. 创建、访问、编辑并删除一条测试短链接。
4. 确认已有短链接跳转功能正常。
5. 确认访问分析报表与近实时 3D 地球视图正常显示。
