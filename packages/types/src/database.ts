export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      dtn_approval_queue: {
        Row: {
          assigned_reviewer: string | null
          content: string
          created_at: string | null
          daily_task_id: string | null
          department_id: string | null
          id: string
          item_type: string
          metadata: Json | null
          org_id: string
          publish_config: Json | null
          reviewed_at: string | null
          reviewer_notes: string | null
          status: string
          submitted_by_id: string | null
          submitted_by_type: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_reviewer?: string | null
          content: string
          created_at?: string | null
          daily_task_id?: string | null
          department_id?: string | null
          id?: string
          item_type: string
          metadata?: Json | null
          org_id: string
          publish_config?: Json | null
          reviewed_at?: string | null
          reviewer_notes?: string | null
          status?: string
          submitted_by_id?: string | null
          submitted_by_type: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_reviewer?: string | null
          content?: string
          created_at?: string | null
          daily_task_id?: string | null
          department_id?: string | null
          id?: string
          item_type?: string
          metadata?: Json | null
          org_id?: string
          publish_config?: Json | null
          reviewed_at?: string | null
          reviewer_notes?: string | null
          status?: string
          submitted_by_id?: string | null
          submitted_by_type?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dtn_approval_queue_daily_task_id_fkey"
            columns: ["daily_task_id"]
            isOneToOne: false
            referencedRelation: "dtn_daily_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dtn_approval_queue_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "dtn_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dtn_approval_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dtn_blog_posts: {
        Row: {
          author: string | null
          campaign_id: string | null
          content: string
          created_at: string | null
          department_id: string | null
          excerpt: string | null
          id: string
          org_id: string
          published_at: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: string
          tags: string[] | null
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          author?: string | null
          campaign_id?: string | null
          content: string
          created_at?: string | null
          department_id?: string | null
          excerpt?: string | null
          id?: string
          org_id: string
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          author?: string | null
          campaign_id?: string | null
          content?: string
          created_at?: string | null
          department_id?: string | null
          excerpt?: string | null
          id?: string
          org_id?: string
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dtn_blog_posts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "dtn_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dtn_blog_posts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dtn_daily_tasks: {
        Row: {
          assigned_to: string | null
          campaign_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          department_id: string | null
          description: string | null
          executor_config: Json | null
          executor_type: string
          generated_by: string | null
          generation_context: Json | null
          id: string
          mktg_task_id: string | null
          org_id: string
          outcome_notes: string | null
          priority: string
          scheduled_date: string
          source_strategy: string | null
          status: string
          task_type: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          campaign_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          executor_config?: Json | null
          executor_type?: string
          generated_by?: string | null
          generation_context?: Json | null
          id?: string
          mktg_task_id?: string | null
          org_id: string
          outcome_notes?: string | null
          priority?: string
          scheduled_date?: string
          source_strategy?: string | null
          status?: string
          task_type?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          campaign_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          executor_config?: Json | null
          executor_type?: string
          generated_by?: string | null
          generation_context?: Json | null
          id?: string
          mktg_task_id?: string | null
          org_id?: string
          outcome_notes?: string | null
          priority?: string
          scheduled_date?: string
          source_strategy?: string | null
          status?: string
          task_type?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dtn_daily_tasks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "dtn_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dtn_daily_tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_daily_tasks_campaign"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mktg_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_daily_tasks_contact"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "mktg_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_daily_tasks_mktg_task"
            columns: ["mktg_task_id"]
            isOneToOne: false
            referencedRelation: "mktg_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      dtn_departments: {
        Row: {
          created_at: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          org_id: string
          slug: string
        }
        Insert: {
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          org_id: string
          slug: string
        }
        Update: {
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          org_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "dtn_departments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dtn_memberships: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          invited_email: string | null
          is_active: boolean | null
          org_id: string
          role: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          invited_email?: string | null
          is_active?: boolean | null
          org_id: string
          role?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          invited_email?: string | null
          is_active?: boolean | null
          org_id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dtn_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dtn_organizations: {
        Row: {
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          plan: string
          plan_status: string
          settings: Json | null
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          plan?: string
          plan_status?: string
          settings?: Json | null
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          plan?: string
          plan_status?: string
          settings?: Json | null
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      dtn_social_credentials: {
        Row: {
          access_token_secret_id: string | null
          account_name: string
          created_at: string | null
          credentials_secret_id: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          org_id: string
          platform: string
          refresh_token_secret_id: string | null
          share_with_automations: boolean | null
          share_with_freelancers: boolean | null
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          access_token_secret_id?: string | null
          account_name: string
          created_at?: string | null
          credentials_secret_id?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          org_id: string
          platform: string
          refresh_token_secret_id?: string | null
          share_with_automations?: boolean | null
          share_with_freelancers?: boolean | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token_secret_id?: string | null
          account_name?: string
          created_at?: string | null
          credentials_secret_id?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          org_id?: string
          platform?: string
          refresh_token_secret_id?: string | null
          share_with_automations?: boolean | null
          share_with_freelancers?: boolean | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dtn_social_credentials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dtn_stripe_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          processed_at: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id: string
          processed_at?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          processed_at?: string | null
        }
        Relationships: []
      }
      dtn_subscriptions: {
        Row: {
          cancel_at: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          org_id: string
          plan: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
        }
        Insert: {
          cancel_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          org_id: string
          plan: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
        }
        Update: {
          cancel_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          org_id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dtn_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mktg_campaigns: {
        Row: {
          budget: number | null
          campaign_type: string
          created_at: string | null
          description: string | null
          end_date: string | null
          id: string
          kpis: Json | null
          name: string
          org_id: string
          spend: number | null
          start_date: string | null
          status: string | null
          target_persona: string | null
          target_tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          budget?: number | null
          campaign_type: string
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          kpis?: Json | null
          name: string
          org_id: string
          spend?: number | null
          start_date?: string | null
          status?: string | null
          target_persona?: string | null
          target_tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          budget?: number | null
          campaign_type?: string
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          kpis?: Json | null
          name?: string
          org_id?: string
          spend?: number | null
          start_date?: string | null
          status?: string | null
          target_persona?: string | null
          target_tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mktg_campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mktg_competitors: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          last_analyzed: string | null
          latest_moves: string | null
          name: string
          notes: string | null
          org_id: string
          our_advantage: string | null
          pricing: string | null
          strengths: string[] | null
          target_market: string | null
          threat_level: string | null
          updated_at: string | null
          weaknesses: string[] | null
          website: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          last_analyzed?: string | null
          latest_moves?: string | null
          name: string
          notes?: string | null
          org_id: string
          our_advantage?: string | null
          pricing?: string | null
          strengths?: string[] | null
          target_market?: string | null
          threat_level?: string | null
          updated_at?: string | null
          weaknesses?: string[] | null
          website?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          last_analyzed?: string | null
          latest_moves?: string | null
          name?: string
          notes?: string | null
          org_id?: string
          our_advantage?: string | null
          pricing?: string | null
          strengths?: string[] | null
          target_market?: string | null
          threat_level?: string | null
          updated_at?: string | null
          weaknesses?: string[] | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mktg_competitors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mktg_contacts: {
        Row: {
          company: string | null
          contact_type: string
          created_at: string | null
          email: string | null
          first_name: string
          id: string
          last_engaged: string | null
          last_name: string | null
          lead_score: number | null
          lifecycle_stage: string | null
          location: string | null
          notes: string | null
          org_id: string
          owner_id: string | null
          persona: string | null
          phone: string | null
          source: string | null
          status: string
          tags: string[] | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          company?: string | null
          contact_type?: string
          created_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_engaged?: string | null
          last_name?: string | null
          lead_score?: number | null
          lifecycle_stage?: string | null
          location?: string | null
          notes?: string | null
          org_id: string
          owner_id?: string | null
          persona?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          company?: string | null
          contact_type?: string
          created_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_engaged?: string | null
          last_name?: string | null
          lead_score?: number | null
          lifecycle_stage?: string | null
          location?: string | null
          notes?: string | null
          org_id?: string
          owner_id?: string | null
          persona?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mktg_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mktg_freelancers: {
        Row: {
          available: boolean | null
          avg_rating: number | null
          clearance_level: string | null
          created_at: string | null
          currency: string | null
          email: string
          engagement_type: string | null
          experience_level: string | null
          hourly_rate: number | null
          id: string
          name: string
          nda_signed: boolean | null
          notes: string | null
          org_id: string
          portfolio_url: string | null
          reliability_score: number | null
          skills: string[] | null
          specialties: string[] | null
          tasks_completed: number | null
          updated_at: string | null
        }
        Insert: {
          available?: boolean | null
          avg_rating?: number | null
          clearance_level?: string | null
          created_at?: string | null
          currency?: string | null
          email: string
          engagement_type?: string | null
          experience_level?: string | null
          hourly_rate?: number | null
          id?: string
          name: string
          nda_signed?: boolean | null
          notes?: string | null
          org_id: string
          portfolio_url?: string | null
          reliability_score?: number | null
          skills?: string[] | null
          specialties?: string[] | null
          tasks_completed?: number | null
          updated_at?: string | null
        }
        Update: {
          available?: boolean | null
          avg_rating?: number | null
          clearance_level?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string
          engagement_type?: string | null
          experience_level?: string | null
          hourly_rate?: number | null
          id?: string
          name?: string
          nda_signed?: boolean | null
          notes?: string | null
          org_id?: string
          portfolio_url?: string | null
          reliability_score?: number | null
          skills?: string[] | null
          specialties?: string[] | null
          tasks_completed?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mktg_freelancers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mktg_insights: {
        Row: {
          action_taken: string | null
          created_at: string | null
          description: string
          evidence: string | null
          id: string
          impact: string | null
          insight_type: string
          org_id: string
          source: string | null
          tags: string[] | null
          title: string
        }
        Insert: {
          action_taken?: string | null
          created_at?: string | null
          description: string
          evidence?: string | null
          id?: string
          impact?: string | null
          insight_type: string
          org_id: string
          source?: string | null
          tags?: string[] | null
          title: string
        }
        Update: {
          action_taken?: string | null
          created_at?: string | null
          description?: string
          evidence?: string | null
          id?: string
          impact?: string | null
          insight_type?: string
          org_id?: string
          source?: string | null
          tags?: string[] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "mktg_insights_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mktg_outreach_log: {
        Row: {
          campaign_id: string | null
          channel: string
          contact_id: string
          content: string | null
          created_at: string | null
          direction: string
          id: string
          notes: string | null
          org_id: string
          persona_used: string | null
          response_at: string | null
          sent_at: string | null
          status: string | null
          subject: string | null
        }
        Insert: {
          campaign_id?: string | null
          channel: string
          contact_id: string
          content?: string | null
          created_at?: string | null
          direction?: string
          id?: string
          notes?: string | null
          org_id: string
          persona_used?: string | null
          response_at?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
        }
        Update: {
          campaign_id?: string | null
          channel?: string
          contact_id?: string
          content?: string | null
          created_at?: string | null
          direction?: string
          id?: string
          notes?: string | null
          org_id?: string
          persona_used?: string | null
          response_at?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mktg_outreach_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "mktg_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mktg_outreach_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mktg_strategy_docs: {
        Row: {
          change_summary: string | null
          changed_by: string | null
          content: string
          created_at: string | null
          doc_type: string
          embedding: string | null
          id: string
          is_active: boolean | null
          org_id: string
          previous_version_id: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          version: number | null
        }
        Insert: {
          change_summary?: string | null
          changed_by?: string | null
          content: string
          created_at?: string | null
          doc_type: string
          embedding?: string | null
          id?: string
          is_active?: boolean | null
          org_id: string
          previous_version_id?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          change_summary?: string | null
          changed_by?: string | null
          content?: string
          created_at?: string | null
          doc_type?: string
          embedding?: string | null
          id?: string
          is_active?: boolean | null
          org_id?: string
          previous_version_id?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mktg_strategy_docs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mktg_strategy_docs_previous_version_id_fkey"
            columns: ["previous_version_id"]
            isOneToOne: false
            referencedRelation: "mktg_strategy_docs"
            referencedColumns: ["id"]
          },
        ]
      }
      mktg_task_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          includes_strategy_context: boolean | null
          org_id: string
          sender_id: string | null
          sender_type: string
          task_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          includes_strategy_context?: boolean | null
          org_id: string
          sender_id?: string | null
          sender_type: string
          task_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          includes_strategy_context?: boolean | null
          org_id?: string
          sender_id?: string | null
          sender_type?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mktg_task_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mktg_task_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "mktg_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      mktg_task_submissions: {
        Row: {
          ai_review: string | null
          content: string | null
          file_urls: string[] | null
          freelancer_id: string
          id: string
          notes: string | null
          org_id: string
          rating: number | null
          reviewed_at: string | null
          reviewer_notes: string | null
          status: string | null
          submitted_at: string | null
          task_id: string
        }
        Insert: {
          ai_review?: string | null
          content?: string | null
          file_urls?: string[] | null
          freelancer_id: string
          id?: string
          notes?: string | null
          org_id: string
          rating?: number | null
          reviewed_at?: string | null
          reviewer_notes?: string | null
          status?: string | null
          submitted_at?: string | null
          task_id: string
        }
        Update: {
          ai_review?: string | null
          content?: string | null
          file_urls?: string[] | null
          freelancer_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          rating?: number | null
          reviewed_at?: string | null
          reviewer_notes?: string | null
          status?: string | null
          submitted_at?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mktg_task_submissions_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "mktg_freelancer_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mktg_task_submissions_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "mktg_freelancers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mktg_task_submissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mktg_task_submissions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "mktg_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      mktg_tasks: {
        Row: {
          assigned_to: string | null
          brand_guidelines: string | null
          brief: string
          budget: number | null
          campaign_id: string | null
          claimed_at: string | null
          completed_at: string | null
          created_at: string | null
          deliverables: string | null
          description: string
          due_date: string | null
          engagement_type: string | null
          generated_by_ai: boolean | null
          id: string
          min_experience: string | null
          org_id: string
          payment_type: string | null
          priority: string | null
          reference_materials: string | null
          required_skills: string[] | null
          source_strategy: string | null
          status: string | null
          task_type: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          brand_guidelines?: string | null
          brief: string
          budget?: number | null
          campaign_id?: string | null
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          deliverables?: string | null
          description: string
          due_date?: string | null
          engagement_type?: string | null
          generated_by_ai?: boolean | null
          id?: string
          min_experience?: string | null
          org_id: string
          payment_type?: string | null
          priority?: string | null
          reference_materials?: string | null
          required_skills?: string[] | null
          source_strategy?: string | null
          status?: string | null
          task_type: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          brand_guidelines?: string | null
          brief?: string
          budget?: number | null
          campaign_id?: string | null
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          deliverables?: string | null
          description?: string
          due_date?: string | null
          engagement_type?: string | null
          generated_by_ai?: boolean | null
          id?: string
          min_experience?: string | null
          org_id?: string
          payment_type?: string | null
          priority?: string | null
          reference_materials?: string | null
          required_skills?: string[] | null
          source_strategy?: string | null
          status?: string | null
          task_type?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mktg_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "mktg_freelancer_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mktg_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "mktg_freelancers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mktg_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mktg_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mktg_tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mktg_weekly_reviews: {
        Row: {
          ai_summary: string | null
          challenges: string[] | null
          created_at: string | null
          id: string
          learnings: string[] | null
          metrics: Json | null
          next_week_priorities: string[] | null
          org_id: string
          strategy_changes: string | null
          week_end: string
          week_start: string
          wins: string[] | null
        }
        Insert: {
          ai_summary?: string | null
          challenges?: string[] | null
          created_at?: string | null
          id?: string
          learnings?: string[] | null
          metrics?: Json | null
          next_week_priorities?: string[] | null
          org_id: string
          strategy_changes?: string | null
          week_end: string
          week_start: string
          wins?: string[] | null
        }
        Update: {
          ai_summary?: string | null
          challenges?: string[] | null
          created_at?: string | null
          id?: string
          learnings?: string[] | null
          metrics?: Json | null
          next_week_priorities?: string[] | null
          org_id?: string
          strategy_changes?: string | null
          week_end?: string
          week_start?: string
          wins?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "mktg_weekly_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          email: string
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email: string
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      dtn_daily_tasks_summary: {
        Row: {
          completed: number | null
          executor_type: string | null
          failed: number | null
          in_progress: number | null
          org_id: string | null
          pending: number | null
          scheduled_date: string | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dtn_daily_tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mktg_freelancer_leaderboard: {
        Row: {
          active_tasks: number | null
          avg_rating: number | null
          completed_tasks: number | null
          hourly_rate: number | null
          id: string | null
          name: string | null
          org_id: string | null
          reliability_score: number | null
          skills: string[] | null
          tasks_completed: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mktg_freelancers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mktg_pipeline_summary: {
        Row: {
          avg_lead_score: number | null
          contact_type: string | null
          count: number | null
          engaged_last_30d: number | null
          engaged_last_7d: number | null
          lifecycle_stage: string | null
          org_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mktg_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "dtn_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_and_accept_invite: {
        Args: {
          p_membership_id: string
          p_user_email: string
          p_user_id: string
        }
        Returns: {
          accepted_at: string | null
          created_at: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          invited_email: string | null
          is_active: boolean | null
          org_id: string
          role: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "dtn_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_and_insert_invite: {
        Args: {
          p_email: string
          p_invited_by: string
          p_org_id: string
          p_role: string
        }
        Returns: {
          accepted_at: string | null
          created_at: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          invited_email: string | null
          is_active: boolean | null
          org_id: string
          role: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "dtn_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_user_org_ids: { Args: never; Returns: string[] }
      invite_team_member: {
        Args: {
          p_invited_by: string
          p_invited_email: string
          p_org_id: string
          p_role: string
        }
        Returns: string
      }
      review_approval_item: {
        Args: {
          p_approval_id: string
          p_org_id: string
          p_reviewer_id: string
          p_reviewer_notes?: string
          p_status: string
        }
        Returns: Json
      }
      update_strategy_doc: {
        Args: {
          p_change_summary?: string
          p_changed_by?: string
          p_content: string
          p_doc_type: string
          p_org_id: string
          p_tags?: string[]
          p_title: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
