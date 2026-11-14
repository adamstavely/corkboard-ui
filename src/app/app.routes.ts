import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { pendingWorkGuard } from './core/pending-work';

export const routes: Routes = [
  // Anyone with a share link: no picking who you are.
  {
    path: 'shared/:token',
    title: 'Shared board · Corkboard',
    canDeactivate: [pendingWorkGuard],
    loadComponent: () => import('./features/shared/shared-board').then((m) => m.SharedBoard),
  },
  { path: 'who', title: 'Sign in · Corkboard', loadComponent: () => import('./features/who/who-page').then((m) => m.WhoPage) },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', title: 'Boards · Corkboard', loadComponent: () => import('./features/boards/board-list').then((m) => m.BoardList) },
      { path: 'models', title: 'AI models · Corkboard', loadComponent: () => import('./features/models/models-page').then((m) => m.ModelsPage) },
      { path: 'account', title: 'Passkeys · Corkboard', loadComponent: () => import('./features/account/account-page').then((m) => m.AccountPage) },
      { path: 'admin', title: 'Workspace admin · Corkboard', loadComponent: () => import('./features/admin/admin-page').then((m) => m.AdminPage) },
      { path: 'integrations', title: 'Integrations · Corkboard', loadComponent: () => import('./features/integrations/integrations-page').then((m) => m.IntegrationsPage) },
      { path: 'invite/:token', title: 'Invite · Corkboard', loadComponent: () => import('./features/members/invite-page').then((m) => m.InvitePage) },
      { path: 'members', title: 'Members · Corkboard', loadComponent: () => import('./features/members/members-page').then((m) => m.MembersPage) },
      // The canvas, Yjs and Tiptap load with the first board opened.
      { path: 'boards/:id', title: 'Board · Corkboard', canDeactivate: [pendingWorkGuard], loadComponent: () => import('./features/board/board-page').then((m) => m.BoardPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
