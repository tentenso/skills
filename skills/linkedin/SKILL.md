---
name: linkedin
description: "在已运行的 FlashID 浏览器中用 Playwright 核对 LinkedIn 普通个人资料或 Sales Navigator lead 页面并预填邀请备注；用户要求实际预填或审核邀请内容时使用，不发送邀请、不关闭浏览器，也不用于批量抓取或其他 LinkedIn 操作。"
---

# LinkedIn

## 用途与边界

这个 skill 用于在用户明确提供客户清单并要求预填邀请备注时，连接用户已经运行的 FlashID/Chromium 浏览器，逐个打开 LinkedIn 普通个人资料页或 Sales Navigator lead 客户信息页，核对姓名并填入备注。它只完成审核和预填，不点击 LinkedIn 的“发送”按钮，也不关闭 FlashID 浏览器。

不要把预填结果当成已发送的邀请；不要用本 skill 发送 InMail、消息或连接请求，不要抓取全库资料，也不要绕过 LinkedIn 登录、验证码或访问限制。发送或其他对外动作必须作为独立动作重新取得用户明确授权，并使用获批准的工具。

## 前置条件

1. 确认目标客户清单和本次预填范围。不要自行扩展客户、修改备注内容或补猜资料。
2. 确认 FlashID 浏览器已运行，并通过 FlashID 的 `list_running_browsers` 获取目标 profile 的真实 `ws.puppeteer`。不要猜测或拼接 WebSocket 地址。
3. 在本 skill 目录安装依赖：

   ```bash
   npm install
   ```

4. 输入文件必须是 JSON 对象，包含非空 `customers` 数组；每项必须提供非空字符串 `name`、`linkedin` 和 `message`。`linkedin` 支持普通个人资料链接以及形如 `/sales/lead/...` 的 Sales Navigator lead 链接；可参考 [linkedin-customers.example.json](linkedin-customers.example.json)。示例中的 `linkedin_examples` 只用于展示链接格式，实际任务只读取 `customers`。

## 执行

使用随 skill 提供的 npm 命令，明确传入已核实的 WebSocket 地址和输入路径：

```bash
npm run linkedin:prefill -- \
  --ws-endpoint "<ws.puppeteer>" \
  --input "<customers.json>" \
  --output "<linkedin-invite-results.json>" \
  --timeout-ms 60000
```

详细的 FlashID 准备、Windows 示例和结果说明见 [PLAYWRIGHT_LINKEDIN_PREFILL.md](PLAYWRIGHT_LINKEDIN_PREFILL.md)。

脚本按输入顺序串行处理客户。每个客户都会：

- 打开其 `linkedin` URL，并等待资料页姓名（兼容 `h1` 或 LinkedIn 个人资料卡）；
- 要求页面姓名与输入的 `name` 不区分大小写地完全相等，失败则不继续操作；
- 检查资料卡和“更多”菜单中的 Pending/已发送/Connected 等状态，已有状态时跳过并返回提示；
- 普通个人资料页优先打开资料卡的“Connect/加为好友”入口，必要时再从“更多”菜单进入；
- Sales Navigator lead 页面固定点击客户信息区的三点“更多”菜单，再点击其中的“Connect/加为好友”；
- 等待弹出的消息输入框并填入 `message`，不点击“Send/发送”；
- 填入后回读文本校验，校验失败按失败处理。

单个客户超时或出错时记录 `failed` 并继续下一个，不自动重试。成功的审核标签页保持打开；只有超时清理新建标签页。脚本最后只断开 Playwright 与浏览器的连接，不退出或关闭 FlashID。

## 结果核对

脚本同时写入 `--output` 指定的 JSON 文件并打印结果。检查每项的：

- `status`: `prefilled`、`skipped` 或 `failed`；
- `linkedin_note_filled`: 是否确实填入并回读了备注；
- `external_sent`: 应始终为 `no`；若出现其他值，停止并报告；
- `failure_reason`: 跳过或失败的具体原因。

向用户报告成功、跳过和失败数量，并指出需要人工审核的标签页或资料不匹配项。除非用户另行授权，不要点击发送、关闭审核页或把预填结果写成已联系记录。

实现细节和行为以 [linkedin-invite-prefill.mjs](linkedin-invite-prefill.mjs) 为准；不要在 skill 指令中复制或臆测 LinkedIn 的未验证 DOM 接口。
