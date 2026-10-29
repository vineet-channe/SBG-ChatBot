# Research notes

What the knowledge base and rules are based on, where the sources disagree, and which rules were written for this prototype rather than taken from SBG. Research was done in October 2026.

## Sources

**SBG Funding's own site** (primary source; it wins every conflict):
- Company: [About us](https://sbgfunding.com/about-us/), [home page](https://sbgfunding.com/), [contact](https://sbgfunding.com/contact-us/), [customer stories](https://sbgfunding.com/customer-stories/), [credit application terms](https://sbgfunding.com/credit-application-terms/)
- Requirements and process: [FAQs](https://sbgfunding.com/faqs/), the most-cited page in the knowledge base
- Products: [business financing](https://sbgfunding.com/business-financing/) and each product page (term loan, line of credit, working capital, SBA, equipment, invoice, bridge, HELOC, plus the bad-credit, no-collateral, fast and emergency pages)
- Industries: [industries](https://sbgfunding.com/industries/) and 15 industry pages, each listing recommended products and typical uses
- Calculators: [funding calculator](https://sbgfunding.com/sbgfunding-calculator/) and [line of credit calculator](https://sbgfunding.com/line-of-credit-calculator/), including the JavaScript behind them, which `lib/engine/estimator.ts` ports
- Education: [factor rate vs. interest rate](https://sbgfunding.com/resources/factor-rate-vs-interest-rate/), [merchant cash advances](https://sbgfunding.com/resources/unlock-business-potential-with-mca-loans/), [resources](https://sbgfunding.com/resources/)

**Third-party reviews** (Bankrate, Finder, LendingTree, Business News Daily, ConsumerAffairs, United Capital Source, Business.com, Review42, BestMoney). Direct fetches of these sites were blocked from the build environment, so their claims come from search-engine summaries. Treat them as secondhand.

**Not reachable:** the application (apply.sbgfunding.com) and the customer portal (app.sbgfunding.com). Sterling links to both but knows nothing about what happens inside them.

Every section of `knowledge/source/*.md` names the page it was paraphrased from, and those links appear as citations in Sterling's answers.

## What SBG publishes

| Fact | Value |
| --- | --- |
| Minimums | 500+ personal FICO, 6+ months in business, $150,000+ annual revenue, 4 most recent business bank statements |
| HELOC | 600+ FICO, 6+ months, no revenue minimum |
| Credit check | Soft pull only to apply; "no hard credit pull" |
| Range | $5,000 to $10,000,000; all 50 states |
| Scale | $3B+ since 2017; 28,000+ businesses; 64,000+ transactions |
| Speed | Decisions in as little as 24 hours for most products; SBA typically 30–90 days |
| Model | Direct provider of revenue-based financing (balance-sheet arm: Net Funding); marketplace for other products through lending partners |
| Excluded industries | Adult entertainment and gambling |
| Contact | 844-284-2725, Monday to Friday 9am–6pm ET; 240 W 40th Street, 8th Floor, New York, NY 10018 |
| Legal entity | Mission Capital LLC; founder and CEO Jeffrey Sachs |

### Products

| Product | Amount | Term | Speed | Collateral | Cost |
| --- | --- | --- | --- | --- | --- |
| Revenue-based financing | Sized to monthly revenue | No set term; repaid from sales | Same-day decision, funds in ~24h | None | Factor rate, fixed upfront |
| Term loan | $5K–$10M | 6–48 months | Same-day decision, funds in ~24h | None | From 1.25%/month |
| Line of credit | $5K–$500K limit | Revolving | Same-day draws once approved | None | Interest on drawn balance; draw fee up to 2% |
| Working capital | $5K–$10M | 3–24 months | Same-day decision, funds in ~24h | None | Fixed weekly or monthly payments |
| SBA 7(a) | Up to $5M | 10–25 years | 30–90 days to close | May be required | Prime-based, SBA rate caps |
| Equipment financing | Up to 90% of equipment value | 24–60 months | Same-day decision, funds in ~24h | The equipment | Fixed weekly or monthly payments |
| Invoice financing | Up to 90% of invoice value | Per invoice | Same-day decision, funds in ~24h | The invoices | 0.5%–5% per month plus 0–2% origination |
| Bridge capital | $5K–$10M | Weeks to months | Same-day decision, funds in ~24h | None | Tied to the repayment event |
| Business HELOC | Up to 85% of home value minus mortgage | Revolving | Can take longer | Your home | Variable, typically prime-based |

### The calculator model

From the scripts behind SBG's two calculators. Ported exactly, including the boundary behavior.

- **Points.** Time in business: not started 0, under 6 months 1, 6–12 months 3, 1–2 years 6, over 2 years 11. Credit: under 550 → 0, 550–599 → 1, 600–679 → 3, 680–719 → 6, 720+ → 11. Monthly revenue: ≤$8K → 1, ≤$10K → 2, ≤$20K → 3, ≤$30K → 6, ≤$40K → 9, more → 14.
- **Tiers.**

  | Score | Multiplier | Factor rate | Term | Payments |
  | --- | --- | --- | --- | --- |
  | 10–16 | 0.75× | 1.22 | 12 months | Weekly |
  | 17–21 | 1.5× | 1.24 | 15 months | Weekly |
  | 22–30 | 2.25× | 1.26 | 24 months | Twice monthly |
  | 31–36 | 2.5× | 1.28 | 36 months | Monthly |

  Below 10: no estimate, and the script suggests a HELOC or an advisor.
- **Amounts.** Revenue is rounded up to its bracket ceiling with a strict `<`, so exactly $8,000 rounds to $10,000. The result is multiplied and rounded up to $100. The payment is rounded to the nearest $10.
- **Line of credit.** Limit = 2 × monthly revenue, rounded up to $5,000. Factor 1.28 over 24 months. The script has no cap; Sterling caps the limit at SBG's published $500K maximum and says so in the code.

## Where sources disagree

| Topic | SBG says | Third parties say | What Sterling does |
| --- | --- | --- | --- |
| Minimum revenue | $150,000 a year | Bankrate: $400,000. Finder: $250,000. United Capital Source: $180K–$350K. Review42: $10K a month plus six statements | Uses SBG's figure; the knowledge base says reviewers' figures vary and to confirm with an advisor |
| Minimum credit | 500 | Various: 500, 550, 600; Business.com cites 650 and two years for a higher-tier product | Uses 500 (600 for HELOC) |
| Credit pull | Soft pull only | ConsumerAffairs: soft pull to pre-approve, hard pull before funds go out | Follows SBG; says applying won't affect the score |
| Pricing | Factor rates, monthly rates | LendingTree: quoting factor or monthly rates instead of APR makes comparison harder | Explains factor rate vs. APR in the knowledge base |
| Products | Nine programs | ConsumerAffairs: no asset-based or inventory financing | Lists only SBG's programs |
| Freshness | Current site | Several reviews are dated (one updated October 2023) | Treats third-party figures as background, never as terms |

Ratings reported: Bankrate 4.6/5 (February 2026); SBG cites a 4.9 Trustpilot rating.

## Rules written for this prototype

SBG doesn't publish these. They're reasonable defaults, kept in code where they're easy to change, and an SBG advisor or product owner would need to confirm them.

| Rule | Where | Notes |
| --- | --- | --- |
| How well each product fits each need (a 0–3 weight per need and product) | `PURPOSE_FIT` in `lib/engine/eligibility.ts` | Informed by SBG's "quick guide by need" and comparison pages |
| +1 when SBG's industry page recommends the product | `evaluateProduct()` | The recommendations are SBG's; the weight is mine |
| −1.5 for products that take more than a week when the customer needs money within a week | `evaluateProduct()` | SBA is 30–90 days; HELOC is assumed to take about 3 weeks |
| "Strong fit" means no blockers, no customer-specific cautions and a fit of at least 2 | `evaluateProduct()` | Product-wide caveats (SBA paperwork, HELOC collateral) are shown but don't lower the status |
| Show the HELOC first when nothing else fits and the owner has home equity | `evaluate()` | Mirrors the calculator's HELOC suggestion |
| Ask about invoices only for general needs in invoice-heavy industries; a repayment event only for bridges and acquisitions; home equity only when revenue is short, credit is 600+ and time in business passes | `conditionalQuestions()` in `lib/engine/flow.ts` | Keeps the intake short |
| Credit bands map to a typical score (e.g., 600–679 → 640) | `CREDIT_BANDS` in `lib/engine/profile.ts` | People know their band better than their exact score |
| Complaints and hardship are high priority; servicing tickets carry no product suggestions | `lib/handoff/escalate.ts` | |
| Escalate complex deals: SBA, acquisitions, real estate, or more than $1M | System prompt | A judgment call left to the model |
| Retrieval confidence: high ≥ 0.50 cosine, low < 0.33 | `lib/rag/retriever.ts` | Calibrated on the eval set |
| The SBA 650+ note | `evaluateProduct()` | From SBG's SBA page: scores of 650 and above are generally stronger candidates |
