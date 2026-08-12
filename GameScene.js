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
                fighterB:    { x: 1060, y: 700 }, 
                
                // Bottom tray layout specs
                supportStart:   { x: 600,  y: 920 }, 
                supportOverlap: 65,                  
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
                fighterA:    { x: 1060, y: 380 }, 
                fighterB:    { x: 760,  y: 380 }, 
                
                supportStart:   { x: 600,  y: 160 }, 
                supportOverlap: 65,                  
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

        this.socket.on('cardStackedUpdate', (stackEvent) => {
            console.log(`📡 [NETWORK RECEIVE]: cardStackedUpdate caught for ${stackEvent.targetPlayer} on ${stackEvent.targetSlot}`);
            if (!this.lastReceivedState) return;
            
            const targetState = this.lastReceivedState[stackEvent.targetPlayer];
            if (targetState) {
                // 1. Synchronize the face-down stack structure
                if (targetState.battleZone && targetState.battleZone[stackEvent.targetSlot]) {
                    targetState.battleZone[stackEvent.targetSlot].faceDownStack = stackEvent.updatedStack;
                }
                
                // 2. FIX: Safely update the deck length property so the text label and card back re-render instantly
                if (targetState.deck && typeof stackEvent.deckCount !== 'undefined') {
                    targetState.deck.length = stackEvent.deckCount;
                }
                
                // 3. Force a screen refresh pass
                this.handleStateRenderingLoop(this.lastReceivedState);
            }
        });

        this.socket.on('stackFlippedAndDiscardedUpdate', (flipDiscardEvent) => {
            console.log(`📡 [NETWORK RECEIVE]: stackFlippedAndDiscardedUpdate caught for ${flipDiscardEvent.targetPlayer}`);
            
            if (!this.lastReceivedState) return;
            const targetState = this.lastReceivedState[flipDiscardEvent.targetPlayer];
            
            if (targetState) {
                // 1. Synchronize the face-down stack state data structure
                if (targetState.battleZone && targetState.battleZone[flipDiscardEvent.targetSlot]) {
                    targetState.battleZone[flipDiscardEvent.targetSlot].faceDownStack = flipDiscardEvent.updatedStack;
                }
                
                // 2. CRITICAL FIX: Bind the incoming public discard array to our local state copy
                if (flipDiscardEvent.updatedDiscard) {
                    targetState.discard = flipDiscardEvent.updatedDiscard;
                }

                // 3. CRITICAL FIX: Trigger a full visual redraw pass so the discard pile updates instantly
                this.handleStateRenderingLoop(this.lastReceivedState);
            }
        });

        this.socket.on('discardRecycledUpdate', (recycleEvent) => {
            console.log(`📡 [NETWORK RECEIVE]: discardRecycledUpdate caught for ${recycleEvent.targetPlayer}`);
            if (!this.lastReceivedState) return;
            
            const targetState = this.lastReceivedState[recycleEvent.targetPlayer];
            if (targetState) {
                // 1. Wipe the local data references completely clean
                targetState.discard = [];
                
                if (!targetState.deck) targetState.deck = [];
                targetState.deck.length = recycleEvent.deckCount;
                
                // 2. FORCE SCREEN RE-RENDER: Forces the canvas layer layout matrix to recalculate immediately
                this.handleStateRenderingLoop(this.lastReceivedState);
                
                // 3. Clear out the overlay panels if open
                if (this.drawerState && this.drawerState.playerKey === recycleEvent.targetPlayer) {
                    this.toggleStackDrawer(null); 
                }
            }
        });

        this.socket.on('discardToDefeatedUpdate', (defeatEvent) => {
            console.log(`📡 [NETWORK RECEIVE]: discardToDefeatedUpdate caught for ${defeatEvent.targetPlayer}`);
            if (!this.lastReceivedState) return;
            const targetState = this.lastReceivedState[defeatEvent.targetPlayer];
            if (targetState) {
                if (Array.isArray(targetState.discard)) {
                    // Update discard length to match server context
                    targetState.discard.length = defeatEvent.discardCount; 
                }
                if (!Array.isArray(targetState.defeated)) targetState.defeated = [];
                targetState.defeated.push(defeatEvent.card);
                
                // Re-render the visual display terminal loop state instantly
                this.handleStateRenderingLoop(this.lastReceivedState);
            }
        });

        this.socket.on('cardMovedToDefeatedZone', (defeatEvent) => {
            console.log(`📡 [NETWORK RECEIVE]: cardMovedToDefeatedZone caught for ${defeatEvent.targetPlayer}`);
            if (!this.lastReceivedState) return;

            const targetState = this.lastReceivedState[defeatEvent.targetPlayer];
            if (targetState) {
                // 1. Wipe the card from the active slot on your local state copy
                if (targetState.battleZone && targetState.battleZone[defeatEvent.slot]) {
                    targetState.battleZone[defeatEvent.slot].card = null;
                    
                    // 2. Safely sync the obfuscated card arrays if passed from the server patch
                    if (defeatEvent.updatedStack) {
                        targetState.battleZone[defeatEvent.slot].faceDownStack = defeatEvent.updatedStack;
                    }
                }

                // 3. Overwrite the defeated list tracking parameter array references
                if (Array.isArray(defeatEvent.updatedDefeated)) {
                    targetState.defeated = defeatEvent.updatedDefeated;
                } else {
                    if (!Array.isArray(targetState.defeated)) targetState.defeated = [];
                    targetState.defeated.push(defeatEvent.card);
                }

                if (typeof defeatEvent.defeatedPoints !== 'undefined') {
                    targetState.defeatedPoints = defeatEvent.defeatedPoints;
                }

                // 4. FIX: Force the rendering engine matrix loop to run right now!
                // This clears old card models and draws the new top element on the pile.
                this.handleStateRenderingLoop(this.lastReceivedState);
            }
        });

        this.socket.on('defeatedPointsTickedUpdate', (pointsEvent) => {
            console.log(`📡 [NETWORK RECEIVE]: defeatedPointsTickedUpdate caught for ${pointsEvent.targetPlayer}`);
            if (!this.lastReceivedState) return;

            const targetState = this.lastReceivedState[pointsEvent.targetPlayer];
            if (targetState) {
                // 1. Sync the fresh score parameters down into local memory cache variables
                if (typeof pointsEvent.totalDefeatedPoints !== 'undefined') {
                    targetState.defeatedPoints = pointsEvent.totalDefeatedPoints;
                }
                
                // 2. Force an immediate screen re-render pass to repaint the visual text fields
                this.handleStateRenderingLoop(this.lastReceivedState);
            }
        });

        this.socket.on('cardTapUpdated', (tapEvent) => {
            console.log(`📡 [NETWORK RECEIVE]: cardTapUpdated caught for ${tapEvent.targetPlayer} on zone ${tapEvent.zone}`);
            if (!this.lastReceivedState) return;

            const targetState = this.lastReceivedState[tapEvent.targetPlayer];
            if (targetState) {
                const bZone = targetState.battleZone || {};

                // 1. Route the incoming boolean tap state directly to the matching backend array mapping
                if (tapEvent.zone === 'fighterA' && bZone.fighterA && bZone.fighterA.card) {
                    bZone.fighterA.card.isTapped = tapEvent.isTapped;
                } 
                else if (tapEvent.zone === 'fighterB' && bZone.fighterB && bZone.fighterB.card) {
                    bZone.fighterB.card.isTapped = tapEvent.isTapped;
                } 
                else if (tapEvent.zone === 'support' && Array.isArray(targetState.support)) {
                    const idx = parseInt(tapEvent.supportIndex);
                    if (!isNaN(idx) && targetState.support[idx]) {
                        targetState.support[idx].isTapped = tapEvent.isTapped;
                    }
                }

                // 2. FORCE SCREEN RE-RENDER: Forces the canvas layer layout matrix to repaint immediately
                // This updates the orientation angle parameter to -90 degrees CCW inside renderCardSprite()
                this.handleStateRenderingLoop(this.lastReceivedState);
            }
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

        // Bind the 'T' key to trigger a real-time card tap/untap state change
        this.input.keyboard.on('keydown-T', () => {
            if (this.role === 'spectator') return; // Spectators cannot manipulate card objects

            // Grab the current spatial viewport coordinates of the mouse cursor pointer
            const mouseX = this.input.activePointer.x;
            const mouseY = this.input.activePointer.y;
            
            this.handleKeyboardTapAction(mouseX, mouseY);
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
        let frameKey = 'card_back'; 

        if (card && card.name !== "Card Back") {
            const cardId = card.id || "";
            frameKey = cardId;
            if (cardId.startsWith('BS1-')) bundleKey = 'BS01_cards';
            else if (cardId.startsWith('BS2-')) bundleKey = 'BS02_cards';
            else if (cardId.startsWith('BS3-')) bundleKey = 'BS03_cards';
            else if (cardId.startsWith('BS10-')) bundleKey = 'BS10_cards';
        }

        const cardSprite = this.add.image(x, y, bundleKey, frameKey);
        cardSprite.setDisplaySize(this.cardWidth, this.cardHeight);

        // FIX: Changed setAngle(90) to setAngle(-90) for counter-clockwise tapping
        if (isTapped || card?.isTapped) {
            cardSprite.setAngle(-90); 
        } else {
            cardSprite.setAngle(0);
        }
    }

    handleStateRenderingLoop(state) {
        // 1. Core Canvas Cleanup Loop
        this.resetRenderLayer();
        
        // 2. Standard 3-Column Arena Render Sequence Pass
        this.drawPanelDividers();
        this.drawFieldBoard(state);
        this.drawPreviewPanel();

        // 3. FIXED RENDERING OVERLAY LINK: Draw the drawer AFTER the background field!
        // This ensures the drawer layout stacks properly on top of standard zone cards without erasing them
        if (this.drawerContainer && this.drawerState && this.drawerState.isOpen) {
            this.renderDrawerContents();
            this.drawerContainer.setVisible(true);
        } else if (this.drawerContainer) {
            this.drawerContainer.setVisible(false);
        }
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

            this.drawStaticSlots(c, pData, p.stateKey);
            this.drawSupportTray(c, pData);
            this.drawHandColumn(c, pData);
        });
    }


    // --- SUB-ROUTINE 4: STATIC SLOTS COMPILER ---
    drawStaticSlots(c, pData, stateKey) { // FIX: Accept stateKey parameter here
        const bZone = pData.battleZone || {};

        const drawZoneBox = (point, label, zoneKey) => {
            this.fieldGraphics.fillStyle(0x000000, 0.2);
            this.fieldGraphics.fillRect(point.x - this.cardWidth/2, point.y - this.cardHeight/2, this.cardWidth, this.cardHeight);
            this.fieldGraphics.strokeRect(point.x - this.cardWidth/2, point.y - this.cardHeight/2, this.cardWidth, this.cardHeight);
            this.add.text(point.x, point.y, label, { fontSize: '10px', fontFamily: 'monospace', color: '#64748b' }).setOrigin(0.5);

            const isLocalSeat = (c === this.fieldCoordinates.local);

            if (isLocalSeat && this.role !== 'spectator' && (zoneKey === 'fighterA' || zoneKey === 'fighterB')) {
                const propName = `localDrop_${zoneKey}`;
                if (this[propName]) this[propName].destroy();

                this[propName] = this.add.zone(point.x, point.y, this.cardWidth, this.cardHeight);
                this[propName].setRectangleDropZone(this.cardWidth, this.cardHeight);
                this[propName].setData('zoneKey', zoneKey);

                // --- STACK OPERATIONAL CONTROL BUTTONS (LOCAL FIGHTERS ONLY) ---
                const btnY = point.y - this.cardHeight/2 - 22;
                const btnStyle = { 
                    fontSize: '13px', 
                    fontFamily: 'monospace', 
                    fill: '#38bdf8', 
                    fontWeight: 'bold',
                    backgroundColor: '#1e293b',
                    padding: { x: 8, y: 4 }
                };

                // Add Stacked Card Button (+1) with Borders
                const addBtn = this.add.text(point.x - 30, btnY, '+1', btnStyle).setOrigin(0.5);
                this.fieldGraphics.lineStyle(1, 0x38bdf8, 0.6);
                this.fieldGraphics.strokeRect(addBtn.x - addBtn.width/2, addBtn.y - addBtn.height/2, addBtn.width, addBtn.height);
                addBtn.setInteractive({ useHandCursor: true });
                addBtn.on('pointerdown', () => {
                    this.socket.emit('placeDeckCardToStack', { tableId: this.tableId, targetPlayer: this.role, targetSlot: zoneKey });
                });

                // Remove/Discard Stacked Card Button (-1) with Borders
                const remBtn = this.add.text(point.x + 30, btnY, '-1', btnStyle).setOrigin(0.5);
                this.fieldGraphics.lineStyle(1, 0x38bdf8, 0.6);
                this.fieldGraphics.strokeRect(remBtn.x - remBtn.width/2, remBtn.y - remBtn.height/2, remBtn.width, remBtn.height);
                remBtn.setInteractive({ useHandCursor: true });
                remBtn.on('pointerdown', () => {
                    this.socket.emit('flipAndDiscardFromStack', { tableId: this.tableId, targetPlayer: this.role, targetSlot: zoneKey });
                });

                // Move Fighter to Defeated Zone Button (☠️) with Red Borders
                const styleDefeat = { 
                    fontSize: '14px', 
                    fontFamily: 'monospace', 
                    fill: '#ef4444', 
                    fontWeight: 'bold',
                    backgroundColor: '#1e1b4b',
                    padding: { x: 8, y: 4 }
                };
                const defeatBtn = this.add.text(point.x - 85, point.y, '☠️', styleDefeat).setOrigin(0.5);
                this.fieldGraphics.lineStyle(1, 0xef4444, 0.6);
                this.fieldGraphics.strokeRect(defeatBtn.x - defeatBtn.width/2, defeatBtn.y - defeatBtn.height/2, defeatBtn.width, defeatBtn.height);
                defeatBtn.setInteractive({ useHandCursor: true });
                defeatBtn.on('pointerdown', () => {
                    this.socket.emit('moveFighterToDefeated', { tableId: this.tableId, targetPlayer: this.role, slot: zoneKey });
                });
            }

            if (zoneKey === 'fighterA' || zoneKey === 'fighterB') {
                const fighterSlot = bZone[zoneKey];
                const activeCard = fighterSlot?.card;

                if (activeCard && Object.keys(activeCard).length > 0) {
                    this.renderCardSprite(point.x, point.y, activeCard, activeCard.isTapped);
                }

                if (fighterSlot && fighterSlot.faceDownStack) {
                    this.renderFighterStack(fighterSlot, point);
                }
            }

            if (zoneKey === 'stage' && bZone.stage) {
                this.renderCardSprite(point.x, point.y, bZone.stage, bZone.stage.isTapped);
            }

            // 4. --- DECK DRAW INTERACTION LINK ---
            if (zoneKey === 'deck' && isLocalSeat) {
                if (this.localDeckHitZone) this.localDeckHitZone.destroy();
                this.localDeckHitZone = this.add.zone(point.x, point.y, this.cardWidth, this.cardHeight);
                this.localDeckHitZone.setInteractive({ useHandCursor: true });
                this.localDeckHitZone.on('pointerdown', () => {
                    if (this.role === 'spectator') return; 
                    this.socket.emit('drawCard', { tableId: this.tableId, targetPlayer: this.role });
                });
            }

            // --- DECK ZONE INTEGRATION LINK ---
            if (zoneKey === 'deck' && pData.deck) {
                const totalDeckCount = pData.deck.length || 0;
                const countYOffset = -this.cardHeight / 2 - 15; 

                // Print the numeric indicator above the slot bounds
                this.add.text(point.x, point.y + countYOffset, `DECK: ${totalDeckCount}`, {
                    fontSize: '11px', fontFamily: 'monospace', fill: '#64748b', fontWeight: 'bold'
                }).setOrigin(0.5);

                // --- INTEGRATED: UNTAP ALL CONVENIENCE MACRO UTILITY BUTTON ---
                // Only instantiates this control macro button above the local user's deck box coordinate frame
                if (isLocalSeat && this.role !== 'spectator') {
                    const untapStyle = { 
                        fontSize: '11px', 
                        fontFamily: 'monospace', 
                        fill: '#10b981', // Clean vivid green layout style tint
                        fontWeight: 'bold',
                        backgroundColor: '#064e3b',
                        padding: { x: 8, y: 4 }
                    };

                    // Places the button 42px above the deck center, resting cleanly next to the numeric deck text label
                    const untapAllBtn = this.add.text(point.x - 75, point.y + countYOffset, 'UNTAP ALL', untapStyle).setOrigin(0.5);
                    this.fieldGraphics.lineStyle(1, 0x10b981, 0.5);
                    this.fieldGraphics.strokeRect(untapAllBtn.x - untapAllBtn.width/2, untapAllBtn.y - untapAllBtn.height/2, untapAllBtn.width, untapAllBtn.height);

                    untapAllBtn.setInteractive({ useHandCursor: true });
                    untapAllBtn.on('pointerdown', () => {
                        this.executeUntapAllMacro();
                    });
                }

                // If there is at least one card remaining, spawn the official card back asset
                if (totalDeckCount > 0) {
                    const deckSprite = this.add.image(point.x, point.y, 'system_ui', 'card_back');
                    deckSprite.setDisplaySize(this.cardWidth, this.cardHeight);
                    deckSprite.setDepth(10); 

                    if (isLocalSeat) {
                        deckSprite.setInteractive({ useHandCursor: true });
                        deckSprite.on('pointerdown', () => {
                            if (this.role === 'spectator') return;
                            this.socket.emit('drawCard', { tableId: this.tableId, targetPlayer: this.role });
                        });
                    }
                }
            }

            // 5. --- DISCARD ZONE RENDER LINK ---
            if (zoneKey === 'discard' && pData.discard && pData.discard.length > 0) {
                const topDiscardCard = pData.discard[pData.discard.length - 1];
                if (topDiscardCard) {
                    this.renderCardSprite(point.x, point.y, topDiscardCard, false);
                }
            }

            if (zoneKey === 'discard') {
                const discardHitName = `discardHit_${stateKey}`;
                if (this[discardHitName]) this[discardHitName].destroy();

                this[discardHitName] = this.add.zone(point.x, point.y, this.cardWidth, this.cardHeight);
                this[discardHitName].setInteractive({ useHandCursor: true });
                this[discardHitName].on('pointerdown', () => {
                    this.toggleStackDrawer(stateKey, 'discard'); // Added zone identifier
                });
            }

            // --- INTEGRATED: DEFEATED ZONE STACK RENDER & INTERACTION LINK ---
            if (zoneKey === 'defeated' && pData.defeated && pData.defeated.length > 0) {
                // Display the topmost card from the array tail face up
                const topDefeatedCard = pData.defeated[pData.defeated.length - 1];
                if (topDefeatedCard) {
                    this.renderCardSprite(point.x, point.y, topDefeatedCard, false);
                }
            }

            if (zoneKey === 'defeated') {
                const defeatedHitName = `defeatedHit_${stateKey}`;
                if (this[defeatedHitName]) this[defeatedHitName].destroy();

                this[defeatedHitName] = this.add.zone(point.x, point.y, this.cardWidth, this.cardHeight);
                this[defeatedHitName].setInteractive({ useHandCursor: true });
                this[defeatedHitName].on('pointerdown', () => {
                    this.toggleStackDrawer(stateKey, 'defeated'); // Opens drawer under defeated context
                });
            }
        };

        drawZoneBox(c.deck, 'DECK', 'deck');
        drawZoneBox(c.discard, 'DISCARD', 'discard');
        drawZoneBox(c.defeated, 'DEFEATED', 'defeated');
        drawZoneBox(c.stage, 'STAGE', 'stage');
        drawZoneBox(c.fighterA, 'FIGHTER A', 'fighterA');
        drawZoneBox(c.fighterB, 'FIGHTER B', 'fighterB');

        // --- DEFEATED PILE LABEL AND OPERATIONAL CONTROLS ---
        const defeatedPoints = pData.defeatedPoints || 0;
        const isLocalSeat = (c === this.fieldCoordinates.local);

        // Render the streamlined "POINTS" indicator string below the slot box shape
        this.add.text(c.defeated.x, c.defeated.y + this.cardHeight/2 + 15, `POINTS: ${defeatedPoints} / 10`, {
            fontSize: '12px', fontFamily: 'monospace', color: defeatedPoints >= 7 ? '#ff3333' : '#e2e8f0', fontWeight: 'bold'
        }).setOrigin(0.5);

        if (isLocalSeat && this.role !== 'spectator') {
            const ptBtnY = c.defeated.y - this.cardHeight/2 - 22;
            const ptBtnStyle = { 
                fontSize: '13px', 
                fontFamily: 'monospace', 
                fill: '#e2e8f0', 
                fontWeight: 'bold',
                backgroundColor: '#1e293b',
                padding: { x: 8, y: 4 }
            };

            // Add Points Increment Button (+1) with Borders
            const incPtBtn = this.add.text(c.defeated.x - 30, ptBtnY, '+1', ptBtnStyle).setOrigin(0.5);
            this.fieldGraphics.lineStyle(1, 0x64748b, 0.6);
            this.fieldGraphics.strokeRect(incPtBtn.x - incPtBtn.width/2, incPtBtn.y - incPtBtn.height/2, incPtBtn.width, incPtBtn.height);
            incPtBtn.setInteractive({ useHandCursor: true });
            incPtBtn.on('pointerdown', () => {
                this.socket.emit('adjustDefeatedPoints', { tableId: this.tableId, targetPlayer: this.role, amount: 1 });
            });

            // Subtract Points Decrement Button (-1) with Borders
            const decPtBtn = this.add.text(c.defeated.x + 30, ptBtnY, '-1', ptBtnStyle).setOrigin(0.5);
            this.fieldGraphics.lineStyle(1, 0x64748b, 0.6);
            this.fieldGraphics.strokeRect(decPtBtn.x - decPtBtn.width/2, decPtBtn.y - decPtBtn.height/2, decPtBtn.width, decPtBtn.height);
            decPtBtn.setInteractive({ useHandCursor: true });
            decPtBtn.on('pointerdown', () => {
                this.socket.emit('adjustDefeatedPoints', { tableId: this.tableId, targetPlayer: this.role, amount: -1 });
            });
        }
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

        if (c === this.fieldCoordinates.local) {
            if (this.localSupportDropZone) this.localSupportDropZone.destroy();
            this.localSupportDropZone = this.add.zone(trayX + c.trayWidth/2, trayY + c.trayHeight/2, c.trayWidth, c.trayHeight);
            this.localSupportDropZone.setRectangleDropZone(c.trayWidth, c.trayHeight);
            this.localSupportDropZone.setData('zoneKey', 'support');
        }

        supportCards.forEach((card, index) => {
            const shiftX = c.supportStart.x + (index * c.supportOverlap);
            const shiftY = c.supportStart.y;
            this.renderCardSprite(shiftX, shiftY, card, card.isTapped);
        });

        // --- INTEGRATED: REAL-TIME UNTAPPED COUNTER ENGINE PASS ---
        // Dynamically filters out cards where card.isTapped evaluates to true
        const untappedCount = supportCards.filter(card => !card.isTapped).length;

        this.add.text(trayX + 10, trayY - 14, `SUPPORT REMAINING: ${untappedCount} / ${supportCards.length}`, {
            fontSize: '11px', fontFamily: 'monospace', color: '#38bdf8', fontWeight: 'bold'
        }).setOrigin(0, 0.5);
    }

    // --- SUB-ROUTINE 6: DYNAMIC SQUARE MATRIX HAND COMPILER ---
    drawHandColumn(c, pData) {
        const hand = pData.hand || [];
        const totalCards = hand.length;

        if (totalCards === 0) return;

        // 1. CHOOSE MATRIX STEP CEILING BOUNDS (1x1, 2x2, 3x3, 4x4, 5x5, 6x6)
        let gridDim = 3; 
        if (totalCards <= 1)       gridDim = 1;
        else if (totalCards <= 4)  gridDim = 2;
        else if (totalCards <= 9)  gridDim = 3;
        else if (totalCards <= 16) gridDim = 4;
        else if (totalCards <= 25) gridDim = 5;
        else                       gridDim = 6;

        // 2. FIXED LAYOUT MATRIX ADAPTIVE POSITION CONSTANTS
        // Dynamically shift margins depending on matrix density to ensure large shapes center correctly
        let startX = 55;  
        let endX = 330;   
        
        if (gridDim === 1) {
            startX = 192; // Lock the single huge card directly to the exact horizontal center of Column 1
            endX = 192;
        } else if (gridDim === 2) {
            startX = 100; // Pull column margins outward to keep larger 2x2 cards from bleeding out of bounds
            endX = 284;
        }

        const availableWidth = endX - startX;
        const colSpacing = (gridDim > 1) ? (availableWidth / (gridDim - 1)) : 0;
        
        // Dynamic row pacing adjustments 
        const rowSpacing = (gridDim === 1) ? 0 : (gridDim === 2) ? 200 : (gridDim === 3) ? 140 : (gridDim === 4) ? 100 : 75;

        // 3. RUNTIME ASSET PROPORTIONAL SCALE FACTOR TRANSFORMS
        // EXPANDED SIZING SUITE: Maximize asset footprints at lower matrix cell densities
        let scaleFactor = 1.0;
        if (gridDim === 1)      scaleFactor = 2.4;  // HUGE SCALE: Card expands to ~264px width / ~370px height (Main Feature)
        else if (gridDim === 2) scaleFactor = 1.4;  // BIG SCALE: Proportional layout optimization for 2x2 grid configurations
        else if (gridDim === 3) scaleFactor = 0.80; // Baseline density sizes
        else if (gridDim === 4) scaleFactor = 0.60; 
        else if (gridDim === 5) scaleFactor = 0.48;
        else                    scaleFactor = 0.38;

        const targetWidth = this.cardWidth * scaleFactor;
        const targetHeight = this.cardHeight * scaleFactor;

        // 4. GENERATE ITERATIVE MATRIX RENDER GRID PASS
        hand.forEach((card, index) => {
            const col = index % gridDim;
            const row = Math.floor(index / gridDim);

            // Compute the horizontal placement coordinate
            const cardX = (gridDim === 1) ? startX : startX + (col * colSpacing);
            
            // Compute vertical layout placement by shifting downwards from the base configuration tray anchors
            const cardY = c.handStart.y + (row * rowSpacing);

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

                const interactiveCard = this.add.image(cardX, cardY, bundleKey, frameKey);
                
                interactiveCard.setDisplaySize(targetWidth, targetHeight);
                interactiveCard.setAngle(card?.isTapped ? -90 : 0);
                interactiveCard.setDepth(50 + index);

                // Cache spatial positioning meta-tags onto the Phaser data storage container
                interactiveCard.setData('originalX', cardX);
                interactiveCard.setData('originalY', cardY);
                interactiveCard.setData('handIndex', index);

                // Activate modern Phaser interactive drag state loops
                interactiveCard.setInteractive({ useHandCursor: true });
                this.input.setDraggable(interactiveCard);

            } else {
                // If it is the opponent's hand view, mirror the dynamic matrix scaling properties cleanly
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

                const opponentCard = this.add.image(cardX, cardY, bundleKey, frameKey);
                opponentCard.setDisplaySize(targetWidth, targetHeight);
                opponentCard.setAngle(0);
                opponentCard.setDepth(50 + index);
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
        // CRITICAL DRAWER SCAN INTERCEPT LINK: If drawer is open, bypass board vectors and scan drawer items
        if (this.drawerContainer && this.drawerState && this.drawerState.isOpen) {
            // Test collisions against interactive images attached inside the drawer container
            const targets = this.input.manager.hitTest(this.input.activePointer, this.drawerContainer.list, this.cameras.main);
            for (const target of targets) {
                if (target.data && target.data.has('drawerCardRef')) {
                    const cardData = target.data.get('drawerCardRef');
                    console.log(`🎯 [DRAWER INSPECT]: Locked card focus frame identity: ${cardData.id}`);
                    this.selectedPreviewCard = cardData;
                    this.drawPreviewPanel(); // Isolated refresh pass updates Column 3 instantly
                    return;
                }
            }
            return; // Block further execution loops while the drawer is active
        }

        if (!this.lastReceivedState) return;

        const state = this.lastReceivedState;
        const isPlayerB = this.role === 'playerB';
        const perspectiveMap = [
            { stateKey: isPlayerB ? 'playerB' : 'playerA', coordKey: 'local' },
            { stateKey: isPlayerB ? 'playerA' : 'playerB', coordKey: 'remote' }
        ];

        const halfW = this.cardWidth / 2;
        const halfH = this.cardHeight / 2;

        // 1. SCAN FIGHTER FACEDOWN STACKS (Flipped CCW Collision Profiles)
        const stackScale = 0.55;
        const stackWidth = this.cardHeight * stackScale; 
        const stackHeight = this.cardWidth * stackScale; 
        const stackHorizOffset = 85;                     
        const stackInitialSplay = -25;                   
        const stackSplayStepY = 18;                      

        for (const p of perspectiveMap) {
            const c = this.fieldCoordinates[p.coordKey];
            const bZone = state[p.stateKey]?.battleZone || {};
            const targets = [
                { slot: bZone.fighterA, baseCoord: c.fighterA },
                { slot: bZone.fighterB, baseCoord: c.fighterB }
            ];

            for (const item of targets) {
                if (item.slot && Array.isArray(item.slot.faceDownStack)) {
                    const stack = item.slot.faceDownStack;
                    for (let index = stack.length - 1; index >= 0; index--) {
                        const card = stack[index];
                        const stackCardX = item.baseCoord.x + stackHorizOffset;
                        const stackCardY = item.baseCoord.y + stackInitialSplay + (index * stackSplayStepY);

                        if (mouseX >= stackCardX - stackWidth/2 && mouseX <= stackCardX + stackWidth/2 &&
                            mouseY >= stackCardY - stackHeight/2 && mouseY <= stackCardY + stackHeight/2) {
                            
                            this.selectedPreviewCard = card;
                            this.drawPreviewPanel();
                            return;
                        }
                    }
                }
            }
        }

        // 2. SCAN THE HAND REGION (COLUMN 1)
        for (const p of perspectiveMap) {
            const c = this.fieldCoordinates[p.coordKey];
            const hand = state[p.stateKey]?.hand || [];
            for (let index = 0; index < hand.length; index++) {
                const card = hand[index];
                const col = index % 3;
                const row = Math.floor(index / 3);
                const cardX = c.handStart.x + (col * c.handSpacingX);
                const cardY = c.handStart.y + (row * c.handSpacingY);

                if (mouseX >= cardX - halfW && mouseX <= cardX + halfW &&
                    mouseY >= cardY - halfH && mouseY <= cardY + halfH) {
                    
                    this.selectedPreviewCard = card;
                    this.drawPreviewPanel();
                    return; 
                }
            }

            // 3. SCAN THE SUPPORT AREA TRAY (COLUMN 2)
            const support = state[p.stateKey]?.support || [];
            const reversedSupport = support.slice().reverse();

            for (let reversedIndex = 0; reversedIndex < reversedSupport.length; reversedIndex++) {
                const card = reversedSupport[reversedIndex];
                const originalIndex = (support.length - 1) - reversedIndex;
                
                const shiftX = c.supportStart.x + (originalIndex * c.supportOverlap);
                const shiftY = c.supportStart.y;

                if (mouseX >= shiftX - halfW && mouseX <= shiftX + halfW &&
                    mouseY >= shiftY - halfH && mouseY <= shiftY + halfH) {
                    
                    this.selectedPreviewCard = card;
                    this.drawPreviewPanel();
                    return; 
                }
            }

            // 4. INTEGRATED: SCAN THE DISCARD PILE (COLUMN 2 SLOTS)
            const discard = state[p.stateKey]?.discard || [];
            if (discard.length > 0) {
                if (mouseX >= c.discard.x - halfW && mouseX <= c.discard.x + halfW &&
                    mouseY >= c.discard.y - halfH && mouseY <= c.discard.y + halfH) {
                    
                    // Grab the top card from the array tail
                    const topDiscardCard = discard[discard.length - 1];
                    if (topDiscardCard) {
                        console.log(`🎯 [ISOLATED PREVIEW TARGET]: Top discard card locked: ${topDiscardCard.id}`);
                        this.selectedPreviewCard = topDiscardCard;
                        this.drawPreviewPanel();
                        return;
                    }
                }
            }

            // 5. SCAN REMAINING STATIC CARD IMAGES (FIGHTERS, STAGE)
            const bZone = state[p.stateKey]?.battleZone || {};
            const staticSlots = [
                { coord: c.fighterA, card: bZone.fighterA?.card },
                { coord: c.fighterB, card: bZone.fighterB?.card },
                { coord: c.stage, card: bZone.stage }
            ];

            for (const slot of staticSlots) {
                if (slot.card && mouseX >= slot.coord.x - halfW && mouseX <= slot.coord.x + halfW &&
                    mouseY >= slot.coord.y - halfH && mouseY <= slot.coord.y + halfH) {
                    this.selectedPreviewCard = slot.card;
                    this.drawPreviewPanel();
                    return;
                }
            }
        }
    }


    /**
     * Renders a faceDownStack to the right of a specific fighter slot.
     * Scales down cards, rotates them 90 degrees CCW, and splays them top-to-bottom.
     */
    renderFighterStack(slotData, screenPos) {
        if (!slotData || !slotData.faceDownStack || !Array.isArray(slotData.faceDownStack)) return;

        const stackArray = slotData.faceDownStack;
        if (stackArray.length === 0) return;

        const scaleFactor = 0.55;
        const horizontalOffset = 85; 
        const initialVerticalSplay = -25;
        const splayStepY = 18;
        const cardDepthOffset = 200;

        stackArray.forEach((cardItem, index) => {
            const posX = screenPos.x + horizontalOffset;
            const posY = screenPos.y + initialVerticalSplay + (index * splayStepY);

            let bundleKey = 'system_ui';
            let frameKey = 'card_back';

            if (this.role === 'spectator' && cardItem && cardItem.id) {
                const cardId = cardItem.id || "";
                frameKey = cardId;
                if (cardId.startsWith('BS1-')) bundleKey = 'BS01_cards';
                else if (cardId.startsWith('BS2-')) bundleKey = 'BS02_cards';
                else if (cardId.startsWith('BS3-')) bundleKey = 'BS03_cards';
                else if (cardId.startsWith('BS10-')) bundleKey = 'BS10_cards';
            }

            const stackCardImage = this.add.image(posX, posY, bundleKey, frameKey);
            stackCardImage.setDisplaySize(this.cardWidth * scaleFactor, this.cardHeight * scaleFactor);
            stackCardImage.setAngle(-90);
            stackCardImage.setDepth(cardDepthOffset + index);

            // Stash local references onto the engine object so the scanner can intercept it
            stackCardImage.setData('cardData', cardItem);
        });
    }

    /**
     * Toggles the sliding animation layout state of the view drawer overlay.
     * @param {string|null} playerKey - 'playerA' or 'playerB' to display, or null to close.
     * @param {string} zoneType - 'discard' or 'defeated' depending on origin clicked.
     */
    toggleStackDrawer(playerKey, zoneType = 'discard') {
        if (!this.drawerContainer) {
            this.drawerContainer = this.add.container(-1536, 0); 
            this.drawerContainer.setDepth(2000); 
            this.drawerState = { isOpen: false, playerKey: null, zoneType: 'discard' };
        }

        if (!playerKey) {
            this.tweens.add({
                targets: this.drawerContainer,
                x: -1536,
                duration: 350,
                ease: 'Cubic.easeIn',
                onComplete: () => {
                    this.drawerState.isOpen = false;
                    this.drawerState.playerKey = null;
                    this.drawerContainer.setVisible(false);
                }
            });
            return;
        }

        this.drawerState.isOpen = true;
        this.drawerState.playerKey = playerKey;
        this.drawerState.zoneType = zoneType; // Stash context string securely
        this.renderDrawerContents();
        
        this.drawerContainer.setVisible(true);

        this.tweens.add({
            targets: this.drawerContainer,
            x: 0, 
            duration: 400,
            ease: 'Cubic.easeOut'
        });
    }

    /**
     * Renders the internal structural canvas elements nested inside the drawer container frame.
     */
    renderDrawerContents() {
        if (!this.drawerContainer || !this.drawerState.isOpen) return;

        this.drawerContainer.removeAll(true);

        const playerKey = this.drawerState.playerKey;
        const zoneType = this.drawerState.zoneType || 'discard'; // Read the current zone type context
        
        // Dynamically select target data array depending on zone configuration
        const targetState = (this.lastReceivedState && this.lastReceivedState[playerKey]) ? this.lastReceivedState[playerKey] : {};
        const cardList = (zoneType === 'defeated') ? (targetState.defeated || []) : (targetState.discard || []);

        // 1. Draw solid overlay backdrop plate
        const bgPlate = this.add.graphics();
        bgPlate.fillStyle(0x0f172a, 0.98); 
        bgPlate.fillRect(0, 0, 1536, 1080);
        bgPlate.lineStyle(4, 0x38bdf8, 1);
        bgPlate.lineBetween(1536, 0, 1536, 1080); 
        this.drawerContainer.add(bgPlate);

        // 2. Header and Instructional Labels
        const zoneTitle = (zoneType === 'defeated') ? 'DEFEATED PILE' : 'DISCARD CEMETERY PILE';
        const headerText = this.make.text({
            x: 40, y: 30, text: `${playerKey.toUpperCase()} ${zoneTitle} (${cardList.length} CARDS)`,
            style: { fontSize: '22px', fontFamily: 'monospace', fill: '#f8fafc', fontWeight: 'bold' }
        });
        this.drawerContainer.add(headerText);

        const isOwner = (this.role === playerKey);
        
        // Force text lockout if it's the defeated pile or if it's the opponent's view
        const isDefeatedView = (zoneType === 'defeated');
        const instructionString = (isOwner && !isDefeatedView && this.role !== 'spectator')
            ? '💡 CLICK A CARD TO MOVE IT TO DEFEATED | PRESS [SPACEBAR] TO PREVIEW DETAILED CODE FRAME'
            : '💡 INSPECTION MODE | PRESS [SPACEBAR] TO PREVIEW DETAILED CODE FRAME';

        const subText = this.make.text({
            x: 40, y: 65, text: instructionString,
            style: { fontSize: '12px', fontFamily: 'monospace', fill: '#94a3b8' }
        });
        this.drawerContainer.add(subText);

        // 3. ACTION CONTROL BUTTONS
        const closeBtn = this.make.text({
            x: 1480, y: 25, text: '❌ CLOSE',
            style: { fontSize: '15px', fontFamily: 'monospace', fill: '#ef4444', fontWeight: 'bold', backgroundColor: '#1e293b', padding: { x: 12, y: 6 } }
        }).setOrigin(1, 0);
        closeBtn.setInteractive({ useHandCursor: true });
        closeBtn.on('pointerdown', () => this.toggleStackDrawer(null));
        this.drawerContainer.add(closeBtn);

        // LOCKOUT CHECK: Recycle buttons ONLY show up for your OWN discard pile. Never for Defeated items.
        if (cardList.length > 0 && isOwner && !isDefeatedView && this.role !== 'spectator') {
            const recycleBtn = this.make.text({
                x: 40, y: 110, text: '♻️ RECYCLE ALL DISCARDS TO DECK',
                style: { fontSize: '13px', fontFamily: 'monospace', fill: '#10b981', fontWeight: 'bold', backgroundColor: '#064e3b', padding: { x: 14, y: 8 } }
            });
            recycleBtn.setInteractive({ useHandCursor: true });
            recycleBtn.on('pointerdown', () => {
                this.socket.emit('recycleDiscardToDeck', { tableId: this.tableId, targetPlayer: playerKey });
            });
            this.drawerContainer.add(recycleBtn);
        }

        // 4. GENERATE CARDS GRID MATRIX 
        const gridStartX = 80;
        const gridStartY = 250; 
        const spacingX = 135;
        const spacingY = 185;
        const colsPerLine = 10;

        cardList.forEach((card, index) => {
            const col = index % colsPerLine;
            const row = Math.floor(index / colsPerLine);

            const posX = gridStartX + (col * spacingX);
            const posY = gridStartY + (row * spacingY); 

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

            const drawerCardImg = this.make.image({ x: posX, y: posY, key: bundleKey, frame: frameKey });
            drawerCardImg.setDisplaySize(this.cardWidth * 0.9, this.cardHeight * 0.9);
            
            drawerCardImg.setData('drawerCardRef', card);
            drawerCardImg.setData('drawerCardIndex', index);

            // LOCKOUT CHECK: You can click items to mutate state ONLY if you own the pile and it is a DISCARD pile.
            // Defeated cards, opponent views, and spectators bypass click handlers entirely.
            if (isOwner && !isDefeatedView && this.role !== 'spectator') {
                drawerCardImg.setInteractive({ useHandCursor: true });
                drawerCardImg.on('pointerdown', () => {
                    this.socket.emit('moveDiscardToDefeated', {
                        tableId: this.tableId,
                        targetPlayer: playerKey,
                        discardIndex: index
                    });
                });
            } else {
                // Lock down to observation preview mode only (allows spacebar hover scanning)
                drawerCardImg.setInteractive();
            }

            this.drawerContainer.add(drawerCardImg);
        });
    }

    /**
     * Scans the card zones under the mouse cursor when pressing 'T' and emits toggleCardTap.
     */
    handleKeyboardTapAction(mouseX, mouseY) {
        // Safety lock: Spectators hold no active field role assignment vectors
        if (this.role === 'spectator' || !this.lastReceivedState) return;

        const state = this.lastReceivedState;
        const c = this.fieldCoordinates.local;
        const pData = state[this.role] || {};
        const bZone = pData.battleZone || {};

        const halfW = this.cardWidth / 2;
        const halfH = this.cardHeight / 2;

        // 1. SCAN LOCAL FIGHTER A
        if (bZone.fighterA && bZone.fighterA.card) {
            const card = bZone.fighterA.card;
            // Dynamic check: Invert detection dimensions if the asset card is tapped
            const hW = card.isTapped ? halfH : halfW;
            const hH = card.isTapped ? halfW : halfH;

            if (mouseX >= c.fighterA.x - hW && mouseX <= c.fighterA.x + hW &&
                mouseY >= c.fighterA.y - hH && mouseY <= c.fighterA.y + hH) {
                this.socket.emit('toggleCardTap', { tableId: this.tableId, targetPlayer: this.role, zone: 'fighterA', supportIndex: null });
                return;
            }
        }

        // 2. SCAN LOCAL FIGHTER B
        if (bZone.fighterB && bZone.fighterB.card) {
            const card = bZone.fighterB.card;
            const hW = card.isTapped ? halfH : halfW;
            const hH = card.isTapped ? halfW : halfH;

            if (mouseX >= c.fighterB.x - hW && mouseX <= c.fighterB.x + hW &&
                mouseY >= c.fighterB.y - hH && mouseY <= c.fighterB.y + hH) {
                this.socket.emit('toggleCardTap', { tableId: this.tableId, targetPlayer: this.role, zone: 'fighterB', supportIndex: null });
                return;
            }
        }

        // 3. SCAN LOCAL SUPPORT LANE CARDS (Iterating backwards to target frontmost card)
        const support = pData.support || [];
        for (let i = support.length - 1; i >= 0; i--) {
            const card = support[i];
            const shiftX = c.supportStart.x + (i * c.supportOverlap);
            
            // FIX: Enforce orientation transformations so tapped horizontal cards scan correctly
            const hW = card.isTapped ? halfH : halfW;
            const hH = card.isTapped ? halfW : halfH;

            if (mouseX >= shiftX - hW && mouseX <= shiftX + hW &&
                mouseY >= c.supportStart.y - hH && mouseY <= c.supportStart.y + hH) {
                
                console.log(`📡 [NETWORK EMIT]: Toggled tap on FRONT support card index ${i}`);
                this.socket.emit('toggleCardTap', {
                    tableId: this.tableId,
                    targetPlayer: this.role,
                    zone: 'support',
                    supportIndex: i
                });
                return; 
            }
        }
    }

    /**
     * Traverses all local player active cards and dispatches 'toggleCardTap'
     * mutations for any items currently sitting in a tapped state.
     */
    executeUntapAllMacro() {
        if (!this.lastReceivedState || this.role === 'spectator') return;

        const pData = this.lastReceivedState[this.role] || {};
        const bZone = pData.battleZone || {};
        const support = pData.support || [];

        console.log(`⚡ [UNTAP ALL MACRO]: Initiating local field state traversal pass...`);

        // 1. Audit Fighter A Status
        if (bZone.fighterA && bZone.fighterA.card && bZone.fighterA.card.isTapped) {
            this.socket.emit('toggleCardTap', {
                tableId: this.tableId,
                targetPlayer: this.role,
                zone: 'fighterA',
                supportIndex: null
            });
        }

        // 2. Audit Fighter B Status
        if (bZone.fighterB && bZone.fighterB.card && bZone.fighterB.card.isTapped) {
            this.socket.emit('toggleCardTap', {
                tableId: this.tableId,
                targetPlayer: this.role,
                zone: 'fighterB',
                supportIndex: null
            });
        }

        // 3. Audit Support Lane Cards Matrix Lists
        support.forEach((card, index) => {
            if (card && card.isTapped) {
                this.socket.emit('toggleCardTap', {
                    tableId: this.tableId,
                    targetPlayer: this.role,
                    zone: 'support',
                    supportIndex: index
                });
            }
        });
    }
}
