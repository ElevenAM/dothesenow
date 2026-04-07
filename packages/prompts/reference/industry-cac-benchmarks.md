# Industry CAC Benchmarks — Reference for Strategy Generator

> **Purpose**: The strategy generator ([6A]) uses these benchmarks to validate channel recommendations against budget tiers and to prune unrealistic experiments. The budget pruning logic in `packages/prompts/src/strategy-generator.ts` references this data.
>
> **Sources**: Aggregated from ProfitWell, First Page Sage, Hubspot, and industry reports (2024–2025 data). Updated annually.

---

## Data Freshness & Staleness Warning

> **Last Verified**: January 2025
> **Data Freshness**: Based on 2024–Q1 2025 reports
> **Staleness Threshold**: If current date > July 2025, display staleness warning to user ("This benchmark data is 6+ months old. Verify with current market conditions.")
> **Next Review**: Q3 2025

---

## CAC by Industry and Channel

All figures are **blended average CAC per customer/user** in USD. Ranges reflect variance by company stage and geography.

### B2B SaaS

| Channel | CAC Range | Median | Bootstrap (Mo 1–3) | Notes |
|---------|-----------|--------|-------------------|-------|
| Organic Search / SEO | $100–$400 | $205 | $0 spend, $0 revenue (6–12 mo ramp) | Lowest CAC but requires content runway; undefined CAC first 3 months |
| Content Marketing | $150–$500 | $280 | $0 spend, undefined CAC | Overlaps with SEO; standalone = newsletters, gated content |
| LinkedIn Organic | $150–$350 | $230 | ~$50 (founder-led, 100 contacts) | Founder-led; hard to scale past initial network |
| LinkedIn Ads | $300–$800 | $500 | Undefined (requires budget) | High-quality leads but expensive CPMs |
| Google Ads (Search) | $200–$600 | $350 | Undefined (requires budget) | Intent-based; competitive keywords expensive |
| Product-Led Growth | $50–$200 | $100 | $0 if natural loop, undefined if not | Lowest CAC when viral loop works; requires product investment |
| Events / Conferences | $500–$1,500 | $800 | Not viable in Mo 1–3 | High touch; best for enterprise ACV >$10K |
| Outbound Sales | $400–$1,200 | $700 | ~$440 (founder-led, 1000-contact campaign) | Effective at scale; CAC drops with SDR efficiency; cold outreach costs ~$440/customer |

### Developer Tools

| Channel | CAC Range | Median | Bootstrap (Mo 1–3) | Notes |
|---------|-----------|--------|-------------------|-------|
| Documentation / Tutorials | $30–$150 | $70 | $0 (organic content) | Lowest; devs self-serve from docs |
| Community (Discord/Slack) | $50–$200 | $100 | ~$50–100 (organic) | Word-of-mouth multiplier; undefined in month 1 cold start |
| Open Source / GitHub | $20–$100 | $50 | $0 spend (if exists), undefined if none | Near-zero marginal CAC; conversion rate is the challenge |
| Hacker News / Reddit | $50–$300 | $120 | Volatile; $0 spend | Volatile but high-quality when it hits; rare in month 1 |
| Dev Podcast Sponsorship | $200–$600 | $350 | Not viable in Mo 1–3 | Niche but trusted channel |
| Google Ads | $300–$800 | $450 | Undefined (requires budget) | Less effective than B2B SaaS; devs use ad blockers |
| Conference Sponsorship | $400–$1,000 | $600 | Not viable in Mo 1–3 | Brand awareness more than direct acquisition |

### DTC eCommerce

| Channel | CAC Range | Median | Bootstrap (Mo 1–3) | Notes |
|---------|-----------|--------|-------------------|-------|
| Email Marketing | $5–$25 | $12 | Undefined (no list) | Lowest; requires existing list; cold start undefined |
| SMS Marketing | $8–$30 | $15 | Undefined (no list) | High open rates; compliance-sensitive; requires audience first |
| Organic Social (IG/TikTok) | $10–$50 | $25 | $0 spend, low conversion | Time-intensive; algorithm-dependent; slow early |
| Meta Ads (Facebook/IG) | $20–$80 | $45 | $45–80 (paid required) | Most common DTC channel; rising costs |
| Google Shopping | $15–$60 | $35 | $35–60 (paid required) | Intent-based; good for product searches |
| Influencer Marketing | $30–$150 | $60 | Not viable in Mo 1–3 | Micro-influencers best for bootstrap; requires audience first |
| TikTok Ads | $15–$50 | $30 | $30–50 (paid required) | Lower CPMs than Meta; younger demographic |
| Affiliate Marketing | $20–$80 | $40 | Undefined (no affiliates) | Performance-based; lower risk; requires partner network |

### Fintech

| Channel | CAC Range | Median | Bootstrap (Mo 1–3) | Notes |
|---------|-----------|--------|-------------------|-------|
| Organic Search / SEO | $150–$600 | $300 | $0 spend, undefined CAC | Compliance content ranks well; long ramp (6–12 mo) |
| Content Marketing | $200–$700 | $400 | $0 spend, undefined CAC | Trust-building essential; ROI calculators convert well |
| LinkedIn Organic | $200–$500 | $300 | ~$150–200 (founder-led) | Decision-makers active; compliance expertise differentiates |
| Partnership / Co-marketing | $100–$400 | $200 | Undefined (requires partner) | Adjacent SaaS partnerships lower blended CAC |
| Google Ads | $400–$1,200 | $700 | $700+ (paid required) | Extremely competitive keywords |
| Fintech Directories | $100–$300 | $180 | Undefined (listing lead time) | Niche but high-intent traffic; application process |
| Conferences (virtual) | $300–$800 | $500 | Not viable in Mo 1–3 | Credibility-building; regulatory audiences |

### Marketplace

| Channel | CAC Range | Median | Bootstrap (Mo 1–3) | Notes |
|---------|-----------|--------|-------------------|-------|
| Direct Outreach (supply) | $50–$200 | $100 | ~$50–100 (founder-led) | Manual but essential for cold start; founder can do this |
| SEO (demand) | $30–$150 | $70 | $0 spend, undefined CAC | Long-tail buyer searches; low cost at scale |
| Referral Programs | $15–$60 | $30 | Undefined (no base users) | Both supply and demand side; key growth lever; requires critical mass |
| Community / Forums | $20–$100 | $50 | ~$30–50 (organic) | Niche community engagement |
| Google Ads | $50–$200 | $100 | $100+ (paid required) | Demand-side acquisition |
| Social Media Organic | $20–$80 | $40 | $0 spend, slow | UGC and supply-side stories; growth slow in month 1 |
| PR / Press | $100–$500 | $200 | Not viable in Mo 1–3 | Launch coverage drives initial demand; requires existing audience |

### Healthtech

| Channel | CAC Range | Median | Bootstrap (Mo 1–3) | Notes |
|---------|-----------|--------|-------------------|-------|
| Professional Content / SEO | $200–$800 | $400 | $0 spend, undefined CAC | Compliance content; long sales cycle (6–12 mo) |
| Pilot Programs | $500–$2,000 | $1,000 | Not viable in Mo 1–3 | High CAC but high conversion; essential for credibility |
| Professional Networks | $300–$800 | $500 | Undefined (membership/access) | Conferences, associations, referrals |
| LinkedIn (healthcare pros) | $200–$600 | $350 | ~$200–300 (founder-led) | Targeted professional audience |
| Healthcare Directories | $100–$400 | $200 | Undefined (listing lead time) | Niche but trusted by buyers; application process |
| Webinars / CME Events | $200–$500 | $300 | Not viable in Mo 1–3 | Education-led; compliance-friendly; requires planning time |
| Outbound Sales | $800–$3,000 | $1,500 | Not viable in Mo 1–3 | Enterprise health systems; long cycle; requires SDR team |

---

## Budget Tier Pruning Rules

The strategy generator uses these rules to filter out channels that are unrealistic for a given budget tier.

### Bootstrap (<$1K/mo)

**Include**: Channels with median CAC < $300 and organic/owned channels only
**Exclude**: Any paid channel with minimum spend >$500/mo, conferences, outbound sales, enterprise channels
**Max channels**: 3
**Guidance**: Focus on 1 primary owned channel + 1 community/network channel + 1 nurture channel

### Growth ($1K–$10K/mo)

**Include**: All Bootstrap channels + low-cost paid channels (retargeting, low-CPM social ads)
**Exclude**: Enterprise channels (conferences, outbound sales teams), channels with median CAC > $800
**Max channels**: 5
**Guidance**: Keep 2 proven organic channels, add 1–2 paid experiments, maintain nurture

### Scale ($10K+/mo)

**Include**: All channels
**Exclude**: None automatically; flag channels with CAC > 3x industry median for review
**Max channels**: 7
**Guidance**: Diversify across paid and organic. Allocate 60% to proven channels, 30% to experiments, 10% to brand

---

## LTV:CAC Benchmarks & Payback Period

Healthy unit economics require a strong LTV:CAC ratio and reasonable payback period. **Do not scale paid acquisition until LTV:CAC ≥ 3:1 and payback < 12 months.**

### LTV:CAC Targets by Business Model

| Model | Median LTV:CAC | Median Payback | Minimum Healthy | Notes |
|-------|----------------|----------------|-----------------|-------|
| B2B SaaS | 4:1 | 8.6 months | 3:1, <12 mo | ARR-based; annual contracts lower payback |
| B2C SaaS | 2.5:1 | 14 months | 2:1, <18 mo | Lower LTV from shorter contracts |
| DTC eCommerce | 2–3:1 | 4–6 months | 2:1, <12 mo | Average AOV $144–153; repeat rate 25–30% |
| Fintech | 5:1+ | 6–9 months | 4:1, <9 mo | High regulatory barriers = strong retention |
| Marketplace | 3–4:1 | 9–12 months | 3:1, <12 mo | Network effects improve LTV over time |
| Healthtech | 3–5:1 | 8–14 months | 3:1, <12 mo | Enterprise contracts extend payback |

**Definition**:
- **LTV (Lifetime Value)**: Gross profit per customer over their lifetime (subscription revenue, repeat purchases, or contracts)
- **CAC (Customer Acquisition Cost)**: Total acquisition spend ÷ customers acquired
- **Payback Period**: Months to recover initial CAC from customer profit (= CAC ÷ monthly profit per customer)

### Why These Matter

- **LTV:CAC < 2:1**: Unprofitable; stop paid acquisition immediately
- **LTV:CAC 2–3:1**: Breakeven to marginally profitable; organic focus only
- **LTV:CAC 3–4:1**: Can scale paid acquisition; typically 2–3x marketing spend returns
- **LTV:CAC > 5:1**: Strongly profitable; scale aggressively

---

## When to Scale Paid Acquisition

**Decision Framework**: Move to paid channels only when BOTH conditions are met:

1. **Unit economics proven** — LTV:CAC ≥ 3:1 AND payback period < 12 months (validated from organic cohort data, not projections)
2. **Organic channels plateauing** — Growth rate from owned/earned channels flattening (month-over-month growth < 15%)
3. **CAC within budget tier** — Median channel CAC < 50% of monthly budget (e.g., $500 budget → channels with $250 median CAC max)

**Validation checklist before first paid campaign**:
- [ ] Historical data: at least 50 customers acquired organically with LTV:CAC > 3:1
- [ ] Payback period < 12 months (verified, not projected)
- [ ] Audience segment identified and validated (not guessed)
- [ ] Landing page conversion rate > 2% (B2B) or > 3% (B2C)
- [ ] Email list > 100 subscribers for nurture sequence
- [ ] Product/market fit signals: NPS > 30, retention > 20% monthly

**Red flags — do NOT scale yet**:
- Payback period > 12 months
- Churn rate > 10% monthly (SaaS) or repeat purchase rate < 20% (DTC)
- CAC trending upward month-over-month
- Organic channels still growing > 20% MoM
- No clear product differentiation in target market

---

## How This Connects to Other Systems

- **Strategy Generator ([6A])**: `strategy-generator.ts` imports these benchmarks to validate channel selection and set realistic success criteria per phase
- **Framework Selection ([6A])**: Channels with median CAC below budget threshold get prioritized in the Bullseye framework ranking
- **Task Decomposer ([6B])**: Uses channel mix to estimate daily task distribution (e.g., 50% content, 30% social, 20% email)
- **Strategy Refiner ([9B])**: Compares actual CAC against benchmarks to flag over/under-performing channels
