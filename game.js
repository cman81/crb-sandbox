// 1. Establish the single, global network connection first
const globalSocket = io('https://crb-sandbox-production.up.railway.app', {
    transports: ['websocket'],
    upgrade: false
});

// 2. Standard game configuration object
const config = {
    type: Phaser.AUTO,
    width: 1920,
    height: 1080,
    parent: 'phaser-game',
    dom: { createContainer: true },
    scene: [BootScene, LobbyScene, DeckPrepScene, GameScene, DeveloperMode]
};

const game = new Phaser.Game(config);
