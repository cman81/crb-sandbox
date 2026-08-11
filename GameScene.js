class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
        this.socket = null;
        this.tableId = null;
        this.role = null;
        this.fieldGraphics = null;
    }

    init(data) {
        this.tableId = data.tableId || 1;
        this.role = data.role || 'spectator';

        const roomColors = [
            0x1a2238, 0x1b3a2b, 0x3d1414, 0x2d1a3a, 
            0x133337, 0x422815, 0x2c3531, 0x1a1c1e
        ];
        this.backgroundColor = roomColors[(this.tableId - 1) % roomColors.length];
    }

    preload() {
        this.load.atlasPCT('BS01_cards', 'assets/BS01.pct', 'assets');
        this.load.atlasPCT('BS02_cards', 'assets/BS02.pct', 'assets');
        this.load.atlasPCT('BS03_cards', 'assets/BS03.pct', 'assets');
        this.load.atlasPCT('BS10_cards', 'assets/atlas.pct', 'assets');
    }

    create() {
        // 1. Paint the entire 1920x1080 canvas viewport window space with this table's flat arena color
        const bgFill = this.add.graphics();
        bgFill.fillStyle(this.backgroundColor, 1);
        bgFill.fillRect(0, 0, 1920, 1080);
        bgFill.setDepth(-200);

        // 2. Define Card Dimensions (Standard Field size)
        this.cardWidth = 110;
        this.cardHeight = 154;

        // 3. THREE-COLUMN HORIZONTAL GRID MATRIX COORDINATES WITH ADJUSTED TRAYS
        this.fieldCoordinates = {
            local: {
                deck:        { x: 1450, y: 700 }, 
                discard:     { x: 1450, y: 880 }, 
                defeated:    { x: 470,  y: 700 }, 
                stage:       { x: 1310, y: 700 }, 
                fighterA:    { x: 760,  y: 700 }, 
                fighterB:    { x: 1160, y: 700 },
                
                // Bottom tray layout specs
                supportStart:   { x: 600,  y: 920 }, // Starts left (600), cascades right
                supportOverlap: 25,                  // Cascades left-to-right (+25)
                trayWidth:      730,                 
                trayHeight:     166,                 
                
                handStart:   { x: 80,   y: 650 },
                handSpacingX: 115,
                handSpacingY: 170
            },
            remote: {
                deck:        { x: 470,  y: 380 }, 
                discard:     { x: 470,  y: 200 }, 
                defeated:    { x: 1450, y: 380 }, 
                stage:       { x: 610,  y: 380 }, 
                fighterA:    { x: 1160, y: 380 }, 
                fighterB:    { x: 760,  y: 380 }, 
                
                // FIXED TOP TRAY REALIGNMENT:
                // Changed supportStart.x from 1320 (right side) to 600 (left side)
                // Changed supportOverlap from -25 (leftward) to +25 (rightward)
                supportStart:   { x: 600,  y: 160 }, // Starts left (600) like the bottom tray
                supportOverlap: 25,                  // Cascades left-to-right (+25)
                trayWidth:      730,
                trayHeight:     166,
                
                handStart:   { x: 80,   y: 120 },
                handSpacingX: 115,
                handSpacingY: 170
            },
            previewAnchor: { x: 1728, y: 540 }
        };

        // 4. WebSocket Sync Handshakes: Reuse the persistent global socket instance
        this.socket = globalSocket;
        this.socket.emit('joinTable', { tableId: this.tableId, role: this.role });

        // --- Inside your create() method, replace the stateUpdate block with this: ---
        this.socket.on('stateUpdate', (sanitizedState) => {
            this.lastReceivedState = sanitizedState; // Keep an active local data reference copy
            this.handleStateRenderingLoop(sanitizedState);
        });

        // --- NEW TARGETED NETWORK ACTION HANDLER ---
        this.socket.on('cardDrawnUpdate', (drawEvent) => {
            console.log(`📡 [NETWORK RECEIVE]: cardDrawnUpdate caught for ${drawEvent.targetPlayer}`);

            // Double check that we have a cached local state array map reference
            if (!this.lastReceivedState) return;

            // Target the specific player slot altered on the backend state architecture
            const targetState = this.lastReceivedState[drawEvent.targetPlayer];
            if (targetState) {
                // Update the deck numeric count array tracking parameter
                if (targetState.deck) {
                    targetState.deck.length = drawEvent.deckCount;
                }

                // Append the incoming face-up card layout data cleanly into the hand array bounds
                if (!Array.isArray(targetState.hand)) {
                    targetState.hand = [];
                }
                
                targetState.hand.push(drawEvent.card);

                // Run the state update re-render pass to display the drawn card face up instantly
                this.handleStateRenderingLoop(this.lastReceivedState);
            }
        });
        
        this.socket.on('cardPlayedToSupportUpdate', (playEvent) => {
            console.log(`📡 [NETWORK]: Received cardPlayedToSupportUpdate for ${playEvent.targetPlayer}`);
            // Force a full table re-query or update local snapshot reference to redraw everything cleanly
            this.socket.emit('getGameState', { tableId: this.tableId, role: this.role });
        });

        this.socket.on('cardPlayedToFighterUpdate', (playEvent) => {
            console.log(`📡 [NETWORK]: Received cardPlayedToFighterUpdate for ${playEvent.targetPlayer}`);
            this.socket.emit('getGameState', { tableId: this.tableId, role: this.role });
        });

        this.socket.emit('getGameState', { tableId: this.tableId, role: this.role });

        this.selectedPreviewCard = null; // Caches the active card loaded into Column 3

        // Bind the spacebar key to a clean input tracker callback routine
        this.input.keyboard.on('keydown-SPACE', () => {
            // Grab the current viewport coordinates of the mouse cursor pointer
            const mouseX = this.input.activePointer.x;
            const mouseY = this.input.activePointer.y;
            
            this.scanCardHitboxesForPreview(mouseX, mouseY);
        });
        
        // Enable global drag-and-drop listener hooks inside the Phaser 4 input tree
        this.input.on('drag', (pointer, gameObject, dragX, dragY) => {
            // Keep the card tracking directly underneath the user's cursor position mid-flight
            gameObject.x = dragX;
            gameObject.y = dragY;
            gameObject.setDepth(1000); // Force the moving card above all board dividers
        });

        this.input.on('dragend', (pointer, gameObject, dropped) => {
            // If the card was let go in open dead-space (not on a zone), snap it back to its seat
            if (!dropped) {
                if (gameObject.data && gameObject.data.has('originalX')) {
                    gameObject.x = gameObject.data.get('originalX');
                    gameObject.y = gameObject.data.get('originalY');
                    gameObject.setDepth(0);
                }
            }
        });

        this.input.on('drop', (pointer, gameObject, dropZone) => {
            const handIndex = gameObject.data.get('handIndex');
            const zoneKey = dropZone.data.get('zoneKey');

            console.log(`🎯 [DRAG DROP]: Card index ${handIndex} dropped onto target zone: ${zoneKey}`);

            if (this.role === 'spectator') {
                // Instantly bounce the card back if a spectator tries to manipulate objects
                gameObject.x = gameObject.data.get('originalX');
                gameObject.y = gameObject.data.get('originalY');
                gameObject.setDepth(0);
                return;
            }

            // Route network communications seamlessly depending on which drop zone was targeted
            if (zoneKey === 'support') {
                this.socket.emit('playCardToSupport', { 
                    tableId: this.tableId, 
                    targetPlayer: this.role, 
                    handIndex: handIndex 
                });
                gameObject.destroy(); 
            } else if (zoneKey === 'fighterA' || zoneKey === 'fighterB') {
                this.socket.emit('playCardToFighter', {
                    tableId: this.tableId,
                    targetPlayer: this.role,
                    handIndex: handIndex,
                    targetSlot: zoneKey
                });
                gameObject.destroy(); 
            } else {
                // If unknown drop layout, fail-safe snap back
                gameObject.x = gameObject.data.get('originalX');
                gameObject.y = gameObject.data.get('originalY');
                gameObject.setDepth(0);
            }
        });

    }

    // --- HELPER ROUTINE: CARD SPRITE FACTORY ---
    // Renders either the high-fidelity card graphic or a face-down card back
    renderCardSprite(x, y, card, isTapped) {
        let bundleKey = 'system_ui';
        let frameKey = 'card_back'; // Change this string to match your official card back frame ID inside atlas.pct

        if (card && card.name !== "Card Back") {
            const cardId = card.id || "";
            frameKey = cardId;

            // Automatically route the card to the correct loaded asset texture bundle
            if (cardId.startsWith('BS1-')) bundleKey = 'BS01_cards';
            else if (cardId.startsWith('BS2-')) bundleKey = 'BS02_cards';
            else if (cardId.startsWith('BS3-')) bundleKey = 'BS03_cards';
            else if (cardId.startsWith('BS10-')) bundleKey = 'BS10_cards';
        }

        // Add the native Phaser image sprite element using the custom plugin cache frame
        const cardSprite = this.add.image(x, y, bundleKey, frameKey);
        cardSprite.setDisplaySize(this.cardWidth, this.cardHeight);

        // Manage tapped orientation angle changes graphically
        if (isTapped || card?.isTapped) {
            cardSprite.setAngle(90); // Rests the card 90-degrees sideways
        } else {
            cardSprite.setAngle(0);
        }
    }


    handleStateRenderingLoop(state) {
        this.resetRenderLayer();
        this.drawPanelDividers();
        this.drawFieldBoard(state);
        this.drawPreviewPanel();
    }

    // --- SUB-ROUTINE 1: LAYER RESET ---
    resetRenderLayer() {
        if (this.fieldGraphics) {
            this.fieldGraphics.clear();
        } else {
            this.fieldGraphics = this.add.graphics();
        }

        // Safe cleanup iteration avoiding array modification side-effects
        const childrenToDestroy = [];
        this.children.list.forEach(child => {
            // Flush all old text layouts
            if (child.type === 'Text') {
                childrenToDestroy.push(child);
            }
            
            // --- FLUSH OLD HAND/FIELD SPRITES ---
            // If it is an Image component, mark it for garbage collection 
            // so our upcoming render matrix can spawn clean, newly positioned assets.
            if (child.type === 'Image') {
                childrenToDestroy.push(child);
            }
        });
        
        childrenToDestroy.forEach(child => child.destroy());
    }


    // --- SUB-ROUTINE 2: DIVIDER DRAW PASS ---
    drawPanelDividers() {
        this.fieldGraphics.lineStyle(4, 0x334155, 1);
        this.fieldGraphics.lineBetween(384, 0, 384, 1080);  // Column 1 | Column 2 Boundary Line
        this.fieldGraphics.lineBetween(1536, 0, 1536, 1080); // Column 2 | Column 3 Boundary Line
        
        this.fieldGraphics.lineStyle(2, 0x334155, 0.5);
        this.fieldGraphics.lineBetween(0, 540, 1536, 540);   // Center Divide

        const headerStyle = { fontSize: '14px', fontFamily: 'monospace', fill: '#64748b', fontWeight: 'bold' };
        this.add.text(20, 20, '🗂️ OPPONENT HAND', headerStyle);
        this.add.text(20, 560, '🗂️ PLAYER HAND', headerStyle);
        this.add.text(404, 20, `🎮 ARENA ZONE (FIELD TERMINAL ${this.tableId})`, headerStyle);
        this.add.text(1556, 20, '🔍 CARD INSPECTION PREVIEW', headerStyle);
    }

    // --- SUB-ROUTINE 3: FIELD BOARD COORDINATOR ---
    drawFieldBoard(state) {
        this.fieldGraphics.lineStyle(2, 0xffffff, 0.15);
        
        const isPlayerB = this.role === 'playerB';
        const perspectiveMap = [
            { stateKey: isPlayerB ? 'playerB' : 'playerA', coordKey: 'local' },
            { stateKey: isPlayerB ? 'playerA' : 'playerB', coordKey: 'remote' }
        ];

        perspectiveMap.forEach(p => {
            const c = this.fieldCoordinates[p.coordKey];
            const pData = state[p.stateKey] || {};

            this.drawStaticSlots(c, pData);
            this.drawSupportTray(c, pData);
            this.drawHandColumn(c, pData);
        });
    }

    // --- SUB-ROUTINE 4: STATIC SLOTS COMPILER ---
    drawStaticSlots(c, pData) {
        // Safe reference capture of the server's nested battleZone structure
        const bZone = pData.battleZone || {};

        const drawZoneBox = (point, label, zoneKey) => {
            // 1. Render the background placeholder tray
            this.fieldGraphics.fillStyle(0x000000, 0.2);
            this.fieldGraphics.fillRect(point.x - this.cardWidth/2, point.y - this.cardHeight/2, this.cardWidth, this.cardHeight);
            this.fieldGraphics.strokeRect(point.x - this.cardWidth/2, point.y - this.cardHeight/2, this.cardWidth, this.cardHeight);
            this.add.text(point.x, point.y, label, { fontSize: '10px', fontFamily: 'monospace', color: '#64748b' }).setOrigin(0.5);

            if (c === this.fieldCoordinates.local && (zoneKey === 'fighterA' || zoneKey === 'fighterB')) {
                // Re-instantiate dedicated localized hitbox target properties
                const propName = `localDrop_${zoneKey}`;
                if (this[propName]) this[propName].destroy();

                this[propName] = this.add.zone(point.x, point.y, this.cardWidth, this.cardHeight);
                this[propName].setRectangleDropZone(this.cardWidth, this.cardHeight);
                this[propName].setData('zoneKey', zoneKey);
            }
            // 2. --- DYNAMIC RENDER LINK: FIGHTER SLOTS REVEAL ---
            if (zoneKey === 'fighterA' || zoneKey === 'fighterB') {
                const fighterSlot = bZone[zoneKey]; // Reads fighterA or fighterB from state
                const activeCard = fighterSlot?.card;

                if (activeCard && Object.keys(activeCard).length > 0) {
                    // Spawns the card sprite at the correct matrix position, accounting for tapped states
                    this.renderCardSprite(point.x, point.y, activeCard, activeCard.isTapped);
                }
            }

            // 3. --- DYNAMIC RENDER LINK: STAGE SLOT REVEAL ---
            if (zoneKey === 'stage' && bZone.stage) {
                this.renderCardSprite(point.x, point.y, bZone.stage, bZone.stage.isTapped);
            }

            // 4. --- DECK DRAW INTERACTION LINK (From our previous step) ---
            if (zoneKey === 'deck' && c === this.fieldCoordinates.local) {
                if (this.localDeckHitZone) this.localDeckHitZone.destroy();
                this.localDeckHitZone = this.add.zone(point.x, point.y, this.cardWidth, this.cardHeight);
                this.localDeckHitZone.setInteractive({ useHandCursor: true });
                this.localDeckHitZone.on('pointerdown', () => {
                    if (this.role === 'spectator') return; 
                    this.socket.emit('drawCard', { tableId: this.tableId, targetPlayer: this.role });
                });
            }
        };

        // Pass down the structural string keys to map against server state parameters
        drawZoneBox(c.deck, 'DECK', 'deck');
        drawZoneBox(c.discard, 'DISCARD', 'discard');
        drawZoneBox(c.defeated, 'DEFEATED', 'defeated');
        drawZoneBox(c.stage, 'STAGE', 'stage');
        drawZoneBox(c.fighterA, 'FIGHTER A', 'fighterA');
        drawZoneBox(c.fighterB, 'FIGHTER B', 'fighterB');

        const breakPts = pData.defeatedPoints || 0;
        this.add.text(c.defeated.x, c.defeated.y + this.cardHeight/2 + 15, `BREAK POINTS: ${breakPts} / 10`, {
            fontSize: '12px', fontFamily: 'monospace', color: breakPts >= 7 ? '#ff3333' : '#e2e8f0', fontWeight: 'bold'
        }).setOrigin(0.5);
    }



    // --- SUB-ROUTINE 5: SUPPORT TRAY CASCADER ---
    drawSupportTray(c, pData) {
        const supportCards = pData.support || [];
        const borderRadiusRadius = 12;

        const trayX = c.supportStart.x - this.cardWidth / 2 - 6;
        const trayY = c.supportStart.y - c.trayHeight / 2;

        this.fieldGraphics.fillStyle(0x000000, 0.35);
        this.fieldGraphics.fillRoundedRect(trayX, trayY, c.trayWidth, c.trayHeight, borderRadiusRadius);
        this.fieldGraphics.lineStyle(2, 0xffffff, 0.08);
        this.fieldGraphics.strokeRoundedRect(trayX, trayY, c.trayWidth, c.trayHeight, borderRadiusRadius);

        // --- NEW DROPAZONE ATTACHMENT FOR LOCAL PLAYER ---
        if (c === this.fieldCoordinates.local) {
            if (this.localSupportDropZone) this.localSupportDropZone.destroy();
            
            // Create a matching physical zone bounding box covering the entire support shelf shape
            this.localSupportDropZone = this.add.zone(trayX + c.trayWidth/2, trayY + c.trayHeight/2, c.trayWidth, c.trayHeight);
            this.localSupportDropZone.setRectangleDropZone(c.trayWidth, c.trayHeight);
            this.localSupportDropZone.setData('zoneKey', 'support');
        }

        supportCards.forEach((card, index) => {
            const shiftX = c.supportStart.x + (index * c.supportOverlap);
            const shiftY = c.supportStart.y;
            this.renderCardSprite(shiftX, shiftY, card, card.isTapped);
        });

        this.add.text(trayX + 10, trayY - 14, `SUPPORT ZONE COUNT: ${supportCards.length}`, {
            fontSize: '11px', fontFamily: 'monospace', color: '#38bdf8', fontWeight: 'bold'
        }).setOrigin(0, 0.5);
    }


    // --- SUB-ROUTINE 6: HAND COLUMN MATRIX MATRIX RENDERER ---
    drawHandColumn(c, pData) {
        const hand = pData.hand || [];
        
        hand.forEach((card, index) => {
            const col = index % 3;
            const row = Math.floor(index / 3);

            const cardX = c.handStart.x + (col * c.handSpacingX);
            const cardY = c.handStart.y + (row * c.handSpacingY);

            // Check if this is the active user's local hand perspective
            if (c === this.fieldCoordinates.local) {
                let bundleKey = 'system_ui';
                let frameKey = 'card_back';

                if (card && card.name !== "Card Back") {
                    const cardId = card.id || "";
                    frameKey = cardId;
                    if (cardId.startsWith('BS1-')) bundleKey = 'BS01_cards';
                    else if (cardId.startsWith('BS2-')) bundleKey = 'BS02_cards';
                    else if (cardId.startsWith('BS3-')) bundleKey = 'BS03_cards';
                    else if (cardId.startsWith('BS10-')) bundleKey = 'BS10_cards';
                }

                // Spawn an explicit image instead of a flat proxy to allow drag injection
                const interactiveCard = this.add.image(cardX, cardY, bundleKey, frameKey);
                interactiveCard.setDisplaySize(this.cardWidth, this.cardHeight);
                interactiveCard.setAngle(card?.isTapped ? 90 : 0);

                // Cache spatial positioning meta-tags onto the Phaser data storage container
                interactiveCard.setData('originalX', cardX);
                interactiveCard.setData('originalY', cardY);
                interactiveCard.setData('handIndex', index);

                // Activate modern Phaser interactive drag state loops
                interactiveCard.setInteractive({ useHandCursor: true });
                this.input.setDraggable(interactiveCard);

            } else {
                // If it is the opponent's hand, keep rendering normal non-interactive sprites
                this.renderCardSprite(cardX, cardY, card, false);
            }
        });
    }



    // --- SUB-ROUTINE 7: CARD INSPECTOR WRAPPER ---
    drawPreviewPanel() {
        const preview = this.fieldCoordinates.previewAnchor;
        const bigWidth = 260;
        const bigHeight = 364;

        // --- CLEAN FIX: Clear existing preview visual elements to prevent memory leaks/layer blur ---
        // Identifies any Text or Image objects explicitly placed inside the Column 3 boundary
        const boundaryLeft = 1536; 
        const visualElementsToDestroy = [];

        this.children.list.forEach(child => {
            if ((child.type === 'Text' || child.type === 'Image') && child.x > boundaryLeft) {
                visualElementsToDestroy.push(child);
            }
        });
        visualElementsToDestroy.forEach(child => child.destroy());

        // Draw solid dark background shell plate container
        this.fieldGraphics.fillStyle(0x020617, 1);
        this.fieldGraphics.fillRect(preview.x - bigWidth/2, preview.y - bigHeight/2, bigWidth, bigHeight);
        
        // Glow cyan if a card is selected, keep slate grey if empty
        this.fieldGraphics.lineStyle(3, this.selectedPreviewCard ? 0x38bdf8 : 0x334155, 1);
        this.fieldGraphics.strokeRect(preview.x - bigWidth/2, preview.y - bigHeight/2, bigWidth, bigHeight);

        if (this.selectedPreviewCard) {
            const card = this.selectedPreviewCard;
            
            let bundleKey = 'system_ui';
            let frameKey = 'card_back'; // Generic card back fallback

            if (card.name !== "Card Back") {
                const cardId = card.id || "";
                frameKey = cardId;

                // Match the ID code to its proper high-res .pct asset bundle key
                if (cardId.startsWith('BS1-')) bundleKey = 'BS01_cards';
                else if (cardId.startsWith('BS2-')) bundleKey = 'BS02_cards';
                else if (cardId.startsWith('BS3-')) bundleKey = 'BS03_cards';
                else if (cardId.startsWith('BS10-')) bundleKey = 'BS10_cards';
            }

            // Render the high-res texture image crop inside the Column 3 placeholder bounds
            const bigPreviewImage = this.add.image(preview.x, preview.y, bundleKey, frameKey);
            bigPreviewImage.setDisplaySize(bigWidth, bigHeight);

            // Print the unmasked metadata details directly underneath the image frame block
            this.add.text(preview.x, preview.y + bigHeight/2 + 20, `CODE: ${card.name === 'Card Back' ? 'UNKNOWN' : card.id}`, {
                fontSize: '13px', fontFamily: 'monospace', color: '#38bdf8', fontWeight: 'bold'
            }).setOrigin(0.5);

        } else {
            this.add.text(preview.x, preview.y, "[ HOVER CURSOR OVER A CARD\n& PRESS SPACEBAR TO INSPECT ]", {
                fontSize: '12px', fontFamily: 'monospace', color: '#64748b', align: 'center'
            }).setOrigin(0.5);
        }
    }

    // --- HELPER METHOD: MOUSE VECTOR SCANNER ---
    scanCardHitboxesForPreview(mouseX, mouseY) {
        if (!this.lastReceivedState) return;

        const state = this.lastReceivedState;
        const isPlayerB = this.role === 'playerB';
        const perspectiveMap = [
            { stateKey: isPlayerB ? 'playerB' : 'playerA', coordKey: 'local' },
            { stateKey: isPlayerB ? 'playerA' : 'playerB', coordKey: 'remote' }
        ];

        for (const p of perspectiveMap) {
            const c = this.fieldCoordinates[p.coordKey];
            
            // 1. SCAN THE HAND REGION (COLUMN 1)
            const hand = state[p.stateKey]?.hand || [];
            for (let index = 0; index < hand.length; index++) {
                const card = hand[index];
                const col = index % 3;
                const row = Math.floor(index / 3);
                const cardX = c.handStart.x + (col * c.handSpacingX);
                const cardY = c.handStart.y + (row * c.handSpacingY);

                if (mouseX >= cardX - this.cardWidth/2 && mouseX <= cardX + this.cardWidth/2 &&
                    mouseY >= cardY - this.cardHeight/2 && mouseY <= cardY + this.cardHeight/2) {
                    
                    console.log(`🎯 [ISOLATED PREVIEW TARGET]: Hand card locked: ${card.id}`);
                    this.selectedPreviewCard = card;
                    
                    // PERFORMANCE FIXED: Only redraw the preview section, skipping full board overhaul loops
                    this.drawPreviewPanel();
                    return; 
                }
            }

            // 2. SCAN THE SUPPORT AREA TRAY (COLUMN 2)
            const support = state[p.stateKey]?.support || [];
            const reversedSupport = support.slice().reverse();

            for (let reversedIndex = 0; reversedIndex < reversedSupport.length; reversedIndex++) {
                const card = reversedSupport[reversedIndex];
                const originalIndex = (support.length - 1) - reversedIndex;
                
                const shiftX = c.supportStart.x + (originalIndex * c.supportOverlap);
                const shiftY = c.supportStart.y;

                if (mouseX >= shiftX - this.cardWidth/2 && mouseX <= shiftX + this.cardWidth/2 &&
                    mouseY >= shiftY - this.cardHeight/2 && mouseY <= shiftY + this.cardHeight/2) {
                    
                    console.log(`🎯 [ISOLATED PREVIEW TARGET]: Top support card locked: ${card.id}`);
                    this.selectedPreviewCard = card;
                    
                    // PERFORMANCE FIXED: Isolated redraw call
                    this.drawPreviewPanel();
                    return; 
                }
            }
        }
    }
}
