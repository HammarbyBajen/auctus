import sv from "@/messages/sv.json";

export type MessageKey = keyof typeof sv;

/** Swedish only for now. Strings live in src/messages so a second language can be added later. */
export function t(key: MessageKey, params?: Record<string, string>): string {
  let text: string = sv[key];
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.replaceAll(`{${name}}`, value);
  }
  return text;
}
