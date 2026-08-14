class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload() {
        // Display a simple text visual feedback track for the user
        const loadingText = this.add.text(960, 540, '📥 LOADING SYSTEM ASSETS... PLEASE WAIT', {
            fontSize: '24px', fontFamily: 'monospace', fill: '#00ff00', fontWeight: 'bold'
        }).setOrigin(0.5);

        // Global socket initialization reference point
        this.socket = globalSocket;

        // 🛠️ PHASER 3 CONVERSION: Replaced .atlasPCT with universal JSON Texture Atlases.
        // Format syntax parameters: this.load.atlas(key, textureURL, atlasURL)
        this.load.atlas('BS01_cards', 'assets/BS01.png', 'assets/BS01.json');
        this.load.atlas('BS02_cards', 'assets/BS02.png', 'assets/BS02.json');
        this.load.atlas('BS03_cards', 'assets/BS03.png', 'assets/BS03.json');
        this.load.atlas('BS10_cards', 'assets/atlas.png', 'assets/atlas.json');
    }

    create() {
        console.log("✅ Global texture cache fully hydrated. Transitioning to LobbyScene.");
        
        // Push view target over into the main discovery lobby matrix
        this.scene.start('LobbyScene');
    }
}
