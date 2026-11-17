<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '../api';

interface Stats {
  days: number;
  timezone: string;
  today: string;
  totals: { calls: number; cost: number; failures: number; costPerTurn: number };
  perDay: { day: string; calls: number; failures: number; cost: number; inputTokens: number; outputTokens: number; avgMs: number }[];
  perPlayer: { userId: string | null; email: string; plan: string | null; calls: number; cost: number }[];
  failures: { failure: string | null; count: number }[];
}
interface AdminUser { id: string; email: string; role: string; plan: 'FREE' | 'PREMIUM'; createdAt: string; _count: { games: number } }
interface FakeMode { mode: string; modes: string[]; provider: string }

const days = ref(30);
const stats = ref<Stats | null>(null);
const users = ref<AdminUser[]>([]);
const limits = ref<Record<string, number>>({});
const fake = ref<FakeMode | null>(null);
const error = ref('');
const metric = ref<'cost' | 'calls'>('cost');
const hover = ref<number | null>(null);

const modeLabels: Record<string, string> = {
  off: 'Désactivé (vrai fournisseur)',
  ok: 'Faux MJ, réponses normales',
  timeout: 'Panne : délai dépassé',
  unavailable: 'Panne : fournisseur indisponible',
  no_credit: 'Panne : crédit épuisé',
  invalid: 'Panne : réponse inutilisable',
};

const usd = (n: number) => (n < 0.01 && n > 0 ? `$${n.toFixed(5)}` : `$${n.toFixed(2)}`);

async function load() {
  error.value = '';
  try {
    const [s, u, f] = await Promise.all([
      api<Stats>(`/admin/stats?days=${days.value}`),
      api<{ users: AdminUser[]; planLimits: Record<string, number> }>('/admin/users'),
      api<FakeMode>('/admin/fake-mode'),
    ]);
    stats.value = s;
    users.value = u.users;
    limits.value = u.planLimits;
    fake.value = f;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);
watch(days, load);

/** Every day of the range, including days without calls. */
const series = computed(() => {
  if (!stats.value) return [];
  const byDay = new Map(stats.value.perDay.map((d) => [d.day, d]));
  const out = [];
  // Days are in the server's time zone (Paris); "today" comes from the server, not from the viewer's clock.
  const today = new Date(`${stats.value.today}T12:00:00Z`);
  for (let i = stats.value.days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = byDay.get(key);
    out.push({ day: key, cost: row?.cost ?? 0, calls: row?.calls ?? 0, failures: row?.failures ?? 0 });
  }
  return out;
});
const maxValue = computed(() => Math.max(...series.value.map((d) => d[metric.value]), metric.value === 'cost' ? 0.0001 : 1));
const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

async function setPlan(u: AdminUser, plan: 'FREE' | 'PREMIUM', select: HTMLSelectElement) {
  error.value = '';
  try {
    await api(`/admin/users/${u.id}/plan`, { method: 'PATCH', body: { plan } });
    u.plan = plan;
  } catch (e) {
    select.value = u.plan; // the change did not happen: show the real plan again
    error.value = (e as Error).message;
  }
}
async function setMode(mode: string) {
  error.value = '';
  try {
    fake.value = await api<FakeMode>('/admin/fake-mode', { method: 'PUT', body: { mode } });
  } catch (e) {
    error.value = (e as Error).message;
    // Reload to show the mode really in place.
    fake.value = await api<FakeMode>('/admin/fake-mode').catch(() => fake.value);
  }
}
</script>

<template>
  <div class="head">
    <h1>Tableau de bord</h1>
    <label class="range">
      Période
      <select v-model.number="days">
        <option :value="7">7 jours</option>
        <option :value="30">30 jours</option>
        <option :value="90">90 jours</option>
      </select>
    </label>
  </div>
  <p v-if="error" class="notice sticky-error" role="alert">{{ error }}</p>

  <template v-if="stats">
    <section class="tiles">
      <div class="card tile"><span class="muted small">Coût total</span><strong>{{ usd(stats.totals.cost) }}</strong></div>
      <div class="card tile"><span class="muted small">Appels à l’IA</span><strong>{{ stats.totals.calls }}</strong></div>
      <div class="card tile"><span class="muted small">Coût moyen par tour</span><strong>{{ usd(stats.totals.costPerTurn) }}</strong></div>
      <div class="card tile">
        <span class="muted small">Échecs</span><strong>{{ stats.totals.failures }}</strong>
        <span class="muted small">{{ stats.failures.map((f) => `${f.failure} ${f.count}`).join(' · ') || 'aucun' }}</span>
      </div>
    </section>

    <section class="card">
      <div class="chart-head">
        <h2>{{ metric === 'cost' ? 'Coût par jour (USD)' : 'Appels par jour' }}</h2>
        <div class="seg" role="group" aria-label="Mesure">
          <button :class="{ on: metric === 'cost' }" @click="metric = 'cost'">Coût</button>
          <button :class="{ on: metric === 'calls' }" @click="metric = 'calls'">Appels</button>
        </div>
      </div>
      <div class="chart" @mouseleave="hover = null">
        <div class="max muted small">{{ metric === 'cost' ? usd(maxValue) : maxValue }}</div>
        <div class="bars">
          <div
            v-for="(d, i) in series"
            :key="d.day"
            class="slot"
            @mouseenter="hover = i"
            @focus="hover = i"
            tabindex="0"
            :aria-label="`${shortDay(d.day)} : ${usd(d.cost)}, ${d.calls} appels`"
          >
            <div class="bar" :class="{ dim: hover !== null && hover !== i }" :style="{ height: `${(d[metric] / maxValue) * 100}%` }" />
          </div>
        </div>
        <div v-if="hover !== null" class="tip" :style="{ left: `${((hover + 0.5) / series.length) * 100}%` }">
          <strong>{{ shortDay(series[hover].day) }}</strong><br />
          {{ usd(series[hover].cost) }} · {{ series[hover].calls }} appels<span v-if="series[hover].failures"> · {{ series[hover].failures }} échecs</span>
        </div>
        <div class="axis muted small"><span>{{ shortDay(series[0].day) }}</span><span>{{ shortDay(series[series.length - 1].day) }}</span></div>
      </div>
      <details>
        <summary class="muted small">Voir le tableau</summary>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Jour</th><th class="num">Appels</th><th class="num">Échecs</th><th class="num">Jetons entrée</th><th class="num">Jetons sortie</th><th class="num">Durée moy.</th><th class="num">Coût</th></tr></thead>
            <tbody>
              <tr v-for="d in [...stats.perDay].reverse()" :key="d.day">
                <td>{{ d.day }}</td><td class="num">{{ d.calls }}</td><td class="num">{{ d.failures }}</td>
                <td class="num">{{ d.inputTokens }}</td><td class="num">{{ d.outputTokens }}</td><td class="num">{{ d.avgMs }} ms</td><td class="num">{{ usd(d.cost) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </section>

    <section class="card">
      <h2>Coût par joueur</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Joueur</th><th>Offre</th><th class="num">Appels</th><th class="num">Coût</th></tr></thead>
          <tbody>
            <tr v-for="p in stats.perPlayer" :key="p.userId ?? 'deleted'">
              <td>{{ p.email }}</td><td>{{ p.plan ?? '—' }}</td><td class="num">{{ p.calls }}</td><td class="num">{{ usd(p.cost) }}</td>
            </tr>
            <tr v-if="!stats.perPlayer.length"><td colspan="4" class="muted">Aucun appel sur la période.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </template>

  <section class="card">
    <h2>Joueurs et offres</h2>
    <p class="muted small">Limites : gratuite {{ limits.FREE }} tours/jour, premium {{ limits.PREMIUM }} tours/jour.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>E-mail</th><th>Rôle</th><th class="num">Parties</th><th>Offre</th></tr></thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td>{{ u.email }}</td>
            <td>{{ u.role === 'ADMINISTRATOR' ? 'Admin' : 'Joueur' }}</td>
            <td class="num">{{ u._count.games }}</td>
            <td>
              <select :value="u.plan" :aria-label="`Offre de ${u.email}`" @change="setPlan(u, ($event.target as HTMLSelectElement).value as 'FREE' | 'PREMIUM', $event.target as HTMLSelectElement)">
                <option value="FREE">Gratuite</option>
                <option value="PREMIUM">Premium</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section v-if="fake" class="card">
    <h2>Simulateur de pannes</h2>
    <p class="muted small">Fournisseur configuré : <strong>{{ fake.provider }}</strong>. Un mode autre que « désactivé » remplace l’IA pour tous les joueurs.</p>
    <div class="modes">
      <label v-for="m in fake.modes" :key="m" class="mode" :class="{ on: fake.mode === m }">
        <input type="radio" name="fake" :checked="fake.mode === m" @change="setMode(m)" />
        {{ modeLabels[m] ?? m }}
      </label>
    </div>
  </section>
</template>

<style scoped>
.sticky-error { position: sticky; top: 70px; z-index: 5; background: #2a1716; }
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.range select { width: auto; margin-left: 8px; }
section.card { margin-top: 20px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 16px; margin-top: 12px; }
.tile { display: flex; flex-direction: column; gap: 4px; padding: 16px; }
.tile strong { font-size: 1.6rem; font-variant-numeric: tabular-nums; }

.chart-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; }
.seg button { background: none; border: 0; color: var(--paper-dim); padding: 4px 12px; font: inherit; font-size: 0.85rem; cursor: pointer; }
.seg button.on { background: var(--ink-3); color: var(--paper); }

.chart { position: relative; margin: 8px 0 12px; }
.max { position: absolute; top: -2px; left: 0; }
.bars { display: flex; align-items: flex-end; height: 200px; padding-top: 18px; border-bottom: 1px solid var(--line); }
.slot { flex: 1; height: 100%; display: flex; align-items: flex-end; padding: 0 1px; cursor: default; outline: none; }
.bar { width: 100%; min-height: 0; background: var(--amber); border-radius: 4px 4px 0 0; transition: opacity 0.15s; }
.bar.dim { opacity: 0.45; }
.tip { position: absolute; top: 0; transform: translateX(-50%); background: var(--ink-3); border: 1px solid var(--line); border-radius: 8px;
  padding: 6px 10px; font-size: 0.8rem; white-space: nowrap; pointer-events: none; z-index: 2; }
.axis { display: flex; justify-content: space-between; margin-top: 4px; }

.modes { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px; }
.mode { display: flex; gap: 8px; align-items: center; margin: 0; padding: 8px 12px; border: 1px solid var(--line); border-radius: var(--radius); color: var(--paper); cursor: pointer; }
.mode input { width: auto; }
.mode.on { border-color: var(--amber); }
td select { width: auto; padding: 4px 8px; }
</style>
