---
title: 可选 AI 支持
description: 通过 xsai 连接 OpenAI 兼容服务商，为短链码生成及社交分享预览提供 AI 建议辅助。
---

# 可选 AI 支持

Slite 通过 [xsai](https://github.com/moeru-ai/xsai) 支持 AI 辅助生成短链码和社交预览元数据。该功能可对接任意兼容标准 OpenAI 协议的模型服务商（如 OpenAI、DeepSeek、Ollama 或本地自建推理引擎）。

AI 功能完全为**可选**项；常规的短链接创建、管理与跳转均不依赖 AI。

## 启用步骤

AI 功能默认处于关闭状态。必须同时显式配置 `NUXT_AI_BASE_URL` 与 `NUXT_AI_MODEL`：

```dotenv
NUXT_AI_BASE_URL=https://api.openai.com/v1
NUXT_AI_MODEL=gpt-4o-mini
NUXT_AI_API_KEY=sk-...
```

在两者均正确设置之前，AI 接口会直接返回 HTTP `501` 响应，且不会发起任何外部网络连接。修改配置后请重启容器。

- **Base URL：** 必须包含服务商所要求的完整 API 路径前缀（例如 `/v1`）。
- **Model：** 必须为所连接服务商支持的有效模型标识符。
- **API Key：** 若对接无需鉴权的本地或私有模型（例如 Ollama），`NUXT_AI_API_KEY` 可以留空。

## 支持的接口

- `GET /api/link/ai?url=...` — 通过 Query 传递目标 URL，建议简短易记的短链码。
- `GET /api/link/og-ai?url=...&locale=...` — 通过 Query 传递目标 URL，建议 OpenGraph 社交预览标题与描述。支持通过可选的 `locale` 查询参数指定期望生成的语言。

若上游服务商调用超时或响应异常，Slite 会自动平稳回退至基于 URL 提取的默认值，绝不会导致链接保存失败。

## 数据隐私与行为差异说明

::: tip 仅传输目标 URL
Slite **仅将你填写的目标 URL** 发送至指定的 AI 服务商。Slite 服务端绝不会主动抓取、下载或向 AI 模型传输第三方网页的内部正文内容。
:::

在启用 AI 功能前，请确认所选服务商的数据留存政策与计费规则，切勿提交带有私密 Token 或敏感参数的 URL。
