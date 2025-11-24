# Configuration des règles de sécurité Firebase

## Règles Firestore

Pour permettre aux joueurs de voir les profils des autres utilisateurs, vous devez configurer les règles de sécurité dans la console Firebase.

### Étapes :

1. Allez sur [Firebase Console](https://console.firebase.google.com/)
2. Sélectionnez votre projet **pixel-collector-online**
3. Dans le menu latéral, cliquez sur **Firestore Database**
4. Cliquez sur l'onglet **Règles**
5. Remplacez les règles existantes par le code suivant :

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      // Permettre à tous les utilisateurs authentifiés de lire tous les profils
      allow read: if request.auth != null;

      // Permettre uniquement au propriétaire de créer/modifier ses propres données
      allow create, update: if request.auth != null && request.auth.uid == userId;

      // Permettre uniquement au propriétaire de supprimer son compte
      allow delete: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

6. Cliquez sur **Publier**

### Explication des règles :

- **`allow read: if request.auth != null;`** : Tous les utilisateurs connectés peuvent lire les profils des autres joueurs (nécessaire pour afficher la liste des joueurs et leurs collections)

- **`allow create, update: if request.auth != null && request.auth.uid == userId;`** : Seul le propriétaire d'un compte peut créer ou modifier ses propres données

- **`allow delete: if request.auth != null && request.auth.uid == userId;`** : Seul le propriétaire peut supprimer son propre compte

Ces règles garantissent que :
- ✅ Les joueurs peuvent voir les profils, stats et collections des autres
- ✅ Chaque joueur ne peut modifier que ses propres données
- ✅ Les données sont protégées contre les modifications non autorisées
