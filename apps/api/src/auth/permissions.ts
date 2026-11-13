import { Role } from '@prisma/client';

export type Permission =
  | 'org:read'
  | 'org:update'
  | 'members:read'
  | 'members:invite'
  | 'members:update'
  | 'members:remove'
  | 'brand:read'
  | 'brand:write'
  | 'media:read'
  | 'media:write'
  | 'media:delete'
  | 'ai:use'
  | 'ai:admin'
  | 'source:read'
  | 'source:write'
  | 'content:read'
  | 'content:write'
  | 'content:review'
  | 'content:schedule'
  | 'analytics:read'
  | 'campaign:read'
  | 'campaign:write'
  | 'channel:read'
  | 'channel:write'
  | 'design:read'
  | 'design:write';

const ALL_ROLES: Role[] = [
  Role.OWNER,
  Role.ADMIN,
  Role.EDITOR,
  Role.DESIGNER,
  Role.APPROVER,
  Role.PUBLISHER,
  Role.VIEWER,
];
const MANAGERS: Role[] = [Role.OWNER, Role.ADMIN];

export const PERMISSIONS: Record<Permission, Role[]> = {
  'org:read': ALL_ROLES,
  'org:update': MANAGERS,
  'members:read': ALL_ROLES,
  'members:invite': MANAGERS,
  'members:update': MANAGERS,
  'members:remove': MANAGERS,
  'brand:read': ALL_ROLES,
  'brand:write': [Role.OWNER, Role.ADMIN, Role.DESIGNER],
  'media:read': ALL_ROLES,
  'media:write': [Role.OWNER, Role.ADMIN, Role.EDITOR, Role.DESIGNER],
  'media:delete': [Role.OWNER, Role.ADMIN, Role.DESIGNER],
  'ai:use': [Role.OWNER, Role.ADMIN, Role.EDITOR, Role.DESIGNER],
  'ai:admin': MANAGERS,
  'source:read': ALL_ROLES,
  'source:write': [Role.OWNER, Role.ADMIN, Role.EDITOR, Role.DESIGNER],
  'content:read': ALL_ROLES,
  'content:write': [Role.OWNER, Role.ADMIN, Role.EDITOR, Role.DESIGNER],
  'content:review': [Role.OWNER, Role.ADMIN, Role.APPROVER],
  'content:schedule': [Role.OWNER, Role.ADMIN, Role.PUBLISHER],
  'analytics:read': ALL_ROLES,
  'campaign:read': ALL_ROLES,
  'campaign:write': [Role.OWNER, Role.ADMIN, Role.EDITOR, Role.DESIGNER],
  'design:read': ALL_ROLES,
  'design:write': [Role.OWNER, Role.ADMIN, Role.EDITOR, Role.DESIGNER],
  'channel:read': ALL_ROLES,
  'channel:write': MANAGERS,
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return PERMISSIONS[permission].includes(role);
}

/** Only owners may grant or change the OWNER role; admins cannot touch owners. */
export function canAssignRole(actor: Role, target: Role): boolean {
  if (actor === Role.OWNER) return true;
  return actor === Role.ADMIN && target !== Role.OWNER;
}

export function canModifyMember(actor: Role, memberCurrent: Role): boolean {
  if (actor === Role.OWNER) return true;
  return actor === Role.ADMIN && memberCurrent !== Role.OWNER;
}
