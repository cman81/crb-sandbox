class LobbyScene extends Phaser.Scene {
    constructor() {
        super({ key: 'LobbyScene' });
    }

    create() {
        // Access the single persistent global socket connection
        this.socket = globalSocket;

        this.add.text(960, 250, 'Competitive Ruleset Battle Sandbox', {
            fontSize: '42px', fill: '#00ff00', fontFamily: 'monospace', fontWeight: 'bold'
        }).setOrigin(0.5);

        const htmlContent = `
            <div style="color: white; font-family: monospace; font-size: 18px; background: #222; padding: 30px; border-radius: 8px; width: 400px; border: 1px solid #444; box-shadow: 0px 4px 15px rgba(0,0,0,0.5);">
                <div style="margin-bottom: 20px;">
                    <label style="display: inline-block; width: 160px;">Select Table:</label>
                    <input type="number" id="lobbyTableId" min="1" max="8" value="1" style="width: 70px; font-size: 16px; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px;">
                </div>
                <div style="margin-bottom: 30px;">
                    <label style="display: inline-block; width: 160px;">Select Seat Role:</label>
                    <select id="lobbyRole" style="width: 140px; font-size: 16px; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px;">
                        <option value="playerA">Player A</option>
                        <option value="playerB">Player B</option>
                        <option value="spectator">Spectator</option>
                    </select>
                </div>
                <button id="enterMatchBtn" style="width:100%; background: #00ff00; color: #000; font-weight: bold; font-size: 18px; padding: 12px; border: none; border-radius: 4px; cursor: pointer;">CONNECT TO FIELD</button>
            </div>
        `;

        this.domLobby = this.add.dom(960, 540).createFromHTML(htmlContent).setOrigin(0.5);
        this.domLobby.addListener('click');
        
        this.domLobby.on('click', (event) => {
            if (event.target.id === 'enterMatchBtn') {
                const tableId = parseInt(document.getElementById('lobbyTableId').value, 10);
                const role = document.getElementById('lobbyRole').value;

                // --- SMART SCENE ROUTING REDIRECT LOOP ---
                if (role === 'spectator') {
                    // Spectators bypass asset loading rooms entirely
                    this.scene.start('GameScene', { tableId, role });
                } else {
                    // Competitors must process and register their deck text lists first!
                    this.scene.start('DeckPrepScene', { tableId, role });
                }
            }
        });

        // CHEAT CODE ENGINE: Hidden door that triggers DeveloperMode only while inside Lobby
        let inputSequenceBuffer = '';
        const targetCheatSequence = 'dev';

        this.input.keyboard.on('keydown', (event) => {
            inputSequenceBuffer += event.key.toLowerCase();
            if (inputSequenceBuffer.length > targetCheatSequence.length) {
                inputSequenceBuffer = inputSequenceBuffer.slice(-targetCheatSequence.length);
            }

            if (inputSequenceBuffer === targetCheatSequence) {
                inputSequenceBuffer = ''; // Reset buffer right away
                console.log("⚠️ Accessing developer panel interface layer...");
                
                // Swap completely to the developer mode dashboard view screen
                this.scene.start('DeveloperMode');
            }
        });
    }
}
