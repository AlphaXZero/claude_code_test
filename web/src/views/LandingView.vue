<script setup lang="ts">
import { session } from '../api';
</script>

<template>
  <section class="hero">
    <div>
      <h1>Une scène de crime.<br />Un champ de texte.<br /><span class="accent">À toi d’écrire l’enquête.</span></h1>
      <p class="lead">
        Dans Case Prompt, tu ne cliques pas sur des indices : tu écris ce que tu fais. Un maître du jeu IA juge si ton idée tient
        la route et raconte la suite. Puis tu défends ton client devant le tribunal, avec les preuves que tu as trouvées.
      </p>
      <div class="row">
        <RouterLink :to="session.user ? '/enquetes' : '/inscription'" class="btn">Commencer une enquête</RouterLink>
        <a href="#offres" class="btn ghost">Voir les offres</a>
      </div>
    </div>
    <img src="/images/bureau-pdg.svg" alt="Un bureau de PDG la nuit, sous la pluie" />
  </section>

  <section class="steps">
    <div class="card">
      <h3>1. Enquête</h3>
      <p class="muted">« Je fouille la corbeille. » « Je crochète la porte avec une épingle. » Tout est permis, tout n’est pas crédible.</p>
    </div>
    <div class="card">
      <h3>2. Preuves</h3>
      <p class="muted">Chaque cas est écrit à la main : les indices existent vraiment, l’IA ne peut pas en inventer.</p>
    </div>
    <div class="card">
      <h3>3. Procès</h3>
      <p class="muted">Plaide face au juge. Sans preuve, il te le fera savoir. Plusieurs fins possibles.</p>
    </div>
  </section>

  <section id="offres">
    <h2>Offres</h2>
    <div class="plans">
      <div class="card plan">
        <h3>Gratuite</h3>
        <p class="price">0 €</p>
        <ul>
          <li>60 tours par jour</li>
          <li>Toutes les enquêtes publiées</li>
          <li>Parties sauvegardées</li>
        </ul>
        <RouterLink to="/inscription" class="btn ghost">Créer un compte</RouterLink>
      </div>
      <div class="card plan featured">
        <h3>Premium</h3>
        <p class="price">4,99 € <span class="muted small">/ mois</span></p>
        <ul>
          <li>600 tours par jour</li>
          <li>Nouvelles enquêtes en avant-première</li>
          <li>Soutient l’écriture des cas</li>
        </ul>
        <RouterLink to="/inscription" class="btn">Choisir Premium</RouterLink>
        <p class="muted small">Projet étudiant : pas de paiement en ligne, l’offre est activée par l’administrateur.</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero { display: grid; grid-template-columns: 1.1fr 1fr; gap: 32px; align-items: center; padding: 24px 0 40px; }
.hero img { width: 100%; border-radius: var(--radius); border: 1px solid var(--line); }
.accent { color: var(--amber); }
.lead { font-size: 1.1rem; color: var(--paper-dim); max-width: 60ch; }
.row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px; }
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 48px; }
.plans { display: grid; grid-template-columns: repeat(2, minmax(0, 340px)); gap: 20px; }
.plan ul { padding-left: 18px; margin: 0 0 18px; }
.plan.featured { border-color: var(--amber); }
.price { font-family: var(--type); font-size: 1.8rem; margin: 4px 0 12px; }
@media (max-width: 800px) {
  .hero, .steps, .plans { grid-template-columns: 1fr; }
}
</style>
