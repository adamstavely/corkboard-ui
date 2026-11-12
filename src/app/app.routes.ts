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
      // The canvas, Yjs and Tiptap load with the first board opened.
      { path: 'boards/:id', title: 'Board · Corkboard', loadComponent: () => import('./features/board/board-page').then((m) => m.BoardPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
