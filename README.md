# 🎨 Pixel Collector

Un jeu de collection de pixels unique où vous collectionnez des pixels 1x1, 2x2 et des pixel arts rares en ouvrant des coffres quotidiens !

**🎮 Jouer en ligne : https://reptile-new.github.io/pixel_collector/**

📱 **Installable comme une app** (PWA) :
- **Android (Chrome)** : menu ⋮ → « Installer l'application »
- **iPhone (Safari)** : bouton Partager → « Sur l'écran d'accueil »

**📖 Wiki du jeu : [`wiki.html`](wiki.html)** — explique toutes les mécaniques et les pourcentages (accessible aussi depuis le bouton « 📖 Wiki » dans l'app).

## 🎮 Fonctionnalités actuelles

### ✅ Forge légendaire (nouveau !)
- Chaque légendaire s'affiche sous forme de **schéma grisé** dans l'Atelier
- Il se décompose en une grille **4×4 = 16 tuiles 2×2** aux couleurs précises
- Place tes pixels **2×2 aux bonnes couleurs** sur le schéma : les cases s'allument et le dessin réapparaît
- Une fois les 16 tuiles réunies, tente la **forge** — mais elle n'a que **12 % de réussite**
- ⚠️ Les 16 pixels 2×2 sont **consommés à chaque tentative**, réussie ou non
- C'est le seul moyen d'obtenir **précisément** le légendaire de ton choix

### ✅ Atelier (dépense des éclats)
- Les **éclats ✨** viennent des coffres (2 à 10 par ouverture) et de la mine.
- Dépensez-les de plusieurs façons :
  - **Pixel 1×1** (1 ✨) : de la couleur de votre choix
  - **🎲 Pixel 2×2 aléatoire** (3 ✨) : le moins cher, mais peut être un doublon
  - **⭐ Pixel 2×2 garanti nouveau** (4 ✨) : un 2×2 que vous n'avez pas encore
  - **🔨 Assemblage sur mesure** (70 % de réussite) : composez exactement le 2×2 voulu,
    payé avec vos pixels 1×1 des bonnes couleurs — en cas d'échec, les 1×1 sont perdus
- **Les légendaires ne s'achètent pas avec des éclats** — coffre (1 %) ou Forge uniquement.

### ✅ Mine à éclats (récolte passive)
- Une **mine** produit **1 éclat ✨ toutes les 30 min**, automatiquement, même hors ligne
- La réserve s'accumule jusqu'à un **plafond de 16 éclats** (8 h) — reviens cliquer sur **« Récolter »** au moins une fois par 8 h
- Barre de progression + compte à rebours du prochain éclat en direct
- Les éclats récoltés alimentent directement l'Atelier (craft, coffre bonus, assemblage…)

### ✅ Coffres midi & minuit (2 par jour)
- Le coffre se recharge **deux fois par jour** : à **midi** et à **minuit** (heure de Paris), pour tout le monde
- Chaque demi-journée (00 h→12 h, 12 h→00 h) donne droit à une ouverture
- La **série 🔥 n'avance qu'une fois par jour** (à la 1ʳᵉ ouverture) : ouvrir les deux coffres ne gonfle pas la série

### ✅ Série quotidienne (streak)
- Ouvrez votre coffre chaque jour pour faire monter votre série 🔥
- **3 jours consécutifs** : +1 tuile 2×2 par coffre
- **7 jours consécutifs** : +2 tuiles 2×2 par coffre
- La série est perdue si vous sautez un jour

### ✅ Système de connexion
- Création de compte avec email/mot de passe
- Connexion/déconnexion
- Sauvegarde locale (localStorage pour l'instant)

### ✅ Système de coffres
- 2 coffres gratuits par jour — ils se rechargent à midi et à minuit (heure de Paris) pour tout le monde
- Ouverture de coffre avec animation
- Contenu d'un coffre :
  - **3 à 4 pixels 2×2** (+ bonus de série)
  - **2 à 10 éclats ✨**
  - **1 %** de chance d'un **pixel art légendaire** en bonus (aléatoire, sans pitié)

### ✅ Collection
- 294 pixels uniques à collectionner au total
  - 4 pixels 1x1
  - 256 pixels 2x2
  - 30 pixel arts 8x8
- Affichage de votre collection complète
- Recherche dans la collection
- Compteur de doublons

### ✅ Statistiques
- Nombre total de pixels possédés
- Nombre de pixels uniques
- Nombre de coffres ouverts
- Dernières trouvailles affichées

### ✅ 30 Pixel Arts Légendaires
1. Smiley 😊
2. Coeur ❤️
3. Champignon 🍄
4. Étoile ⭐
5. Cerise 🍒
6. Diamant 💎
7. Fantôme 👻
8. Pizza 🍕
9. Couronne 👑
10. Fleur 🌸
11. Fusée 🚀
12. Clé 🔑
13. Arc-en-ciel 🌈
14. Soleil ☀️
15. Lune 🌙
16. Café ☕
17. Chat 🐱
18. Pièce 🪙
19. Bombe 💣
20. Papillon 🦋
21. Robot 🤖
22. Parapluie ☂️
23. Poisson 🐟
24. Ballon 🎈
25. Pomme 🍎
26. Cadeau 🎁
27. Ananas 🍍
28. Bonbon 🍬
29. Bouclier 🛡️
30. Alien 👽

## 🚀 Comment lancer le jeu

1. Ouvrez simplement `index.html` dans votre navigateur
2. Le jeu démarre automatiquement en mode invité
3. Cliquez sur le coffre pour l'ouvrir et obtenir 3 pixels !

## 📋 À venir

- [ ] Sécuriser l'ouverture des coffres et les échanges côté serveur (Cloud Functions)
- [ ] Succès et défis
- [ ] Affichage détaillé de chaque pixel (avec recyclage individuel)
- [ ] Statistiques avancées

## 🎨 Structure du projet

```
pixel_collector/
├── index.html          # Interface principale
├── game.js             # Logique du jeu
├── pixel_data.js       # Données des 30 pixel arts
├── pixel_renderer.js   # Module de rendu des pixels
├── test_pixel_reel.html # Test de visualisation
└── README.md           # Ce fichier
```

## 🔧 Configuration Firebase (À faire)

Pour activer la sauvegarde en ligne, modifiez les informations dans `game.js` :

```javascript
const firebaseConfig = {
    apiKey: "VOTRE_API_KEY",
    authDomain: "VOTRE_AUTH_DOMAIN",
    projectId: "VOTRE_PROJECT_ID",
    storageBucket: "VOTRE_STORAGE_BUCKET",
    messagingSenderId: "VOTRE_MESSAGING_SENDER_ID",
    appId: "VOTRE_APP_ID"
};
```

## 🎯 Les trois types de pixels

- **Pixels 1×1** : 4 couleurs (Rouge, Bleu, Vert, Jaune). S'achètent à l'Atelier (1 ✨).
- **Pixels 2×2** : 256 combinaisons (4⁴). Tombent des coffres, ou se craftent à l'Atelier.
- **Pixel Arts 8×8 (Légendaires)** : 30 designs dessinés à la main, palette personnalisée.
  Uniquement via coffre (**1 %**, sans pitié) ou via la **Forge** (12 % de réussite).

## 📊 Progression

- **Objectif principal** : Compléter la collection des 294 pixels uniques
- **Défi ultime** : Obtenir les 30 pixel arts légendaires — soit en priant le coffre (1 %),
  soit en les **forgeant** un par un (le seul moyen de viser un légendaire précis)

## 🎮 Conseils

1. Ouvrez vos deux coffres chaque jour (midi + minuit) !
2. Dépensez vos éclats à l'Atelier pour compléter vos 2×2
3. Visez un légendaire précis via la Forge, en réunissant ses 16 tuiles 2×2

---

**Développé avec ❤️ pour les collectionneurs de pixels**
