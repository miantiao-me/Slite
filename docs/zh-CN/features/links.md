---
title: 链接功能
description: 自定义短链码、智能分流、有效期限、访问密码、安全检测、社交分享预览、网页隐匿、标签体系、健康检查与重定向配置。
---

# 链接功能

通过后台仪表盘或 REST API 创建与管理短链接。短链接必须包含目标地址，其余配置项均为可选。

## 短链码（Slug）与标签体系

留空短链码输入框即可自动生成 6 位随机小写短链码。

- **大小写敏感模式：** 当配置 `NUXT_CASE_SENSITIVE=true` 时，自定义短链码将严格区分大小写（`Docs` 与 `docs` 属于两条独立的链接）。系统自动生成的短链码始终为小写。
- **标签：** 使用标签为链接分组归类。标签自动转换为全小写。每个链接最多关联 10 个标签，单个标签长度为 1–32 个字符。

## 有效期限与演示预览模式

设置未来时间作为有效期限，过期后的短链接将停止重定向。导入 API 允许包含已过期的记录，以便保留完整的历史归档。

::: warning 演示预览模式
`NUXT_PUBLIC_PREVIEW_MODE=true` 将开启只读演示模式：禁止对已有链接进行编辑与删除，所有新建短链接将在 5 分钟后自动过期。仅建议在公开临时的演示环境中使用。
:::

## 访问密码与不安全警告

设置密码保护的短链接在浏览器中打开时会呈现密码输入界面。API 客户端可在请求头 `x-link-password` 中携带密码直接访问。密码在持久化写入 SQLite 权威数据库前会经过 PBKDF2 哈希处理，绝不以明文或对称加密形式存储。

`unsafe` 标记用于控制钓鱼与恶意网站拦截警告页：

- 可在仪表盘中手动将链接标记为安全或不安全。
- 若配置了 `NUXT_SAFE_BROWSING_DOH` 且创建时未显式设置 `unsafe`，Slite 会通过配置的 DNS-over-HTTPS 端点对目标域名进行安全检测。
- 若上游解析器返回拦截响应，Slite 会自动将该链接标记为不安全。

::: tip 安全检测遵循平稳回退
若 DNS-over-HTTPS 查询超时或请求失败，Slite 会放行该链接，避免因检测端点异常而误阻断正常业务访问。
:::

访客可通过提交表单（带有 `confirm=true` 的 `POST` 请求）确认并继续跳转不安全链接。对于同时配置了密码与不安全标记的链接，API 调用须同时提供 `x-link-password` 与 `x-link-confirm: true`。

## 智能分流

根据访问者的上下文环境实施精准重定向：

- **查询参数透传：** 自动将访客请求中的查询参数（如 `?utm_source=...`）附加到目标 URL 尾部。
- **国家/地区分流：** 将特定 ISO 国家代码（如 `US`、`DE`、`JP`）映射至专用目标地址。地理位置检测基于本地加载的 GeoIP 数据库。
- **设备类型分流：** 为 Apple iOS 移动设备（iPhone、iPad、iPod，不含 macOS）与 Android 设备设置专属重定向地址。设备规则优先级高于国家/地区规则与默认目标地址。

## 社交分享预览（OpenGraph）、爬虫识别与网页隐匿

配置社交分享元数据（OpenGraph 标题、描述与预览图），使链接在分享至微信、Slack、Twitter/X、Discord、Telegram 等应用时展示结构化卡片。

上传的预览图片（支持 JPEG、PNG、WebP、GIF，单张限制 5 MB 以内）通过 unstorage 文件系统驱动保存在本地持久化目录 `/data/files/images` 下。

当社交平台爬虫抓取配置了预览元数据的短链接时，Slite 会直接返回包含 OpenGraph 标签的静态 HTML 页面，而非立即执行 HTTP 301 重定向。

::: warning 网页隐匿并非隐私防护
隐匿模式通过全屏 iframe 嵌入目标网页，浏览器地址栏保持显示短链接地址。浏览器的网络检查器依然能直接查看到目标主机的真实网络请求。设置了防嵌入响应头（如 `X-Frame-Options` 或 `Content-Security-Policy`）的网站，以及多数认证登录和支付页面，在隐匿模式下将无法正常加载。
:::

## 反向代理模式

开启反向代理模式后，访问短链（`/:slug`）时，Slite 进程会直接请求目标 URL 并把响应流式返回给客户端，而不会返回 HTTP 301/302 重定向。

Slite 采用极简代理设计，不做全站代理，也不使用额外域名或子域名，仅对短链本身的单次请求进行转发。

### 适用场景

- **API 接口：** 转发 API 请求或 Webhook，透传 `Authorization` 及自定义请求头，调用方直接获取接口响应。
- **Shell 安装脚本：** 支持形如 `curl -fsSL https://slite.example/install | bash` 的一键安装命令。
- **原始文本与配置：** 托管 Raw 文本片段、JSON 数据或远程客户端订阅配置。
- **单文件下载：** 直链下载单个文件，无需跳转到原始存储或外部网盘地址。

### 不适用场景与限制

反向代理模式**不适合普通多资源网页**。

代理只作用于短链本身这单次请求，Slite 具备以下明确边界：

- **不改写资源路径：** 不会改写 HTML 或 CSS 中的相对路径与根路径引用。
- **不处理子路径：** 请求 `/:slug/subpath` 不会被转发到目标地址。
- **不转发运行时请求：** 不会代理网页运行时的动态 `import()`、`fetch()` 或 WebSocket 连接。

例如，若代理的目标网页包含 `<script src="/assets/app.js">` 或 `<link rel="stylesheet" href="./style.css">`，浏览器在加载这些资源时会直接请求 Slite 自身的域名（如 `https://slite.example/assets/app.js`），导致 404 错误、样式丢失及脚本执行异常。只有所有静态资源均使用绝对外部 URL（例如完整 CDN 链接）的独立页面才可能正常展示。

### 如何开启

反向代理模式**默认关闭**。

1. **设置环境变量：** 在进程环境中添加 `NUXT_PUBLIC_LINK_PROXY_ENABLED=true`。
2. **重启进程：** 重启 Node.js 进程或重建 Docker 容器，使运行时配置读取新值。

该配置仅影响访问行为：当未开启该环境变量时，已配置代理的短链在访问时会自动退化为普通的 HTTP 重定向。反向代理与网页隐匿互斥，仪表盘的开关启用其中一个时会自动关闭另一个。

### 安全说明与防护机制

::: warning 同源安全风险
被代理的内容直接在你的 Slite 域名下提供，且**不包含 CSP sandbox 隔离**。

这意味着上游返回的活动内容（HTML、JavaScript、SVG 等）会直接在 Slite 的**同源环境**中执行，可以读取该域名下的 Cookie 和 localStorage（包括管理后台的认证 Token）。**切勿代理不受信或不可控的目标。**
:::

Slite 保留了以下防护机制：

- **私网目标拦截：** 仅允许代理公网 `http(s)` 目标，拦截 `localhost`、IPv4 私网与保留段，以及 IPv6 的 `::`、`::1`、ULA、链路本地、组播和 `::ffff:` 映射地址。字面 IP 检查无法防御针对域名的 DNS rebinding。上游重定向由运行时自动跟随，仅对初始目标进行公网校验。
- **请求头过滤：** 客户端请求中的 `cookie`、`host`、hop-by-hop 头、`content-length`、`cf-*`、`x-forwarded-*`、`x-real-ip` 与 `x-link-*` 不会转发给上游；`authorization` 及其他自定义请求头会透传。Slite 会以可信的客户端 IP（遵循 `NUXT_TRUST_PROXY` / `NUXT_CLIENT_IP_HEADER`）自动补全 `x-forwarded-for`，并补全 `x-forwarded-proto` 和 `x-forwarded-host`。
- **响应头过滤：** 剥离上游返回的 hop-by-hop 头与 `set-cookie`。响应始终附加 `X-Content-Type-Options: nosniff`。
- **受保护链接隔离：** 密码验证或不安全警告表单确认后，会在同一次请求中以不带请求体的 GET 请求上游，表单中的密码绝不会发往上游。API 客户端可直接通过 `x-link-password` 和 `x-link-confirm: true` 请求头透传请求体（JSON/二进制）。带有密码或 unsafe 的链接响应统一附加 `Cache-Control: private, no-store`。

## 服务端健康检查

**仪表盘 → Check** 工具（及 `/api/link/check` 接口）可从 Slite 服务端主动发起网络探测，验证目标地址的连通性（单次最多探测 10 个目标，超时范围 1–30 秒）。

系统内置防护机制，会自动拦截针对回环地址（`127.0.0.1`、`localhost`）、私有内网网段（`10.0.0.0/8`、`192.168.0.0/16`、`172.16.0.0/12`）及链路本地地址的请求，防御 SSRF 风险。

## 全站重定向行为配置

通过环境变量灵活调节实例级的重定向响应：

- **重定向状态码：** 通过 `NUXT_REDIRECT_STATUS_CODE` 自定义成功命中的响应码（默认为 `301`，支持 `302`、`307`、`308`）。未匹配短链的跳转始终保持为 HTTP `302`。
- **缓存控制：** 设置 `NUXT_REDIRECT_NO_STORE=true` 可返回 `Cache-Control: no-store` 标头，要求中间代理和客户端浏览器不缓存跳转响应。
- **首页重定向：** 配置 `NUXT_PUBLIC_HOME_URL` 可将根路径 `/` 跳转至指定外部网站，替代默认的 Slite 落地页。旧名称 `NUXT_HOME_URL` 目前仍然有效。
- **未命中重定向：** 配置 `NUXT_NOT_FOUND_REDIRECT` 可将未识别的短链统一导向指定的 404 说明页或备用站点。
