import { signal } from '@angular/core';
import { iconMarkup, type IconName } from '../../../shared/icon';

/**
 * Icons on shapes: the diagram skill's generic icon names (drawn with Lucide, in the shape's text colour) and logos
 * (`logo:<pack>/<name>`: Devicon's tech logos, bundled, or a workspace's own packs), drawn as pictures in their own
 * colours on a white disc, never recoloured or stretched, as the vendors' terms ask.
 */

/** The skill's generic icon names and the Lucide icon that draws each, grouped as its icon picker groups them. */
export const GENERIC_ICONS: { group: string; icons: { name: string; icon: IconName; label: string }[] }[] = [
  {
    group: 'People',
    icons: [
      { name: 'user', icon: 'user', label: 'Person' },
      { name: 'users', icon: 'users', label: 'People' },
      { name: 'headset', icon: 'headset', label: 'Support' },
    ],
  },
  {
    group: 'Devices and apps',
    icons: [
      { name: 'browser', icon: 'browser', label: 'Browser' },
      { name: 'mobile', icon: 'mobile', label: 'Mobile' },
      { name: 'monitor', icon: 'monitor', label: 'Desktop' },
    ],
  },
  {
    group: 'Infrastructure',
    icons: [
      { name: 'gateway', icon: 'gateway', label: 'Gateway' },
      { name: 'api', icon: 'api', label: 'API' },
      { name: 'server', icon: 'server', label: 'Server' },
      { name: 'function', icon: 'function', label: 'Function' },
      { name: 'cluster', icon: 'cluster', label: 'Cluster' },
      { name: 'container', icon: 'container', label: 'Container' },
      { name: 'cdn', icon: 'cdn', label: 'CDN' },
      { name: 'cloud', icon: 'cloud', label: 'Cloud' },
      { name: 'cpu', icon: 'cpu', label: 'Compute' },
      { name: 'globe', icon: 'globe', label: 'Internet' },
    ],
  },
  {
    group: 'Data',
    icons: [
      { name: 'database', icon: 'database', label: 'Database' },
      { name: 'cache', icon: 'cache', label: 'Cache' },
      { name: 'storage', icon: 'storage', label: 'Storage' },
    ],
  },
  {
    group: 'Messaging',
    icons: [
      { name: 'queue', icon: 'queue', label: 'Queue' },
      { name: 'mail', icon: 'mail', label: 'Email' },
      { name: 'bell', icon: 'bell', label: 'Notifications' },
    ],
  },
  {
    group: 'Business',
    icons: [
      { name: 'credit-card', icon: 'creditCard', label: 'Payments' },
      { name: 'truck', icon: 'truck', label: 'Delivery' },
    ],
  },
  {
    group: 'Security',
    icons: [
      { name: 'lock', icon: 'lock', label: 'Lock' },
      { name: 'key', icon: 'key', label: 'Key' },
      { name: 'shield', icon: 'shield', label: 'Shield' },
    ],
  },
  {
    group: 'Process markers (BPMN)',
    icons: [
      { name: 'bpmn-timer', icon: 'timer', label: 'Timer' },
      { name: 'bpmn-message', icon: 'mail', label: 'Message' },
      { name: 'bpmn-signal', icon: 'bpmnSignal', label: 'Signal' },
      { name: 'bpmn-error', icon: 'bpmnError', label: 'Error' },
      { name: 'bpmn-conditional', icon: 'bpmnConditional', label: 'Condition' },
      { name: 'bpmn-terminate', icon: 'bpmnTerminate', label: 'Terminate' },
      { name: 'bpmn-user', icon: 'user', label: 'User task' },
      { name: 'bpmn-service', icon: 'bpmnService', label: 'Service task' },
      { name: 'bpmn-script', icon: 'bpmnScript', label: 'Script task' },
      { name: 'bpmn-send', icon: 'bpmnSend', label: 'Send task' },
      { name: 'bpmn-receive', icon: 'mail', label: 'Receive task' },
      { name: 'bpmn-manual', icon: 'bpmnManual', label: 'Manual task' },
      { name: 'bpmn-rule', icon: 'bpmnRule', label: 'Business rule' },
      { name: 'bpmn-exclusive', icon: 'bpmnExclusive', label: 'Exclusive gateway' },
      { name: 'bpmn-parallel', icon: 'bpmnParallel', label: 'Parallel gateway' },
      { name: 'bpmn-inclusive', icon: 'bpmnInclusive', label: 'Inclusive gateway' },
      { name: 'bpmn-event', icon: 'bpmnEvent', label: 'Event-based gateway' },
      { name: 'bpmn-complex', icon: 'bpmnComplex', label: 'Complex gateway' },
    ],
  },
];
const GENERIC = new Map(GENERIC_ICONS.flatMap((g) => g.icons.map((i) => [i.name, i] as const)));

/** A logo: its viewBox and its SVG markup. */
export interface Logo {
  vb: string;
  body: string;
}
/** How the picker names the packs teams add most. */
export const PACK_NAMES: Record<string, string> = {
  devicon: 'Tech logos',
  aws: 'AWS',
  azure: 'Azure',
  'google-cloud': 'Google Cloud',
  'oracle-cloud': 'Oracle Cloud',
  'ibm-cloud': 'IBM Cloud',
  'alibaba-cloud': 'Alibaba Cloud',
  kubernetes: 'Kubernetes',
  company: 'Our logos',
};

/** Logo packs by name, as they load: Devicon (bundled, loaded the first time a logo is wanted) and a workspace's own. */
export const logoPacks = signal<ReadonlyMap<string, Readonly<Record<string, Logo>>>>(new Map());
let deviconLoading: Promise<void> | null = null;

/** Loads the bundled Devicon logos, once. */
export function loadDevicon(): Promise<void> {
  deviconLoading ??= import('./logos/devicon').then((m) => {
    const next = new Map(logoPacks());
    next.set('devicon', m.DEVICON);
    logoPacks.set(next);
  });
  return deviconLoading;
}

/** How the open board gets its workspace's logo packs, and whether it has asked yet. */
let workspaceLoader: (() => Promise<readonly { name: string; logos: Readonly<Record<string, Logo>> }[]>) | null = null;
let workspaceAsked = false;

/** The open board's workspace: where its logo packs come from, fetched the first time a logo or the picker wants them. */
export function useWorkspaceLogos(load: () => Promise<readonly { name: string; logos: Readonly<Record<string, Logo>> }[]>): void {
  workspaceLoader = load;
  workspaceAsked = false;
}

/** Fetches the workspace's logo packs, once. */
export function requestWorkspaceLogos(): void {
  if (workspaceAsked || !workspaceLoader) return;
  workspaceAsked = true;
  workspaceLoader().then(
    (packs) => packs.forEach((p) => setLogoPack(p.name, p.logos)),
    () => (workspaceAsked = false),
  );
}

/** Adds (or replaces) a workspace's logo pack. */
export function setLogoPack(name: string, logos: Readonly<Record<string, Logo>>): void {
  const next = new Map(logoPacks());
  next.set(name, logos);
  logoPacks.set(next);
}

/** What an icon name draws: a Lucide icon, a logo picture (a data URL), or nothing known. */
export type ShapeIcon = { kind: 'icon'; icon: IconName; label: string } | { kind: 'logo'; src: string; label: string } | null;

const LOGO = /^logo:([a-z0-9-]+)\/([a-z0-9][a-z0-9._-]*)$/;

/** A logo as a picture: an SVG data URL. Drawn as an image, its markup never runs. */
export const logoSrc = (logo: Logo): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${logo.vb.replace(/[^0-9. -]/g, '')}">${logo.body}</svg>`)}`;

/** Reads an icon name. Logos from packs not loaded yet read as nothing (Devicon starts loading). */
export function shapeIcon(name: string | undefined, packs: ReadonlyMap<string, Readonly<Record<string, Logo>>> = logoPacks()): ShapeIcon {
  if (!name) return null;
  const generic = GENERIC.get(name);
  if (generic) return { kind: 'icon', icon: generic.icon, label: generic.label };
  const m = LOGO.exec(name);
  if (!m) return null;
  const [, pack, logo] = m;
  if (pack === 'devicon' && !packs.has('devicon')) void loadDevicon();
  else if (!packs.has(pack)) requestWorkspaceLogos();
  const found = packs.get(pack)?.[logo];
  return found ? { kind: 'logo', src: logoSrc(found), label: logo } : null;
}

/** An icon as a picture for drawing on a canvas (PNG export): Lucide icons in the given colour, logos as they are. */
export function shapeIconSrc(name: string | undefined, colour: string): string | null {
  const icon = shapeIcon(name);
  if (!icon) return null;
  if (icon.kind === 'logo') return icon.src;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconMarkup(icon.icon, 48).replace('stroke="currentColor"', `stroke="${colour}"`))}`;
}
