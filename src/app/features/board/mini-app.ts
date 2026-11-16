/** What a mini-app may load and run: its own inline code, and pictures and fonts it carries as data. No network. */
export const APP_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; form-action 'none'; base-uri 'none'";

/**
 * A mini-app's page with the policy put first, before anything of its own, so its scripts run under it. Policies only
 * add up: a page can't loosen this one with its own.
 */
export function withPolicy(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${APP_CSP}">`;
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  return doctype ? `${doctype[0]}${meta}${html.slice(doctype[0].length)}` : `${meta}${html}`;
}

/** What the holder says when its app tried to go to another page. */
export const LEFT_MESSAGE = { type: 'corkboard:app-left' };

/**
 * The page that holds a mini-app: the app in a frame of its own, inside a page that may load no frames. A policy can't
 * stop a page navigating itself, but its holder's frame-src can, so an app that tries to go elsewhere (to carry the notes
 * off in the address) is refused before anything is sent. The holder passes the board's messages on to the app, the
 * latest again whenever the app loads, and tells the board when the app tried to leave.
 */
export const HOLDER_CSP = "default-src 'none'; frame-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'";
export function sandboxed(html: string): string {
  const app = withPolicy(html).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return (
    `<!doctype html><meta http-equiv="Content-Security-Policy" content="${HOLDER_CSP}">` +
    '<style>html,body{margin:0;height:100%}iframe{display:block;width:100%;height:100%;border:0}</style>' +
    `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${app}"></iframe>` +
    `<script>(()=>{const f=document.querySelector('iframe');let last=null,loads=0;` +
    `addEventListener('message',(e)=>{if(e.source!==parent)return;last=e.data;f.contentWindow.postMessage(e.data,'*')});` +
    `addEventListener('securitypolicyviolation',()=>parent.postMessage(${JSON.stringify(LEFT_MESSAGE)},'*'));` +
    `f.addEventListener('load',()=>{if(++loads>1){parent.postMessage(${JSON.stringify(LEFT_MESSAGE)},'*');return}if(last!==null)f.contentWindow.postMessage(last,'*')})})()</script>`
  );
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
