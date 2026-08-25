# WeKnora API 参考

仅加载与当前请求有关的部分。这里记录的是本技能覆盖的 API 子集，不代表 WeKnora 的完整接口面。

## 通用约定

- `WEKNORA_BASE_URL` 已包含 `/api/v1`，下表路径均相对于该地址。
- API Key 请求头为 `X-API-Key`。平台级 Key 必须同时提供 `X-Tenant-ID`；空间级 Key 不得用它切换到其它空间。
- 读取和检索要求 `retrieve` 或 full access；上传、创建、更新、重解析、取消和删除要求 `ingest` 或 full access。Key 的 KB allow-list 仍会限制可访问范围。
- 多数成功响应为 `{"success":true,"data":...}`。列表通常另含 `total`、`page`、`page_size`。
- Handler 错误通常为 `{"success":false,"error":{"code":1003,"message":"...","details":null}}`；认证和权限中间件也可能只返回 `{"error":"..."}`。
- 常见 HTTP 状态：`400` 参数错误、`401` 未认证、`403` 无权限、`404` 不存在、`409` 冲突或重复、`429` 限流/配额、`500` 服务端错误、`503` 暂不可用。

## 只读接口

| 目的 | 方法与相对路径 | 参数 |
| --- | --- | --- |
| 列出知识库 | `GET knowledge-bases` | 可选查询参数 `agent_id`、`agent_source_tenant_id`、`creator=mine\|others` |
| 知识库详情 | `GET knowledge-bases/:kb_id` | 可选 `agent_id` |
| 浏览 KB 内容 | `GET knowledge-bases/:kb_id/knowledge` | `page`、`page_size`、`tag_ids`、`keyword`、`file_type`、`parse_status`、`source`、`start_time`、`end_time` |
| 知识详情/解析进度 | `GET knowledge/:knowledge_id` | 无 |
| KB 内混合检索 | `POST knowledge-bases/:kb_id/hybrid-search` | JSON，见下文 |
| 跨 KB 检索 | `POST knowledge-search` | JSON，见下文 |

分页默认 `page=1&page_size=20`。服务端文档规定普通列表的 `page_size` 范围为 1-100；不要请求无界结果。

### KB 内混合检索

推荐使用 POST。`query_text` 与 `query_embedding` 至少按服务端条件提供一个；通常使用：

```json
{
  "query_text": "部署流程",
  "match_count": 5,
  "knowledge_ids": [],
  "tag_ids": []
}
```

可选字段：`vector_threshold`、`keyword_threshold`、`disable_keywords_match`、`disable_vector_match`、`only_recommended`、`skip_context_enrichment`。不要臆测阈值；用户未指定时让服务端使用其配置。

结构化构造请求示例：

```bash
payload="$(jq -nc --arg query "$query" --argjson count 5 \
  '{query_text:$query,match_count:$count}')"
<skill-dir>/scripts/weknora-api.sh request POST \
  "knowledge-bases/$kb_id/hybrid-search" "$payload"
```

### 跨 KB 检索

请求体字段：`query`（必需）、`knowledge_base_id`（旧版单 KB）、`knowledge_base_ids`、`knowledge_ids`、`tag_ids`、`mentioned_items`。优先使用 `knowledge_base_ids`：

```json
{"query":"部署流程","knowledge_base_ids":["kb-1","kb-2"]}
```

搜索结果 `data[]` 的常用字段包括 `id`、`content`、`score`、`match_type`、`knowledge_id`、`knowledge_title`、`knowledge_filename`、`knowledge_base_id`、`chunk_index`、`chunk_type`、`metadata`。保留结果来源，回答时不要只返回脱离知识标题和 ID 的片段。

## 内容导入

| 目的 | 方法与相对路径 | 请求 |
| --- | --- | --- |
| 上传文件 | `POST knowledge-bases/:kb_id/knowledge/file` | multipart：必需 `file`；可选 `fileName`、`metadata`、`enable_multimodel`、`tag_ids`、`channel`、`process_config` |
| 导入 URL | `POST knowledge-bases/:kb_id/knowledge/url` | JSON：必需 `url`；可选 `file_name`、`file_type`、`title`、`enable_multimodel`、`tag_ids`、`channel`、`process_config` |
| 创建 Markdown | `POST knowledge-bases/:kb_id/knowledge/manual` | JSON：`title`、`content`、`status=draft\|publish`、`tag_ids`、`channel`、`process_config` |

文件上传使用：

```bash
<skill-dir>/scripts/weknora-api.sh upload-file "$kb_id" "$file_path" true
```

URL 或 Markdown 中含用户文本时用 `jq` 生成 JSON，例如：

```bash
payload="$(jq -nc --arg url "$source_url" '{url:$url}')"
<skill-dir>/scripts/weknora-api.sh request POST \
  "knowledge-bases/$kb_id/knowledge/url" "$payload"
```

重复文件或 URL 返回 `409`，响应的 `data` 可能包含已经存在的 Knowledge。不要把冲突当作可盲目重试的临时错误。

## 单条知识管理

| 目的 | 方法与相对路径 | 请求/行为 |
| --- | --- | --- |
| 更新知识元信息 | `PUT knowledge/:knowledge_id` | JSON 子集：`title`、`description`、`tags`、`custom_metadata` |
| 更新 Markdown | `PUT knowledge/manual/:knowledge_id` | JSON 子集：`title`、`content`、`status` |
| 重解析 | `POST knowledge/:knowledge_id/reparse` | 可无正文；可选 `{"process_config":{...}}` |
| 取消解析 | `POST knowledge/:knowledge_id/cancel-parse` | 无正文 |
| 删除知识 | `DELETE knowledge/:knowledge_id` | 异步，响应 `data.task_id` |

`custom_metadata` 是整体覆盖，不是增量合并。当前官方约束为：最多 20 个字段，键长 1-64 字符，值仅允许 string/number/boolean/null，字符串值最长 1000 字符。

## 状态与字段

知识详情常用字段：`id`、`knowledge_base_id`、`title`、`description`、`type`、`source`、`channel`、`parse_status`、`summary_status`、`enable_status`、`file_name`、`file_type`、`file_size`、`created_at`、`updated_at`、`processed_at`、`error_message`。

当前解析状态：

- `pending`：等待处理。
- `processing`：文档读取、分块或向量化中。
- `finalizing`：主解析已完成，摘要、问题生成或图谱提取等富化子任务仍在运行；内容可能已可检索，但资源仍在消耗。
- `completed`：解析及全部富化任务完成。
- `failed`：失败，读取 `error_message`。
- `cancelled`：用户取消；已有条目和已写入的部分内容可能保留。
- `deleting`：异步删除中。

## 版本核验

本参考于 2026-08-25 对照以下官方文件核验：

- `website-docs/04-api/01-api-overview.md`
- `website-docs/04-api/02-api-knowledge.md`
- `website-docs/04-api/02-api-chat.md`
- `internal/router/routes_knowledge.go`
- `internal/types/knowledge.go`
- `internal/types/search.go`

对应 Tencent/WeKnora 提交：`01ec6c0509a6e1ad62617f6125d3093842910fb0`。若目标部署版本不同，先查看该部署的 Swagger 或对应版本官方源码，不要把本文档中的新增字段强行用于旧版本。
