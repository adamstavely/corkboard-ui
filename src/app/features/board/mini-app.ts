/** What a mini-app may load and run: its own inline code, and pictures and fonts it carries as data. No network. */
export const APP_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; form-action 'none'; base-uri 'none'";

/**
 * A mini-app's page with the policy put first, before anything of its own, so its scripts run under it. Policies only
 * add up: a page can't loosen this one with its own.
 */
export function sandboxed(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${APP_CSP}">`;
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  return doctype ? `${doctype[0]}${meta}${html.slice(doctype[0].length)}` : `${meta}${html}`;
}

/** A note as a mini-app is sent it: no ids of people, nothing but what's written and its colour. */
export interface AppNote {
  id: string;
  text: string;
  color: string;
}

/** The message a mini-app listens for: the notes it works with, again whenever they change. */
export const notesMessage = (notes: AppNote[]) => ({ type: 'corkboard:notes', notes });

/** "tally.html" from an app's title, for downloading it. */
export function appFileName(title: string): string {
  return `${title.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase() || 'app'}.html`;
}
