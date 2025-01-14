import { Routes } from '@angular/router';
import { appAuthRoutes, appDefaultAuthRoute, appDefaultPublicRoute, appPublicRoutes } from './parts/app.routes';
import { adminRoutes } from './parts/admin.routes';

export const publicRoutes: Routes = [
  ...appPublicRoutes
];

export const defaultPublicRoute = appDefaultPublicRoute;

export const authRoutes: Routes = [
  ...appAuthRoutes,
  ...adminRoutes,
];

export const defaultAuthRoute = appDefaultAuthRoute;
