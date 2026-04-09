import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestContext } from "@/lib/auth-helpers";
import { getBlogPostsForOrg } from "@dothesenow/queries";
import { BlogPageClient } from "@/components/blog/blog-page-client";

const getCachedBlogPosts = unstable_cache(
  async (orgId: string) => {
    const admin = createAdminClient();
    const ctx = { client: admin, orgId };
    return getBlogPostsForOrg(ctx);
  },
  ["blog"],
  { revalidate: 60, tags: ["blog"] },
);

export default async function BlogPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const { membership } = await getRequestContext();
  const posts = await getCachedBlogPosts(membership.orgId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Blog Posts</h1>
        <p className="mt-1 text-sm text-[var(--fgColor-muted)]">
          Create and manage blog content for your marketing channels.
        </p>
      </div>

      <BlogPageClient posts={posts} dept={dept} />
    </div>
  );
}
