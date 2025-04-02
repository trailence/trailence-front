import { Routes } from '@angular/router';
import { appAuthRoutes, appDefaultAuthRoute, appPublicRoutes } from './parts/app.routes';
import { adminRoutes } from './parts/admin.routes';
import { siteDefaultPublicRoute, sitePublicRoutes } from './parts/site.routes';

export const publicRoutes: Routes = [
  ...appPublicRoutes,
  ...sitePublicRoutes,
];

export const defaultPublicRoute = siteDefaultPublicRoute;

export const authRoutes: Routes = [
  ...appAuthRoutes,
  ...adminRoutes,
];

export const defaultAuthRoute = appDefaultAuthRoute;
