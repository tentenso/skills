#!/usr/bin/env python3
"""Send a Markdown interactive card to a Feishu/Lark custom bot."""

import base64
import hashlib
import hmac
import http.client
import json
import re
import shlex
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

ENV_PATH = Path(__file__).resolve().with_name(".env")
ENV_KEY_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
REQUEST_TIMEOUT_SECONDS = 15
MAX_REQUEST_BYTES = 20 * 1024
MAX_RESPONSE_BYTES = 1024 * 1024


class ConfigurationError(ValueError):
    """Raised when the local .env configuration is invalid."""


class WebhookError(RuntimeError):
    """Raised when the webhook request or response is invalid."""


def _parse_env_value(raw_value, line_number, env_name):
    try:
        parts = shlex.split(raw_value, comments=True, posix=True)
    except ValueError as exc:
        raise ConfigurationError(
            f"Invalid value in {env_name} at line {line_number}: {exc}"
        ) from exc

    if not parts:
        return ""
    if len(parts) != 1:
        raise ConfigurationError(
            f"Invalid value in {env_name} at line {line_number}; quote values containing spaces"
        )
    return parts[0]


def validate_webhook_url(webhook_url):
    """Validate a webhook URL and return its parsed representation."""
    parsed_url = urlparse(webhook_url)
    try:
        port = parsed_url.port
    except ValueError as exc:
        raise ConfigurationError("FEISHU_WEBHOOK_URL has an invalid port") from exc

    if (
        parsed_url.scheme != "https"
        or not parsed_url.hostname
        or parsed_url.username
        or parsed_url.password
        or parsed_url.fragment
        or (port is not None and not 1 <= port <= 65535)
    ):
        raise ConfigurationError("FEISHU_WEBHOOK_URL must be a valid HTTPS URL")
    return parsed_url


def load_config(env_path=ENV_PATH):
    """Load webhook credentials from the .env file beside this script."""
    if not env_path.is_file():
        raise ConfigurationError(f"Configuration file not found: {env_path}")

    values = {}
    try:
        lines = env_path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise ConfigurationError(f"Cannot read configuration file: {env_path}") from exc

    for line_number, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            raise ConfigurationError(
                f"Invalid configuration in {env_path.name} at line {line_number}; expected KEY=VALUE"
            )

        key, raw_value = line.split("=", 1)
        key = key.strip()
        if not ENV_KEY_PATTERN.fullmatch(key):
            raise ConfigurationError(
                f"Invalid key in {env_path.name} at line {line_number}: {key!r}"
            )
        values[key] = _parse_env_value(raw_value.strip(), line_number, env_path.name)

    webhook_url = values.get("FEISHU_WEBHOOK_URL", "").strip()
    secret = values.get("FEISHU_WEBHOOK_SECRET", "").strip()
    if not webhook_url:
        raise ConfigurationError(f"FEISHU_WEBHOOK_URL is empty in {env_path}")

    validate_webhook_url(webhook_url)

    return webhook_url, secret


def create_signature(secret, timestamp):
    """Create the signature required by a signed Feishu webhook."""
    string_to_sign = f"{timestamp}\n{secret}".encode("utf-8")
    digest = hmac.new(string_to_sign, digestmod=hashlib.sha256).digest()
    return base64.b64encode(digest).decode("ascii")


def build_payload(content, secret="", timestamp=None):
    payload = {
        "msg_type": "interactive",
        "card": {
            "schema": "2.0",
            "config": {"update_multi": True},
            "body": {
                "elements": [{"tag": "markdown", "content": content}],
            },
        },
    }
    if secret:
        timestamp = int(time.time()) if timestamp is None else timestamp
        payload["timestamp"] = str(timestamp)
        payload["sign"] = create_signature(secret, timestamp)
    return payload


def send_message(webhook_url, secret, content):
    """Send content and return the decoded Feishu response object."""
    parsed_url = validate_webhook_url(webhook_url)
    request_target = parsed_url.path or "/"
    if parsed_url.query:
        request_target += f"?{parsed_url.query}"

    body = json.dumps(
        build_payload(content, secret), ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")
    if len(body) > MAX_REQUEST_BYTES:
        raise WebhookError(
            f"Request body is {len(body)} bytes; Feishu allows at most {MAX_REQUEST_BYTES} bytes"
        )

    connection = http.client.HTTPSConnection(
        parsed_url.hostname,
        parsed_url.port,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    try:
        connection.request(
            "POST",
            request_target,
            body=body,
            headers={"Content-Type": "application/json; charset=utf-8"},
        )
        response = connection.getresponse()
        response_body = response.read(MAX_RESPONSE_BYTES + 1)
    except (OSError, http.client.HTTPException) as exc:
        raise WebhookError(f"Webhook request failed: {exc}") from exc
    finally:
        connection.close()

    if not 200 <= response.status < 300:
        raise WebhookError(f"Webhook returned HTTP {response.status}")
    if len(response_body) > MAX_RESPONSE_BYTES:
        raise WebhookError("Webhook response is too large")

    try:
        result = json.loads(response_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise WebhookError("Webhook returned an invalid JSON response") from exc
    if not isinstance(result, dict):
        raise WebhookError("Webhook returned an unexpected JSON response")
    return result


def main():
    if sys.stdin.isatty():
        print(
            "Usage: python3 send-feishu.py <<'EOF'\n### Title\nMessage\nEOF",
            file=sys.stderr,
        )
        return 2

    content = sys.stdin.read().strip()
    if not content:
        print("Message content is empty", file=sys.stderr)
        return 2

    try:
        webhook_url, secret = load_config()
        result = send_message(webhook_url, secret, content)
    except (ConfigurationError, WebhookError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if result.get("code") != 0:
        message = result.get("msg") or "unknown Feishu error"
        print(f"Error: {message}", file=sys.stderr)
        return 1

    print("Message sent successfully")
    return 0


if __name__ == "__main__":
    sys.exit(main())
