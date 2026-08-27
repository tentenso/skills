# ICP And Query Planning

Use this reference to turn a natural-language target customer profile into a search brief and executable query matrix.

## Normalize The Input

Capture the following fields. Preserve the user's words and separate them from derived search terms.

| Field | Meaning |
|---|---|
| factory | Factory name, location, manufacturer/trader status, and credible proof points |
| products | Products actually supplied, product boundaries, aliases, models, and exclusions |
| applications | Equipment, processes, industries, operating conditions, and problems the products address |
| target_company_types | End users, OEMs, EPCs, contractors, distributors, service firms, importers, or other value-chain roles |
| target_roles | Current functions likely to use, specify, evaluate, source, influence, or distribute the products |
| markets | Countries, regions, cities, industrial clusters, and language variants |
| positive_signals | Projects, installed equipment, tenders, expansions, hiring, localization, dealership, maintenance, or product pages |
| exclusions | Wrong industries, competing meanings, students, former roles, recruiters, consultants, unrelated traders, or consumer businesses |
| channels | LinkedIn, company website, search, Maps, associations, exhibitions, directories, public phone, email, or WhatsApp |
| quantity | Requested number of verified prospects; default 20 |

Do not create product capabilities that the user has not supplied or that no authoritative factory source confirms. Mark important uncertain fields as assumptions.

## Build The Search Vocabulary

Create six reusable term groups:

1. Product terms: official product names, technical aliases, common spelling variants, and local-language terms.
2. Equipment terms: machines, brands, models, systems, and installed-base terms that consume or specify the product.
3. Application terms: industries, processes, work sites, use cases, failure modes, and operational problems.
4. Company-type terms: end user, owner, operator, OEM, EPC, contractor, distributor, dealer, importer, aftermarket, repair, service, rental, or integrator, filtered to the ICP.
5. Role terms: function, seniority, buying-center role, and local title variants.
6. Exclusion terms: irrelevant industries, homonyms, former/retired roles, student/academic-only profiles, and other false-positive patterns.

Translate the business relationship, not just the literal words. A product can be discovered through the equipment that consumes it, the process that needs it, or the problem it solves.

## Prioritize Before Searching

Assign explicit tiers:

- Market tiers: demand scale, import openness, accessible evidence, competition, logistics feasibility, and current factory strategy.
- Company tiers: direct recurring users first, then strong specifiers/influencers and relevant channel partners, then weak or indirect fits.
- Role tiers: decision owners and functional evaluators first, operational influencers second, adjacent networking roles third.
- Signal tiers: current professional event or project, new role, current responsibility, company strategy, then relevant past experience.

Tiering is factory-specific. Do not assume that procurement is always the best first contact: technical, operations, maintenance, product, project, channel, or business-unit roles may have a stronger product connection.

## Generate Query Families

Build a matrix across priority markets, company tiers, and product/application families. Use the best available source-specific syntax.

```text
[product] + [company type] + [country/city/cluster]
[equipment] + [company type] + [country/city/cluster]
[application] + [company type] + [country/city/cluster]
[application] + [current role] + [country]
[brand/equipment] + distributor/dealer/aftermarket/service + [country]
[project/tender/vendor registration] + [industry] + [country]
site:linkedin.com/in + [role] + [application] + [country]
site:[company domain] + procurement/vendor/product/application
```

For Maps, combine company type or application with the city, mining/industrial cluster, port, project area, or service hub. For WhatsApp, first verify the company and only then inspect its official public business contact routes.

## Expand Adaptively

Search highest-priority combinations first. When a pass produces few qualified leads, expand one dimension at a time so the cause is visible:

1. synonyms and local-language variants;
2. adjacent high-fit company types;
3. equipment brands, applications, projects, and associations;
4. secondary roles inside already-qualified companies;
5. next market tier.

Log each query family, market, source, and result count. Do not keep repeating semantically equivalent queries. Two successive expansion passes with no new qualified lead satisfy the exhaustion condition after the priority search space has been covered.
