const config = {
    type: Phaser.AUTO,
    parent: 'phaser-game',
    width: 1920,
    height: 1080,
    dom: {
        createContainer: true // Required for HTML inputs
    },
    scene: [ DeveloperMode ]
};
const game = new Phaser.Game(config);
