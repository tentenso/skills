#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_skill="${repository_root}/skills/workbench-operator"
test_root="$(mktemp -d)"
trap 'rm -rf "${test_root}"' EXIT
unset WORKBENCH_BASE_URL WORKBENCH_USERNAME WORKBENCH_PASSWORD WORKBENCH_AUTH_HEADER

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_equal() {
  local expected="$1"
  local actual="$2"
  local message="$3"
  [[ "${actual}" == "${expected}" ]] || fail "${message}: expected '${expected}', got '${actual}'"
}

assert_argument() {
  local expected="$1"
  local capture_file="$2"
  grep --fixed-strings --line-regexp --quiet -- "${expected}" "${capture_file}" || \
    fail "curl arguments missing: ${expected}"
}

copy_skill() {
  local destination="$1"
  mkdir -p "${destination}"
  cp -R "${source_skill}/scripts" "${destination}/scripts"
}

fake_bin="${test_root}/bin"
mkdir -p "${fake_bin}"
cat > "${fake_bin}/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
: "${CURL_CAPTURE:?}"
printf '%s\n' "$@" > "${CURL_CAPTURE}"
printf '{"data":{"status":"ok"}}\n'
EOF
chmod +x "${fake_bin}/curl"

dotenv_skill="${test_root}/dotenv-skill"
copy_skill "${dotenv_skill}"
cat > "${dotenv_skill}/.env" <<'EOF'
WORKBENCH_BASE_URL=https://dotenv.example/
WORKBENCH_USERNAME=dotenv-user
WORKBENCH_PASSWORD="dotenv password#1"
EOF
chmod 600 "${dotenv_skill}/.env"

resolved="$(
  WORKBENCH_BASE_URL="https://system.example" \
  WORKBENCH_USERNAME="system-user" \
  WORKBENCH_PASSWORD="system-password" \
    "${dotenv_skill}/scripts/workbench-config.sh" resolve
)"
assert_equal "https://dotenv.example" "${resolved}" ".env should override system URL"

capture_file="${test_root}/curl-args"
PATH="${fake_bin}:${PATH}" \
CURL_CAPTURE="${capture_file}" \
WORKBENCH_BASE_URL="https://system.example" \
WORKBENCH_USERNAME="system-user" \
WORKBENCH_PASSWORD="system-password" \
WORKBENCH_AUTH_HEADER="Authorization: Bearer system-token" \
  "${dotenv_skill}/scripts/workbench-api.sh" GET /api/v1/health >/dev/null
assert_argument "--basic" "${capture_file}"
assert_argument "dotenv-user:dotenv password#1" "${capture_file}"
assert_argument "https://dotenv.example/api/v1/health" "${capture_file}"

system_skill="${test_root}/system-skill"
copy_skill "${system_skill}"
resolved="$(
  WORKBENCH_BASE_URL="https://system.example/" \
    "${system_skill}/scripts/workbench-config.sh" resolve
)"
assert_equal "https://system.example" "${resolved}" "system URL should be used without .env"
capture_file="${test_root}/system-curl-args"
PATH="${fake_bin}:${PATH}" \
CURL_CAPTURE="${capture_file}" \
WORKBENCH_BASE_URL="https://system.example" \
WORKBENCH_USERNAME="system-user" \
WORKBENCH_PASSWORD="system-password" \
  "${system_skill}/scripts/workbench-api.sh" GET /api/v1/health >/dev/null
assert_argument "system-user:system-password" "${capture_file}"
assert_argument "https://system.example/api/v1/health" "${capture_file}"

fallback_skill="${test_root}/fallback-skill"
copy_skill "${fallback_skill}"
fallback_config_root="${test_root}/config/workbench-operator"
mkdir -p "${fallback_config_root}"
printf '%s\n' "https://fallback.example/" > "${fallback_config_root}/base-url"
resolved="$(
  env -u WORKBENCH_BASE_URL \
    XDG_CONFIG_HOME="${test_root}/config" \
    "${fallback_skill}/scripts/workbench-config.sh" resolve
)"
assert_equal "https://fallback.example" "${resolved}" "user config should remain the final URL fallback"

literal_skill="${test_root}/literal-skill"
copy_skill "${literal_skill}"
marker_file="${test_root}/must-not-exist"
printf '%s\n' \
  'WORKBENCH_BASE_URL=https://literal.example' \
  'WORKBENCH_USERNAME=literal-user' \
  "WORKBENCH_PASSWORD=\$(touch ${marker_file})" \
  > "${literal_skill}/.env"
capture_file="${test_root}/literal-curl-args"
PATH="${fake_bin}:${PATH}" CURL_CAPTURE="${capture_file}" \
  "${literal_skill}/scripts/workbench-api.sh" GET /api/v1/health >/dev/null
[[ ! -e "${marker_file}" ]] || fail ".env values must not execute shell commands"
assert_argument "literal-user:\$(touch ${marker_file})" "${capture_file}"

partial_skill="${test_root}/partial-skill"
copy_skill "${partial_skill}"
cat > "${partial_skill}/.env" <<'EOF'
WORKBENCH_BASE_URL=https://partial.example
WORKBENCH_USERNAME=missing-password
EOF
if PATH="${fake_bin}:${PATH}" CURL_CAPTURE="${test_root}/unused" \
  WORKBENCH_PASSWORD="system-password-must-not-be-mixed" \
  "${partial_skill}/scripts/workbench-api.sh" GET /api/v1/health \
  >"${test_root}/partial.stdout" 2>"${test_root}/partial.stderr"; then
  fail "partial credentials should fail"
fi
grep --fixed-strings --quiet \
  "WORKBENCH_USERNAME 与 WORKBENCH_PASSWORD 必须同时配置" \
  "${test_root}/partial.stderr" || fail "partial credential error should be explicit"

header_skill="${test_root}/header-skill"
copy_skill "${header_skill}"
capture_file="${test_root}/header-curl-args"
PATH="${fake_bin}:${PATH}" \
CURL_CAPTURE="${capture_file}" \
WORKBENCH_BASE_URL="https://header.example" \
WORKBENCH_AUTH_HEADER="Authorization: Bearer test-token" \
  "${header_skill}/scripts/workbench-config.sh" check >/dev/null
assert_argument "Authorization: Bearer test-token" "${capture_file}"
assert_argument "https://header.example/" "${capture_file}"

echo "workbench-operator tests passed"
