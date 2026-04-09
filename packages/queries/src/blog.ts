import type { OrgContext } from "./context.js";
import { QueryError } from "./errors.js";

const TABLE = "dtn_blog_posts";

export interface BlogPost {
  id: string;
  org_id: string;
  department_id: string | null;
  user_id: string | null;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  status: string;
  author: string | null;
  tags: string[];
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  campaign_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBlogPostInput {
  title: string;
  slug: string;
  content: string;
  excerpt?: string | null;
  status?: string;
  author?: string | null;
  tags?: string[];
  seo_title?: string | null;
  seo_description?: string | null;
  department_id?: string | null;
}

export interface UpdateBlogPostInput {
  title?: string;
  slug?: string;
  content?: string;
  excerpt?: string | null;
  status?: string;
  author?: string | null;
  tags?: string[];
  seo_title?: string | null;
  seo_description?: string | null;
  published_at?: string | null;
}

export async function getBlogPostsForOrg(
  ctx: OrgContext,
  filters?: { status?: string; search?: string },
): Promise<BlogPost[]> {
  let query = ctx.client
    .from(TABLE)
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("updated_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.search) {
    query = query.ilike("title", `%${filters.search}%`);
  }

  const { data, error } = await query;
  if (error) throw new QueryError(error.message, TABLE, "getBlogPostsForOrg", ctx.orgId, error);
  return (data ?? []) as BlogPost[];
}

export async function getBlogPostById(
  ctx: OrgContext,
  postId: string,
): Promise<BlogPost | null> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("id", postId)
    .maybeSingle();

  if (error) throw new QueryError(error.message, TABLE, "getBlogPostById", ctx.orgId, error);
  return data as BlogPost | null;
}

export async function createBlogPost(
  ctx: OrgContext,
  input: CreateBlogPostInput & { user_id?: string },
): Promise<BlogPost> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .insert({
      org_id: ctx.orgId,
      ...input,
    })
    .select()
    .single();

  if (error) throw new QueryError(error.message, TABLE, "createBlogPost", ctx.orgId, error);
  return data as BlogPost;
}

export async function updateBlogPost(
  ctx: OrgContext,
  postId: string,
  updates: UpdateBlogPostInput,
): Promise<BlogPost> {
  const { data, error } = await ctx.client
    .from(TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("org_id", ctx.orgId)
    .select()
    .single();

  if (error) throw new QueryError(error.message, TABLE, "updateBlogPost", ctx.orgId, error);
  return data as BlogPost;
}

export async function deleteBlogPost(
  ctx: OrgContext,
  postId: string,
): Promise<void> {
  const { error } = await ctx.client
    .from(TABLE)
    .delete()
    .eq("id", postId)
    .eq("org_id", ctx.orgId);

  if (error) throw new QueryError(error.message, TABLE, "deleteBlogPost", ctx.orgId, error);
}
