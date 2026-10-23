import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import { cleanDocument, handbookExtensions } from "@/lib/handbook/document";

/**
 * A routine as it reads (ticket 37), drawn on the server from the stored
 * document with the editor's own extensions. It is checked once more on the
 * way out, so only what Handbok allows is ever shown.
 */
export function DocumentView({ content }: { content: unknown }) {
  let doc;
  try {
    doc = cleanDocument(content);
  } catch {
    return null;
  }
  return <div className="handbook-doc">{renderToReactElement({ content: doc, extensions: handbookExtensions })}</div>;
}
