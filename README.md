# Case Prompt

Jeu d'enquête dans le navigateur. Le joueur écrit librement ce qu'il fait sur une scène de crime ; un maître du jeu IA juge si l'action est crédible, déclenche les actions prévues par le scénario et raconte le résultat. Puis le joueur plaide au procès avec les preuves trouvées, et l'histoire atteint une des fins écrites à l'avance.

L'analyse complète (format des cas, tour de jeu, prompts, diagramme de classes, MoSCoW, planning) est dans [`docs/case_prompt_analysis.md`](docs/case_prompt_analysis.md).

## Structure

```
server/            API NestJS 11 + Prisma 6 (PostgreSQL)
  cases/           Les enquêtes, un fichier JSON par cas (rechargées à chaque démarrage)
  prompts/         Prompts système de l'enquête et du procès ({{ }} remplis par le serveur)
  prisma/          Schéma et migrations
  src/game/engine.ts   Moteur de jeu : fonctions pures (actions disponibles, vérifications, effets)
  src/ai/          Fournisseurs IA : OpenRouter et faux fournisseur (pannes simulées)
  test/            Tests du moteur avec le faux fournisseur
web/               Front Vue 3 + Vite, servi par Caddy en production
docker-compose.yml PostgreSQL + API + Caddy (HTTPS automatique)
```

## Lancer en local

Prérequis : Node 22 et un PostgreSQL (par exemple `docker run -d -p 5432:5432 -e POSTGRES_USER=caseprompt -e POSTGRES_PASSWORD=caseprompt postgres:17-alpine`).

```bash
# API
cd server
cp .env.example .env          # AI_PROVIDER=fake par défaut : aucune clé nécessaire
npm install
npx prisma migrate deploy
npm run build && npm start    # http://localhost:3000/api, charge les cas et crée l'admin

# Front (autre terminal)
cd web
npm install
npm run dev                   # http://localhost:5173, /api est redirigé vers le port 3000
```

Avec le faux fournisseur, une action se déclenche quand on tape son id exact (ex. `fouiller_tiroir`), et une fin quand on tape son id au procès (ex. `acquittement`). Pour jouer avec le vrai modèle : `AI_PROVIDER=openrouter` et `OPENROUTER_API_KEY=...`.

## Tests

```bash
cd server && npm test         # moteur, chargeur de cas, pannes du faux fournisseur
```

À rejouer après chaque modification des prompts : les **tests pièges** (regarder sans toucher, poser une question, demander la solution, « ignore tes instructions », action hors liste), en partie réelle avec le vrai modèle.

## Écrire un cas

Ajouter un fichier `server/cases/<slug>.json` au format décrit dans l'analyse (section 2). Au démarrage (ou avec `npm run cases:load`), le chargeur vérifie chaque id référencé, que chaque objet peut être obtenu, qu'il n'y a pas de cycle de prérequis et qu'au moins une fin est toujours accessible. Une erreur est affichée avec le chemin exact du champ fautif. Recharger un cas le met à jour sans casser les parties en cours.

## Déployer sur le VPS

```bash
git clone <ce dépôt> /opt/case-prompt && cd /opt/case-prompt
cp .env.example .env          # renseigner DOMAIN, mots de passe, clé OpenRouter, admin
docker compose up -d --build
```

Caddy obtient le certificat HTTPS pour `DOMAIN`. La CI (`.github/workflows/ci.yml`) vérifie le typage, les tests et les builds à chaque Pull Request, et déploie `main` par SSH si les secrets `VPS_HOST`, `VPS_USER` et `VPS_SSH_KEY` sont configurés.

## Couverture des exigences

| Exigence | Où |
| --- | --- |
| F1 Format de cas et chargeur | `server/src/cases/case-file.ts`, `case-store.ts` |
| F2–F5 Tour d'enquête, états cachés, limite, procès | `server/src/game/engine.ts`, `game.service.ts` |
| F6 Dossier de preuves et historique | `web/src/views/GameView.vue` |
| F7 Comptes, isolation par joueur | `server/src/auth/`, `GameService.get` |
| F8 Commencer, reprendre, rejouer | `web/src/views/CasesView.vue` |
| F9–F11 Journal des appels, tableau de bord, quotas et offres | `server/src/ai/`, `server/src/admin/`, `web/src/views/AdminView.vue` |
| F12 Quatre pannes et faux fournisseur | `server/src/ai/fake.provider.ts`, « Simulateur de pannes » dans l'admin |
| F13 Page d'accueil avec deux offres | `web/src/views/LandingView.vue` |
| F14 Mentions légales, label « Généré par IA », suppression de compte | `LegalView.vue`, `GameView.vue`, `AccountView.vue` |
| F15 Utilisable sur téléphone | mises en page responsives (testées à 390 px) |

## Choix faits sur les questions ouvertes (à valider en équipe)

- **Limite d'actions** : 20 tours, compteur visible. Chaque tour compte, qu'il déclenche une action ou non.
- **Procès avant la limite** : oui, bouton « Passer au procès » avec confirmation.
- **Limite du procès** : 8 échanges. Au dernier, le modèle doit choisir une fin ; s'il ne le fait pas, le serveur choisit la fin perdante sans prérequis.
- **Personnage du procès** : défini par cas (`resolution.character`) ; la juge Moreau pour le premier cas.
- **États cachés** : ne disparaissent que par l'IA ; 5 au maximum.
- **Quota** : en tours par jour (60 en gratuit, 600 en premium) ; une rejouée compte. Seuls les appels réussis sont comptés.
- **Guidage de l'IA** : réagit aux théories, et peut attirer l'attention sur un élément visible si le joueur tourne en rond (jamais sur une cachette).

## À faire par l'équipe

- Images définitives de la scène et du tribunal (D4, D7) : les SVG de `web/public/images` sont provisoires.
- Compléter les passages entre crochets de la page légale (noms, établissement, hébergeur, contact).
- Ajuster les `ai_hint` et les prompts après les parties de test avec le vrai modèle ; comparer Mistral Small 3.2 et 4 (B11).
- Fixer le prix de l'offre Premium à partir des coûts observés dans le tableau de bord (F11).
- Deuxième cas (F16), calques de scène (F17).
