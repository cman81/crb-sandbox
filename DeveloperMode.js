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
        
        this.createHandMappingTablePanel();

        this.setupSocketListeners();
        this.setupCrossTabSynchronizer();

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
            <div style="color: white; font-family: monospace; font-size: 16px; background: #222; padding: 25px; border-radius: 8px; width: 460px; height: 620px; border: 1px solid #444; box-shadow: 0px 4px 15px rgba(0,0,0,0.5); box-sizing: border-box;">
                <h3 style="margin-top:0; color:#00ff00; font-size: 22px; margin-bottom: 12px;">2. Game Setup Panel</h3>
                
                <div style="margin-bottom: 15px; display: flex; justify-content: space-between;">
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

                <label style="display:block; margin-bottom:4px; font-size:14px;">Paste Raw Decklist Below:</label>
                <textarea id="deckRawInput" placeholder="2 Adventurer Cookie [ST1-013]..." style="width:100%; height:140px; background:#111; color:#fff; font-family:monospace; font-size:13px; border:1px solid #555; padding:8px; box-sizing:border-box; resize:none; border-radius: 4px;"></textarea>
                <button id="deckLoadBtn" style="margin-top:10px; width:100%; background:#00ff00; color:#000; font-weight:bold; font-size:15px; padding:10px; border:none; border-radius:4px; cursor:pointer;">LOAD DECKLIST</button>


                <!-- SETUP & BOARD PREPARATION TRAY -->
                <div style="margin-top: 15px; background: #1a1a1a; padding: 12px; border-radius: 6px; border: 1px solid #555; display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; gap: 8px;">
                        <button id="deckShuffleBtn" style="flex: 1; background:#ffff00; color:#000; font-weight:bold; font-size:13px; padding:8px; border:none; border-radius:4px; cursor:pointer;">⚡ SHUFFLE</button>
                        <button id="setupDraw6Btn" style="flex: 1; background:#00ff88; color:#000; font-weight:bold; font-size:13px; padding:8px; border:none; border-radius:4px; cursor:pointer;">🎴 DRAW 6</button>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <label style="font-size: 12px; color: #aaa;">Hand Pos:</label>
                        <input type="number" id="playHandIdx" min="0" value="0" style="width: 45px; background: #333; color: #fff; border: 1px solid #555; padding: 6px; border-radius: 4px;">
                        <button id="setupPlayDownBtn" style="flex: 1; background:#00ffff; color:#000; font-weight:bold; font-size:12px; padding:8px; border:none; border-radius:4px; cursor:pointer;">⬇️ PLAY FACE DOWN</button>
                    </div>
                    <div>
                        <button id="setupFlipUpBtn" style="width:100%; background:#ff00ea; color:#fff; font-weight:bold; font-size:12px; padding:8px; border:none; border-radius:4px; cursor:pointer;">👁️ FLIP FACE UP</button>
                    </div>
                </div>
            </div>
        `;
        
        this.domDeckLoaderPanel = this.add.dom(50, 170).createFromHTML(htmlContent).setOrigin(0, 0);
        
        this.domDeckLoaderPanel.addListener('click');
        this.domDeckLoaderPanel.on('click', (event) => {
            if (event.target.id === 'deckLoadBtn') this.handleDeckLoad();
            if (event.target.id === 'deckShuffleBtn') this.handleDeckShuffle();
            if (event.target.id === 'setupDraw6Btn') this.handleDraw6Cards();
            if (event.target.id === 'setupPlayDownBtn') this.handlePlayCardFaceDown();
            if (event.target.id === 'setupFlipUpBtn') this.handleFlipCardFaceUp();
        });
    }

    createConsoleLog() {
        this.logTitleText = this.add.text(550, 170, '📢 SERVER RESPONSE STREAM (PERSPECTIVE: UNBOUND LOBBY)', { 
            fontSize: '18px', fill: '#00ff00', fontFamily: 'monospace', fontWeight: 'bold' 
        });
        
        const logHtml = `
            <textarea id="devLog" readonly style="width: 960px; height: 560px; background-color: #050505; color: #33ff33; font-family: 'Courier New', monospace; font-size: 16px; border: 1px solid #33ff33; padding: 15px; border-radius: 8px; resize: none; box-shadow: inset 0 0 10px #000; box-sizing: border-box;"></textarea>
        `;
        this.domLog = this.add.dom(550, 200).createFromHTML(logHtml).setOrigin(0, 0);
    }

    createStateInspectorPanel() {
        const htmlContent = `
            <div style="color: white; font-family: monospace; font-size: 16px; background: #151c24; padding: 20px; border-radius: 8px; width: 960px; border: 1px solid #00ff00; box-shadow: 0px 4px 15px rgba(0,0,0,0.7); box-sizing: border-box; display: flex; align-items: center; justify-content: space-between;">
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

        this.domInspectorPanel = this.add.dom(550, 780).createFromHTML(htmlContent).setOrigin(0, 0);

        this.domInspectorPanel.addListener('click');
        this.domInspectorPanel.on('click', (event) => {
            if (event.target.id === 'inspectGetStateBtn') this.handleGetGameState();
        });
    }

    createHandMappingTablePanel() {
        // Render a dedicated label anchor directly above Column 3
        this.add.text(1550, 170, '📋 HAND MATRIX', {
            fontSize: '18px', fill: '#ffff00', fontFamily: 'monospace', fontWeight: 'bold'
        });

        const htmlContent = `
            <div style="color: white; font-family: monospace; font-size: 14px; background: #1a1a1a; padding: 20px; border-radius: 8px; width: 320px; height: 640px; border: 1px solid #444; box-shadow: 0px 4px 15px rgba(0,0,0,0.5); box-sizing: border-box; overflow-y: auto;">
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="border-bottom: 2px solid #555; color: #aaa; font-size: 12px;">
                            <th style="padding: 6px; width: 90px;">POSITION</th>
                            <th style="padding: 6px;">CARD ID</th>
                        </tr>
                    </thead>
                    <tbody id="handMatrixBody">
                        <tr><td colspan="2" style="padding: 20px; text-align: center; color: #666; font-style: italic;">[No Hand Data Loaded]</td></tr>
                    </tbody>
                </table>
            </div>
        `;

        // Placed as the third column (X: 1550, Y: 200) running flush with the main response log box height bounds
        this.domHandMatrixPanel = this.add.dom(1550, 200).createFromHTML(htmlContent).setOrigin(0, 0);
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
        
        // Regex Breakdown:
        // ^\s*(\d+)   -> Group 1: Captures the starting quantity number
        // \s+(.*?)    -> Group 2: Captures the title text string lazily
        // \s*\[([A-Za-z0-9-]+)\] -> Group 3: Captures the bracketed alphanumeric code
        const regex = /^\s*(\d+)\s+(.*?)\s*\[([A-Za-z0-9-]+)\]/;

        lines.forEach(line => {
            const match = line.match(regex);
            if (match) {
                const count = parseInt(match[1], 10);
                const cardTitle = match[2].trim(); // Clean trailing spaces from the title name
                const cardCode = match[3];

                for (let i = 0; i < count; i++) {
                    // Push an object holding both parameters instead of just a raw string ID primitive
                    processedDeck.push({
                        id: cardCode,
                        title: cardTitle
                    });
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

    refreshHandMatrixTable(handArray) {
        const tbody = document.getElementById('handMatrixBody');
        if (!tbody) return;

        // Clear previous rows completely
        tbody.innerHTML = "";

        // Account for an empty set safely
        if (!handArray || handArray.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="2" style="padding: 20px; text-align: center; color: #ff3333; font-weight: bold; background: rgba(255,0,0,0.05);">
                        ⚠️ [HAND IS COMPLETELY EMPTY]
                    </td>
                </tr>
            `;
            return;
        }

        // Loop and build fresh index elements sequentially
        handArray.forEach((card, index) => {
            // Check if card identity is protected under fog-of-war masking rules
            let displayId = "🚫 [CARD BACK - HIDDEN]";
            const rowColor = card.name === "Card Back" ? "#ffaa00" : "#00ff88";

            // If the card is unmasked and possesses a title string parameter, combine them cleanly!
            if (card.name !== "Card Back") {
                displayId = card.title ? `${card.title} [${card.id}]` : card.id;
            }

            const rowHtml = `
                <tr style="border-bottom: 1px solid #333; font-size: 13px;">
                    <td style="padding: 6px 4px; font-weight: bold; color: #aaa;">Index ${index}</td>
                    <td style="padding: 6px 4px; color: ${rowColor}; font-weight: bold;">${displayId}</td>
                </tr>
            `;
            tbody.innerHTML += rowHtml;
        });
    }

    setupSocketListeners() {
        this.socket.on('stateUpdate', (sanitizedState) => {
            this.logToConsole(`[RECEIVED stateUpdate]:\n${JSON.stringify(sanitizedState, null, 2)}`);
            
            // ADD THESE LINES: Identify who we are looking at to populate the matrix table dynamically
            const activeTargetPlayer = document.getElementById('actionTargetPlayer')?.value || 'playerA';
            const handData = sanitizedState[activeTargetPlayer]?.hand || [];
            this.refreshHandMatrixTable(handData);
        });
        
        this.socket.on('errorMsg', (msg) => {
            this.logToConsole(`[SERVER ERROR]: ${msg}`);
        });

        this.socket.on('serverNotice', (msg) => {
            this.logToConsole(`[SERVER SUCCESS]: ${msg}`);
            
            // ADD THESE LINES: Automatically pull fresh state after a draw/discard to sync matrix view
            const tableId = document.getElementById('actionTableId')?.value;
            const targetPlayer = document.getElementById('actionTargetPlayer')?.value;
            if (tableId && targetPlayer) {
                this.socket.emit('getGameState', { tableId: parseInt(tableId), role: targetPlayer });
            }
        });

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

        this.socket.on('cardStackedUpdate', (stackEvent) => {
            const isOwner = this.myActiveRole === stackEvent.targetPlayer;
            const isSpectator = this.myActiveRole === 'spectator';
            
            let perceptionTag = "[ENEMY VISION]";
            if (isOwner) perceptionTag = "[YOUR STACK VISION]";
            if (isSpectator) perceptionTag = "[SPECTATOR X-RAY VISION]";

            this.logToConsole(`[LIVE STACK EVENT] ${perceptionTag}
Player ${stackEvent.targetPlayer} added a card to the stack next to ${stackEvent.targetSlot}. 
Your Visible Card Data: ${JSON.stringify(stackEvent.card)}
Current Stack Total Count: ${stackEvent.stackCount}
Remaining Deck Count: ${stackEvent.deckCount}`);
        });

        this.socket.on('cardPlayedToSupportUpdate', (playEvent) => {
            this.logToConsole(`[LIVE FIELD EVENT] [PUBLIC ZONE REVEAL]
Player ${playEvent.targetPlayer} played a card face up into the support lane!
Card Data: ${JSON.stringify(playEvent.card)}
Support Lane Total Count: ${playEvent.supportCount}
Remaining Hand Count: ${playEvent.handCount}`);
        });

        this.socket.on('cardTapUpdated', (tapEvent) => {
            const contextLoc = tapEvent.zone === 'support' ? `support lane position index ${tapEvent.supportIndex}` : `${tapEvent.zone} active slot`;
            this.logToConsole(`[LIVE ORIENTATION EVENT]
Player ${tapEvent.targetPlayer}'s card located in ${contextLoc} is now: ${tapEvent.isTapped ? '🚨 TAPPED (RESTING)' : '🟢 UNTAPPED (ACTIVE)'}`);
        });

        this.socket.on('cardPlayedToFighterUpdate', (playEvent) => {
            this.logToConsole(`[LIVE FIELD EVENT] [PUBLIC SLOT REVEAL]
Player ${playEvent.targetPlayer} played a card face up into active field position: ${playEvent.targetSlot}!
Card Data: ${JSON.stringify(playEvent.card)}
Remaining Hand Count: ${playEvent.handCount}`);
        });

        this.socket.on('cardMovedToDefeatedZone', (moveEvent) => {
            this.logToConsole(`[LIVE FIELD EVENT] [CARD RETIRED]
Player ${moveEvent.targetPlayer}'s fighter card in ${moveEvent.slot} has been moved to the public Defeated Area!
Retired Card details: ${JSON.stringify(moveEvent.card)}
Defeated Pile Total Count: ${moveEvent.defeatedCount}`);
        });

        this.socket.on('defeatedPointsTickedUpdate', (scoreEvent) => {
            let limitNotice = "";
            if (scoreEvent.isEliminated) {
                limitNotice = `\n⚠️ ELIMINATION MARGIN REACHED: PLAYER ${scoreEvent.targetPlayer.toUpperCase()} HAS HIT 10+ DEFEATED POINTS AND LOSE!`;
            }
            this.logToConsole(`[LIVE METRIC EVENT] [SCORE TICKED]
Player ${scoreEvent.targetPlayer}'s Defeated Points level updated!
Current Total: ${scoreEvent.totalDefeatedPoints} / 10 pts${limitNotice}`);
        });

        this.socket.on('cardDiscardedUpdate', (discardEvent) => {
            this.logToConsole(`[LIVE DISCARD EVENT] [PUBLIC PILE REVEAL]
Player ${discardEvent.targetPlayer} discarded a card from their hand!
Card Details: ${JSON.stringify(discardEvent.card)}
Discard Pile Total Count: ${discardEvent.discardCount}
Remaining Hand Count: ${discardEvent.handCount}`);
        });

        this.socket.on('handToDeckUpdate', (deckEvent) => {
            this.logToConsole(`[LIVE RECYCLE EVENT] [BLIND TRACK DEPLOY]
Player ${deckEvent.targetPlayer} put a card face down back into their deck at the ${deckEvent.location.toUpperCase()} position!
Your Visible Card Data: ${JSON.stringify(deckEvent.card)}
Deck Pile Total Count: ${deckEvent.deckCount}
Remaining Hand Count: ${deckEvent.handCount}`);
        });

        this.socket.on('stackFlippedAndDiscardedUpdate', (discardEvent) => {
            this.logToConsole(`[LIVE REVEAL EVENT] [PUBLIC PILE REVEAL]
Player ${discardEvent.targetPlayer} peeled the top card off their ${discardEvent.targetSlot} stack and flipped it face up into the discard pile!
Revealed Card Data: ${JSON.stringify(discardEvent.card)}
Current Remaining Stack Count: ${discardEvent.stackCount}
Discard Pile Total Count: ${discardEvent.discardCount}`);
        });

        this.socket.on('discardRecycledUpdate', (recycleEvent) => {
            this.logToConsole(`[LIVE FIELD EVENT] [PILE RECOVERY COMPLETE]
Player ${recycleEvent.targetPlayer} moved ALL cards from their discard pile face down back into their deck, and the deck was fully reshuilled!
Current Deck Pile Total Count: ${recycleEvent.deckCount}
Remaining Discard Pile Count: ${recycleEvent.discardCount}`);
        });

        this.socket.on('discardToDefeatedUpdate', (defeatEvent) => {
            this.logToConsole(`[LIVE FIELD EVENT] [DISCARD RETIRED]
Player ${defeatEvent.targetPlayer} retired a card directly out of their discard pile into the defeated zone!
Retired Card details: ${JSON.stringify(defeatEvent.card)}
Remaining Discard Pile Count: ${defeatEvent.discardCount}
Defeated Pile Total Count: ${defeatEvent.defeatedCount}`);
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
            <div style="color: white; font-family: monospace; font-size: 16px; background: #222; padding: 25px; border-radius: 8px; width: 460px; height: 600px; border: 1px solid #444; box-shadow: 0px 4px 15px rgba(0,0,0,0.5); box-sizing: border-box; display: flex; flex-direction: column; gap: 10px;">
                <h3 style="margin-top:0; color:#00ff00; font-size: 22px; margin-bottom: 2px;">3. Game Actions</h3>
                
                <div style="display: flex; justify-content: space-between;">
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

                <!-- DRAWS & DECK STACKING -->
                <div style="background: #1a1a1a; padding: 10px; border-radius: 6px; border: 1px solid #444; display: flex; flex-direction: column; gap: 8px;">
                    <button id="actionDrawBtn" style="width:100%; background:#00ff00; color:#000; font-weight:bold; font-size:12px; padding:6px; border:none; border-radius:4px; cursor:pointer;">🎴 DRAW 1 CARD</button>
                    
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                        <label style="font-size:12px; color:#00ffff; font-weight:bold;">Target Stack:</label>
                        <select id="actionStackSlot" style="width:110px; background:#333; color:#fff; border:1px solid #555; padding:5px; border-radius: 4px; font-size:12px;">
                            <option value="fighterA">Fighter A</option>
                            <option value="fighterB">Fighter B</option>
                        </select>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button id="actionStackTopDeckBtn" style="flex: 1; background:#00ffff; color:#000; font-weight:bold; font-size:11px; padding:8px; border:none; border-radius:4px; cursor:pointer;">⬇️ STACK CARD</button>
                        <button id="actionFlipDiscardBtn" style="flex: 1; background:#ffaa00; color:#000; font-weight:bold; font-size:11px; padding:8px; border:none; border-radius:4px; cursor:pointer;">🔥 FLIP & DISC</button>
                    </div>
                </div>

                <!-- HAND OPERATIONS -->
                <div style="background: #1a1a1a; padding: 8px; border-radius: 6px; border: 1px solid #444; display: flex; flex-direction: column; gap: 6px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <label style="font-size:11px; color:#ffff00; font-weight:bold; flex: 1;">Hand Operations:</label>
                        <label style="font-size:11px; color:#aaa;">Pos:</label>
                        <input type="number" id="actionHandIdx" min="0" value="0" style="width: 40px; background: #333; color: #fff; border: 1px solid #555; padding: 4px; border-radius: 4px;">
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button id="actionPlaySupportBtn" style="flex:1; background:#ffff00; color:#000; font-weight:bold; font-size:11px; padding:5px; border:none; border-radius:4px; cursor:pointer;">🛡️ SUPPORT</button>
                        <button id="actionDiscardBtn" style="flex:1; background:#aaaaaa; color:#000; font-weight:bold; font-size:11px; padding:5px; border:none; border-radius:4px; cursor:pointer;">🗑️ DISCARD</button>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button id="actionPlayFighterABtn" style="flex:1; background:#ff8800; color:#000; font-weight:bold; font-size:11px; padding:5px; border:none; border-radius:4px; cursor:pointer;">⚔️ FIGHTER A</button>
                        <button id="actionPlayFighterBBtn" style="flex:1; background:#ff5500; color:#fff; font-weight:bold; font-size:11px; padding:5px; border:none; border-radius:4px; cursor:pointer;">⚔️ FIGHTER B</button>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button id="actionToTopDeckBtn" style="flex:1; background:#00ff88; color:#000; font-weight:bold; font-size:10px; padding:5px; border:none; border-radius:4px; cursor:pointer;">🔝 TO TOP DECK</button>
                        <button id="actionToBottomDeckBtn" style="flex:1; background:#00aa66; color:#fff; font-weight:bold; font-size:10px; padding:5px; border:none; border-radius:4px; cursor:pointer;">🔙 TO BOT DECK</button>
                    </div>
                </div>

                <!-- DISCARD OPERATIONAL CONTROLLER PANELS -->
                <div style="background: #1a1a1a; padding: 10px; border-radius: 6px; border: 1px solid #00ffcc; display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <label style="font-size:12px; color:#00ffcc; font-weight:bold; flex: 1;">Discard Operations:</label>
                        <label style="font-size:11px; color:#aaa;">Pos:</label>
                        <input type="number" id="actionDiscardIdx" min="0" value="0" style="width: 44px; background: #333; color: #fff; border: 1px solid #555; padding: 4px; border-radius: 4px;">
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button id="actionDiscardToDefeatedBtn" style="flex:1; background:#ff3333; color:#fff; font-weight:bold; font-size:11px; padding:6px; border:none; border-radius:4px; cursor:pointer;">❌ DISC TO DEFEATED</button>
                        <button id="actionRecycleDiscardBtn" style="flex:1; background:#00ffcc; color:#000; font-weight:bold; font-size:11px; padding:6px; border:none; border-radius:4px; cursor:pointer;">♻️ DISC TO DECK</button>
                    </div>
                </div>

                <!-- DECOUPLING CONTROLLERS -->
                <div style="background: #1a1a1a; padding: 8px; border-radius: 6px; border: 1px solid #ff3333; display: flex; flex-direction: column; gap: 6px;">
                    <div style="display: flex; gap: 6px;">
                        <button id="actionDefeatABtn" style="flex: 1; background:#ff3333; color:#fff; font-weight:bold; font-size:11px; padding:5px; border:none; border-radius:4px; cursor:pointer;">DEFEAT A</button>
                        <button id="actionDefeatBBtn" style="flex: 1; background:#ff3333; color:#fff; font-weight:bold; font-size:11px; padding:5px; border:none; border-radius:4px; cursor:pointer;">DEFEAT B</button>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button id="actionDefeatPlus1Btn" style="flex: 1; background:#00ff88; color:#000; font-weight:bold; font-size:11px; padding:5px; border:none; border-radius:4px; cursor:pointer;">DEFEAT +1</button>
                        <button id="actionDefeatMinus1Btn" style="flex: 1; background:#ffaa00; color:#000; font-weight:bold; font-size:11px; padding:5px; border:none; border-radius:4px; cursor:pointer;">DEFEAT -1</button>
                    </div>
                </div>

                <!-- TAPPING SYSTEM -->
                <div style="background: #1a1a1a; padding: 6px; border-radius: 6px; border: 1px solid #ffff00; display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size:11px;">
                        <select id="tapZoneSelect" style="width:100px; background:#333; color:#fff; border:1px solid #555; padding:3px; border-radius: 4px;">
                            <option value="fighterA">Fighter A</option>
                            <option value="fighterB">Fighter B</option>
                            <option value="support">Support</option>
                        </select>
                        <label>Idx:</label>
                        <input type="number" id="tapSupportIdx" min="0" value="0" style="width: 35px; background: #333; color: #fff; border: 1px solid #555; padding: 3px; border-radius: 4px;">
                        <button id="actionToggleTapBtn" style="background:#ffff00; color:#000; font-weight:bold; padding:4px 8px; border:none; border-radius:4px; cursor:pointer;">🔄 TAP</button>
                    </div>
                </div>
            </div>
        `;

        this.domGameActionsPanel = this.add.dom(50, 170).createFromHTML(htmlContent).setOrigin(0, 0);
        
        this.domGameActionsPanel.addListener('click');
        this.domGameActionsPanel.on('click', (event) => {
            if (event.target.id === 'actionDrawBtn') this.handleDrawCard();
            if (event.target.id === 'actionRecycleDiscardBtn') this.handleRecycleDiscard();
            if (event.target.id === 'actionDiscardToDefeatedBtn') this.handleDiscardToDefeated();
            if (event.target.id === 'actionStackTopDeckBtn') this.handlePlaceDeckToStack();
            if (event.target.id === 'actionFlipDiscardBtn') this.handleFlipAndDiscardFromStack();
            if (event.target.id === 'actionPlaySupportBtn') this.handlePlayToSupport();
            if (event.target.id === 'actionDiscardBtn') this.handleDiscardFromHand();
            if (event.target.id === 'actionPlayFighterABtn') this.handlePlayToFighter('fighterA');
            if (event.target.id === 'actionPlayFighterBBtn') this.handlePlayToFighter('fighterB');
            if (event.target.id === 'actionToggleTapBtn') this.handleToggleTapEmit();
            if (event.target.id === 'actionDefeatABtn') this.handleMoveToDefeatedEmit('fighterA');
            if (event.target.id === 'actionDefeatBBtn') this.handleMoveToDefeatedEmit('fighterB');
            if (event.target.id === 'actionDefeatPlus1Btn') this.handleScoreAdjustmentEmit(1);
            if (event.target.id === 'actionDefeatMinus1Btn') this.handleScoreAdjustmentEmit(-1);
            if (event.target.id === 'actionToTopDeckBtn') this.handlePlayToDeckEmit('top');
            if (event.target.id === 'actionToBottomDeckBtn') this.handlePlayToDeckEmit('bottom');
        });
    }

    handleDrawCard() {
        const tableId = document.getElementById('actionTableId').value;
        const targetPlayer = document.getElementById('actionTargetPlayer').value;

        this.logToConsole(`>> Emitting drawCard: Table ${tableId} for ${targetPlayer}`);
        this.socket.emit('drawCard', { tableId: parseInt(tableId), targetPlayer });
    }

    handleDraw6Cards() {
        const tableId = document.getElementById('deckTableId').value;
        const targetPlayer = document.getElementById('deckTargetPlayer').value;
        this.logToConsole(`>> Emitting draw6Cards: Table ${tableId} for ${targetPlayer}`);
        this.socket.emit('draw6Cards', { tableId: parseInt(tableId), targetPlayer });
    }

    handlePlayCardFaceDown() {
        const tableId = document.getElementById('deckTableId').value;
        const targetPlayer = document.getElementById('deckTargetPlayer').value;
        const handIndex = document.getElementById('playHandIdx').value;

        this.logToConsole(`>> Emitting playCardFaceDown: Table ${tableId} to fighterA slot using card at hand index ${handIndex} for ${targetPlayer}`);
        this.socket.emit('playCardFaceDown', { tableId: parseInt(tableId), targetPlayer, handIndex: parseInt(handIndex) });
    }

    handleFlipCardFaceUp() {
        const tableId = document.getElementById('deckTableId').value;
        const targetPlayer = document.getElementById('deckTargetPlayer').value;
        this.logToConsole(`>> Emitting flipCardFaceUp: Table ${tableId} fighterA slot for ${targetPlayer}`);
        this.socket.emit('flipCardFaceUp', { tableId: parseInt(tableId), targetPlayer });
    }

    handlePlaceDeckToStack() {
        const tableId = document.getElementById('actionTableId').value;
        const targetPlayer = document.getElementById('actionTargetPlayer').value;
        const targetSlot = document.getElementById('actionStackSlot').value;

        this.logToConsole(`>> Emitting placeDeckCardToStack: Table ${tableId} moving top deck card to ${targetPlayer}'s ${targetSlot} stack.`);
        this.socket.emit('placeDeckCardToStack', { tableId: parseInt(tableId), targetPlayer, targetSlot });
    }

    handlePlayToSupport() {
        const tableId = document.getElementById('actionTableId').value;
        const targetPlayer = document.getElementById('actionTargetPlayer').value;
        const handIndex = document.getElementById('actionHandIdx').value;

        this.logToConsole(`>> Emitting playCardToSupport: Table ${tableId} moving card at hand index ${handIndex} to support lane for ${targetPlayer}.`);
        this.socket.emit('playCardToSupport', { tableId: parseInt(tableId), targetPlayer, handIndex: parseInt(handIndex) });
    }

    handleToggleTapEmit() {
        const tableId = document.getElementById('actionTableId').value;
        const targetPlayer = document.getElementById('actionTargetPlayer').value;
        const zone = document.getElementById('tapZoneSelect').value;
        const supportIndex = document.getElementById('tapSupportIdx').value;

        this.logToConsole(`>> Emitting toggleCardTap: Table ${tableId} shifting card state in ${zone} for ${targetPlayer}.`);
        this.socket.emit('toggleCardTap', { tableId: parseInt(tableId), targetPlayer, zone, supportIndex: parseInt(supportIndex) });
    }

    handlePlayToFighter(slotName) {
        const tableId = document.getElementById('actionTableId').value;
        const targetPlayer = document.getElementById('actionTargetPlayer').value;
        const handIndex = document.getElementById('actionHandIdx').value;

        this.logToConsole(`>> Emitting playCardToFighter: Table ${tableId} moving card at hand index ${handIndex} to ${slotName} for ${targetPlayer}.`);
        this.socket.emit('playCardToFighter', { tableId: parseInt(tableId), targetPlayer, handIndex: parseInt(handIndex), targetSlot: slotName });
    }

    handleMoveToDefeatedEmit(slotName) {
        const tableId = document.getElementById('actionTableId').value;
        const targetPlayer = document.getElementById('actionTargetPlayer').value;

        this.logToConsole(`>> Emitting moveFighterToDefeated: Table ${tableId} moving card in ${slotName} for ${targetPlayer} to defeated pile zone.`);
        this.socket.emit('moveFighterToDefeated', { tableId: parseInt(tableId), targetPlayer, slot: slotName });
    }

    handleScoreAdjustmentEmit(pointDelta) {
        const tableId = document.getElementById('actionTableId').value;
        const targetPlayer = document.getElementById('actionTargetPlayer').value;

        this.logToConsole(`>> Emitting adjustDefeatedPoints: Table ${tableId} shifting ${targetPlayer}'s points value by: ${pointDelta}.`);
        this.socket.emit('adjustDefeatedPoints', { tableId: parseInt(tableId), targetPlayer, amount: pointDelta });
    }

    handleDiscardFromHand() {
        const tableId = document.getElementById('actionTableId').value;
        const targetPlayer = document.getElementById('actionTargetPlayer').value;
        const handIndex = document.getElementById('actionHandIdx').value;

        this.logToConsole(`>> Emitting discardCardFromHand: Table ${tableId} shifting card at hand index ${handIndex} to discard pile for ${targetPlayer}.`);
        this.socket.emit('discardCardFromHand', { tableId: parseInt(tableId), targetPlayer, handIndex: parseInt(handIndex) });
    }

    handlePlayToDeckEmit(deckLocation) {
        const tableId = document.getElementById('actionTableId').value;
        const targetPlayer = document.getElementById('actionTargetPlayer').value;
        const handIndex = document.getElementById('actionHandIdx').value;

        const eventName = deckLocation === 'top' ? 'playHandToTopDeck' : 'playHandToBottomDeck';
        this.logToConsole(`>> Emitting ${eventName}: Table ${tableId} recycling card at hand index ${handIndex} to deck ${deckLocation}.`);
        this.socket.emit(eventName, { tableId: parseInt(tableId), targetPlayer, handIndex: parseInt(handIndex) });
    }

    handleFlipAndDiscardFromStack() {
        const tableId = document.getElementById('actionTableId').value;
        const targetPlayer = document.getElementById('actionTargetPlayer').value;
        const targetSlot = document.getElementById('actionStackSlot').value;

        this.logToConsole(`>> Emitting flipAndDiscardFromStack: Table ${tableId} peeling top card from ${targetPlayer}'s ${targetSlot} stack.`);
        this.socket.emit('flipAndDiscardFromStack', { tableId: parseInt(tableId), targetPlayer, targetSlot });
    }

    handleRecycleDiscard() {
        const tableId = document.getElementById('actionTableId').value;
        const targetPlayer = document.getElementById('actionTargetPlayer').value;
        this.logToConsole(`>> Emitting recycleDiscardToDeck: Table ${tableId} recycling discard pile for ${targetPlayer}.`);
        this.socket.emit('recycleDiscardToDeck', { tableId: parseInt(tableId), targetPlayer });
    }

    handleDiscardToDefeated() {
        const tableId = document.getElementById('actionTableId').value;
        const targetPlayer = document.getElementById('actionTargetPlayer').value;
        const discardIndex = document.getElementById('actionDiscardIdx').value;

        this.logToConsole(`>> Emitting moveDiscardToDefeated: Table ${tableId} moving card at discard index ${discardIndex} to defeated zone for ${targetPlayer}.`);
        this.socket.emit('moveDiscardToDefeated', { tableId: parseInt(tableId), targetPlayer, discardIndex: parseInt(discardIndex) });
    }

    setupCrossTabSynchronizer() {
        // Collect all Table ID input references across your panels
        const tableInputs = ['devTableId', 'deckTableId', 'actionTableId', 'inspectTableId'];
        
        // Loop through each element ID and bind real-time input mirroring listeners
        tableInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', (event) => {
                    const newValue = event.target.value;
                    tableInputs.forEach(targetId => {
                        const targetEl = document.getElementById(targetId);
                        if (targetEl && targetEl.value !== newValue) {
                            targetEl.value = newValue;
                        }
                    });
                });
            }
        });

        // Sync logic for Player A / Player B roles and targeting slots
        const roleSelectors = ['devRole', 'deckTargetPlayer', 'actionTargetPlayer', 'inspectRole'];

        roleSelectors.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', (event) => {
                    const chosenRole = event.target.value;
                    
                    // If Spectator is selected on Tab 1 or the Inspector, ignore the player slot sync
                    if (chosenRole === 'spectator') return;

                    roleSelectors.forEach(targetId => {
                        const targetEl = document.getElementById(targetId);
                        if (targetEl) {
                            // Map 'playerA' or 'playerB' choices uniformly across all select boxes
                            if (targetEl.querySelector(`option[value="${chosenRole}"]`)) {
                                targetEl.value = chosenRole;
                            }
                        }
                    });
                });
            }
        });

        // Append this inside the very bottom of your setupCrossTabSynchronizer() method:
        const masterTableInput = document.getElementById('actionTableId');
        const masterPlayerDropdown = document.getElementById('actionTargetPlayer');

        const forceMatrixSync = () => {
            if (masterTableInput && masterPlayerDropdown && masterTableInput.value) {
                // Silently request a localized update from the server to refresh your matrix rows
                this.socket.emit('getGameState', { 
                    tableId: parseInt(masterTableInput.value), 
                    role: masterPlayerDropdown.value 
                });
            }
        };

        if (masterTableInput) masterTableInput.addEventListener('input', forceMatrixSync);
        if (masterPlayerDropdown) masterPlayerDropdown.addEventListener('change', forceMatrixSync);
    }

}
