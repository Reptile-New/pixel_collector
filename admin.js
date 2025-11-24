// Importation de Firebase
import {
    auth,
    db,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    collection,
    query,
    getDocs,
    doc,
    getDoc,
    deleteDoc,
    updateDoc,
    serverTimestamp,
    orderBy,
    setDoc
} from './firebase-config.js';

// Variables globales
let allUsers = [];
let currentFilter = 'active';
let currentAdmin = null;

// Liste des emails autorisés à accéder au panel admin
const AUTHORIZED_ADMINS = [
    // Ajoute ton email ici
    'ton-email@example.com'
];

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();

    // Écouter les changements d'authentification
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Vérifier si l'email est autorisé
            if (!AUTHORIZED_ADMINS.includes(user.email)) {
                alert('⛔ Accès refusé\n\nVous n\'êtes pas autorisé à accéder au panel admin.');
                await signOut(auth);
                return;
            }

            currentAdmin = user;
            showAdminPanel();
            await loadDashboard();
        } else {
            currentAdmin = null;
            showLoginScreen();
        }
    });
});

function setupEventListeners() {
    // Connexion
    document.getElementById('loginButton').addEventListener('click', handleLogin);
    document.getElementById('logoutButton').addEventListener('click', handleLogout);

    // Recherche
    document.getElementById('searchUsers').addEventListener('input', (e) => {
        filterUsers(e.target.value);
    });

    // Filtres
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            displayUsers(allUsers);
        });
    });

    // Rafraîchir
    document.getElementById('refreshUsers').addEventListener('click', () => {
        loadDashboard();
    });

    // Maintenance
    document.getElementById('cleanDeletedAccounts').addEventListener('click', handleCleanDeleted);
    document.getElementById('resetUser').addEventListener('click', handleResetUser);
    document.getElementById('deleteAllUsers').addEventListener('click', handleDeleteAll);

    // Permettre connexion avec Entrée
    document.getElementById('adminPasswordInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });
}

// Authentification
async function handleLogin() {
    const email = document.getElementById('adminEmailInput').value;
    const password = document.getElementById('adminPasswordInput').value;
    const errorDiv = document.getElementById('loginError');

    if (!email || !password) {
        errorDiv.textContent = 'Veuillez remplir tous les champs';
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
        errorDiv.textContent = '';
    } catch (error) {
        console.error('Erreur de connexion:', error);
        errorDiv.textContent = 'Email ou mot de passe incorrect';
    }
}

async function handleLogout() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error('Erreur de déconnexion:', error);
        alert('Erreur de déconnexion: ' + error.message);
    }
}

function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminPanel').style.display = 'none';
}

function showAdminPanel() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    document.getElementById('adminEmail').textContent = currentAdmin.email;
}

// Chargement du dashboard
async function loadDashboard() {
    try {
        // Charger tous les utilisateurs
        const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);

        allUsers = [];
        let totalChests = 0;
        let totalPixelsCount = 0;
        let activeCount = 0;
        let deletedCount = 0;

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const uid = docSnap.id;

            const user = {
                uid: uid,
                displayName: data.displayName || 'Joueur',
                email: data.email || 'N/A',
                stats: data.stats || { chestsOpened: 0, totalPixels: 0, uniquePixels: 0 },
                createdAt: data.createdAt,
                deleted: data.deleted === true,
                collection: data.collection || {}
            };

            allUsers.push(user);

            // Calculer les stats
            totalChests += user.stats.chestsOpened || 0;
            totalPixelsCount += user.stats.totalPixels || 0;

            if (user.deleted) {
                deletedCount++;
            } else {
                activeCount++;
            }
        });

        // Mettre à jour les stats globales
        document.getElementById('totalUsers').textContent = activeCount;
        document.getElementById('deletedUsers').textContent = deletedCount;
        document.getElementById('totalChests').textContent = totalChests;
        document.getElementById('totalPixels').textContent = totalPixelsCount;

        // Afficher les utilisateurs
        displayUsers(allUsers);
    } catch (error) {
        console.error('Erreur de chargement du dashboard:', error);
        alert('Erreur de chargement: ' + error.message);
    }
}

function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';

    // Filtrer selon le filtre actif
    let filteredUsers = users;
    if (currentFilter === 'active') {
        filteredUsers = users.filter(u => !u.deleted);
    } else if (currentFilter === 'deleted') {
        filteredUsers = users.filter(u => u.deleted);
    }

    if (filteredUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">Aucun utilisateur trouvé</td></tr>';
        return;
    }

    filteredUsers.forEach(user => {
        const tr = document.createElement('tr');

        // Date de création
        let createdDate = 'N/A';
        if (user.createdAt && user.createdAt.toDate) {
            createdDate = user.createdAt.toDate().toLocaleDateString('fr-FR');
        }

        // Statut
        const statusClass = user.deleted ? 'status-deleted' : 'status-active';
        const statusText = user.deleted ? 'Supprimé' : 'Actif';

        // Actions
        let actions = '';
        if (user.deleted) {
            actions = `
                <button class="action-btn action-btn-view" onclick="viewUser('${user.uid}')">👁️</button>
                <button class="action-btn action-btn-delete" onclick="permanentDelete('${user.uid}')">🗑️</button>
            `;
        } else {
            actions = `
                <button class="action-btn action-btn-view" onclick="viewUser('${user.uid}')">👁️</button>
                <button class="action-btn action-btn-delete" onclick="softDelete('${user.uid}')">❌</button>
            `;
        }

        tr.innerHTML = `
            <td><strong>${user.displayName}</strong></td>
            <td>${user.email}</td>
            <td>${user.stats.uniquePixels} / 294</td>
            <td>${user.stats.chestsOpened}</td>
            <td>${createdDate}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>${actions}</td>
        `;

        tbody.appendChild(tr);
    });
}

function filterUsers(searchTerm) {
    if (!searchTerm) {
        displayUsers(allUsers);
        return;
    }

    const filtered = allUsers.filter(user =>
        user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.uid.includes(searchTerm)
    );
    displayUsers(filtered);
}

// Actions utilisateur
window.viewUser = function(uid) {
    const user = allUsers.find(u => u.uid === uid);
    if (!user) return;

    let collectionInfo = 'Collection vide';
    if (user.collection && Object.keys(user.collection).length > 0) {
        collectionInfo = `${Object.keys(user.collection).length} pixels différents dans la collection`;
    }

    alert(`Détails de l'utilisateur:\n\nUID: ${uid}\nPseudo: ${user.displayName}\nEmail: ${user.email}\nPixels uniques: ${user.stats.uniquePixels}/294\nPixels totaux: ${user.stats.totalPixels}\nCoffres ouverts: ${user.stats.chestsOpened}\nStatut: ${user.deleted ? 'Supprimé' : 'Actif'}\n\n${collectionInfo}`);
}

window.softDelete = async function(uid) {
    if (!confirm(`Êtes-vous sûr de vouloir marquer ce compte comme supprimé ?\n\nUID: ${uid}\n\nL'utilisateur n'apparaîtra plus dans le jeu mais ses données seront conservées.`)) {
        return;
    }

    try {
        await updateDoc(doc(db, 'users', uid), {
            deleted: true,
            deletedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        alert('Compte marqué comme supprimé avec succès');
        await loadDashboard();
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur: ' + error.message);
    }
}

window.permanentDelete = async function(uid) {
    if (!confirm(`⚠️ ATTENTION ⚠️\n\nÊtes-vous sûr de vouloir SUPPRIMER DÉFINITIVEMENT ce compte ?\n\nUID: ${uid}\n\nCette action est IRRÉVERSIBLE !`)) {
        return;
    }

    const doubleConfirm = confirm('DERNIÈRE CONFIRMATION\n\nLe compte sera définitivement supprimé de Firestore.\nTapez sur OK pour confirmer.');

    if (!doubleConfirm) {
        return;
    }

    try {
        await deleteDoc(doc(db, 'users', uid));
        alert('Compte supprimé définitivement');
        await loadDashboard();
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur: ' + error.message);
    }
}

// Maintenance
async function handleCleanDeleted() {
    const deletedUsers = allUsers.filter(u => u.deleted);

    if (deletedUsers.length === 0) {
        alert('Aucun compte supprimé à nettoyer');
        return;
    }

    if (!confirm(`Voulez-vous supprimer DÉFINITIVEMENT ${deletedUsers.length} compte(s) marqué(s) comme supprimé(s) ?\n\nCette action est irréversible !`)) {
        return;
    }

    try {
        let deleted = 0;
        for (const user of deletedUsers) {
            await deleteDoc(doc(db, 'users', user.uid));
            deleted++;
        }

        alert(`${deleted} compte(s) supprimé(s) définitivement`);
        await loadDashboard();
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur: ' + error.message);
    }
}

async function handleResetUser() {
    const uid = document.getElementById('resetUserId').value.trim();

    if (!uid) {
        alert('Veuillez entrer un UID d\'utilisateur');
        return;
    }

    if (!confirm(`Êtes-vous sûr de vouloir réinitialiser l'utilisateur ${uid} ?\n\nCela supprimera:\n- Toute sa collection\n- Toutes ses statistiques\n\nCette action est irréversible !`)) {
        return;
    }

    try {
        const userDoc = await getDoc(doc(db, 'users', uid));

        if (!userDoc.exists()) {
            alert('Utilisateur introuvable');
            return;
        }

        const data = userDoc.data();

        await updateDoc(doc(db, 'users', uid), {
            collection: {},
            stats: {
                chestsOpened: 0,
                totalPixels: 0,
                uniquePixels: 0
            },
            lastChestTime: 0,
            updatedAt: serverTimestamp()
        });

        alert('Utilisateur réinitialisé avec succès');
        document.getElementById('resetUserId').value = '';
        await loadDashboard();
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur: ' + error.message);
    }
}

async function handleDeleteAll() {
    if (!confirm(`⚠️⚠️⚠️ DANGER EXTRÊME ⚠️⚠️⚠️\n\nVous êtes sur le point de SUPPRIMER TOUS LES UTILISATEURS (${allUsers.length} comptes)\n\nCette action est ABSOLUMENT IRRÉVERSIBLE !\n\nÊtes-vous ABSOLUMENT certain ?`)) {
        return;
    }

    const confirmText = prompt('Pour confirmer, tapez exactement: SUPPRIMER TOUT');

    if (confirmText !== 'SUPPRIMER TOUT') {
        alert('Annulé');
        return;
    }

    try {
        let deleted = 0;
        for (const user of allUsers) {
            await deleteDoc(doc(db, 'users', user.uid));
            deleted++;
        }

        alert(`${deleted} compte(s) supprimé(s) définitivement`);
        await loadDashboard();
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur: ' + error.message);
    }
}
