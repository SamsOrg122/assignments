import { ProjectClient } from "@/components/projects/ProjectClient";

/**
 * A project, as a route.
 *
 * The editor is a client component in `@/components/projects`, because a
 * `"use client"` file cannot export `generateStaticParams` and this route
 * needs one. See `chat/[[...channelId]]/page.tsx` for the long version.
 *
 * The one thing worth knowing here is the underscore. The packed-in build
 * writes a single envelope, `p/_.html`, and `browser/lib/app-schema.js`
 * answers every `/p/<id>` with it; the page reads the real id from the
 * address. The name is not arbitrary — it is the one that handler looks for,
 * and changing it here breaks opening a project inside the browser while
 * leaving the website perfectly fine. That is the kind of silence worth a
 * comment.
 */
export function generateStaticParams() {
  return [{ projectId: "_" }];
}

export default function ProjectPage() {
  return <ProjectClient />;
}
