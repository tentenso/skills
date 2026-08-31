# 工作台功能与接口参考

使用 `scripts/workbench-config.sh resolve` 得到 `BASE_URL`。页面中的 `factoryId` 必须来自当前工厂页面 URL 或系统结果，不得猜测。

## API 共同约定

- 合同：`GET /api/v1/openapi.json`；健康检查：`GET /api/v1/health`。
- 成功响应为 `{ "data": ..., "meta": ... }`；失败为 `{ "error": { "code", "message", "details" } }`。
- 列表支持 `limit`（1-100）、`cursor` 和部分资源的 `q`；使用响应 `meta.nextCursor` 翻页，不自造游标。
- POST、PUT、PATCH 通过 `Idempotency-Key` 防止重试重复写入。相同键只能用于完全相同的方法、路径和正文。
- 更新工厂、客户、开发关系、商机或草稿前先 GET，并把返回的 `updatedAt` 作为 `expectedUpdatedAt`。`409 VERSION_CONFLICT` 时停止覆盖并重新核对。
- `GET /api/export` 仍是全部工厂的 schema 3 工作台 JSON；日常查询优先使用工厂级 API，避免读取无关敏感数据。
- 页面 Server Action 不是 API，不得抓取、硬编码或重放 Action ID。

调用脚本：

```bash
scripts/workbench-api.sh GET /api/v1/factories
WORKBENCH_IDEMPOTENCY_KEY="stable-operation-key" \
  scripts/workbench-api.sh POST /api/v1/factories/{factoryId}/customers /absolute/path/request.json
```

Nginx 等外层认证需要请求头时，临时设置 `WORKBENCH_AUTH_HEADER`；不得把凭据写入 URL 或文件。

## API 资源

| 资源 | 列表/读取 | 写入与动作 |
| --- | --- | --- |
| 工厂 | `GET /factories`、`GET /factories/{factoryId}` | `POST /factories`、`PATCH /factories/{factoryId}` |
| 客户 | `GET /factories/{factoryId}/customers[/{customerId}]` | `POST/PATCH customers`、`PATCH customers/{id}/organization-website`、`POST customers/{id}/archive`、`POST customers/{id}/leads` |
| 开发关系、背调与评分 | `GET .../leads[/{leadId}]`、`GET .../leads/{id}/{research|scores}` | `PATCH .../leads/{id}`、`POST .../leads/{id}/{advance|resume}`、`PATCH .../leads/{id}/research`、`PUT .../leads/{id}/scores` |
| 漏斗与跟进策略 | `GET .../pipeline-stages`、`GET .../followup-policies`、`GET .../followup-policies/application-preview` | `PATCH .../followup-policies/{id}`、`POST .../followup-policies/apply` |
| 互动与待办 | `GET .../interactions`、`GET .../tasks` | `POST/PATCH interactions`、`POST tasks`、`POST tasks/{id}/complete` |
| 商机 | `GET .../opportunities[/{id}]` | `POST .../opportunities`、`PATCH .../opportunities/{id}` |
| 产品与话术 | `GET/POST .../products`、`GET/POST .../message-templates` | `GET/POST/PATCH .../drafts`、`POST .../drafts/{id}/sent` |
| 导入 | `GET .../import-batches` | `POST .../imports/{prospects|chats}/{preview|confirm}` |
| 分析与导出 | `GET .../analytics/{dashboard|channels|pipeline|replies|stopped}` | `GET .../export` 仅导出目标工厂 |

上表路径都以 `/api/v1` 开头。客户没有全局路由；发现缺少 `factoryId` 的客户路径应视为错误，不尝试调用。

## 明确确认字段

| 业务动作 | API 确认值 | 前提 |
| --- | --- | --- |
| 判定有效回复/暂不匹配 | `confirmations: ["CONFIRM_REPLY_CLASSIFICATION"]` | 用户已确认具体 lead 和判断 |
| 停止联系 | `confirmations: ["CONFIRM_STOP_CONTACT"]` | 用户已确认具体 lead 和原因 |
| 恢复联系 | `confirmation: "RESUME_CONTACT"` | 用户已确认具体已停止 lead |
| 将背调标记为已审核 | `confirmation: "CONFIRM_RESEARCH_REVIEWED"` | 已实际查看公开资料并填写证据 |
| 归档客户 | `confirmation: "ARCHIVE_CUSTOMER"` | 用户已确认具体客户，且不存在活跃开发关系 |
| 记录真实互动 | `confirmation: "RECORD_ACTUAL_INTERACTION"` | 非内部备注的收发内容确实已经发生 |
| 创建商机 | `confirmation: "CREATE_OPPORTUNITY"` | 用户确认存在真实需求 |
| 商机赢单/输单 | `confirmation: "CONFIRM_OPPORTUNITY_OUTCOME"` | 用户确认具体结果 |
| 记录实际发送 | `confirmation: "RECORD_ACTUAL_SEND"` | 消息已在外部渠道真实发送 |
| 应用跟进策略 | `confirmation: "APPLY_FOLLOWUP_POLICIES"` | 用户确认同一工厂最新预览及指纹 |

确认值只满足 API 防误触合同，不代表用户已经授权。Agent 必须先取得对应业务确认。

## 页面功能路由

| 页面 | 路径 | 可执行功能 | 提交后核对 |
| --- | --- | --- | --- |
| 总览 | `/factories/{factoryId}` | 查看客户、触达、建联、回复、商机和待办统计 | 与目标工厂名称和明细页一致 |
| 客户库 | `/factories/{factoryId}/contacts` | 搜索、新增、编辑、归档当前工厂客户；开始开发；处理待分配旧客户 | 客户聚合和开发关系均只属于当前工厂 |
| 今日优先 | `/factories/{factoryId}/priority` | 查看优先客户；确认已触达或已建联 | 状态只改变目标工厂开发关系 |
| 待办中心 | `/factories/{factoryId}/tasks` | 新建、筛选、完成待办 | 状态、到期时间和关联客户正确 |
| 回复中心 | `/factories/{factoryId}/replies` | 查看真实回复和回复分类 | 业务判断仍在开发关系页确认 |
| 商机中心 | `/factories/{factoryId}/opportunities` | 创建和更新商机 | 客户、金额、币种、状态和预计日期准确 |
| 互动记录 | `/factories/{factoryId}/interactions` | 记录/编辑互动；预览并导入聊天 | 方向、渠道、时间、正文和状态变化正确 |
| 渠道分析 | `/factories/{factoryId}/analytics` | 查看渠道回复率与销售漏斗 | 仅基于真实互动和状态 |
| 领英客户池 | `/factories/{factoryId}/prospects` | CSV 导入、背调更新、公司网站和联系状态推进 | 导入批次、画像、评分和当前工厂归属正确 |
| 停止联系 | `/factories/{factoryId}/stopped` | 查看停止客户并恢复 | 恢复后为已触达，清除停止原因；原回复分类保持不变 |
| 文案中心 | `/factories/{factoryId}/messages` | 创建模板、生成/审核草稿、记录实际发送 | 记录发送会创建出站互动；必须是实际已发送内容 |
| 开发关系 | `/factories/{factoryId}/leads` | 修改联系状态、回复判断、漏斗、下一步和五维评分 | 分类、评分依据和阶段互不替代 |
| 数据管理 | `/factories/{factoryId}/data` | 导出、规范 JSON 合并、受控旧版迁移 | 导入统计、外键和工厂范围正确 |
| 工厂设置 | `/factories/{factoryId}/settings` | 工厂资料、产品和跟进策略 | 配置只属于当前工厂 |

## 页面写操作字段和副作用

下列名称用于理解页面行为和检查实现，不是远程 HTTP 调用合同。

| 操作 | 主要输入 | 关键副作用和确认点 |
| --- | --- | --- |
| 创建工厂 | 名称、简称、行业、发信人、品牌色 | 同事务创建默认漏斗、五维评分和跟进策略 |
| 更新工厂 | 法定名称、网站、国家、时区、语言、发信人、公司简介、能力、证据、品牌色 | 影响后续话术上下文，不改历史实发内容 |
| 创建联系人 | 姓名、地区、语言、公开简介、备注、公司、职位、邮箱、电话、WhatsApp、LinkedIn | 在目标工厂创建独立客户聚合，不自动创建开发关系 |
| 编辑联系人 | 姓名、地区、语言、公司、职位和联系方式 | 只修改目标工厂副本 |
| 开始开发 | `customerId` | 为当前工厂客户建立唯一开发关系 |
| 更新开发关系 | 联系状态、回复判断、漏斗阶段、来源、下一步、日期、停止原因 | 状态、回复和漏斗是三个独立维度 |
| 推进联系状态 | 已触达或已建联 | 只允许合法状态推进，不代表客户回复 |
| 保存评分 | 当前五个维度的分数和依据 | 每项不得超过该维度上限；属于当前工厂 |
| 创建互动 | 客户关系、方向、渠道、类型、标题、正文、译文、发生时间 | 非内部备注需要确认；入站会设为已回复/待判断，出站会将未触达推进为已触达 |
| 编辑互动 | 渠道、类型、标题、正文、译文、发生时间 | 不能通过编辑改变原方向 |
| 创建待办 | 可选客户、标题、说明、到期时间、优先级 | 属于当前工厂；完成后写完成时间 |
| 创建商机 | 客户、标题、金额、币种、预计日期、备注 | 仅在真实需求确认后创建 |
| 更新商机 | 标题、进行中/赢单/输单、金额、币种、预计日期、备注 | 赢单/输单需要用户明确业务判断 |
| 创建产品 | 名称、类别、说明 | 影响当前工厂的话术上下文 |
| 创建模板 | 名称、渠道、类型、语言、标题模板、正文模板 | 同名模板以版本管理 |
| 生成草稿 | 客户、类型、语言 | 只使用工厂配置、客户资料和真实互动 |
| 审核草稿 | 标题、正文、译文、草稿/已审核 | 仍未发送，不创建互动 |
| 记录已发送 | 草稿、渠道 | 草稿变为已发送并创建真实出站互动；必须单独确认 |
| 更新背调 | 画像 URL、About、近期动态、证据、研究状态 | API 使用 lead 下的 `research` 资源；“已审核”必须有实际读取证据 |
| 恢复停止联系 | 客户开发关系 | 恢复为已触达，清除停止信息，下一步设为重新评估；不改回复分类 |
| 更新/应用跟进策略 | 名称、最低评分、间隔、启用状态 | 为尚无计划日期的开发关系批量填写下一步和日期，不创建待办 |
| 归档联系人 | 联系人 | 仅影响当前工厂；该客户存在活跃开发关系时拒绝 |

## 当前支持的批量入口

| 批量任务 | 页面入口 | 是否支持预览 | 结果核对 |
| --- | --- | --- | --- |
| 新增/复用潜客并加入工厂 | 领英客户池 CSV | 是 | 导入批次、联系人、开发关系、错误/跳过 |
| 导入单个客户完整聊天 | 互动记录 | 是 | 入站/出站、重复、状态变化 |
| 合并系统规范 JSON | 数据管理 | 是 | 工厂数、总行数、插入/跳过和外键 |
| 应用跟进策略 | API `application-preview` 后调用 `apply`；页面可补充 | 是，API 返回名单和指纹 | 新增计划日期的开发关系数量及审计记录 |
| 旧版快照迁移 | 数据管理 | 是 | 仅空隔离库和恢复流程使用，不是日常批量入口 |

其他批量修改没有专用端点时，先列出明确记录 ID、旧值和新值，取得确认后用带幂等键和版本值的单条 API 分批执行。没有正式 API 或页面入口就停止，不自行拼接数据库操作。

## Agent 操作约定

1. 先从页面可见工厂名称确认环境，再读取 URL 中的 `factoryId`。
2. 查找联系人时优先使用邮箱、WhatsApp、LinkedIn 或“姓名 + 公司”，不只用姓名。
3. API 写入前保存原始 GET 响应中的 ID 和 `updatedAt`；公司网站端点使用客户响应的 `organizationUpdatedAt`。页面回退时用可见标签定位控件，不依赖按钮顺序。
4. 提交前保存预览统计。提交后重新 GET 明细或批次，比较记录数和关键字段。
5. API 超时使用同一幂等键重试；页面超时先查询实际状态，不盲目再次点击。
