import { createRouter, createWebHistory } from 'vue-router';
import { session } from './api';

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', component: () => import('./views/LandingView.vue'), meta: { public: true } },
    { path: '/connexion', component: () => import('./views/AuthView.vue'), props: { mode: 'login' }, meta: { public: true } },
    { path: '/inscription', component: () => import('./views/AuthView.vue'), props: { mode: 'register' }, meta: { public: true } },
    { path: '/mentions-legales', component: () => import('./views/LegalView.vue'), meta: { public: true } },
    { path: '/enquetes', component: () => import('./views/CasesView.vue') },
    { path: '/partie/:id', component: () => import('./views/GameView.vue'), props: true },
    { path: '/compte', component: () => import('./views/AccountView.vue') },
    { path: '/admin', component: () => import('./views/AdminView.vue'), meta: { admin: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach((to) => {
  if (!to.meta.public && !session.token) return { path: '/connexion', query: { suite: to.fullPath } };
  if (to.meta.admin && session.user?.role !== 'ADMINISTRATOR') return '/enquetes';
});

export default router;
