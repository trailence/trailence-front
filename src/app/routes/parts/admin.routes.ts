import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { AuthService } from 'src/app/services/auth/auth.service';

export const adminRoutes: Routes = [
  {
    path: 'admin',
    canActivate: [() => inject(AuthService).guardAdmin()],
    canActivateChild: [() => inject(AuthService).guardAdmin()],
    loadComponent: () => import('../../admin/pages/admin/admin.page').then(m => m.AdminPage),
    children: [
      {
        path: 'users',
        loadComponent: () => import('../../admin/pages/users/users.page').then(m => m.AdminUsersPage)
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'users'
      }
    ]
  }
];
