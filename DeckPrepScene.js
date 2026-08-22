class DeckPrepScene extends Phaser.Scene {
    constructor() {
        super({ key: 'DeckPrepScene' });
        this.socket = null;
        this.tableId = null;
        this.role = null;
        
        this.domInputPanel = null;
        this.parsedDeckList = [];
        this.parsedExtraDeckList = [];
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
        
        // Split visual headers for preview grid sections
        this.previewHeader = this.add.text(720, 150, "📋 MAIN DECK PREVIEW (0 CARDS)", { fontSize: "18px", fontFamily: "monospace", fill: "#64748b", fontWeight: "bold" });
        this.extraPreviewHeader = this.add.text(720, 600, "🎴 EXTRA DECK PREVIEW (0 CARDS)", { fontSize: "18px", fontFamily: "monospace", fill: "#64748b", fontWeight: "bold" });
        
        this.setupNetworkNoticeHandlers();
    }
    createInputPanel() {
        const htmlContent = `
            <div style="font-family: monospace; background: #1e293b; padding: 30px; border-radius: 8px; width: 560px; height: 740px; border: 1px solid #334155; box-shadow: 0px 4px 15px rgba(0,0,0,0.3); box-sizing: border-box; display: flex; flex-direction: column; gap: 20px;">
                <label style="color: #94a3b8; font-size: 16px; font-weight: bold; display: block;">Raw Decklist Input:</label>
                <textarea id="prepRawInput" placeholder="~~Decklist~~\\n3 Card A [BS1-013]\\n\\n~~Extra~~\\n1 Card B [BS8-005]" style="width: 100%; flex: 1; background: #0f172a; color: #38bdf8; font-family: monospace; font-size: 14px; border: 1px solid #475569; padding: 15px; box-sizing: border-box; resize: none; border-radius: 4px; line-height: 1.5; outline: none;"></textarea>
                
                <button id="prepParseBtn" style="width: 100%; background: #38bdf8; color: #0f172a; font-weight: bold; font-size: 16px; padding: 14px; border: none; border-radius: 4px; cursor: pointer; transition: background 0.2s;">
                    RUN DECKLIST PARSER
                </button>
            </div>
        `;
        this.domInputPanel = this.add.dom(80, 180).createFromHTML(htmlContent).setOrigin(0, 0);
        this.domInputPanel.addListener("click");
        this.domInputPanel.on("click", event => {
            if (event.target.id === "prepParseBtn") {
                this.handleLocalParsing();
            }
        });
    }
    
    handleLocalParsing() {
        const textarea = document.getElementById("prepRawInput");
        if (!textarea) return;
        const rawText = textarea.value;
        if (!rawText.trim()) return;
        
        const lines = rawText.split("\n");
        this.parsedDeckList = [];
        this.parsedExtraDeckList = [];
        
        // Parser state machine setup variable
        let currentTargetZone = "main";
        const regex = /^\s*(\d+)\s+(.*?)\s*\[([A-Za-z0-9-]+)\]/;
        
        lines.forEach(line => {
            const cleanLine = line.trim();
            if (!cleanLine) return;
            
            const lowerLine = cleanLine.toLowerCase();
            if (lowerLine.includes("decklist")) {
                currentTargetZone = "main";
                return;
            }
            if (lowerLine.includes("extra")) {
                currentTargetZone = "extra";
                return;
            }
            
            const match = cleanLine.match(regex);
            if (match) {
                const count = parseInt(match[1], 10);
                const cardTitle = match[2].trim();
                const cardCode = match[3].trim();
                
                if (!isNaN(count) && count > 0) {
                    for (let i = 0; i < count; i++) {
                        if (currentTargetZone === "main") {
                            this.parsedDeckList.push({ id: cardCode, title: cardTitle });
                        } else if (currentTargetZone === "extra") {
                            this.parsedExtraDeckList.push({ id: cardCode, title: cardTitle });
                        }
                    }
                }
            }
        });
        
        this.renderPreviewGrid();
    }

    renderPreviewGrid() {
        // 1. SAFE CLEAR: Completely destroy the container and recreate it to wipe all old card assets cleanly
        if (this.previewContainer) {
            this.previewContainer.destroy();
            this.previewContainer = null;
        }
        this.input.off("wheel");

        const mainCount = this.parsedDeckList.length;
        const extraCount = this.parsedExtraDeckList.length;

        // 2. CREATE A BRAND NEW CARD CONTAINER (Leaves text headers untouched on the Scene layer)
        this.previewContainer = this.add.container(0, 0);

        // Card Size Parameters: Premium 5-column layout
        const thumbW = 180;
        const thumbH = 252; 
        const colGap = 24;
        const rowGap = 24;
        const columnsCount = 5; 
        const gridStartX = 720;
        
        let currentY = 150;

        // Safely update the persistent scene headers without adding them to the container
        this.previewHeader
            .setText(`📋 MAIN DECK PREVIEW (${mainCount} CARDS)`)
            .setStyle({ fill: mainCount === 60 ? "#34d399" : "#f59e0b", fontSize: "20px" })
            .setPosition(gridStartX, currentY)
            .setOrigin(0, 0);
        
        currentY += 50;

        // Render pass A: Main Deck layout grid coordinates
        this.parsedDeckList.forEach((card, index) => {
            const col = index % columnsCount;
            const row = Math.floor(index / columnsCount);
            const x = gridStartX + col * (thumbW + colGap) + thumbW / 2;
            const y = currentY + row * (thumbH + rowGap) + thumbH / 2;
            this.createCardThumbnailIntoContainer(x, y, card, thumbW, thumbH);
        });

        // Compute spacing gap based on row metrics
        const mainRowsCount = Math.max(1, Math.ceil(mainCount / columnsCount));
        currentY += mainRowsCount * (thumbH + rowGap) + 60;

        // Safely update the persistent Extra header on the scene layer
        this.extraPreviewHeader
            .setText(`🎴 EXTRA DECK PREVIEW (${extraCount} CARDS)`)
            .setStyle({ fill: extraCount === 6 ? "#38bdf8" : "#f59e0b", fontSize: "20px" })
            .setPosition(gridStartX, currentY)
            .setOrigin(0, 0);

        currentY += 50;

        // Render pass B: Extra/Side Deck layout grid coordinates
        this.parsedExtraDeckList.forEach((card, index) => {
            const col = index % columnsCount;
            const row = Math.floor(index / columnsCount);
            const x = gridStartX + col * (thumbW + colGap) + thumbW / 2;
            const y = currentY + row * (thumbH + rowGap) + thumbH / 2;
            this.createCardThumbnailIntoContainer(x, y, card, thumbW, thumbH);
        });

        const extraRowsCount = Math.max(1, Math.ceil(extraCount / columnsCount));
        currentY += extraRowsCount * (thumbH + rowGap) + 50;

        // Render Proceed button safely inside the container so it scrolls with the cards
        if (mainCount > 0 || extraCount > 0) {
            const proceedBtn = this.add.text(gridStartX, currentY, "🚀 VALIDATE & PROCEED TO ARENA", { 
                fontSize: "20px", 
                fontFamily: "monospace", 
                fill: "#0f172a", 
                backgroundColor: "#34d399", 
                fontWeight: "bold", 
                padding: { x: 40, y: 18 } 
            }).setInteractive({ useHandCursor: true });
            
            this.previewContainer.add(proceedBtn);
            proceedBtn.on("pointerdown", () => {
                this.executeServerDeployment();
            });
            currentY += 120; // Bottom spacing buffer
        }

        // 3. ATTACH THE SCROLL WHEEL INTERCEPTOR
        const maxScrollY = Math.max(0, currentY - 950);
        let targetContainerY = 0;

        this.input.on("wheel", (pointer, gameObjects, deltaX, deltaY) => {
            if (pointer.x >= 680) {
                targetContainerY -= deltaY * 0.75; 
                targetContainerY = Phaser.Math.Clamp(targetContainerY, -maxScrollY, 0);
                
                // Slide the cards container up and down
                this.previewContainer.y = targetContainerY;
                
                // Move headers manually in lockstep with the container scroll transformation
                this.previewHeader.y = 150 + targetContainerY;
                
                const dynamicExtraHeaderY = 150 + 50 + (mainRowsCount * (thumbH + rowGap)) + 60;
                this.extraPreviewHeader.y = dynamicExtraHeaderY + targetContainerY;
            }
        });
    }

    createCardThumbnailIntoContainer(x, y, card, thumbW, thumbH) {
        let bundleKey = "system_ui";
        let frameKey = "card_back";
        
        if (card.id.startsWith("BS1-")) bundleKey = "BS01_cards";
        else if (card.id.startsWith("BS2-")) bundleKey = "BS02_cards";
        else if (card.id.startsWith("BS3-")) bundleKey = "BS03_cards";
        else if (card.id.startsWith("BS4-")) bundleKey = "BS04_cards";
        else if (card.id.startsWith("BS5-")) bundleKey = "BS05_cards";
        else if (card.id.startsWith("BS6-")) bundleKey = "BS06_cards";
        else if (card.id.startsWith("BS7-")) bundleKey = "BS07_cards";
        else if (card.id.startsWith("BS8-")) bundleKey = "BS08_cards";
        else if (card.id.startsWith("BS9-")) bundleKey = "BS09_cards";
        else if (card.id.startsWith("BS10-")) bundleKey = "BS10_cards";
        else if (card.id.startsWith("BS11-")) bundleKey = "BS11_cards";
        else if (card.id.startsWith("P-")) bundleKey = "P_cards";
        else if (card.id.startsWith("ST1-")) bundleKey = "ST01_cards";
        else if (card.id.startsWith("ST2-")) bundleKey = "ST02_cards";
        else if (card.id.startsWith("ST3-")) bundleKey = "ST03_cards";
        else if (card.id.startsWith("ST4-")) bundleKey = "ST04_cards";
        else if (card.id.startsWith("ST5-")) bundleKey = "ST05_cards";
        else if (card.id.startsWith("ST6-")) bundleKey = "ST06_cards";
        else if (card.id.startsWith("ST7-")) bundleKey = "ST07_cards";
        else if (card.id.startsWith("ST8-")) bundleKey = "ST08_cards";
        else if (card.id.startsWith("ST9-")) bundleKey = "ST09_cards";
        else if (card.id.startsWith("ST10-")) bundleKey = "ST10_cards";
        
        if (bundleKey !== "system_ui") frameKey = card.id;
        
        const textureExists = this.textures.exists(bundleKey);
        const frameExists = textureExists && this.textures.get(bundleKey).has(frameKey);
        
        if (frameExists) {
            const thumb = this.add.image(x, y, bundleKey, frameKey);
            const textureFrame = this.textures.getFrame(bundleKey, frameKey);
            const scaleX = thumbW / textureFrame.width;
            const scaleY = thumbH / textureFrame.height;
            thumb.setScale(scaleX, scaleY);
            this.previewContainer.add(thumb); 
        } else {
            const cardRect = this.add.graphics();
            cardRect.fillStyle(16119285, 1);
            cardRect.fillRect(x - thumbW / 2, y - thumbH / 2, thumbW, thumbH);
            
            const codeText = this.add.text(x, y, card.id, { 
                fontSize: "14px", // Crisp, readable font for fallbacks
                fontFamily: "monospace", 
                fill: "#000000", 
                fontWeight: "bold" 
            }).setOrigin(0.5);
            
            this.previewContainer.add([cardRect, codeText]);
        }
    }

    executeServerDeployment() {
        console.log(`📤 [DECK PREP]: Dispatching main and extra assets to Table ${this.tableId}`);
        
        // FIX: Transmit the separate extra deck parameter array inside your payload structure
        this.socket.emit("loadDeck", {
            tableId: this.tableId,
            targetPlayer: this.role,
            deckList: this.parsedDeckList,
            extraDeckList: this.parsedExtraDeckList
        });
    }
    
    setupNetworkNoticeHandlers() {
        this.socket.on("serverNotice", msg => {
            // FIX: Chain sequential actions to prevent race conditions on the server thread
            if (msg.includes("Deck loaded with")) {
                console.log("🔄 [DECK PREP]: Arrays built on server. Requesting deck shuffle pass...");
                this.socket.emit("shuffleDeck", { tableId: this.tableId, targetPlayer: this.role });
            }
            if (msg.includes("shuffled successfully")) {
                console.log("🎲 [DECK PREP]: Shuffle registered. Emitting opening draw sequence...");
                this.socket.emit("draw6Cards", { tableId: this.tableId, targetPlayer: this.role });
            }
            if (msg.includes("successfully drew a 6-card")) {
                console.log("🏁 [DECK PREP SUCCESS]: Setup complete. Booting match arena scene terminal.");
                this.socket.off("serverNotice");
                
                // REPLACED ACCORDINGLY: Clean container hooks
                if (this.previewContainer) {
                    this.previewContainer.destroy();
                    this.previewContainer = null;
                }
                
                this.scene.start("GameScene", { tableId: this.tableId, role: this.role });
            }
        });
    }
}
