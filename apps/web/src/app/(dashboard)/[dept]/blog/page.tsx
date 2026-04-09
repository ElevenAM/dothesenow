import { getBlogPosts } from "@/lib/blog/actions";
import { BlogPageClient } from "@/components/blog/blog-page-client";

export default async function BlogPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const posts = await getBlogPosts(dept);

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
