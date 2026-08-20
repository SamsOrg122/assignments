"use client";

/**
 * The commons — where people on this deployment share with each other.
 *
 * Three kinds of post: ideas (words), designs (a project's look, usable on
 * your own documents in two clicks), templates (a project's structure,
 * usable as a starting point). Inspired by the way itch.io pages make the
 * *presentation* of work shareable, not just the work.
 *
 * Without a database there is nobody to share with, so the page degrades
 * honestly: the built-in backdrops become a starter gallery — still usable,
 * still two clicks onto your own document — and posting explains what it
 * needs instead of pretending.
 *
 * Everything from other people is treated as hostile data: titles and
 * bodies render as text, a design goes through `sanitizeLook`, a template
 * through the same validator a share link does — at the moment of use,
 * never at render.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/shell/TopBar";
import { Icon } from "@/components/ui/Icon";
import { Button, Dialog, Row, fieldClass } from "@/components/ui/Dialog";
import { useProjects } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { useRemoteConfigured } from "@/lib/db/use-config";
import { KINDS } from "@/lib/kinds";
import { currentWorld } from "@/lib/scope";
import { uid } from "@/lib/factories";
import { validateSharedProject } from "@/lib/share";
import { BACKDROPS, backdropOf, sanitizeLook, type ProjectLook } from "@/lib/looks";
import {
  designOf,
  hydrateSignature,
  listPosts,
  publishPost,
  retirePost,
  toggleHeart,
  useSignature,
  type CommunityPost,
  type PostKind,
} from "@/lib/community";
import { cn } from "@/lib/cn";
import type { Project } from "@/lib/types";

type Filter = "all" | PostKind;

const KIND_LABEL: Record<PostKind, string> = {
  idea: "Idea",
  design: "Design",
  template: "Template",
};

function relativeTime(ts: number): string {
  const minutes = Math.round((Date.now() - ts) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days}d ago` : new Date(ts).toLocaleDateString();
}

export default function CommunityPage() {
  const configured = useRemoteConfigured();
  const notify = useUI((s) => s.notify);

  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sharing, setSharing] = useState(false);
  const [applying, setApplying] = useState<ProjectLook | null>(null);

  useEffect(hydrateSignature, []);

  const refresh = () => {
    listPosts()
      .then((rows) => {
        setPosts(rows);
        setProblem(null);
      })
      .catch((e) => setProblem(String(e instanceof Error ? e.message : e)));
  };

  useEffect(() => {
    if (configured) refresh();
  }, [configured]);

  const visible = useMemo(
    () => (posts ?? []).filter((p) => filter === "all" || p.kind === filter),
    [posts, filter],
  );

  return (
    <>
      {sharing && (
        <ShareDialog
          onClose={() => setSharing(false)}
          onShared={() => {
            setSharing(false);
            notify("Shared with everyone");
            refresh();
          }}
        />
      )}
      {applying && (
        <ApplyDesignDialog look={applying} onClose={() => setApplying(null)} />
      )}

      <TopBar
        right={
          configured ? (
            <button
              type="button"
              onClick={() => setSharing(true)}
              className="flex items-center gap-1.5 rounded-sm bg-accent px-2.5 py-1.5 text-[12px] font-medium text-on-accent transition-[filter] duration-150 hover:brightness-110"
            >
              <Icon name="promote" size={12} />
              Share something
            </button>
          ) : undefined
        }
      >
        <span className="text-[13px] font-medium text-fg">Community</span>
      </TopBar>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[980px] px-5 py-8 sm:px-8 sm:py-12">
          <div className="mb-8">
            <p className="label-mono mb-2.5">From everyone, for everyone</p>
            <h1 className="max-w-[26ch] text-[26px] leading-[1.15] font-medium tracking-[-0.03em] text-fg sm:text-[32px]">
              Ideas, designs and templates.
              <span className="text-fg-subtle"> Take what helps.</span>
            </h1>
          </div>

          {!configured ? (
            <>
              <p className="mb-6 rounded-md border border-line bg-surface px-4 py-3 text-[12.5px] leading-relaxed text-fg-muted">
                Sharing with other people needs the account database, and this
                deployment has none — so this is the starter gallery: every
                built-in design, ready to use on your own documents.
              </p>
              <StarterGallery onUse={(look) => setApplying(look)} />
            </>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-center gap-1.5">
                {(["all", "idea", "design", "template"] as Filter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "rounded-sm border px-2.5 py-1 text-[11.5px] transition-colors duration-150",
                      filter === f
                        ? "border-line-strong bg-surface-2 text-fg"
                        : "border-line text-fg-subtle hover:text-fg-muted",
                    )}
                  >
                    {f === "all" ? "All" : `${KIND_LABEL[f]}s`}
                  </button>
                ))}
              </div>

              {problem && (
                <p className="mb-5 rounded-md border border-danger/25 bg-danger/5 px-4 py-3 text-[12.5px] text-fg-muted">
                  {problem}
                  {/not exist|schema|relation/i.test(problem) && (
                    <span className="mt-1 block text-fg-subtle">
                      Run supabase/migrations/0009 (or catch-up.sql) in the SQL
                      editor to open the community.
                    </span>
                  )}
                </p>
              )}

              {posts === null && !problem ? (
                <p className="py-16 text-center text-[13px] text-fg-subtle" aria-busy="true">
                  Fetching what everyone shared…
                </p>
              ) : visible.length === 0 && !problem ? (
                <div className="hairline rounded-lg bg-surface px-6 py-14 text-center">
                  <p className="display text-[19px] text-fg">Nothing here yet.</p>
                  <p className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-relaxed text-fg-muted">
                    Be the first: share an idea, the design of a document
                    you&rsquo;re proud of, or a template others can start from.
                  </p>
                  <div className="mt-5">
                    <Button variant="primary" onClick={() => setSharing(true)}>
                      Share something
                    </Button>
                  </div>
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {visible.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onChanged={refresh}
                      onUseDesign={(look) => setApplying(look)}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}

/* ── One post ────────────────────────────────────────────────────────── */

function PostCard({
  post,
  onChanged,
  onUseDesign,
}: {
  post: CommunityPost;
  onChanged: () => void;
  onUseDesign: (look: ProjectLook) => void;
}) {
  const notify = useUI((s) => s.notify);
  const router = useRouter();
  const design = sanitizeLook(designOf(post));
  const backdrop = backdropOf(design);

  const useTemplate = () => {
    const raw = (post.payload as { project?: unknown } | null)?.project;
    const validated = validateSharedProject(raw);
    if (!validated) {
      notify("This template can't be read — it may come from a newer version.");
      return;
    }
    // A fresh identity in *your* library: new id, your world, its clock reset.
    // The id the author's copy had must not travel, or using a template twice
    // would silently be one project.
    const adopted: Project = {
      ...validated,
      id: uid(),
      scope: currentWorld(),
      folderId: null,
      shareNote: undefined,
      shareRoom: undefined,
      shareExpires: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    useProjects.setState((s) => ({ projects: [adopted, ...s.projects] }));
    notify(`Started “${adopted.name}” from the template`);
    router.push(`/p/${adopted.id}`);
  };

  return (
    <li className="flex flex-col rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-xs border border-line px-1.5 py-0.5 font-mono text-[9.5px] tracking-wide text-fg-subtle uppercase">
          {KIND_LABEL[post.kind]}
        </span>
        <span className="min-w-0 flex-1" />
        {post.mine && (
          <button
            type="button"
            aria-label="Retire this post"
            title="Retire this post"
            onClick={() => {
              retirePost(post.id)
                .then(onChanged)
                .catch(() => undefined);
            }}
            className="rounded-xs p-1 text-fg-subtle transition-colors duration-150 hover:text-danger"
          >
            <Icon name="trash" size={12} />
          </button>
        )}
      </div>

      {backdrop && (
        <div
          aria-hidden="true"
          className="mb-3 h-20 rounded-md border border-line"
          style={{ background: backdrop.css }}
        />
      )}

      <p className="text-[14px] font-medium text-fg">{post.title}</p>
      {post.body && (
        <p className="mt-1 text-[12.5px] leading-relaxed whitespace-pre-wrap text-fg-muted">
          {post.body.length > 400 ? `${post.body.slice(0, 400)}…` : post.body}
        </p>
      )}

      <div className="mt-auto flex items-center gap-2 pt-3">
        <span className="min-w-0 flex-1 truncate text-[11px] text-fg-subtle">
          {post.authorName || "Someone"} · {relativeTime(post.createdAt)}
        </span>
        {design && (
          <Button onClick={() => onUseDesign(design)}>Use design</Button>
        )}
        {post.kind === "template" && (
          <Button onClick={useTemplate}>Use template</Button>
        )}
        <button
          type="button"
          aria-pressed={post.hearted}
          aria-label={post.hearted ? "Take your heart back" : "Give a heart"}
          onClick={() => {
            toggleHeart(post)
              .then(onChanged)
              .catch(() => undefined);
          }}
          className={cn(
            "flex items-center gap-1 rounded-sm border px-2 py-1 text-[11.5px] transition-colors duration-150",
            post.hearted
              ? "border-accent/50 bg-accent-soft text-accent"
              : "border-line text-fg-subtle hover:border-line-strong hover:text-fg",
          )}
        >
          ♥ {post.hearts}
        </button>
      </div>
    </li>
  );
}

/* ── The built-in gallery, for deployments with nobody to share with ──── */

function StarterGallery({ onUse }: { onUse: (look: ProjectLook) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {BACKDROPS.map((b) => (
        <li key={b.id} className="flex flex-col rounded-lg border border-line bg-surface p-2.5">
          <div
            aria-hidden="true"
            className="mb-2 h-16 rounded-md border border-line"
            style={{ background: b.css }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[12px] text-fg">{b.name}</span>
            <Button onClick={() => onUse({ backdrop: b.id })}>Use</Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── Applying a design to one of your documents ──────────────────────── */

function ApplyDesignDialog({
  look,
  onClose,
}: {
  look: ProjectLook;
  onClose: () => void;
}) {
  const projects = useProjects((s) => s.projects);
  const addProject = useProjects((s) => s.addProject);
  const setLook = useProjects((s) => s.setProjectLook);
  const notify = useUI((s) => s.notify);
  const router = useRouter();
  const backdrop = backdropOf(look);
  const world = currentWorld();
  const mine = projects.filter((p) => (p.scope ?? "personal") === world);

  const apply = (projectId: string, name: string) => {
    setLook(projectId, look);
    notify(`“${name}” wears the design now`);
    onClose();
    router.push(`/p/${projectId}`);
  };

  return (
    <Dialog
      title="Use this design"
      description="Pick which of your documents gets it. The text is untouched — only the page changes."
      onClose={onClose}
      footer={<Button onClick={onClose}>Cancel</Button>}
    >
      {backdrop && (
        <div
          aria-hidden="true"
          className="mb-3 h-16 rounded-md border border-line"
          style={{ background: backdrop.css }}
        />
      )}
      <div className="flex max-h-[320px] flex-col gap-1 overflow-y-auto">
        <button
          type="button"
          onClick={() => {
            const id = addProject("doc");
            apply(id, "New document");
          }}
          className="flex items-center gap-2 rounded-sm border border-dashed border-line px-2.5 py-2 text-left text-[12.5px] text-fg-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
        >
          <Icon name="plus" size={12} />
          A new document
        </button>
        {mine.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => apply(p.id, p.name)}
            className="flex items-center gap-2 rounded-sm border border-line px-2.5 py-2 text-left text-[12.5px] text-fg transition-colors duration-150 hover:border-line-strong"
          >
            <Icon name={KINDS[p.kind].icon} size={12} className="shrink-0 text-fg-subtle" />
            <span className="truncate">{p.name}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

/* ── Sharing something ───────────────────────────────────────────────── */

function ShareDialog({
  onClose,
  onShared,
}: {
  onClose: () => void;
  onShared: () => void;
}) {
  const projects = useProjects((s) => s.projects);
  const name = useSignature((s) => s.name);
  const setName = useSignature((s) => s.setName);
  const [kind, setKind] = useState<PostKind>("idea");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const withLook = projects.filter((p) => p.look);
  const chosen = projects.find((p) => p.id === projectId);

  const ready =
    title.trim().length > 0 &&
    (kind === "idea" || (chosen && (kind === "template" || chosen.look)));

  const share = () => {
    if (!ready || busy) return;
    setBusy(true);
    const payload =
      kind === "design"
        ? { backdrop: chosen?.look?.backdrop, accent: chosen?.look?.accent }
        : kind === "template"
          ? { project: chosen }
          : {};
    publishPost({ kind, title, body, payload })
      .then(onShared)
      .catch((e) => {
        setProblem(String(e instanceof Error ? e.message : e));
        setBusy(false);
      });
  };

  return (
    <Dialog
      title="Share with everyone"
      description="Visible to every account on this deployment. Your documents stay yours — a design shares only its look, a template only its structure."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={share} disabled={!ready || busy}>
            {busy ? "Sharing…" : "Share"}
          </Button>
        </>
      }
    >
      <Row label="What">
        <div className="inline-flex gap-0.5 rounded-sm border border-line p-0.5">
          {(["idea", "design", "template"] as PostKind[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "rounded-xs px-2.5 py-1 text-[12px] transition-colors duration-150",
                kind === k ? "bg-surface-3 text-fg" : "text-fg-subtle hover:text-fg-muted",
              )}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </Row>

      <Row label="Signed as" hint="Shown on the post. Remembered on this browser.">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          aria-label="Your name"
          className={fieldClass}
        />
      </Row>

      <Row label="Title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            kind === "idea"
              ? "A calendar that plans backwards from the deadline"
              : kind === "design"
                ? "Aurora with a warm red"
                : "Weekly report, ready to fill in"
          }
          aria-label="Title"
          className={fieldClass}
        />
      </Row>

      <Row label={kind === "idea" ? "The idea" : "Say something about it"}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          aria-label="Body"
          className={cn(fieldClass, "resize-y")}
        />
      </Row>

      {kind !== "idea" && (
        <Row
          label={kind === "design" ? "Design of" : "Template of"}
          hint={
            kind === "design"
              ? "Only documents that wear a design are offered — give one a backdrop first via its Design button."
              : "The document's structure travels: blocks, board, look. Not its comments or share links."
          }
        >
          <div className="flex max-h-[200px] flex-col gap-1 overflow-y-auto">
            {(kind === "design" ? withLook : projects).map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={projectId === p.id}
                onClick={() => setProjectId(p.id)}
                className={cn(
                  "flex items-center gap-2 rounded-sm border px-2.5 py-2 text-left text-[12.5px] transition-colors duration-150",
                  projectId === p.id
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
                )}
              >
                <Icon name={KINDS[p.kind].icon} size={12} className="shrink-0" />
                <span className="truncate">{p.name}</span>
                {p.look && (
                  <span
                    aria-hidden="true"
                    className="ml-auto size-4 shrink-0 rounded-xs border border-line"
                    style={{ background: backdropOf(p.look)?.css }}
                  />
                )}
              </button>
            ))}
            {kind === "design" && withLook.length === 0 && (
              <p className="rounded-sm border border-dashed border-line px-2.5 py-2 text-[12px] text-fg-subtle">
                None of your documents wears a design yet.
              </p>
            )}
          </div>
        </Row>
      )}

      {problem && (
        <p className="mt-2 text-[12px] text-danger">{problem}</p>
      )}
    </Dialog>
  );
}
