<template>
  <article class="legal">
    <h1>Mentions légales et données personnelles</h1>
    <p class="muted small">Les passages entre crochets sont à compléter par l’équipe avant la mise en ligne publique.</p>

    <h2>Éditeur</h2>
    <p>Case Prompt est un projet étudiant réalisé par [noms des membres de l’équipe], [établissement]. Contact : [adresse e-mail de l’équipe].</p>

    <h2>Hébergement</h2>
    <p>Le site est hébergé sur un serveur privé virtuel fourni par [hébergeur, adresse].</p>

    <h2>Contenu généré par IA</h2>
    <p>
      Les narrations du maître du jeu et les répliques du personnage du procès sont générées par un modèle de langage
      (Mistral, via le service OpenRouter). Elles sont signalées par la mention « Généré par IA ». Les scénarios, les indices,
      les résultats d’actions et les fins sont écrits par l’équipe. Les images ont été générées une fois par une IA avant la mise en ligne.
      Les personnages et les faits sont fictifs.
    </p>

    <h2>Données collectées</h2>
    <ul>
      <li>Ton adresse e-mail et ton mot de passe (stocké sous forme chiffrée, jamais en clair), pour ton compte.</li>
      <li>Tes parties : le texte que tu écris, les réponses du maître du jeu, les preuves trouvées.</li>
      <li>Un journal des appels à l’IA (date, nombre de mots traités, coût, durée), pour suivre les coûts.</li>
    </ul>
    <p>
      Ce que tu écris pendant une partie est envoyé au modèle d’IA, sans ton e-mail ni aucune autre donnée personnelle.
      Les fournisseurs qui conservent les requêtes sont exclus. N’écris pas d’informations personnelles dans le jeu.
    </p>

    <h2>Durée et suppression</h2>
    <p>
      Tes données sont conservées tant que ton compte existe. Tu peux le supprimer à tout moment depuis la page
      <RouterLink to="/compte">Compte</RouterLink> : tes parties sont alors effacées, et le journal des coûts ne garde plus aucun lien avec toi.
    </p>

    <h2>Tes droits</h2>
    <p>
      Conformément au RGPD, tu disposes d’un droit d’accès, de rectification et d’effacement de tes données.
      Pour l’exercer, écris à [adresse e-mail de l’équipe]. Tu peux aussi saisir la CNIL.
    </p>

    <h2>Cookies</h2>
    <p>Le site n’utilise aucun cookie publicitaire ni de mesure d’audience. Ta session est gardée dans le stockage local de ton navigateur.</p>
  </article>
</template>

<style scoped>
.legal { max-width: 760px; }
.legal h2 { margin-top: 28px; }
.legal ul { padding-left: 20px; }
</style>
