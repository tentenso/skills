#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  echo "usage: workbench-api.sh GET <api-path> | workbench-api.sh <POST|PUT|PATCH> <api-path> [json-file]" >&2
}

method="${1:-}"
api_path="${2:-}"
json_file="${3:-}"

case "${method}" in
  GET|POST|PUT|PATCH) ;;
  *) usage; exit 2 ;;
esac

case "${api_path}" in
  /api/v1|/api/v1/*) ;;
  *) echo "API 路径必须以 /api/v1 开头" >&2; exit 2 ;;
esac

if [[ "${api_path}" == *".."* || "${api_path}" =~ [[:space:]] ]]; then
  echo "API 路径不能包含 .. 或空白字符" >&2
  exit 2
fi

if [[ -n "${json_file}" && ! -f "${json_file}" ]]; then
  echo "JSON 请求文件不存在: ${json_file}" >&2
  exit 2
fi

if [[ "${method}" != "GET" && -z "${WORKBENCH_IDEMPOTENCY_KEY:-}" ]]; then
  echo "POST、PUT、PATCH 必须通过 WORKBENCH_IDEMPOTENCY_KEY 提供稳定幂等键" >&2
  exit 2
fi

base_url="$(${script_dir}/workbench-config.sh resolve)"
curl_args=(
  --fail-with-body
  --silent
  --show-error
  --location
  --connect-timeout 5
  --max-time 60
  --request "${method}"
  --header "accept: application/json"
)

if [[ -n "${WORKBENCH_AUTH_HEADER:-}" ]]; then
  curl_args+=(--header "${WORKBENCH_AUTH_HEADER}")
fi

if [[ "${method}" != "GET" ]]; then
  curl_args+=(
    --header "content-type: application/json"
    --header "Idempotency-Key: ${WORKBENCH_IDEMPOTENCY_KEY}"
  )
  if [[ -n "${json_file}" ]]; then
    curl_args+=(--data-binary "@${json_file}")
  else
    curl_args+=(--data-binary "{}")
  fi
fi

curl "${curl_args[@]}" "${base_url}${api_path}"
printf '\n'
