# Actions à faire dans Firebase Console

## ⚠️ URGENT - Configuration requise pour que les échanges fonctionnent

### 1️⃣ Configurer les règles de sécurité Firestore

**Va ici :** https://console.firebase.google.com/project/pixel-collector-online/firestore/rules

**Copie-colle ces règles :**

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // Règles pour la collection 'users'
    match /users/{userId} {
      // Lecture : tout le monde peut voir les profils (pour le classement et les échanges)
      allow read: if true;

      // Écriture : seulement le propriétaire du compte
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // Règles pour la collection 'trades' (échanges)
    match /trades/{tradeId} {
      // Lecture : seulement les utilisateurs impliqués dans l'échange
      allow read: if request.auth != null &&
                     (request.auth.uid == resource.data.fromUserId ||
                      request.auth.uid == resource.data.toUserId);

      // Création : tout utilisateur authentifié peut proposer un échange
      allow create: if request.auth != null &&
                       request.auth.uid == request.resource.data.fromUserId;

      // Mise à jour : seulement le destinataire peut accepter/refuser
      //              seulement l'émetteur peut annuler
      allow update: if request.auth != null &&
                       ((request.auth.uid == resource.data.toUserId &&
                         request.resource.data.status in ['accepted', 'refused']) ||
                        (request.auth.uid == resource.data.fromUserId &&
                         request.resource.data.status == 'cancelled'));

      // Suppression : interdit (on garde l'historique)
      allow delete: if false;
    }
  }
}
```

**Puis clique sur "Publier"**

---

### 2️⃣ Créer les index composites

Firebase a besoin d'index pour les requêtes complexes. Clique sur ces liens pour les créer automatiquement :

**Index 1 - Échanges en attente (toUserId + status + createdAt) :**
👉 https://console.firebase.google.com/v1/r/project/pixel-collector-online/firestore/indexes?create_composite=ClVwcm9qZWN0cy9waXhlbC1jb2xsZWN0b3Itb25saW5lL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy90cmFkZXMvaW5kZXhlcy9fEAEaCAgKdG9Vc2VySWQQARoKCgZzdGF0dXMQARoNCgljcmVhdGVkQXQQAhoMCghfX25hbWVfXxAC

**Index 2 - Propositions envoyées (fromUserId + status + createdAt) :**
👉 https://console.firebase.google.com/v1/r/project/pixel-collector-online/firestore/indexes?create_composite=ClVwcm9qZWN0cy9waXhlbC1jb2xsZWN0b3Itb25saW5lL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy90cmFkZXMvaW5kZXhlcy9fEAEaDgoKZnJvbVVzZXJJZBABGgoKBnN0YXR1cxABGg0KCWNyZWF0ZWRBdBACGgwKCF9fbmFtZV9fEAI

**Attention :** Les index prennent quelques minutes à se construire. Tu verras un petit spinner qui tourne.

---

### 3️⃣ Vérifier que tout fonctionne

Une fois les règles publiées et les index créés (attendre qu'ils soient en vert), rafraîchis ton jeu et :

1. Va dans l'onglet **Marché**
2. Sélectionne un joueur
3. Sélectionne un de tes pixels
4. Sélectionne un pixel du joueur
5. Clique sur **Envoyer la proposition**

✅ Si ça marche, tu verras "Proposition d'échange envoyée !"

❌ Si ça ne marche pas, vérifie la console JavaScript pour voir quelle erreur reste.

---

## Résumé des erreurs actuelles

- ❌ **"Missing or insufficient permissions"** → Règles Firestore manquantes (étape 1)
- ❌ **"The query requires an index"** → Index composites manquants (étape 2)
- ✅ **"Unsupported field value: undefined"** → Sera corrigé après le prochain commit

---

## Notes

Les règles Firestore actuelles sont probablement en mode test :
```javascript
allow read, write: if request.time < timestamp.date(2025, X, X);
```

Il FAUT les remplacer par les règles ci-dessus pour avoir une vraie sécurité.
