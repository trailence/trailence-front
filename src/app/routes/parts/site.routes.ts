import { Routes } from '@angular/router';

export const sitePublicRoutes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('../../pages/home/home.page').then(m => m.HomePage)
  }, {
    path: 'install-apk',
    loadComponent: () => import('../../pages/install-apk/install-apk.page').then(m => m.InstallApkPage)
  }
];

export const siteDefaultPublicRoute = 'home';
