# 🎨 Pixel Collector

Un jeu de collection de pixels unique où vous collectionnez des pixels 1x1, 2x2 et des pixel arts rares en ouvrant des coffres quotidiens !

## 🎮 Fonctionnalités actuelles

### ✅ Système de connexion
- Création de compte avec email/mot de passe
- Connexion/déconnexion
- Sauvegarde locale (localStorage pour l'instant)

### ✅ Système de coffres
- 1 coffre gratuit toutes les 24h
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
2. Créez un compte ou connectez-vous
3. Cliquez sur le coffre pour l'ouvrir !

## 📋 À venir

- [ ] Intégration Firebase pour le backend
- [ ] Système de marketplace pour échanger des pixels
- [ ] Mode premium pour ouvrir plus de coffres
- [ ] Succès et défis
- [ ] Leaderboard des collectionneurs
- [ ] Système d'échange entre joueurs
- [ ] Affichage détaillé de chaque pixel
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
