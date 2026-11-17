<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, setSession } from '../api';

interface Me {
  email: string;
  plan: 'FREE' | 'PREMIUM';
  quota: { used: number; limit: number; left: number };
}

const router = useRouter();
const me = ref<Me | null>(null);
const confirming = ref(false);
const password = ref('');
const error = ref('');

onMounted(async () => {
  me.value = await api<Me>('/me');
});

async function deleteAccount() {
  error.value = '';
  try {
    await api('/me', { method: 'DELETE', body: { password: password.value } });
    setSession(null, null);
    router.push('/');
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>

<template>
  <h1>Mon compte</h1>
  <div v-if="me" class="stack">
    <section class="card">
      <p><strong>{{ me.email }}</strong></p>
      <p>Offre : <span class="badge">{{ me.plan === 'PREMIUM' ? 'Premium' : 'Gratuite' }}</span></p>
      <p>Tours joués aujourd’hui : {{ me.quota.used }} / {{ me.quota.limit }}</p>
      <div class="bar"><div :style="{ width: `${Math.min(100, (me.quota.used / me.quota.limit) * 100)}%` }" /></div>
    </section>

    <section class="card">
      <h2>Supprimer mon compte</h2>
      <p class="muted">Tes parties, tes tours et ton e-mail sont supprimés définitivement. Le journal des coûts est conservé sans aucun lien avec toi.</p>
      <button v-if="!confirming" class="btn danger" @click="confirming = true">Supprimer mon compte</button>
      <form v-else @submit.prevent="deleteAccount">
        <label>Confirme avec ton mot de passe <input v-model="password" type="password" autocomplete="current-password" required /></label>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="row">
          <button class="btn danger">Supprimer définitivement</button>
          <button type="button" class="link" @click="confirming = false">Annuler</button>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.stack { display: grid; gap: 20px; max-width: 640px; }
.bar { height: 8px; border-radius: 999px; background: var(--ink-3); overflow: hidden; }
.bar div { height: 100%; background: var(--amber); }
.row { display: flex; gap: 16px; align-items: center; }
</style>
