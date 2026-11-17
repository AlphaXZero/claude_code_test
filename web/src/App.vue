<script setup lang="ts">
import { useRouter } from 'vue-router';
import { session, setSession } from './api';

const router = useRouter();
function logout() {
  setSession(null, null);
  router.push('/');
}
</script>

<template>
  <header class="topbar">
    <RouterLink to="/" class="logo">Case<span>Prompt</span></RouterLink>
    <nav>
      <template v-if="session.user">
        <RouterLink to="/enquetes">Enquêtes</RouterLink>
        <RouterLink v-if="session.user.role === 'ADMINISTRATOR'" to="/admin">Admin</RouterLink>
        <RouterLink to="/compte">Compte</RouterLink>
        <button class="link" @click="logout">Déconnexion</button>
      </template>
      <template v-else>
        <RouterLink to="/connexion">Connexion</RouterLink>
        <RouterLink to="/inscription" class="btn small">Jouer</RouterLink>
      </template>
    </nav>
  </header>
  <main>
    <RouterView />
  </main>
  <footer class="footer">
    <RouterLink to="/mentions-legales">Mentions légales et données</RouterLink>
    <span>Les narrations sont générées par une IA.</span>
  </footer>
</template>
