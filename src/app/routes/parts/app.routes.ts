import { Routes } from '@angular/router';

export const appPublicRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('../../pages/login/login.page').then(m => m.LoginPage)
  },
  {
    path: 'register',
    loadComponent: () => import('../../pages/register/register.page').then(m => m.RegisterPage)
  },
  {
    path: 'link/:link',
    loadComponent: () => import('../../pages/link/link.page').then(m => m.LinkPage)
  },
  {
    path: 'donation',
    loadComponent: () => import('../../pages/donation/donation.page').then(m => m.DonationPage)
  },
  {
    path: 'contact',
    loadComponent: () => import('../../pages/contact/contact.page').then(m => m.ContactPage)
  },
  {
    path: 'try',
    loadComponent: () => import('../../pages/try/try.page').then(m => m.TryPage)
  },
  {
    path: 'search-route',
    data: { 'trailsType': 'search' },
    loadComponent: () => import('../../pages/trails/trails.page').then(m => m.TrailsPage)
  },
  {
    path: 'trail/trailence/:trailId',
    data: { 'trailOwner': 'trailence' },
    loadComponent: () => import('../../pages/trail/trail.page').then(m => m.TrailPage)
  }
];

export const appDefaultPublicRoute = 'login';

export const appAuthRoutes: Routes = [
  {
    path: 'trails/:trailsType',
    loadComponent: () => import('../../pages/trails/trails.page').then(m => m.TrailsPage)
  },
  {
    path: 'trails/:trailsType/:trailsId',
    loadComponent: () => import('../../pages/trails/trails.page').then(m => m.TrailsPage)
  },
  {
    path: 'trails/:trailsType/:trailsId/:trailsFrom',
    loadComponent: () => import('../../pages/trails/trails.page').then(m => m.TrailsPage)
  },
  {
    path: 'trail/:trailOwner/:trailId/:trailOwner2/:trailId2',
    loadComponent: () => import('../../pages/trail/trail.page').then(m => m.TrailPage)
  },
  {
    path: 'trail/:trailOwner/:trailId/:trailType',
    loadComponent: () => import('../../pages/trail/trail.page').then(m => m.TrailPage)
  },
  {
    path: 'trail/:trailOwner/:trailId',
    loadComponent: () => import('../../pages/trail/trail.page').then(m => m.TrailPage)
  },
  {
    path: 'trail',
    loadComponent: () => import('../../pages/trail/trail.page').then(m => m.TrailPage)
  },
  {
    path: 'preferences',
    loadComponent: () => import('../../pages/preferences/preferences.page').then(m => m.PreferencesPage)
  },
  {
    path: 'myaccount',
    loadComponent: () => import('../../pages/myaccount/myaccount.page').then(m => m.MyaccountPage)
  },
  {
    path: 'trail-planner',
    loadComponent: () => import('../../pages/trail-planner/trail-planner.page').then(m => m.TrailPlannerPage)
  },
  {
    path: 'notifications',
    loadComponent: () => import('../../pages/notifications/notifications.page').then(m => m.NotificationsPage)
  },
  {
    path: 'moderation',
    children: [
      {
        path: 'comments',
        loadComponent: () => import('../../pages/moderation/comments/moderation-comments.page').then(m => m.ModerationCommentsPage)
      },
    ]
  },
  {
    path: 'stats',
    loadComponent: () => import('../../pages/stats/stats.page').then(m => m.StatsPage)
  },
];

export const appDefaultAuthRoute = 'trails/collection/my_trails';
