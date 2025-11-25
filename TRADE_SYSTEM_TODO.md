# Problème du système d'échange

## ⚠️ Problème actuel

La fonction `acceptTrade()` dans `game.js` ne peut pas fonctionner avec les règles Firestore actuelles.

**Erreur :** `Missing or insufficient permissions`

**Cause :** La fonction essaie de modifier le document `users` d'un AUTRE utilisateur (trade.fromUserId), ce qui est interdit par les règles Firestore. Chaque utilisateur ne peut modifier que SON PROPRE document.

## 🔧 Solutions possibles

### Solution 1 : Cloud Functions (Recommandée)

Créer une Cloud Function Firebase qui s'exécute côté serveur avec des privilèges admin.

**Avantages :**
- ✅ Sécurisé
- ✅ Atomique (tout ou rien)
- ✅ Peut valider les échanges

**Inconvénients :**
- ❌ Nécessite la configuration de Firebase Functions
- ❌ Nécessite Node.js et déploiement

**Code exemple :**
```javascript
// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.acceptTrade = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Utilisateur non authentifié');
    }

    const { tradeId } = data;
    const userId = context.auth.uid;

    const db = admin.firestore();

    try {
        // Transaction atomique
        await db.runTransaction(async (transaction) => {
            const tradeRef = db.collection('trades').doc(tradeId);
            const tradeDoc = await transaction.get(tradeRef);

            if (!tradeDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Échange introuvable');
            }

            const trade = tradeDoc.data();

            // Vérifier que c'est bien le destinataire
            if (trade.toUserId !== userId) {
                throw new functions.https.HttpsError('permission-denied', 'Vous n\'êtes pas le destinataire');
            }

            // Récupérer les deux utilisateurs
            const fromUserRef = db.collection('users').doc(trade.fromUserId);
            const toUserRef = db.collection('users').doc(trade.toUserId);

            const fromUserDoc = await transaction.get(fromUserRef);
            const toUserDoc = await transaction.get(toUserRef);

            if (!fromUserDoc.exists || !toUserDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Un utilisateur n\'existe plus');
            }

            const fromUserData = fromUserDoc.data();
            const toUserData = toUserDoc.data();

            // Vérifier que les pixels existent toujours
            if (!fromUserData.collection[trade.fromPixelId]) {
                throw new functions.https.HttpsError('failed-precondition', 'Le pixel proposé n\'existe plus');
            }

            if (!toUserData.collection[trade.toPixelId]) {
                throw new functions.https.HttpsError('failed-precondition', 'Votre pixel n\'existe plus');
            }

            // Effectuer l'échange
            const fromPixel = fromUserData.collection[trade.fromPixelId];
            const toPixel = toUserData.collection[trade.toPixelId];

            // Mettre à jour les collections
            delete fromUserData.collection[trade.fromPixelId];
            fromUserData.collection[trade.toPixelId] = toPixel;

            delete toUserData.collection[trade.toPixelId];
            toUserData.collection[trade.fromPixelId] = fromPixel;

            // Sauvegarder
            transaction.update(fromUserRef, {
                collection: fromUserData.collection,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            transaction.update(toUserRef, {
                collection: toUserData.collection,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            transaction.update(tradeRef, {
                status: 'accepted',
                acceptedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        return { success: true };
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});
```

**Côté client (game.js) :**
```javascript
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';

const functions = getFunctions();
const acceptTradeFunction = httpsCallable(functions, 'acceptTrade');

window.acceptTrade = async function(tradeId) {
    if (!confirm('Accepter cet échange ?')) return;

    try {
        const result = await acceptTradeFunction({ tradeId });
        alert('Échange effectué avec succès !');
        await loadUserData();
        await loadPendingTrades();
    } catch (error) {
        console.error('Erreur lors de l\'acceptation:', error);
        alert('Erreur: ' + error.message);
    }
}
```

### Solution 2 : Système simplifié (Alternative)

Au lieu d'échanger des pixels, l'acceptation pourrait :
1. Créer une notification pour l'autre joueur
2. Chaque joueur modifie sa propre collection manuellement

**Avantages :**
- ✅ Simple à implémenter
- ✅ Pas besoin de Cloud Functions

**Inconvénients :**
- ❌ Non atomique (risque de triche ou d'incohérence)
- ❌ Moins sécurisé
- ❌ Moins professionnel

### Solution 3 : Règles Firestore permissives (NON RECOMMANDÉ)

Modifier les règles pour autoriser l'écriture sur tous les documents users.

**⚠️ DANGER : Ne JAMAIS faire ça !**
- ❌ Permet à n'importe qui de modifier n'importe quel compte
- ❌ Faille de sécurité majeure
- ❌ Risque de perte de données

## 📋 Action recommandée

1. **Implémenter la Solution 1 (Cloud Functions)**
2. Installer Firebase CLI : `npm install -g firebase-tools`
3. Initialiser Functions : `firebase init functions`
4. Déployer : `firebase deploy --only functions`

## 📝 Note temporaire

En attendant l'implémentation des Cloud Functions, la fonction `acceptTrade()` est commentée côté client pour éviter les erreurs.
