# 🎨 Pixel Collector

Un jeu de collection de pixels : tu ouvres des coffres, tu assembles des tuiles à l'Atelier
et tu forges les 30 **légendaires** 8×8.

**🎮 Jouer en ligne : https://reptile-new.github.io/pixel_collector/**

📱 **Installable comme une app** (PWA) :
- **Android (Chrome)** : menu ⋮ → « Installer l'application »
- **iPhone (Safari)** : bouton Partager → « Sur l'écran d'accueil »

**📖 Wiki du jeu : [`wiki.html`](wiki.html)** — toutes les mécaniques et tous les pourcentages
(accessible aussi depuis le bouton « 📖 » dans l'app).
**🆕 Journal des nouveautés : [`changelog.html`](changelog.html)**.

## 🧩 Les trois types de pixels

| Type | Rareté | Variantes | Rôle |
|---|---|---|---|
| **Pixel 1×1** | Commun | 4 (Rouge, Bleu, Vert, Jaune) | Matière première de l'assemblage |
| **Tuile 2×2** | Rare | 256 (4⁴) | Matière première de la Forge |
| **Légendaire 8×8** | Légendaire | 30 dessins | Le seul vrai trophée |

Soit **290 pixels uniques** au total — mais **seuls les légendaires comptent** comme score.

## 📦 Les coffres

- Le coffre se recharge **2 h après chaque ouverture** — jusqu'à **12 coffres par jour**.
- Contenu d'une ouverture :
  - **15 à 25 éclats ✨**
  - **3 à 7 pixels 1×1**
  - **2 à 4 tuiles 2×2** (+ bonus de série)
  - **0,3 %** de chance d'un **légendaire** en bonus, sans pitié ni compteur
    (~1 par mois pour qui ouvre ses 12 coffres quotidiens)
- La **série 🔥 n'avance qu'une fois par jour**, à la première ouverture :
  **3 jours** de suite = +1 tuile par coffre, **7 jours** = +2 tuiles. Un jour sauté et elle repart à 1.

## ⛏️ La mine à éclats

- Produit **1 éclat ✨ toutes les 15 min**, même hors ligne, jusqu'à un **plafond de 32** (8 h).
- Compte à rebours et barre de progression en direct, bouton « Récolter ».

## 🔨 L'Atelier

- **Pixel 1×1** — 1 ✨, couleur au choix.
- **🎲 Tuile au hasard** — 3 ✨, peut être un doublon.
- **⭐ Tuile que tu n'as pas** — 4 ✨, garantie nouvelle.
- **🔨 Assembler une tuile sur mesure** — composes exactement la tuile voulue, payée avec
  4 pixels 1×1 des bonnes couleurs. **70 % de réussite**, les 1×1 sont perdus en cas d'échec
  (soit ~6 ✨ la tuile choisie, le prix du sur-mesure). Pas de confirmation : un clic, ça part.
- **Les légendaires ne s'achètent pas avec des éclats** — coffre (0,3 %) ou Forge, point.

## 🏆 La Forge légendaire

- Chaque légendaire s'affiche en **schéma grisé** : une grille **4×4 = 16 tuiles 2×2**.
- Quand les 16 tuiles sont réunies, la forge s'active. Elle n'est **pas garantie** et les
  16 tuiles sont **consommées à chaque tentative**, réussie ou non.
- Réussite selon le **rang** du légendaire — c'est aussi lui qui pilote la probabilité de
  sortie au coffre :

| Rang | Forge | Combien | Exemples |
|---|---|---|---|
| Mythique | 5 % | 1 | Cœur ❤️ |
| Royal | 8 % | 5 | Couronne, Diamant, Arc-en-ciel, Alien, Robot |
| Épique | 12 % | 10 | Étoile, Fusée, Fantôme, Chat, Bouclier… |
| Classique | 20 % | 14 | Smiley, Pizza, Fleur, Pomme, Bonbon… |

Le mot « légendaire » désigne **le type de pixel** ; entre eux, les 30 se distinguent par leur
**rang** — aucun mot n'est réutilisé aux deux niveaux.

## 🤝 Les échanges

- Propose un pixel et/ou des éclats contre un pixel et/ou des éclats d'un autre joueur.
- Ce que tu offres est **mis de côté** dès l'envoi, puis récupérable dans l'historique
  si la proposition est refusée ou annulée.

## 👤 Compte

- Connexion par email/mot de passe ou compte Google, sauvegarde dans **Firestore**.
- Le **pseudo** se change une fois tous les **30 jours** (3 à 16 caractères, unique).

## 🚀 Lancer le jeu en local

1. Servir le dossier en HTTP (les modules ES et le service worker ne fonctionnent pas en `file://`) :
   `python3 -m http.server 8000`, puis ouvrir http://localhost:8000
2. La configuration Firebase est déjà en place dans `firebase-config.js`.

## 🎨 Structure du projet

```
pixel_collector/
├── index.html          # Interface + tout le CSS
├── game.js             # Logique du jeu (module ES)
├── firebase-config.js  # Initialisation Firebase (auth + Firestore)
├── pixel_data.js       # Données des 30 légendaires
├── pixel_renderer.js   # Rendu des pixels sur canvas
├── wiki.html           # Wiki des mécaniques
├── changelog.html      # Journal des nouveautés
├── admin.html/admin.js # Page d'administration
├── sw.js               # Service worker (cache hors ligne)
└── README.md           # Ce fichier
```

> Après toute modif de `game.js`, `pixel_renderer.js`, `pixel_data.js` ou `firebase-config.js` :
> incrémenter le `?v=N` de leurs `<script>` dans `index.html` (même N partout, y compris dans
> l'import de `firebase-config.js` en tête de `game.js`) et bumper `CACHE_NAME` dans `sw.js`.

## 📋 À venir

- [ ] Sécuriser l'ouverture des coffres et les échanges côté serveur (Cloud Functions) —
      aujourd'hui les délais reposent sur l'horloge du navigateur
- [ ] Succès et défis
- [ ] Recyclage d'un pixel depuis sa fiche

---

**Développé avec ❤️ pour les collectionneurs de pixels**
