// Module de rendu des pixels
const PixelRenderer = {
    // Palette de 4 couleurs
    colors: ['#FF0000', '#0000FF', '#00FF00', '#FFFF00'], // Rouge, Bleu, Vert, Jaune

    /**
     * Dessine un pixel 1x1
     * @param {HTMLCanvasElement} canvas - Le canvas où dessiner
     * @param {string} pattern - Le pattern (1 chiffre: "1", "2", "3", ou "4")
     * @param {number} size - Taille du pixel en pixels d'écran
     */
    draw1x1(canvas, pattern, size = 40) {
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        const colorIndex = parseInt(pattern) - 1;
        ctx.fillStyle = this.colors[colorIndex];
        ctx.fillRect(0, 0, size, size);
    },

    /**
     * Dessine un pixel 2x2
     * @param {HTMLCanvasElement} canvas - Le canvas où dessiner
     * @param {string} pattern - Le pattern (4 chiffres: "1234", "1111", etc.)
     * @param {number} pixelSize - Taille de chaque sous-pixel
     */
    draw2x2(canvas, pattern, pixelSize = 20) {
        canvas.width = pixelSize * 2;
        canvas.height = pixelSize * 2;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        // Pattern 2×2: 1234
        // [1 2]
        // [3 4]

        // Haut-gauche
        ctx.fillStyle = this.colors[parseInt(pattern[0]) - 1];
        ctx.fillRect(0, 0, pixelSize, pixelSize);

        // Haut-droite
        ctx.fillStyle = this.colors[parseInt(pattern[1]) - 1];
        ctx.fillRect(pixelSize, 0, pixelSize, pixelSize);

        // Bas-gauche
        ctx.fillStyle = this.colors[parseInt(pattern[2]) - 1];
        ctx.fillRect(0, pixelSize, pixelSize, pixelSize);

        // Bas-droite
        ctx.fillStyle = this.colors[parseInt(pattern[3]) - 1];
        ctx.fillRect(pixelSize, pixelSize, pixelSize, pixelSize);
    },

    /**
     * Dessine un pixel art 8x8
     * @param {HTMLCanvasElement} canvas - Le canvas où dessiner
     * @param {Array<Array<number>>} pattern - Grille 8x8 de nombres
     * @param {Array<string>} colors - Palette de couleurs pour ce pixel art
     * @param {number} pixelSize - Taille de chaque pixel
     */
    draw8x8(canvas, pattern, colors, pixelSize = 20) {
        canvas.width = pixelSize * 8;
        canvas.height = pixelSize * 8;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                ctx.fillStyle = colors[pattern[y][x]];
                ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
            }
        }
    },

    /**
     * Génère tous les patterns possibles pour les 1x1 (4 au total)
     */
    generateAll1x1() {
        return ['1', '2', '3', '4'];
    },

    /**
     * Génère tous les patterns possibles pour les 2x2 (256 au total)
     */
    generateAll2x2() {
        const patterns = [];
        for (let i = 1; i <= 4; i++) {
            for (let j = 1; j <= 4; j++) {
                for (let k = 1; k <= 4; k++) {
                    for (let l = 1; l <= 4; l++) {
                        patterns.push(`${i}${j}${k}${l}`);
                    }
                }
            }
        }
        return patterns;
    },

    /**
     * Dessine n'importe quel type de pixel automatiquement
     * @param {HTMLCanvasElement} canvas - Le canvas où dessiner
     * @param {Object} pixelData - Données du pixel {type, pattern, colors?, data?}
     * @param {number} size - Taille du rendu
     */
    drawPixel(canvas, pixelData, size = 40) {
        switch(pixelData.type) {
            case '1x1':
                this.draw1x1(canvas, pixelData.pattern, size);
                break;
            case '2x2':
                this.draw2x2(canvas, pixelData.pattern, size / 2);
                break;
            case 'art':
                this.draw8x8(canvas, pixelData.data, pixelData.colors, size / 8);
                break;
        }
    },

    /**
     * Retourne la rareté d'un pixel
     * @param {string} type - Type du pixel (1x1, 2x2, art)
     * @returns {string} - 'common', 'rare', ou 'legendary'
     */
    getRarity(type) {
        if (type === '1x1') return 'common';
        if (type === '2x2') return 'rare';
        if (type === 'art') return 'legendary';
        return 'common';
    },

    /**
     * Retourne le label de rareté traduit
     * @param {string} rarity - Rareté (common, rare, legendary)
     * @returns {string} - Label traduit
     */
    getRarityLabel(rarity) {
        const labels = {
            'common': 'Commun',
            'rare': 'Rare',
            'legendary': 'Légendaire'
        };
        return labels[rarity] || 'Commun';
    },

    /**
     * Retourne les chances de drop pour chaque rareté
     */
    getDropRates() {
        return {
            common: 0.70,    // 70% pour 1x1
            rare: 0.28,      // 28% pour 2x2
            legendary: 0.02  // 2% pour pixel art
        };
    }
};
