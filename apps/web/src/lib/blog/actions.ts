"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getAuthenticatedOrgContext } from "@/lib/auth-helpers";
import { getDepartmentId } from "@/lib/departments";
import {
  getBlogPostsForOrg,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
} from "@dothesenow/queries";
import type { BlogPost, CreateBlogPostInput, UpdateBlogPostInput } from "@dothesenow/queries";

export type { BlogPost } from "@dothesenow/queries";

export async function getBlogPosts(
  deptSlug: string,
  filters?: { status?: string; search?: string },
): Promise<BlogPost[]> {
  const { ctx } = await getAuthenticatedOrgContext();
  return getBlogPostsForOrg(ctx, filters);
}

type CreateResult = { success: true; post: BlogPost } | { error: string };

export async function createPost(
  deptSlug: string,
  input: CreateBlogPostInput,
): Promise<CreateResult> {
  try {
    const { auth, ctx } = await getAuthenticatedOrgContext();
    const departmentId = await getDepartmentId(ctx.orgId, deptSlug);

    const slug = input.slug || input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const post = await createBlogPost(ctx, {
      ...input,
      slug,
      department_id: departmentId,
      user_id: auth.user.id,
    });

    revalidateTag("blog", "max");
    revalidatePath(`/${deptSlug}/blog`);
    return { success: true, post };
  } catch (err) {
    console.error("Failed to create blog post:", err);
    return { error: "Failed to create post. Please try again." };
  }
}

type UpdateResult = { success: true; post: BlogPost } | { error: string };

export async function updatePost(
  deptSlug: string,
  postId: string,
  updates: UpdateBlogPostInput,
): Promise<UpdateResult> {
  try {
    const { ctx } = await getAuthenticatedOrgContext();

    const post = await updateBlogPost(ctx, postId, updates);
    revalidateTag("blog", "max");
    revalidatePath(`/${deptSlug}/blog`);
    return { success: true, post };
  } catch (err) {
    console.error("Failed to update blog post:", err);
    return { error: "Failed to update post. Please try again." };
  }
}

export async function deletePost(
  deptSlug: string,
  postId: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const { ctx } = await getAuthenticatedOrgContext();
    await deleteBlogPost(ctx, postId);
    revalidateTag("blog", "max");
    revalidatePath(`/${deptSlug}/blog`);
    return { success: true };
  } catch (err) {
    console.error("Failed to delete blog post:", err);
    return { error: "Failed to delete post. Please try again." };
  }
}

export async function publishPost(
  deptSlug: string,
  postId: string,
): Promise<UpdateResult> {
  return updatePost(deptSlug, postId, {
    status: "published",
    published_at: new Date().toISOString(),
  });
}
