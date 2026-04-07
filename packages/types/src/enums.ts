// ─── Task Enums ───────────────────────────────────────────────

export const TaskStatus = {
  Pending: "pending",
  InProgress: "in_progress",
  WaitingApproval: "waiting_approval",
  Completed: "completed",
  Skipped: "skipped",
  Failed: "failed",
  CarriedOver: "carried_over",
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const Priority = {
  Low: "low",
  Medium: "medium",
  High: "high",
  Urgent: "urgent",
} as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

export const TaskType = {
  Action: "action",
  Review: "review",
  Create: "create",
  Outreach: "outreach",
  Analysis: "analysis",
} as const;
export type TaskType = (typeof TaskType)[keyof typeof TaskType];

export const ExecutorType = {
  Self: "self",
  N8n: "n8n",
  ClaudeApi: "claude_api",
  Freelancer: "freelancer",
} as const;
export type ExecutorType = (typeof ExecutorType)[keyof typeof ExecutorType];

export const GeneratedBy = {
  User: "user",
  Claude: "claude",
  System: "system",
} as const;
export type GeneratedBy = (typeof GeneratedBy)[keyof typeof GeneratedBy];

// ─── Contact / CRM Enums ─────────────────────────────────────

export const ContactType = {
  Lead: "lead",
  Prospect: "prospect",
  Customer: "customer",
  Partner: "partner",
  Therapist: "therapist",
  Influencer: "influencer",
  Media: "media",
  Other: "other",
} as const;
export type ContactType = (typeof ContactType)[keyof typeof ContactType];

export const ContactStatus = {
  Active: "active",
  Inactive: "inactive",
  DoNotContact: "do_not_contact",
  Churned: "churned",
} as const;
export type ContactStatus = (typeof ContactStatus)[keyof typeof ContactStatus];

export const LifecycleStage = {
  Awareness: "awareness",
  Consideration: "consideration",
  Decision: "decision",
  Customer: "customer",
  Advocate: "advocate",
} as const;
export type LifecycleStage = (typeof LifecycleStage)[keyof typeof LifecycleStage];

export const OutreachChannel = {
  Email: "email",
  LinkedIn: "linkedin",
  Reddit: "reddit",
  Twitter: "twitter",
  Phone: "phone",
  InPerson: "in_person",
  TikTok: "tiktok",
  Instagram: "instagram",
  Other: "other",
} as const;
export type OutreachChannel = (typeof OutreachChannel)[keyof typeof OutreachChannel];

export const OutreachDirection = {
  Outbound: "outbound",
  Inbound: "inbound",
} as const;
export type OutreachDirection = (typeof OutreachDirection)[keyof typeof OutreachDirection];

export const OutreachStatus = {
  Drafted: "drafted",
  Sent: "sent",
  Delivered: "delivered",
  Opened: "opened",
  Replied: "replied",
  Bounced: "bounced",
  NoResponse: "no_response",
} as const;
export type OutreachStatus = (typeof OutreachStatus)[keyof typeof OutreachStatus];

// ─── Strategy Enums ───────────────────────────────────────────

export const DocType = {
  MasterStrategy: "master_strategy",
  CompetitiveAnalysis: "competitive_analysis",
  ValueProps: "value_props",
  BrandVoice: "brand_voice",
  Personas: "personas",
  Positioning: "positioning",
  ContentCalendar: "content_calendar",
  ChannelStrategy: "channel_strategy",
  PricingStrategy: "pricing_strategy",
  Playbook: "playbook",
  Other: "other",
} as const;
export type DocType = (typeof DocType)[keyof typeof DocType];

// ─── Approval Enums ──────────────────────────────────────────

export const ApprovalItemType = {
  SocialPost: "social_post",
  BlogPost: "blog_post",
  EmailDraft: "email_draft",
  TaskSubmission: "task_submission",
  StrategyChange: "strategy_change",
} as const;
export type ApprovalItemType = (typeof ApprovalItemType)[keyof typeof ApprovalItemType];

export const ApprovalStatus = {
  Pending: "pending",
  Approved: "approved",
  Rejected: "rejected",
  RevisionRequested: "revision_requested",
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const SubmittedByType = {
  Freelancer: "freelancer",
  N8n: "n8n",
  ClaudeApi: "claude_api",
  Member: "member",
} as const;
export type SubmittedByType = (typeof SubmittedByType)[keyof typeof SubmittedByType];

// ─── Campaign Enums ──────────────────────────────────────────

export const CampaignType = {
  EmailSequence: "email_sequence",
  ContentSeries: "content_series",
  SocialCampaign: "social_campaign",
  Launch: "launch",
  Partnership: "partnership",
  Event: "event",
  Other: "other",
} as const;
export type CampaignType = (typeof CampaignType)[keyof typeof CampaignType];

// ─── Organization Profile Enums ─────────────────────────────

export const Industry = {
  B2bSaas: "b2b_saas",
  DevTools: "dev_tools",
  DtcEcommerce: "dtc_ecommerce",
  Fintech: "fintech",
  Marketplace: "marketplace",
  Healthtech: "healthtech",
  Other: "other",
} as const;
export type Industry = (typeof Industry)[keyof typeof Industry];

export const BudgetTier = {
  Bootstrap: "bootstrap",
  Growth: "growth",
  Scale: "scale",
} as const;
export type BudgetTier = (typeof BudgetTier)[keyof typeof BudgetTier];

export const Stage = {
  Idea: "idea",
  Early: "early",
  Growth: "growth",
  Scaling: "scaling",
} as const;
export type Stage = (typeof Stage)[keyof typeof Stage];

export const GrowthMotion = {
  ProductLed: "product_led",
  SalesLed: "sales_led",
  ContentLed: "content_led",
  CommunityLed: "community_led",
  PaidAcquisition: "paid_acquisition",
} as const;
export type GrowthMotion = (typeof GrowthMotion)[keyof typeof GrowthMotion];

// ─── Marketplace Enums ──────────────────────────────────────

export const MarketplaceTaskStatus = {
  Draft: "draft",
  Open: "open",
  Claimed: "claimed",
  InProgress: "in_progress",
  Review: "review",
  Revision: "revision",
  Completed: "completed",
  Cancelled: "cancelled",
} as const;
export type MarketplaceTaskStatus = (typeof MarketplaceTaskStatus)[keyof typeof MarketplaceTaskStatus];

export const SubmissionStatus = {
  Submitted: "submitted",
  UnderReview: "under_review",
  Approved: "approved",
  RevisionRequested: "revision_requested",
  Rejected: "rejected",
} as const;
export type SubmissionStatus = (typeof SubmissionStatus)[keyof typeof SubmissionStatus];

export const EngagementType = {
  Freelance: "freelance",
  WorkToHire: "work_to_hire",
} as const;
export type EngagementType = (typeof EngagementType)[keyof typeof EngagementType];

export const PaymentType = {
  Fixed: "fixed",
  Hourly: "hourly",
  Milestone: "milestone",
} as const;
export type PaymentType = (typeof PaymentType)[keyof typeof PaymentType];

export const MessageSenderType = {
  Owner: "owner",
  Freelancer: "freelancer",
  Ai: "ai",
} as const;
export type MessageSenderType = (typeof MessageSenderType)[keyof typeof MessageSenderType];

// ─── Transition Source ──────────────────────────────────────

export const TransitionSource = {
  WebUi: "web_ui",
  SlackBot: "slack_bot",
  Mcp: "mcp",
  Cron: "cron",
  Agent: "agent",
  Api: "api",
} as const;
export type TransitionSource = (typeof TransitionSource)[keyof typeof TransitionSource];

// ─── Membership Enums ────────────────────────────────────────

export const MemberRole = {
  Owner: "owner",
  Admin: "admin",
  Member: "member",
} as const;
export type MemberRole = (typeof MemberRole)[keyof typeof MemberRole];
