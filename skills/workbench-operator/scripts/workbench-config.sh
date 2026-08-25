#!/usr/bin/env bash
set -euo pipefail

config_root="${XDG_CONFIG_HOME:-${HOME}/.config}/workbench-operator"
config_file="${config_root}/base-url"

usage() {
  echo "usage: workbench-config.sh init <http-or-https-url> | resolve | check | path" >&2
}

normalize_url() {
  local candidate="${1:-}"
  while [[ "${candidate}" == */ ]]; do
    candidate="${candidate%/}"
  done
  case "${candidate}" in
    http://*|https://*) ;;
    *) echo "工作台地址必须以 http:// 或 https:// 开头" >&2; return 2 ;;
  esac
  if [[ "${candidate}" =~ [[:space:]] ]]; then
    echo "工作台地址不能包含空白字符" >&2
    return 2
  fi
  local authority="${candidate#*://}"
  authority="${authority%%/*}"
  if [[ -z "${authority}" || "${authority}" == *"@"* ]]; then
    echo "工作台地址必须包含主机，且不能在 URL 中保存凭据" >&2
    return 2
  fi
  printf '%s\n' "${candidate}"
}

resolve_url() {
  if [[ -n "${WORKBENCH_BASE_URL:-}" ]]; then
    normalize_url "${WORKBENCH_BASE_URL}"
    return
  fi
  if [[ ! -s "${config_file}" ]]; then
    echo "尚未配置工作台访问地址" >&2
    return 2
  fi
  normalize_url "$(<"${config_file}")"
}

probe_url() {
  local base_url="$1"
  curl --fail --silent --show-error --location \
    --connect-timeout 3 --max-time 8 \
    --output /dev/null "${base_url}/"
}

case "${1:-}" in
  init)
    if [[ $# -ne 2 ]]; then usage; exit 2; fi
    base_url="$(normalize_url "$2")"
    probe_url "${base_url}"
    mkdir -p "${config_root}"
    chmod 700 "${config_root}"
    temp_file="$(mktemp "${config_root}/.base-url.XXXXXX")"
    trap 'rm -f "${temp_file}"' EXIT
    printf '%s\n' "${base_url}" > "${temp_file}"
    chmod 600 "${temp_file}"
    mv "${temp_file}" "${config_file}"
    trap - EXIT
    printf '%s\n' "${base_url}"
    ;;
  resolve)
    resolve_url
    ;;
  check)
    base_url="$(resolve_url)"
    probe_url "${base_url}"
    printf 'reachable %s\n' "${base_url}"
    ;;
  path)
    printf '%s\n' "${config_file}"
    ;;
  *)
    usage
    exit 2
    ;;
esac
