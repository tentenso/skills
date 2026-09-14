# LinkedIn 邀请预填脚本

脚本连接已运行的 FlashID 浏览器，在每个客户的新标签页中核对个人资料、打开“加为好友”并填入邀请备注。脚本没有发送逻辑，不会点击 LinkedIn 的“发送”按钮，也不会关闭 FlashID 浏览器。

## 安装

```powershell
npm install
```

## 准备输入

复制 `linkedin-customers.example.json`，按以下字段填写客户：

```json
{
  "customers": [
    {
      "name": "客户姓名",
      "linkedin": "https://www.linkedin.com/in/example",
      "message": "邀请备注"
    }
  ]
}
```

## 运行

先通过 FlashID `list_running_browsers` 获取当前 profile 的 `ws.puppeteer`，再执行：

```powershell
npm run linkedin:prefill -- `
  --ws-endpoint "ws://127.0.0.1:50081/devtools/browser/..." `
  --input .\linkedin-customers.json `
  --output .\linkedin-invite-results.json `
  --timeout-ms 60000
```

每个客户按顺序处理。单个客户超时后记录 `failed` 并继续下一个，不自动重试；成功的审核标签页会保持打开。结果同时写入 `--output` 文件并打印到终端。
