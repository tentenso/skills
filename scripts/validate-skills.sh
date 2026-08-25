#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
skills_root="$repository_root/skills"
status=0

if [[ ! -d "$skills_root" ]]; then
  printf 'Missing skills directory: %s\n' "$skills_root" >&2
  exit 1
fi

while IFS= read -r -d '' skill_dir; do
  skill_name="$(basename "$skill_dir")"
  skill_file="$skill_dir/SKILL.md"

  if [[ ! "$skill_name" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || (( ${#skill_name} > 64 )); then
    printf 'Invalid skill directory name: %s\n' "$skill_name" >&2
    status=1
  fi

  if [[ ! -f "$skill_file" ]]; then
    printf 'Missing SKILL.md: %s\n' "$skill_dir" >&2
    status=1
    continue
  fi

  if ! head -n 1 "$skill_file" | grep -qx -- '---'; then
    printf 'Missing YAML frontmatter: %s\n' "$skill_file" >&2
    status=1
    continue
  fi

  declared_name="$(sed -n '2,/^---$/p' "$skill_file" | sed -n 's/^name:[[:space:]]*//p' | head -n 1)"
  description="$(sed -n '2,/^---$/p' "$skill_file" | sed -n 's/^description:[[:space:]]*//p' | head -n 1)"

  if [[ "$declared_name" != "$skill_name" ]]; then
    printf 'Skill name must match directory: %s\n' "$skill_dir" >&2
    status=1
  fi

  if [[ -z "$description" ]]; then
    printf 'Missing description in frontmatter: %s\n' "$skill_file" >&2
    status=1
  fi

  if grep -qiE 'TODO|TBD|<skill-name>|example-skill' "$skill_file"; then
    printf 'Unfinished placeholder found: %s\n' "$skill_file" >&2
    status=1
  fi
done < <(find "$skills_root" -mindepth 1 -maxdepth 1 -type d -print0)

exit "$status"
