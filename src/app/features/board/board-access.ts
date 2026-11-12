import type { ShareEntitlement, ShareGrant, ShareRecipient, ShareSubmit } from '@adamstavely/trenchcoat/share-panel';
import type { BoardMemberDto } from '../../api/generated/models/board-member-dto';
import { ROLE_LABELS, type Role } from '../../core/roles';

const recipientOf = (m: BoardMemberDto, meId: string | undefined): ShareRecipient => ({
  id: m.userId,
  kind: 'person',
  // "You" goes in the detail: in the name it would become part of the initials.
  name: m.name,
  detail: `${m.userId === meId ? 'You · ' : ''}${
    m.workspaceRole === 'owner'
      ? 'Workspace owner – owns every board'
      : m.boardRole === null
        ? `${ROLE_LABELS[m.workspaceRole]} in the workspace`
        : `${ROLE_LABELS[m.workspaceRole]} in the workspace, set here`
  }`,
});

/** People who can open the board, at their role on it, for the share panel. */
export function boardAccessOf(members: readonly BoardMemberDto[], meId: string | undefined): ShareGrant[] {
  return members.filter((m) => m.role !== null).map((m) => ({ recipient: recipientOf(m, meId), level: m.role! }));
}

/** Workspace members kept from the board, whom the panel's search can add back. */
export function boardDirectoryOf(members: readonly BoardMemberDto[]): ShareRecipient[] {
  return members.filter((m) => m.role === null).map((m) => ({ ...recipientOf(m, undefined), detail: `${m.email ?? m.name} · no access to this board` }));
}

/** Workspace owners own every board: the panel says so rather than letting it be changed. */
export function boardEntitlement(members: readonly BoardMemberDto[], recipient: ShareRecipient, level: string): ShareEntitlement {
  const member = members.find((m) => m.userId === recipient.id);
  if (member?.workspaceRole === 'owner' && level !== 'owner') {
    return { status: 'denied', reason: 'Workspace owners own every board. Change their role on the Members page instead.' };
  }
  return { status: 'allowed' };
}

/** One board role to set per change: back to the workspace role when that's what was picked; `none` for removed. */
export function boardChangesOf(
  members: readonly BoardMemberDto[],
  submit: Pick<ShareSubmit, 'add' | 'change' | 'remove'>,
): { userId: string; role: Role | 'none' | null }[] {
  const workspaceRole = (id: string) => members.find((m) => m.userId === id)?.workspaceRole;
  return [
    ...[...submit.add, ...submit.change].map(({ recipient, level }) => ({
      userId: recipient.id,
      role: level === workspaceRole(recipient.id) ? null : (level as Role),
    })),
    ...submit.remove.map((r) => ({ userId: r.id, role: 'none' as const })),
  ];
}
