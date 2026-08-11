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

        // 🚨 MOVED FROM DECKPREP / GAMESCENE: Download sheets exactly once right here
        this.load.atlasPCT('BS01_cards', 'assets/BS01.pct', 'assets');
        this.load.atlasPCT('BS02_cards', 'assets/BS02.pct', 'assets');
        this.load.atlasPCT('BS03_cards', 'assets/BS03.pct', 'assets');
        this.load.atlasPCT('BS10_cards', 'assets/atlas.pct', 'assets');
    }

    create() {
        console.log("✅ Global texture cache fully hydrated. Transitioning to LobbyScene.");
        
        // Push view target over into the main discovery lobby matrix
        this.scene.start('LobbyScene');
    }
}
