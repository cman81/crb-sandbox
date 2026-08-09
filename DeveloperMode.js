class DeveloperMode extends Phaser.Scene {
    constructor() {
        super({ key: 'DeveloperMode' });
        this.socket = null;
        
        this.myActiveTable = null;
        this.myActiveRole = null;
    }

    preload() {
        this.socket = io('http://localhost:3000');
    }

    create() {
        this.add.text(50, 40, '🛠️ TCG DEVELOPER MODE CONSOLE', { 
            fontSize: '36px', fill: '#00ff00', fontFamily: 'monospace', fontWeight: 'bold'
        });

        this.createTabButtons();
        this.createConsoleLog();
        this.createLobbyTabPanel();     
        this.createDeckLoaderTabPanel(); 
        this.createGameActionsTabPanel();
        this.createStateInspectorPanel(); 
        this.setupSocketListeners();

        this.switchTab(1);
    }

    createTabButtons() {
        this.tab1Btn = this.add.text(50, 110, '[ TAB 1: LOBBY ]', { fontSize: '18px', fontFamily: 'monospace', fill: '#00ff00', backgroundColor: '#222', padding: 8 })
            .setInteractive({ useHandCursor: true }).on('pointerdown', () => this.switchTab(1));

        this.tab2Btn = this.add.text(240, 110, '[ TAB 2: DECK LOADER ]', { fontSize: '18px', fontFamily: 'monospace', fill: '#ffffff', backgroundColor: '#111', padding: 8 })
            .setInteractive({ useHandCursor: true }).on('pointerdown', () => this.switchTab(2));

        this.tab3Btn = this.add.text(490, 110, '[ TAB 3: ACTIONS ]', { fontSize: '18px', fontFamily: 'monospace', fill: '#ffffff', backgroundColor: '#111', padding: 8 })
            .setInteractive({ useHandCursor: true }).on('pointerdown', () => this.switchTab(3));
    }

    switchTab(tabNum) {
        // Set all buttons to default dark state
        this.tab1Btn.setStyle({ fill: '#ffffff', backgroundColor: '#111' });
        this.tab2Btn.setStyle({ fill: '#ffffff', backgroundColor: '#111' });
        this.tab3Btn.setStyle({ fill: '#ffffff', backgroundColor: '#111' });
        
        if (this.domLobbyPanel) this.domLobbyPanel.setVisible(false);
        if (this.domDeckLoaderPanel) this.domDeckLoaderPanel.setVisible(false);
        if (this.domGameActionsPanel) this.domGameActionsPanel.setVisible(false);

        if (tabNum === 1) {
            this.tab1Btn.setStyle({ fill: '#00ff00', backgroundColor: '#222' });
            if (this.domLobbyPanel) this.domLobbyPanel.setVisible(true);
        } else if (tabNum === 2) {
            this.tab2Btn.setStyle({ fill: '#00ff00', backgroundColor: '#222' });
            if (this.domDeckLoaderPanel) this.domDeckLoaderPanel.setVisible(true);
        } else if (tabNum === 3) {
            this.tab3Btn.setStyle({ fill: '#00ff00', backgroundColor: '#222' });
            if (this.domGameActionsPanel) this.domGameActionsPanel.setVisible(true);
        }
    }

    createLobbyTabPanel() {
        const htmlContent = `
            <div style="color: white; font-family: monospace; font-size: 18px; background: #222; padding: 25px; border-radius: 8px; width: 460px; height: 500px; border: 1px solid #444; box-shadow: 0px 4px 15px rgba(0,0,0,0.5); box-sizing: border-box;">
                <h3 style="margin-top:0; color:#00ff00; font-size: 22px; margin-bottom: 25px;">1. Table Configuration</h3>
                <div style="margin-bottom: 20px;">
                    <label style="display: inline-block; width: 160px;">Table ID (1-8):</label>
                    <input type="number" id="devTableId" min="1" max="8" value="1" style="width: 70px; font-size: 16px; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px;">
                </div>
                <div style="margin-bottom: 40px;">
                    <label style="display: inline-block; width: 160px;">Select Role:</label>
                    <select id="devRole" style="width: 140px; font-size: 16px; padding: 5px; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px;">
                        <option value="playerA">Player A</option>
                        <option value="playerB">Player B</option>
                        <option value="spectator">Spectator</option>
                    </select>
                </div>
                <div style="display: flex; gap: 15px; margin-top: 50px;">
                    <button id="lobbyJoinBtn" style="flex: 1; background: #00ff00; color: #000; font-weight: bold; font-size: 16px; padding: 12px; border: none; border-radius: 4px; cursor: pointer;">JOIN TABLE</button>
                    <button id="lobbyLeaveBtn" style="flex: 1; background: #ff0000; color: #fff; font-weight: bold; font-size: 16px; padding: 12px; border: none; border-radius: 4px; cursor: pointer;">LEAVE TABLE</button>
                </div>
            </div>
        `;
        
        this.domLobbyPanel = this.add.dom(50, 170).createFromHTML(htmlContent).setOrigin(0, 0);

        this.domLobbyPanel.addListener('click');
        this.domLobbyPanel.on('click', (event) => {
            if (event.target.id === 'lobbyJoinBtn') this.handleJoin();
            if (event.target.id === 'lobbyLeaveBtn') this.handleLeave();
        });
    }

    createDeckLoaderTabPanel() {
        const htmlContent = `
            <div style="color: white; font-family: monospace; font-size: 16px; background: #222; padding: 25px; border-radius: 8px; width: 460px; height: 500px; border: 1px solid #444; box-shadow: 0px 4px 15px rgba(0,0,0,0.5); box-sizing: border-box;">
                <h3 style="margin-top:0; color:#00ff00; font-size: 22px; margin-bottom: 20px;">2. Decklist Processor</h3>
                
                <div style="margin-bottom: 20px; display: flex; justify-content: space-between;">
                    <div>
                        <label>Table:</label>
                        <input type="number" id="deckTableId" min="1" max="8" value="1" style="width:45px; background:#333; color:#fff; border:1px solid #555; padding:4px; border-radius: 4px;">
                    </div>
                    <div>
                        <label>Slot:</label>
                        <select id="deckTargetPlayer" style="width:105px; background:#333; color:#fff; border:1px solid #555; padding:4px; border-radius: 4px;">
                            <option value="playerA">Player A</option>
                            <option value="playerB">Player B</option>
                        </select>
                    </div>
                </div>

                <!-- SIMPLIFIED INSTANT SHUFFLE -->
                <div style="margin-bottom: 20px;">
                    <button id="deckShuffleBtn" style="width:100%; background:#ffff00; color:#000; font-weight:bold; font-size:15px; padding:10px; border:none; border-radius:4px; cursor:pointer; box-shadow: 0px 0px 10px rgba(255,255,0,0.3);">⚡ INSTANT SHUFFLE DECK</button>
                </div>

                <label style="display:block; margin-bottom:4px; font-size:14px;">Paste Raw Decklist Below:</label>
                <textarea id="deckRawInput" placeholder="2 Adventurer Cookie [ST1-013]..." style="width:100%; height:180px; background:#111; color:#fff; font-family:monospace; font-size:13px; border:1px solid #555; padding:8px; box-sizing:border-box; resize:none; border-radius: 4px;"></textarea>
                <button id="deckLoadBtn" style="margin-top:15px; width:100%; background:#00ff00; color:#000; font-weight:bold; font-size:15px; padding:12px; border:none; border-radius:4px; cursor:pointer;">LOAD DECKLIST</button>
            </div>
        `;
        
        this.domDeckLoaderPanel = this.add.dom(50, 170).createFromHTML(htmlContent).setOrigin(0, 0);
        
        this.domDeckLoaderPanel.addListener('click');
        this.domDeckLoaderPanel.on('click', (event) => {
            if (event.target.id === 'deckLoadBtn') this.handleDeckLoad();
            if (event.target.id === 'deckShuffleBtn') this.handleDeckShuffle();
        });
    }

    createConsoleLog() {
        // Change this to a class property so we can alter it dynamically later
        this.logTitleText = this.add.text(550, 110, '📢 SERVER RESPONSE STREAM (PERSPECTIVE: UNBOUND LOBBY)', { 
            fontSize: '18px', fill: '#00ff00', fontFamily: 'monospace', fontWeight: 'bold' 
        });
        
        const logHtml = `
            <textarea id="devLog" readonly style="width: 1320px; height: 560px; background-color: #050505; color: #33ff33; font-family: 'Courier New', monospace; font-size: 16px; border: 1px solid #33ff33; padding: 15px; border-radius: 8px; resize: none; box-shadow: inset 0 0 10px #000; box-sizing: border-box;"></textarea>
        `;
        this.domLog = this.add.dom(550, 140).createFromHTML(logHtml).setOrigin(0, 0);
    }

    createStateInspectorPanel() {
        const htmlContent = `
            <div style="color: white; font-family: monospace; font-size: 16px; background: #151c24; padding: 20px; border-radius: 8px; width: 1320px; border: 1px solid #00ff00; box-shadow: 0px 4px 15px rgba(0,0,0,0.7); box-sizing: border-box; display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 20px;">
                    <span style="color: #00ff00; font-weight: bold; font-size: 18px;">🔎 State Inspector Loop:</span>
                    <label>Table ID (1-8):</label>
                    <input type="number" id="inspectTableId" min="1" max="8" value="1" style="width: 55px; background: #222; color: #fff; border: 1px solid #555; padding: 5px; border-radius: 4px;">
                    <label style="margin-left: 10px;">View Perspective:</label>
                    <select id="inspectRole" style="width: 150px; background: #222; color: #fff; border: 1px solid #555; padding: 5px; border-radius: 4px;">
                        <option value="spectator">Spectator (X-Ray)</option>
                        <option value="playerA">Player A</option>
                        <option value="playerB">Player B</option>
                    </select>
                </div>
                <button id="inspectGetStateBtn" style="background: #00ff00; color: #000; font-weight: bold; font-size: 16px; padding: 12px 30px; border: none; border-radius: 4px; cursor: pointer; box-shadow: 0px 0px 10px rgba(0,255,0,0.5);">GET GAME STATE</button>
            </div>
        `;

        this.domInspectorPanel = this.add.dom(550, 720).createFromHTML(htmlContent).setOrigin(0, 0);

        this.domInspectorPanel.addListener('click');
        this.domInspectorPanel.on('click', (event) => {
            if (event.target.id === 'inspectGetStateBtn') this.handleGetGameState();
        });
    }

    handleJoin() {
        const tableId = document.getElementById('devTableId').value;
        const role = document.getElementById('devRole').value;
        
        // Cache your current perspective locally on the scene object
        this.myActiveTable = parseInt(tableId);
        this.myActiveRole = role;

        this.logToConsole(`>> Emitting joinTable: Table ${tableId} as ${role}`);
        this.socket.emit('joinTable', { tableId: this.myActiveTable, role });
    }

    handleLeave() {
        this.logToConsole(`>> Emitting leaveTable`);
        this.socket.emit('leaveTable');
        
        // Reset your cached tracking perspective
        this.myActiveTable = null;
        this.myActiveRole = null;
    }

    handleDeckLoad() {
        const tableId = document.getElementById('deckTableId').value;
        const targetPlayer = document.getElementById('deckTargetPlayer').value;
        const rawText = document.getElementById('deckRawInput').value;

        if (!rawText.trim()) return this.logToConsole("[CLIENT ERROR]: Deck text field is completely empty!");

        const lines = rawText.split('\n');
        const processedDeck = [];
        const regex = /^\s*(\d+)\s+.*?\[([A-Za-z0-9-]+)\]/;

        lines.forEach(line => {
            const match = line.match(regex);
            if (match) {
                const count = parseInt(match[1], 10);
                const cardCode = match[2];
                for (let i = 0; i < count; i++) {
                    processedDeck.push(cardCode);
                }
            }
        });

        this.logToConsole(`>> Emitting loadDeck: Table ${tableId} (${targetPlayer}) with ${processedDeck.length} flattened card entries.`);
        this.socket.emit('loadDeck', { tableId: parseInt(tableId), targetPlayer, deckList: processedDeck });
    }

    handleGetGameState() {
        const tableId = document.getElementById('inspectTableId').value;
        const role = document.getElementById('inspectRole').value;

        this.logToConsole(`>> Emitting getGameState Request: Fetching Table ${tableId} contents from '${role}' perspective.`);
        this.socket.emit('getGameState', { tableId: parseInt(tableId), role });
    }

    setupSocketListeners() {
        this.socket.on('stateUpdate', (sanitizedState) => {
            this.logToConsole(`[RECEIVED stateUpdate]:\n${JSON.stringify(sanitizedState, null, 2)}`);
        });
        
        this.socket.on('errorMsg', (msg) => {
            this.logToConsole(`[SERVER ERROR]: ${msg}`);
        });

        this.socket.on('serverNotice', (msg) => {
            this.logToConsole(`[SERVER SUCCESS]: ${msg}`);
        });

        // Update this event receiver block completely:
        this.socket.on('cardDrawnUpdate', (drawEvent) => {
            // Update the live title tracking label on the canvas
            if (this.myActiveTable && this.myActiveRole) {
                this.logTitleText.setText(`📢 SERVER RESPONSE STREAM (PERSPECTIVE: TABLE ${this.myActiveTable} AS ${this.myActiveRole.toUpperCase()})`);
                this.logTitleText.setStyle({ fill: '#ffff00' });
            } else {
                this.logTitleText.setText('📢 SERVER RESPONSE STREAM (PERSPECTIVE: UNBOUND LOBBY)');
                this.logTitleText.setStyle({ fill: '#00ff00' });
            }

            // Append specific descriptive logs based on your localized client position
            const isOwner = this.myActiveRole === drawEvent.targetPlayer;
            const isSpectator = this.myActiveRole === 'spectator';
            
            let perceptionTag = "[ENEMY VISION]";
            if (isOwner) perceptionTag = "[YOUR HAND VISION]";
            if (isSpectator) perceptionTag = "[SPECTATOR X-RAY VISION]";

            this.logToConsole(`[LIVE DRAW EVENT] ${perceptionTag}
Player ${drawEvent.targetPlayer} drew a card. 
Your Visible Data payload: ${JSON.stringify(drawEvent.card)}
Remaining Deck Count: ${drawEvent.deckCount}`);
        });
    }

    logToConsole(message) {
        const textarea = document.getElementById('devLog');
        if (textarea) {
            const timestamp = new Date().toLocaleTimeString();
            textarea.value += `[${timestamp}] ${message}\n\n`;
            textarea.scrollTop = textarea.scrollHeight;
        }
    }

    handleInsertTimestamp() {
        const seedInput = document.getElementById('shuffleSeed');
        if (seedInput) {
            seedInput.value = Date.now().toString();
            this.logToConsole(`>> Generated millisecond seed timestamp: ${seedInput.value}`);
        }
    }

    handleDeckShuffle() {
        const tableId = document.getElementById('deckTableId').value;
        const targetPlayer = document.getElementById('deckTargetPlayer').value;

        this.logToConsole(`>> Emitting shuffleDeck: Table ${tableId} (${targetPlayer}) via unique UUID sort routine.`);
        this.socket.emit('shuffleDeck', { tableId: parseInt(tableId), targetPlayer });
    }

    createGameActionsTabPanel() {
        const htmlContent = `
            <div style="color: white; font-family: monospace; font-size: 16px; background: #222; padding: 25px; border-radius: 8px; width: 460px; height: 500px; border: 1px solid #444; box-shadow: 0px 4px 15px rgba(0,0,0,0.5); box-sizing: border-box;">
                <h3 style="margin-top:0; color:#00ff00; font-size: 22px; margin-bottom: 20px;">3. Game Actions</h3>
                
                <div style="margin-bottom: 25px; display: flex; justify-content: space-between;">
                    <div>
                        <label>Table:</label>
                        <input type="number" id="actionTableId" min="1" max="8" value="1" style="width:45px; background:#333; color:#fff; border:1px solid #555; padding:4px; border-radius: 4px;">
                    </div>
                    <div>
                        <label>Target Player:</label>
                        <select id="actionTargetPlayer" style="width:105px; background:#333; color:#fff; border:1px solid #555; padding:4px; border-radius: 4px;">
                            <option value="playerA">Player A</option>
                            <option value="playerB">Player B</option>
                        </select>
                    </div>
                </div>

                <div style="background: #1a1a1a; padding: 15px; border-radius: 6px; border: 1px solid #555;">
                    <button id="actionDrawBtn" style="width:100%; background:#00ff00; color:#000; font-weight:bold; font-size:16px; padding:12px; border:none; border-radius:4px; cursor:pointer; box-shadow: 0px 0px 10px rgba(0,255,0,0.2);">🎴 DRAW 1 CARD</button>
                </div>
            </div>
        `;
        
        this.domGameActionsPanel = this.add.dom(50, 170).createFromHTML(htmlContent).setOrigin(0, 0);
        
        this.domGameActionsPanel.addListener('click');
        this.domGameActionsPanel.on('click', (event) => {
            if (event.target.id === 'actionDrawBtn') this.handleDrawCard();
        });
    }

    handleDrawCard() {
        const tableId = document.getElementById('actionTableId').value;
        const targetPlayer = document.getElementById('actionTargetPlayer').value;

        this.logToConsole(`>> Emitting drawCard: Table ${tableId} for ${targetPlayer}`);
        this.socket.emit('drawCard', { tableId: parseInt(tableId), targetPlayer });
    }

}
