<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, setSession, type User } from '../api';

const props = defineProps<{ mode: 'login' | 'register' }>();
const route = useRoute();
const router = useRouter();
const email = ref('');
const password = ref('');
const accept = ref(false);
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  if (props.mode === 'register' && !accept.value) {
    error.value = 'Accepte les conditions pour créer un compte.';
    return;
  }
  busy.value = true;
  try {
    const r = await api<{ token: string; user: User }>(`/auth/${props.mode}`, {
      method: 'POST',
      body: { email: email.value, password: password.value },
    });
    setSession(r.token, r.user);
    const next = typeof route.query.suite === 'string' && route.query.suite.startsWith('/') ? route.query.suite : '/enquetes';
    router.push(next);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="auth card">
    <h1>{{ mode === 'login' ? 'Connexion' : 'Créer un compte' }}</h1>
    <form @submit.prevent="submit">
      <label>E-mail <input v-model="email" type="email" autocomplete="email" required /></label>
      <label>
        Mot de passe
        <input v-model="password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" minlength="8" required />
      </label>
      <label v-if="mode === 'register'" class="check">
        <input v-model="accept" type="checkbox" />
        <span>J’ai lu les <RouterLink to="/mentions-legales">mentions légales</RouterLink> et je sais que les narrations sont générées par une IA.</span>
      </label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button class="btn" :disabled="busy">{{ mode === 'login' ? 'Se connecter' : 'Créer mon compte' }}</button>
    </form>
    <p class="muted small switch">
      <template v-if="mode === 'login'">Pas encore de compte ? <RouterLink to="/inscription">Inscris-toi</RouterLink></template>
      <template v-else>Déjà inscrit ? <RouterLink to="/connexion">Connecte-toi</RouterLink></template>
    </p>
  </div>
</template>

<style scoped>
.auth { max-width: 420px; margin: 32px auto; }
.check { display: flex; gap: 10px; align-items: flex-start; }
.check input { width: auto; margin-top: 4px; }
.switch { margin-top: 16px; }
</style>
