import { Routes } from '@angular/router';
import { appAuthRoutes, appDefaultAuthRoute, appDefaultPublicRoute, appPublicRoutes } from './parts/app.routes';

export const publicRoutes: Routes = [
  ...appPublicRoutes
];

export const defaultPublicRoute = appDefaultPublicRoute;

export const authRoutes: Routes = [
  ...appAuthRoutes
];

export const defaultAuthRoute = appDefaultAuthRoute;
