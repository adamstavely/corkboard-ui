import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'who', title: 'Who are you? · Corkboard', loadComponent: () => import('./features/who/who-page').then((m) => m.WhoPage) },
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
