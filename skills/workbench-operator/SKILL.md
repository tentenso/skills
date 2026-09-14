---
name: workbench-operator
description: 通过已配置的稳定 API 或现有页面操作工厂客户开发工作台。用于查询或更新工厂级客户、开发关系、评分、背调、互动、待办、跟进策略、商机和产品，生成客户话术，预览或确认 CSV/聊天导入，以及导出并核验单个工厂；不用于全库导入导出、直接修改 SQLite、部署维护或对外发送。
---

# Workbench Operator

优先使用稳定的 `/api/v1`；只有实时 OpenAPI 未覆盖、页面又有正式可见入口时才回退到 UI。保护本机部署边界、工厂隔离、内容真实性、并发版本和导入可恢复性。

## Setup

工作台配置的唯一来源是技能根目录、即本文件同目录的 `.env` 文件（`workbench-operator/.env`）。执行任务前使用 dotenv 规则读取该文件；不得读取 shell、进程、全局环境变量、其他目录的 `.env` 或 HTTP 客户端的隐式环境配置。文件不存在、无法读取、变量重复或配置冲突时停止并报告，不猜测替代值。

`.env` 只允许配置以下变量：

| 变量 | 使用条件 |
| --- | --- |
| `WORKBENCH_BASE_URL` | 可选；未设置时使用内置默认入口 `https://workbench.tentenso.com:4430/`。拼接 API 路径前移除基址末尾的 `/` |
| `WORKBENCH_USERNAME` + `WORKBENCH_PASSWORD` | 反向代理明确使用 HTTP Basic Auth 时从 `.env` 成对读取 |
| `WORKBENCH_AUTH_HEADER` | 反向代理明确提供其他完整认证请求头时从 `.env` 读取；不得与 Basic Auth 同时使用 |

目标地址只取自 `.env` 中的 `WORKBENCH_BASE_URL`、用户当次明确指定的地址或已授权的入口；访问失败时不得自动回退到本机或其他地址。应用后端的本机监听地址 `127.0.0.1:8765` 属于部署配置，不是默认访问入口，不得为完成业务任务改变监听范围。

认证不是应用 API 的一部分。已配置入口的反向代理可提供外层认证：

| 配置 | 使用条件 |
| --- | --- |
| `WORKBENCH_USERNAME` + `WORKBENCH_PASSWORD` | 从技能根目录 `.env` 读取；反向代理明确使用 HTTP Basic Auth 时成对使用 |
| `WORKBENCH_AUTH_HEADER` | 从技能根目录 `.env` 读取；反向代理明确提供其他完整认证请求头时使用，不得与 Basic Auth 同时使用 |

不要把 `.env` 内容、凭据或展开后的认证命令写入 Skill、业务文件、请求正文、URL、日志或回复；不要猜测或绕过认证。`.env` 已由技能目录的 `.gitignore` 排除，不得强制加入版本控制。

## API Contract Discovery

不要把 `/api/v1/` 或 `/api/v1/health` 作为每次业务调用前的健康校验。只有开始新类型操作、怀疑接口版本变化，或需要核对请求字段时，才按需读取实时 OpenAPI：

```text
curl --fail-with-body --silent --show-error --request GET --header "Accept: application/json" <AUTH_OPTION> "<BASE_URL>/api/v1/openapi.json"
```

无代理认证时删除 `<AUTH_OPTION>`；Basic Auth 使用从 `.env` 读取的用户名和密码；其他认证使用从 `.env` 读取的完整请求头。不要打印展开后的命令。业务请求直接按 `.env` 中的地址和认证发送；实际请求返回地址、认证或数据库错误时再停止并核对配置，不自动回退或替代凭据。

## HTTP Contract

- 所有业务路径以 `/api/v1` 开头；所有客户及下游资源必须位于 `/factories/{factoryId}` 下。工厂和资源 ID 都是 UUID，目标 `factoryId` 必须由用户明确指定。
- 请求和响应是 `application/json; charset=utf-8`，字段为 `camelCase`。对象请求严格校验，未知字段会返回 `422 VALIDATION_ERROR`；请求字段以实时 OpenAPI 为准。
- 单项成功响应为 `{ "data": ... }`；分页列表另含 `meta.limit`、`meta.nextCursor`、`meta.hasMore`、`meta.total`。错误响应为 `{ "error": { "code": ..., "message": ..., "details": ... } }`，其中 `details` 可省略。
- 时间响应为 ISO 8601。`nextActionAt` 接受有效的北京时间日期或日期时间；客户 `timezone` 必须是 IANA 时区。
- `POST`、`PUT`、`PATCH` 使用稳定的 `Idempotency-Key`。键长 1-128，只含字母、数字、`.`、`_`、`:`、`-`，并绑定同一作用域内完全相同的方法、路径和原始 JSON 正文；工厂内写入按工厂隔离，创建工厂使用全局作用域。
- 相同请求重试时复用原键；正文的字节表示变化也使用新键。响应头 `idempotency-replayed: true` 表示返回首次成功结果。遇到 `PENDING_OR_UNKNOWN` 或超时，先 GET 核验业务结果，不换键重复写入。
- 更新工厂、客户、开发关系或商机，以及归档客户、推进或恢复联系前，先 GET 并提交最新 `updatedAt` 为 `expectedUpdatedAt`。背调记录存在时使用其 `updatedAt`；`data: null` 时不得臆造版本值。公司网站更新把客户的 `organizationUpdatedAt` 作为请求的 `expectedUpdatedAt`。
- 查询参数必须 URL 编码。分页列表使用 `limit`（1-100，默认 50）和服务返回的 `meta.nextCursor`；仅当 `meta.hasMore` 为 `true` 时原样翻页。`q` 只用于客户和开发关系列表。

写请求把 JSON 放在受控的绝对路径文件中：

```text
curl --fail-with-body --silent --show-error --request PATCH --header "Accept: application/json" --header "Content-Type: application/json" --header "Idempotency-Key: <stable-operation-key>" --data-binary "@<absolute-json-file>" <AUTH_OPTION> "<BASE_URL>/api/v1/factories/<factoryId>/customers/<customerId>"
```

如果没有 `curl`，使用已有 HTTP 客户端发出等价请求；不要安装依赖或编写绕过正式合同的临时脚本。

## API Routing

下表路径均相对于 `/api/v1`。详细请求字段、确认令牌和 UI 回退入口见 [references/ui-and-http.md](references/ui-and-http.md)，只在任务涉及对应能力时读取。

| 用户意图 | 方法与端点 | 关键约束 |
| --- | --- | --- |
| 服务与合同 | `GET /`、`GET /health`、`GET /openapi.json` | 按需读取；不作为每次业务调用前置检查 |
| 工厂 | `GET/POST /factories`、`GET/PATCH /factories/{factoryId}` | 工厂列表分页；创建需 `name`、`shortName` |
| 客户 | `GET/POST /factories/{factoryId}/customers`、`GET/PATCH /factories/{factoryId}/customers/{customerId}` | 列表支持 `q`；用强标识核对身份 |
| 公司网站、归档、开始开发 | `PATCH /factories/{factoryId}/customers/{customerId}/organization-website`、`POST /factories/{factoryId}/customers/{customerId}/archive`、`POST /factories/{factoryId}/customers/{customerId}/leads` | 归档需确认且不得有活跃开发关系 |
| 开发关系 | `GET /factories/{factoryId}/leads`、`GET/PATCH /factories/{factoryId}/leads/{leadId}`、`POST /factories/{factoryId}/leads/{leadId}/advance`、`POST /factories/{factoryId}/leads/{leadId}/resume` | 列表支持 `q`；业务判断需对应确认 |
| 话术生成 | `POST /factories/{factoryId}/leads/{leadId}/message-generation` | `channel`、`isDevelopmentLetter` 必填；可选 `taskId`、`subject`；`channel = 其他` 时必须提供 `customChannel`；使用幂等键 |
| 背调与评分 | `GET/PATCH /factories/{factoryId}/leads/{leadId}/research`、`GET/PUT /factories/{factoryId}/leads/{leadId}/scores` | 已审核背调需证据；评分请求为 `score` 0-100 |
| 漏斗与跟进策略 | `GET /factories/{factoryId}/pipeline-stages`、`GET /factories/{factoryId}/followup-policies`、`PATCH /factories/{factoryId}/followup-policies/{policyId}`、`GET /factories/{factoryId}/followup-policies/application-preview`、`POST /factories/{factoryId}/followup-policies/apply` | 应用最新预览需 `expectedFingerprint` 和确认 |
| 互动 | `GET/POST /factories/{factoryId}/interactions`、`PATCH /factories/{factoryId}/interactions/{interactionId}` | 非内部互动需确认；方向不可通过编辑改变 |
| 待办 | `GET/POST /factories/{factoryId}/tasks`、`POST /factories/{factoryId}/tasks/{taskId}/complete` | 可选 `leadId` 必须属于当前工厂 |
| 商机 | `GET/POST /factories/{factoryId}/opportunities`、`GET/PATCH /factories/{factoryId}/opportunities/{opportunityId}` | 创建及赢单/输单分别需确认 |
| 产品 | `GET/POST /factories/{factoryId}/products` | 创建需真实 `name`；类别和说明可选 |
| 导入 | `POST /factories/{factoryId}/imports/prospects/preview`、`POST /factories/{factoryId}/imports/prospects/confirm`、`POST /factories/{factoryId}/imports/chats/preview`、`POST /factories/{factoryId}/imports/chats/confirm`、`GET /factories/{factoryId}/import-batches` | 确认必须复用原文、参数和预览指纹，并自动在线备份 |
| 分析与导出 | `GET /factories/{factoryId}/analytics/dashboard`、`GET /factories/{factoryId}/analytics/channels`、`GET /factories/{factoryId}/analytics/pipeline`、`GET /factories/{factoryId}/analytics/replies`、`GET /factories/{factoryId}/analytics/stopped`、`GET /factories/{factoryId}/export` | 只导出目标工厂；`replies`、`stopped` 分页 |

不存在全局客户或全局导出 API，也不存在 `/api/v1/message-templates`、`/api/v1/drafts` 及其变体。不得试探未记录的路由。

## Safe Workflows

### Locate the Factory and Record

1. 分页读取 `/api/v1/factories`，按用户明确给出的工厂名称或 UUID 确认唯一 `factoryId`；重名或目标不明确时停止询问。
2. 只在该工厂下查询客户或开发关系。客户优先按邮箱、WhatsApp、LinkedIn，或“姓名 + 公司”核对，不只凭姓名。
3. GET 目标明细，保存资源 ID、工厂归属和适用的版本值。跨工厂 ID、重复候选或状态不一致时先让用户核对。

### Update One Record

1. GET 当前记录，只选择用户要求改变的字段。
2. 加入适用的最新版本值；向用户复述目标、旧值和新值，涉及确认表中的业务判断时取得对该记录的明确确认。
3. 用新的稳定幂等键提交一次，再次 GET 同一资源核对字段、版本和工厂归属。

### Generate Message Copy

1. 确认目标工厂和唯一 `leadId`；需要联动完成待办时，先核对 `taskId` 属于同一工厂且关联该客户。生成前不需要健康校验或额外确认令牌。
2. 向 `POST /api/v1/factories/{factoryId}/leads/{leadId}/message-generation` 提交严格 JSON：

   ```json
   {
     "channel": "LinkedIn",
     "isDevelopmentLetter": false
   }
   ```

   需要联动完成待办时追加真实的 `taskId`；无待办联动时省略。`channel` 可为 `LinkedIn`、`WhatsApp`、`FB`、`INS`、`Email` 或 `其他`；选择 `其他` 时另传非空 `customChannel`。开发信把 `isDevelopmentLetter` 设为 `true` 并可传 `subject`，服务端会返回标题与正文且不设置普通话术的 300 字符上限；普通话术仍由服务端限制最多 300 个字符。有最近客户入站消息时生成回复，否则生成破冰或后续触达话术。服务端会结合工厂资料、客户背调、近期真实互动、下一步和待办上下文生成内容，客户端不直接访问 Agent 服务。
3. 使用绑定方法、路径和原始 JSON 的稳定 `Idempotency-Key`。成功响应会返回 `englishBody`、可选 `translatedBody`/`subject`、`interactionId` 和 `completedTaskId`；同一键重试只复用完全相同的请求。

### Preview and Confirm an Import

批量导入前读取 [references/data-workflows.md](references/data-workflows.md) 以及源项目的 `DATA_FORMATS.md`（若存在）。预览不授权写入；确认必须使用完全相同的源内容、参数和 `expectedFingerprint`，并在响应中核对实际 `backupPath`。随后读取 `import-batches` 及相关客户、开发关系或互动。

### Apply a Sensitive Decision

归档客户、回复分类、停止或恢复联系、背调审核、记录真实互动、应用跟进策略、创建商机、商机赢/输及确认导入，都需用户针对具体对象和当前预览明确确认。API 确认字符串只防误触，不能替代用户授权。

工作台 API 不发送邮件、LinkedIn 或 WhatsApp 消息。对外发送是另一个动作，必须单独获得授权并使用获批准的发送工具；不能把未发生的联系写成互动。

### Fall Back to the UI

仅当实时 OpenAPI 没有所需能力、当前页面存在正式可见入口时，读取 [references/ui-and-http.md](references/ui-and-http.md)，通过可见标签和控件操作并重新读取结果。不得抓取、硬编码或重放 Next.js Server Action ID。API 和 UI 都没有入口时报告能力缺口，不改用 SQLite、临时 SQL 或一次性脚本。

## Business Invariants

- `relationshipStatus`: `NEW` | `CONTACTED` | `CONNECTED` | `REPLIED` | `STOPPED`
- `replyClassification`: `NONE` | `PENDING` | `QUALIFIED` | `MISMATCH`
- `researchStatus`: `NOT_REVIEWED` | `IMPORTED` | `REVIEWED` | `UNAVAILABLE`
- 商机 `status`: `OPEN` | `WON` | `LOST`；待办 `priority`: `LOW` | `MEDIUM` | `HIGH` | `URGENT`
- 联系状态、回复分类和漏斗阶段是独立维度。入站互动可推进到已回复/待判断，但不代表 `QUALIFIED`。
- 推进到 `CONNECTED` 会在同一事务创建首次跟进待办；重复推进不得据此假定会重复建待办，提交后应同时核对关系和待办。
- 不虚构身份、联系方式、公开资料、互动、回复、需求、评分证据或商机金额；不向未经批准的第三方上传客户数据。
- 同一现实客户在不同工厂使用不同 customer ID。不得跨工厂复用 ID、全局搜索客户或同步变更。
- 不直接编辑 SQLite，不绕过正式 API、页面预览、备份、确认或审计。批量前确认没有其他用户或 Agent 处理同一批记录。

## Error Handling

| 状态或错误 | 处理 |
| --- | --- |
| 地址/认证错误、`401/403`、数据库不可用 | 停止并核对已批准配置，不尝试绕过 |
| `202` 或 `PENDING_OR_UNKNOWN` | 先 GET 查询业务结果；相同请求只复用原幂等键 |
| `400` | 检查 JSON、游标、幂等键或业务前提，不静默改业务数据 |
| `404` | 核对当前工厂、UUID 和路由；不得转为全局搜索或猜测旧端点 |
| `409 VERSION_CONFLICT` | 重新 GET 并让用户核对，不覆盖新版本 |
| `409 PREVIEW_CHANGED` | 重新预览并重新取得用户确认 |
| `409 CONFIRMATION_REQUIRED` | 取得对应具体业务确认，不自动补令牌 |
| `409 IDEMPOTENCY_KEY_REUSED` | 检查方法、路径和原始正文差异，不换键掩盖冲突 |
| `422 VALIDATION_ERROR` | 按 `details` 和实时 OpenAPI 修正字段，不猜测缺失值 |
| 话术生成返回 `503` 或 Agent 内容无效 | 报告生成失败；不记录互动或完成待办，核对配置后再决定是否用原幂等键重试 |
| 超时或 `5xx` | 先 GET 核验；只对字节完全相同的请求复用原键 |

在工作台源码仓库内执行任务时，先读仓库 `AGENTS.md`；数据任务另读 `README.md` 和 `DATA_FORMATS.md`，部署、备份、恢复或代码变更另读 `DEPLOYMENTS.md`。文档与实现冲突时停止写入，按运行时处理器、请求合同、OpenAPI 和测试的优先级查验。

完成后报告实际地址、目标工厂、执行范围、输入与成功/跳过/错误数量、导入产生的实际备份路径、重新读取的核验结果，以及未处理项和原因。没有导入时不要声称生成了备份。
