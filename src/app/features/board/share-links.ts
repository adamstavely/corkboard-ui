import type { ShareLink } from '@adamstavely/trenchcoat/share-link-manager';
import type { ShareLinkDto } from '../../api/generated/models/share-link-dto';

/** The page a share link opens. */
export const sharedUrl = (token: string, origin = location.origin) => `${origin}/shared/${token}`;

/** The board's links as Trench Coat's link manager lists them. */
export function shareLinks(links: readonly ShareLinkDto[], origin?: string): ShareLink[] {
  return links.map((l) => ({
    id: l.id,
    ...(l.label ? { label: l.label } : {}),
    url: sharedUrl(l.token, origin),
    createdBy: l.createdBy,
    createdAt: l.createdAt,
    ...(l.expiresAt ? { expiresAt: l.expiresAt } : {}),
    access: l.canEdit ? 'Can edit' : 'Can view',
    ...(l.hasPassword ? { password: true } : {}),
    opens: l.opens,
    ...(l.lastOpenedAt ? { lastOpenedAt: l.lastOpenedAt } : {}),
    ...(l.revoked ? { status: 'revoked' as const } : {}),
  }));
}

/**
 * How long a new link can last, as a picker's options (value: days, "" for never), within the workspace's longest
 * (`maxDays`; null for no limit). With a limit, "Never" goes and the limit itself is offered.
 */
export function expiryChoices(maxDays: number | null): { value: string; label: string }[] {
  const days = [1, 7, 30, 90, 365].filter((d) => maxDays === null || d < maxDays);
  if (maxDays !== null) days.push(maxDays);
  const label = (d: number) => (d === 1 ? '1 day' : d === 7 ? '1 week' : d === 365 ? '1 year' : `${d} days`);
  return [...(maxDays === null ? [{ value: '', label: 'Never expires' }] : []), ...days.map((d) => ({ value: String(d), label: `Expires in ${label(d)}` }))];
}
