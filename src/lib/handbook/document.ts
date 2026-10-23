import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import type { JSONContent } from "@tiptap/react";

/**
 * A routine's text in Handbok (ticket 37): the editor's document, as JSON.
 * The same extensions write it (the editor) and show it (the reader), and the
 * server checks every saved document against what they allow, so nothing
 * else can be stored and shown: headings, paragraphs, lists, checklists,
 * quotes, bold, italic, underline, struck text and links to the web, email or
 * a phone number. Pure, so it is tested on its own.
 */

export const handbookExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    code: false,
    codeBlock: false,
    link: { openOnClick: false, autolink: true, defaultProtocol: "https", protocols: ["mailto", "tel"] },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
];

export type HandbookDoc = { type: "doc"; content: JSONContent[] };

export const emptyDoc = (): HandbookDoc => ({ type: "doc", content: [{ type: "paragraph" }] });

const nodes = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "horizontalRule",
  "hardBreak",
  "text",
]);
const marks = new Set(["bold", "italic", "underline", "strike", "link"]);

/** A link the reader can follow safely: the web, email or phone. Nothing that runs code. */
export function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const value = href.trim();
  return /^(https?:\/\/|mailto:|tel:)/i.test(value) && value.length <= 2000 ? value : null;
}

/** The most a routine may hold, as saved JSON. */
export const maxDocumentBytes = 200_000;

function cleanMarks(input: unknown): JSONContent["marks"] {
  if (!Array.isArray(input)) return undefined;
  const out: NonNullable<JSONContent["marks"]> = [];
  for (const mark of input) {
    if (!mark || typeof mark !== "object" || !marks.has((mark as { type?: string }).type ?? "")) continue;
    const type = (mark as { type: string }).type;
    if (type === "link") {
      const href = safeHref((mark as { attrs?: { href?: unknown } }).attrs?.href);
      if (href) out.push({ type, attrs: { href, target: "_blank", rel: "noopener noreferrer nofollow" } });
    } else out.push({ type });
  }
  return out.length > 0 ? out : undefined;
}

function cleanNode(input: unknown): JSONContent | null {
  if (!input || typeof input !== "object") return null;
  const node = input as JSONContent;
  if (!node.type || !nodes.has(node.type)) return null;
  if (node.type === "text") {
    if (typeof node.text !== "string" || node.text === "") return null;
    return { type: "text", text: node.text, ...(cleanMarks(node.marks) ? { marks: cleanMarks(node.marks) } : {}) };
  }
  const out: JSONContent = { type: node.type };
  if (node.type === "heading") out.attrs = { level: node.attrs?.level === 3 ? 3 : 2 };
  if (node.type === "orderedList" && Number.isInteger(node.attrs?.start)) out.attrs = { start: Math.max(1, node.attrs!.start as number) };
  if (node.type === "taskItem") out.attrs = { checked: node.attrs?.checked === true };
  if (Array.isArray(node.content)) {
    const children = node.content.map(cleanNode).filter((c): c is JSONContent => c !== null);
    if (children.length > 0) out.content = children;
  }
  return out;
}

/**
 * The document as it may be stored: only what Handbok allows, links checked.
 * Anything else is dropped. Throws when it is not a document at all, or too big.
 */
export function cleanDocument(input: unknown): HandbookDoc {
  const parsed = typeof input === "string" ? (JSON.parse(input) as unknown) : input;
  if (!parsed || typeof parsed !== "object" || (parsed as JSONContent).type !== "doc") throw new Error("not a document");
  const content = ((parsed as JSONContent).content ?? []).map(cleanNode).filter((c): c is JSONContent => c !== null);
  const doc: HandbookDoc = { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
  if (JSON.stringify(doc).length > maxDocumentBytes) throw new Error("too big");
  return doc;
}

/** The same JSON written the same way whatever its key order (the database keeps its own order). */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Whether two documents say the same. */
export const sameDocument = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** The document as plain text, one block per line: for search, and to show a line of it in the list. */
export function plainText(doc: JSONContent): string {
  const lines: string[] = [];
  const walk = (node: JSONContent): string => {
    if (node.type === "text") return node.text ?? "";
    if (node.type === "hardBreak") return " ";
    const inner = (node.content ?? []).map(walk).join("");
    if (["paragraph", "heading"].includes(node.type ?? "")) {
      if (inner.trim()) lines.push(inner.trim());
      return "";
    }
    return inner;
  };
  walk(doc);
  return lines.join("\n");
}
