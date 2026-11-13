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
    access: 'Can view',
    opens: l.opens,
    ...(l.lastOpenedAt ? { lastOpenedAt: l.lastOpenedAt } : {}),
    ...(l.revoked ? { status: 'revoked' as const } : {}),
  }));
}
