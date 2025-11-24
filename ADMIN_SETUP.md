# Configuration Admin

## Comment définir un utilisateur comme administrateur

### Étape 1 : Créer ton compte utilisateur
1. Lance le jeu normalement
2. Crée ton compte ou connecte-toi

### Étape 2 : Définir le rôle admin dans Firestore
1. Va dans la **Console Firebase** : https://console.firebase.google.com
2. Sélectionne ton projet
3. Va dans **Firestore Database**
4. Dans la collection `users`, trouve ton document utilisateur (ton UID)
5. Clique sur ton document
6. Clique sur **"Add field"** (Ajouter un champ)
7. Ajoute un nouveau champ :
   - **Field name** : `role`
   - **Type** : `string`
   - **Value** : `admin`
8. Clique sur **"Add"**

### Étape 3 : Rafraîchir le jeu
1. Retourne dans le jeu
2. Déconnecte-toi puis reconnecte-toi
3. L'onglet **"🔧 Admin"** apparaît maintenant dans ton interface !

## Structure Firestore

Ton document utilisateur devrait ressembler à ça :

```
users/{userId}/
  ├── displayName: "TonPseudo"
  ├── email: "ton-email@example.com"
  ├── role: "admin"          ← NOUVEAU CHAMP
  ├── stats: { ... }
  ├── collection: { ... }
  └── createdAt: timestamp
```

## Sécurité

- Seuls les utilisateurs avec `role: "admin"` peuvent voir l'onglet Admin
- Les autres joueurs ne verront jamais cet onglet
- Tu peux avoir plusieurs admins en ajoutant le champ `role: "admin"` à plusieurs utilisateurs

## Fonctionnalités du Panel Admin

Une fois admin, tu auras accès à :
- 📊 Statistiques globales du jeu
- 👥 Liste de tous les utilisateurs (actifs/supprimés)
- 🔍 Recherche et filtres
- 👁️ Voir les profils complets
- ❌ Marquer des comptes comme supprimés
- 🗑️ Supprimer définitivement des comptes
- 🛠️ Nettoyer les comptes supprimés en masse
- ⚙️ Réinitialiser un utilisateur
- 💀 Supprimer toute la base de données (zone dangereuse)
