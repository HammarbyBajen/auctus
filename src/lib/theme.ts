/** The user's theme choice, kept in a cookie so the server can render it. "system" follows the device. */
export const themeCookie = "theme";
export type ThemeChoice = "system" | "light" | "dark";

export function parseTheme(value: string | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

/**
 * Runs in the page head before the first paint, so the page never flashes the
 * wrong theme: an explicit choice wins, otherwise the device setting decides,
 * and a change of the device setting is followed while "system" is chosen.
 * It also marks the page as having JavaScript, so entrance animations that start
 * hidden only do so when they can actually run.
 */
export const themeScript = `(function(){document.documentElement.classList.add('js');try{var m=document.cookie.match(/(?:^|; )${themeCookie}=(light|dark)/);var q=window.matchMedia('(prefers-color-scheme: dark)');function a(){var d=m?m[1]==='dark':q.matches;document.documentElement.classList.toggle('dark',d);}a();q.addEventListener('change',function(){m=document.cookie.match(/(?:^|; )${themeCookie}=(light|dark)/);a();});}catch(e){}})();`;
