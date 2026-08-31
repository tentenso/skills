# 数据导入与批量操作流程

执行本文件前，先完成 `SKILL.md` 的 Setup 和 Credential Check、确认目标工厂，并阅读源数据所属项目的 `DATA_FORMATS.md`（若存在）。

## 潜客 CSV

1. 映射标准字段：`displayName`、`organizationName`、`title`、`country`、`city`、`preferredLanguage`、`email`、`phone`、`whatsapp`、`linkedin`、`source`、`about`、`recentActivity`。
2. `displayName` 必填；验证邮箱和 HTTP/HTTPS LinkedIn URL。未映射字段单列，不塞入含义不同的字段。
3. 按邮箱、WhatsApp、LinkedIn，以及“姓名 + 公司”检查现有联系人。仅同名或相似名不能自动合并。
4. 将 CSV 正文放入受控 JSON 请求文件，调用 `POST /api/v1/factories/{factoryId}/imports/prospects/preview`，报告 `fingerprint`、原始、有效、错误、疑似重复和未映射数量。预览不会写业务数据。
5. 用户确认目标工厂、指纹、有效数量、错误跳过和重复处理后，在同一正文中加入 `expectedFingerprint` 与 `confirmation: "IMPORT_PROSPECTS"`。
6. 使用稳定 `Idempotency-Key` 调用对应 `confirm` 端点。端点会先生成在线备份；备份失败即停止。核对返回的备份路径、导入批次，并重新 GET 当前工厂客户和开发关系。

同一现实联系人在其他工厂的记录不参与本厂去重，也不得被本次导入修改。

## 完整聊天

1. 确认目标工厂、唯一开发关系和我方姓名/所有别名。聊天入口不能创建客户。
2. 使用绝对日期时间，预览消息边界、方向、多行正文、第一条、最后一条和全部方向切换。
3. 调用 `POST /api/v1/factories/{factoryId}/imports/chats/preview`，报告指纹、识别、入站、出站和重复数量。方向错误先修正别名并重新预览。
4. 用户确认后带回完全相同的 `leadId`、聊天正文、别名、`expectedFingerprint` 和 `confirmation: "IMPORT_CHAT"`，用稳定幂等键调用 `confirm`。
5. 核对自动备份路径、实际导入/跳过和该 lead 的互动。入站只自动推进到已回复/待判断，不代表有效回复或商机。

## 规范化工作台 JSON

1. 只接受工作台自身 `GET /api/export` 生成且未手工编辑的文件。
2. 校验 `format = factory-sales-workbench`、`schemaVersion = 3`、全部表数组、工厂数和总行数。未经编辑的 schema 2 可由系统在内存中迁移；其他版本停止。
3. 说明这是 `INSERT OR IGNORE` 安全合并，不覆盖已有主键，也不解决含义冲突。
4. 备份并获得用户对来源、工厂数、总行数和合并语义的确认后，在数据管理页面执行。
5. 核对插入、跳过、外键和每家工厂核心数据数量。

覆盖、回滚或整库替换不是 JSON 合并。必须切换到 `DEPLOYMENTS.md` 的数据库恢复流程，并取得具体源备份和目标数据库路径的当次确认。

## 旧版快照迁移

旧版迁移入口只用于经过验证的旧静态工作台快照，并要求仅含目标工厂的空隔离数据库。必须先完成服务端预览、文件指纹、全量计数和内容比对，再生成隔离库在线备份。生产替换必须走数据库恢复流程，不在正在使用的工厂内直接导入。

## 结果驱动的批量操作

Agent 根据查询结果继续批量处理时：

1. 固定本批目标工厂、筛选条件和记录 ID 集合。
2. 输出旧值、新值、预计记录数和不可自动判断的记录。
3. 对回复分类、停止联系、商机输赢、记录已发送分别请求确认。
4. 优先使用已有批量入口；应用跟进策略时先 GET `followup-policies/application-preview`，核对名单并把原指纹带入 `followup-policies/apply`。没有批量入口时分成可核对的小批次逐条调用正式 API，并为每个逻辑动作固定幂等键。
5. 每批提交后重新 GET，分类报告成功、未变化、跳过和错误。超时使用原幂等键重试；收到版本冲突时停止剩余批次。
6. 查询结果变化、记录被他人修改或工厂不一致时停止剩余批次并重新预览。

不得用数据库脚本替代正式批量接口，也不得把“最终结果正确”当作绕过备份、预览和审计的理由。
