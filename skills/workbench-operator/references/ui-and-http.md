# 工作台 API 与 UI 回退参考

本参考以 `/api/v1` 当前合同为基线（数据库 schema `10`、工厂级导出格式 `2`）。需要核对新操作或字段时读取实时 `/api/v1/openapi.json`；若文档与运行时不一致，停止写入并查验工作台源码和测试。

## 请求与资源合同

路径均相对于 `/api/v1`。表中的 `...` 只省略重复的 `/factories/{factoryId}` 前缀，不是路径字符。所有 ID 为 UUID；除服务入口和工厂集合外，业务资源必须带用户明确指定的 `factoryId`。

| 资源 | 读取 | 写入或动作 | 关键请求字段 |
| --- | --- | --- | --- |
| 服务 | `GET /`、`GET /health`、`GET /openapi.json` | 无 | 按需读取；不作为每次业务调用前置检查 |
| 工厂 | `GET /factories`、`GET /factories/{factoryId}` | `POST /factories`、`PATCH /factories/{factoryId}` | 创建：`name`、`shortName`；可选 `industry`、`senderName`、`primaryColor`；更新支持 `expectedUpdatedAt` |
| 客户 | `GET /factories/{factoryId}/customers[/{customerId}]` | `POST /factories/{factoryId}/customers`、`PATCH .../customers/{customerId}` | 创建至少 `displayName`；只提交可靠的身份、组织、职位、地区、IANA 时区和联系方式字段；更新支持 `expectedUpdatedAt` |
| 客户公司网站 | 客户明细返回 `organizationUpdatedAt` | `PATCH .../customers/{customerId}/organization-website` | `website` 为 URL 或 `null`；请求键 `expectedUpdatedAt` 使用最新 `organizationUpdatedAt` |
| 归档/开始开发 | 先读取客户 | `POST .../customers/{customerId}/archive`、`POST .../customers/{customerId}/leads` | 归档带 `expectedUpdatedAt` 和 `ARCHIVE_CUSTOMER`；客户不得有活跃开发关系 |
| 开发关系 | `GET /factories/{factoryId}/leads[/{leadId}]` | `PATCH .../leads/{leadId}`、`POST .../leads/{leadId}/advance`、`POST .../leads/{leadId}/resume` | 更新/推进/恢复带 `expectedUpdatedAt`；推进目标仅 `CONTACTED` 或 `CONNECTED` |
| 话术生成 | 无需健康前置检查 | `POST .../leads/{leadId}/message-generation` | `channel`、`isDevelopmentLetter` 必填；可选 `taskId`、`subject`；`channel = 其他` 时需 `customChannel`；使用幂等键并记录 `INTERNAL` 互动 |
| 评分 | `GET .../leads/{leadId}/scores` | `PUT .../leads/{leadId}/scores` | 严格请求 `{ "score": 0..100 }`；响应含 `leadId`、`score`、`maxScore: 100` |
| 背调 | `GET .../leads/{leadId}/research` | `PATCH .../leads/{leadId}/research` | 不存在时 `data: null`；更新支持 `expectedUpdatedAt`；新标记 `REVIEWED` 需实际 `evidence` 和确认 |
| 漏斗 | `GET .../pipeline-stages` | 无 | 返回当前工厂默认阶段 |
| 互动 | `GET .../interactions` | `POST .../interactions`、`PATCH .../interactions/{interactionId}` | 创建需 `leadId`、`direction`、`channel`、`interactionType`、`body`、`occurredAt`；PATCH 仍需后四项且不接受 `direction` |
| 待办 | `GET .../tasks` | `POST .../tasks`、`POST .../tasks/{taskId}/complete` | 创建需 `title`、`priority`；`leadId`、`description`、`dueAt` 可选 |
| 跟进策略 | `GET .../followup-policies`、`GET .../followup-policies/application-preview` | `PATCH .../followup-policies/{policyId}`、`POST .../followup-policies/apply` | 更新至少提供 `name`、`minimumScore`、`intervalDays`、`isActive` 之一；应用需最新 `expectedFingerprint` 和确认 |
| 商机 | `GET .../opportunities[/{opportunityId}]` | `POST .../opportunities`、`PATCH .../opportunities/{opportunityId}` | 创建需 `leadId`、`title` 和确认；更新支持 `expectedUpdatedAt`；赢/输需确认 |
| 产品 | `GET .../products` | `POST .../products` | `name` 必填，`category`、`description` 可选 |
| 导入 | `GET .../import-batches` | `POST .../imports/prospects/{preview|confirm}`、`POST .../imports/chats/{preview|confirm}` | 见 [data-workflows.md](data-workflows.md) |
| 分析 | `GET .../analytics/dashboard`、`channels`、`pipeline`、`replies`、`stopped` | 无 | `replies`、`stopped` 分页 |
| 工厂导出 | `GET .../export` | 无 | `format = factory-sales-workbench-api-export`、`schemaVersion = 2`；仅含目标工厂的工厂、客户、开发关系、互动、待办、商机和导入批次聚合 |

工厂、客户、开发关系、互动、待办、商机、产品、导入批次以及 `analytics/replies`、`analytics/stopped` 的列表分页；`q` 只适用于客户和开发关系。请求对象严格校验，不能把页面字段或旧版字段直接提交给 API。

## 明确确认字段

| 业务动作 | API 字段和值 | 用户确认前提 |
| --- | --- | --- |
| 归档客户 | `confirmation: "ARCHIVE_CUSTOMER"` | 已确认具体客户及归档意图 |
| 有效回复/不匹配 | `confirmations: ["CONFIRM_REPLY_CLASSIFICATION"]` | 已确认具体 lead 和分类 |
| 停止联系 | `confirmations: ["CONFIRM_STOP_CONTACT"]` | 已确认具体 lead 和原因 |
| 恢复联系 | `confirmation: "RESUME_CONTACT"` | 已确认具体已停止 lead |
| 背调标为已审核 | `confirmation: "CONFIRM_RESEARCH_REVIEWED"` | 已实际核验公开资料并保留证据 |
| 记录互动 | `confirmation: "RECORD_ACTUAL_INTERACTION"` |  |
| 应用跟进策略 | `confirmation: "APPLY_FOLLOWUP_POLICIES"` | 已确认同一工厂最新名单和指纹 |
| 创建商机 | `confirmation: "CREATE_OPPORTUNITY"` | 已确认存在真实需求 |
| 商机赢单/输单 | `confirmation: "CONFIRM_OPPORTUNITY_OUTCOME"` | 已确认具体结果 |
| 导入潜客 CSV | `confirmation: "IMPORT_PROSPECTS"` | 已确认目标工厂、原 CSV、统计和指纹 |
| 导入聊天 | `confirmation: "IMPORT_CHAT"` | 已确认 lead、原文、别名、方向统计和指纹 |

确认值只是 API 防误触合同。没有用户对当前对象和当前数据的确认时，不得自行填入。

## 不支持的 API

- 不存在 `/api/v1/customers`、`/api/v1/export` 或任何缺少 `factoryId` 的客户/导出路由。
- 不存在 `/api/v1/factories/{factoryId}/message-templates`、`.../drafts`、`.../drafts/{draftId}` 或 `.../drafts/{draftId}/sent`。
- 不存在全库 JSON 导出、导入、合并、迁移或恢复 API；旧 `/api/export` 也不是可用的业务入口。
- 不存在删除 API。不得试探旧路由、重放 Server Action ID、直接写 SQLite，或用脚本绕过页面/API 合同。

## UI 回退入口

只在实时 OpenAPI 缺少所需能力且页面有正式可见控件时回退。以下是当前页面路由，不代表额外 HTTP API：

| 页面 | 路径 | 可核对范围 |
| --- | --- | --- |
| 工厂总览 | `/factories/{factoryId}` | 当前工厂的客户、触达、回复、商机和待办汇总 |
| 客户库 | `/factories/{factoryId}/contacts` | 客户搜索、资料、归档和开始开发 |
| 待办中心 | `/factories/{factoryId}/tasks` | 待办筛选、创建、完成及关联客户 |
| 回复中心 | `/factories/{factoryId}/replies` | 真实回复及待确认分类 |
| 商机中心 | `/factories/{factoryId}/opportunities` | 商机客户、金额、币种、状态和预计日期 |
| 互动记录 | `/factories/{factoryId}/interactions` | 互动方向、渠道、时间、正文及聊天导入 |
| 渠道分析 | `/factories/{factoryId}/analytics` | 渠道和漏斗指标 |
| 领英客户池 | `/factories/{factoryId}/prospects` | CSV 导入、背调、公司网站及状态推进 |
| 停止联系 | `/factories/{factoryId}/stopped` | 停止客户及恢复结果 |
| 开发关系 | `/factories/{factoryId}/leads` | 联系状态、回复分类、漏斗、下一步和总评分 |
| 数据管理 | `/factories/{factoryId}/data` | 仅查看管理员 migration、备份和恢复边界；没有上传、合并、恢复或迁移按钮 |
| 工厂设置 | `/factories/{factoryId}/settings` | 工厂资料、产品和跟进策略 |

页面没有独立的“今日优先”或“文案中心”路由。页面出现消息撰写控件也不代表 API 会发送消息或存在草稿资源；任何外发动作仍需另行授权。

## UI 操作约定

1. 从页面可见工厂名称核对环境，再读取 URL 的 `factoryId`；不以最近访问页面推断目标工厂。
2. 用可见标签定位控件，不依赖按钮顺序、内部组件名或 Server Action 标识。
3. 提交前记录目标、旧值、新值和预览统计；涉及确认表中的动作时先取得用户确认。
4. 提交后重新读取 API 明细、导入批次或页面结果，核对工厂归属、数量和关键字段。
5. 页面超时先查询实际状态，不盲目再次点击。API 写入则遵守 `SKILL.md` 的版本值和幂等规则。
