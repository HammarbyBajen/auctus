"use client";

import { useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Bold, Heading2, Heading3, Italic, Link2, List, ListChecks, ListOrdered, Quote, Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { handbookExtensions, safeHref, type HandbookDoc } from "@/lib/handbook/document";
import { cn } from "@/lib/utils";
import { t, type MessageKey } from "@/lib/i18n";

/**
 * The editor for a routine (ticket 37): like a document, no codes to learn.
 * The text goes with the form as JSON in a hidden field named `content`; the
 * server checks it again before it is stored.
 */
export function HandbookEditor({ initial, labelledBy }: { initial: HandbookDoc; labelledBy: string }) {
  const [json, setJson] = useState(() => JSON.stringify(initial));
  const editor = useEditor({
    extensions: [...handbookExtensions, Placeholder.configure({ placeholder: t("handbook.editorPlaceholder") })],
    content: initial,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "handbook-doc min-h-64 px-4 py-3",
        "aria-labelledby": labelledBy,
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    onUpdate: ({ editor }) => setJson(JSON.stringify(editor.getJSON())),
  });

  return (
    <div className="focus-ring-within flex flex-col overflow-hidden rounded-md border control-border bg-card">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
      <input type="hidden" name="content" value={json} />
    </div>
  );
}

type Tool = { key: MessageKey; icon: typeof Bold; active: boolean; run: () => void };

function Toolbar({ editor }: { editor: Editor }) {
  const [linking, setLinking] = useState(false);
  const [href, setHref] = useState("");
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  const tools: Tool[] = [
    { key: "handbook.tool.h2", icon: Heading2, active: state.h2, run: () => chain().toggleHeading({ level: 2 }).run() },
    { key: "handbook.tool.h3", icon: Heading3, active: state.h3, run: () => chain().toggleHeading({ level: 3 }).run() },
    { key: "handbook.tool.bold", icon: Bold, active: state.bold, run: () => chain().toggleBold().run() },
    { key: "handbook.tool.italic", icon: Italic, active: state.italic, run: () => chain().toggleItalic().run() },
    { key: "handbook.tool.bullet", icon: List, active: state.bullet, run: () => chain().toggleBulletList().run() },
    { key: "handbook.tool.ordered", icon: ListOrdered, active: state.ordered, run: () => chain().toggleOrderedList().run() },
    { key: "handbook.tool.task", icon: ListChecks, active: state.task, run: () => chain().toggleTaskList().run() },
    { key: "handbook.tool.quote", icon: Quote, active: state.quote, run: () => chain().toggleBlockquote().run() },
  ];

  const openLink = () => {
    setHref((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinking(true);
  };
  const saveLink = () => {
    const value = href.trim();
    const full = value && !/^[a-z]+:/i.test(value) ? `https://${value}` : value;
    if (!full) chain().extendMarkRange("link").unsetLink().run();
    else if (safeHref(full)) chain().extendMarkRange("link").setLink({ href: full }).run();
    setLinking(false);
  };

  return (
    <div className="flex flex-col border-b border-border bg-well">
      <div role="toolbar" aria-label={t("handbook.toolbar")} className="flex flex-wrap items-center gap-0.5 p-1">
        {tools.map(({ key, icon: Icon, active, run }) => (
          <ToolButton key={key} label={t(key)} active={active} onClick={run}>
            <Icon aria-hidden="true" />
          </ToolButton>
        ))}
        <ToolButton label={t("handbook.tool.link")} active={state.link || linking} onClick={openLink}>
          <Link2 aria-hidden="true" />
        </ToolButton>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
        <ToolButton label={t("handbook.tool.undo")} disabled={!state.canUndo} onClick={() => chain().undo().run()}>
          <Undo2 aria-hidden="true" />
        </ToolButton>
        <ToolButton label={t("handbook.tool.redo")} disabled={!state.canRedo} onClick={() => chain().redo().run()}>
          <Redo2 aria-hidden="true" />
        </ToolButton>
      </div>
      {linking && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border p-2">
          <Input
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveLink();
              }
              if (e.key === "Escape") setLinking(false);
            }}
            placeholder={t("handbook.linkPlaceholder")}
            aria-label={t("handbook.tool.link")}
            className="h-9 min-w-0 flex-1"
            autoFocus
          />
          <Button type="button" size="sm" variant="outline" onClick={saveLink}>
            {href.trim() ? t("handbook.linkSave") : t("handbook.linkRemove")}
          </Button>
        </div>
      )}
    </div>
  );
}

function ToolButton({ label, active = false, disabled = false, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the text selected while a button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "focus-ring inline-flex size-9 items-center justify-center rounded-sm text-muted-foreground transition-[background-color] hover:bg-accent hover:text-foreground disabled:opacity-40 [&_svg]:size-4",
        active && "bg-card text-foreground elevation-1",
      )}
    >
      {children}
    </button>
  );
}
