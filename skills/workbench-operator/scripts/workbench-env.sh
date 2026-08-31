#!/usr/bin/env bash

workbench_env_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
workbench_skill_root="$(cd "${workbench_env_script_dir}/.." && pwd)"

workbench_trim() {
  local value="${1:-}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
}

workbench_load_env() {
  local env_file="${1:-${workbench_skill_root}/.env}"
  [[ -e "${env_file}" ]] || return 0
  if [[ ! -f "${env_file}" || ! -r "${env_file}" ]]; then
    echo "工作台环境配置不可读: ${env_file}" >&2
    return 2
  fi

  local line line_number=0 key value
  local -A dotenv_values=()
  local -A dotenv_seen=()
  while IFS= read -r line || [[ -n "${line}" ]]; do
    line_number=$((line_number + 1))
    line="${line%$'\r'}"
    if [[ "${line}" =~ ^[[:space:]]*$ || "${line}" =~ ^[[:space:]]*# ]]; then
      continue
    fi
    if [[ ! "${line}" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]]; then
      echo "工作台 .env 第 ${line_number} 行格式无效" >&2
      return 2
    fi

    key="${BASH_REMATCH[2]}"
    value="$(workbench_trim "${BASH_REMATCH[3]}")"
    if [[ "${value}" == \"* ]]; then
      if (( ${#value} < 2 )) || [[ "${value}" != *\" ]]; then
        echo "工作台 .env 第 ${line_number} 行缺少结束双引号" >&2
        return 2
      fi
      value="${value:1:${#value}-2}"
    elif [[ "${value}" == \'* ]]; then
      if (( ${#value} < 2 )) || [[ "${value}" != *\' ]]; then
        echo "工作台 .env 第 ${line_number} 行缺少结束单引号" >&2
        return 2
      fi
      value="${value:1:${#value}-2}"
    fi

    case "${key}" in
      WORKBENCH_BASE_URL|WORKBENCH_USERNAME|WORKBENCH_PASSWORD|WORKBENCH_AUTH_HEADER)
        dotenv_values["${key}"]="${value}"
        dotenv_seen["${key}"]=1
        ;;
      WORKBENCH_*)
        echo "工作台 .env 包含不支持的变量: ${key}" >&2
        return 2
        ;;
    esac
  done < "${env_file}"

  if [[ "${dotenv_seen[WORKBENCH_BASE_URL]:-}" == 1 ]]; then
    WORKBENCH_BASE_URL="${dotenv_values[WORKBENCH_BASE_URL]}"
    export WORKBENCH_BASE_URL
  fi

  if [[ "${dotenv_seen[WORKBENCH_USERNAME]:-}" == 1 ||
        "${dotenv_seen[WORKBENCH_PASSWORD]:-}" == 1 ||
        "${dotenv_seen[WORKBENCH_AUTH_HEADER]:-}" == 1 ]]; then
    unset WORKBENCH_USERNAME WORKBENCH_PASSWORD WORKBENCH_AUTH_HEADER
    for key in WORKBENCH_USERNAME WORKBENCH_PASSWORD WORKBENCH_AUTH_HEADER; do
      if [[ "${dotenv_seen[${key}]:-}" == 1 ]]; then
        printf -v "${key}" '%s' "${dotenv_values[${key}]}"
        export "${key}"
      fi
    done
  fi
}

workbench_append_curl_auth() {
  local target_name="${1:?缺少 curl 参数数组名称}"
  local -n target="${target_name}"
  local username="${WORKBENCH_USERNAME:-}"
  local password="${WORKBENCH_PASSWORD:-}"
  local auth_header="${WORKBENCH_AUTH_HEADER:-}"

  if [[ -n "${username}" && -z "${password}" ]] || [[ -z "${username}" && -n "${password}" ]]; then
    echo "WORKBENCH_USERNAME 与 WORKBENCH_PASSWORD 必须同时配置" >&2
    return 2
  fi
  if [[ -n "${username}" && -n "${auth_header}" ]]; then
    echo "工作台基础账密与 WORKBENCH_AUTH_HEADER 不能同时配置" >&2
    return 2
  fi
  if [[ "${username}" == *:* || "${username}" == *$'\n'* || "${username}" == *$'\r'* ]]; then
    echo "WORKBENCH_USERNAME 不能包含冒号或换行符" >&2
    return 2
  fi
  if [[ "${password}" == *$'\n'* || "${password}" == *$'\r'* ]]; then
    echo "WORKBENCH_PASSWORD 不能包含换行符" >&2
    return 2
  fi
  if [[ "${auth_header}" == *$'\n'* || "${auth_header}" == *$'\r'* ]]; then
    echo "WORKBENCH_AUTH_HEADER 不能包含换行符" >&2
    return 2
  fi

  if [[ -n "${username}" ]]; then
    target+=(--basic --user "${username}:${password}")
  elif [[ -n "${auth_header}" ]]; then
    target+=(--header "${auth_header}")
  fi
}
