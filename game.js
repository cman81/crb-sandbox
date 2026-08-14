// 1. Establish the single, global network connection first
const globalSocket = io('https://crb-sandbox-production.up.railway.app', {
    transports: ['websocket'],
    upgrade: false
});

// 2. Standard Phaser 3 configuration object
const config = {
    type: Phaser.AUTO,
    width: 1920,
    height: 1080,
    parent: 'phaser-game',
    
    // Core scaling engine to handle full-screen sizing without distortion
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },

    // Activates HTML element overlays inside the canvas boundary
    dom: { createContainer: true },

    // Phaser 3 Scene Management Array Loop
    scene: [BootScene, LobbyScene, DeckPrepScene, GameScene, DeveloperMode]
};

// Instantiate the monolithic Phaser 3 Engine instance
const game = new Phaser.Game(config);
