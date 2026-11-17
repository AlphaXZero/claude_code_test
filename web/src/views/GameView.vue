<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError, type Game, imageUrl, outcomeLabel, type TurnResult } from '../api';

const props = defineProps<{ id: string }>();
const router = useRouter();

const MAX_TEXT = 500;
const game = ref<Game | null>(null);
const loadError = ref('');
const text = ref('');
const pending = ref<string | null>(null);
const error = ref('');
const gained = ref<string[]>([]);
const confirmResolution = ref(false);
const showFile = ref(false);
const log = ref<HTMLElement | null>(null);

const inResolution = computed(() => game.value?.phase !== 'INVESTIGATION');
const sceneImage = computed(() =>
  game.value ? imageUrl(inResolution.value ? game.value.case.resolutionImage : game.value.case.sceneImage) : '',
);
const evidence = computed(() => game.value?.items.filter((i) => i.evidence) ?? []);
const otherItems = computed(() => game.value?.items.filter((i) => !i.evidence) ?? []);
const role = computed(() => (game.value?.case.side === 'DEFENCE' ? 'la défense' : 'l’accusation'));
const placeholder = computed(() =>
  game.value?.phase === 'RESOLUTION'
    ? 'Plaide ta cause, appuie-toi sur tes preuves…'
    : 'Que fais-tu ? Ex. : « J’ouvre le tiroir du bureau »',
);

async function scrollDown() {
  await nextTick();
  log.value?.scrollTo({ top: log.value.scrollHeight, behavior: 'smooth' });
}

onMounted(async () => {
  try {
    game.value = await api<Game>(`/games/${props.id}`);
    scrollDown();
  } catch (e) {
    loadError.value = (e as Error).message;
  }
});

async function send() {
  const value = text.value.trim();
  if (!value || pending.value || !game.value) return;
  error.value = '';
  gained.value = [];
  pending.value = value;
  text.value = '';
  scrollDown();
  try {
    const r = await api<TurnResult>(`/games/${props.id}/turns`, { method: 'POST', body: { text: value } });
    game.value = r.game;
    gained.value = r.gained;
  } catch (e) {
    // The turn is not counted: the player's text goes back into the field.
    text.value = value;
    error.value = e instanceof ApiError ? e.message : 'Une erreur est survenue.';
  } finally {
    pending.value = null;
    scrollDown();
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

async function goToResolution() {
  confirmResolution.value = false;
  try {
    game.value = await api<Game>(`/games/${props.id}/resolution`, { method: 'POST' });
    scrollDown();
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function replay() {
  if (!game.value) return;
  const g = await api<Game>('/games', { method: 'POST', body: { caseSlug: game.value.case.slug } });
  await router.push(`/partie/${g.id}`);
  game.value = g;
  text.value = '';
  error.value = '';
}
</script>

<template>
  <p v-if="loadError" class="notice">{{ loadError }} <RouterLink to="/enquetes">Retour aux enquêtes</RouterLink></p>
  <div v-else-if="!game" class="muted">Chargement du dossier…</div>

  <div v-else class="game" :class="{ court: inResolution }">
    <!-- Scene and evidence file -->
    <aside class="side">
      <figure class="scene">
        <img :src="sceneImage" :alt="inResolution ? `Le tribunal, face à ${game.case.resolutionCharacter}` : `La scène : ${game.case.title}`" />
        <figcaption>
          <strong>{{ inResolution ? game.case.resolutionCharacter : game.case.title }}</strong>
          <span v-if="game.phase === 'INVESTIGATION'" class="counter" :class="{ low: game.actionsLeft <= 3 }">
            {{ game.actionsLeft }} / {{ game.actionLimit }} tours
          </span>
          <span v-else-if="game.phase === 'RESOLUTION'" class="counter">{{ game.resolutionTurnsLeft }} échanges max.</span>
        </figcaption>
      </figure>

      <section class="file card">
        <button class="file-toggle" :aria-expanded="showFile" @click="showFile = !showFile">
          <h2>Dossier</h2>
          <span class="muted small">{{ evidence.length }} / {{ game.evidenceTotal }} preuves</span>
        </button>
        <div class="file-body" :class="{ open: showFile }">
          <p v-if="!game.items.length" class="muted small">Rien pour l’instant. Fouille la scène.</p>
          <ul>
            <li v-for="i in evidence" :key="i.code"><span class="pin">◆</span>{{ i.name }}</li>
            <li v-for="i in otherItems" :key="i.code" class="muted"><span class="pin">◇</span>{{ i.name }}</li>
          </ul>
        </div>
      </section>
    </aside>

    <!-- Conversation -->
    <section class="play">
      <div ref="log" class="log" aria-live="polite">
        <div class="intro">
          <h1>{{ game.case.title }}</h1>
          <p>{{ game.case.intro }}</p>
          <p class="muted small">Écris librement ce que tu fais. Tu représentes {{ role }}.</p>
        </div>

        <template v-for="(t, idx) in game.turns" :key="t.number">
          <div v-if="t.phase === 'RESOLUTION' && game.turns[idx - 1]?.phase !== 'RESOLUTION'" class="divider">
            Le procès — face à {{ game.case.resolutionCharacter }}
          </div>
          <div class="msg player">{{ t.playerText }}</div>
          <div class="msg gm">
            <span class="ai-label">Généré par IA</span>
            <p>{{ t.narration }}</p>
          </div>
          <div v-if="t.result" class="msg result">{{ t.result }}</div>
        </template>

        <div v-if="game.phase === 'RESOLUTION' && !game.turns.some((t) => t.phase === 'RESOLUTION')" class="divider">
          Le procès — face à {{ game.case.resolutionCharacter }}
        </div>

        <template v-if="pending">
          <div class="msg player">{{ pending }}</div>
          <div class="msg gm thinking">Le maître du jeu réfléchit<span class="dots">…</span></div>
        </template>

        <div v-if="gained.length" class="gained">Ajouté au dossier : {{ gained.join(', ') }}</div>

        <div v-if="game.ending" class="ending card">
          <span class="badge" :class="game.ending.outcome.toLowerCase()">{{ outcomeLabel[game.ending.outcome] }}</span>
          <p class="ending-text">{{ game.ending.text }}</p>
          <div class="row">
            <button class="btn" @click="replay">Rejouer l’enquête</button>
            <RouterLink to="/enquetes" class="btn ghost">Autres enquêtes</RouterLink>
          </div>
        </div>
      </div>

      <form v-if="game.phase !== 'FINISHED'" class="composer" @submit.prevent="send">
        <p v-if="error" class="notice" role="alert">{{ error }}</p>
        <textarea
          v-model="text"
          :placeholder="placeholder"
          :maxlength="MAX_TEXT"
          rows="2"
          :disabled="!!pending"
          aria-label="Ton action"
          @keydown="onKey"
        />
        <div class="row">
          <span class="muted small">{{ text.length }} / {{ MAX_TEXT }}</span>
          <template v-if="game.phase === 'INVESTIGATION'">
            <button v-if="!confirmResolution" type="button" class="btn ghost small" @click="confirmResolution = true">
              Passer au procès
            </button>
            <span v-else class="confirm small">
              Fin de l’enquête ?
              <button type="button" class="btn small" @click="goToResolution">Oui, au procès</button>
              <button type="button" class="link" @click="confirmResolution = false">Annuler</button>
            </span>
          </template>
          <button class="btn" :disabled="!text.trim() || !!pending">Envoyer</button>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.game { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 20px; align-items: start; }
.side { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 16px; }
.scene { margin: 0; border-radius: var(--radius); overflow: hidden; border: 1px solid var(--line); background: var(--ink-2); }
.scene img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; }
.scene figcaption { display: flex; justify-content: space-between; gap: 8px; padding: 10px 14px; font-size: 0.9rem; }
.counter { font-variant-numeric: tabular-nums; color: var(--paper-dim); }
.counter.low { color: var(--red); }

.file { padding: 14px 16px; }
.file-toggle { all: unset; display: flex; width: 100%; justify-content: space-between; align-items: baseline; cursor: default; }
.file-toggle h2 { margin: 0; font-size: 1.15rem; }
.file ul { list-style: none; margin: 10px 0 0; padding: 0; }
.file li { padding: 4px 0; }
.pin { color: var(--amber); margin-right: 8px; font-size: 0.8rem; }

.play { display: flex; flex-direction: column; min-height: calc(100vh - 160px); }
.log { flex: 1; display: flex; flex-direction: column; gap: 10px; padding-bottom: 12px; }
.intro { padding-bottom: 8px; border-bottom: 1px dashed var(--line); margin-bottom: 6px; }

.msg { max-width: 92%; padding: 10px 14px; border-radius: var(--radius); white-space: pre-wrap; overflow-wrap: anywhere; }
.msg p { margin: 0; }
.msg.player { align-self: flex-end; background: var(--ink-3); border: 1px solid var(--line); }
.msg.gm { align-self: flex-start; background: var(--ink-2); border: 1px solid var(--line); border-left: 3px solid var(--amber); }
.msg.result { align-self: flex-start; font-family: var(--type); background: var(--paper); color: var(--ink); border-radius: 4px; transform: rotate(-0.3deg); }
.ai-label { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 2px; }
.thinking { color: var(--muted); font-style: italic; }
.dots { animation: blink 1.2s infinite; }
@keyframes blink { 50% { opacity: 0.2; } }
.gained { align-self: center; font-size: 0.85rem; color: var(--amber); border: 1px dashed var(--amber); border-radius: 999px; padding: 4px 12px; }
.divider { text-align: center; font-family: var(--type); color: var(--amber); margin: 14px 0 4px; }

.ending { margin-top: 12px; border-color: var(--amber); }
.ending-text { font-family: var(--type); font-size: 1.05rem; margin: 12px 0 16px; }

.composer { position: sticky; bottom: 0; padding: 12px 0 calc(8px + env(safe-area-inset-bottom, 0px)); background: var(--ink); border-top: 1px solid var(--line); }
.composer textarea { resize: vertical; min-height: 60px; }
.composer .notice { margin: 0 0 8px; }
.row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
.composer .row > :first-child { margin-right: auto; }
.confirm { display: inline-flex; align-items: center; gap: 8px; }

@media (max-width: 800px) {
  .game { grid-template-columns: 1fr; }
  .side { position: static; }
  .scene img { aspect-ratio: 16 / 9; }
  .file-toggle { cursor: pointer; }
  .file-body { display: none; }
  .file-body.open { display: block; }
  .play { min-height: 0; }
}
</style>
