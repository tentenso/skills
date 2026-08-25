# Tentenso Agent Skills

公司内部 Agent 技能库。每个技能都是一个独立、可发现的目录，用于为特定业务场景提供必要的流程、约束和可复用资源。

## 目录结构

```text
.
├── README.md
├── skills/
│   └── <skill-name>/
│       ├── SKILL.md             # 必需：技能入口与使用说明
│       ├── agents/              # 可选：Agent UI 元数据，例如 openai.yaml
│       ├── references/          # 可选：按需读取的领域资料与规范
│       ├── scripts/             # 可选：可重复执行的确定性脚本
│       └── assets/              # 可选：生成结果需要复用的模板或素材
├── scripts/
│   └── validate-skills.sh       # 技能结构校验
└── .github/workflows/
    └── validate-skills.yml      # Pull Request 与主分支校验
```

`skills/` 是技能的唯一存放位置。一个技能的最小结构如下：

```text
skills/
└── example-skill/
    └── SKILL.md
```

不要为尚未实际需要的资源创建空目录。技能应保持自包含，并只携带完成其工作所需的说明、脚本、参考资料和素材。

## 新增技能

1. 在 `skills/` 下创建使用小写字母、数字和连字符命名的目录，例如 `customer-support`。
2. 创建 `SKILL.md`，并在 YAML frontmatter 中提供 `name` 与能准确描述适用场景的 `description`。
3. 仅在确有需要时添加 `agents/`、`references/`、`scripts/` 或 `assets/`。
4. 运行 `bash scripts/validate-skills.sh`，确认结构通过校验后提交。

`SKILL.md` 的最小示例：

```markdown
---
name: customer-support
description: 处理客户支持工单时使用，提供当前产品政策和升级路径。
---

# Customer Support

说明技能的目标、关键约束和按需读取的资料。
```

## 编写约定

- 名称使用小写字母、数字和连字符，长度不超过 64 个字符，且与目录名一致。
- `description` 说明技能能力及适用时机，并明确相近场景的边界。
- `SKILL.md` 只保留通用流程和关键约束；场景化的长篇资料放到 `references/`，并从入口文件链接。
- 重复、易出错或需要确定性执行的操作放到 `scripts/`；脚本应可独立运行并经过验证。
- 不在技能中复制通用模型能力、全局政策或与该技能无关的业务规则。

## 校验与 CI

本地执行：

```bash
bash scripts/validate-skills.sh
```

该校验会检查每个技能是否包含 `SKILL.md`、目录与 frontmatter 名称是否一致，以及是否存在未替换的初始化占位内容。GitHub Actions 会在 pull request 和推送到 `main` 时运行同一校验。
