"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { javascript } from "@codemirror/lang-javascript";
import { html as htmlLang } from "@codemirror/lang-html";
import { css as cssLang } from "@codemirror/lang-css";
import { json as jsonLang } from "@codemirror/lang-json";
import type { CodeBlock as CodeBlockModel, CodeFile, CodeLanguage } from "@/lib/types";
import { useProjects } from "@/lib/store";
import { uid } from "@/lib/factories";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { codeTheme } from "./code-theme";

// CodeMirror touches `document` on import; keep it off the server entirely.
const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => (
    <div className="anim-shimmer h-[260px] bg-white/[0.015]" aria-hidden="true" />
  ),
});

const EXT_LANGUAGE: Record<string, CodeLanguage> = {
  html: "html",
  htm: "html",
  css: "css",
  js: "javascript",
  mjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
};

function languageFor(name: string): CodeLanguage {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANGUAGE[ext] ?? "javascript";
}

function extensionsFor(language: CodeLanguage) {
  switch (language) {
    case "html":
      return [htmlLang()];
    case "css":
      return [cssLang()];
    case "json":
      return [jsonLang()];
    case "typescript":
      return [javascript({ typescript: true })];
    default:
      return [javascript()];
  }
}

/**
 * Inline every local `<link>` and `<script src>` into one document so the
 * preview can run in a `srcdoc` iframe with no network and no same-origin
 * access to the app.
 */
function bundle(files: CodeFile[]): string {
  const entry =
    files.find((f) => f.name.toLowerCase() === "index.html") ??
    files.find((f) => f.language === "html");
  if (!entry) return "";

  const byName = new Map(files.map((f) => [f.name.toLowerCase(), f]));
  const local = (src: string) => byName.get(src.replace(/^\.\//, "").toLowerCase());

  return entry.content
    .replace(
      /<link[^>]*href=["']([^"']+)["'][^>]*>/gi,
      (whole, href: string) => {
        const file = local(href);
        return file ? `<style>\n${file.content}\n</style>` : whole;
      },
    )
    .replace(
      /<script[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
      (whole, src: string) => {
        const file = local(src);
        return file ? `<script>\n${file.content}\n</script>` : whole;
      },
    );
}

export function CodeBlock({
  projectId,
  block,
}: {
  projectId: string;
  block: CodeBlockModel;
}) {
  const updateBlock = useProjects((s) => s.updateBlock);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  // The preview only refreshes on Run, so a half-typed function never executes
  // on every keystroke. It's seeded once at mount so there's something to look
  // at before the first Run.
  const [srcDoc, setSrcDoc] = useState(() =>
    block.preview ? bundle(block.files) : "",
  );
  const [ranAt, setRanAt] = useState<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active =
    block.files.find((f) => f.id === block.activeFileId) ?? block.files[0];

  const extensions = useMemo(
    () => (active ? [...extensionsFor(active.language), ...codeTheme] : codeTheme),
    [active],
  );

  const hasHtml = block.files.some((f) => f.language === "html");

  const run = useCallback(() => {
    setSrcDoc(bundle(block.files));
    setRanAt(Date.now());
  }, [block.files]);

  const setContent = useCallback(
    (content: string) => {
      if (!active) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updateBlock<CodeBlockModel>(projectId, block.id, (b) => ({
          files: b.files.map((f) =>
            f.id === active.id ? { ...f, content } : f,
          ),
        }));
      }, 200);
    },
    [active, projectId, block.id, updateBlock],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const addFile = () => {
    const name = newName.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    const file: CodeFile = {
      id: uid(),
      name,
      language: languageFor(name),
      content: "",
    };
    updateBlock<CodeBlockModel>(projectId, block.id, (b) => ({
      files: [...b.files, file],
      activeFileId: file.id,
    }));
    setNewName("");
    setAdding(false);
  };

  const removeFile = (id: string) => {
    updateBlock<CodeBlockModel>(projectId, block.id, (b) => {
      const files = b.files.filter((f) => f.id !== id);
      if (files.length === 0) return {};
      return {
        files,
        activeFileId: b.activeFileId === id ? files[0].id : b.activeFileId,
      };
    });
  };

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-2.5 py-1.5">
        <span className="label-mono">{block.files.length} files</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              // Opening the pane should show something, not an empty frame.
              if (!block.preview) setSrcDoc(bundle(block.files));
              updateBlock<CodeBlockModel>(projectId, block.id, (b) => ({
                preview: !b.preview,
              }));
            }}
            className={cn(
              "rounded-sm border px-2 py-1 text-[11px] transition-colors duration-150",
              block.preview
                ? "border-line-strong text-fg"
                : "border-line text-fg-subtle hover:text-fg-muted",
            )}
          >
            Preview
          </button>
          <button
            type="button"
            onClick={run}
            disabled={!hasHtml}
            title={hasHtml ? "Run the preview" : "Add an index.html to run"}
            className={cn(
              "flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] transition-[filter,color] duration-150",
              hasHtml
                ? "bg-accent text-white hover:brightness-110"
                : "border border-line text-fg-subtle",
            )}
          >
            <Icon name="play" size={10} />
            Run
          </button>
        </div>
      </div>

      <div
        className={cn(
          "grid",
          block.preview && hasHtml
            ? "lg:grid-cols-[152px_minmax(0,1fr)_minmax(0,0.85fr)]"
            : "lg:grid-cols-[152px_minmax(0,1fr)]",
        )}
      >
        {/* File tree */}
        <div className="flex flex-row gap-1 overflow-x-auto border-b border-line p-1.5 lg:flex-col lg:overflow-visible lg:border-r lg:border-b-0">
          {block.files.map((file) => (
            <div key={file.id} className="group/file relative shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() =>
                  updateBlock<CodeBlockModel>(projectId, block.id, {
                    activeFileId: file.id,
                  })
                }
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left font-mono text-[11px] transition-colors duration-150",
                  file.id === active?.id
                    ? "bg-surface-2 text-fg"
                    : "text-fg-subtle hover:bg-surface-2/60 hover:text-fg-muted",
                )}
              >
                <Icon name="file" size={10} className="shrink-0" />
                <span className="truncate">{file.name}</span>
              </button>
              {block.files.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeFile(file.id)}
                  aria-label={`Delete ${file.name}`}
                  className="absolute top-1/2 right-1 hidden -translate-y-1/2 rounded-xs p-0.5 text-fg-subtle opacity-0 transition-opacity duration-150 group-hover/file:opacity-100 hover:text-danger focus-visible:opacity-100 lg:block"
                >
                  <Icon name="x" size={9} />
                </button>
              )}
            </div>
          ))}

          {adding ? (
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={addFile}
              onKeyDown={(e) => {
                if (e.key === "Enter") addFile();
                if (e.key === "Escape") {
                  setNewName("");
                  setAdding(false);
                }
              }}
              placeholder="name.js"
              className="w-[110px] rounded-sm border border-accent bg-surface-2 px-2 py-1 font-mono text-[11px] text-fg outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-[11px] text-fg-subtle transition-colors duration-150 hover:text-fg"
            >
              <Icon name="plus" size={10} />
              New
            </button>
          )}
        </div>

        {/* Editor */}
        <div className="min-w-0 border-b border-line lg:border-b-0">
          {active && (
            <CodeMirror
              key={active.id}
              value={active.content}
              height="300px"
              extensions={extensions}
              theme="none"
              basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                highlightActiveLine: true,
                highlightActiveLineGutter: true,
                autocompletion: true,
                bracketMatching: true,
                closeBrackets: true,
                searchKeymap: false,
              }}
              onChange={setContent}
            />
          )}
        </div>

        {/* Preview */}
        {block.preview && hasHtml && (
          <div className="min-w-0 border-t border-line lg:border-t-0 lg:border-l">
            <div className="flex items-center gap-2 border-b border-line px-2.5 py-1">
              <span className="label-mono">Preview</span>
            </div>
            <iframe
              key={ranAt ?? "initial"}
              srcDoc={srcDoc}
              title="Code preview"
              // No same-origin: the preview can run scripts but can't reach
              // this app's storage or DOM.
              sandbox="allow-scripts"
              className="h-[300px] w-full bg-canvas"
            />
          </div>
        )}
      </div>
    </div>
  );
}
