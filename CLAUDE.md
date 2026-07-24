# Pixel Collector — conventions de travail

Jeu web (PWA) de collection de pixels. Site en ligne : https://reptile-new.github.io/pixel_collector/

## Structure

- `index.html` — interface + tout le CSS
- `game.js` — logique du jeu (module ES, importe Firebase)
- `pixel_data.js` — les 30 pixel arts légendaires (grilles 8×8)
- `pixel_renderer.js` — rendu des pixels sur canvas
- `wiki.html` — page d'aide/wiki expliquant les mécaniques
- `sw.js` — service worker (cache hors ligne)

Après **toute** modif de `game.js`, `pixel_renderer.js`, `pixel_data.js` ou `firebase-config.js` :
incrémenter le `?v=N` de leurs `<script>` dans `index.html` (et garder le même N partout)
pour forcer le rechargement chez les joueurs. Bumper aussi `CACHE_NAME` dans `sw.js` quand
un fichier mis en cache change.

## 💬 Style de réponse

Réponses **courtes et claires**. Aller à l'essentiel, pas de pavés.

## ⚙️ Workflow imposé par le propriétaire — À FAIRE À CHAQUE FEATURE

Le propriétaire n'a pas le temps de vérifier que le travail est bien livré. Donc, pour
**chaque** demande de fonctionnalité ou de correctif, l'assistant doit aller **jusqu'au bout
tout seul**, sans attendre de validation :

1. **Implémenter** la demande complètement.
2. **Committer** avec un message clair (en français, comme l'historique existant).
3. **Pousser** sur la branche de travail.
4. **Merger dans `main`** pour que ça parte en ligne (le déploiement GitHub Pages / FTP se
   déclenche uniquement sur un push vers `main`). Une feature qui n'est pas sur `main` n'est
   **pas livrée** — donc le merge fait partie du travail, il n'est jamais optionnel.

Autrement dit : **commit → push → merge dans `main`, systématiquement**, sans redemander.
Ne jamais laisser une fonctionnalité terminée en attente sur une branche.

### 📓 Journal des nouveautés (`changelog.html`) — à mettre à jour à CHAQUE merge

À chaque merge dans `main`, **avant** de merger :

1. Ajouter une entrée en haut de `changelog.html` : incrémenter le numéro de version
   (v1.x), un titre court, et 1 à 3 puces décrivant la nouveauté côté joueur (pas de jargon).
2. Retirer la pastille « Nouveau » de l'entrée précédente et la mettre sur la nouvelle
   (classe `rel--new` + `<span class="rel__new">`).
3. Mettre à jour le numéro affiché dans l'en-tête d'`index.html` (chip `.ver-chip`, « 🆕 vX.Y »).

Le but : le propriétaire clique sur 🆕 dans l'app et voit d'un coup ce qui a changé,
sans comparer le site. Une version = un merge.
