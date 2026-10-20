/**
 * Whether the assistant is switched on: a key is set on the server (ticket 30).
 * Light on purpose, so a page can ask without loading the AI client and its
 * SDK; it only ever says yes or no, never the key.
 */
export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
