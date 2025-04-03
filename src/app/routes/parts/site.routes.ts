import { Routes } from '@angular/router';

export const sitePublicRoutes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('../../pages/home/home.page').then(m => m.HomePage)
  }
];

export const siteDefaultPublicRoute = 'home';
