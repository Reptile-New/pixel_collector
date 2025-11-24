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
    doc,
    setDoc,
    getDoc,
    updateDoc,
    serverTimestamp
} from './firebase-config.js';

// Variables globales
let currentUser = null;
let userCollection = {};
let userStats = {
    chestsOpened: 0,
    totalPixels: 0,
    uniquePixels: 0
};
let currentAlbum = 'all'; // Album actuellement affiché

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    drawChest();

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
            userCollection = data.collection || {};
            userStats = data.stats || {
                chestsOpened: 0,
                totalPixels: 0,
                uniquePixels: 0
            };
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
        const data = {
            collection: userCollection,
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
    // MODE DEV : Toujours autoriser l'ouverture de coffres
    return true;

    // Production (à réactiver plus tard) :
    // const lastTime = userStats.lastChestTime || 0;
    // const now = Date.now();
    // const hoursSince = (now - lastTime) / (1000 * 60 * 60);
    // return hoursSince >= 24;
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
    });
    document.getElementById(tabName + 'Tab').classList.add('active');

    // Actions spécifiques
    if (tabName === 'collection') {
        displayCollection();
    }
}

// === MISE À JOUR DE L'UI ===

function updateUI() {
    // Stats utilisateur
    const displayName = currentUser.displayName || currentUser.email?.split('@')[0] || 'Joueur';
    document.getElementById('userName').textContent = displayName;
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
