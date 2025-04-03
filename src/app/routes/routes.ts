import { ActivatedRouteSnapshot, RouterStateSnapshot, Routes } from '@angular/router';
import { authRoutes, defaultAuthRoute, defaultPublicRoute, publicRoutes } from './package.routes';
import { AuthService } from '../services/auth/auth.service';
import { inject } from '@angular/core';

export const routes: Routes = [
  {
    path: 'fr',
    loadComponent: () => import('src/app/pages/public.page').then(m => m.PublicPageRoute),
    children: [...publicRoutes.filter(p => !p.path?.startsWith('link'))]
  },
  {
    path: 'en',
    loadComponent: () => import('src/app/pages/public.page').then(m => m.PublicPageRoute),
    children: [...publicRoutes.filter(p => !p.path?.startsWith('link'))]
  },
  ...publicRoutes.map(p => {
    if (p.path?.startsWith('link')) return p;
    return {
      path: p.path,
      loadComponent: () => import('src/app/pages/public.page').then(m => m.PublicPageWithoutLang),
    };
  }),
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
  { path: '**', redirectTo: defaultPublicRoute}
];
