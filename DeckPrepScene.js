class DeckPrepScene extends Phaser.Scene {
    constructor() {
        super({ key: 'DeckPrepScene' });
        this.socket = null;
        this.tableId = null;
        this.role = null;
        
        this.domInputPanel = null;
        this.parsedDeckList = [];
    }

    init(data) {
        // Capture routing context passed straight out from LobbyScene
        this.tableId = data.tableId || 1;
        this.role = data.role || 'playerA';
    }

    preload() {
        this.socket = globalSocket;
    }


    create() {
        // Charcoal space backdrop
        const bg = this.add.graphics();
        bg.fillStyle(0x0f172a, 1);
        bg.fillRect(0, 0, 1920, 1080);

        // Header Title
        this.add.text(80, 60, `🎴 DECK PREPARATION & VALIDATION (TABLE ${this.tableId} - ${this.role.toUpperCase()})`, {
            fontSize: '32px',
            fontFamily: 'monospace',
            fill: '#38bdf8',
            fontWeight: 'bold'
        });

        // Subtitle Instructions
        this.add.text(80, 110, 'Paste your standardized text decklist below to parse and register your card assets before entering the arena.', {
            fontSize: '16px',
            fontFamily: 'monospace',
            fill: '#64748b'
        });

        // Left Column: Spawn HTML Text Area Input Box via Phaser DOM Object
        this.createInputPanel();

        // Right Column Title Anchor
        this.previewHeader = this.add.text(720, 180, '📋 PARSED CARD ENTRY PREVIEW (0 CARDS)', {
            fontSize: '20px',
            fontFamily: 'monospace',
            fill: '#64748b',
            fontWeight: 'bold'
        });

        // Set up server synchronization listeners
        this.setupNetworkNoticeHandlers();
    }

    createInputPanel() {
        const htmlContent = `
            <div style="font-family: monospace; background: #1e293b; padding: 30px; border-radius: 8px; width: 560px; height: 740px; border: 1px solid #334155; box-shadow: 0px 4px 15px rgba(0,0,0,0.3); box-sizing: border-box; display: flex; flex-direction: column; gap: 20px;">
                <label style="color: #94a3b8; font-size: 16px; font-weight: bold; display: block;">Raw Decklist Input:</label>
                <textarea id="prepRawInput" placeholder="Example format:\\n2 Tactical Asset [BS1-013]\\n4 Frontline Defender [BS2-005]\\n1 Base Shield [BS10-001]" style="width: 100%; flex: 1; background: #0f172a; color: #38bdf8; font-family: monospace; font-size: 14px; border: 1px solid #475569; padding: 15px; box-sizing: border-box; resize: none; border-radius: 4px; line-height: 1.5; outline: none;"></textarea>
                
                <button id="prepParseBtn" style="width: 100%; background: #38bdf8; color: #0f172a; font-weight: bold; font-size: 16px; padding: 14px; border: none; border-radius: 4px; cursor: pointer; transition: background 0.2s;">
                    RUN DECKLIST PARSER
                </button>
            </div>
        `;

        this.domInputPanel = this.add.dom(80, 180).createFromHTML(htmlContent).setOrigin(0, 0);
        this.domInputPanel.addListener('click');
        
        this.domInputPanel.on('click', (event) => {
            if (event.target.id === 'prepParseBtn') {
                this.handleLocalParsing();
            }
        });
    }

    handleLocalParsing() {
        const textarea = document.getElementById('prepRawInput');
        if (!textarea) return;

        const rawText = textarea.value;
        if (!rawText.trim()) return;

        const lines = rawText.split('\n');
        this.parsedDeckList = [];

        // Exact pattern match extracted directly from DeveloperMode.js
        const regex = /^\s*(\d+)\s+(.*?)\s*\[([A-Za-z0-9-]+)\]/;

        lines.forEach(line => {
            const match = line.match(regex);
            if (match) {
                const count = parseInt(match[1], 10);
                const cardTitle = match[2].trim();
                const cardCode = match[3];

                for (let i = 0; i < count; i++) {
                    this.parsedDeckList.push({
                        id: cardCode,
                        title: cardTitle
                    });
                }
            }
        });

        // Trigger dynamic visual update layout pass
        this.renderPreviewGrid();
    }

    renderPreviewGrid() {
        // Destroy all previous iteration visual elements and proceed buttons to prevent memory leakage
        if (this.previewGroup) this.previewGroup.destroy(true);
        this.previewGroup = this.add.group();

        // Update Header Metric text details
        const totalCount = this.parsedDeckList.length;
        this.previewHeader.setText(`📋 PARSED CARD ENTRY PREVIEW (${totalCount} CARDS)`);
        this.previewHeader.setStyle({ fill: totalCount > 0 ? '#34d399' : '#64748b' });

        if (totalCount === 0) return;

        // Visual grid math constraints (Matches dimensions/prefixes mapped inside GameScene.js)
        const startX = 720;
        const startY = 240;
        const thumbW = 74;
        const thumbH = 104;
        const colGap = 16;
        const rowGap = 16;
        const columnsCount = 11; // Wrap grid coordinates cleanly down into new rows

        this.parsedDeckList.forEach((card, index) => {
            const col = index % columnsCount;
            const row = Math.floor(index / columnsCount);

            const x = startX + (col * (thumbW + colGap)) + thumbW / 2;
            const y = startY + (row * (thumbH + rowGap)) + thumbH / 2;

            let bundleKey = 'system_ui';
            let frameKey = 'card_back';

            // Prefix routing logic mapping perfectly to GameScene asset keys
            if (card.id.startsWith('BS1-')) bundleKey = 'BS01_cards';
            else if (card.id.startsWith('BS2-')) bundleKey = 'BS02_cards';
            else if (card.id.startsWith('BS3-')) bundleKey = 'BS03_cards';
            else if (card.id.startsWith('BS10-')) bundleKey = 'BS10_cards';
            
            if (bundleKey !== 'system_ui') frameKey = card.id;

            const thumb = this.add.image(x, y, bundleKey, frameKey);
            thumb.setDisplaySize(thumbW, thumbH);
            this.previewGroup.add(thumb);
        });

        // Dynamic y positioning calculated relative to layout box height density bounds
        const proceedY = Math.max(760, startY + (Math.ceil(totalCount / columnsCount) * (thumbH + rowGap)) + 40);
        
        const proceedBtn = this.add.text(720, proceedY, '🚀 VALIDATE & PROCEED TO ARENA', {
            fontSize: '18px',
            fontFamily: 'monospace',
            fill: '#0f172a',
            backgroundColor: '#34d399',
            fontWeight: 'bold',
            padding: { x: 30, y: 15 }
        }).setInteractive({ useHandCursor: true });

        this.previewGroup.add(proceedBtn);

        proceedBtn.on('pointerdown', () => {
            this.executeServerDeployment();
        });
    }

    executeServerDeployment() {
        console.log(`📤 [DECK PREP]: Dispatching ${this.parsedDeckList.length} cards to Table ${this.tableId}`);
        
        // 1. Commit raw deck configuration structure array into authoritative server room state
        this.socket.emit('loadDeck', {
            tableId: this.tableId,
            targetPlayer: this.role,
            deckList: this.parsedDeckList
        });

        // 2. Fire immediate scramble sequence to randomize the array
        this.socket.emit('shuffleDeck', {
            tableId: this.tableId,
            targetPlayer: this.role
        });

        // 3. AUTOMATED OPENING SETUP: Command server to pop 6 cards straight into the hand array
        this.socket.emit('draw6Cards', {
            tableId: this.tableId,
            targetPlayer: this.role
        });
    }

    setupNetworkNoticeHandlers() {
        // Watch server feedback logs to intercept confirmation ticks safely
        this.socket.on('serverNotice', (msg) => {
            if (msg.includes('shuffled successfully')) {
                console.log('🔄 [DECK PREP SUCCESS]: Handshakes verified. Disconnecting local listeners and routing client.');
                
                // Clear active listener instance to avoid processing cross-scene artifacts
                this.socket.off('serverNotice');
                
                // Launch the arena terminal canvas map room
                this.scene.start('GameScene', {
                    tableId: this.tableId,
                    role: this.role
                });
            }
        });
    }
}
