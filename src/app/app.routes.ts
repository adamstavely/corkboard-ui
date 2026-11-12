import { Routes } from '@angular/router';
import { AuthCallback } from './core/auth-callback';
import { authGuard } from './core/auth.guard';
import { CALLBACK_PATH } from './core/auth';

export const routes: Routes = [
  { path: CALLBACK_PATH.slice(1), component: AuthCallback },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', title: 'Boards · Corkboard', loadComponent: () => import('./features/boards/board-list').then((m) => m.BoardList) },
      { path: 'models', title: 'AI models · Corkboard', loadComponent: () => import('./features/models/models-page').then((m) => m.ModelsPage) },
      { path: 'members', title: 'Members · Corkboard', loadComponent: () => import('./features/members/members-page').then((m) => m.MembersPage) },
      // The canvas, Yjs and Tiptap load with the first board opened.
      { path: 'boards/:id', title: 'Board · Corkboard', loadComponent: () => import('./features/board/board-page').then((m) => m.BoardPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
