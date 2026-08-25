#!/usr/bin/env bash

set -euo pipefail

COMMON_BASE_URL=""
declare -a COMMON_ARGS=()

usage() {
  cat >&2 <<'EOF'
Usage:
  weknora-api.sh request METHOD ENDPOINT [JSON_BODY]
  weknora-api.sh request-file METHOD ENDPOINT JSON_FILE
  weknora-api.sh upload-file KB_ID FILE [true|false]

Environment:
  WEKNORA_BASE_URL   Required; must end in /api/v1
  WEKNORA_API_KEY    Required
  WEKNORA_TENANT_ID  Optional; required for platform-scoped API keys
EOF
}

die() {
  printf 'weknora-api: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

validate_method() {
  case "$1" in
    GET|HEAD|POST|PUT|PATCH|DELETE) ;;
    *) die "unsupported HTTP method: $1" ;;
  esac
}

normalize_endpoint() {
  local endpoint="$1"
  endpoint="${endpoint#/}"

  [[ -n "$endpoint" ]] || die "endpoint must not be empty"
  case "$endpoint" in
    *://*|//*|*\\*|*..*|*'#'*|*' '*|*$'\t'*|*$'\n'*|*$'\r'*)
      die "endpoint must be a safe relative API path"
      ;;
  esac

  printf '%s' "$endpoint"
}

request_id() {
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen
  elif [[ -r /proc/sys/kernel/random/uuid ]]; then
    tr -d '\n' </proc/sys/kernel/random/uuid
  else
    printf 'weknora-%s-%s' "$(date +%s)" "$$"
  fi
}

build_common_args() {
  local base_url="${WEKNORA_BASE_URL:-}"
  local api_key="${WEKNORA_API_KEY:-}"
  local authority

  [[ -n "$base_url" ]] || die "WEKNORA_BASE_URL is not set"
  [[ -n "$api_key" ]] || die "WEKNORA_API_KEY is not set"

  base_url="${base_url%/}"
  case "$base_url" in
    http://*/api/v1|https://*/api/v1) ;;
    *) die "WEKNORA_BASE_URL must be an http(s) URL ending in /api/v1" ;;
  esac
  case "$base_url" in
    *'?'*|*'#'*|*$'\n'*|*$'\r'*|*' '*) die "WEKNORA_BASE_URL contains unsupported characters" ;;
  esac

  authority="${base_url#*://}"
  authority="${authority%%/*}"
  [[ -n "$authority" ]] || die "WEKNORA_BASE_URL must contain a host"
  [[ "$authority" != *'@'* ]] || die "WEKNORA_BASE_URL must not contain credentials"

  if [[ -n "${WEKNORA_TENANT_ID:-}" ]] && [[ ! "$WEKNORA_TENANT_ID" =~ ^[1-9][0-9]*$ ]]; then
    die "WEKNORA_TENANT_ID must be a positive integer"
  fi

  COMMON_BASE_URL="$base_url"
  COMMON_ARGS=(
    --fail-with-body
    --silent
    --show-error
    --connect-timeout 10
    --max-time 300
    --header "Accept: application/json"
    --header "X-API-Key: $api_key"
    --header "X-Request-ID: $(request_id)"
  )

  if [[ -n "${WEKNORA_TENANT_ID:-}" ]]; then
    COMMON_ARGS+=(--header "X-Tenant-ID: $WEKNORA_TENANT_ID")
  fi
}

run_request() {
  local method="$1"
  local endpoint="$2"
  local body="${3-}"
  local has_body="$4"
  local url
  local -a args

  validate_method "$method"
  endpoint="$(normalize_endpoint "$endpoint")"
  url="$COMMON_BASE_URL/$endpoint"
  args=("${COMMON_ARGS[@]}" --request "$method")

  if [[ "$has_body" == true ]]; then
    case "$method" in
      GET|HEAD) die "$method requests must not contain a JSON body; use query parameters or POST" ;;
    esac
    args+=(--header "Content-Type: application/json" --data-binary "$body")
  fi

  curl "${args[@]}" "$url"
}

require_command curl
[[ $# -ge 1 ]] || {
  usage
  exit 1
}

command_name="$1"
shift

case "$command_name" in
  -h|--help|help)
    usage
    exit 0
    ;;
esac

build_common_args

case "$command_name" in
  request)
    [[ $# -ge 2 && $# -le 3 ]] || {
      usage
      exit 1
    }
    method="${1^^}"
    endpoint="$2"
    if [[ $# -eq 3 ]]; then
      run_request "$method" "$endpoint" "$3" true
    else
      run_request "$method" "$endpoint" "" false
    fi
    ;;

  request-file)
    [[ $# -eq 3 ]] || {
      usage
      exit 1
    }
    method="${1^^}"
    endpoint="$2"
    json_file="$3"
    [[ -f "$json_file" && -r "$json_file" ]] || die "JSON file is not a readable regular file: $json_file"
    validate_method "$method"
    case "$method" in
      GET|HEAD) die "$method requests must not contain a JSON body; use query parameters or POST" ;;
    esac
    endpoint="$(normalize_endpoint "$endpoint")"
    curl "${COMMON_ARGS[@]}" \
      --request "$method" \
      --header "Content-Type: application/json" \
      --data-binary "@$json_file" \
      "$COMMON_BASE_URL/$endpoint"
    ;;

  upload-file)
    [[ $# -ge 2 && $# -le 3 ]] || {
      usage
      exit 1
    }
    kb_id="$1"
    file_path="$2"
    multimodal="${3-}"

    [[ "$kb_id" =~ ^[A-Za-z0-9._-]+$ ]] || die "KB_ID contains unsupported characters"
    [[ -f "$file_path" && -r "$file_path" ]] || die "upload file is not a readable regular file: $file_path"
    if [[ -n "$multimodal" && "$multimodal" != true && "$multimodal" != false ]]; then
      die "enable_multimodel must be true or false"
    fi

    declare -a upload_args=(
      "${COMMON_ARGS[@]}"
      --request POST
      --form "file=@$file_path"
    )
    if [[ -n "$multimodal" ]]; then
      upload_args+=(--form "enable_multimodel=$multimodal")
    fi
    curl "${upload_args[@]}" \
      "$COMMON_BASE_URL/knowledge-bases/$kb_id/knowledge/file"
    ;;

  *)
    usage
    die "unknown command: $command_name"
    ;;
esac
