# Qualification, Scoring, And Deduplication

Use this reference after evidence collection and before delivering or importing any prospect.

## Hard Entry Gates

A formal prospect must pass every gate:

1. The company is real and current.
2. The company belongs to the target value chain.
3. There is an explainable connection to at least one target product.
4. At least one traceable source URL supports the decisive facts.
5. A current relevant person or official public business contact route is verified.
6. Deduplication is complete.
7. The recommendation reason covers the company scenario, the person's role/contact route, and the product connection.

High scores cannot override a failed gate. A fitting company without a verified person may be retained as `company_lead`, but never invent a contact or authority.

## Five-Dimension Lead Score

Score each dimension from 0 to 20 using evidence, not title-based guesswork:

- `product_demand`: strength and recurrence of the product/application fit.
- `purchase_influence`: verified likelihood that the role participates in specifying, evaluating, sourcing, operating, maintaining, or distributing the product.
- `market_value`: company/market scale, strategic fit, accessibility, and commercial relevance.
- `use_scenario`: clarity and reality of an actual equipment, project, process, or distribution use case.
- `decision_proximity`: closeness of the verified person/contact route to a useful next conversation.

```text
lead_score = product_demand + purchase_influence + market_value
             + use_scenario + decision_proximity
```

Grades:

| Grade | Score |
|---|---:|
| A | 85-100 |
| B | 70-84 |
| C | 50-69 |
| D | 0-49 |

Use a separate ranking score so business priorities can order leads with similar fit:

```text
priority_score =
  lead_score * 0.45
  + market_priority * 0.15
  + company_type_priority * 0.15
  + role_priority * 0.10
  + signal_strength * 0.10
  + evidence_quality * 0.05
  - risk_penalty
```

Normalize each priority component to the same 0-100 scale. Document any risk penalty. The five-dimension lead score must remain visible and must not be replaced by the ranking formula.

## Deduplication

Deduplicate against both the current batch and any existing customer/workbench files the user places in scope.

Person/LinkedIn match order:

1. Sales Navigator Lead ID;
2. canonical LinkedIn profile URL;
3. normalized full name + normalized company;
4. full name + current title + country.

Company/Maps match order:

1. Google Place ID;
2. root domain;
3. normalized international phone;
4. normalized company name + full address;
5. normalized company name + city.

Normalize WhatsApp numbers to E.164. Normalize domains by removing protocol, `www`, path, query, and trailing slash. Preserve the original display values.

When a duplicate has stronger new evidence, enrich the existing record. Never overwrite contact status, sent messages, replies, manual notes, owner, or follow-up dates unless the user explicitly requests that change. Count `duplicates` and `enriched_duplicates` separately.

## Minimum Record

Each formal result should carry:

```text
record_type
company_name
company_type
website
country
city_or_region
person_name
current_title
department_or_function
linkedin_url
public_email
public_phone
public_whatsapp
matched_product
application_or_use_case
verified_business_signal
recommendation_reason
source_urls
evidence_notes
evidence_confidence
product_demand
purchase_influence
market_value
use_scenario
decision_proximity
lead_score
customer_grade
priority_score
dedup_key
verification_status
captured_at
```

Use blank/unknown values honestly. `资料不足` or `insufficient_public_data` is acceptable for nonessential fields, but never for a hard entry gate.

## Batch Report

Report at minimum:

- requested formal count;
- candidates discovered;
- formal prospects delivered;
- company-only leads;
- rejected candidates and top rejection reasons;
- duplicates found;
- duplicates enriched;
- markets and query families covered;
- evidence gaps;
- stopping reason.

Rank formal results by `priority_score`, then evidence quality. Keep company-only and needs-review records in separate sections so they cannot be mistaken for ready-to-contact people.
