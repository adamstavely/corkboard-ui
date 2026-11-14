import type { ShareGrant, ShareRecipient, ShareSubmit } from '@adamstavely/trenchcoat/share-panel';
import type { MembersDto } from '../../api/generated/models/members-dto';

import type { Role } from '../../core/roles';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What a share-panel row stands for: someone in the workspace, an open invite, or an email to invite. */
export type Target = { kind: 'member'; userId: string } | { kind: 'invite'; inviteId: string } | { kind: 'email'; email: string };

export function targetOf(recipient: ShareRecipient): Target {
  const [kind, ...rest] = recipient.id.split(':');
  const value = rest.join(':');
  if (kind === 'user') return { kind: 'member', userId: value };
  if (kind === 'invite') return { kind: 'invite', inviteId: value };
  return { kind: 'email', email: value };
}

/** Members and open invites as the share panel's access list. */
export function accessOf(list: MembersDto, meId: string | undefined): ShareGrant[] {
  return [
    ...list.members.map((m) => ({
      recipient: {
        id: `user:${m.userId}`,
        kind: 'person' as const,
        // "You" goes in the detail: in the name it would become part of the initials.
        name: m.name,
        detail: m.userId === meId ? ['You', m.email].filter(Boolean).join(' · ') : (m.email ?? undefined),
      },
      level: m.role,
    })),
    ...list.invites.map((i) => ({
      recipient: { id: `invite:${i.id}`, kind: 'person' as const, name: i.email, detail: 'Invited – joins through their link' },
      level: i.role,
    })),
  ];
}

/** What the panel offers for what's typed: an email becomes someone to invite, unless they're already listed. */
export function searchFor(query: string, list: MembersDto): ShareRecipient[] {
  const email = query.trim().toLowerCase();
  if (!EMAIL.test(email)) return [];
  const taken = list.members.some((m) => m.email?.toLowerCase() === email) || list.invites.some((i) => i.email === email);
  return taken ? [] : [{ id: `email:${email}`, kind: 'person', name: email, detail: 'Invite by email' }];
}

/** One API call for each change made in the panel. */
export type Change =
  | { op: 'invite'; email: string; role: Role }
  | { op: 'changeInvite'; inviteId: string; role: Role }
  | { op: 'revokeInvite'; inviteId: string }
  | { op: 'changeRole'; userId: string; role: Role }
  | { op: 'remove'; userId: string };

export function changesOf(submit: Pick<ShareSubmit, 'add' | 'change' | 'remove'>): Change[] {
  const changes: Change[] = [];
  for (const { recipient, level } of [...submit.add, ...submit.change]) {
    const target = targetOf(recipient);
    const role = level as Role;
    if (target.kind === 'email') changes.push({ op: 'invite', email: target.email, role });
    else if (target.kind === 'invite') changes.push({ op: 'changeInvite', inviteId: target.inviteId, role });
    else changes.push({ op: 'changeRole', userId: target.userId, role });
  }
  for (const recipient of submit.remove) {
    const target = targetOf(recipient);
    if (target.kind === 'invite') changes.push({ op: 'revokeInvite', inviteId: target.inviteId });
    else if (target.kind === 'member') changes.push({ op: 'remove', userId: target.userId });
  }
  return changes;
}
