/** The four roles, least first; each can do everything the ones before it can. Matches the API's. */
export const ROLES = ['reader', 'commenter', 'updater', 'owner'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  reader: 'Reader',
  commenter: 'Commenter',
  updater: 'Updater',
  owner: 'Owner',
};

/** The roles as a picker's options, least first. */
export const ROLE_LEVELS = ROLES.map((id) => ({ id, label: ROLE_LABELS[id] }));

export const atLeast = (role: Role | null | undefined, min: Role) => !!role && ROLES.indexOf(role) >= ROLES.indexOf(min);

/** "a reader", "an owner" – for sentences. */
export const aRole = (role: Role) => `${role === 'owner' || role === 'updater' ? 'an' : 'a'} ${role}`;
