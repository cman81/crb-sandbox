class LobbyScene extends Phaser.Scene {
    constructor() {
        super({ key: 'LobbyScene' });
    }

    create() {
        this.socket = globalSocket;

        // Title text anchored cleanly at virtual center (960)
        this.add.text(960, 250, 'Competitive Ruleset Battle Sandbox', {
            fontSize: '42px', fill: '#00ff00', fontFamily: 'monospace', fontWeight: 'bold'
        }).setOrigin(0.5);

        // Pristine, explicit card layout with no viewport-hijacking outer dividers
        const htmlContent = `
            <div style="
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                box-sizing: border-box;
                
                color: white; 
                font-family: monospace; 
                font-size: 18px; 
                background: #1e293b; 
                padding: 30px; 
                border-radius: 12px; 
                width: 400px; 
                border: 2px solid #334155; 
                box-shadow: 0px 10px 30px rgba(0,0,0,0.75);
                user-select: none;
            ">
                <div style="margin-bottom: 20px; width: 100%; display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-weight: bold; color: #94a3b8;">Select Table:</label>
                    <input type="number" id="lobbyTableId" min="1" max="8" value="1" style="width: 80px; font-size: 16px; padding: 6px; background: #0f172a; color: #fff; border: 1px solid #334155; border-radius: 6px; text-align: center;">
                </div>
                <div style="margin-bottom: 30px; width: 100%; display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-weight: bold; color: #94a3b8;">Select Seat Role:</label>
                    <select id="lobbyRole" style="width: 150px; font-size: 16px; padding: 6px; background: #0f172a; color: #fff; border: 1px solid #334155; border-radius: 6px;">
                        <option value="playerA">Player A</option>
                        <option value="playerB">Player B</option>
                        <option value="spectator">Spectator</option>
                    </select>
                </div>
                <button id="enterMatchBtn" style="width:100%; background: #00ff00; color: #000; font-weight: bold; font-size: 18px; padding: 14px; border: none; border-radius: 6px; cursor: pointer;">CONNECT TO FIELD</button>
            </div>
        `;

        // 🌟 THE ALIGNMENT MATRIX RE-ANCHOR
        // Dropping the 400px box directly at center coordinates (960, 560).
        // setOrigin(0.5) tells Phaser to anchor the center of the box right over that virtual spot natively!
        this.domLobby = this.add.dom(960, 560).createFromHTML(htmlContent).setOrigin(0.5);
        this.domLobby.addListener('click');
        
        this.domLobby.on('click', (event) => {
            if (event.target.id === 'enterMatchBtn') {
                const tableId = parseInt(document.getElementById('lobbyTableId').value, 10);
                const role = document.getElementById('lobbyRole').value;

                if (role === 'spectator') {
                    // Spectators don't own decks; route them straight to the arena view map
                    this.scene.start('GameScene', { tableId, role });
                } else {
                    // 🚨 TARGETED CHECK: Ask server if THIS SPECIFIC PLAYER SLOT already has a loaded deck array
                    this.socket.emit('checkTableStatus', { tableId, role });

                    // Set up a clean, one-time structural network interceptor handler
                    this.socket.once('tableStatusResponse', (status) => {
                        // Ensure the server response explicitly matches our active table and seat intent
                        if (status.tableId === tableId && status.role === role) {
                            if (status.hasDeckLoaded) {
                                console.log(`🎮 Seat ${role} at Table ${tableId} already has a loaded deck. Routing straight to GameScene.`);
                                this.scene.start('GameScene', { tableId, role });
                            } else {
                                console.log(`🎴 Seat ${role} at Table ${tableId} has no deck data. Routing to DeckPrepScene.`);
                                this.scene.start('DeckPrepScene', { tableId, role });
                            }
                        }
                    });
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
