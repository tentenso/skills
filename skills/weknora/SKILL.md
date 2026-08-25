---
name: weknora
description: 通过 WeKnora REST API 检索和管理知识库内容。用于列出知识库、查询知识详情、混合检索，以及按明确目标上传文件、导入 URL、创建或更新 Markdown、重新解析或删除知识；不用于 WeKnora 部署运维、模型配置或聊天会话。
---

# WeKnora 知识库操作

通过 WeKnora REST API 查询、检索和管理知识库内容。以实际 API 响应为准，不根据名称猜测知识库或知识条目 ID。

## 配置访问

调用前检查以下环境变量：

- `WEKNORA_BASE_URL`：必须是以 `/api/v1` 结尾的 WeKnora API 地址，例如 `https://weknora.example.com/api/v1`。
- `WEKNORA_API_KEY`：从 WeKnora 账户设置或管理员处取得的 API Key。
- `WEKNORA_TENANT_ID`：仅平台级 API Key 需要，脚本会将其作为 `X-Tenant-ID` 请求头发送。

缺少必需配置时停止调用，请用户在运行环境中设置；不要要求用户把 API Key 粘贴到对话中，也不要输出、记录或写入仓库。不得关闭 TLS 证书校验。

使用 [scripts/weknora-api.sh](scripts/weknora-api.sh) 发起请求。该脚本统一添加鉴权和请求 ID，支持 JSON 请求与文件上传：

```bash
<skill-dir>/scripts/weknora-api.sh request GET "knowledge-bases"
<skill-dir>/scripts/weknora-api.sh request POST "knowledge-bases/<kb-id>/hybrid-search" '<json>'
<skill-dir>/scripts/weknora-api.sh request-file POST "knowledge-bases/<kb-id>/knowledge/manual" payload.json
<skill-dir>/scripts/weknora-api.sh upload-file "<kb-id>" "/absolute/path/document.pdf" true
```

请求体、权限、端点和响应字段按需查阅 [references/api.md](references/api.md)。不要把端点名、字段或枚举从示例类推到未记录的接口。

## 操作流程

1. 区分只读检索、内容导入、更新、重解析、取消解析和删除；只执行用户要求的范围。
2. 先列出或读取资源，解析真实的 KB ID、知识 ID、标题和当前状态。名称重复或目标范围不唯一时停止询问。
3. 核对 API Key 能力：读取和检索需要 `retrieve`，内容写入需要 `ingest`；平台级 Key 还需有效的 `WEKNORA_TENANT_ID`。
4. JSON 请求使用结构化生成方式构造正文。不要手工拼接未转义的用户文本、URL 或 Markdown。
5. 执行后检查 HTTP 结果和 JSON 中的 `success`。写操作还要重新读取对应资源，核对标题、来源、KB 归属和状态。

KB 内混合检索优先使用 `POST /knowledge-bases/:id/hybrid-search`。`GET` 携带 JSON body 只是服务端保留的兼容方式，不作为默认调用方式。

## 写入与破坏性操作

- 上传文件、导入 URL 或创建 Markdown 前，必须已明确源内容和目标 KB；先报告解析出的 KB 名称与 ID。当前请求已明确授权该次创建时无需重复确认。
- 更新、重解析、取消解析或删除前，先读取目标并展示知识标题、知识 ID、所属 KB 和具体影响，然后取得该次确认。
- 删除是异步操作。提交成功只代表任务已受理，必须继续查询或明确报告尚未完成。
- 不自动重试写操作。网络超时后的结果未知时先读取目标状态；`409` 可能表示文件或 URL 已存在，应报告服务端返回的现有知识条目，不重复创建。
- 不清空整个知识库，也不扩展到批量删除、知识库生命周期管理或其它未包含在本技能范围内的接口。

## 解析进度

上传、URL 导入、Markdown 发布或重解析后，以 `GET /knowledge/:id` 返回的 `parse_status` 为准。按固定间隔进行有上限的轮询；默认最多等待 5 分钟、每 10 秒一次。达到上限仍未终止时报告当前状态，不无限等待。

终止状态通常为 `completed`、`failed` 或 `cancelled`；`finalizing` 表示主解析完成但富化任务仍在运行，不能误报为全部完成。失败时读取 `error_message`，未经用户确认不自动重解析。

## 完成报告

报告实际观察到的结果：

```text
操作：列出 / 检索 / 上传 / 导入 URL / 创建 Markdown / 更新 / 重解析 / 取消 / 删除
目标：<KB 名称与 ID> / <知识标题与 ID>
输入：<文件路径、URL 或查询摘要；不包含密钥>
结果：<返回数量、knowledge ID、parse_status 或任务 ID>
核对：<重新读取的资源和状态>
未完成项：<仍在解析、权限不足、重复内容或错误>
```

## 来源

本技能移植自 ClawHub `@lyingbug/weknora` 1.0.1（MIT-0），并针对本仓库规范调整。API 细节已对照 Tencent/WeKnora 官方仓库提交 `01ec6c0509a6e1ad62617f6125d3093842910fb0` 核验；服务端版本不同时，应以该部署的官方文档和实际响应为准。
