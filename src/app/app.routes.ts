import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, RouterStateSnapshot, Routes } from '@angular/router';
import { AuthService } from './services/auth/auth.service';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then( m => m.LoginPage)
  },
  {
    path: '',
    canActivate: [(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => inject(AuthService).guardAuthenticated(route, state)],
    children: [
      {
        path: 'home',
        loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
      },
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full',
      },
    ]
  }
];
