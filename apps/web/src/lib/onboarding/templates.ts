import type { Industry } from "@dothesenow/types";

interface StrategyTemplate {
  title: string;
  content: string;
}

const B2B_SAAS_TEMPLATE: StrategyTemplate = {
  title: "B2B SaaS Marketing Strategy",
  content: `# B2B SaaS Marketing Strategy — Bootstrap

## Goals
- Establish product-market fit signal through organic acquisition
- Build a repeatable inbound pipeline with <$1K/mo spend
- Achieve first 100 users through content and community

## Audience
- **Primary**: Technical decision-makers (CTOs, VP Eng, senior devs) at startups (10–100 employees)
- **Secondary**: Non-technical founders evaluating tools for their teams
- **Pain points**: Manual processes, tool sprawl, lack of visibility into team output

## Channels
1. **Content/SEO** (primary) — Long-tail blog posts targeting problem-aware searches
2. **LinkedIn** — Founder-led thought leadership, 3x/week posting cadence
3. **Product-Led Growth** — Free tier with viral loops (invite teammates, share reports)

## Content Pillars
- How-to guides solving specific workflow pain points
- Comparison posts (vs. manual process, vs. incumbent tools)
- Customer stories / case studies (even early design partners)

## Strategy
- **Months 1–2**: Publish 8 SEO-optimized articles targeting long-tail keywords. Set up LinkedIn posting cadence. Launch free tier with in-product sharing.
- **Months 3–4**: Double down on top-performing content topics. Start building an email list from blog traffic. Run first customer interview series for case study content.
- **Months 5–6**: Introduce referral program. Guest post on 2–3 industry blogs. Evaluate which channel drives highest-quality signups for potential paid investment.

## Experiment Backlog (ICE Scored)

| Experiment | Impact | Confidence | Ease | ICE |
|-----------|--------|------------|------|-----|
| Publish 8 long-tail SEO articles | 8 | 6 | 7 | 21 |
| Founder LinkedIn posting 3x/week | 7 | 7 | 8 | 22 |
| Free tier with team invite loop | 9 | 5 | 5 | 19 |
| Comparison landing pages (vs. competitors) | 7 | 6 | 6 | 19 |
| Email drip from blog subscribers | 6 | 7 | 7 | 20 |
| Customer case study series | 7 | 5 | 6 | 18 |
| Guest posts on industry blogs | 5 | 4 | 5 | 14 |
| Referral program (invite = extended trial) | 8 | 4 | 4 | 16 |`,
};

const DEV_TOOLS_TEMPLATE: StrategyTemplate = {
  title: "Developer Tools Marketing Strategy",
  content: `# Developer Tools Marketing Strategy — Bootstrap

## Goals
- Build developer trust through documentation and open-source presence
- Grow an engaged community of early adopters and contributors
- Achieve first 100 active developers through organic, community-driven channels

## Audience
- **Primary**: Individual developers and small-team leads evaluating tools for their stack
- **Secondary**: DevRel/platform engineers at mid-stage startups building internal tooling
- **Pain points**: Poor documentation, vendor lock-in, opaque pricing, missing integrations

## Channels
1. **Documentation/Tutorials** (primary) — Comprehensive docs, quickstarts, and integration guides
2. **Community** — Discord/Slack community, GitHub discussions, Stack Overflow presence
3. **Open Source** — Public repos, example projects, community contributions

## Content Pillars
- Getting-started guides and integration tutorials
- Architecture deep-dives and technical blog posts
- Changelog and transparency updates (build in public)

## Strategy
- **Months 1–2**: Ship comprehensive documentation site with quickstart guides. Open a Discord/Slack community. Publish first 4 technical blog posts.
- **Months 3–4**: Create integration guides for top 5 requested tools. Start "build in public" changelog. Engage in relevant subreddits and Hacker News discussions.
- **Months 5–6**: Launch example project templates / starter kits. Run first community office hours. Evaluate sponsoring a small dev podcast or newsletter.

## Experiment Backlog (ICE Scored)

| Experiment | Impact | Confidence | Ease | ICE |
|-----------|--------|------------|------|-----|
| Ship docs site with 5 quickstart guides | 9 | 8 | 6 | 23 |
| Launch Discord/Slack community | 7 | 7 | 8 | 22 |
| Publish 4 technical deep-dive blog posts | 7 | 6 | 7 | 20 |
| Integration guides for top 5 tools | 8 | 6 | 5 | 19 |
| "Build in public" weekly changelog | 6 | 7 | 8 | 21 |
| Example project starter kits on GitHub | 8 | 5 | 5 | 18 |
| Engage HN / Reddit / dev forums weekly | 6 | 5 | 7 | 18 |
| Community office hours (bi-weekly) | 5 | 5 | 7 | 17 |`,
};

const DTC_ECOMMERCE_TEMPLATE: StrategyTemplate = {
  title: "DTC eCommerce Marketing Strategy",
  content: `# DTC eCommerce Marketing Strategy — Bootstrap

## Goals
- Build a direct relationship with customers through owned channels (email, SMS)
- Drive first 100 orders through targeted social and content marketing
- Establish a repeatable acquisition loop with <$1K/mo spend

## Audience
- **Primary**: End consumers aged 25–45 who shop online and follow brands on social media
- **Secondary**: Gift buyers and trend-conscious shoppers discovering new brands via Instagram/TikTok
- **Pain points**: Decision fatigue, lack of trust in new brands, desire for authentic brand stories

## Channels
1. **Email/SMS** (primary) — Welcome series, abandoned cart, post-purchase flows
2. **Meta Ads** — Low-budget retargeting and lookalike campaigns on Instagram/Facebook
3. **Organic Social** — Instagram Reels, TikTok content, UGC reposts

## Content Pillars
- Behind-the-scenes / founder story content
- Product education and use-case demonstrations
- Customer testimonials and unboxing UGC

## Strategy
- **Months 1–2**: Set up email capture (popup + footer form). Build 3-email welcome series and abandoned cart flow. Post 3x/week on Instagram with product + lifestyle content.
- **Months 3–4**: Launch first Meta retargeting campaign ($5–10/day). Start SMS list with exclusive offers. Encourage and repost UGC with branded hashtag.
- **Months 5–6**: Build post-purchase email flow (review request → cross-sell). Test TikTok organic content. Evaluate first micro-influencer partnership (product-for-post).

## Experiment Backlog (ICE Scored)

| Experiment | Impact | Confidence | Ease | ICE |
|-----------|--------|------------|------|-----|
| Email welcome series (3 emails) | 8 | 8 | 7 | 23 |
| Abandoned cart email flow | 9 | 8 | 6 | 23 |
| Instagram posting 3x/week | 6 | 6 | 8 | 20 |
| Meta retargeting campaign ($5–10/day) | 8 | 6 | 6 | 20 |
| SMS list with exclusive launch offer | 7 | 5 | 6 | 18 |
| UGC collection + branded hashtag | 6 | 5 | 7 | 18 |
| Post-purchase review + cross-sell flow | 7 | 6 | 5 | 18 |
| Micro-influencer product seeding (3–5) | 7 | 4 | 5 | 16 |`,
};

const TEMPLATE_MAP: Partial<Record<Industry, StrategyTemplate>> = {
  b2b_saas: B2B_SAAS_TEMPLATE,
  dev_tools: DEV_TOOLS_TEMPLATE,
  dtc_ecommerce: DTC_ECOMMERCE_TEMPLATE,
};

/**
 * Select a strategy template by industry.
 * Budget tier does not restrict selection — the bootstrap template
 * works as a strategy skeleton for all tiers.
 * Returns null for industries without a template.
 */
export function selectTemplate(
  industry: Industry,
): StrategyTemplate | null {
  return TEMPLATE_MAP[industry] ?? null;
}
