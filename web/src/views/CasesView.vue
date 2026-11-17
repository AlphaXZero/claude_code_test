<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, type Game, imageUrl, outcomeLabel } from '../api';

interface CaseSummary {
  slug: string;
  title: string;
  side: 'DEFENCE' | 'PROSECUTION';
  intro: string;
  sceneImage: string;
  actionLimit: number;
  lastGame: { id: string; phase: Game['phase']; outcome: 'WIN' | 'MIXED' | 'LOSS' | null } | null;
}

const router = useRouter();
const cases = ref<CaseSummary[] | null>(null);
const error = ref('');

onMounted(async () => {
  try {
    cases.value = await api<CaseSummary[]>('/cases');
  } catch (e) {
    error.value = (e as Error).message;
  }
});

async function start(slug: string) {
  try {
    const g = await api<Game>('/games', { method: 'POST', body: { caseSlug: slug } });
    router.push(`/partie/${g.id}`);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>

<template>
  <h1>Enquêtes</h1>
  <p v-if="error" class="notice">{{ error }}</p>
  <p v-if="!cases && !error" class="muted">Chargement…</p>
  <p v-else-if="cases && !cases.length" class="muted">Aucune enquête publiée pour l’instant.</p>
  <div class="grid">
    <article v-for="c in cases" :key="c.slug" class="case card">
      <img :src="imageUrl(c.sceneImage)" alt="" />
      <div class="body">
        <div class="tags">
          <span class="badge">{{ c.side === 'DEFENCE' ? 'Défense' : 'Accusation' }}</span>
          <span class="badge">{{ c.actionLimit }} tours</span>
          <span v-if="c.lastGame?.outcome" class="badge" :class="c.lastGame.outcome.toLowerCase()">
            {{ outcomeLabel[c.lastGame.outcome] }}
          </span>
        </div>
        <h2>{{ c.title }}</h2>
        <p class="muted">{{ c.intro }}</p>
        <div class="actions">
          <template v-if="c.lastGame && c.lastGame.phase !== 'FINISHED'">
            <RouterLink :to="`/partie/${c.lastGame.id}`" class="btn">Reprendre</RouterLink>
            <button class="btn ghost" @click="start(c.slug)">Recommencer</button>
          </template>
          <template v-else-if="c.lastGame">
            <button class="btn" @click="start(c.slug)">Rejouer</button>
            <RouterLink :to="`/partie/${c.lastGame.id}`" class="btn ghost">Revoir la partie</RouterLink>
          </template>
          <button v-else class="btn" @click="start(c.slug)">Commencer</button>
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap: 20px; margin-top: 16px; }
.case { padding: 0; overflow: hidden; display: flex; flex-direction: column; }
.case img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; }
.body { padding: 16px 20px 20px; display: flex; flex-direction: column; flex: 1; }
.tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: auto; }
</style>
