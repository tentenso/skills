---
name: icp-prospect-finder
description: Turn a factory's target customer profile into an executable prospecting plan, then research, verify, score, deduplicate, and deliver qualified B2B prospects. Use when the user asks to find, scrape, build, expand, or audit a prospect list from an ICP; do not use for outreach-only writing or unrelated CRM administration.
---

# ICP Prospect Finder

Find real prospects from a natural-language target customer profile. Complete the research and deliver verified leads; do not stop after proposing keywords or a plan.

## Operating Boundary

The normal scope includes public research, verification, qualification, scoring, deduplication, and local deliverables. It does not include sending invitations, InMail, WhatsApp messages, or email; uploading to a CRM or workbench; changing contact status; or transmitting customer data. Perform those actions only when the user explicitly requests them and the environment permits them.

Treat message generation as a separate handoff. A request to find customers does not authorize contacting them.

## Run The Workflow

1. Parse the user's ICP and factory information into a normalized search brief. Read [references/icp-and-query-planning.md](references/icp-and-query-planning.md).
2. Search company-first across the best available public sources, then locate current contacts or official public business contact routes. Read [references/source-verification.md](references/source-verification.md).
3. Apply hard entry gates, product-fit reasoning, scoring, ranking, and deduplication. Read [references/qualification-scoring-dedup.md](references/qualification-scoring-dedup.md).
4. Return the verified leads and a batch report. If the user also requests messages or system import, read [references/outreach-and-workbench-handoff.md](references/outreach-and-workbench-handoff.md) before doing that stage.

If the ICP is usable, proceed without asking the user to restate it in a form. Make conservative, visible assumptions for optional fields. Ask only when a missing fact would materially change who qualifies, such as an ambiguous product category with incompatible buyer groups.

## Defaults And Stopping

- Default target: 20 verified formal prospects when the user gives no quantity.
- Use the user's market, company-type, and role priorities. When absent, infer candidate tiers from product application and public demand evidence, and disclose the assumptions in the batch report.
- Never weaken entry gates to reach a requested number.
- Stop when the requested verified count is reached. If it cannot be reached, stop after the priority markets and query families have been covered and two successive expansion passes produce no new qualified lead.
- Keep relevant companies without a verified person as `company_lead`; do not count them as formal person-level prospects unless the user explicitly accepts company-only leads.

## Required Result

Deliver:

- a ranked list of formal prospects with source links and concise fit reasons;
- a separate company-only list when applicable;
- counts for discovered, rejected, formal, company-only, duplicate, and enriched records;
- unresolved evidence gaps and the exact stopping reason;
- a reusable local file when the task or project workflow calls for import.

Do not present inferred purchasing demand, authority, or contactability as a verified fact. Never invent a person, title, phone number, email address, WhatsApp account, company relationship, project, or requirement.
