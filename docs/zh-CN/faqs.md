---
title: 故障排除
description: 解决 Slite 常见的部署、目录权限、登录鉴权、访问分析、反向代理、跳转与 AI 常见问题。
---

# 故障排除

## 容器启动失败或报数据库权限错误（`unable to open database file`）

1. **检查目录所有权：** Slite 容器以非 root 用户 UID `5483` 运行。若使用宿主机目录绑定挂载（如 `/srv/slite:/data`），须将该目录所有权赋予 UID `5483`：
   ```sh
   sudo chown -R 5483:5483 /srv/slite
   ```
2. **确保单进程独占：** 同一时间仅允许一个进程打开 SQLite 与 DuckDB 数据库。请检查是否有本地开发服务或其他容器实例正挂载同一个数据目录。
3. **查看容器实时日志：**
   ```sh
   docker compose logs -f
   ```

## 无法登录 `/dashboard` 仪表盘或 API 请求返回 401

1. **检查 `NUXT_SITE_TOKEN`：** 确保 `.env` 中显式设置了 `NUXT_SITE_TOKEN`，且长度不少于 8 个字符且不包含空格等空白字符。
2. **内存随机令牌机制：** 若 `NUXT_SITE_TOKEN` 未设置或留空，Slite 会生成仅存活于当前进程内存中的随机令牌。公开短链接可正常跳转，但后台管理和 API 均无法鉴权登录。请在 `.env` 中设置固定令牌后重启容器：
   ```sh
   docker compose up -d
   ```
3. **请求头格式：** API 调用的请求头格式必须严格为 `Authorization: Bearer YOUR_SITE_TOKEN`。

## 重建或更新容器后数据丢失

- **检查数据卷挂载：** 检查 `compose.yaml`，确认持久化数据卷（默认 `slite-data:/data`）已正确挂载。
- **是否误用了 `down -v`：** 运行 `docker compose down -v` 会彻底销毁具名数据卷。日常维护与升级时，请使用 `docker compose down`（不带 `-v`），或直接运行 `docker compose up -d`。

## 国家与城市访问分析图表为空

1. **检查 GeoIP 数据库加载：** 官方发布的 Docker 镜像已内置 DB-IP City Lite 数据库并自动启用。若通过源码构建或使用自定义镜像，请确保在 `/data/geoip.mmdb` 挂载了有效的 MMDB 文件，或配置 `NUXT_GEOIP_PATH`。
2. **平稳回退机制：** 未找到有效数据库时，Slite 遵循平稳回退原则，地理位置字段留空，不影响重定向与点击量记录。
3. **City Lite 不含时区：** City Lite 数据库包含国家、地区、城市和坐标，但不包含时区数据。Slite 绝不虚构时区信息。
4. **反向代理配置：** 开启 `NUXT_TRUST_PROXY=true` 仅改变信任哪个客户端 IP，本身不提供地理位置数据。

## 反向代理后获取到的客户端 IP 不准确

1. 确保公网客户端无法绕过反向代理直接访问应用端口。
2. 配置反向代理重写 `X-Forwarded-For` 请求头，或注入受信任的标头（如 `CF-Connecting-IP`）。
3. 在 `.env` 中开启 `NUXT_TRUST_PROXY=true`。若使用特定代理头，请配置 `NUXT_CLIENT_IP_HEADER=CF-Connecting-IP`。

## 近实时 3D 地球事件成批到达或感觉有延迟

这是系统设计的正常表现。实时仪表盘约每 10 秒轮询一次 DuckDB 抓取新增访问事件，并通过前端队列以大约每秒一条的速度平滑重放。它属于伪实时视觉效果，并非 SSE 或 WebSocket 长连接。请确认视图未处于暂停状态，且浏览器标签页保持处于前台。

## 自定义短链码不保留大写字母

在 `.env` 中设置 `NUXT_CASE_SENSITIVE=true` 并重启容器。大小写敏感仅对**自定义**短链码生效；系统自动生成的随机短链码始终为小写。已有短链不会自动改名。

## 隐匿模式页面空白或拒绝加载

目标网站很可能开启了防嵌入安全策略（如 `X-Frame-Options` 或 `Content-Security-Policy: frame-ancestors`）。请对该短链关闭隐匿模式。绝大多数涉及身份认证与支付交易的页面均禁止在 iframe 中展示。

## 安全浏览未对恶意域名触发拦截警告

DNS-over-HTTPS 自动安全检测仅在创建或编辑短链时**未显式设置** `unsafe` 才会执行。若手动指定了 `true` 或 `false`，以手动设置为准。若 DNS 查询超时或失败，Slite 遵循平稳回退原则放行链接。

## AI 建议功能返回 HTTP 501 或调用失败

1. **两项配置均不可少：** 必须在 `.env` 中同时设置 `NUXT_AI_BASE_URL` 与 `NUXT_AI_MODEL` 才能开启 AI。
2. **容器外网连通性：** 确保容器能够顺利访问服务商的 API 端点。
3. **模型标识符正确：** 确认配置的模型名称在服务商平台可用且已开通权限。

## 导入时跳过或拒绝记录

- **活跃短链冲突：** 遇到已有同名活跃短链码时自动跳过，防止误覆盖已有业务链接。
- **单次请求超限：** 确保单次提交条目不超过 `NUXT_IMPORT_REQUEST_LIMIT`（默认 100 条）。
- **密码格式：** 必须使用从 Slite 或 Sink 导出的受保护密码哈希。从仪表盘前端复制的掩码占位符属于非法密码。
