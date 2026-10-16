/** Escapes text for HTML or XML (emails, the salary export), so what someone wrote can never become markup. */
export const escapeMarkup = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
