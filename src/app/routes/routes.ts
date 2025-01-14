import { ActivatedRouteSnapshot, RouterStateSnapshot, Routes } from '@angular/router';
import { authRoutes, defaultAuthRoute, defaultPublicRoute, publicRoutes } from './package.routes';
import { AuthService } from '../services/auth/auth.service';
import { inject } from '@angular/core';

export const routes: Routes = [
  ...publicRoutes,
  {
    path: '',
    canMatch: [(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => inject(AuthService).guardAuthenticated(route, state)],
    canActivate: [(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => inject(AuthService).guardAuthenticated(route, state)],
    canActivateChild: [(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => inject(AuthService).guardAuthenticated(route, state)],
    children: [
      ...authRoutes,
      {
        path: '',
        pathMatch: 'full',
        redirectTo: defaultAuthRoute,
      }
    ]
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: defaultPublicRoute,
  },
  { path: '**', redirectTo: ''}
];
