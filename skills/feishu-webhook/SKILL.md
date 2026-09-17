---
name: feishu-webhook
description: Send Markdown messages to Feishu or Lark custom bots through a webhook. Use when any Agent needs to deliver notifications, alerts, reports, or other rich-text content to a Feishu/Lark group through standard input.
---

# Feishu Webhook Skill

Author: lele

Use the bundled Python script to send a Markdown interactive card. The script uses only the Python standard library and does not depend on any Agent runtime.

## Configure

Create the local configuration from the bundled template, then edit `scripts/.env`. The script always resolves this file relative to itself:

```bash
cp <skill-directory>/scripts/.env.example <skill-directory>/scripts/.env
```

```dotenv
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/replace-me
FEISHU_WEBHOOK_SECRET=
```

Set `FEISHU_WEBHOOK_SECRET` only when signature verification is enabled for the bot. Keep `.env` private because it contains credentials.

## Send a message

Resolve this skill's directory in the current Agent environment, then pass Markdown through standard input:

```bash
python3 <skill-directory>/scripts/send-feishu.py <<'EOF'
### Deployment report

- Status: **successful**
- Environment: production
EOF
```

Treat a zero exit status as success. On failure, report the script's standard-error message and do not expose the webhook URL or secret.

## Operational limits

- Keep each request at or below 20 KB; the script rejects larger payloads before connecting.
- Respect Feishu's limit of 5 requests per second and 100 requests per minute for each bot in a tenant. Do not retry rate-limit failures without backoff.
