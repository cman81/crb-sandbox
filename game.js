// 🚨 Comment this check out temporary to run a live cloud test pass from home:
// const isLocalElectronRun = window.location.protocol === "file:" || window.location.hostname === "localhost";
// const targetServerUrl = isLocalElectronRun ? "http://localhost:3000" : "https://crb-sandbox-production.up.railway.app";

// For now, force it straight to the cloud:
const targetServerUrl = "https://crb-sandbox-production.up.railway.app"; // Your active Railway URL

const globalSocket = io(targetServerUrl, {
    transports: ["websocket"],
    upgrade: false
});


console.log(`📡 Electron client routing active frame traffic to: ${targetServerUrl}`);

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
