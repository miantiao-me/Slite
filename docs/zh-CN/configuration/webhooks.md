---
title: 点击事件 Webhook
description: 开启点击事件 Webhook，验证其 HMAC 签名、投递机制、载荷结构及隐私边界。
---

# 点击事件 Webhook

可选功能。用户点击短链接时，Slite 可以向你的 URL 发送一个轻量 JSON 事件。在[环境变量配置](./)中配置 `NUXT_WEBHOOK_URL`（以及可选的 `NUXT_WEBHOOK_SECRET`）。

访问分析中排除的爬虫点击同样不会触发 Webhook。

## 签名验证（可选但推荐）

若配置签名密钥，必须以 `whsec_` 开头。可通过 OpenSSL 生成：

```sh
printf 'whsec_%s\n' "$(openssl rand -base64 32)"
```

每个请求均包含 `webhook-id` 和 `webhook-timestamp` 请求头。签名请求还会包含 `webhook-signature: v1,<base64>`，签名内容如下：

```txt
<webhook-id>.<webhook-timestamp>.<raw-body>
```

请在解析 JSON 之前针对**原始请求体（raw body）**进行校验。若配置了错误的非空密钥，投递将直接失败（Slite 不会降级为未签名发送）。

## 载荷结构

事件类型 `link.clicked` 包含事件 ID/时间、链接 ID/短链码以及点击属性（国家、城市、设备类型、浏览器、操作系统、来源 Referrer）。

国家与城市来自系统解析的 [GeoIP 数据库](/zh-CN/deployment/docker#geoip-database)；正式发布版 Docker 镜像内置了 DB-IP City Lite，未挂载有效数据库的实例会平稳回退并将对应字段留空。

载荷**不包含** IP 地址、地理坐标、完整 User-Agent、URL 查询参数、密码或目标重定向地址。

## 投递限制

::: tip 尽力而为投递
投递完全异步，绝不阻塞短链接跳转。投递失败**不会重试**。你的接收服务必须在 10 秒内返回 2xx 响应。建议使用 HTTPS。
:::
