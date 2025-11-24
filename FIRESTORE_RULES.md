# Règles Firestore pour Pixel Collector

## Configuration nécessaire

Pour que le système d'échanges fonctionne, tu dois ajouter les règles suivantes dans Firebase Console.

### Comment mettre à jour les règles :

1. Va dans **Firebase Console** : https://console.firebase.google.com
2. Sélectionne ton projet **pixel-collector-online**
3. Va dans **Firestore Database**
4. Clique sur l'onglet **Règles** (Rules)
5. Remplace les règles existantes par celles ci-dessous
6. Clique sur **Publier** (Publish)

### Règles complètes :

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

## Index composites requis

Firestore va te demander de créer des index composites quand tu utiliseras certaines requêtes. Voici ceux qui sont nécessaires :

### Index pour les échanges en attente

**Collection :** `trades`
**Champs :**
- `toUserId` (Ascending)
- `status` (Ascending)
- `createdAt` (Descending)

### Index pour l'historique des échanges

**Collection :** `trades`
**Champs :**
- `fromUserId` (Ascending)
- `status` (Ascending)
- `createdAt` (Descending)

**OU**

**Collection :** `trades`
**Champs :**
- `toUserId` (Ascending)
- `status` (Ascending)
- `createdAt` (Descending)

### Comment créer les index :

Firestore va te donner un lien direct dans la console d'erreur quand tu essaieras d'utiliser les échanges. Tu peux :

1. Cliquer sur le lien fourni dans l'erreur
2. Ou aller dans **Firestore Database > Index** et créer manuellement

Les index prennent quelques minutes à se construire.

## Explication des règles

### Collection `users`
- **Lecture publique** : Permet à tous de voir les profils (nécessaire pour le classement et choisir un joueur pour échanger)
- **Écriture privée** : Seul le propriétaire peut modifier son compte

### Collection `trades`
- **Lecture restreinte** : Seulement les 2 joueurs impliqués peuvent voir l'échange
- **Création libre** : Tout joueur authentifié peut proposer un échange
- **Mise à jour conditionnelle** :
  - Le destinataire peut accepter ou refuser
  - L'émetteur peut annuler sa proposition
- **Suppression interdite** : On conserve l'historique de tous les échanges

## Sécurité

Ces règles assurent que :
- ✅ Personne ne peut modifier le compte d'un autre
- ✅ Personne ne peut voir les échanges des autres
- ✅ Personne ne peut accepter un échange à la place du destinataire
- ✅ L'historique des échanges est préservé
