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
        path: 'trails/:trailsType/:trailsId',
        loadComponent: () => import('./pages/trails/trails.page').then( m => m.TrailsPage)
      },
      {
        path: 'trails/:trailsType/:trailsId/:trailsFrom',
        loadComponent: () => import('./pages/trails/trails.page').then( m => m.TrailsPage)
      },
      {
        path: 'trail/:trailOwner/:trailId',
        loadComponent: () => import('./pages/trail/trail.page').then( m => m.TrailPage)
      },
      {
        path: 'trail',
        loadComponent: () => import('./pages/trail/trail.page').then( m => m.TrailPage)
      },
      {
        path: 'preferences',
        loadComponent: () => import('./pages/preferences/preferences.page').then( m => m.PreferencesPage)
      },
      {
        path: '',
        redirectTo: 'trails/collection/my_trails',
        pathMatch: 'full',
      },
    ]
  },
];
