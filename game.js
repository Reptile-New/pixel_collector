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
    signInWithRedirect,
    getRedirectResult,
    updateProfile,
    sendEmailVerification,
    deleteUser,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    serverTimestamp,
    collection,
    query,
    orderBy,
    limit,
    getDocs,
    addDoc,
    onSnapshot,
    where
} from './firebase-config.js?v=26'; // même version que dans index.html (sinon Firebase serait initialisé deux fois)

// ============================================================
// UI : notifications (toasts) + dialogue de confirmation stylé
// Remplacent les alert()/confirm() natifs du navigateur.
// ============================================================
function showToast(message, type) {
    const host = document.getElementById('appToast');
    if (!host) { console.log(message); return; }

    // Détection automatique du ton si non précisé
    if (!type) {
        const m = message.toLowerCase();
        if (/erreur|incorrect|invalide|impossible|pas assez|déjà|introuvable|trop faible|ne peut pas|plus ce pixel/.test(m)) type = 'error';
        else if (/réussi|succès|✅|✨|🎉|envoyé|modifié|récupéré|recyclé|supprimé avec succès/.test(m)) type = 'success';
        else type = 'info';
    }

    const icons = { success: '✅', error: '⚠️', warn: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    const icon = document.createElement('span');
    icon.className = 'toast__icon';
    icon.textContent = icons[type] || icons.info;
    const msg = document.createElement('span');
    msg.className = 'toast__msg';
    msg.textContent = message;
    toast.append(icon, msg);
    host.appendChild(toast);

    const remove = () => {
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), 250);
    };
    setTimeout(remove, type === 'error' ? 5200 : 3800);
    toast.addEventListener('click', remove);
}

// Dialogue de confirmation — renvoie une Promise<boolean>
function uiConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('appDialog');
        const box = document.getElementById('appDialogBox');
        const titleEl = document.getElementById('appDialogTitle');
        const msgEl = document.getElementById('appDialogMsg');
        const iconEl = document.getElementById('appDialogIcon');
        const okBtn = document.getElementById('appDialogConfirm');
        const cancelBtn = document.getElementById('appDialogCancel');

        // Repli si le markup n'est pas présent
        if (!overlay) { resolve(window.confirm(message)); return; }

        const danger = !!options.danger;
        box.classList.toggle('danger', danger);
        iconEl.textContent = options.icon || (danger ? '🗑️' : '❓');
        titleEl.textContent = options.title || 'Confirmer';
        msgEl.textContent = message;
        okBtn.textContent = options.confirmLabel || 'Confirmer';
        cancelBtn.textContent = options.cancelLabel || 'Annuler';

        const cleanup = (result) => {
            overlay.classList.remove('open');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onKey);
            resolve(result);
        };
        const onOk = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onBackdrop = (e) => { if (e.target === overlay) cleanup(false); };
        const onKey = (e) => {
            if (e.key === 'Escape') cleanup(false);
            if (e.key === 'Enter') cleanup(true);
        };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        overlay.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onKey);

        overlay.classList.add('open');
        okBtn.focus();
    });
}

// Variables globales
let currentUser = null;
let chestOpening = false; // verrou pendant l'animation d'ouverture du coffre
let userCollection = {};
let userStats = {
    chestsOpened: 0,
    totalPixels: 0,
    uniquePixels: 0,
    lastChestTime: 0,
    shards: 0,
    streak: 0,
    mineLastCollect: 0
};

// === ÉCONOMIE DE L'ATELIER ===
// Règle : 1 pixel = 1 éclat. La valeur d'un doublon est sa surface en pixels :
// un 1x1 vaut 1, un 2x2 en contient 4, un pixel art 8x8 en contient 64.
const SHARD_VALUES = { '1x1': 1, '2x2': 4, 'art': 64 };
// Coût des crafts = assembler les pixels de l'item : un 1x1 coûte 1 pixel,
// un 2x2 ses 4 pixels, un pixel art ses 64 pixels. Coffre bonus : 16.
// Tous les crafts payés en éclats sont 100% aléatoires dans leur catégorie.
// Pour un 2x2 précis : l'assemblage sur mesure, payé en pixels 1x1.
// Coûts en éclats des crafts de l'Atelier. Les légendaires ne s'achètent PAS
// avec des éclats : on ne les obtient qu'en coffre (rare) ou à la Forge.
const CRAFT_COSTS = { craft1x1: 1, craft2x2Random: 3, craft2x2New: 4 };
// Contenu d'un coffre : des éclats (min..max) + des tuiles 2×2 (min..max de base).
const CHEST_SHARDS_MIN = 2;
const CHEST_SHARDS_MAX = 10;
const CHEST_TILES_MIN = 3;
const CHEST_TILES_MAX = 4;
// Chance d'obtenir un légendaire en ouvrant un coffre. Rare et SANS pitié :
// un légendaire doit rester dur à obtenir.
const LEGENDARY_CHEST_RATE = 0.01; // 1 %
// Bonus de série : +1 tuile à partir de 3 jours consécutifs, +2 à partir de 7
const STREAK_BONUSES = [{ days: 3, extra: 1 }, { days: 7, extra: 2 }];

// === MINE À ÉCLATS (récolte passive) ===
// La mine produit 1 éclat toutes les MINE_RATE_MS, jusqu'à un plafond de MINE_CAP.
// Le joueur revient de temps en temps cliquer sur « Récolter » pour encaisser
// les éclats accumulés. Le plafond incite à revenir plusieurs fois par jour.
const MINE_RATE_MS = 30 * 60 * 1000; // 1 éclat toutes les 30 minutes
const MINE_CAP = 16;                 // réserve maximale = 8 h d'accumulation
// Assemblage sur mesure d'un 2×2 : n'est pas garanti (sinon choisir son 2×2
// exact serait trop facile). En cas d'échec, les pixels 1×1 sont perdus.
const CUSTOM_CRAFT_RATE = 0.70; // 70 % de réussite
// Configuration des albums
const ALBUMS = [
    { id: 'all', label: 'Tous' },
    { id: '1x1', label: 'Pixels 1×1' },
    { id: '2x2', label: 'Pixels 2×2' },
    { id: 'art', label: 'Pixel Arts' }
];

let currentAlbum = 'all'; // Album actuellement affiché
let collectionOwnership = 'all'; // Filtre : 'all' | 'owned' | 'missing'
let allPlayers = []; // Liste de tous les joueurs
let currentModalAlbum = 'all'; // Album actuellement affiché dans la modal
let currentModalPlayer = null; // Joueur actuellement affiché dans la modal

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

    // Rafraîchir le compte à rebours du coffre (reset à midi et minuit)
    setInterval(updateChestStatus, 30 * 1000);

    // Rafraîchir la mine à éclats (compte à rebours du prochain éclat)
    setInterval(() => { if (currentUser) updateMineUI(); }, 1000);

    // Bannière d'installation de l'app (PWA)
    setupInstallBanner();

    // Récupérer le résultat d'une connexion Google par redirection
    // (utilisée dans l'app installée, où la popup ne fonctionne pas).
    // En cas de succès, onAuthStateChanged prend le relais.
    getRedirectResult(auth).catch((error) => {
        console.error('Erreur de connexion Google (redirection):', error);
        showToast('Erreur de connexion avec Google: ' + error.message);
    });

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
    // Modal profil / paramètres du compte
    document.getElementById('profileButton').addEventListener('click', () => {
        document.getElementById('profileModal').style.display = 'block';
    });
    document.getElementById('closeProfileSettings').addEventListener('click', () => {
        document.getElementById('profileModal').style.display = 'none';
    });
    document.getElementById('profileModal').addEventListener('click', (e) => {
        if (e.target.id === 'profileModal') {
            document.getElementById('profileModal').style.display = 'none';
        }
    });

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
    document.getElementById('collectMineButton').addEventListener('click', collectMine);

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

    // Filtre possédés / manquants
    document.querySelectorAll('.owner-chip').forEach(chip => {
        chip.addEventListener('click', () => switchOwnerFilter(chip.dataset.owner));
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

    // Bouton nettoyer pixels corrompus
    document.getElementById('cleanCorruptedPixels').addEventListener('click', cleanCorruptedPixels);

    // Recherche dans la modal
    document.getElementById('modalSearchCollection').addEventListener('input', (e) => {
        filterModalCollection(e.target.value);
    });

    // Atelier
    document.querySelectorAll('.color-craft-btn').forEach(btn => {
        btn.addEventListener('click', () => craft1x1(btn.dataset.craftColor));
    });
    initCustomCraft();

    // Craft de 2×2 en éclats
    const rndBtn = document.getElementById('craftRandom2x2Btn');
    if (rndBtn) rndBtn.addEventListener('click', craftRandom2x2);
    const newBtn = document.getElementById('craftNew2x2Btn');
    if (newBtn) newBtn.addEventListener('click', craftNew2x2);

    // Forge légendaire
    const closeForge = document.getElementById('closeForgeModal');
    if (closeForge) closeForge.addEventListener('click', closeForgeModal);
    const forgeModal = document.getElementById('forgeModal');
    if (forgeModal) forgeModal.addEventListener('click', (e) => {
        if (e.target.id === 'forgeModal') closeForgeModal();
    });
    const forgeBtn = document.getElementById('forgeButton');
    if (forgeBtn) forgeBtn.addEventListener('click', attemptForge);

    // Trade system event listeners
    document.querySelectorAll('.trade-tab').forEach(tab => {
        tab.addEventListener('click', (e) => switchTradeTab(e.currentTarget.dataset.tradeTab));
    });
    document.getElementById('selectPlayer').addEventListener('change', handlePlayerSelect);
    document.getElementById('sendTradeOffer').addEventListener('click', handleSendTrade);
    ['offerShards', 'requestShards'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', checkTradeReady);
    });
}

// Lit un champ d'éclats (entier positif, borné au solde pour l'offre)
function readShardField(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    const n = Math.floor(Number(el.value));
    return Number.isFinite(n) && n > 0 ? n : 0;
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

// === BANNIÈRE D'INSTALLATION DE L'APP (PWA) ===

function isAppInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
}

function setupInstallBanner() {
    const banner = document.getElementById('installBanner');
    if (!banner || isAppInstalled()) return;

    // Fermée uniquement pour la session en cours : la bannière réapparaît à
    // la prochaine visite pour rappeler que l'app est installable
    if (sessionStorage.getItem('installBannerDismissed')) return;

    const btn = document.getElementById('installBannerButton');
    const help = document.getElementById('installBannerHelp');

    // Android / Chrome / Edge sur ordinateur : installation en UN CLIC
    // (l'événement beforeinstallprompt est capturé au plus tôt dans index.html)
    const enableOneClick = () => {
        btn.style.display = 'inline-block';
        help.style.display = 'none';
        banner.style.display = 'flex';
    };
    if (window.deferredInstallPrompt) enableOneClick();
    window.addEventListener('pc-install-available', enableOneClick);

    // Sinon (iPhone surtout : Apple interdit l'installation en un clic),
    // on affiche la bonne marche à suivre selon le navigateur.
    setTimeout(() => {
        if (window.deferredInstallPrompt || isAppInstalled()) return;

        const ua = navigator.userAgent;
        const isIOS = /iPhone|iPad|iPod/.test(ua)
            || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        if (isIOS) {
            // Depuis iOS 16.4, TOUS les navigateurs (Safari, Chrome, Edge,
            // Firefox...) ajoutent à l'écran d'accueil via leur propre menu
            // Partager. Apple n'autorise aucune installation en un clic : on
            // explique simplement la manip, sans jamais renvoyer vers Safari.
            // Tous les navigateurs iOS ont « Safari » dans leur UA ; on repère
            // Safari « pur » par l'absence des marqueurs des autres navigateurs.
            const isSafari = !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(ua);
            if (isSafari) {
                // Sur Safari, le bouton Partager est en bas de l'écran
                help.innerHTML = 'Appuie sur <strong>Partager</strong> ⬆️ (en bas de l\'écran), puis « <strong>Sur l\'écran d\'accueil</strong> ».';
            } else {
                // Chrome, Edge, Firefox... : bouton Partager dans la barre du navigateur
                help.innerHTML = 'Appuie sur le bouton <strong>Partager</strong> ⬆️ de ton navigateur, puis « <strong>Sur l\'écran d\'accueil</strong> ».';
            }
            help.style.display = 'block';
            banner.style.display = 'flex';
        }
        // Autres navigateurs sans support d'installation : on n'affiche rien
    }, 1500);

    btn.addEventListener('click', async () => {
        const promptEvent = window.deferredInstallPrompt;
        if (!promptEvent) return;
        promptEvent.prompt();
        await promptEvent.userChoice;
        window.deferredInstallPrompt = null;
        banner.style.display = 'none';
    });

    document.getElementById('installBannerClose').addEventListener('click', () => {
        banner.style.display = 'none';
        sessionStorage.setItem('installBannerDismissed', '1');
    });
}

// === AUTHENTIFICATION FIREBASE ===

async function handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showToast('Veuillez remplir tous les champs');
        return;
    }

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);

        // Vérifier si l'email est vérifié
        if (!userCredential.user.emailVerified) {
            // Réparer/créer le document Firestore tant qu'on est encore
            // authentifié (les comptes inscrits avant le correctif n'en ont pas)
            try {
                await ensureUserDoc(userCredential.user);
            } catch (e) {
                console.warn('Impossible de créer le document utilisateur:', e);
            }

            if (await uiConfirm('Ton email n\'est pas encore vérifié : clique sur le lien reçu par mail pour activer ton compte.\n\nRenvoyer l\'email de vérification ?')) {
                try {
                    await sendEmailVerification(userCredential.user);
                    showToast('Email renvoyé ! Vérifie ta boîte mail (et le dossier spam).');
                } catch (e) {
                    showToast('Impossible de renvoyer l\'email : ' + e.message);
                }
            }

            await signOut(auth);
            return;
        }

        // onAuthStateChanged gérera la suite
    } catch (error) {
        console.error('Erreur de connexion:', error);
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            showToast('Email ou mot de passe incorrect');
        } else if (error.code === 'auth/invalid-email') {
            showToast('Email invalide');
        } else {
            showToast('Erreur de connexion: ' + error.message);
        }
    }
}

async function handleRegister() {
    const pseudo = document.getElementById('registerPseudo').value.trim();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;

    if (!pseudo || !email || !password) {
        showToast('Veuillez remplir tous les champs');
        return;
    }

    if (pseudo.length < 3) {
        showToast('Le pseudo doit contenir au moins 3 caractères');
        return;
    }

    if (password.length < 6) {
        showToast('Le mot de passe doit contenir au moins 6 caractères');
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);

        // 1. Créer le document Firestore EN PREMIER : c'est lui qui rend le
        // compte visible dans le jeu. Avant, un échec des étapes suivantes
        // (profil, email de vérification) laissait un compte Auth sans données.
        await initializeUserData(userCredential.user.uid, pseudo);

        // 2. Pseudo sur le compte Auth — ne doit pas bloquer l'inscription
        try {
            await updateProfile(userCredential.user, { displayName: pseudo });
        } catch (e) {
            console.warn('updateProfile a échoué:', e);
        }

        // 3. Email de vérification — ne doit pas bloquer non plus
        // (renvoyable depuis l'écran de connexion)
        try {
            await sendEmailVerification(userCredential.user);
        } catch (e) {
            console.warn('sendEmailVerification a échoué:', e);
        }

        // Déconnecter l'utilisateur et afficher un message
        await signOut(auth);
        showToast('Inscription réussie ! Un email de confirmation a été envoyé à ' + email + '. Veuillez vérifier votre boîte mail pour activer votre compte.');

        // Revenir à l'onglet connexion
        window.switchAuthTab('login');
    } catch (error) {
        console.error('Erreur d\'inscription:', error);
        if (error.code === 'auth/email-already-in-use') {
            showToast('Cet email est déjà utilisé');
        } else if (error.code === 'auth/invalid-email') {
            showToast('Email invalide');
        } else if (error.code === 'auth/weak-password') {
            showToast('Le mot de passe est trop faible');
        } else {
            showToast('Erreur d\'inscription: ' + error.message);
        }
    }
}

async function handleGoogleSignIn() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
        prompt: 'select_account'
    });

    // On tente TOUJOURS la popup d'abord : elle fonctionne sur navigateur et
    // sur PWA installée (Android / desktop) et rend la main à l'app.
    // La redirection (signInWithRedirect) est gardée en dernier recours car
    // elle casse quand le site (reptile-new.github.io) et l'authDomain
    // (pixel-collector-online.firebaseapp.com) sont sur des domaines
    // différents : les navigateurs récents bloquent les cookies tiers dont
    // elle a besoin, et le retour de connexion est perdu.
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
        if (error.code === 'auth/popup-closed-by-user'
            || error.code === 'auth/cancelled-popup-request') {
            // L'utilisateur a fermé/annulé la popup, ne rien faire
            return;
        }
        if (error.code === 'auth/popup-blocked'
            || error.code === 'auth/operation-not-supported-in-this-environment') {
            // Popup vraiment impossible (souvent PWA iOS) : repli sur la redirection
            try {
                await signInWithRedirect(auth, provider);
            } catch (e) {
                console.error('Erreur de connexion Google (redirection):', e);
                showToast('Erreur de connexion avec Google: ' + e.message);
            }
            return;
        }
        showToast('Erreur de connexion avec Google: ' + error.message);
    }
}

async function handleLogout() {
    try {
        // Arrêter tous les listeners Firestore AVANT la déconnexion
        if (tradesUnsubscribe) {
            tradesUnsubscribe();
            tradesUnsubscribe = null;
        }

        await signOut(auth);
        // onAuthStateChanged gérera la suite
    } catch (error) {
        console.error('Erreur de déconnexion:', error);
        showToast('Erreur de déconnexion: ' + error.message);
    }
}

async function handleSaveName() {
    const newName = document.getElementById('userNameInput').value.trim();

    if (!newName) {
        showToast('Le pseudo ne peut pas être vide');
        return;
    }

    if (newName.length < 3) {
        showToast('Le pseudo doit contenir au moins 3 caractères');
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

        showToast('Pseudo modifié avec succès !');
        updateUI();
    } catch (error) {
        console.error('Erreur de modification du pseudo:', error);
        showToast('Erreur lors de la modification du pseudo: ' + error.message);
    }
}

async function handleDeleteAccount() {
    const confirmation = await uiConfirm('Cette action est irréversible et supprimera :\n- Votre compte\n- Toutes vos données\n- Votre collection de pixels\n- Vos statistiques', { danger: true, title: 'Supprimer le compte ?', confirmLabel: 'Supprimer', icon: '🗑️' });

    if (!confirmation) {
        return;
    }

    // Demander une double confirmation
    const doubleConfirmation = await uiConfirm('Votre compte sera définitivement supprimé. Cette action ne peut pas être annulée.', { danger: true, title: 'Dernière confirmation', confirmLabel: 'Supprimer définitivement', icon: '⚠️' });

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

        showToast('Votre compte a été supprimé avec succès.');
        // onAuthStateChanged redirigera automatiquement vers l'écran de connexion
    } catch (error) {
        console.error('Erreur de suppression du compte:', error);

        if (error.code === 'auth/requires-recent-login') {
            showToast('Pour des raisons de sécurité, vous devez vous reconnecter avant de supprimer votre compte.\n\nVeuillez vous déconnecter puis vous reconnecter, et réessayez.');
        } else {
            showToast('Erreur lors de la suppression du compte: ' + error.message);
        }
    }
}

async function cleanCorruptedPixels() {
    if (!await uiConfirm('Nettoyer les pixels corrompus ?\n\nCette action va supprimer tous les pixels qui ont des données manquantes ou invalides (pixels noirs ou rouges).\n\nVoulez-vous continuer ?')) {
        return;
    }

    try {
        let cleanedCount = 0;
        const pixelsToRemove = [];

        // Parcourir tous les pixels et identifier les corrompus
        for (const [pixelId, pixel] of Object.entries(userCollection)) {
            let isCorrupted = false;

            // Vérifier selon le type
            if (pixel.type === '1x1') {
                // Les pixels 1x1 doivent avoir un pattern
                if (!pixel.pattern) {
                    isCorrupted = true;
                }
            } else if (pixel.type === '2x2') {
                // Les pixels 2x2 doivent avoir un pattern de 4 caractères
                if (!pixel.pattern || pixel.pattern.length !== 4) {
                    isCorrupted = true;
                }
            } else if (pixel.type === 'art') {
                // Les pixel arts doivent avoir data (grille 8x8) et colors
                if (!pixel.data || !Array.isArray(pixel.data) || pixel.data.length !== 8 || !pixel.colors) {
                    isCorrupted = true;
                }
            }

            if (isCorrupted) {
                pixelsToRemove.push(pixelId);
                cleanedCount++;
            }
        }

        if (cleanedCount === 0) {
            showToast('Aucun pixel corrompu trouvé ! 🎉');
            return;
        }

        // Confirmation avec le nombre de pixels à supprimer
        if (!await uiConfirm(`${cleanedCount} pixel(s) corrompu(s) trouvé(s).\n\nConfirmer la suppression ?`)) {
            return;
        }

        // Supprimer les pixels corrompus
        for (const pixelId of pixelsToRemove) {
            delete userCollection[pixelId];
        }

        // Sauvegarder
        await saveUserData();

        showToast(`${cleanedCount} pixel(s) corrompu(s) supprimé(s) avec succès ! ✨`);

        // Recharger l'affichage
        await loadUserData();
        displayCollection();
    } catch (error) {
        console.error('Erreur lors du nettoyage:', error);
        showToast('Erreur: ' + error.message);
    }
}

function showGameScreen() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'flex';
    updateUI();
}

function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('gameScreen').style.display = 'none';
}

// === GESTION DES DONNÉES UTILISATEUR AVEC FIRESTORE ===

// Crée le document Firestore du joueur s'il n'existe pas encore.
// Répare aussi les comptes créés avant le correctif d'inscription.
async function ensureUserDoc(user) {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) {
        const name = user.displayName || user.email?.split('@')[0] || 'Joueur';
        await initializeUserData(user.uid, name);
    }
}

async function initializeUserData(uid, displayName) {
    // S'assurer que displayName n'est jamais undefined
    const safeName = displayName || 'Joueur';

    const data = {
        displayName: safeName,
        collection: {},
        stats: {
            chestsOpened: 0,
            totalPixels: 0,
            uniquePixels: 0,
            shards: 0,
            streak: 0,
            mineLastCollect: 0
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
            // Valeurs par défaut pour les comptes créés avant l'Atelier / la série
            userStats.shards = userStats.shards || 0;
            userStats.streak = userStats.streak || 0;
            userStats.mineLastCollect = userStats.mineLastCollect || 0;
            // Charger le lastChestTime pour la limite quotidienne
            userStats.lastChestTime = data.lastChestTime || 0;
            // Resynchroniser les compteurs sur la collection réelle : corrige
            // d'éventuelles stats désynchronisées héritées (elles seront
            // re-persistées correctes à la prochaine sauvegarde).
            updateUniquePixelsCount();
        } else {
            // Premier accès (ou compte réparé) : initialiser les données
            const name = currentUser.displayName || currentUser.email?.split('@')[0] || 'Joueur';
            await initializeUserData(currentUser.uid, name);
        }
    } catch (error) {
        console.error('Erreur de chargement des données:', error);
        showToast('Erreur de chargement des données. Veuillez réessayer.');
    }
}

async function saveUserData() {
    try {
        // Toujours resynchroniser les compteurs sur la collection avant de
        // persister : ils ne peuvent donc jamais être faux dans Firestore.
        updateUniquePixelsCount();

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
            // Ne pas écraser le timer du coffre : toute sauvegarde (échange, recyclage...)
            // remettait la limite quotidienne à zéro
            lastChestTime: userStats.lastChestTime || 0,
            updatedAt: serverTimestamp()
        };

        await updateDoc(doc(db, 'users', currentUser.uid), data);
    } catch (error) {
        console.error('Erreur de sauvegarde des données:', error);
        showToast('Erreur de sauvegarde. Vos progrès pourraient ne pas être sauvegardés.');
    }
}

// === SYSTÈME DE COFFRES ===

// Le coffre se réinitialise deux fois par jour pour tout le monde : à midi et à
// minuit (heure de Paris). Chaque journée compte donc deux créneaux d'ouverture
// (00 h→12 h et 12 h→00 h), soit deux coffres par jour, quel que soit l'horaire.
const CHEST_TIMEZONE = 'Europe/Paris';

// Clé de jour "YYYY-MM-DD" dans le fuseau du reset
function getDayKey(timestamp) {
    return new Intl.DateTimeFormat('fr-CA', { timeZone: CHEST_TIMEZONE }).format(new Date(timestamp));
}

// Heure (0-23) dans le fuseau du reset
function getParisHour(timestamp) {
    const parts = new Intl.DateTimeFormat('fr-FR', {
        timeZone: CHEST_TIMEZONE, hour: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(timestamp));
    return parseInt(parts.find(p => p.type === 'hour').value, 10);
}

// Clé de créneau : jour + demi-journée (matin/après-midi). Change à midi et à minuit.
function getPeriodKey(timestamp) {
    return getDayKey(timestamp) + (getParisHour(timestamp) < 12 ? '#0' : '#1');
}

// Millisecondes restantes avant le prochain reset (prochain midi ou minuit, Paris)
function msUntilNextReset() {
    const parts = new Intl.DateTimeFormat('fr-FR', {
        timeZone: CHEST_TIMEZONE,
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(new Date());
    const get = type => parseInt(parts.find(p => p.type === type).value, 10);
    const elapsedMs = (get('hour') * 3600 + get('minute') * 60 + get('second')) * 1000;
    const halfDayMs = 12 * 3600 * 1000;
    return halfDayMs - (elapsedMs % halfDayMs);
}

function canOpenChest() {
    const lastTime = userStats.lastChestTime || 0;
    if (!lastTime) return true;
    return getPeriodKey(lastTime) !== getPeriodKey(Date.now());
}

// Joue la séquence d'ouverture (tremblement + halo + rayons + flash).
// Résout la promesse quand l'animation est terminée.
function playChestOpening(hasLegendary) {
    return new Promise(resolve => {
        const stage = document.querySelector('.chest-stage');
        const chest = document.querySelector('.chest');
        const flash = document.getElementById('chestFlash');

        // Repli : pas d'animation si le markup n'est pas là
        if (!stage || !chest) { resolve(); return; }

        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) { resolve(); return; }

        stage.classList.add('is-opening');
        if (hasLegendary) stage.classList.add('is-legendary');
        chest.classList.add('opening');

        // Éclair de lumière juste avant la révélation
        setTimeout(() => flash && flash.classList.add('burst'), 830);
        setTimeout(() => {
            chest.classList.remove('opening');
            stage.classList.remove('is-opening', 'is-legendary');
            flash && flash.classList.remove('burst');
            resolve();
        }, 1120);
    });
}

async function openChest() {
    if (chestOpening) return;
    if (!canOpenChest()) {
        const ms = msUntilNextReset();
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        showToast(`Coffre déjà ouvert — reviens dans ${h}h${String(m).padStart(2, '0')}.`);
        return;
    }
    chestOpening = true;

    // Mettre à jour la série quotidienne : elle ne progresse qu'à la PREMIÈRE
    // ouverture d'une journée calendaire (le 2e coffre du jour ne la modifie pas).
    // Elle continue si un coffre a été ouvert hier, sinon elle repart à 1.
    const now = Date.now();
    const lastTime = userStats.lastChestTime || 0;
    if (!lastTime || getDayKey(lastTime) !== getDayKey(now)) {
        const yesterdayKey = getDayKey(now - 24 * 3600 * 1000);
        userStats.streak = (lastTime > 0 && getDayKey(lastTime) === yesterdayKey)
            ? (userStats.streak || 0) + 1
            : 1;
    }

    // Nombre de tuiles 2×2 : base aléatoire (3–4) + bonus de série
    const baseTiles = CHEST_TILES_MIN + Math.floor(Math.random() * (CHEST_TILES_MAX - CHEST_TILES_MIN + 1));
    let streakExtra = 0;
    STREAK_BONUSES.forEach(bonus => {
        if (userStats.streak >= bonus.days) streakExtra = bonus.extra;
    });
    const tileCount = baseTiles + streakExtra;

    // Contenu du coffre : des 2×2 + une chance (1 %) de légendaire
    const pixels = drawChestPixels(tileCount);

    // Éclats : entre CHEST_SHARDS_MIN et CHEST_SHARDS_MAX
    const shardReward = CHEST_SHARDS_MIN + Math.floor(Math.random() * (CHEST_SHARDS_MAX - CHEST_SHARDS_MIN + 1));
    userStats.shards = (userStats.shards || 0) + shardReward;

    // Mettre à jour les stats
    userStats.chestsOpened++;
    updateUniquePixelsCount();
    userStats.lastChestTime = Date.now();

    // Lancer l'animation d'ouverture et sauvegarder en parallèle
    const hasLegendary = pixels.some(p => p.type === 'art');
    const savePromise = saveUserData();
    try {
        await playChestOpening(hasLegendary);
        await savePromise;

        // Afficher le résultat
        let subtitle = `🔥 Série de ${userStats.streak} jour${userStats.streak > 1 ? 's' : ''} &nbsp;·&nbsp; +${shardReward} ✨`;
        if (streakExtra > 0) {
            subtitle += ` &nbsp;·&nbsp; +${streakExtra} tuile${streakExtra > 1 ? 's' : ''} bonus !`;
        }
        if (hasLegendary) {
            subtitle += ' &nbsp;·&nbsp; ✨ LÉGENDAIRE !';
        }
        const tileWord = tileCount > 1 ? 'tuiles 2×2' : 'tuile 2×2';
        const title = hasLegendary
            ? `Un légendaire + ${tileCount} ${tileWord} !`
            : `${tileCount} ${tileWord} obtenues !`;
        showResult(pixels, title, subtitle);

        // Mettre à jour l'UI
        updateUI();
    } finally {
        chestOpening = false;
    }
}

// Tire le contenu d'un coffre : `count` tuiles 2×2 aléatoires, plus une chance
// (LEGENDARY_CHEST_RATE) d'y trouver un légendaire. Ajoute tout à la collection.
function drawChestPixels(count) {
    const pixels = [];
    for (let i = 0; i < count; i++) pixels.push(makeRandom2x2());
    if (Math.random() < LEGENDARY_CHEST_RATE) pixels.push(makeRandomLegendary());

    pixels.forEach(pixel => {
        const isNew = !userCollection[pixel.id];
        addPixelToCollection(pixel);
        userStats.totalPixels++;
        // Flag posé après l'ajout pour ne pas le persister dans la collection
        pixel.isNew = isNew;
    });

    return pixels;
}

// Un pixel 2×2 aléatoire parmi les 256 combinaisons
function makeRandom2x2() {
    const all = PixelRenderer.generateAll2x2();
    const pattern = all[Math.floor(Math.random() * all.length)];
    return { type: '2x2', pattern, id: `2x2_${pattern}`, name: `Pixel 2x2 #${pattern}` };
}

// Un légendaire aléatoire parmi les 30
function makeRandomLegendary() {
    const art = PixelArts[Math.floor(Math.random() * PixelArts.length)];
    return { type: 'art', id: art.id, name: art.name, data: art.data, colors: art.colors };
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

// Recalcule les compteurs à partir de la collection (source de vérité) :
// - uniquePixels = nombre d'entrées distinctes
// - totalPixels  = somme des exemplaires (doublons inclus)
// Évite toute dérive des compteurs, quel que soit le chemin (craft, échange,
// recyclage, coffre…).
function updateUniquePixelsCount() {
    userStats.uniquePixels = Object.keys(userCollection).length;
    userStats.totalPixels = Object.values(userCollection)
        .reduce((sum, p) => sum + (p.count || 1), 0);
}

// === AFFICHAGE DU RÉSULTAT ===

function showResult(pixels, title = 'Vous avez obtenu :', subtitle = '') {
    const chestView = document.getElementById('chestView');
    const resultView = document.getElementById('resultView');

    chestView.style.display = 'none';
    resultView.classList.add('active');

    // Bandeau spécial si un légendaire a été obtenu
    const banner = document.getElementById('legendaryBanner');
    if (banner) banner.classList.toggle('show', pixels.some(p => p.type === 'art'));

    // Générer dynamiquement les pixels obtenus
    const container = document.getElementById('resultPixels');
    container.innerHTML = '';

    pixels.forEach((pixel, index) => {
        const rarity = PixelRenderer.getRarity(pixel.type);

        const wrapper = document.createElement('div');
        wrapper.className = 'result-pixel rarity-' + rarity;
        wrapper.style.animationDelay = `${index * 0.15}s`;

        const canvas = document.createElement('canvas');
        canvas.className = 'pixel-canvas';
        PixelRenderer.drawPixel(canvas, pixel, 80);
        wrapper.appendChild(canvas);

        const rarityLabel = document.createElement('div');
        rarityLabel.className = 'rarity-label rarity-label-' + rarity;
        rarityLabel.textContent = PixelRenderer.getRarityLabel(rarity);
        wrapper.appendChild(rarityLabel);

        if (pixel.isNew) {
            const badge = document.createElement('div');
            badge.className = 'new-badge';
            badge.textContent = 'NOUVEAU !';
            wrapper.appendChild(badge);
        }

        container.appendChild(wrapper);
    });

    document.getElementById('resultLabel').textContent = title;
    document.getElementById('resultSubtitle').innerHTML = subtitle;
}

function closeResult() {
    const chestView = document.getElementById('chestView');
    const resultView = document.getElementById('resultView');

    resultView.classList.remove('active');
    chestView.style.display = 'flex';
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

    // Barre de progression de l'album affiché
    const ownedCount = allPossiblePixels.filter(p => p.owned).length;
    const totalCount = allPossiblePixels.length;
    document.getElementById('collectionProgressText').textContent = `${ownedCount} / ${totalCount}`;
    document.getElementById('collectionProgressFill').style.width =
        totalCount > 0 ? `${(ownedCount / totalCount) * 100}%` : '0%';

    // Filtre possédés / manquants
    let renderList = allPossiblePixels;
    if (collectionOwnership === 'owned') renderList = allPossiblePixels.filter(p => p.owned);
    else if (collectionOwnership === 'missing') renderList = allPossiblePixels.filter(p => !p.owned);

    // Trier par type puis par nom
    renderList.sort((a, b) => {
        const rarityOrder = { 'art': 0, '2x2': 1, '1x1': 2 };
        if (rarityOrder[a.type] !== rarityOrder[b.type]) return rarityOrder[a.type] - rarityOrder[b.type];
        return a.name.localeCompare(b.name);
    });

    renderList.forEach(pixel => {
        const item = document.createElement('div');
        item.className = 'pixel-item';
        item.style.cursor = 'pointer';

        // Si le pixel n'est pas possédé, griser
        if (!pixel.owned) {
            item.style.opacity = '0.32';
            item.style.filter = 'grayscale(100%)';
        }

        const canvas = document.createElement('canvas');
        canvas.className = 'pixel-canvas';
        PixelRenderer.drawPixel(canvas, pixel, 52);

        const name = document.createElement('div');
        name.className = 'pixel-name';
        name.textContent = pixel.owned ? shortPixelName(pixel) : '???';

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

    if (renderList.length === 0) {
        const empty = collectionOwnership === 'missing'
            ? '🎉 Rien ne manque dans cet album !'
            : collectionOwnership === 'owned'
                ? 'Aucun pixel possédé dans cet album pour l\'instant.'
                : 'Aucun pixel dans cet album.';
        grid.innerHTML = `<p class="collection-empty">${empty}</p>`;
    }
}

// Nom compact pour la grille de collection (évite les libellés à rallonge)
function shortPixelName(pixel) {
    if (pixel.type === '1x1') return { '1': 'Rouge', '2': 'Bleu', '3': 'Vert', '4': 'Jaune' }[pixel.pattern] || pixel.name;
    if (pixel.type === '2x2') return `#${pixel.pattern}`;
    return pixel.name;
}

// Filtre Tous / Possédés / Manquants
function switchOwnerFilter(mode) {
    collectionOwnership = mode;
    document.querySelectorAll('.owner-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.owner === mode);
    });
    displayCollection();
    const search = document.getElementById('searchCollection');
    if (search && search.value) filterCollection(search.value);
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

    const tabId = tabName + 'Tab';
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
    } else if (tabName === 'atelier') {
        updateAtelierUI();
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

        // Classement : le plus de légendaires en tête, puis pixels uniques,
        // puis total (départage). Calculé depuis la collection réelle.
        allPlayers.sort((a, b) => {
            const sa = statsFromCollection(a.collection);
            const sb = statsFromCollection(b.collection);
            return (sb.legendary - sa.legendary)
                || (sb.unique - sa.unique)
                || (sb.total - sa.total);
        });

        displayPlayers(allPlayers);
    } catch (error) {
        console.error('Erreur de chargement des joueurs:', error);
        document.getElementById('playersList').innerHTML = '<p style="text-align: center; padding: 20px; opacity: 0.7;">Erreur de chargement des joueurs</p>';
    }
}

// Stats d'affichage calculées depuis la collection (source de vérité), pour
// ne pas dépendre des compteurs stockés qui pourraient être désynchronisés
// (utile pour les autres joueurs dont on n'a que le document Firestore).
function statsFromCollection(coll) {
    const entries = Object.values(coll || {});
    return {
        unique: entries.length,
        total: entries.reduce((sum, p) => sum + (p.count || 1), 0),
        // Légendaires = pixel arts 8×8 distincts possédés
        legendary: entries.filter(p => p.type === 'art').length
    };
}

function displayPlayers(players) {
    const container = document.getElementById('playersList');
    container.innerHTML = '';

    if (players.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px; opacity: 0.7;">Aucun joueur trouvé</p>';
        return;
    }

    players.forEach((player, index) => {
        const isCurrentUser = player.uid === currentUser.uid;

        const playerCard = document.createElement('div');
        playerCard.className = 'player-card' + (isCurrentUser ? ' is-me' : '');
        playerCard.onclick = () => openPlayerProfile(player);

        const s = statsFromCollection(player.collection);
        playerCard.innerHTML = `
            <div>
                <div class="player-card__name">${index + 1}. ${player.displayName} ${isCurrentUser ? '(Vous)' : ''}</div>
                <div class="player-card__stats">
                    <span>💎 ${s.legendary} légendaires</span>
                    <span>🎨 ${s.unique} / 294 uniques</span>
                </div>
            </div>
            <div class="player-card__arrow">→</div>
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

    // Mettre à jour les informations — nombres calculés depuis la collection
    // pour être justes même si les compteurs stockés sont désynchronisés
    const s = statsFromCollection(player.collection);
    document.getElementById('modalPlayerName').textContent = player.displayName;
    document.getElementById('modalTotalPixels').textContent = s.total;
    document.getElementById('modalUniquePixels').textContent = `${s.unique} / 294`;

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
    document.getElementById('profileName').textContent = displayName;
    document.getElementById('userNameInput').value = displayName;
    document.getElementById('totalPixels').textContent = userStats.totalPixels;
    document.getElementById('uniquePixels').textContent = `${userStats.uniquePixels} / 294`;
    document.getElementById('chestsOpened').textContent = userStats.chestsOpened;
    document.getElementById('shardCount').textContent = userStats.shards || 0;
    document.getElementById('streakCount').textContent = userStats.streak || 0;

    // État du coffre
    updateChestStatus();

    // État de la mine à éclats
    updateMineUI();
}

function updateChestStatus() {
    if (!currentUser) return;

    if (canOpenChest()) {
        document.getElementById('chestTimer').textContent = 'Clique sur le coffre pour l\'ouvrir !';
    } else {
        // On n'affiche que le délai restant (pas d'heure absolue : le prochain
        // coffre tombe au même instant pour tout le monde, quel que soit le fuseau).
        const ms = msUntilNextReset();
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        document.getElementById('chestTimer').textContent =
            `Prochain coffre dans ${h}h${String(m).padStart(2, '0')}`;
    }

    // Volontairement minimal : pas de paliers ni de compteur de pity affichés.
    // Le joueur découvre les bonus (série, légendaire garanti) en jouant.
    document.getElementById('chestExtraInfo').innerHTML = '';
}

// === MINE À ÉCLATS ===

// Calcule l'état courant de la mine : éclats prêts, plafond atteint, délai restant.
function getMineState() {
    const now = Date.now();
    // Première visite : on démarre le compteur maintenant (réserve vide)
    if (!userStats.mineLastCollect) userStats.mineLastCollect = now;
    const last = userStats.mineLastCollect;
    // Production alignée sur une horloge universelle : un éclat par palier
    // global de MINE_RATE_MS (compté sur l'epoch, pas sur le fuseau du joueur).
    // Résultat : le compte à rebours est identique pour tout le monde et
    // l'éclat « tombe » au même instant pour tous — impossible d'accélérer
    // en changeant l'heure locale du navigateur.
    const produced = Math.floor(now / MINE_RATE_MS) - Math.floor(last / MINE_RATE_MS);
    const ready = Math.max(0, Math.min(produced, MINE_CAP));
    const isFull = ready >= MINE_CAP;
    const msToNext = MINE_RATE_MS - (now % MINE_RATE_MS);
    return { ready, isFull, msToNext };
}

async function collectMine() {
    const now = Date.now();
    const state = getMineState();
    if (state.ready <= 0) {
        showToast('La mine n\'a encore rien produit. Reviens dans quelques minutes !');
        return;
    }

    // On repart du dernier palier global franchi : le reliquat (temps déjà
    // écoulé vers le prochain palier) est conservé et reste synchronisé avec
    // tous les autres joueurs. Le surplus au-delà du plafond n'est pas gardé.
    userStats.mineLastCollect = Math.floor(now / MINE_RATE_MS) * MINE_RATE_MS;
    userStats.shards = (userStats.shards || 0) + state.ready;

    await saveUserData();
    updateMineUI();
    updateUI();
    if (typeof updateAtelierUI === 'function') updateAtelierUI();
    showToast(`⛏️ Mine récoltée : +${state.ready} éclats ✨`);
}

function updateMineUI() {
    if (!currentUser) return;
    const readyEl = document.getElementById('mineReady');
    const fillEl = document.getElementById('mineBarFill');
    const statusEl = document.getElementById('mineStatus');
    const button = document.getElementById('collectMineButton');
    if (!readyEl || !fillEl || !statusEl || !button) return;

    const { ready, isFull, msToNext } = getMineState();
    readyEl.textContent = ready;
    fillEl.style.width = `${Math.round((ready / MINE_CAP) * 100)}%`;
    button.disabled = ready <= 0;

    if (isFull) {
        statusEl.textContent = '⚠️ Réserve pleine — récolte !';
    } else {
        const m = Math.floor(msToNext / 60000);
        const s = Math.floor((msToNext % 60000) / 1000);
        statusEl.textContent = `Prochain éclat dans ${m}m${String(s).padStart(2, '0')}s`;
    }
}

// === ATELIER : ACHAT ET CRAFT ===

function spendShards(cost) {
    if ((userStats.shards || 0) < cost) {
        showToast(`Pas assez d'éclats ! Il en faut ${cost} ✨ (tu en as ${userStats.shards || 0}).`);
        return false;
    }
    userStats.shards -= cost;
    return true;
}

// Ajoute un pixel crafté à la collection. Reste dans l'Atelier (pas de retour
// au coffre) : on peut ainsi crafter à la chaîne sans re-cliquer. Un aperçu du
// dernier pixel obtenu s'affiche sur place + un toast.
async function finalizeCraft(pixel, title) {
    const isNew = !userCollection[pixel.id];
    addPixelToCollection(pixel);
    userStats.totalPixels++;

    updateUniquePixelsCount();
    await saveUserData();

    showToast(`${title} ${isNew ? '✨ nouveau !' : '(doublon)'}`, isNew ? 'success' : 'info');
    showCraftPreview(pixel, isNew);
    updateUI();
    updateAtelierUI();
}

// Aperçu « dernier obtenu » dans l'Atelier
function showCraftPreview(pixel, isNew) {
    const box = document.getElementById('craftPreview');
    if (!box) return;
    const canvas = document.getElementById('craftPreviewCanvas');
    PixelRenderer.drawPixel(canvas, pixel, 44);
    document.getElementById('craftPreviewName').textContent = pixel.name;
    const tag = document.getElementById('craftPreviewTag');
    tag.textContent = isNew ? '✨ Nouveau' : 'Doublon';
    tag.className = 'craft-preview__tag ' + (isNew ? 'is-new' : 'is-dup');
    box.hidden = false;
    box.classList.remove('pop');
    void box.offsetWidth; // relance l'animation
    box.classList.add('pop');
}

// Correspondance chiffre de pattern → couleur (aligné sur PixelRenderer.colors)
const PIXEL_1X1_COLORS = [
    { pattern: '1', name: 'Rouge', hex: '#FF0000' },
    { pattern: '2', name: 'Bleu', hex: '#0000FF' },
    { pattern: '3', name: 'Vert', hex: '#00FF00' },
    { pattern: '4', name: 'Jaune', hex: '#FFFF00' }
];

// Achète un pixel 1×1 de la COULEUR CHOISIE pour 1 éclat (plus aléatoire).
async function craft1x1(pattern) {
    const choice = PIXEL_1X1_COLORS.find(c => c.pattern === String(pattern));
    if (!choice) return;
    if (!spendShards(CRAFT_COSTS.craft1x1)) return;

    const pixel = {
        type: '1x1',
        pattern: choice.pattern,
        id: `1x1_${choice.pattern}`,
        name: `Pixel 1x1 #${choice.pattern}`
    };

    await finalizeCraft(pixel, `🔨 Pixel 1×1 ${choice.name} acheté !`);
}

// === ASSEMBLAGE SUR MESURE ===
// Choisir exactement son 2x2 et le payer avec ses pixels 1x1 des bonnes couleurs

let customPattern = [1, 1, 1, 1]; // 4 cases, couleurs 1 à 4
const COLOR_NAMES = { 1: 'Rouge', 2: 'Bleu', 3: 'Vert', 4: 'Jaune' };

function initCustomCraft() {
    document.querySelectorAll('.custom-cell').forEach((cell, i) => {
        cell.addEventListener('click', () => {
            customPattern[i] = (customPattern[i] % 4) + 1; // cycle 1→2→3→4→1
            updateCustomCraftUI();
        });
    });
    document.getElementById('customCraftButton').addEventListener('click', craftCustom2x2);
}

function getCustomCraftNeeds() {
    const needs = {};
    customPattern.forEach(d => { needs[d] = (needs[d] || 0) + 1; });
    return needs;
}

function updateCustomCraftUI() {
    // Colorer les 4 cases selon le pattern choisi
    document.querySelectorAll('.custom-cell').forEach((cell, i) => {
        cell.style.background = PixelRenderer.colors[customPattern[i] - 1];
    });

    const pattern = customPattern.join('');
    document.getElementById('customCraftTarget').textContent = `Pixel 2x2 #${pattern}`;
    const owned = userCollection[`2x2_${pattern}`];
    document.getElementById('customCraftOwned').textContent = owned
        ? `Déjà possédé ×${owned.count}`
        : '⭐ Pas encore dans ta collection !';

    // Vérifier les pixels 1x1 nécessaires
    const needs = getCustomCraftNeeds();
    let ok = true;
    const parts = [];
    for (const [digit, needed] of Object.entries(needs)) {
        const have = userCollection[`1x1_${digit}`]?.count || 0;
        if (have < needed) ok = false;
        parts.push(`${needed}× ${COLOR_NAMES[digit]} ${have >= needed ? '✅' : `❌ (tu en as ${have})`}`);
    }
    document.getElementById('customCraftNeeds').innerHTML = 'Coût en pixels 1×1 : ' + parts.join(' &nbsp;·&nbsp; ');
    document.getElementById('customCraftButton').disabled = !ok;
}

async function craftCustom2x2() {
    const pattern = customPattern.join('');
    const needs = getCustomCraftNeeds();

    // Revérifier le stock au moment du clic
    for (const [digit, needed] of Object.entries(needs)) {
        if ((userCollection[`1x1_${digit}`]?.count || 0) < needed) {
            showToast('Il te manque des pixels 1×1 pour cet assemblage !');
            return;
        }
    }

    // Avertir si on consomme un dernier exemplaire
    const lastOnes = Object.entries(needs)
        .filter(([digit, needed]) => userCollection[`1x1_${digit}`].count - needed < 1)
        .map(([digit]) => COLOR_NAMES[digit]);

    const pct = Math.round(CUSTOM_CRAFT_RATE * 100);
    let msg = `Assembler le Pixel 2x2 #${pattern} en consommant ${customPattern.length} pixels 1×1 ?\n\n`
        + `⚙️ ${pct} % de réussite — en cas d'échec, les pixels 1×1 sont perdus.`;
    if (lastOnes.length > 0) {
        msg += `\n\n⚠️ Tu vas consommer ton DERNIER exemplaire de : ${lastOnes.join(', ')}`;
    }
    if (!await uiConfirm(msg, { icon: '🔨', confirmLabel: '🔨 Assembler' })) return;

    // Consommer les pixels 1x1 (dans tous les cas, réussite ou non)
    for (const [digit, needed] of Object.entries(needs)) {
        for (let i = 0; i < needed; i++) {
            removeOnePixelFromCollection(`1x1_${digit}`);
        }
    }

    // Tenter l'assemblage
    if (Math.random() >= CUSTOM_CRAFT_RATE) {
        updateUniquePixelsCount();
        await saveUserData();
        showToast('💥 Assemblage raté… tes pixels 1×1 sont perdus. Retente ta chance !', 'error');
        updateUI();
        updateAtelierUI();
        return;
    }

    const pixel = {
        type: '2x2',
        pattern: pattern,
        id: `2x2_${pattern}`,
        name: `Pixel 2x2 #${pattern}`
    };

    await finalizeCraft(pixel, '🎯 Assemblage réussi !');
}

// === CRAFT DE 2×2 EN ÉCLATS (dépense rapide) ===

// Liste des motifs 2×2 que le joueur ne possède PAS encore
function missing2x2Patterns() {
    return PixelRenderer.generateAll2x2().filter(p => !userCollection[`2x2_${p}`]);
}

// Un 2×2 totalement aléatoire (peut être un doublon), pas cher
async function craftRandom2x2() {
    if (!spendShards(CRAFT_COSTS.craft2x2Random)) return;
    await finalizeCraft(makeRandom2x2(), '🎲 Pixel 2×2 aléatoire obtenu !');
}

// Un 2×2 GARANTI nouveau (parmi ceux qui te manquent), plus cher
async function craftNew2x2() {
    const missing = missing2x2Patterns();
    if (missing.length === 0) {
        showToast('🎉 Tu possèdes déjà les 256 pixels 2×2 !');
        return;
    }
    if (!spendShards(CRAFT_COSTS.craft2x2New)) return;
    const pattern = missing[Math.floor(Math.random() * missing.length)];
    const pixel = { type: '2x2', pattern, id: `2x2_${pattern}`, name: `Pixel 2x2 #${pattern}` };
    await finalizeCraft(pixel, '⭐ Nouveau pixel 2×2 obtenu !');
}

function updateAtelierUI() {
    document.getElementById('shardBalance').textContent = userStats.shards || 0;

    // Activer/désactiver les boutons de craft selon le solde
    const shards = userStats.shards || 0;
    document.querySelectorAll('.color-craft-btn').forEach(btn => {
        btn.disabled = shards < CRAFT_COSTS.craft1x1;
    });

    // Compteur de 1×1 déjà en stock, sous chaque couleur (évite d'aller
    // vérifier dans la Collection)
    document.querySelectorAll('[data-color-count]').forEach(el => {
        const owned = userCollection[`1x1_${el.dataset.colorCount}`]?.count || 0;
        el.textContent = `×${owned}`;
    });

    // Craft de 2×2 en éclats (aléatoire / garanti nouveau)
    const rndBtn = document.getElementById('craftRandom2x2Btn');
    if (rndBtn) rndBtn.disabled = shards < CRAFT_COSTS.craft2x2Random;
    const newBtn = document.getElementById('craftNew2x2Btn');
    if (newBtn) {
        const missingCount = missing2x2Patterns().length;
        newBtn.disabled = shards < CRAFT_COSTS.craft2x2New || missingCount === 0;
        const info = document.getElementById('craft2x2NewInfo');
        if (info) {
            info.textContent = missingCount === 0
                ? '🎉 Tu as déjà les 256 pixels 2×2 !'
                : `Encore ${missingCount} pixel${missingCount > 1 ? 's' : ''} 2×2 à découvrir`;
        }
    }

    // Assemblage sur mesure (payé en pixels 1x1)
    updateCustomCraftUI();

    // Forge légendaire (grille des schémas)
    renderForgeGrid();
}

// === FORGE LÉGENDAIRE ===
// Nouvelle mécanique : reproduire le « schéma » grisé d'un légendaire avec des
// pixels 2×2 aux bonnes couleurs, puis tenter la forge. Chaque légendaire a un
// plan (blueprint) : sa version quantifiée sur les 4 couleurs de base, découpée
// en 16 tuiles 2×2 (grille 4×4). Quand les 16 bonnes tuiles sont réunies, on
// peut forger — mais la réussite n'est pas garantie, et les 2×2 utilisés sont
// consommés à chaque tentative (réussie ou non). C'est ce qui rend un
// légendaire difficile à obtenir de façon ciblée.
const LEGENDARY_FORGE_RATE = 0.12; // 12 % de réussite par tentative

// Couleurs de base en RGB (indices 1..4 alignés sur PixelRenderer.colors)
const BASE_RGB = [
    [255, 0, 0],   // 1 Rouge
    [0, 0, 255],   // 2 Bleu
    [0, 255, 0],   // 3 Vert
    [255, 255, 0]  // 4 Jaune
];

function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16)
    ];
}

// Couleur de base (1..4) la plus proche d'un RGB donné
function nearestBaseIndex(rgb) {
    let best = 1, bestD = Infinity;
    for (let i = 0; i < 4; i++) {
        const dr = rgb[0] - BASE_RGB[i][0];
        const dg = rgb[1] - BASE_RGB[i][1];
        const db = rgb[2] - BASE_RGB[i][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = i + 1; }
    }
    return best;
}

// Version « grisée » d'une couleur de base (pour dessiner le schéma non rempli)
function greyOf(hex) {
    const [r, g, b] = hexToRgb(hex);
    const lum = 0.25 * r + 0.6 * g + 0.15 * b;      // luminance approximative
    const v = Math.round(38 + (lum / 255) * 70);    // gris sombre 38..108
    return `rgb(${v}, ${v}, ${v})`;
}

// Cache des plans par id de légendaire
const _blueprintCache = {};

// Construit le plan d'un légendaire : grille 8×8 quantifiée sur 4 couleurs +
// les 16 tuiles 2×2 requises (avec leurs quantités).
function getLegendaryBlueprint(art) {
    if (_blueprintCache[art.id]) return _blueprintCache[art.id];

    // 1) Quantifier chaque couleur de la palette (transparent → null pour l'instant)
    const paletteBase = art.colors.map(c =>
        c === 'transparent' ? null : nearestBaseIndex(hexToRgb(c))
    );

    // 2) Choisir une couleur de fond pour les cases transparentes : la couleur
    //    de base la MOINS utilisée par le sujet, pour bien détacher la forme
    //    (égalité → plus petit indice). Déterministe.
    const usage = [0, 0, 0, 0];
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const b = paletteBase[art.data[y][x]];
            if (b) usage[b - 1]++;
        }
    }
    let bgIndex = 1, bgUse = Infinity;
    for (let i = 0; i < 4; i++) {
        if (usage[i] < bgUse) { bgUse = usage[i]; bgIndex = i + 1; }
    }

    // 3) Grille 8×8 entièrement colorée (1..4)
    const quant = [];
    for (let y = 0; y < 8; y++) {
        const row = [];
        for (let x = 0; x < 8; x++) {
            row.push(paletteBase[art.data[y][x]] || bgIndex);
        }
        quant.push(row);
    }

    // 4) 16 tuiles 2×2 (grille 4×4 de blocs). pattern = HG HD BG BD
    const tiles = [];
    const needs = {};
    for (let by = 0; by < 4; by++) {
        for (let bx = 0; bx < 4; bx++) {
            const r = by * 2, c = bx * 2;
            const pattern = `${quant[r][c]}${quant[r][c + 1]}${quant[r + 1][c]}${quant[r + 1][c + 1]}`;
            tiles.push({ pattern, row: by, col: bx });
            needs[pattern] = (needs[pattern] || 0) + 1;
        }
    }

    const bp = { quant, tiles, needs };
    _blueprintCache[art.id] = bp;
    return bp;
}

// Progression : combien de tuiles requises le joueur possède déjà (doublons compris)
function forgeOwnedProgress(needs) {
    let owned = 0, total = 0;
    for (const [pattern, count] of Object.entries(needs)) {
        total += count;
        const have = userCollection[`2x2_${pattern}`]?.count || 0;
        owned += Math.min(have, count);
    }
    return { owned, total, ready: owned === total };
}

// Dessine le plan 8×8 sur un canvas. `mask` (4×4 de booléens) indique quels
// blocs 2×2 sont « placés » (couleur pleine) ; les autres restent grisés.
// mask null => tout grisé (schéma vierge).
function drawBlueprint(canvas, quant, size, mask) {
    const px = size / 8;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const baseHex = PixelRenderer.colors[quant[y][x] - 1];
            const placed = mask ? mask[y >> 1][x >> 1] : false;
            ctx.fillStyle = placed ? baseHex : greyOf(baseHex);
            ctx.fillRect(x * px, y * px, px, px);
        }
    }

    // Quadrillage 4×4 pour séparer visuellement les 16 tuiles
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(i * 2 * px, 0); ctx.lineTo(i * 2 * px, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * 2 * px); ctx.lineTo(size, i * 2 * px); ctx.stroke();
    }
}

// Calcule le masque des blocs déjà réalisables avec les tuiles en stock
function forgeMask(bp) {
    const remaining = {};
    for (const pattern of Object.keys(bp.needs)) {
        remaining[pattern] = userCollection[`2x2_${pattern}`]?.count || 0;
    }
    const mask = [[false, false, false, false], [false, false, false, false],
                  [false, false, false, false], [false, false, false, false]];
    bp.tiles.forEach(t => {
        if (remaining[t.pattern] > 0) { remaining[t.pattern]--; mask[t.row][t.col] = true; }
    });
    return mask;
}

// Grille des 30 légendaires dans l'Atelier
function renderForgeGrid() {
    const grid = document.getElementById('forgeGrid');
    if (!grid) return;
    grid.innerHTML = '';

    PixelArts.forEach(art => {
        const owned = !!userCollection[art.id];
        const bp = getLegendaryBlueprint(art);
        const prog = forgeOwnedProgress(bp.needs);

        const item = document.createElement('button');
        item.className = 'forge-item'
            + (owned ? ' forge-item--owned' : '')
            + (!owned && prog.ready ? ' forge-item--ready' : '');
        item.type = 'button';
        item.addEventListener('click', () => openForgeModal(art.id));

        const canvas = document.createElement('canvas');
        canvas.className = 'pixel-canvas';
        if (owned) {
            PixelRenderer.drawPixel(canvas, { type: 'art', data: art.data, colors: art.colors }, 64);
        } else {
            drawBlueprint(canvas, bp.quant, 64, forgeMask(bp));
        }
        item.appendChild(canvas);

        const label = document.createElement('div');
        label.className = 'forge-item__label';
        label.textContent = owned ? art.name : `${prog.owned}/16`;
        item.appendChild(label);

        if (owned || prog.ready) {
            const badge = document.createElement('div');
            badge.className = 'forge-item__badge' + (owned ? '' : ' forge-item__badge--ready');
            badge.textContent = owned ? '✓' : '🔥';
            item.appendChild(badge);
        }

        grid.appendChild(item);
    });
}

// --- Modal de forge ---
let currentForgeArtId = null;

function openForgeModal(artId) {
    currentForgeArtId = artId;
    const modal = document.getElementById('forgeModal');
    if (modal) modal.style.display = 'block';
    renderForgeModal();
}

function closeForgeModal() {
    const modal = document.getElementById('forgeModal');
    if (modal) modal.style.display = 'none';
    currentForgeArtId = null;
}

function renderForgeModal() {
    const art = PixelArts.find(a => a.id === currentForgeArtId);
    if (!art) return;
    const bp = getLegendaryBlueprint(art);
    const owned = !!userCollection[art.id];
    const prog = forgeOwnedProgress(bp.needs);

    document.getElementById('forgeTitle').textContent = `🏆 ${art.name}`;
    drawBlueprint(document.getElementById('forgeCanvas'), bp.quant, 256, forgeMask(bp));
    document.getElementById('forgeProgressText').textContent = `${prog.owned} / ${prog.total}`;

    const status = document.getElementById('forgeStatus');
    if (owned) {
        status.textContent = `✅ Déjà dans ta collection (×${userCollection[art.id].count}). Tu peux en forger un autre.`;
    } else if (prog.ready) {
        status.textContent = '🔥 Schéma complet ! Tente la forge.';
    } else {
        status.textContent = `Il te manque ${prog.total - prog.owned} tuile(s) 2×2. Assemble-les dans l'Atelier ci-dessus.`;
    }

    // Liste des tuiles 2×2 requises (triées par motif)
    const needsEl = document.getElementById('forgeNeeds');
    needsEl.innerHTML = '';
    Object.entries(bp.needs)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([pattern, count]) => {
            const have = userCollection[`2x2_${pattern}`]?.count || 0;
            const ok = have >= count;

            const row = document.createElement('div');
            row.className = 'forge-need' + (ok ? ' forge-need--ok' : '');

            const c = document.createElement('canvas');
            c.className = 'forge-need__tile';
            PixelRenderer.draw2x2(c, pattern, 13);
            row.appendChild(c);

            const txt = document.createElement('span');
            txt.innerHTML = `×${count} &nbsp;<small>tu en as ${have}</small> ${ok ? '✅' : '❌'}`;
            row.appendChild(txt);

            needsEl.appendChild(row);
        });

    const btn = document.getElementById('forgeButton');
    btn.disabled = !prog.ready;
    btn.textContent = prog.ready
        ? `🔥 Forger (${Math.round(LEGENDARY_FORGE_RATE * 100)} % de réussite)`
        : '🔒 Schéma incomplet';
}

async function attemptForge() {
    const art = PixelArts.find(a => a.id === currentForgeArtId);
    if (!art) return;
    const bp = getLegendaryBlueprint(art);

    if (!forgeOwnedProgress(bp.needs).ready) {
        showToast('Schéma incomplet : il te manque des tuiles 2×2.');
        return;
    }

    const pct = Math.round(LEGENDARY_FORGE_RATE * 100);
    const msg = `Forger « ${art.name} » ?\n\n`
        + `• 16 pixels 2×2 seront consommés (que la forge réussisse ou non)\n`
        + `• Chance de réussite : ${pct} %\n\n`
        + 'Tente ta chance ?';
    if (!await uiConfirm(msg, { icon: '🏆', title: 'Forge légendaire', confirmLabel: '🔥 Forger' })) return;

    // Revérifier le stock au moment du clic (anti double-clic / échange entre-temps)
    if (!forgeOwnedProgress(bp.needs).ready) {
        showToast('Schéma incomplet : il te manque des tuiles 2×2.');
        renderForgeModal();
        return;
    }

    // Consommer les 16 tuiles requises
    for (const [pattern, count] of Object.entries(bp.needs)) {
        for (let i = 0; i < count; i++) removeOnePixelFromCollection(`2x2_${pattern}`);
    }

    const success = Math.random() < LEGENDARY_FORGE_RATE;

    if (success) {
        const isNew = !userCollection[art.id];
        const pixel = { type: 'art', id: art.id, name: art.name, data: art.data, colors: art.colors };
        addPixelToCollection(pixel);
        pixel.isNew = isNew;
        updateUniquePixelsCount();
        await saveUserData();

        closeForgeModal();
        switchTab('chest');
        showResult(
            [pixel],
            '🏆 FORGE RÉUSSIE !',
            isNew ? '✨ Un légendaire flambant neuf rejoint ta collection !' : 'Un légendaire de plus (doublon).'
        );
        updateUI();
    } else {
        updateUniquePixelsCount();
        await saveUserData();
        showToast('💔 La forge a échoué… tes 2×2 se sont dissipés. Retente ta chance !', 'error');
        renderForgeModal();
        renderForgeGrid();
        updateUI();
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
                option.textContent = `${data.displayName || 'Joueur'} (${statsFromCollection(data.collection).unique} pixels)`;
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
        document.getElementById('myPixelsForTrade').innerHTML = '<p class="pool-empty">Sélectionne un joueur d\'abord</p>';
        document.getElementById('theirPixelsForTrade').innerHTML = '<p class="pool-empty">Sélectionne un joueur d\'abord</p>';
        document.getElementById('sendTradeOffer').disabled = true;
        return;
    }

    selectedTradePlayer = JSON.parse(selectedOption.dataset.player);

    // Réinitialiser les champs d'éclats et afficher mon solde disponible
    resetShardFields();

    // Afficher mes pixels
    displayMyPixelsForTrade();
    // Afficher les pixels du joueur
    displayTheirPixelsForTrade();
    checkTradeReady();
}

// Remet les champs d'éclats à zéro et rappelle le solde disponible
function resetShardFields() {
    const offer = document.getElementById('offerShards');
    const request = document.getElementById('requestShards');
    const avail = document.getElementById('offerShardsAvail');
    if (offer) offer.value = 0;
    if (request) request.value = 0;
    if (avail) avail.textContent = `tu as ${userStats.shards || 0} ✨`;
}

function displayMyPixelsForTrade() {
    const container = document.getElementById('myPixelsForTrade');
    container.innerHTML = '';

    const myPixels = Object.values(userCollection);

    if (myPixels.length === 0) {
        container.innerHTML = '<p class="pool-empty">Tu n\'as aucun pixel</p>';
        return;
    }

    // Doublons en premier (les plus nombreux d'abord) : ce sont eux
    // qu'on veut échanger en priorité sans appauvrir sa collection
    myPixels.sort((a, b) => (b.count || 1) - (a.count || 1));

    myPixels.forEach(pixel => {
        const isDup = (pixel.count || 1) > 1;

        const item = document.createElement('div');
        item.className = 'trade-pixel' + (isDup ? ' is-dup' : '');
        item.onclick = () => selectMyPixel(pixel, item);

        const canvas = document.createElement('canvas');
        canvas.width = 80;
        canvas.height = 80;
        PixelRenderer.drawPixel(canvas, pixel, 80);

        const name = document.createElement('div');
        name.style.cssText = 'font-size: 0.7em; text-align: center; margin-top: 3px;';
        name.textContent = pixel.name;

        const badge = document.createElement('div');
        badge.className = 'trade-badge ' + (isDup ? 'dup' : 'unique');
        badge.textContent = isDup ? `Doublon ×${pixel.count}` : 'Seul exemplaire';

        item.appendChild(canvas);
        item.appendChild(name);
        item.appendChild(badge);
        container.appendChild(item);
    });
}

function displayTheirPixelsForTrade() {
    const container = document.getElementById('theirPixelsForTrade');
    container.innerHTML = '';

    if (!selectedTradePlayer || !selectedTradePlayer.collection) {
        container.innerHTML = '<p class="pool-empty">Ce joueur n\'a aucun pixel</p>';
        return;
    }

    // Désérialiser la collection
    const theirPixels = [];
    for (const pixel of Object.values(selectedTradePlayer.collection)) {
        theirPixels.push({
            ...pixel,
            data: pixel.data && typeof pixel.data === 'string' ? JSON.parse(pixel.data) : pixel.data,
            colors: pixel.colors && typeof pixel.colors === 'string' ? JSON.parse(pixel.colors) : pixel.colors
        });
    }

    if (theirPixels.length === 0) {
        container.innerHTML = '<p class="pool-empty">Ce joueur n\'a aucun pixel</p>';
        return;
    }

    // Les pixels qui manquent à MA collection en premier : ce sont
    // eux qu'on veut demander en priorité
    theirPixels.sort((a, b) => {
        const ownedA = userCollection[a.id] ? 1 : 0;
        const ownedB = userCollection[b.id] ? 1 : 0;
        return ownedA - ownedB;
    });

    theirPixels.forEach(pixel => {
        const isMissing = !userCollection[pixel.id];

        const item = document.createElement('div');
        item.className = 'trade-pixel' + (isMissing ? ' is-missing' : '');
        item.onclick = () => selectTheirPixel(pixel, item);

        const canvas = document.createElement('canvas');
        canvas.width = 80;
        canvas.height = 80;
        PixelRenderer.drawPixel(canvas, pixel, 80);

        const name = document.createElement('div');
        name.style.cssText = 'font-size: 0.7em; text-align: center; margin-top: 3px;';
        name.textContent = pixel.name;

        const badge = document.createElement('div');
        badge.className = 'trade-badge ' + (isMissing ? 'missing' : 'unique');
        badge.textContent = isMissing ? '⭐ Manquant' : `Possédé ×${userCollection[pixel.id].count}`;

        item.appendChild(canvas);
        item.appendChild(name);
        item.appendChild(badge);
        container.appendChild(item);
    });
}

function selectMyPixel(pixel, element) {
    selectedMyPixel = pixel;
    // Highlight visuel
    document.querySelectorAll('#myPixelsForTrade .trade-pixel').forEach(div => {
        div.classList.remove('selected');
    });
    element.classList.add('selected');

    checkTradeReady();
}

function selectTheirPixel(pixel, element) {
    selectedTheirPixel = pixel;
    // Highlight visuel
    document.querySelectorAll('#theirPixelsForTrade .trade-pixel').forEach(div => {
        div.classList.remove('selected');
    });
    element.classList.add('selected');

    checkTradeReady();
}

function checkTradeReady() {
    const btn = document.getElementById('sendTradeOffer');
    const offerShards = readShardField('offerShards');
    const requestShards = readShardField('requestShards');
    const iOfferSomething = !!selectedMyPixel || offerShards > 0;
    const iRequestSomething = !!selectedTheirPixel || requestShards > 0;
    const enoughShards = offerShards <= (userStats.shards || 0);
    btn.disabled = !(selectedTradePlayer && iOfferSomething && iRequestSomething && enoughShards);
}

// Retire UN SEUL exemplaire d'un pixel : décrémente le compteur s'il y a
// des doublons, ne supprime l'entrée que s'il ne reste qu'un exemplaire.
// (Avant, un échange supprimait TOUS les exemplaires du pixel proposé.)
function removeOnePixelFromCollection(pixelId) {
    const owned = userCollection[pixelId];
    if (!owned) return;

    if ((owned.count || 1) > 1) {
        owned.count--;
    } else {
        delete userCollection[pixelId];
    }
    updateUniquePixelsCount();
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

    // Ajouter pattern (pour les pixels 2x2 et 1x1)
    if (pixel.pattern !== undefined) {
        cleaned.pattern = pixel.pattern;
    }

    // Ajouter data (pour les pixel arts 8x8)
    if (pixel.data !== undefined && pixel.data !== null) {
        cleaned.data = typeof pixel.data === 'string' ? pixel.data : JSON.stringify(removeUndefined(pixel.data));
    }

    // Ajouter colors (pour les pixel arts 8x8)
    if (pixel.colors !== undefined && pixel.colors !== null) {
        cleaned.colors = typeof pixel.colors === 'string' ? pixel.colors : JSON.stringify(removeUndefined(pixel.colors));
    }

    return cleaned;
}

async function handleSendTrade() {
    const offerShards = readShardField('offerShards');
    const requestShards = readShardField('requestShards');
    const iOfferSomething = !!selectedMyPixel || offerShards > 0;
    const iRequestSomething = !!selectedTheirPixel || requestShards > 0;

    if (!selectedTradePlayer || !iOfferSomething || !iRequestSomething) {
        showToast('Propose au moins une chose de chaque côté (pixel ou éclats)');
        return;
    }
    if (offerShards > (userStats.shards || 0)) {
        showToast(`Tu n'as que ${userStats.shards || 0} éclats.`);
        return;
    }

    // Récapitulatif lisible de ce qui est offert / demandé
    const offerParts = [];
    if (selectedMyPixel) offerParts.push(selectedMyPixel.name);
    if (offerShards > 0) offerParts.push(`${offerShards} ✨`);
    const requestParts = [];
    if (selectedTheirPixel) requestParts.push(selectedTheirPixel.name);
    if (requestShards > 0) requestParts.push(`${requestShards} ✨`);

    let stockWarning = '';
    if (selectedMyPixel) {
        const ownedCount = userCollection[selectedMyPixel.id]?.count || 1;
        stockWarning = ownedCount > 1
            ? `\n\n✅ Tu possèdes ${ownedCount} ${selectedMyPixel.name} : tu échanges un doublon.`
            : `\n\n⚠️ ATTENTION : c'est ton SEUL exemplaire de ce pixel !`;
    }

    if (!await uiConfirm(`Proposer à ${selectedTradePlayer.displayName} :\n\n📤 Tu donnes : ${offerParts.join(' + ')}\n📥 Tu reçois : ${requestParts.join(' + ')}${stockWarning}\n\nCe que tu offres est mis de côté jusqu'à ce que l'échange soit accepté ou annulé.`)) {
        return;
    }

    try {
        // 1. Mettre de côté ce que J'OFFRE (escrow) : pixel et/ou éclats
        if (selectedMyPixel) removeOnePixelFromCollection(selectedMyPixel.id);
        if (offerShards > 0) userStats.shards = (userStats.shards || 0) - offerShards;
        await saveUserData();

        // 2. Créer la proposition (les champs pixel sont optionnels)
        const tradeDoc = {
            fromUserId: currentUser.uid,
            fromUserName: currentUser.displayName || 'Joueur',
            toUserId: selectedTradePlayer.uid,
            toUserName: selectedTradePlayer.displayName,
            fromShards: offerShards,
            toShards: requestShards,
            status: 'pending',
            fromClaimed: false, // Moi (émetteur) n'ai pas encore récupéré ma part
            toClaimed: false,   // Destinataire n'a pas encore récupéré sa part
            createdAt: serverTimestamp()
        };
        if (selectedMyPixel) {
            tradeDoc.fromPixelId = selectedMyPixel.id;
            tradeDoc.fromPixelName = selectedMyPixel.name;
            tradeDoc.fromPixelData = cleanPixelForFirestore(selectedMyPixel);
        }
        if (selectedTheirPixel) {
            tradeDoc.toPixelId = selectedTheirPixel.id;
            tradeDoc.toPixelName = selectedTheirPixel.name;
            tradeDoc.toPixelData = cleanPixelForFirestore(selectedTheirPixel);
        }
        await addDoc(collection(db, 'trades'), tradeDoc);

        showToast('Proposition envoyée ! Ce que tu offres a été mis de côté.');

        // Reset et recharger
        selectedMyPixel = null;
        selectedTheirPixel = null;
        document.getElementById('selectPlayer').value = '';
        await loadUserData();
        displayCollection();
        handlePlayerSelect({ target: document.getElementById('selectPlayer') });
    } catch (error) {
        console.error('Erreur d\'envoi de la proposition:', error);
        showToast('Erreur: ' + error.message);
    }
}

function switchTradeTab(tabName) {
    // Changer les onglets actifs
    document.querySelectorAll('.trade-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tradeTab === tabName);
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
    container.innerHTML = '<p class="trade-empty">Chargement…</p>';

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
            const receivedTitle = document.createElement('div');
            receivedTitle.className = 'trade-list-heading';
            receivedTitle.textContent = '📥 Propositions reçues';
            container.appendChild(receivedTitle);

            receivedSnap.forEach(docSnap => {
                const trade = { id: docSnap.id, ...docSnap.data() };
                container.appendChild(createTradeCard(trade, 'received'));
            });
        }

        // Afficher les échanges envoyés
        if (!sentSnap.empty) {
            const sentTitle = document.createElement('div');
            sentTitle.className = 'trade-list-heading';
            sentTitle.textContent = '📤 Propositions envoyées';
            container.appendChild(sentTitle);

            sentSnap.forEach(docSnap => {
                const trade = { id: docSnap.id, ...docSnap.data() };
                container.appendChild(createTradeCard(trade, 'sent'));
            });
        }

        if (receivedSnap.empty && sentSnap.empty) {
            container.innerHTML = '<p class="trade-empty">Aucun échange en attente pour l\'instant</p>';
        }

        // Mettre à jour le compteur (total des échanges reçus + envoyés)
        const totalPending = receivedSnap.size + sentSnap.size;
        document.getElementById('pendingTradesCount').textContent = totalPending;
    } catch (error) {
        console.error('Erreur de chargement des échanges:', error);
        container.innerHTML = '<p class="trade-empty">Erreur de chargement</p>';
    }
}

async function loadTradeHistory() {
    const container = document.getElementById('historyTradesList');
    container.innerHTML = '<p class="trade-empty">Chargement…</p>';

    try {
        // Récupérer les échanges où je suis l'émetteur (fromUserId)
        const qFrom = query(
            collection(db, 'trades'),
            where('fromUserId', '==', currentUser.uid),
            where('status', 'in', ['accepted', 'refused', 'cancelled']),
            orderBy('createdAt', 'desc'),
            limit(25)
        );

        // Récupérer les échanges où je suis le destinataire (toUserId)
        const qTo = query(
            collection(db, 'trades'),
            where('toUserId', '==', currentUser.uid),
            where('status', 'in', ['accepted', 'refused', 'cancelled']),
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
            container.innerHTML = '<p class="trade-empty">Aucun échange dans l\'historique</p>';
            return;
        }

        container.innerHTML = '';
        allTrades.forEach(trade => {
            container.appendChild(createTradeCard(trade, 'history'));
        });
    } catch (error) {
        console.error('Erreur de chargement de l\'historique:', error);
        container.innerHTML = '<p class="trade-empty">Erreur de chargement</p>';
    }
}

function createTradeCard(trade, type) {
    const card = document.createElement('div');
    card.className = 'exchange';

    const date = trade.createdAt?.toDate
        ? trade.createdAt.toDate().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : 'Date inconnue';

    let statusPill = '';
    if (trade.status === 'accepted') {
        statusPill = '<span class="status-pill accepted">✅ Accepté</span>';
    } else if (trade.status === 'refused') {
        statusPill = '<span class="status-pill refused">❌ Refusé</span>';
    } else if (trade.status === 'cancelled') {
        statusPill = '<span class="status-pill cancelled">🗑️ Annulé</span>';
    }

    let actions = '';
    if (type === 'received' && trade.status === 'pending') {
        actions = `
            <div class="exchange__footer">
                <button onclick="acceptTrade('${trade.id}')" class="btn btn--accept">✅ Accepter</button>
                <button onclick="refuseTrade('${trade.id}')" class="btn btn--refuse">❌ Refuser</button>
            </div>
        `;
    } else if (type === 'sent' && trade.status === 'pending') {
        actions = `<div class="exchange__footer"><button onclick="cancelTrade('${trade.id}')" class="btn btn--cancel btn--full">🗑️ Annuler la proposition</button></div>`;
    } else if (type === 'history') {
        // Dans l'historique, afficher le bouton Récupérer si applicable
        const amISender = trade.fromUserId === currentUser.uid;
        const alreadyClaimed = amISender ? trade.fromClaimed : trade.toClaimed;

        if (!alreadyClaimed && (trade.status === 'accepted' || trade.status === 'cancelled' || (trade.status === 'refused' && amISender))) {
            actions = `<div class="exchange__footer">${statusPill}<button onclick="claimTrade('${trade.id}')" class="btn btn--claim btn--full">📥 Récupérer ma part</button></div>`;
        } else if (alreadyClaimed) {
            actions = `<div class="exchange__footer">${statusPill}<span class="status-pill claimed">✅ Part récupérée</span></div>`;
        } else {
            actions = `<div class="exchange__footer">${statusPill}</div>`;
        }
    }

    // En attente : afficher le statut si présent (ne s'applique pas ici car pending)
    const footerFallback = (type !== 'history' && statusPill) ? `<div class="exchange__footer">${statusPill}</div>` : '';

    // Une face d'échange : pixel (optionnel) et/ou éclats
    const sideHtml = (role, pixelName, hasPixel, shards, canvasClass) => {
        let inner = `<span class="swap-side__role">${role}</span>`;
        if (hasPixel) {
            inner += `<canvas class="${canvasClass}" width="64" height="64"></canvas>`;
            inner += `<span class="swap-side__name">${pixelName}</span>`;
        }
        if (shards > 0) inner += `<span class="swap-shards">${shards} ✨</span>`;
        return `<div class="swap-side">${inner}</div>`;
    };
    const hasFromPixel = !!trade.fromPixelData;
    const hasToPixel = !!trade.toPixelData;

    card.innerHTML = `
        <div class="exchange__top">
            <div class="exchange__players"><b>${trade.fromUserName}</b> ↔ <b>${trade.toUserName}</b></div>
            <div class="exchange__date">${date}</div>
        </div>
        <div class="exchange__body">
            ${sideHtml('Proposé', trade.fromPixelName, hasFromPixel, trade.fromShards || 0, 'js-from-canvas')}
            <div class="swap-arrow">⇄</div>
            ${sideHtml('Demandé', trade.toPixelName, hasToPixel, trade.toShards || 0, 'js-to-canvas')}
        </div>
        ${actions || footerFallback}
    `;

    // Rendu des aperçus de pixels
    const fromCanvas = card.querySelector('.js-from-canvas');
    const toCanvas = card.querySelector('.js-to-canvas');
    if (fromCanvas && trade.fromPixelData) PixelRenderer.drawPixel(fromCanvas, trade.fromPixelData, 64);
    if (toCanvas && trade.toPixelData) PixelRenderer.drawPixel(toCanvas, trade.toPixelData, 64);

    return card;
}

window.acceptTrade = async function(tradeId) {
    if (!await uiConfirm('Ta part (pixel et/ou éclats) sera mise de côté, puis tu pourras récupérer ce qui t\'est proposé dans l\'historique.', { title: 'Accepter cet échange ?', confirmLabel: 'Accepter', icon: '🤝' })) return;

    try {
        const tradeDoc = await getDoc(doc(db, 'trades', tradeId));
        if (!tradeDoc.exists()) {
            showToast('Échange introuvable');
            return;
        }

        const trade = tradeDoc.data();
        const toShards = trade.toShards || 0;

        // Vérifier que je possède toujours de quoi honorer ma part
        if (trade.toPixelId && !userCollection[trade.toPixelId]) {
            showToast('Tu n\'as plus ce pixel !');
            return;
        }
        if (toShards > (userStats.shards || 0)) {
            showToast(`Il te faut ${toShards} éclats pour cet échange (tu en as ${userStats.shards || 0}).`);
            return;
        }

        // 1. Mettre de côté MA part : pixel demandé et/ou éclats demandés
        if (trade.toPixelId) removeOnePixelFromCollection(trade.toPixelId);
        if (toShards > 0) userStats.shards = (userStats.shards || 0) - toShards;
        await saveUserData();

        // 2. Marquer l'échange comme accepté
        await updateDoc(doc(db, 'trades', tradeId), {
            status: 'accepted',
            acceptedAt: serverTimestamp()
        });

        showToast('Échange accepté ! Va dans l\'historique pour récupérer ta part.');

        // Recharger les données
        await loadUserData();
        displayCollection();
        await loadPendingTrades();
        await loadTradeHistory();
    } catch (error) {
        console.error('Erreur lors de l\'acceptation:', error);
        showToast('Erreur: ' + error.message);
    }
}

window.refuseTrade = async function(tradeId) {
    if (!await uiConfirm('La mise de l\'autre joueur (pixel et/ou éclats) lui sera rendue.', { danger: true, title: 'Refuser cet échange ?', confirmLabel: 'Refuser', icon: '❌' })) return;

    try {
        // Marquer comme refusé (le pixel de fromUser sera rendu via claimTrade)
        await updateDoc(doc(db, 'trades', tradeId), {
            status: 'refused',
            refusedAt: serverTimestamp()
        });

        showToast('Échange refusé. La mise sera rendue à son propriétaire.');
        await loadPendingTrades();
        await loadTradeHistory();
    } catch (error) {
        console.error('Erreur lors du refus:', error);
        showToast('Erreur: ' + error.message);
    }
}

window.cancelTrade = async function(tradeId) {
    if (!await uiConfirm('Ta mise (pixel et/ou éclats) te sera rendue.', { title: 'Annuler la proposition ?', confirmLabel: 'Oui, annuler', cancelLabel: 'Non', icon: '🗑️' })) return;

    try {
        // Marquer comme annulé (le pixel sera rendu via claimTrade)
        await updateDoc(doc(db, 'trades', tradeId), {
            status: 'cancelled',
            cancelledAt: serverTimestamp()
        });
        showToast('Proposition annulée. Récupère ta part dans l\'historique.');
        await loadPendingTrades();
        await loadTradeHistory();
    } catch (error) {
        console.error('Erreur lors de l\'annulation:', error);
        showToast('Erreur: ' + error.message);
    }
}

window.claimTrade = async function(tradeId) {
    try {
        const tradeDoc = await getDoc(doc(db, 'trades', tradeId));
        if (!tradeDoc.exists()) {
            showToast('Échange introuvable');
            return;
        }

        const trade = tradeDoc.data();
        const amISender = trade.fromUserId === currentUser.uid;
        const amIReceiver = trade.toUserId === currentUser.uid;

        if (!amISender && !amIReceiver) {
            showToast('Cet échange ne te concerne pas');
            return;
        }

        // Déterminer ce que je récupère : pixel (optionnel) + éclats
        let pixelToReceive = null;
        let shardsToReceive = 0;
        let claimField = null;

        if (trade.status === 'accepted') {
            // Échange accepté : chacun récupère la part de l'autre
            if (amISender) {
                pixelToReceive = trade.toPixelData || null;   // la part du destinataire
                shardsToReceive = trade.toShards || 0;
                claimField = 'fromClaimed';
            } else {
                pixelToReceive = trade.fromPixelData || null; // la part de l'émetteur
                shardsToReceive = trade.fromShards || 0;
                claimField = 'toClaimed';
            }
        } else if (trade.status === 'refused' || trade.status === 'cancelled') {
            // Refusé/annulé : chacun récupère sa propre mise
            if (amISender) {
                pixelToReceive = trade.fromPixelData || null; // MA mise
                shardsToReceive = trade.fromShards || 0;
                claimField = 'fromClaimed';
            } else {
                // Le destinataire n'avait rien engagé (l'escrow ne se fait qu'à l'acceptation)
                showToast('Tu n\'as rien à récupérer de cet échange.');
                return;
            }
        } else {
            showToast('Cet échange n\'est pas terminé');
            return;
        }

        // Vérifier si déjà récupéré
        if (trade[claimField]) {
            showToast('Tu as déjà récupéré ta part !');
            return;
        }

        if (!pixelToReceive && shardsToReceive <= 0) {
            showToast('Rien à récupérer sur cet échange.');
            return;
        }

        // Créditer le pixel (si présent)
        const received = [];
        if (pixelToReceive) {
            const pixel = {
                ...pixelToReceive,
                data: pixelToReceive.data && typeof pixelToReceive.data === 'string' ? JSON.parse(pixelToReceive.data) : pixelToReceive.data,
                colors: pixelToReceive.colors && typeof pixelToReceive.colors === 'string' ? JSON.parse(pixelToReceive.colors) : pixelToReceive.colors
            };
            addPixelToCollection(pixel);
            received.push(`"${pixel.name}"`);
        }
        // Créditer les éclats (si présents)
        if (shardsToReceive > 0) {
            userStats.shards = (userStats.shards || 0) + shardsToReceive;
            received.push(`${shardsToReceive} ✨`);
        }
        await saveUserData();

        // Marquer comme récupéré
        await updateDoc(doc(db, 'trades', tradeId), {
            [claimField]: true,
            [`${claimField}At`]: serverTimestamp()
        });

        showToast(`Récupéré : ${received.join(' + ')} !`);

        // Recharger
        await loadUserData();
        displayCollection();
        await loadTradeHistory();
    } catch (error) {
        console.error('Erreur lors de la récupération:', error);
        showToast('Erreur: ' + error.message);
    }
}

function subscribeToTrades() {
    // Se désabonner si déjà abonné
    if (tradesUnsubscribe) {
        tradesUnsubscribe();
    }

    // S'abonner aux échanges reçus en temps réel
    const qReceived = query(
        collection(db, 'trades'),
        where('toUserId', '==', currentUser.uid),
        where('status', '==', 'pending')
    );

    // S'abonner aux échanges envoyés en temps réel
    const qSent = query(
        collection(db, 'trades'),
        where('fromUserId', '==', currentUser.uid),
        where('status', '==', 'pending')
    );

    let receivedCount = 0;
    let sentCount = 0;

    const updateCounter = () => {
        const total = receivedCount + sentCount;
        document.getElementById('pendingTradesCount').textContent = total;
    };

    // Écouter les échanges reçus
    const unsubReceived = onSnapshot(qReceived, (snapshot) => {
        receivedCount = snapshot.size;
        updateCounter();

        // Si on est sur l'onglet pending, rafraîchir
        const activeTab = document.querySelector('.trade-tab.active');
        if (activeTab && activeTab.dataset.tradeTab === 'pending') {
            loadPendingTrades();
        }
    });

    // Écouter les échanges envoyés
    const unsubSent = onSnapshot(qSent, (snapshot) => {
        sentCount = snapshot.size;
        updateCounter();

        // Si on est sur l'onglet pending, rafraîchir
        const activeTab = document.querySelector('.trade-tab.active');
        if (activeTab && activeTab.dataset.tradeTab === 'pending') {
            loadPendingTrades();
        }
    });

    // Fonction pour se désabonner des deux listeners
    tradesUnsubscribe = () => {
        unsubReceived();
        unsubSent();
    };
}
