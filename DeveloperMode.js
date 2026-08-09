class DeveloperMode extends Phaser.Scene {
    constructor() {
        super({ key: 'DeveloperMode' });
        this.socket = null;
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
        this.createStateInspectorPanel(); 
        this.setupSocketListeners();

        this.switchTab(1);
    }

    createTabButtons() {
        this.tab1Btn = this.add.text(50, 110, '[ TAB 1: LOBBY ]', { fontSize: '18px', fontFamily: 'monospace', fill: '#00ff00', backgroundColor: '#222', padding: 8 })
            .setInteractive({ useHandCursor: true }).on('pointerdown', () => this.switchTab(1));

        this.tab2Btn = this.add.text(240, 110, '[ TAB 2: DECK LOADER ]', { fontSize: '18px', fontFamily: 'monospace', fill: '#ffffff', backgroundColor: '#111', padding: 8 })
            .setInteractive({ useHandCursor: true }).on('pointerdown', () => this.switchTab(2));
    }

    switchTab(tabNum) {
        if (tabNum === 1) {
            this.tab1Btn.setStyle({ fill: '#00ff00', backgroundColor: '#222' });
            this.tab2Btn.setStyle({ fill: '#ffffff', backgroundColor: '#111' });
            if (this.domLobbyPanel) this.domLobbyPanel.setVisible(true);
            if (this.domDeckLoaderPanel) this.domDeckLoaderPanel.setVisible(false);
        } else {
            this.tab1Btn.setStyle({ fill: '#ffffff', backgroundColor: '#111' });
            this.tab2Btn.setStyle({ fill: '#00ff00', backgroundColor: '#222' });
            if (this.domLobbyPanel) this.domLobbyPanel.setVisible(false);
            if (this.domDeckLoaderPanel) this.domDeckLoaderPanel.setVisible(true);
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
                <div style="margin-bottom: 12px;">
                    <label style="display:inline-block; width:150px;">Target Table:</label>
                    <input type="number" id="deckTableId" min="1" max="8" value="1" style="width:60px; background:#333; color:#fff; border:1px solid #555; padding:6px; border-radius: 4px;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display:inline-block; width:150px;">Target Slot:</label>
                    <select id="deckTargetPlayer" style="width:110px; background:#333; color:#fff; border:1px solid #555; padding:6px; border-radius: 4px;">
                        <option value="playerA">Player A</option>
                        <option value="playerB">Player B</option>
                    </select>
                </div>
                <label style="display:block; margin-bottom:8px;">Paste Raw Decklist Below:</label>
                <textarea id="deckRawInput" placeholder="2 Adventurer Cookie [ST1-013]..." style="width:100%; height:200px; background:#111; color:#fff; font-family:monospace; font-size:13px; border:1px solid #555; padding:8px; box-sizing:border-box; resize:none; border-radius: 4px;"></textarea>
                <button id="deckLoadBtn" style="margin-top:15px; width:100%; background:#00ff00; color:#000; font-weight:bold; font-size:16px; padding:12px; border:none; border-radius:4px; cursor:pointer;">LOAD DECKLIST</button>
            </div>
        `;
        
        this.domDeckLoaderPanel = this.add.dom(50, 170).createFromHTML(htmlContent).setOrigin(0, 0);
        
        this.domDeckLoaderPanel.addListener('click');
        this.domDeckLoaderPanel.on('click', (event) => {
            if (event.target.id === 'deckLoadBtn') this.handleDeckLoad();
        });
    }

    createConsoleLog() {
        this.add.text(550, 110, 'Server Response Stream (Sanitized Game State View)', { fontSize: '20px', fill: '#ffffff', fontFamily: 'monospace' });
        
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
        this.logToConsole(`>> Emitting joinTable: Table ${tableId} as ${role}`);
        this.socket.emit('joinTable', { tableId: parseInt(tableId), role });
    }

    handleLeave() {
        this.logToConsole(`>> Emitting leaveTable`);
        this.socket.emit('leaveTable');
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
    }

    logToConsole(message) {
        const textarea = document.getElementById('devLog');
        if (textarea) {
            const timestamp = new Date().toLocaleTimeString();
            textarea.value += `[${timestamp}] ${message}\n\n`;
            textarea.scrollTop = textarea.scrollHeight;
        }
    }
}
