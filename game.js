// Importation de Firebase
import {
    auth,
    db,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    updateProfile,
    sendEmailVerification,
    deleteUser,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    serverTimestamp,
    deleteDoc,
    collection,
    query,
    orderBy,
    limit,
    getDocs,
    addDoc,
    onSnapshot,
    where
} from './firebase-config.js';

// Variables globales
let currentUser = null;
let userCollection = {};
let userStats = {
    chestsOpened: 0,
    totalPixels: 0,
    uniquePixels: 0,
    lastChestTime: 0
};
// Configuration des albums
const ALBUMS = [
    { id: 'all', label: 'Tous' },
    { id: '1x1', label: 'Pixels 1×1' },
    { id: '2x2', label: 'Pixels 2×2' },
    { id: 'art', label: 'Pixel Arts' }
];

let currentAlbum = 'all'; // Album actuellement affiché
let allPlayers = []; // Liste de tous les joueurs
let currentModalAlbum = 'all'; // Album actuellement affiché dans la modal
let currentModalPlayer = null; // Joueur actuellement affiché dans la modal
let isAdmin = false; // Si l'utilisateur est admin
let allAdminUsers = []; // Liste de tous les utilisateurs (admin)
let adminCurrentFilter = 'active'; // Filtre actif dans le panel admin

// Variables pour les échanges
let selectedMyPixel = null; // Pixel que je propose
let selectedTheirPixel = null; // Pixel que je demande
let selectedTradePlayer = null; // Joueur avec qui j'échange
let tradesUnsubscribe = null; // Pour unsub les listeners Firestore

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    drawChest();
    generateCollectionAlbumTabs();

    // Écouter les changements d'authentification
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await loadUserData();
            showGameScreen();
        } else {
            currentUser = null;
            showLoginScreen();
        }
    });
});

function setupEventListeners() {
    // Boutons de connexion
    document.getElementById('loginButton').addEventListener('click', handleLogin);
    document.getElementById('registerButton').addEventListener('click', handleRegister);
    document.getElementById('googleSignInButton').addEventListener('click', handleGoogleSignIn);
    document.getElementById('logoutButton').addEventListener('click', handleLogout);
    document.getElementById('deleteAccountButton').addEventListener('click', handleDeleteAccount);
    document.getElementById('saveNameButton').addEventListener('click', handleSaveName);

    // Clic sur le coffre pour l'ouvrir
    document.getElementById('chestCanvas').addEventListener('click', openChest);
    document.getElementById('continueButton').addEventListener('click', closeResult);

    // Onglets
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });

    // Recherche dans la collection
    document.getElementById('searchCollection').addEventListener('input', (e) => {
        filterCollection(e.target.value);
    });

    // Albums de collection
    document.querySelectorAll('.album-tab').forEach(tab => {
        tab.addEventListener('click', (e) => switchAlbum(e.target.dataset.album));
    });

    // Recherche de joueurs
    document.getElementById('searchPlayers').addEventListener('input', (e) => {
        filterPlayers(e.target.value);
    });

    // Modal profil joueur
    document.getElementById('closeProfileModal').addEventListener('click', closePlayerProfile);
    document.getElementById('playerProfileModal').addEventListener('click', (e) => {
        if (e.target.id === 'playerProfileModal') {
            closePlayerProfile();
        }
    });

    // Recherche dans la modal
    document.getElementById('modalSearchCollection').addEventListener('input', (e) => {
        filterModalCollection(e.target.value);
    });

    // Admin panel event listeners
    document.getElementById('adminRefresh').addEventListener('click', loadAdminDashboard);
    document.getElementById('adminSearchUsers').addEventListener('input', (e) => {
        filterAdminUsers(e.target.value);
    });
    document.querySelectorAll('.admin-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.admin-filter-btn').forEach(b => {
                b.style.background = 'transparent';
                b.style.color = 'white';
            });
            e.target.style.background = 'white';
            e.target.style.color = '#667eea';
            adminCurrentFilter = e.target.dataset.filter;
            displayAdminUsers(allAdminUsers);
        });
    });
    document.getElementById('adminCleanDeleted').addEventListener('click', handleAdminCleanDeleted);
    document.getElementById('adminResetUser').addEventListener('click', handleAdminResetUser);
    document.getElementById('adminDeleteAll').addEventListener('click', handleAdminDeleteAll);

    // Trade system event listeners
    document.querySelectorAll('.trade-tab').forEach(tab => {
        tab.addEventListener('click', (e) => switchTradeTab(e.target.dataset.tradeTab));
    });
    document.getElementById('selectPlayer').addEventListener('change', handlePlayerSelect);
    document.getElementById('sendTradeOffer').addEventListener('click', handleSendTrade);
}

// Fonction pour changer d'onglet dans l'authentification
window.switchAuthTab = function(tab) {
    const loginTab = document.getElementById('tabLogin');
    const registerTab = document.getElementById('tabRegister');
    const loginForm = document.getElementById('formLogin');
    const registerForm = document.getElementById('formRegister');

    if (tab === 'login') {
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    } else {
        loginTab.classList.remove('active');
        registerTab.classList.add('active');
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    }
}

// === DESSIN DU COFFRE ===

function drawChest() {
    const canvas = document.getElementById('chestCanvas');
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const pixelSize = 20;

    // Vrai coffre de trésor 16x12 avec perspective
    const pattern = [
        [0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0],  // 1 - Sommet couvercle
        [0,0,0,1,2,2,2,2,2,2,2,2,1,0,0,0],  // 2
        [0,0,1,2,3,3,3,3,3,3,3,3,2,1,0,0],  // 3 - Couvercle bombé
        [0,1,2,3,4,4,4,4,4,4,4,4,3,2,1,0],  // 4 - Reflet couvercle
        [1,2,3,4,5,5,5,5,5,5,5,5,4,3,2,1],  // 5 - Bas couvercle
        [1,6,6,6,7,7,8,8,8,8,7,7,6,6,6,1],  // 6 - Fermoir + charnière
        [1,6,9,9,9,9,9,9,9,9,9,9,9,9,6,1],  // 7 - Haut corps
        [1,6,9,10,9,9,9,9,9,9,9,9,10,9,6,1], // 8 - Corps avec coins
        [1,6,9,9,9,9,9,9,9,9,9,9,9,9,6,1],  // 9
        [1,6,9,10,9,9,9,9,9,9,9,9,10,9,6,1], // 10
        [1,6,6,6,6,6,6,6,6,6,6,6,6,6,6,1],  // 11 - Base renforcée
        [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0]   // 12 - Contour sol
    ];

    const colors = [
        'transparent',  // 0
        '#1a0f0a',      // 1 - Contour noir/marron
        '#3d2817',      // 2 - Marron très foncé
        '#5c3d2e',      // 3 - Marron foncé couvercle
        '#8b5a3c',      // 4 - Marron moyen couvercle
        '#a0744e',      // 5 - Marron clair couvercle (reflet)
        '#2d1b10',      // 6 - Marron très très foncé (ferrures)
        '#b8860b',      // 7 - Or foncé (charnières)
        '#ffd700',      // 8 - Or brillant (serrure)
        '#704214',      // 9 - Marron moyen corps
        '#4a2b14'       // 10 - Marron foncé coins/détails
    ];

    for (let y = 0; y < 12; y++) {
        for (let x = 0; x < 16; x++) {
            ctx.fillStyle = colors[pattern[y][x]];
            ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
        }
    }
}

// === AUTHENTIFICATION FIREBASE ===

async function handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        alert('Veuillez remplir tous les champs');
        return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);

        // Vérifier si l'email est vérifié
        if (!userCredential.user.emailVerified) {
            alert('Veuillez vérifier votre email avant de vous connecter. Un email de confirmation vous a été envoyé lors de votre inscription.');
            await signOut(auth);
            return;
        }

        // onAuthStateChanged gérera la suite
    } catch (error) {
        console.error('Erreur de connexion:', error);
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            alert('Email ou mot de passe incorrect');
        } else if (error.code === 'auth/invalid-email') {
            alert('Email invalide');
        } else {
            alert('Erreur de connexion: ' + error.message);
        }
    }
}

async function handleRegister() {
    const pseudo = document.getElementById('registerPseudo').value.trim();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;

    if (!pseudo || !email || !password) {
        alert('Veuillez remplir tous les champs');
        return;
    }

    if (pseudo.length < 3) {
        alert('Le pseudo doit contenir au moins 3 caractères');
        return;
    }

    if (password.length < 6) {
        alert('Le mot de passe doit contenir au moins 6 caractères');
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);

        // Définir le displayName (pseudo)
        await updateProfile(userCredential.user, {
            displayName: pseudo
        });

        // Envoyer l'email de vérification
        await sendEmailVerification(userCredential.user);

        // Initialiser les données utilisateur dans Firestore avec le pseudo
        await initializeUserData(userCredential.user.uid, pseudo);

        // Déconnecter l'utilisateur et afficher un message
        await signOut(auth);
        alert('Inscription réussie ! Un email de confirmation a été envoyé à ' + email + '. Veuillez vérifier votre boîte mail pour activer votre compte.');

        // Revenir à l'onglet connexion
        window.switchAuthTab('login');
    } catch (error) {
        console.error('Erreur d\'inscription:', error);
        if (error.code === 'auth/email-already-in-use') {
            alert('Cet email est déjà utilisé');
        } else if (error.code === 'auth/invalid-email') {
            alert('Email invalide');
        } else if (error.code === 'auth/weak-password') {
            alert('Le mot de passe est trop faible');
        } else {
            alert('Erreur d\'inscription: ' + error.message);
        }
    }
}

async function handleGoogleSignIn() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
        prompt: 'select_account'
    });

    try {
        const result = await signInWithPopup(auth, provider);

        // Vérifier si c'est la première connexion
        const docRef = doc(db, 'users', result.user.uid);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            // Premier login avec Google, initialiser les données
            const displayName = result.user.displayName || result.user.email?.split('@')[0] || 'Joueur';
            await initializeUserData(result.user.uid, displayName);
        }

        // onAuthStateChanged gérera la suite
    } catch (error) {
        console.error('Erreur de connexion Google:', error);
        if (error.code === 'auth/popup-closed-by-user') {
            // L'utilisateur a fermé la popup, ne rien faire
        } else if (error.code === 'auth/cancelled-popup-request') {
            // Une autre popup était déjà ouverte
        } else {
            alert('Erreur de connexion avec Google: ' + error.message);
        }
    }
}

async function handleLogout() {
    try {
        await signOut(auth);
        // onAuthStateChanged gérera la suite
    } catch (error) {
        console.error('Erreur de déconnexion:', error);
        alert('Erreur de déconnexion: ' + error.message);
    }
}

async function handleSaveName() {
    const newName = document.getElementById('userNameInput').value.trim();

    if (!newName) {
        alert('Le pseudo ne peut pas être vide');
        return;
    }

    if (newName.length < 3) {
        alert('Le pseudo doit contenir au moins 3 caractères');
        return;
    }

    try {
        // Mettre à jour dans Firebase Auth
        await updateProfile(currentUser, {
            displayName: newName
        });

        // Mettre à jour dans Firestore
        await updateDoc(doc(db, 'users', currentUser.uid), {
            displayName: newName,
            updatedAt: serverTimestamp()
        });

        alert('Pseudo modifié avec succès !');
        updateUI();
    } catch (error) {
        console.error('Erreur de modification du pseudo:', error);
        alert('Erreur lors de la modification du pseudo: ' + error.message);
    }
}

async function handleDeleteAccount() {
    const confirmation = confirm('Êtes-vous sûr de vouloir supprimer votre compte ?\n\nCette action est irréversible et supprimera :\n- Votre compte\n- Toutes vos données\n- Votre collection de pixels\n- Vos statistiques\n\nVoulez-vous vraiment continuer ?');

    if (!confirmation) {
        return;
    }

    // Demander une double confirmation
    const doubleConfirmation = confirm('DERNIÈRE CONFIRMATION\n\nVotre compte sera définitivement supprimé.\nTapez sur OK pour confirmer la suppression.');

    if (!doubleConfirmation) {
        return;
    }

    try {
        const userId = currentUser.uid;

        // 1. Marquer le compte comme supprimé dans Firestore
        await updateDoc(doc(db, 'users', userId), {
            deleted: true,
            deletedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        // 2. Supprimer l'utilisateur Firebase Auth
        await deleteUser(currentUser);

        alert('Votre compte a été supprimé avec succès.');
        // onAuthStateChanged redirigera automatiquement vers l'écran de connexion
    } catch (error) {
        console.error('Erreur de suppression du compte:', error);

        if (error.code === 'auth/requires-recent-login') {
            alert('Pour des raisons de sécurité, vous devez vous reconnecter avant de supprimer votre compte.\n\nVeuillez vous déconnecter puis vous reconnecter, et réessayez.');
        } else {
            alert('Erreur lors de la suppression du compte: ' + error.message);
        }
    }
}

function showGameScreen() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'block';
    updateUI();
}

function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('gameScreen').style.display = 'none';
}

// === GESTION DES DONNÉES UTILISATEUR AVEC FIRESTORE ===

async function initializeUserData(uid, displayName) {
    // S'assurer que displayName n'est jamais undefined
    const safeName = displayName || 'Joueur';

    const data = {
        displayName: safeName,
        collection: {},
        stats: {
            chestsOpened: 0,
            totalPixels: 0,
            uniquePixels: 0
        },
        lastChestTime: 0,
        createdAt: serverTimestamp()
    };

    try {
        await setDoc(doc(db, 'users', uid), data);
        userCollection = {};
        userStats = data.stats;
    } catch (error) {
        console.error('Erreur d\'initialisation des données:', error);
        throw error; // Relancer l'erreur pour la voir dans le catch parent
    }
}

async function loadUserData() {
    try {
        const docRef = doc(db, 'users', currentUser.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();

            // Désérialiser la collection
            userCollection = {};
            if (data.collection) {
                for (const [key, pixel] of Object.entries(data.collection)) {
                    userCollection[key] = {
                        ...pixel,
                        // Reconvertir les JSON strings en tableaux
                        data: pixel.data && typeof pixel.data === 'string' ? JSON.parse(pixel.data) : pixel.data,
                        colors: pixel.colors && typeof pixel.colors === 'string' ? JSON.parse(pixel.colors) : pixel.colors
                    };
                }
            }

            userStats = data.stats || {
                chestsOpened: 0,
                totalPixels: 0,
                uniquePixels: 0
            };
            // Charger le lastChestTime pour la limite quotidienne
            userStats.lastChestTime = data.lastChestTime || 0;

            // Vérifier si l'utilisateur est admin
            isAdmin = data.role === 'admin';
            if (isAdmin) {
                // Afficher l'onglet admin
                document.getElementById('adminTab').style.display = 'block';
                // Précharger les données admin
                await loadAdminDashboard();
            }
        } else {
            // Premier accès, initialiser les données
            await initializeUserData(currentUser.uid);
        }
    } catch (error) {
        console.error('Erreur de chargement des données:', error);
        alert('Erreur de chargement des données. Veuillez réessayer.');
    }
}

async function saveUserData() {
    try {
        // Sérialiser la collection pour éviter les tableaux imbriqués
        const serializedCollection = {};
        for (const [key, pixel] of Object.entries(userCollection)) {
            const serializedPixel = { ...pixel };

            // Convertir les tableaux de tableaux en JSON strings pour Firestore
            if (pixel.data) {
                serializedPixel.data = JSON.stringify(pixel.data);
            } else {
                delete serializedPixel.data; // Supprimer au lieu de mettre undefined
            }

            if (pixel.colors) {
                serializedPixel.colors = JSON.stringify(pixel.colors);
            } else {
                delete serializedPixel.colors; // Supprimer au lieu de mettre undefined
            }

            serializedCollection[key] = serializedPixel;
        }

        const data = {
            collection: serializedCollection,
            stats: userStats,
            lastChestTime: Date.now(),
            updatedAt: serverTimestamp()
        };

        await updateDoc(doc(db, 'users', currentUser.uid), data);
    } catch (error) {
        console.error('Erreur de sauvegarde des données:', error);
        alert('Erreur de sauvegarde. Vos progrès pourraient ne pas être sauvegardés.');
    }
}

// === SYSTÈME DE COFFRES ===

function canOpenChest() {
    const lastTime = userStats.lastChestTime || 0;
    const now = Date.now();
    const hoursSince = (now - lastTime) / (1000 * 60 * 60);
    return hoursSince >= 24;
}

async function openChest() {
    if (!canOpenChest()) {
        alert('Vous avez déjà ouvert votre coffre quotidien. Revenez demain !');
        return;
    }

    // Générer 3 pixels aléatoires
    const pixels = [
        generateRandomPixel(),
        generateRandomPixel(),
        generateRandomPixel()
    ];

    // Ajouter à la collection
    pixels.forEach(pixel => {
        addPixelToCollection(pixel);
        userStats.totalPixels++;
    });

    // Mettre à jour les stats
    userStats.chestsOpened++;
    updateUniquePixelsCount();

    // Mettre à jour le lastChestTime dans userStats
    userStats.lastChestTime = Date.now();

    // Sauvegarder dans Firestore
    await saveUserData();

    // Afficher le résultat
    showResult(pixels);

    // Mettre à jour l'UI
    updateUI();
}

function generateRandomPixel() {
    const dropRates = PixelRenderer.getDropRates();
    const rand = Math.random();

    let pixel;

    if (rand < dropRates.legendary) {
        // Pixel art légendaire (2%)
        const art = PixelArts[Math.floor(Math.random() * PixelArts.length)];
        pixel = {
            type: 'art',
            id: art.id,
            name: art.name,
            data: art.data,
            colors: art.colors
        };
    } else if (rand < dropRates.legendary + dropRates.rare) {
        // Pixel 2x2 rare (28%)
        const all2x2 = PixelRenderer.generateAll2x2();
        const pattern = all2x2[Math.floor(Math.random() * all2x2.length)];
        pixel = {
            type: '2x2',
            pattern: pattern,
            id: `2x2_${pattern}`,
            name: `Pixel 2x2 #${pattern}`
        };
    } else {
        // Pixel 1x1 commun (70%)
        const all1x1 = PixelRenderer.generateAll1x1();
        const pattern = all1x1[Math.floor(Math.random() * all1x1.length)];
        pixel = {
            type: '1x1',
            pattern: pattern,
            id: `1x1_${pattern}`,
            name: `Pixel 1x1 #${pattern}`
        };
    }

    return pixel;
}

function addPixelToCollection(pixel) {
    if (!userCollection[pixel.id]) {
        userCollection[pixel.id] = {
            ...pixel,
            count: 0
        };
    }
    userCollection[pixel.id].count++;
}

function updateUniquePixelsCount() {
    userStats.uniquePixels = Object.keys(userCollection).length;
}

// === AFFICHAGE DU RÉSULTAT ===

function showResult(pixels) {
    const chestView = document.getElementById('chestView');
    const resultView = document.getElementById('resultView');

    chestView.style.display = 'none';
    resultView.classList.add('active');

    // Afficher les 3 pixels
    pixels.forEach((pixel, index) => {
        const canvas = document.getElementById(`resultCanvas${index + 1}`);
        PixelRenderer.drawPixel(canvas, pixel, 80);

        // Ajouter la bordure de rareté
        const resultPixel = document.getElementById(`resultPixel${index + 1}`);
        const rarity = PixelRenderer.getRarity(pixel.type);
        resultPixel.className = 'result-pixel rarity-' + rarity;

        // Ajouter aux dernières trouvailles
        addToRecentPixels(pixel);
    });

    // Afficher le label
    document.getElementById('resultLabel').textContent = '3 pixels obtenus !';
}

function closeResult() {
    const chestView = document.getElementById('chestView');
    const resultView = document.getElementById('resultView');

    resultView.classList.remove('active');
    chestView.style.display = 'flex';
}

function addToRecentPixels(pixel) {
    const container = document.getElementById('recentPixels');

    // Créer l'élément
    const item = document.createElement('div');
    item.className = 'pixel-item';

    const canvas = document.createElement('canvas');
    canvas.className = 'pixel-canvas';
    PixelRenderer.drawPixel(canvas, pixel, 50);

    const count = document.createElement('div');
    count.className = 'pixel-count';
    count.textContent = `×${userCollection[pixel.id].count}`;

    item.appendChild(canvas);
    item.appendChild(count);

    // Ajouter au début
    container.insertBefore(item, container.firstChild);

    // Garder seulement les 9 derniers
    while (container.children.length > 9) {
        container.removeChild(container.lastChild);
    }
}

// === AFFICHAGE DE LA COLLECTION ===

function switchAlbum(album) {
    currentAlbum = album;

    // Changer l'onglet actif
    document.querySelectorAll('.album-tab').forEach(tab => {
        if (tab.dataset.album === album) {
            tab.classList.add('active');
            tab.style.background = 'rgba(255,255,255,0.3)';
            tab.style.fontWeight = 'bold';
        } else {
            tab.classList.remove('active');
            tab.style.background = 'rgba(0,0,0,0.2)';
            tab.style.fontWeight = 'normal';
        }
    });

    displayCollection();
}

function displayCollection() {
    const grid = document.getElementById('collectionGrid');
    grid.innerHTML = '';

    // Générer tous les pixels possibles selon l'album
    let allPossiblePixels = [];

    if (currentAlbum === 'all' || currentAlbum === '1x1') {
        // Ajouter les 4 pixels 1x1
        PixelRenderer.generateAll1x1().forEach(pattern => {
            const id = `1x1_${pattern}`;
            allPossiblePixels.push({
                id: id,
                type: '1x1',
                pattern: pattern,
                name: `Pixel 1x1 #${pattern}`,
                count: userCollection[id] ? userCollection[id].count : 0,
                owned: !!userCollection[id]
            });
        });
    }

    if (currentAlbum === 'all' || currentAlbum === '2x2') {
        // Ajouter les 256 pixels 2x2
        PixelRenderer.generateAll2x2().forEach(pattern => {
            const id = `2x2_${pattern}`;
            allPossiblePixels.push({
                id: id,
                type: '2x2',
                pattern: pattern,
                name: `Pixel 2x2 #${pattern}`,
                count: userCollection[id] ? userCollection[id].count : 0,
                owned: !!userCollection[id]
            });
        });
    }

    if (currentAlbum === 'all' || currentAlbum === 'art') {
        // Ajouter les 30 pixel arts
        PixelArts.forEach(art => {
            allPossiblePixels.push({
                id: art.id,
                type: 'art',
                data: art.data,
                colors: art.colors,
                name: art.name,
                count: userCollection[art.id] ? userCollection[art.id].count : 0,
                owned: !!userCollection[art.id]
            });
        });
    }

    // Trier par type puis par nom
    allPossiblePixels.sort((a, b) => {
        const rarityOrder = { 'art': 0, '2x2': 1, '1x1': 2 };
        const rarityA = rarityOrder[a.type];
        const rarityB = rarityOrder[b.type];

        if (rarityA !== rarityB) return rarityA - rarityB;
        return a.name.localeCompare(b.name);
    });

    allPossiblePixels.forEach(pixel => {
        const item = document.createElement('div');
        item.className = 'pixel-item';
        item.style.cursor = 'pointer';

        // Si le pixel n'est pas possédé, griser
        if (!pixel.owned) {
            item.style.opacity = '0.3';
            item.style.filter = 'grayscale(100%)';
        }

        const canvas = document.createElement('canvas');
        canvas.className = 'pixel-canvas';
        PixelRenderer.drawPixel(canvas, pixel, 60);

        const name = document.createElement('div');
        name.style.fontSize = '0.8em';
        name.style.textAlign = 'center';
        name.textContent = pixel.owned ? pixel.name : '???';

        const count = document.createElement('div');
        count.className = 'pixel-count';
        count.textContent = pixel.owned ? `×${pixel.count}` : '0';

        item.appendChild(canvas);
        item.appendChild(name);
        item.appendChild(count);

        // Ajouter au clic pour agrandir (seulement si possédé)
        if (pixel.owned) {
            item.addEventListener('click', () => showPixelDetail(pixel));
        }

        grid.appendChild(item);
    });

    if (allPossiblePixels.length === 0) {
        grid.innerHTML = '<p style="text-align: center; padding: 50px; opacity: 0.7;">Aucun pixel dans cet album.</p>';
    }
}

function filterCollection(search) {
    const grid = document.getElementById('collectionGrid');
    const items = grid.querySelectorAll('.pixel-item');

    items.forEach(item => {
        const name = item.querySelector('div').textContent.toLowerCase();
        if (name.includes(search.toLowerCase())) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function showPixelDetail(pixel) {
    // TODO: Afficher une modale avec les détails du pixel
    console.log('Détail du pixel:', pixel);
}

// === NAVIGATION PAR ONGLETS ===

function generateCollectionAlbumTabs() {
    const container = document.getElementById('collectionAlbumTabs');
    if (!container) return;

    container.innerHTML = '';

    ALBUMS.forEach((album, index) => {
        const button = document.createElement('button');
        button.className = 'album-tab' + (index === 0 ? ' active' : '');
        button.dataset.album = album.id;
        button.style.cssText = `flex: 1; padding: 10px; border: none; border-radius: 8px; background: ${index === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)'}; color: #fff; cursor: pointer;` + (index === 0 ? ' font-weight: bold;' : '');
        button.textContent = album.label;
        button.addEventListener('click', () => switchAlbum(album.id));
        container.appendChild(button);
    });
}

function switchTab(tabName) {
    // Changer l'onglet actif
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });

    // Changer le contenu
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });

    // Gérer le nom spécial pour l'onglet admin
    const tabId = tabName === 'admin' ? 'adminPanelTab' : tabName + 'Tab';
    const selectedTab = document.getElementById(tabId);
    selectedTab.classList.add('active');
    selectedTab.style.display = 'block';

    // Actions spécifiques
    if (tabName === 'collection') {
        displayCollection();
    } else if (tabName === 'players') {
        loadPlayers();
    } else if (tabName === 'market') {
        initTradeSystem();
    } else if (tabName === 'admin' && isAdmin) {
        loadAdminDashboard();
    }
}

// === GESTION DES JOUEURS ===

async function loadPlayers() {
    try {
        const q = query(collection(db, 'users'), orderBy('stats.uniquePixels', 'desc'), limit(100));
        const querySnapshot = await getDocs(q);

        allPlayers = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const uid = docSnap.id;

            // Ignorer les comptes déjà marqués comme supprimés
            if (data.deleted === true) {
                return;
            }

            // Ignorer les comptes vides (probablement des comptes supprimés avant l'implémentation du flag)
            // Exception : ne pas ignorer l'utilisateur actuel même s'il vient de s'inscrire
            if (uid !== currentUser.uid && data.stats?.totalPixels === 0 && data.stats?.chestsOpened === 0) {
                return;
            }

            allPlayers.push({
                uid: uid,
                displayName: data.displayName || 'Joueur',
                stats: data.stats || { chestsOpened: 0, totalPixels: 0, uniquePixels: 0 },
                collection: data.collection || {}
            });
        });

        displayPlayers(allPlayers);
    } catch (error) {
        console.error('Erreur de chargement des joueurs:', error);
        document.getElementById('playersList').innerHTML = '<p style="text-align: center; padding: 20px; opacity: 0.7;">Erreur de chargement des joueurs</p>';
    }
}

function displayPlayers(players) {
    const container = document.getElementById('playersList');
    container.innerHTML = '';

    if (players.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px; opacity: 0.7;">Aucun joueur trouvé</p>';
        return;
    }

    players.forEach((player, index) => {
        const playerCard = document.createElement('div');
        playerCard.style.cssText = 'background: rgba(255,255,255,0.1); padding: 15px; border-radius: 10px; cursor: pointer; transition: all 0.3s;';
        playerCard.onmouseover = () => playerCard.style.background = 'rgba(255,255,255,0.2)';
        playerCard.onmouseout = () => playerCard.style.background = 'rgba(255,255,255,0.1)';
        playerCard.onclick = () => openPlayerProfile(player);

        const isCurrentUser = player.uid === currentUser.uid;

        playerCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1;">
                    <div style="font-size: 1.2em; font-weight: bold; margin-bottom: 5px;">
                        ${index + 1}. ${player.displayName} ${isCurrentUser ? '(Vous)' : ''}
                    </div>
                    <div style="display: flex; gap: 20px; opacity: 0.8; font-size: 0.9em;">
                        <span>🎨 ${player.stats.uniquePixels} / 294 uniques</span>
                        <span>📦 ${player.stats.totalPixels} totaux</span>
                        <span>🎁 ${player.stats.chestsOpened} coffres</span>
                    </div>
                </div>
                <div style="font-size: 1.5em; opacity: 0.5;">→</div>
            </div>
        `;

        container.appendChild(playerCard);
    });
}

function filterPlayers(searchTerm) {
    if (!searchTerm) {
        displayPlayers(allPlayers);
        return;
    }

    const filtered = allPlayers.filter(player =>
        player.displayName.toLowerCase().includes(searchTerm.toLowerCase())
    );
    displayPlayers(filtered);
}

async function openPlayerProfile(player) {
    currentModalPlayer = player;
    currentModalAlbum = 'all';

    // Mettre à jour les informations
    document.getElementById('modalPlayerName').textContent = player.displayName;
    document.getElementById('modalTotalPixels').textContent = player.stats.totalPixels;
    document.getElementById('modalUniquePixels').textContent = `${player.stats.uniquePixels} / 294`;
    document.getElementById('modalChestsOpened').textContent = player.stats.chestsOpened;

    // Générer dynamiquement les boutons d'albums
    generateModalAlbumTabs();

    // Afficher la collection
    displayModalCollection();

    // Afficher la modal
    document.getElementById('playerProfileModal').style.display = 'block';
}

function generateModalAlbumTabs() {
    const container = document.querySelector('#playerProfileModal .album-tab').parentElement;
    container.innerHTML = '';

    ALBUMS.forEach((album, index) => {
        const button = document.createElement('button');
        button.className = 'album-tab' + (index === 0 ? ' active' : '');
        button.dataset.album = album.id;
        button.textContent = album.label;
        button.onclick = () => switchModalAlbum(album.id);
        container.appendChild(button);
    });
}

function closePlayerProfile() {
    document.getElementById('playerProfileModal').style.display = 'none';
    currentModalPlayer = null;
}

function displayModalCollection() {
    if (!currentModalPlayer) return;

    const container = document.getElementById('modalCollectionGrid');
    container.innerHTML = '';

    // Désérialiser la collection
    const playerCollection = {};
    for (const [key, pixel] of Object.entries(currentModalPlayer.collection)) {
        playerCollection[key] = {
            ...pixel,
            data: pixel.data && typeof pixel.data === 'string' ? JSON.parse(pixel.data) : pixel.data,
            colors: pixel.colors && typeof pixel.colors === 'string' ? JSON.parse(pixel.colors) : pixel.colors
        };
    }

    let pixels = Object.values(playerCollection);

    // Filtrer par album
    if (currentModalAlbum !== 'all') {
        pixels = pixels.filter(p => p.type === currentModalAlbum);
    }

    // Trier par rareté
    pixels.sort((a, b) => {
        const rarityOrder = { 'Légendaire': 0, 'Épique': 1, 'Rare': 2, 'Commun': 3 };
        return rarityOrder[a.rarity] - rarityOrder[b.rarity];
    });

    if (pixels.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px; opacity: 0.7; grid-column: 1 / -1;">Aucun pixel dans cet album</p>';
        return;
    }

    pixels.forEach(pixel => {
        const item = document.createElement('div');
        item.className = 'pixel-item';

        const canvas = document.createElement('canvas');
        canvas.className = 'pixel-canvas';
        PixelRenderer.drawPixel(canvas, pixel, 80);

        const name = document.createElement('div');
        name.className = 'pixel-name';
        name.textContent = pixel.name;

        const rarity = document.createElement('div');
        rarity.className = 'pixel-rarity';
        rarity.textContent = pixel.rarity;

        const count = document.createElement('div');
        count.className = 'pixel-count';
        count.textContent = `×${pixel.count}`;

        item.appendChild(canvas);
        item.appendChild(name);
        item.appendChild(rarity);
        item.appendChild(count);
        container.appendChild(item);
    });
}

function filterModalCollection(searchTerm) {
    if (!currentModalPlayer) return;

    const container = document.getElementById('modalCollectionGrid');
    container.innerHTML = '';

    // Désérialiser la collection
    const playerCollection = {};
    for (const [key, pixel] of Object.entries(currentModalPlayer.collection)) {
        playerCollection[key] = {
            ...pixel,
            data: pixel.data && typeof pixel.data === 'string' ? JSON.parse(pixel.data) : pixel.data,
            colors: pixel.colors && typeof pixel.colors === 'string' ? JSON.parse(pixel.colors) : pixel.colors
        };
    }

    let pixels = Object.values(playerCollection);

    // Filtrer par album
    if (currentModalAlbum !== 'all') {
        pixels = pixels.filter(p => p.type === currentModalAlbum);
    }

    // Filtrer par recherche
    if (searchTerm) {
        pixels = pixels.filter(p =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.rarity.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }

    // Trier par rareté
    pixels.sort((a, b) => {
        const rarityOrder = { 'Légendaire': 0, 'Épique': 1, 'Rare': 2, 'Commun': 3 };
        return rarityOrder[a.rarity] - rarityOrder[b.rarity];
    });

    if (pixels.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px; opacity: 0.7; grid-column: 1 / -1;">Aucun pixel trouvé</p>';
        return;
    }

    pixels.forEach(pixel => {
        const item = document.createElement('div');
        item.className = 'pixel-item';

        const canvas = document.createElement('canvas');
        canvas.className = 'pixel-canvas';
        PixelRenderer.drawPixel(canvas, pixel, 80);

        const name = document.createElement('div');
        name.className = 'pixel-name';
        name.textContent = pixel.name;

        const rarity = document.createElement('div');
        rarity.className = 'pixel-rarity';
        rarity.textContent = pixel.rarity;

        const count = document.createElement('div');
        count.className = 'pixel-count';
        count.textContent = `×${pixel.count}`;

        item.appendChild(canvas);
        item.appendChild(name);
        item.appendChild(rarity);
        item.appendChild(count);
        container.appendChild(item);
    });
}

window.switchModalAlbum = function(album) {
    currentModalAlbum = album;

    // Mettre à jour les tabs
    document.querySelectorAll('#playerProfileModal .album-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.album === album) {
            tab.classList.add('active');
        }
    });

    displayModalCollection();
}

// === MISE À JOUR DE L'UI ===

function updateUI() {
    // Stats utilisateur
    const displayName = currentUser.displayName || currentUser.email?.split('@')[0] || 'Joueur';
    document.getElementById('userNameInput').value = displayName;
    document.getElementById('totalPixels').textContent = userStats.totalPixels;
    document.getElementById('uniquePixels').textContent = `${userStats.uniquePixels} / 294`;
    document.getElementById('chestsOpened').textContent = userStats.chestsOpened;

    // État du coffre
    if (canOpenChest()) {
        document.getElementById('chestTimer').textContent = 'Cliquez sur le coffre pour l\'ouvrir !';
    } else {
        const lastTime = userStats.lastChestTime || 0;
        const now = Date.now();
        const hoursLeft = 24 - Math.floor((now - lastTime) / (1000 * 60 * 60));
        document.getElementById('chestTimer').textContent = `Disponible dans ${hoursLeft}h`;
    }

    // Afficher les derniers pixels
    updateRecentPixels();
}

function updateRecentPixels() {
    const container = document.getElementById('recentPixels');
    container.innerHTML = '';

    const pixels = Object.values(userCollection).slice(-9).reverse();

    pixels.forEach(pixel => {
        const item = document.createElement('div');
        item.className = 'pixel-item';

        const canvas = document.createElement('canvas');
        canvas.className = 'pixel-canvas';
        PixelRenderer.drawPixel(canvas, pixel, 50);

        const count = document.createElement('div');
        count.className = 'pixel-count';
        count.textContent = `×${pixel.count}`;

        item.appendChild(canvas);
        item.appendChild(count);

        container.appendChild(item);
    });

    if (pixels.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px; opacity: 0.7; font-size: 0.9em;">Aucun pixel encore</p>';
    }
}

// === PANEL ADMIN ===

async function loadAdminDashboard() {
    if (!isAdmin) return;

    try {
        const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);

        allAdminUsers = [];
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

            allAdminUsers.push(user);

            totalChests += user.stats.chestsOpened || 0;
            totalPixelsCount += user.stats.totalPixels || 0;

            if (user.deleted) {
                deletedCount++;
            } else {
                activeCount++;
            }
        });

        // Mettre à jour les stats globales
        const elemTotalUsers = document.getElementById('adminTotalUsers');
        const elemDeletedUsers = document.getElementById('adminDeletedUsers');
        const elemTotalChests = document.getElementById('adminTotalChests');
        const elemTotalPixels = document.getElementById('adminTotalPixels');

        if (elemTotalUsers) elemTotalUsers.textContent = activeCount;
        if (elemDeletedUsers) elemDeletedUsers.textContent = deletedCount;
        if (elemTotalChests) elemTotalChests.textContent = totalChests;
        if (elemTotalPixels) elemTotalPixels.textContent = totalPixelsCount;

        // Afficher les utilisateurs
        displayAdminUsers(allAdminUsers);
    } catch (error) {
        console.error('Erreur de chargement du dashboard admin:', error);
        document.getElementById('adminUsersList').innerHTML = '<p style="text-align: center; opacity: 0.7;">Erreur de chargement</p>';
    }
}

function displayAdminUsers(users) {
    const container = document.getElementById('adminUsersList');
    if (!container) return;

    container.innerHTML = '';

    // Filtrer selon le filtre actif
    let filteredUsers = users;
    if (adminCurrentFilter === 'active') {
        filteredUsers = users.filter(u => !u.deleted);
    } else if (adminCurrentFilter === 'deleted') {
        filteredUsers = users.filter(u => u.deleted);
    }

    if (filteredUsers.length === 0) {
        container.innerHTML = '<p style="text-align: center; opacity: 0.7;">Aucun utilisateur trouvé</p>';
        return;
    }

    filteredUsers.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.style.cssText = 'background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;';

        // Date de création
        let createdDate = 'N/A';
        if (user.createdAt && user.createdAt.toDate) {
            createdDate = user.createdAt.toDate().toLocaleDateString('fr-FR');
        }

        // Statut
        const statusColor = user.deleted ? '#f44336' : '#4caf50';
        const statusText = user.deleted ? 'Supprimé' : 'Actif';

        userDiv.innerHTML = `
            <div style="flex: 1; min-width: 200px;">
                <div style="font-weight: bold; font-size: 1.1em;">${user.displayName}</div>
                <div style="opacity: 0.8; font-size: 0.9em;">${user.email}</div>
                <div style="opacity: 0.7; font-size: 0.85em; margin-top: 3px;">UID: ${user.uid}</div>
            </div>
            <div style="text-align: center;">
                <div style="font-weight: bold;">${user.stats.uniquePixels} / 294</div>
                <div style="opacity: 0.7; font-size: 0.85em;">Pixels uniques</div>
            </div>
            <div style="text-align: center;">
                <div style="font-weight: bold;">${user.stats.chestsOpened}</div>
                <div style="opacity: 0.7; font-size: 0.85em;">Coffres</div>
            </div>
            <div style="text-align: center;">
                <div style="opacity: 0.8; font-size: 0.9em;">${createdDate}</div>
                <div style="background: ${statusColor}; color: white; padding: 3px 10px; border-radius: 12px; font-size: 0.85em; margin-top: 3px;">${statusText}</div>
            </div>
            <div style="display: flex; gap: 5px;">
                <button onclick="viewAdminUser('${user.uid}')" style="padding: 8px 12px; background: #2196f3; border: none; border-radius: 5px; color: white; cursor: pointer; font-size: 0.85em;">👁️ Voir</button>
                ${user.deleted ?
                    `<button onclick="permanentDeleteUser('${user.uid}')" style="padding: 8px 12px; background: #f44336; border: none; border-radius: 5px; color: white; cursor: pointer; font-size: 0.85em;">🗑️ Supprimer</button>` :
                    `<button onclick="softDeleteUser('${user.uid}')" style="padding: 8px 12px; background: #ff9800; border: none; border-radius: 5px; color: white; cursor: pointer; font-size: 0.85em;">❌ Marquer supprimé</button>`
                }
            </div>
        `;

        container.appendChild(userDiv);
    });
}

function filterAdminUsers(searchTerm) {
    if (!searchTerm) {
        displayAdminUsers(allAdminUsers);
        return;
    }

    const filtered = allAdminUsers.filter(user =>
        user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.uid.includes(searchTerm)
    );
    displayAdminUsers(filtered);
}

window.viewAdminUser = function(uid) {
    const user = allAdminUsers.find(u => u.uid === uid);
    if (!user) return;

    let collectionInfo = 'Collection vide';
    if (user.collection && Object.keys(user.collection).length > 0) {
        collectionInfo = `${Object.keys(user.collection).length} pixels différents dans la collection`;
    }

    alert(`Détails de l'utilisateur:\n\nUID: ${uid}\nPseudo: ${user.displayName}\nEmail: ${user.email}\nPixels uniques: ${user.stats.uniquePixels}/294\nPixels totaux: ${user.stats.totalPixels}\nCoffres ouverts: ${user.stats.chestsOpened}\nStatut: ${user.deleted ? 'Supprimé' : 'Actif'}\n\n${collectionInfo}`);
}

window.softDeleteUser = async function(uid) {
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
        await loadAdminDashboard();
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur: ' + error.message);
    }
}

window.permanentDeleteUser = async function(uid) {
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
        await loadAdminDashboard();
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur: ' + error.message);
    }
}

async function handleAdminCleanDeleted() {
    const deletedUsers = allAdminUsers.filter(u => u.deleted);

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
        await loadAdminDashboard();
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur: ' + error.message);
    }
}

async function handleAdminResetUser() {
    const uid = document.getElementById('adminResetUserId').value.trim();

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
        document.getElementById('adminResetUserId').value = '';
        await loadAdminDashboard();
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur: ' + error.message);
    }
}

async function handleAdminDeleteAll() {
    if (!confirm(`⚠️⚠️⚠️ DANGER EXTRÊME ⚠️⚠️⚠️\n\nVous êtes sur le point de SUPPRIMER TOUS LES UTILISATEURS (${allAdminUsers.length} comptes)\n\nCette action est ABSOLUMENT IRRÉVERSIBLE !\n\nÊtes-vous ABSOLUMENT certain ?`)) {
        return;
    }

    const confirmText = prompt('Pour confirmer, tapez exactement: SUPPRIMER TOUT');

    if (confirmText !== 'SUPPRIMER TOUT') {
        alert('Annulé');
        return;
    }

    try {
        let deleted = 0;
        for (const user of allAdminUsers) {
            await deleteDoc(doc(db, 'users', user.uid));
            deleted++;
        }

        alert(`${deleted} compte(s) supprimé(s) définitivement`);
        await loadAdminDashboard();
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur: ' + error.message);
    }
}

// === SYSTÈME D'ÉCHANGE ===

async function initTradeSystem() {
    // Charger la liste des joueurs pour le select
    await loadPlayersForTrade();
    // Charger les échanges en attente
    await loadPendingTrades();
    // Charger l'historique
    await loadTradeHistory();
    // S'abonner aux changements en temps réel
    subscribeToTrades();
}

async function loadPlayersForTrade() {
    const select = document.getElementById('selectPlayer');
    select.innerHTML = '<option value="">-- Sélectionner un joueur --</option>';

    try {
        const q = query(collection(db, 'users'), orderBy('displayName'));
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const uid = docSnap.id;

            // Ne pas afficher l'utilisateur actuel ni les comptes supprimés
            if (uid !== currentUser.uid && !data.deleted) {
                const option = document.createElement('option');
                option.value = uid;
                option.textContent = `${data.displayName || 'Joueur'} (${data.stats?.uniquePixels || 0} pixels)`;
                option.dataset.player = JSON.stringify({
                    uid,
                    displayName: data.displayName,
                    collection: data.collection
                });
                select.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Erreur de chargement des joueurs:', error);
    }
}

async function handlePlayerSelect(e) {
    const select = e.target;
    const selectedOption = select.options[select.selectedIndex];

    if (!selectedOption.value) {
        selectedTradePlayer = null;
        document.getElementById('myPixelsForTrade').innerHTML = '<p style="text-align: center; opacity: 0.7; grid-column: 1 / -1;">Sélectionne un joueur d\'abord</p>';
        document.getElementById('theirPixelsForTrade').innerHTML = '<p style="text-align: center; opacity: 0.7; grid-column: 1 / -1;">Sélectionne un joueur d\'abord</p>';
        document.getElementById('sendTradeOffer').disabled = true;
        return;
    }

    selectedTradePlayer = JSON.parse(selectedOption.dataset.player);

    // Afficher mes pixels
    displayMyPixelsForTrade();
    // Afficher les pixels du joueur
    displayTheirPixelsForTrade();
}

function displayMyPixelsForTrade() {
    const container = document.getElementById('myPixelsForTrade');
    container.innerHTML = '';

    const myPixels = Object.values(userCollection);

    if (myPixels.length === 0) {
        container.innerHTML = '<p style="text-align: center; opacity: 0.7; grid-column: 1 / -1;">Tu n\'as aucun pixel</p>';
        return;
    }

    myPixels.forEach(pixel => {
        const item = document.createElement('div');
        item.style.cssText = 'cursor: pointer; padding: 5px; border-radius: 5px; transition: all 0.3s; background: rgba(255,255,255,0.1);';
        item.onclick = () => selectMyPixel(pixel, item);

        const canvas = document.createElement('canvas');
        canvas.width = 80;
        canvas.height = 80;
        PixelRenderer.drawPixel(canvas, pixel, 80);

        const name = document.createElement('div');
        name.style.cssText = 'font-size: 0.7em; text-align: center; margin-top: 3px;';
        name.textContent = pixel.name;

        item.appendChild(canvas);
        item.appendChild(name);
        container.appendChild(item);
    });
}

function displayTheirPixelsForTrade() {
    const container = document.getElementById('theirPixelsForTrade');
    container.innerHTML = '';

    if (!selectedTradePlayer || !selectedTradePlayer.collection) {
        container.innerHTML = '<p style="text-align: center; opacity: 0.7; grid-column: 1 / -1;">Ce joueur n\'a aucun pixel</p>';
        return;
    }

    // Désérialiser la collection
    const theirPixels = [];
    for (const [key, pixel] of Object.entries(selectedTradePlayer.collection)) {
        theirPixels.push({
            ...pixel,
            data: pixel.data && typeof pixel.data === 'string' ? JSON.parse(pixel.data) : pixel.data,
            colors: pixel.colors && typeof pixel.colors === 'string' ? JSON.parse(pixel.colors) : pixel.colors
        });
    }

    if (theirPixels.length === 0) {
        container.innerHTML = '<p style="text-align: center; opacity: 0.7; grid-column: 1 / -1;">Ce joueur n\'a aucun pixel</p>';
        return;
    }

    theirPixels.forEach(pixel => {
        const item = document.createElement('div');
        item.style.cssText = 'cursor: pointer; padding: 5px; border-radius: 5px; transition: all 0.3s; background: rgba(255,255,255,0.1);';
        item.onclick = () => selectTheirPixel(pixel, item);

        const canvas = document.createElement('canvas');
        canvas.width = 80;
        canvas.height = 80;
        PixelRenderer.drawPixel(canvas, pixel, 80);

        const name = document.createElement('div');
        name.style.cssText = 'font-size: 0.7em; text-align: center; margin-top: 3px;';
        name.textContent = pixel.name;

        item.appendChild(canvas);
        item.appendChild(name);
        container.appendChild(item);
    });
}

function selectMyPixel(pixel, element) {
    selectedMyPixel = pixel;
    // Highlight visuel
    document.querySelectorAll('#myPixelsForTrade > div').forEach(div => {
        div.style.background = 'rgba(255,255,255,0.1)';
        div.style.transform = 'scale(1)';
    });
    element.style.background = 'rgba(100,200,100,0.3)';
    element.style.transform = 'scale(1.1)';

    checkTradeReady();
}

function selectTheirPixel(pixel, element) {
    selectedTheirPixel = pixel;
    // Highlight visuel
    document.querySelectorAll('#theirPixelsForTrade > div').forEach(div => {
        div.style.background = 'rgba(255,255,255,0.1)';
        div.style.transform = 'scale(1)';
    });
    element.style.background = 'rgba(100,200,100,0.3)';
    element.style.transform = 'scale(1.1)';

    checkTradeReady();
}

function checkTradeReady() {
    const btn = document.getElementById('sendTradeOffer');
    btn.disabled = !(selectedMyPixel && selectedTheirPixel && selectedTradePlayer);
}

// Supprimer récursivement tous les undefined d'un objet
function removeUndefined(obj) {
    if (obj === null || obj === undefined) {
        return null;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => removeUndefined(item)).filter(item => item !== null && item !== undefined);
    }

    if (typeof obj === 'object') {
        const cleaned = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== undefined && value !== null) {
                const cleanedValue = removeUndefined(value);
                if (cleanedValue !== null && cleanedValue !== undefined) {
                    cleaned[key] = cleanedValue;
                }
            }
        }
        return cleaned;
    }

    return obj;
}

// Nettoyer les données d'un pixel pour Firestore (enlever les undefined)
function cleanPixelForFirestore(pixel) {
    const cleaned = {};

    // Ajouter seulement les champs définis
    if (pixel.id !== undefined) cleaned.id = pixel.id;
    if (pixel.name !== undefined) cleaned.name = pixel.name;
    if (pixel.type !== undefined) cleaned.type = pixel.type;
    if (pixel.rarity !== undefined) cleaned.rarity = pixel.rarity;
    if (pixel.size !== undefined) cleaned.size = pixel.size;

    // Ajouter data seulement si défini et non vide
    if (pixel.data) {
        const dataString = typeof pixel.data === 'string' ? pixel.data : JSON.stringify(removeUndefined(pixel.data));
        if (dataString && dataString !== '{}' && dataString !== '[]') {
            cleaned.data = dataString;
        }
    }

    // Ajouter colors seulement si défini et non vide
    if (pixel.colors) {
        const colorsString = typeof pixel.colors === 'string' ? pixel.colors : JSON.stringify(removeUndefined(pixel.colors));
        if (colorsString && colorsString !== '{}' && colorsString !== '[]') {
            cleaned.colors = colorsString;
        }
    }

    return cleaned;
}

async function handleSendTrade() {
    if (!selectedMyPixel || !selectedTheirPixel || !selectedTradePlayer) {
        alert('Sélectionne les deux pixels à échanger');
        return;
    }

    if (!confirm(`Proposer d'échanger ton ${selectedMyPixel.name} contre le ${selectedTheirPixel.name} de ${selectedTradePlayer.displayName} ?`)) {
        return;
    }

    try {
        await addDoc(collection(db, 'trades'), {
            fromUserId: currentUser.uid,
            fromUserName: currentUser.displayName || 'Joueur',
            toUserId: selectedTradePlayer.uid,
            toUserName: selectedTradePlayer.displayName,
            fromPixelId: selectedMyPixel.id,
            fromPixelName: selectedMyPixel.name,
            fromPixelData: cleanPixelForFirestore(selectedMyPixel),
            toPixelId: selectedTheirPixel.id,
            toPixelName: selectedTheirPixel.name,
            toPixelData: cleanPixelForFirestore(selectedTheirPixel),
            status: 'pending',
            createdAt: serverTimestamp()
        });

        alert('Proposition d\'échange envoyée !');

        // Reset
        selectedMyPixel = null;
        selectedTheirPixel = null;
        document.getElementById('selectPlayer').value = '';
        handlePlayerSelect({ target: document.getElementById('selectPlayer') });
    } catch (error) {
        console.error('Erreur d\'envoi de la proposition:', error);
        alert('Erreur: ' + error.message);
    }
}

function switchTradeTab(tabName) {
    // Changer les onglets actifs
    document.querySelectorAll('.trade-tab').forEach(tab => {
        if (tab.dataset.tradeTab === tabName) {
            tab.style.background = 'rgba(255,255,255,0.3)';
            tab.style.fontWeight = 'bold';
        } else {
            tab.style.background = 'rgba(0,0,0,0.2)';
            tab.style.fontWeight = 'normal';
        }
    });

    // Afficher la bonne section
    document.querySelectorAll('.trade-section').forEach(section => {
        section.style.display = 'none';
    });

    if (tabName === 'propose') {
        document.getElementById('proposeTrade').style.display = 'block';
    } else if (tabName === 'pending') {
        document.getElementById('pendingTrades').style.display = 'block';
        loadPendingTrades();
    } else if (tabName === 'history') {
        document.getElementById('historyTrades').style.display = 'block';
        loadTradeHistory();
    }
}

async function loadPendingTrades() {
    const container = document.getElementById('pendingTradesList');
    container.innerHTML = '<p style="text-align: center; opacity: 0.7;">Chargement...</p>';

    try {
        // Échanges reçus (en attente)
        const receivedQuery = query(
            collection(db, 'trades'),
            where('toUserId', '==', currentUser.uid),
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc')
        );

        // Échanges envoyés (en attente)
        const sentQuery = query(
            collection(db, 'trades'),
            where('fromUserId', '==', currentUser.uid),
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc')
        );

        const [receivedSnap, sentSnap] = await Promise.all([
            getDocs(receivedQuery),
            getDocs(sentQuery)
        ]);

        container.innerHTML = '';

        // Afficher les échanges reçus
        if (!receivedSnap.empty) {
            const receivedTitle = document.createElement('h3');
            receivedTitle.textContent = '📥 Propositions reçues';
            receivedTitle.style.color = 'white';
            container.appendChild(receivedTitle);

            receivedSnap.forEach(docSnap => {
                const trade = { id: docSnap.id, ...docSnap.data() };
                container.appendChild(createTradeCard(trade, 'received'));
            });
        }

        // Afficher les échanges envoyés
        if (!sentSnap.empty) {
            const sentTitle = document.createElement('h3');
            sentTitle.textContent = '📤 Propositions envoyées';
            sentTitle.style.color = 'white';
            sentTitle.style.marginTop = '20px';
            container.appendChild(sentTitle);

            sentSnap.forEach(docSnap => {
                const trade = { id: docSnap.id, ...docSnap.data() };
                container.appendChild(createTradeCard(trade, 'sent'));
            });
        }

        if (receivedSnap.empty && sentSnap.empty) {
            container.innerHTML = '<p style="text-align: center; opacity: 0.7;">Aucun échange en attente</p>';
        }

        // Mettre à jour le compteur
        document.getElementById('pendingTradesCount').textContent = receivedSnap.size;
    } catch (error) {
        console.error('Erreur de chargement des échanges:', error);
        container.innerHTML = '<p style="text-align: center; opacity: 0.7;">Erreur de chargement</p>';
    }
}

async function loadTradeHistory() {
    const container = document.getElementById('historyTradesList');
    container.innerHTML = '<p style="text-align: center; opacity: 0.7;">Chargement...</p>';

    try {
        // Récupérer les échanges où je suis l'émetteur (fromUserId)
        const qFrom = query(
            collection(db, 'trades'),
            where('fromUserId', '==', currentUser.uid),
            where('status', 'in', ['accepted', 'refused']),
            orderBy('createdAt', 'desc'),
            limit(25)
        );

        // Récupérer les échanges où je suis le destinataire (toUserId)
        const qTo = query(
            collection(db, 'trades'),
            where('toUserId', '==', currentUser.uid),
            where('status', 'in', ['accepted', 'refused']),
            orderBy('createdAt', 'desc'),
            limit(25)
        );

        const [fromSnapshot, toSnapshot] = await Promise.all([
            getDocs(qFrom),
            getDocs(qTo)
        ]);

        // Combiner les résultats
        const allTrades = [];
        fromSnapshot.forEach(docSnap => {
            allTrades.push({ id: docSnap.id, ...docSnap.data() });
        });
        toSnapshot.forEach(docSnap => {
            allTrades.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Trier par date décroissante
        allTrades.sort((a, b) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        });

        if (allTrades.length === 0) {
            container.innerHTML = '<p style="text-align: center; opacity: 0.7;">Aucun historique</p>';
            return;
        }

        container.innerHTML = '';
        allTrades.forEach(trade => {
            container.appendChild(createTradeCard(trade, 'history'));
        });
    } catch (error) {
        console.error('Erreur de chargement de l\'historique:', error);
        container.innerHTML = '<p style="text-align: center; opacity: 0.7;">Erreur de chargement</p>';
    }
}

function createTradeCard(trade, type) {
    const card = document.createElement('div');
    card.style.cssText = 'background: rgba(255,255,255,0.1); padding: 15px; border-radius: 10px; margin-bottom: 15px;';

    const date = trade.createdAt?.toDate ? trade.createdAt.toDate().toLocaleString('fr-FR') : 'Date inconnue';

    let statusBadge = '';
    if (trade.status === 'accepted') {
        statusBadge = '<span style="background: #4caf50; padding: 5px 10px; border-radius: 12px; font-size: 0.85em;">✅ Accepté</span>';
    } else if (trade.status === 'refused') {
        statusBadge = '<span style="background: #f44336; padding: 5px 10px; border-radius: 12px; font-size: 0.85em;">❌ Refusé</span>';
    }

    let actions = '';
    if (type === 'received' && trade.status === 'pending') {
        actions = `
            <div style="display: flex; gap: 10px; margin-top: 10px;">
                <button onclick="acceptTrade('${trade.id}')" class="open-button" style="flex: 1; background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%);">✅ Accepter</button>
                <button onclick="refuseTrade('${trade.id}')" class="open-button" style="flex: 1; background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);">❌ Refuser</button>
            </div>
        `;
    } else if (type === 'sent' && trade.status === 'pending') {
        actions = `<button onclick="cancelTrade('${trade.id}')" class="open-button" style="width: 100%; background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%); margin-top: 10px;">🗑️ Annuler</button>`;
    }

    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div>
                <strong>${trade.fromUserName}</strong> ↔️ <strong>${trade.toUserName}</strong>
            </div>
            <div style="font-size: 0.85em; opacity: 0.8;">${date}</div>
        </div>
        <div style="display: flex; gap: 15px; align-items: center; margin: 15px 0;">
            <div style="flex: 1; text-align: center;">
                <div style="font-size: 0.9em; opacity: 0.8; margin-bottom: 5px;">Propose</div>
                <div style="font-weight: bold;">${trade.fromPixelName}</div>
            </div>
            <div style="font-size: 1.5em;">↔️</div>
            <div style="flex: 1; text-align: center;">
                <div style="font-size: 0.9em; opacity: 0.8; margin-bottom: 5px;">Contre</div>
                <div style="font-weight: bold;">${trade.toPixelName}</div>
            </div>
        </div>
        ${statusBadge}
        ${actions}
    `;

    return card;
}

window.acceptTrade = async function(tradeId) {
    if (!confirm('Accepter cet échange ?')) return;

    try {
        const tradeDoc = await getDoc(doc(db, 'trades', tradeId));
        if (!tradeDoc.exists()) {
            alert('Échange introuvable');
            return;
        }

        const trade = tradeDoc.data();

        // Vérifier que les deux joueurs ont toujours les pixels
        const fromUserDoc = await getDoc(doc(db, 'users', trade.fromUserId));
        const toUserDoc = await getDoc(doc(db, 'users', trade.toUserId));

        if (!fromUserDoc.exists() || !toUserDoc.exists()) {
            alert('Un des utilisateurs n\'existe plus');
            return;
        }

        const fromUserData = fromUserDoc.data();
        const toUserData = toUserDoc.data();

        if (!fromUserData.collection[trade.fromPixelId]) {
            alert(`${trade.fromUserName} n'a plus ce pixel`);
            return;
        }

        if (!toUserData.collection[trade.toPixelId]) {
            alert('Tu n\'as plus ce pixel');
            return;
        }

        // Effectuer l'échange
        const fromPixel = fromUserData.collection[trade.fromPixelId];
        const toPixel = toUserData.collection[trade.toPixelId];

        // Mettre à jour les collections
        delete fromUserData.collection[trade.fromPixelId];
        fromUserData.collection[trade.toPixelId] = toPixel;

        delete toUserData.collection[trade.toPixelId];
        toUserData.collection[trade.fromPixelId] = fromPixel;

        // Sauvegarder dans Firestore
        await updateDoc(doc(db, 'users', trade.fromUserId), {
            collection: fromUserData.collection,
            updatedAt: serverTimestamp()
        });

        await updateDoc(doc(db, 'users', trade.toUserId), {
            collection: toUserData.collection,
            updatedAt: serverTimestamp()
        });

        // Marquer l'échange comme accepté
        await updateDoc(doc(db, 'trades', tradeId), {
            status: 'accepted',
            acceptedAt: serverTimestamp()
        });

        alert('Échange effectué avec succès !');

        // Recharger les données
        await loadUserData();
        await loadPendingTrades();
    } catch (error) {
        console.error('Erreur lors de l\'acceptation:', error);
        alert('Erreur: ' + error.message);
    }
}

window.refuseTrade = async function(tradeId) {
    if (!confirm('Refuser cet échange ?')) return;

    try {
        await updateDoc(doc(db, 'trades', tradeId), {
            status: 'refused',
            refusedAt: serverTimestamp()
        });

        alert('Échange refusé');
        await loadPendingTrades();
    } catch (error) {
        console.error('Erreur lors du refus:', error);
        alert('Erreur: ' + error.message);
    }
}

window.cancelTrade = async function(tradeId) {
    if (!confirm('Annuler cette proposition ?')) return;

    try {
        await deleteDoc(doc(db, 'trades', tradeId));
        alert('Proposition annulée');
        await loadPendingTrades();
    } catch (error) {
        console.error('Erreur lors de l\'annulation:', error);
        alert('Erreur: ' + error.message);
    }
}

function subscribeToTrades() {
    // Se désabonner si déjà abonné
    if (tradesUnsubscribe) {
        tradesUnsubscribe();
    }

    // S'abonner aux échanges en temps réel
    const q = query(
        collection(db, 'trades'),
        where('toUserId', '==', currentUser.uid),
        where('status', '==', 'pending')
    );

    tradesUnsubscribe = onSnapshot(q, (snapshot) => {
        const count = snapshot.size;
        document.getElementById('pendingTradesCount').textContent = count;

        // Si on est sur l'onglet pending, rafraîchir
        const activeTab = document.querySelector('.trade-tab.active');
        if (activeTab && activeTab.dataset.tradeTab === 'pending') {
            loadPendingTrades();
        }
    });
}
