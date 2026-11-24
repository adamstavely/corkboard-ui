import type { Logo } from '../board/diagrams/shape-icons';

/**
 * A logo from one SVG file of a vendor's icon download: its viewBox and its drawing, with what browsers draw but the
 * server won't keep made plain first. Class rules in a <style> become each element's own style (vendors' exports
 * colour logos that way); titles, descriptions, metadata and comments go. The server checks what's left.
 */
export function logoFromSvg(text: string): Logo | null {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) return null;
  const width = parseFloat(root.getAttribute('width') ?? '');
  const height = parseFloat(root.getAttribute('height') ?? '');
  const vb = root.getAttribute('viewBox')?.trim() || (width > 0 && height > 0 ? `0 0 ${width} ${height}` : '');
  if (!vb) return null;
  // Class rules → each element's own style, then the style sheets go.
  for (const style of [...root.getElementsByTagName('style')]) {
    for (const [, classes, declarations] of (style.textContent ?? '').matchAll(/([.\w\s,-]+)\{([^}]*)\}/g)) {
      for (const cls of classes.split(',').map((c) => c.trim()).filter((c) => /^\.[\w-]+$/.test(c))) {
        for (const el of [...root.getElementsByClassName(cls.slice(1))]) el.setAttribute('style', `${declarations.trim()};${el.getAttribute('style') ?? ''}`.replace(/;;+/g, ';'));
      }
    }
    style.remove();
  }
  for (const tag of ['title', 'desc', 'metadata']) for (const el of [...root.getElementsByTagName(tag)]) el.remove();
  const out = new XMLSerializer();
  const body = [...root.childNodes]
    .filter((n) => n.nodeType === Node.ELEMENT_NODE)
    .map((n) => out.serializeToString(n).replace(/\sxmlns(:\w+)?="[^"]*"/g, ''))
    .join('');
  return body ? { vb, body } : null;
}

/** A logo's name from its file's: lower case, words joined by hyphens ("Arch_Amazon-S3_64.svg" → "arch-amazon-s3-64"). */
export const logoName = (file: string): string =>
  file
    .replace(/\.svg$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);

/** Whether a file in a download is its terms, kept with the pack. */
export const isTerms = (file: string): boolean => /licen[cs]e|terms|notice/i.test(file) && !/\.svg$/i.test(file);
