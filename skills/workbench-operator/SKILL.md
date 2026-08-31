---
name: workbench-operator
description: 通过已配置地址和受支持的访问认证操作工厂客户开发工作台。用于查询或更新工厂级客户、开发关系、互动、待办、商机和草稿，预览或确认 CSV/聊天导入，以及导出并核验结果；不用于直接修改 SQLite、部署维护或未经确认的对外发送。
---

# Workbench Operator

通过稳定的 `/api/v1` 操作工作台；正式 API 未覆盖时才使用页面可见控件。始终保护工厂隔离、内容真实性、并发版本和可恢复性。

## Setup

从用户或当前执行环境取得以下配置，不猜测地址、端口或认证方式：

| 配置 | 是否必需 | 说明 |
| --- | --- | --- |
| `WORKBENCH_BASE_URL` | 是 | 工作台 origin，例如 `https://workbench.example.com`；移除尾部 `/` |
| `WORKBENCH_USERNAME` + `WORKBENCH_PASSWORD` | 否 | 已批准反向代理使用 HTTP Basic Auth 时成对提供 |
| `WORKBENCH_AUTH_HEADER` | 否 | 其他代理认证使用的完整请求头；不得与 Basic Auth 同时使用 |

使用当前操作系统或 Agent 已有的环境变量、密钥存储和 HTTP 客户端配置。不要创建依赖特定 shell 的配置脚本，也不要把地址或凭据写入 Skill、业务文件、请求正文或 URL。

工作台应用本身没有登录系统；认证若存在，来自已批准的反向代理。没有认证配置不等于可以猜测或绕过部署边界。若地址缺失，只询问用户准确的“工作台访问地址”。

## Credential Check

任何业务 API 调用前检查首页和健康端点。以下是单行 `curl` 模板；将占位符替换为当前环境的实际值，并按 Setup 追加一种认证选项：

```text
curl --fail-with-body --silent --show-error --request GET <AUTH_OPTION> "<BASE_URL>/"
curl --fail-with-body --silent --show-error --request GET --header "Accept: application/json" <AUTH_OPTION> "<BASE_URL>/api/v1/health"
```

认证选项：无代理认证时删除 `<AUTH_OPTION>`；Basic Auth 使用 `--user "<username>:<password>"`；其他认证使用 `--header "<approved-header-name>: <approved-secret>"`。不要打印展开后的凭据。

仅当健康响应的 `data.status` 为 `ok` 时继续。地址缺失、认证配置不完整、`401/403`、证书错误、异常跳转、不可达或数据库健康异常时停止，不尝试写操作或猜测替代凭据。

开始新类型的操作，或接口可能已升级时读取实时合同：

```text
curl --fail-with-body --silent --show-error --request GET --header "Accept: application/json" <AUTH_OPTION> "<BASE_URL>/api/v1/openapi.json"
```

## API Call Template

读取请求：

```text
curl --fail-with-body --silent --show-error --request GET --header "Accept: application/json" <AUTH_OPTION> "<BASE_URL>/api/v1/factories?limit=100"
```

POST、PUT、PATCH 将 JSON 放在受控的绝对路径文件中，并设置与“方法 + 路径 + 正文”绑定的稳定幂等键：

```text
curl --fail-with-body --silent --show-error --request PATCH --header "Accept: application/json" --header "Content-Type: application/json" --header "Idempotency-Key: <stable-operation-key>" --data-binary "@<absolute-json-file>" <AUTH_OPTION> "<BASE_URL>/api/v1/factories/<factoryId>/customers/<customerId>"
```

如果当前环境没有 `curl`，使用已有 HTTP 客户端发出等价请求，不安装依赖或改写临时脚本。相同请求重试时复用原键；方法、路径或正文变化时使用新键。超时后先 GET 核对业务结果，再决定是否用原键重试。

更新已有记录前先 GET，将响应中的 `updatedAt` 写入 `expectedUpdatedAt`；更新客户公司网站时使用 `organizationUpdatedAt`。所有业务路径必须以 `/api/v1` 开头，客户资源必须位于 `/api/v1/factories/{factoryId}` 下。查询参数需 URL 编码。

## API Decision Table

下表路径均以 `/api/v1` 开头。请求字段以实时 OpenAPI 为准，不凭页面标签或内部函数名猜测。

| 用户意图 | 方法与端点 | 关键参数或确认 |
| --- | --- | --- |
| 检查服务/读取合同 | `GET /health`；`GET /openapi.json` | `data.status = ok` |
| 查找/读取工厂 | `GET /factories`；`GET /factories/{factoryId}` | 按准确名称选择；重名时让用户选 ID |
| 创建/更新工厂 | `POST /factories`；`PATCH /factories/{factoryId}` | 更新带 `expectedUpdatedAt` |
| 查找/读取客户 | `GET /factories/{factoryId}/customers[/{customerId}]` | `q`、`limit`、`cursor`；用强标识核对身份 |
| 创建/更新客户 | `POST /factories/{factoryId}/customers`；`PATCH /factories/{factoryId}/customers/{customerId}` | `displayName`；更新带 `expectedUpdatedAt` |
| 更新客户公司网站 | `PATCH /factories/{factoryId}/customers/{customerId}/organization-website` | 使用 `organizationUpdatedAt` 作为 `expectedUpdatedAt` |
| 归档客户/开始开发 | `POST /factories/{factoryId}/customers/{customerId}/archive`；`POST /factories/{factoryId}/customers/{customerId}/leads` | 归档需 `ARCHIVE_CUSTOMER`；客户必须属于当前工厂 |
| 读取/更新开发关系 | `GET /factories/{factoryId}/leads[/{leadId}]`；`PATCH /factories/{factoryId}/leads/{leadId}` | 回复分类需 `CONFIRM_REPLY_CLASSIFICATION`；停止联系需 `CONFIRM_STOP_CONTACT` |
| 推进/恢复联系 | `POST /factories/{factoryId}/leads/{leadId}/advance`；`POST /factories/{factoryId}/leads/{leadId}/resume` | `targetStatus: CONNECTED` 会原子创建当天跟进待办；恢复需 `RESUME_CONTACT`；均带版本值 |
| 读取/更新背调 | `GET/PATCH /factories/{factoryId}/leads/{leadId}/research` | `REVIEWED` 需证据和 `CONFIRM_RESEARCH_REVIEWED` |
| 读取/更新评分 | `GET/PUT /factories/{factoryId}/leads/{leadId}/scores` | `scores[]` 的维度必须属于当前工厂 |
| 读取/记录互动 | `GET/POST /factories/{factoryId}/interactions`；`PATCH /factories/{factoryId}/interactions/{interactionId}` | 非内部互动需 `RECORD_ACTUAL_INTERACTION` |
| 读取/创建/完成待办 | `GET/POST /factories/{factoryId}/tasks`；`POST /factories/{factoryId}/tasks/{taskId}/complete` | 可选 `leadId` 必须属于当前工厂 |
| 漏斗与跟进策略 | `GET /factories/{factoryId}/pipeline-stages`；`GET /factories/{factoryId}/followup-policies`；`PATCH /factories/{factoryId}/followup-policies/{policyId}` | 策略更新至少提供一个字段 |
| 预览/应用跟进策略 | `GET /factories/{factoryId}/followup-policies/application-preview`；`POST /factories/{factoryId}/followup-policies/apply` | 最新 `fingerprint` 和 `APPLY_FOLLOWUP_POLICIES` |
| 读取/创建/更新商机 | `GET/POST /factories/{factoryId}/opportunities`；`GET/PATCH /factories/{factoryId}/opportunities/{opportunityId}` | 创建需 `CREATE_OPPORTUNITY`；赢/输需 `CONFIRM_OPPORTUNITY_OUTCOME` |
| 产品与模板 | `GET/POST /factories/{factoryId}/products`；`GET/POST /factories/{factoryId}/message-templates` | 内容必须来自当前工厂的真实配置 |
| 读取/生成/审核草稿 | `GET/POST /factories/{factoryId}/drafts`；`PATCH /factories/{factoryId}/drafts/{draftId}` | 草稿内容只能来自已核验事实；审核不代表已发送 |
| 记录草稿已发送 | `POST /factories/{factoryId}/drafts/{draftId}/sent` | 只记录已在外部真实发送的消息；需 `RECORD_ACTUAL_SEND` |
| 预览/确认潜客 CSV | `POST /factories/{factoryId}/imports/prospects/preview`；`POST /factories/{factoryId}/imports/prospects/confirm` | 原 CSV、`fingerprint`、`IMPORT_PROSPECTS` |
| 预览/确认完整聊天 | `POST /factories/{factoryId}/imports/chats/preview`；`POST /factories/{factoryId}/imports/chats/confirm` | `leadId`、原文、别名、`fingerprint`、`IMPORT_CHAT` |
| 导入批次/工厂导出 | `GET /factories/{factoryId}/import-batches`；`GET /factories/{factoryId}/export` | 只读取目标工厂数据 |
| 分析 | `GET /factories/{factoryId}/analytics/dashboard`；`GET /factories/{factoryId}/analytics/channels`；`GET /factories/{factoryId}/analytics/pipeline`；`GET /factories/{factoryId}/analytics/replies`；`GET /factories/{factoryId}/analytics/stopped` | `replies` 和 `stopped` 支持分页 |

完整资源表、确认常量和页面回退入口见 [references/ui-and-http.md](references/ui-and-http.md)。只在任务涉及对应功能时读取。

## Common Workflows

### Locate the Factory and Record

1. `GET /api/v1/factories?limit=100`，按用户给出的准确名称确认 `factoryId`；目标不明确就停止询问。
2. 在该工厂下查询客户或开发关系。客户优先按邮箱、WhatsApp、LinkedIn，或“姓名 + 公司”核对，不仅凭姓名选择。
3. GET 目标明细，保存记录 ID、工厂归属和 `updatedAt`。任何跨工厂 ID、不一致状态或重复候选都先交给用户核对。

### Update One Record Safely

1. GET 当前记录，确定只需改变的字段。
2. 在请求 JSON 中加入最新 `expectedUpdatedAt`，向用户复述目标记录、旧值和新值；涉及业务判断时取得该次具体确认。
3. 用新的稳定幂等键提交一次。
4. 再次 GET 同一记录，比较字段、`updatedAt` 和工厂归属。只报告实际响应。

### Preview and Confirm an Import

批量导入前读取 [references/data-workflows.md](references/data-workflows.md) 以及源数据所属项目的 `DATA_FORMATS.md`（若存在）。

1. 固定目标 `factoryId`，保留原始 CSV/聊天正文，不补造缺失信息。
2. 调用对应 `preview`，报告 `fingerprint`、有效、错误、重复、跳过及方向统计；预览不授权写入。
3. 让用户确认目标工厂、预览指纹、写入数量和错误/跳过处理。
4. 确认正文保留完全相同的源内容和参数，并加入原 `expectedFingerprint` 与 `IMPORT_PROSPECTS` 或 `IMPORT_CHAT`；预览和确认使用不同幂等键。
5. 确认响应必须包含实际 `backupPath`。随后 GET `import-batches` 及相关客户、开发关系或互动，核对写入、跳过、错误和工厂隔离。

### Apply a Sensitive Business Decision

回复分类、停止或恢复联系、背调审核、创建商机、商机赢/输、记录真实互动和记录已发送均需用户针对具体记录确认。API 的确认字符串只是防误触合同，不能代替用户授权。

工作台的“记录已发送”只归档已经发生的外部发送，不会替用户发送消息。真正对外发送属于另一个动作，必须单独取得授权并使用获批准的发送工具。

### Fall Back to the UI

仅当实时 OpenAPI 没有覆盖但页面存在正式入口时，读取 [references/ui-and-http.md](references/ui-and-http.md)，通过可见标签和控件操作并重新读取结果。不得抓取、硬编码或重放 Next.js Server Action ID。API 和页面都没有入口时报告能力缺口，不改用 SQLite、临时 SQL 或一次性脚本。

## Core Response Fields

- 成功：`{ "data": ... }`；分页列表另含 `meta.limit`、`meta.nextCursor`、`meta.hasMore`、`meta.total`。
- 错误：`{ "error": { "code", "message", "details?" } }`。
- 健康：`data.status`、`data.schemaVersion`。
- 可更新记录：保留实际 `id`、工厂归属和 `updatedAt`；客户公司另有 `organizationUpdatedAt`。
- 导入预览：以实际 `fingerprint` 和计数为准。导入确认：核对 `backupPath`、导入结果和回显的 `preview`。
- 跟进策略预览：以最新 `fingerprint` 和候选名单为准；提交时业务状态变化会触发 `PREVIEW_CHANGED`。

## Enum Values

- `relationshipStatus`: `NEW` | `CONTACTED` | `CONNECTED` | `REPLIED` | `STOPPED`
- `replyClassification`: `NONE` | `PENDING` | `QUALIFIED` | `MISMATCH`
- `researchStatus`: `NOT_REVIEWED` | `IMPORTED` | `REVIEWED` | `UNAVAILABLE`
- 商机 `status`: `OPEN` | `WON` | `LOST`
- 草稿 `status`: `DRAFT` | `APPROVED`；记录真实发送后为 `SENT`
- 待办 `priority`: `LOW` | `MEDIUM` | `HIGH` | `URGENT`

联系状态、回复分类和漏斗阶段是独立维度，不得互相推断。入站互动可把回复分类推进到 `PENDING`，但不代表 `QUALIFIED`；草稿 `APPROVED` 也不代表已发送。

## Pagination

分页列表使用 `limit`（1-100，默认 50）和服务返回的 `meta.nextCursor`。只在 `meta.hasMore` 为 `true` 时把该游标原样用于下一页；不得自行构造游标。部分列表支持 `q`，查询值需 URL 编码。

## Notes

- 在工作台源码仓库内执行任务时，先读该仓库的 `AGENTS.md`；数据任务另读 `DATA_FORMATS.md` 和 `README.md`，启动、备份、数据库或部署任务另读 `DEPLOYMENTS.md`。文档与实现不一致时停止写入并查验当前代码。
- 不虚构客户身份、联系方式、公开资料、互动、回复、需求、评分证据或商机金额；不向未经批准的第三方服务上传客户数据。
- 同一现实客户在不同工厂使用不同 customer ID。不得跨工厂复用 ID、搜索全局客户或把一厂变更同步到另一厂。
- 不直接编辑 SQLite，不用临时脚本绕过正式 API、页面预览、备份、确认或审计。
- 批量操作前确认没有其他用户或 Agent 正在处理同一批记录。查询结果、版本或预览变化时停止剩余批次并重新核对。
- `GET /api/export` 是旧的全部工厂 schema 3 工作台 JSON；日常任务优先使用工厂级 `/api/v1/factories/{factoryId}/export`，避免读取无关敏感数据。规范 JSON 合并和数据库恢复不属于普通 `/api/v1` 导入。

## Error Handling

| 状态/错误 | 处理方式 |
| --- | --- |
| 地址未配置、认证配置冲突 | 停止，请用户提供准确地址或修正一种认证方式 |
| `401` / `403` | 视为外层代理拒绝；核对已批准凭据，不尝试绕过 |
| `202 PENDING_OR_UNKNOWN` | 同一请求可能仍在执行；先 GET 查询业务结果，不换幂等键重复写入 |
| `400` | 检查 JSON、游标、幂等键或业务前提，不静默改业务数据 |
| `404` | 核对当前工厂和资源 ID；不得转为全局搜索 |
| `409 VERSION_CONFLICT` | 重新 GET 并请用户核对，不覆盖新版本 |
| `409 PREVIEW_CHANGED` | 重新预览并重新取得用户确认 |
| `409 CONFIRMATION_REQUIRED` | 取得对应具体业务确认；不自动补确认值 |
| `409 IDEMPOTENCY_KEY_REUSED` | 原键已绑定其他请求；检查请求差异，不用重试掩盖冲突 |
| `422 VALIDATION_ERROR` | 按 `details` 修正字段，不猜测缺失值 |
| 超时或 `5xx` | 先 GET 查询实际结果；仅对完全相同请求复用原幂等键 |

完成后报告：实际工作台地址、目标工厂、执行范围、输入与成功/跳过/错误数量、实际备份路径、重新读取的核验结果，以及未处理项和原因。不得声称未执行的写入、备份或核验已经完成。
