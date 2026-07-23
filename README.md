# 🎨 Pixel Collector

Un jeu de collection de pixels unique où vous collectionnez des pixels 1x1, 2x2 et des pixel arts rares en ouvrant des coffres quotidiens !

**🎮 Jouer en ligne : https://reptile-new.github.io/pixel_collector/**

## 🎮 Fonctionnalités actuelles

### ✅ Atelier (recyclage & craft)
- Recyclez vos doublons en **Éclats ✨** — règle : **1 pixel = 1 éclat**, selon la surface :
  - 1×1 = 1 ✨ · 2×2 (4 pixels) = 4 ✨ · Pixel Art 8×8 (64 pixels) = 64 ✨
- Vous gardez toujours 1 exemplaire de chaque pixel : la collection n'est jamais affectée
- Dépensez vos éclats en assemblant les pixels d'un item (coût = sa surface) :
  - **Pixel 2×2** (4 ✨) : un 2×2 aléatoire, en priorité un qui vous manque
  - **Coffre bonus** (16 ✨) : ouvre immédiatement un coffre supplémentaire
  - **Pixel Art légendaire** (64 ✨) : un légendaire garanti, en priorité un qui vous manque

### ✅ Série quotidienne (streak)
- Ouvrez votre coffre chaque jour pour faire monter votre série 🔥
- **3 jours consécutifs** : +1 pixel par coffre (4 au lieu de 3)
- **7 jours consécutifs** : +2 pixels par coffre (5 au lieu de 3)
- La série est perdue si vous sautez un jour

### ✅ Système de pitié (pity)
- Un pixel art **légendaire est garanti tous les 25 coffres** sans légendaire
- Le compteur est affiché sous le coffre quotidien

### ✅ Système de connexion
- Création de compte avec email/mot de passe
- Connexion/déconnexion
- Sauvegarde locale (localStorage pour l'instant)

### ✅ Système de coffres
- 1 coffre gratuit par jour — il se recharge à minuit (heure de Paris) pour tout le monde
- Ouverture de coffre avec animation
- Système de rareté :
  - **Commun (70%)** : Pixels 1x1 (4 variantes)
  - **Rare (28%)** : Pixels 2x2 (256 variantes)
  - **Légendaire (2%)** : Pixel arts 8x8 (30 designs uniques)

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

## 🎯 Système de rareté

- **Pixels 1x1 (Communs)** : 70% de chance
  - 4 couleurs : Rouge, Bleu, Vert, Jaune
  - 4 variantes au total

- **Pixels 2x2 (Rares)** : 28% de chance
  - Grille 2x2 avec 4 couleurs possibles par case
  - 256 combinaisons possibles (4^4)

- **Pixel Arts 8x8 (Légendaires)** : 2% de chance
  - 30 designs uniques dessinés à la main
  - Chaque pixel art utilise une palette personnalisée

## 📊 Progression

- **Objectif principal** : Compléter la collection des 294 pixels uniques
- **Défi ultime** : Obtenir les 30 pixel arts légendaires
- **Difficulté** : Avec 2% de chance, il faudra environ 150 coffres pour tous les avoir (probabilité statistique)

## 🎮 Conseils

1. Ouvrez votre coffre quotidien chaque jour !
2. Les doublons comptent - vous pourrez les échanger plus tard
3. Les pixel arts légendaires sont très rares, soyez patient !

---

**Développé avec ❤️ pour les collectionneurs de pixels**
