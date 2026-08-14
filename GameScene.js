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
        // FIX 1: Hard wipe old, dead graphics container properties from prior visits
        this.fieldGraphics = null;
        this.dividerGraphics = null;

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

        // --- AUTO-REVOKE ON ENTRY ---
        if (this.role === "playerA" || this.role === "playerB") {
            this.socket.emit("revokeEndGame", { tableId: this.tableId, targetPlayer: this.role });
        }

        this.socket.on("stateUpdate", sanitizedState => {
            // 1. Hand off the incoming state array frame to the decoupled Analyzer
            const didTriggerAnimation = this.checkAndAnimateStateChanges(sanitizedState);
            
            // 2. If an active flight path animation is underway, exit early to allow the tween thread to complete
            if (didTriggerAnimation) return;

            // 3. Fallback: If it's a static update pass, execute the direct screen paint right away
            this.lastReceivedState = sanitizedState;
            this.handleStateRenderingLoop(sanitizedState);
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
            
            // Not a problem, as they affect different zones!
            this.handleKeyboardTapAction(mouseX, mouseY); // zones: figtherA, fighterB, support, stage
            this.handleHandToDeckShortcut(mouseX, mouseY, "top"); // zone: hand
        });

        // --- SHORTCUT: KEYDOWN D FOR INSTANT HAND DISCARD ---
        this.input.keyboard.on("keydown-D", () => {
            if (this.role === "spectator") return;
            
            const mouseX = this.input.activePointer.x;
            const mouseY = this.input.activePointer.y;
            this.handleKeyboardDiscardAction(mouseX, mouseY);
        });

        // --- KEYBOARD SHORTCUTS: T FOR TOP DECK, B FOR BOTTOM DECK ---
        this.input.keyboard.on("keydown-B", () => {
            if (this.role === "spectator") return;
            const mouseX = this.input.activePointer.x;
            const mouseY = this.input.activePointer.y;
            this.handleHandToDeckShortcut(mouseX, mouseY, "bottom");
        });

        this.input.keyboard.on("keydown-F", () => {
            if (this.role === "spectator") return;
            const mouseX = this.input.activePointer.x;
            const mouseY = this.input.activePointer.y;
            this.handleKeyboardFaceDownAction(mouseX, mouseY);
        });

        this.input.keyboard.on("keydown-S", () => {
            if (this.role === "spectator") return;
            const mouseX = this.input.activePointer.x;
            const mouseY = this.input.activePointer.y;
            this.handleKeyboardToStageAction(mouseX, mouseY);
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

        this.input.on("drop", (pointer, gameObject, dropZone) => {
            const handIndex = gameObject.data.get("handIndex");
            const zoneKey = dropZone.data.get("zoneKey");

            if (this.role === "spectator" || typeof handIndex === 'undefined' || handIndex === null) {
                gameObject.x = gameObject.data.get("originalX");
                gameObject.y = gameObject.data.get("originalY");
                gameObject.setDepth(0);
                return;
            }

            console.log(`🎯 [DECOUPLED DROP]: Processing hand index ${handIndex} to zone ${zoneKey}`);

            if (zoneKey === "support") {
                this.socket.emit("playCardToSupport", { tableId: this.tableId, targetPlayer: this.role, handIndex: handIndex });
                gameObject.destroy();
            } else if (zoneKey === "fighterA" || zoneKey === "fighterB") {
                this.socket.emit("playCardToFighter", { tableId: this.tableId, targetPlayer: this.role, handIndex: handIndex, targetSlot: zoneKey });
                gameObject.destroy();
            } else if (zoneKey === "discard") {
                this.socket.emit("discardCardFromHand", { tableId: this.tableId, targetPlayer: this.role, handIndex: handIndex });
                gameObject.destroy();
            } else if (zoneKey === "stage") {
                this.socket.emit("playCardToStage", { tableId: this.tableId, targetPlayer: this.role, handIndex: handIndex });
                gameObject.destroy();
            } else {
                gameObject.x = gameObject.data.get("originalX");
                gameObject.y = gameObject.data.get("originalY");
                gameObject.setDepth(0);
            }
        });

        this.input.on('pointerdown', (pointer) => {
            if (this.role === "spectator" || !this.lastReceivedState) return;

            // Isolate the physical boundary coordinates for your local deck
            const deckCoord = this.fieldCoordinates.local.deck;
            const halfW = this.cardWidth / 2;
            const halfH = this.cardHeight / 2;

            // Check if the click occurred exactly within the local deck's rectangular bounds
            if (pointer.x >= deckCoord.x - halfW && pointer.x <= deckCoord.x + halfW &&
                pointer.y >= deckCoord.y - halfH && pointer.y <= deckCoord.y + halfH) {
                
                // Prevent event propagation if an overlay/drawer is open
                if (this.drawerState && this.drawerState.isOpen) return;

                console.log("🎲 [DECOUPLED INPUT]: Clean singular deck draw event issued via permanent listener.");
                this.socket.emit("drawCard", { tableId: this.tableId, targetPlayer: this.role });
            }
        });


    }

    // --- HELPER ROUTINE: CARD SPRITE FACTORY ---
    // Renders either the high-fidelity card graphic or a face-down card back
    // ADDED PARAMETER: 'currentZone' explicitly separates hand logic from other board tiles
    renderCardSprite(x, y, card, isTapped, currentZone = "field", baseDepth = 50) {
        let bundleKey = "system_ui";
        let frameKey = "card_back";
        let useFallback = false;

        let appliedWidth = this.cardWidth;
        let appliedHeight = this.cardHeight;
        let currentScaleFactor = 1;

        const isCardBack = !card || card.title === "Card Back" || card.name === "Card Back" || card.isFaceDown;
        
        if (this.lastReceivedState && card && !isCardBack && currentZone === "hand") {
            const playerState = this.lastReceivedState[this.role] || {};
            const handArray = playerState.hand || [];
            
            const handIndex = handArray.findIndex(c => c.id === card.id);
            if (handIndex !== -1) {
                const isLocalSeat = true;
                const layout = this.getHandCardLayout(handIndex, handArray.length, isLocalSeat);
                
                appliedWidth = layout.width;
                appliedHeight = layout.height;
                currentScaleFactor = layout.width / this.cardWidth;
            }
        }

        if (!isCardBack) {
            const cardId = card.id || "";
            frameKey = cardId;
            
            if (cardId.startsWith("BS1-")) bundleKey = "BS01_cards";
            else if (cardId.startsWith("BS2-")) bundleKey = "BS02_cards";
            else if (cardId.startsWith("BS3-")) bundleKey = "BS03_cards";
            else if (cardId.startsWith("BS10-")) bundleKey = "BS10_cards";
        }

        if (!this.textures.exists(bundleKey) || !this.textures.get(bundleKey).has(frameKey)) {
            useFallback = true;
        }

        // Path A: Render Normal Card Sprite
        if (!useFallback) {
            const cardSprite = this.add.image(x, y, bundleKey, frameKey);
            cardSprite.setDisplaySize(appliedWidth, appliedHeight);
            cardSprite.setAngle(isTapped || card?.isTapped ? -90 : 0);
            
            // FIX: Explicitly enforce the dynamic loop depth on the Image asset
            cardSprite.setDepth(baseDepth); 
            return cardSprite;
        }

        // Path B: Programmatic Vector Fallback Container
        const fallbackContainer = this.add.container(x, y);
        fallbackContainer.setDepth(baseDepth); 

        const halfW = appliedWidth / 2;
        const halfH = appliedHeight / 2;
        const cardShape = this.add.graphics();
        
        if (isCardBack) {
            // FIX: Leverage our newly extracted method to decouple card back graphics completely
            this.drawVectorCardBack(fallbackContainer, appliedWidth, appliedHeight, currentScaleFactor);
        } else {
            cardShape.fillStyle(0xF5F5F5, 1);       
            cardShape.lineStyle(2, 0x94a3b8, 1);    
            cardShape.fillRoundedRect(-halfW, -halfH, appliedWidth, appliedHeight, 6);
            cardShape.strokeRoundedRect(-halfW, -halfH, appliedWidth, appliedHeight, 6);
            fallbackContainer.add(cardShape);

            const titleFontSize = Math.max(7, Math.floor(10 * currentScaleFactor));
            const rawTitle = card.title || card.name || "Unknown Card";
            const titleStyle = { 
                fontSize: `${titleFontSize}px`, 
                fontFamily: "monospace", 
                fill: "#1e293b", 
                fontWeight: "bold", 
                align: "center", 
                wordWrap: { width: appliedWidth - 8 } 
            };
            const titleText = this.add.text(0, -halfH + Math.floor(12 * currentScaleFactor), rawTitle, titleStyle).setOrigin(0.5, 0);
            fallbackContainer.add(titleText);

            const idFontSize = Math.max(6, Math.floor(9 * currentScaleFactor));
            const idStyle = { fontSize: `${idFontSize}px`, fontFamily: "monospace", fill: "#64748b", fontWeight: "bold" };
            const idText = this.add.text(-halfW + Math.floor(6 * currentScaleFactor), halfH - Math.floor(10 * currentScaleFactor), card.id || "N/A", idStyle).setOrigin(0, 0.5);
            fallbackContainer.add(idText);
        }

        fallbackContainer.setAngle(isTapped || card?.isTapped ? -90 : 0);
        fallbackContainer.setData("computedWidth", appliedWidth);
        fallbackContainer.setData("computedHeight", appliedHeight);

        return fallbackContainer; // FIX: Return the container instance explicitly
    }

    getHandCardLayout(index, totalCards, isLocalSeat) {
        let gridDim = 3;
        if (totalCards <= 1) gridDim = 1;
        else if (totalCards <= 4) gridDim = 2;
        else if (totalCards <= 9) gridDim = 3;
        else if (totalCards <= 16) gridDim = 4;
        else if (totalCards <= 25) gridDim = 5;
        else gridDim = 6;

        let startX = 55, endX = 330;
        if (gridDim === 1) { startX = 192; endX = 192; }
        else if (gridDim === 2) { startX = 100; endX = 284; }

        const availableWidth = endX - startX;
        const colSpacing = gridDim > 1 ? availableWidth / (gridDim - 1) : 0;
        const rowSpacing = gridDim === 1 ? 0 : gridDim === 2 ? 200 : gridDim === 3 ? 140 : gridDim === 4 ? 100 : 75;

        let scaleFactor = 1;
        if (gridDim === 1) scaleFactor = 2.4;
        else if (gridDim === 2) scaleFactor = 1.4;
        else if (gridDim === 3) scaleFactor = .8;
        else if (gridDim === 4) scaleFactor = .6;
        else if (gridDim === 5) scaleFactor = .48;
        else scaleFactor = .38;

        let verticalPushOffset = 0;
        if (gridDim === 1) verticalPushOffset = isLocalSeat ? 110 : 80;
        else if (gridDim === 2) verticalPushOffset = isLocalSeat ? 45 : 30;

        const col = index % gridDim;
        const row = Math.floor(index / gridDim);
        
        return {
            x: gridDim === 1 ? startX : startX + col * colSpacing,
            y: row * rowSpacing + verticalPushOffset, // Base offset added outside by coordinate profile
            width: this.cardWidth * scaleFactor,
            height: this.cardHeight * scaleFactor
        };
    }

    handleStateRenderingLoop(state){
        this.resetRenderLayer();
        this.drawPanelDividers(); // Draws your section split borders
        
        // FIX: Set a safe baseline global thickness right before passing to the field builders
        if (this.fieldGraphics) {
            this.fieldGraphics.lineStyle(2, 16777215, .15);
        }
        
        this.drawFieldBoard(state);
        this.drawPreviewPanel();
        
        if(this.drawerContainer&&this.drawerState&&this.drawerState.isOpen){
            this.renderDrawerContents();
            this.drawerContainer.setVisible(true);
        } else if(this.drawerContainer){
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

        const childrenToDestroy = [];

        this.children.list.forEach(child => {
            // 1. Preserve static text labeling blocks
            if (child.type === "Text" && (child.text.includes("HAND") || child.text.includes("ARENA ZONE") || child.text.includes("INSPECTION"))) {
                return;
            }
            
            // 2. Queue standard loose rendering components
            if (child.type === "Text" || child.type === "Image") {
                childrenToDestroy.push(child);
            }
            
            // 3. FIX: Only clear out the dynamic card fallback containers. 
            // Explicitly shield your main menu UI layer from being wiped by keyboard refreshes!
            if (child.type === "Container") {
                if (this.drawerContainer && child === this.drawerContainer) {
                    return; // Safeguard the global menu container instance from deletion
                }
                childrenToDestroy.push(child);
            }
        });

        childrenToDestroy.forEach(child => child.destroy());
    }

    // --- SUB-ROUTINE 2: DIVIDER DRAW PASS ---
    drawPanelDividers() {
        // If it's null or cleared by create(), instantiate a fresh, live graphics context
        if (this.dividerGraphics) {
            this.dividerGraphics.clear();
        } else {
            this.dividerGraphics = this.add.graphics();
        }

        this.dividerGraphics.lineStyle(4, 3359061, 1);
        this.dividerGraphics.lineBetween(384, 0, 384, 1080);
        this.dividerGraphics.lineBetween(1536, 0, 1536, 1080);
        this.dividerGraphics.lineStyle(2, 3359061, .5);
        this.dividerGraphics.lineBetween(0, 540, 1536, 540);
        
        const headerStyle = { fontSize: "14px", fontFamily: "monospace", fill: "#64748b", fontWeight: "#bold" };
        this.add.text(20, 20, "🗂️ OPPONENT HAND", headerStyle);
        this.add.text(20, 560, "🗂️ PLAYER HAND", headerStyle);
        this.add.text(404, 20, `🎮 ARENA ZONE (FIELD TERMINAL ${this.tableId})`, headerStyle);
        this.add.text(1556, 20, "🔍 CARD INSPECTION PREVIEW", headerStyle);
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
    /**
     * Main coordinator that loops through all static zones for a player profile.
     */
    drawStaticSlots(c, pData, stateKey) {
        const isLocalSeat = c === this.fieldCoordinates.local;
        const battleZone = pData.battleZone || {};

        // 1. Process standard layout fields
        this.processZoneSlot(c.deck, "DECK", "deck", pData, stateKey, isLocalSeat);
        this.processZoneSlot(c.discard, "DISCARD", "discard", pData, stateKey, isLocalSeat);
        this.processZoneSlot(c.defeated, "DEFEATED", "defeated", pData, stateKey, isLocalSeat);
        this.processZoneSlot(c.stage, "STAGE", "stage", pData, stateKey, isLocalSeat);
        this.processZoneSlot(c.fighterA, "FIGHTER A", "fighterA", pData, stateKey, isLocalSeat);
        this.processZoneSlot(c.fighterB, "FIGHTER B", "fighterB", pData, stateKey, isLocalSeat);

        // 2. Render supplemental text panels and buttons
        this.renderDefeatedPointsPanel(c.defeated, pData.defeatedPoints || 0, isLocalSeat);
        this.renderStatelessEndGameButton(isLocalSeat);

        // 3. Render visual Deck Stack using the unified fallback engine
        const totalDeckCount = pData.deck ? pData.deck.length || 0 : 0;
        if (totalDeckCount > 0) {
            // Triggers the dedicated "Card Back" shape programmatically if texture bundles are absent
            this.renderCardSprite(c.deck.x, c.deck.y, { title: "Card Back", isFaceDown: true }, false);
        }
    }

    /**
     * Handles the individual rendering pipeline lifecycle for any given grid zone box.
     */
    processZoneSlot(point, label, zoneKey, pData, stateKey, isLocalSeat) {
        const battleZone = pData.battleZone || {};
        this.drawZoneBoxGeometry(point, label);

        if (isLocalSeat && this.role !== "spectator") {
            this.configureLocalSlotInteractivity(point, zoneKey, stateKey);
        }

        // 1. Fighter Zone Layouts
        if (zoneKey === "fighterA" || zoneKey === "fighterB") {
            this.renderFighterZoneContents(point, battleZone[zoneKey]);
            
            // Face-down trickery card back masking layers logic
            if (zoneKey === "fighterA" || zoneKey === "fighterB") {
                this.renderFighterZoneContents(point, battleZone[zoneKey]);
                
                if (zoneKey === "fighterA" && battleZone.fighterA && battleZone.fighterA.card) {
                    const targetCard = battleZone.fighterA.card;
                    const overlayPropName = isLocalSeat ? "localFighterAOverlaySprite" : "remoteFighterAOverlaySprite";
                    const tooltipPropName = isLocalSeat ? "localFighterATooltipText" : "remoteFighterATooltipText";
                    
                    // Clean up any stale overlay instances
                    if (this[overlayPropName]) {
                        this[overlayPropName].destroy();
                        this[overlayPropName] = null;
                    }
                    // Clean up any stale tooltip instances
                    if (this[tooltipPropName]) {
                        this[tooltipPropName].destroy();
                        this[tooltipPropName] = null;
                    }

                    const isCurrentlyFaceDown = !!targetCard.isFaceDown || targetCard.isFaceUp === false;
                    if (isCurrentlyFaceDown) {
                        // Render the Card Back Overlay
                        this[overlayPropName] = this.add.image(point.x, point.y, "system_ui", "card_back");
                        this[overlayPropName].setDisplaySize(this.cardWidth, this.cardHeight);
                        this[overlayPropName].setDepth(120);

                        // --- NEW: FACE-DOWN TRICKERY TOOLTIP DISPLAY LOGIC ---
                        // Position the tooltip 70 pixels to the right of the card center
                        const tooltipX = point.x + (this.cardWidth / 2) + 15;
                        const tooltipStyle = {
                            fontSize: "11px",
                            fontFamily: "monospace",
                            fill: "#38bdf8",
                            fontWeight: "bold",
                            backgroundColor: "#0f172a",
                            padding: { x: 8, y: 4 }
                        };

                        this[tooltipPropName] = this.add.text(tooltipX, point.y, "💡 Click to reveal when ready", tooltipStyle).setOrigin(0, 0.5);
                        this[tooltipPropName].setDepth(130);
                        
                        // Draw a subtle cyan accent line connecting the card edge to the tooltip balloon
                        this.fieldGraphics.lineStyle(1, 3718648, 0.6);
                        this.fieldGraphics.lineBetween(point.x + (this.cardWidth / 2), point.y, tooltipX, point.y);
                        // ------------------------------------------------------

                        if (isLocalSeat && this.role !== "spectator") {
                            this[overlayPropName].setInteractive({ useHandCursor: true });
                            this[overlayPropName].on("pointerdown", () => {
                                console.log("👁️ [LOCAL TRICKERY]: Flipping card face up...");
                                if (battleZone.fighterA && battleZone.fighterA.card) {
                                    battleZone.fighterA.card.isFaceDown = false;
                                    battleZone.fighterA.card.isFaceUp = true;
                                }
                                if (this[overlayPropName]) {
                                    this[overlayPropName].destroy();
                                    this[overlayPropName] = null;
                                }
                                if (this[tooltipPropName]) {
                                    this[tooltipPropName].destroy();
                                    this[tooltipPropName] = null;
                                }
                                this.socket.emit("flipCardFaceUp", { tableId: this.tableId, targetPlayer: this.role });
                                this.handleStateRenderingLoop(this.lastReceivedState);
                            });
                        }
                    }
                }
            }
        } 
        // 2. Stage Zone Layouts (Ensures both predictive and server data formats load successfully)
        else if (zoneKey === "stage") {
            const stageCard = battleZone.stage || pData.stage;
            if (stageCard && Object.keys(stageCard).length > 0) {
                this.renderCardSprite(point.x, point.y, stageCard, stageCard.isTapped || false, "field");
            }
        } 
        // 3. Deck Zone Layouts
        else if (zoneKey === "deck") {
            this.renderDeckZoneStack(point, pData.deck, isLocalSeat);
        } 
        // 4. Public Piles (Discard and Defeated)
        else if (zoneKey === "discard" || zoneKey === "defeated") {
            const targetPile = pData[zoneKey];
            if (Array.isArray(targetPile) && targetPile.length > 0) {
                const topCard = targetPile[targetPile.length - 1];
                if (topCard) {
                    this.renderCardSprite(point.x, point.y, topCard, topCard.isTapped || false, "field");
                }
            }
        }
    }


    /**
     * Sketches the explicit background box frame outlines.
     */
    drawZoneBoxGeometry(point, label) {
        this.fieldGraphics.fillStyle(0, 0.2);
        this.fieldGraphics.fillRect(point.x - this.cardWidth / 2, point.y - this.cardHeight / 2, this.cardWidth, this.cardHeight);
        this.fieldGraphics.strokeRect(point.x - this.cardWidth / 2, point.y - this.cardHeight / 2, this.cardWidth, this.cardHeight);
        this.add.text(point.x, point.y, label, { fontSize: "10px", fontFamily: "monospace", color: "#64748b" }).setOrigin(0.5);
    }

    /**
     * Establishes the Phaser Drop Zones and interactive stack manipulation panels (+1, -1, ☠️).
     */
    configureLocalSlotInteractivity(point, zoneKey, stateKey) {
        if (zoneKey === "fighterA" || zoneKey === "fighterB") {
            const propName = `localDrop_${zoneKey}`;
            if (this[propName]) this[propName].destroy();
            this[propName] = this.add.zone(point.x, point.y, this.cardWidth, this.cardHeight);
            this[propName].setRectangleDropZone(this.cardWidth, this.cardHeight);
            this[propName].setData("zoneKey", zoneKey);

            const btnY = point.y - this.cardHeight / 2 - 22;
            const btnStyle = { fontSize: "13px", fontFamily: "monospace", fill: "#38bdf8", fontWeight: "bold", backgroundColor: "#1e293b", padding: { x: 8, y: 4 } };
            
            const addBtn = this.add.text(point.x - 30, btnY, "+1", btnStyle).setOrigin(0.5);
            this.fieldGraphics.lineStyle(1, 3718648, .6);
            this.fieldGraphics.strokeRect(addBtn.x - addBtn.width / 2, addBtn.y - addBtn.height / 2, addBtn.width, addBtn.height);
            addBtn.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
                this.socket.emit("placeDeckCardToStack", { tableId: this.tableId, targetPlayer: this.role, targetSlot: zoneKey })
            });

            const remBtn = this.add.text(point.x + 30, btnY, "-1", btnStyle).setOrigin(0.5);
            this.fieldGraphics.lineStyle(1, 3718648, .6);
            this.fieldGraphics.strokeRect(remBtn.x - remBtn.width / 2, remBtn.y - remBtn.height / 2, remBtn.width, remBtn.height);
            remBtn.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
                this.socket.emit("flipAndDiscardFromStack", { tableId: this.tableId, targetPlayer: this.role, targetSlot: zoneKey })
            });

            const styleDefeat = { fontSize: "14px", fontFamily: "monospace", fill: "#ef4444", fontWeight: "bold", backgroundColor: "#1e1b4b", padding: { x: 8, y: 4 } };
            const defeatBtn = this.add.text(point.x - 85, point.y, "☠️", styleDefeat).setOrigin(0.5);
            this.fieldGraphics.lineStyle(1, 15680580, .6);
            this.fieldGraphics.strokeRect(defeatBtn.x - defeatBtn.width / 2, defeatBtn.y - defeatBtn.height / 2, defeatBtn.width, defeatBtn.height);
            defeatBtn.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
                this.socket.emit("moveFighterToDefeated", { tableId: this.tableId, targetPlayer: this.role, slot: zoneKey })
            });
        }

        if (zoneKey === "discard" || zoneKey === "defeated") {
            // 1. CLEANUP: Wipe out any existing click or drop zones for this slot position
            const clickHitName = `${zoneKey}ClickHit_${stateKey}`;
            const dropHitName = `${zoneKey}DropHit_${stateKey}`;
            
            if (this[clickHitName]) { this[clickHitName].destroy(); this[clickHitName] = null; }
            if (this[dropHitName]) { this[dropHitName].destroy(); this[dropHitName] = null; }

            // 2. THE DROP ZONE LAYER: Built exclusively to process card drag drops safely
            if (zoneKey === "discard") {
                this[dropHitName] = this.add.zone(point.x, point.y, this.cardWidth, this.cardHeight);
                this[dropHitName].setRectangleDropZone(this.cardWidth, this.cardHeight);
                this[dropHitName].setData("zoneKey", zoneKey);
                this[dropHitName].setDepth(100);
            }

            // 3. THE CLICK ZONE LAYER: Built as a separate object strictly to listen for mouse clicks
            this[clickHitName] = this.add.zone(point.x, point.y, this.cardWidth, this.cardHeight);
            this[clickHitName].setInteractive({ useHandCursor: true });
            this[clickHitName].setData("zoneKey", zoneKey);
            this[clickHitName].setDepth(150); // Layered slightly HIGHER to catch immediate pointer clicks cleanly

            // Hook up the toggle event listener to our dedicated click zone tracker
            this[clickHitName].on("pointerdown", pointer => {
                if (this.input.dragactive) return; // Ignore clicks if the user is in the middle of dragging an item
                console.log(`🎯 [ENGINE CLICK]: Click caught on dedicated ${zoneKey} zone layer! Opening drawer...`);
                this.toggleStackDrawer(stateKey, zoneKey);
            });
        }

        if (zoneKey === "stage") {
            const propName = `localDrop_${zoneKey}`;
            if (this[propName]) this[propName].destroy();
            this[propName] = this.add.zone(point.x, point.y, this.cardWidth, this.cardHeight);
            this[propName].setRectangleDropZone(this.cardWidth, this.cardHeight);
            this[propName].setData("zoneKey", zoneKey);
        }
    }

    /**
     * Handles rendering for active fighter cards and nested face-down pile overlays.
     */
    renderFighterZoneContents(point, fighterSlot) {
        if (!fighterSlot) return;

        const activeCard = fighterSlot.card;
        if (activeCard && Object.keys(activeCard).length > 0) {
            this.renderCardSprite(point.x, point.y, activeCard, activeCard.isTapped);
        }
        if (fighterSlot.faceDownStack) {
            this.renderFighterStack(fighterSlot, point);
        }
    }

    /**
     * Handles deck size indicators and single-card draw hitboxes.
     */
    renderDeckZoneStack(point, deckArray, isLocalSeat){
        const totalDeckCount = deckArray ? deckArray.length || 0 : 0;
        const countYOffset = -this.cardHeight / 2 - 15;
        
        this.add.text(point.x, point.y + countYOffset, `DECK: ${totalDeckCount}`, {
            fontSize: "11px",
            fontFamily: "monospace",
            fill: "#64748b",
            fontWeight: "bold"
        }).setOrigin(.5);

        if(isLocalSeat && this.role !== "spectator"){
            const untapStyle = { fontSize: "11px", fontFamily: "monospace", fill: "#10b981", fontWeight: "bold", backgroundColor: "#064e3b", padding: { x: 8, y: 4 } };
            const untapAllBtn = this.add.text(point.x - 75, point.y + countYOffset, "UNTAP ALL", untapStyle).setOrigin(.5);
            this.fieldGraphics.lineStyle(1, 1096065, .5);
            this.fieldGraphics.strokeRect(untapAllBtn.x - untapAllBtn.width / 2, untapAllBtn.y - untapAllBtn.height / 2, untapAllBtn.width, untapAllBtn.height);
            untapAllBtn.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
                this.executeUntapAllMacro();
            });
        }

        if(totalDeckCount > 0){
            this.renderCardSprite(point.x, point.y, { title: "Card Back", isFaceDown: true }, false);
        }
    }


    /**
     * Safely renders the topmost item of a public pile lane face up on the grid coordinates.
     */
    renderPublicPileTopCard(point, pileArray, stateKey, zoneKey) {
        if (pileArray && pileArray.length > 0) {
            const topCard = pileArray[pileArray.length - 1];
            if (topCard) {
                // FIX: Route the top card of the stack directly into your unified 
                // fallback card checker so it renders an off-white block instantly!
                this.renderCardSprite(point.x, point.y, topCard, topCard.isTapped || false, "field");
            }
        }
    }

    /**
     * Handles rendering the score counter and score increment/decrement buttons (+1, -1).
     */
    renderDefeatedPointsPanel(defeatedPoint, defeatedPoints, isLocalSeat) {
        this.add.text(defeatedPoint.x, defeatedPoint.y + this.cardHeight / 2 + 15, `POINTS: ${defeatedPoints} / 10`, {
            fontSize: "12px", 
            fontFamily: "monospace", 
            color: defeatedPoints >= 7 ? "#ff3333" : "#e2e8f0", 
            fontWeight: "bold"
        }).setOrigin(0.5);

        if (isLocalSeat && this.role !== "spectator") {
            const ptBtnY = defeatedPoint.y - this.cardHeight / 2 - 22;
            const ptBtnStyle = { 
                fontSize: "13px", 
                fontFamily: "monospace", 
                fill: "#e2e8f0", 
                fontWeight: "bold", 
                backgroundColor: "#1e293b", 
                padding: { x: 8, y: 4 } 
            };

            const incPtBtn = this.add.text(defeatedPoint.x - 30, ptBtnY, "+1", ptBtnStyle).setOrigin(0.5);
            this.fieldGraphics.lineStyle(1, 6583435, 0.6);
            this.fieldGraphics.strokeRect(incPtBtn.x - incPtBtn.width / 2, incPtBtn.y - incPtBtn.height / 2, incPtBtn.width, incPtBtn.height);
            incPtBtn.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
                this.socket.emit("adjustDefeatedPoints", { tableId: this.tableId, targetPlayer: this.role, amount: 1 });
            });

            const decPtBtn = this.add.text(defeatedPoint.x + 30, ptBtnY, "-1", ptBtnStyle).setOrigin(0.5);
            this.fieldGraphics.lineStyle(1, 6583435, 0.6);
            this.fieldGraphics.strokeRect(decPtBtn.x - decPtBtn.width / 2, decPtBtn.y - decPtBtn.height / 2, decPtBtn.width, decPtBtn.height);
            decPtBtn.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
                this.socket.emit("adjustDefeatedPoints", { tableId: this.tableId, targetPlayer: this.role, amount: -1 });
            });
        }
    }

    /**
     * Handles rendering the stateless match-termination action trigger button.
     */
    renderStatelessEndGameButton(isLocalSeat) {
        if (isLocalSeat && this.role !== "spectator") {
            const endMatchStyle = { 
                fontSize: "13px", 
                fontFamily: "monospace", 
                fill: "#ef4444", 
                fontWeight: "bold", 
                backgroundColor: "#1e1b4b", 
                padding: { x: 12, y: 6 } 
            };
            
            this.endGameActionBtn = this.add.text(960, 45, "🚨 PROPOSE END GAME", endMatchStyle).setOrigin(0.5);
            this.endGameActionBtn.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
                this.socket.emit("signalEndGame", { tableId: this.tableId, targetPlayer: this.role });
                this.displayThanksModal();
            });
        }
    }


    // --- SUB-ROUTINE 5: SUPPORT TRAY CASCADER ---
    drawSupportTray(c, pData) {
        const supportCards = pData.support || [];
        const borderRadiusRadius = 12;
        const trayX = c.supportStart.x - this.cardWidth / 2 - 6;
        const trayY = c.supportStart.y - c.trayHeight / 2;

        this.fieldGraphics.fillStyle(0, .35);
        this.fieldGraphics.fillRoundedRect(trayX, trayY, c.trayWidth, c.trayHeight, borderRadiusRadius);
        this.fieldGraphics.lineStyle(2, 16777215, .08);
        this.fieldGraphics.strokeRoundedRect(trayX, trayY, c.trayWidth, c.trayHeight, borderRadiusRadius);

        if (c === this.fieldCoordinates.local) {
            if (this.localSupportDropZone) this.localSupportDropZone.destroy();
            this.localSupportDropZone = this.add.zone(trayX + c.trayWidth / 2, trayY + c.trayHeight / 2, c.trayWidth, c.trayHeight);
            this.localSupportDropZone.setRectangleDropZone(c.trayWidth, c.trayHeight);
            this.localSupportDropZone.setData("zoneKey", "support");
        }

        // Baseline tray stack layer starts at 100
        const trayBaseDepth = 100;

        supportCards.forEach((card, index) => {
            const shiftX = c.supportStart.x + index * c.supportOverlap;
            const shiftY = c.supportStart.y;
            
            // FIX: Pass a dynamic incremental depth. 
            // Card index 0 gets 100, Card index 1 gets 101, etc.
            // This guarantees items on the right always sit strictly on top of items on the left!
            const relativeCardDepth = trayBaseDepth + index;
            
            this.renderCardSprite(shiftX, shiftY, card, card.isTapped, "field", relativeCardDepth);
        });

        const untappedCount = supportCards.filter(card => !card.isTapped).length;
        this.add.text(trayX + 10, trayY - 14, `SUPPORT REMAINING: ${untappedCount} / ${supportCards.length}`, {
            fontSize: "11px",
            fontFamily: "monospace",
            color: "#38bdf8",
            fontWeight: "bold"
        }).setOrigin(0, .5);
    }

    // --- SUB-ROUTINE 6: DYNAMIC SQUARE MATRIX HAND COMPILER ---
    drawHandColumn(c, pData) {
        const hand = pData.hand || [];
        const totalCards = hand.length;
        if (totalCards === 0) return;

        const isLocalSeat = c === this.fieldCoordinates.local;

        hand.forEach((card, index) => {
            const layout = this.getHandCardLayout(index, totalCards, isLocalSeat);
            const cardX = layout.x;
            const cardY = c.handStart.y + layout.y;

            if (isLocalSeat) {
                // Capture the generated card instance cleanly
                const currentCardObject = this.renderCardSprite(cardX, cardY, card, card?.isTapped, "hand");

                if (currentCardObject) {
                    currentCardObject.setDepth(50 + index);
                    currentCardObject.setData("originalX", cardX);
                    currentCardObject.setData("originalY", cardY);
                    currentCardObject.setData("handIndex", index);
                    
                    // FIX: Check the underlying object type to apply correct hitboxes
                    if (currentCardObject.type === "Container") {
                        // Fallback container uses centered geometry bounds
                        currentCardObject.setInteractive(
                            new Phaser.Geom.Rectangle(-layout.width / 2, -layout.height / 2, layout.width, layout.height), 
                            Phaser.Geom.Rectangle.Contains
                        );
                    } else {
                        // Real Card Image calculates native bounds directly from its dimensions!
                        currentCardObject.setInteractive({ useHandCursor: true });
                    }
                    
                    // Enable dragging mechanics across both layout configurations
                    this.input.setDraggable(currentCardObject);
                }
            } else {
                this.renderCardSprite(cardX, cardY, card, false, "hand");
                const opponentCardObject = this.children.list[this.children.list.length - 1];
                if (opponentCardObject) {
                    opponentCardObject.setDepth(50 + index);
                }
            }
        });
    }

    // --- SUB-ROUTINE 7: CARD INSPECTOR WRAPPER ---
    drawPreviewPanel(){
    const preview = this.fieldCoordinates.previewAnchor;
    const bigWidth = 260;
    const bigHeight = 364;
    const boundaryLeft = 1536;
    const visualElementsToDestroy = [];

    // Clear old elements past the canvas split boundary line
    this.children.list.forEach(child => {
        if ((child.type === "Text" || child.type === "Image" || child.type === "Container") && child.x > boundaryLeft) {
            visualElementsToDestroy.push(child);
        }
    });
    visualElementsToDestroy.forEach(child => child.destroy());

    // --- NEW: UPPER RIGHT KEYBOARD QUICK REFERENCE PANEL ---
    const panelX = 1556;
    const panelY = 55;
    
    // Panel Styling Guidelines
    const labelStyle = { fontSize: "11px", fontFamily: "monospace", fill: "#94a3b8", fontWeight: "bold" };
    const keyStyle = { fontSize: "11px", fontFamily: "monospace", fill: "#38bdf8", fontWeight: "bold" };
    const descStyle = { fontSize: "11px", fontFamily: "monospace", fill: "#e2e8f0" };

    this.add.text(panelX, panelY, "⌨️ KEYBOARD SHORTCUTS (HOVER + PRESS)", labelStyle);
    
    const shortcuts = [
        { key: "[SPACE]", desc: "Inspect Card Info" },
        { key: "[T]    ", desc: "Tap Card (Arena) / Top-Deck a Card (Hand)" },
        { key: "[D]    ", desc: "Play / Discard (Hand) " },
        { key: "[F]    ", desc: "Place Fighter A Face-Down" },
        { key: "[S]    ", desc: "Play as Stage" },
        { key: "[B]    ", desc: "Bottom-Deck a Card" }
    ];

    shortcuts.forEach((item, index) => {
        const rowY = panelY + 22 + (index * 18);
        // Print the active hotkey character tag
        this.add.text(panelX, rowY, item.key, keyStyle);
        // Print the localized execution action string description offset horizontally
        this.add.text(panelX + 60, rowY, `- ${item.desc}`, descStyle);
    });
    // --------------------------------------------------------

    // Keep your core Big Card Inspection Preview drawing logic exactly the same below...
    this.fieldGraphics.fillStyle(132631, 1);
    this.fieldGraphics.fillRect(preview.x - bigWidth / 2, preview.y - bigHeight / 2, bigWidth, bigHeight);
    this.fieldGraphics.lineStyle(3, this.selectedPreviewCard ? 3718648 : 3359061, 1);
    this.fieldGraphics.strokeRect(preview.x - bigWidth / 2, preview.y - bigHeight / 2, bigWidth, bigHeight);

    if (this.selectedPreviewCard) {
        const card = this.selectedPreviewCard;
        const savedW = this.cardWidth;
        const savedH = this.cardHeight;
        this.cardWidth = bigWidth;
        this.cardHeight = bigHeight;
        this.renderCardSprite(preview.x, preview.y, card, false);
        this.cardWidth = savedW;
        this.cardHeight = savedH;
        const isUnknown = card.title === "Card Back" || card.name === "Card Back";
        this.add.text(preview.x, preview.y + bigHeight / 2 + 20, `CODE: ${isUnknown ? "UNKNOWN HIDDEN" : card.id || "N/A"}`, {
            fontSize: "13px",
            fontFamily: "monospace",
            fill: "#38bdf8",
            fontWeight: "bold"
        }).setOrigin(.5);
    } else {
        this.add.text(preview.x, preview.y, "[ HOVER CURSOR OVER A CARD\n& PRESS SPACEBAR TO INSPECT ]", {
            fontSize: "12px",
            fontFamily: "monospace",
            fill: "#64748b",
            align: "center"
        }).setOrigin(.5);
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
            const totalCards = hand.length;
            const isLocalSeat = c === this.fieldCoordinates.local;

            for (let index = 0; index < hand.length; index++) {
                const card = hand[index];
                
                // Reuse layout math
                const layout = this.getHandCardLayout(index, totalCards, isLocalSeat);
                const cardX = layout.x;
                const cardY = c.handStart.y + layout.y;
                const halfW = layout.width / 2;
                const halfH = layout.height / 2;

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

            const defeatedZoneCards = state[p.stateKey]?.defeated || [];
            if (defeatedZoneCards.length > 0) {
                if (mouseX >= c.defeated.x - halfW && mouseX <= c.defeated.x + halfW && 
                    mouseY >= c.defeated.y - halfH && mouseY <= c.defeated.y + halfH) {
                    
                    const topDefeatedCard = defeatedZoneCards[defeatedZoneCards.length - 1];
                    if (topDefeatedCard) {
                        console.log(`🎯 [ISOLATED PREVIEW TARGET]: Top defeated card locked: ${topDefeatedCard.id}`);
                        this.selectedPreviewCard = topDefeatedCard;
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
    toggleStackDrawer(playerKey, zoneType = "discard") {
        // If the container doesn't exist, or was cleared, force clean baseline definitions
        if (!this.drawerContainer || !this.drawerContainer.scene) {
            this.drawerContainer = this.add.container(-1536, 0);
            this.drawerContainer.setDepth(2000);
            this.drawerState = {
                isOpen: false,
                playerKey: null,
                zoneType: "discard"
            };
        }

        // 1. CLOSING PATH
        if (!playerKey) {
            this.tweens.killTweensOf(this.drawerContainer);
            this.tweens.add({
                targets: this.drawerContainer,
                x: -1536,
                duration: 350,
                ease: "Cubic.easeIn",
                onComplete: () => {
                    this.drawerState.isOpen = false;
                    this.drawerState.playerKey = null;
                    this.drawerContainer.setVisible(false);
                }
            });
            return;
        }

        // 2. OPENING PATH
        this.tweens.killTweensOf(this.drawerContainer);
        
        // Clear out spatial positions to guarantee a clean entry path alignment
        this.drawerContainer.x = -1536;
        this.drawerContainer.setVisible(true); 
        
        this.drawerState.isOpen = true;
        this.drawerState.playerKey = playerKey;
        this.drawerState.zoneType = zoneType;

        this.renderDrawerContents();

        this.tweens.add({
            targets: this.drawerContainer,
            x: 0,
            duration: 400,
            ease: "Cubic.easeOut"
        });
    }

    /**
     * Renders the internal structural canvas elements nested inside the drawer container frame.
     */
    renderDrawerContents() {
        if (!this.drawerContainer || !this.drawerState.isOpen) return;
        
        this.drawerContainer.removeAll(true);

        const playerKey = this.drawerState.playerKey;
        const zoneType = this.drawerState.zoneType || "discard";
        const targetState = this.lastReceivedState && this.lastReceivedState[playerKey] ? this.lastReceivedState[playerKey] : {};
        const cardList = zoneType === "defeated" ? targetState.defeated || [] : targetState.discard || [];

        const bgPlate = this.add.graphics();
        bgPlate.fillStyle(0x0f172a, 0.98); 
        bgPlate.fillRect(0, 0, 1536, 1080);
        bgPlate.lineStyle(4, 0x38bdf8, 1);
        bgPlate.lineBetween(1536, 0, 1536, 1080);
        this.drawerContainer.add(bgPlate);

        const zoneTitle = zoneType === "defeated" ? "DEFEATED PILE" : "DISCARD CEMETERY PILE";
        const headerText = this.make.text({
            x: 40, y: 30,
            text: `${playerKey.toUpperCase()} ${zoneTitle} (${cardList.length} CARDS)`,
            style: { fontSize: "22px", fontFamily: "monospace", fill: "#f8fafc", fontWeight: "bold" }
        });
        this.drawerContainer.add(headerText);

        const isOwner = this.role === playerKey;
        const isDefeatedView = zoneType === "defeated";
        const instructionString = isOwner && !isDefeatedView && this.role !== "spectator"
            ? "💡 CLICK A CARD TO MOVE IT TO DEFEATED | PRESS [SPACEBAR] TO PREVIEW DETAILED CODE FRAME"
            : "💡 INSPECTION MODE | PRESS [SPACEBAR] TO PREVIEW DETAILED CODE FRAME";

        const subText = this.make.text({
            x: 40, y: 65,
            text: instructionString,
            style: { fontSize: "12px", fontFamily: "monospace", fill: "#94a3b8" }
        });
        this.drawerContainer.add(subText);

        const closeBtn = this.make.text({
            x: 1480, y: 25,
            text: "❌ CLOSE",
            style: { fontSize: "15px", fontFamily: "monospace", fill: "#ef4444", fontWeight: "bold", backgroundColor: "#1e293b", padding: { x: 12, y: 6 } }
        }).setOrigin(1, 0);
        closeBtn.setInteractive({ useHandCursor: true });
        closeBtn.on("pointerdown", () => this.toggleStackDrawer(null));
        this.drawerContainer.add(closeBtn);

        if (cardList.length > 0 && isOwner && !isDefeatedView && this.role !== "spectator") {
            const recycleBtn = this.make.text({
                x: 40, y: 110,
                text: "♻️ RECYCLE ALL DISCARDS TO DECK",
                style: { fontSize: "13px", fontFamily: "monospace", fill: "#10b981", fontWeight: "bold", backgroundColor: "#064e3b", padding: { x: 14, y: 8 } }
            });
            recycleBtn.setInteractive({ useHandCursor: true });
            recycleBtn.on("pointerdown", () => {
                this.socket.emit("recycleDiscardToDeck", { tableId: this.tableId, targetPlayer: playerKey });
            });
            this.drawerContainer.add(recycleBtn);
        }

        const gridStartX = 80;
        const gridStartY = 250;
        const spacingX = 135;
        const spacingY = 185;
        const colsPerLine = 10;

        // Apply your standard top-to-bottom reversed convention rule across all drawers smoothly
        const displayedCards = cardList.slice().reverse();

        displayedCards.forEach((card, index) => {
            const col = index % colsPerLine;
            const row = Math.floor(index / colsPerLine);
            const posX = gridStartX + col * spacingX;
            const posY = gridStartY + row * spacingY;

            const baseIndexBeforeRender = this.children.list.length;

            // Render card block (generates fallback container natively)
            const drawerCardImg = this.renderCardSprite(posX, posY, card, false, "field");

            if (drawerCardImg) {
                drawerCardImg.setData("drawerCardRef", card);
                
                // Recompute original array indexes mathematically to preserve flawless targeting
                const originalIndex = (cardList.length - 1) - index;
                drawerCardImg.setData("drawerCardIndex", originalIndex);

                // FIX: Split interaction attachment logic completely away from rendering steps
                // This ensures cards are ALWAYS displayed in the drawer tree container loop
                if (isOwner && !isDefeatedView && this.role !== "spectator") {
                    if (drawerCardImg.type === "Container") {
                        drawerCardImg.setInteractive(
                            new Phaser.Geom.Rectangle(-this.cardWidth / 2, -this.cardHeight / 2, this.cardWidth, this.cardHeight), 
                            Phaser.Geom.Rectangle.Contains
                        );
                    } else {
                        drawerCardImg.setInteractive({ useHandCursor: true });
                    }

                    drawerCardImg.on("pointerdown", () => {
                        console.log(`📡 [ENGINE DRAWER EMIT]: Moving original index ${originalIndex} from discard to defeated...`);
                        this.socket.emit("moveDiscardToDefeated", { tableId: this.tableId, targetPlayer: playerKey, discardIndex: originalIndex });
                    });
                }

                // CRUCIAL POSITION FIX: Moved outside the conditional block so that cards 
                // are safely nested inside the drawer menu tree layer no matter what!
                this.children.remove(drawerCardImg);
                this.drawerContainer.add(drawerCardImg);
            }
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

        // 4. SCAN STAGE
        if (bZone.stage) {
            const card = bZone.stage;
            
            // Tapped/rotated cards swap their collision width and height profiles
            const hW = card.isTapped ? halfH : halfW;
            const hH = card.isTapped ? halfW : halfH;

            if (mouseX >= c.stage.x - hW && mouseX <= c.stage.x + hW && 
                mouseY >= c.stage.y - hH && mouseY <= c.stage.y + hH) {
                
                console.log(`📡 [NETWORK EMIT]: Toggling tap orientation on STAGE position.`);
                this.socket.emit("toggleCardTap", {
                    tableId: this.tableId,
                    targetPlayer: this.role,
                    zone: "stage",
                    supportIndex: null
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

    displayThanksModal() {
        // 1. Structural safeguard check to prevent duplicate markup injection loops
        if (document.getElementById("thanksModalContainer")) return;

        // 2. Build structured HTML markup styled to match your existing Lobby look
        const modalHtml = `
            <div id="thanksModalContainer" style="
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: #f8fafc;
                font-family: monospace;
                font-size: 16px;
                background: #0f172a;
                padding: 40px;
                border-radius: 12px;
                width: 350px;
                text-align: center;
                border: 2px solid #38bdf8;
                box-shadow: 0px 10px 30px rgba(0,0,0,0.85);
                z-index: 9999;
            ">
                <h2 style="color: #38bdf8; margin-top: 0; font-size: 24px; margin-bottom: 15px;">MATCH CONCLUDED</h2>
                <p style="margin-bottom: 30px; color: #94a3b8; line-height: 1.5;">You have proposed to end the match.<br><br>Thanks for playing!</p>
                <button id="dismissThanksBtn" style="
                    width: 100%;
                    background: #38bdf8;
                    color: #0f172a;
                    font-weight: bold;
                    font-size: 16px;
                    padding: 12px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                ">DISMISS</button>
            </div>
        `;

        // 3. Mount directly into Phaser's DOM framework stack
        const modalDom = this.add.dom(960, 540).createFromHTML(modalHtml).setOrigin(0.5);
        modalDom.setDepth(5000); // Forces structural projection over all card display layers
        modalDom.addListener("click");

        modalDom.on("click", (event) => {
            if (event.target.id === "dismissThanksBtn") {
                // Drop out of the server's table seating registries completely
                this.socket.emit("leaveTable");

                // Hard destroy the overlay container frame from document space
                modalDom.destroy();

                // Transition the player smoothly back to the LobbyScene terminal
                this.scene.start("LobbyScene");
            }
        });
    }

    /**
     * Traces mouse vectors against local hand cards to execute an instant key-driven discard.
     */
    handleKeyboardDiscardAction(mouseX, mouseY) {
        if (!this.lastReceivedState || !this.lastReceivedState[this.role]) return;
        
        const state = this.lastReceivedState;
        const c = this.fieldCoordinates.local;
        const hand = state[this.role].hand || [];

        // Reverse loop to accurately detect bounding boxes for hand card stacking overlays
        for (let index = hand.length - 1; index >= 0; index--) {
            const layout = this.getHandCardLayout(index, hand.length, true);
            const cardX = layout.x;
            const cardY = c.handStart.y + layout.y;
            const halfW = layout.width / 2;
            const halfH = layout.height / 2;

            // Verify if your hovering cursor is inside this explicit card boundaries
            if (mouseX >= cardX - halfW && mouseX <= cardX + halfW &&
                mouseY >= cardY - halfH && mouseY <= cardY + halfH) {
                
                console.log(`📡 [DECOUPLED DISCARD EMIT]: Target locked on hand index ${index}. Sending request to server.`);
                
                // EMIT ONLY: Do not splice arrays or push to discard locally
                this.socket.emit("discardCardFromHand", {
                    tableId: this.tableId,
                    targetPlayer: this.role,
                    handIndex: index
                });
                return; // Break the execution loop immediately after locating match
            }
        }
    }

    /**
     * Scans local hand cards under cursor to move a card to the top or bottom of the deck.
     */
    handleHandToDeckShortcut(mouseX, mouseY, destination) {
        if (!this.lastReceivedState || !this.lastReceivedState[this.role]) return;
        
        const state = this.lastReceivedState;
        const c = this.fieldCoordinates.local;
        const hand = state[this.role].hand || [];

        for (let index = hand.length - 1; index >= 0; index--) {
            const layout = this.getHandCardLayout(index, hand.length, true);
            const cardX = layout.x;
            const cardY = c.handStart.y + layout.y;
            const halfW = layout.width / 2;
            const halfH = layout.height / 2;

            if (mouseX >= cardX - halfW && mouseX <= cardX + halfW &&
                mouseY >= cardY - halfH && mouseY <= cardY + halfH) {
                
                console.log(`📡 [DECOUPLED DECK MOVE EMIT]: Moving hand index ${index} to ${destination} of deck.`);
                
                // EMIT INTENT ONLY: Let the server process the transaction safely
                if (destination === "top") {
                    this.socket.emit("playHandToTopDeck", { tableId: this.tableId, targetPlayer: this.role, handIndex: index });
                } else {
                    this.socket.emit("playHandToBottomDeck", { tableId: this.tableId, targetPlayer: this.role, handIndex: index });
                }
                return;
            }
        }
    }

    handleKeyboardFaceDownAction(mouseX, mouseY) {
        if (!this.lastReceivedState || !this.lastReceivedState[this.role]) return;
        
        const state = this.lastReceivedState;
        const c = this.fieldCoordinates.local;
        const hand = state[this.role].hand || [];

        for (let index = hand.length - 1; index >= 0; index--) {
            const layout = this.getHandCardLayout(index, hand.length, true);
            const cardX = layout.x;
            const cardY = c.handStart.y + layout.y;
            const halfW = layout.width / 2;
            const halfH = layout.height / 2;

            if (mouseX >= cardX - halfW && mouseX <= cardX + halfW &&
                mouseY >= cardY - halfH && mouseY <= cardY + halfH) {
                
                console.log(`📡 [DECOUPLED TRICKERY EMIT]: Sending request to play hand index ${index} face down.`);
                
                // EMIT ONLY: Let the server process the transaction safely
                this.socket.emit("playCardFaceDown", {
                    tableId: this.tableId,
                    targetPlayer: this.role,
                    handIndex: index
                });
                return;
            }
        }
    }


    handleKeyboardToStageAction(mouseX, mouseY) {
        if (!this.lastReceivedState || !this.lastReceivedState[this.role]) return;
        const state = this.lastReceivedState;
        const c = this.fieldCoordinates.local;
        const hand = state[this.role].hand || [];

        for (let index = hand.length - 1; index >= 0; index--) {
            const layout = this.getHandCardLayout(index, hand.length, true);
            const cardX = layout.x;
            const cardY = c.handStart.y + layout.y;
            const halfW = layout.width / 2;
            const halfH = layout.height / 2;

            if (mouseX >= cardX - halfW && mouseX <= cardX + halfW && 
                mouseY >= cardY - halfH && mouseY <= cardY + halfH) {
                
                console.log(`🎭 [KEYBOARD STAGE]: Executing instant predictive slice for index ${index}...`);
                
                // Verify if target stage slot is currently empty locally
                const bZone = state[this.role].battleZone || {};
                if (bZone.stage && Object.keys(bZone.stage).length > 0) {
                    console.log("❌ [LOCAL ALERT]: Stage position is already occupied.");
                    return;
                }

                // Client-Side Prediction Splice
                const [stagedCardData] = hand.splice(index, 1);
                stagedCardData.isFaceDown = false;
                stagedCardData.isTapped = false;
                
                if (!state[this.role].battleZone) state[this.role].battleZone = {};
                state[this.role].battleZone.stage = stagedCardData;

                // Pipeline Network Call Outbound
                this.socket.emit("playCardToStage", { tableId: this.tableId, targetPlayer: this.role, handIndex: index });
                this.handleStateRenderingLoop(state);
                return;
            }
        }
    }

    drawVectorCardBack(container, width, height, scaleFactor) {
        const halfW = width / 2;
        const halfH = height / 2;
        const cardShape = this.add.graphics();
        
        // Cookie Run: Braverse style tones
        // Base Midnight Royal Blue Fill: #0B2545 (730437)
        // Neon Cyan Border Accent: #38BDF8 (3718648)
        // Dark Stripe Accent Overlay: #134074 (1261684)
        cardShape.fillStyle(730437, 1);
        cardShape.lineStyle(2, 3718648, 1);
        
        // 1. Core Card Frame Boundaries
        cardShape.fillRoundedRect(-halfW, -halfH, width, height, 6);
        cardShape.strokeRoundedRect(-halfW, -halfH, width, height, 6);

        // 2. Linear Diagonal Striping Texture Layer
        cardShape.lineStyle(2, 1261684, 0.4); 
        const stripeSpacing = Math.max(10, Math.floor(16 * scaleFactor));
        
        for (let offset = -height; offset < width + height; offset += stripeSpacing) {
            let startX = offset;
            let startY = -halfH;
            let endX = offset + height;
            let endY = halfH;

            // Manual canvas boundary clamping to keep lines safe inside corners
            if (startX < -halfW) {
                startY += (-halfW - startX);
                startX = -halfW;
            }
            if (endX > halfW) {
                endY -= (endX - halfW);
                endX = halfW;
            }

            if (startY < halfH && endY > -halfH && startX < halfW && endX > -halfW) {
                cardShape.lineBetween(startX, startY, endX, endY);
            }
        }
        container.add(cardShape);

        // 3. Centered Large "CRB" Emblem Typography
        const logoFontSize = Math.max(14, Math.floor(22 * scaleFactor));
        const logoStyle = {
            fontSize: `${logoFontSize}px`,
            fontFamily: "monospace",
            fill: "#38bdf8",
            fontWeight: "900",
            align: "center"
        };
        const logoText = this.add.text(0, -Math.floor(10 * scaleFactor), "CRB", logoStyle).setOrigin(0.5);
        container.add(logoText);

        // 4. "Sandbox" Script Tagline Placement
        const tagFontSize = Math.max(8, Math.floor(11 * scaleFactor));
        const tagStyle = {
            fontSize: `${tagFontSize}px`,
            fontFamily: "monospace",
            fill: "#e2e8f0",
            fontWeight: "bold",
            align: "center"
        };
        const tagText = this.add.text(0, Math.floor(16 * scaleFactor), "Sandbox", tagStyle).setOrigin(0.5);
        container.add(tagText);
    }

    animateCardFlight(startPos, endPos, cardData, isFaceDown = false, duration = 350) {
        // 1. Resolve template profile data
        const templateCard = isFaceDown ? { title: "Card Back", isFaceDown: true } : cardData;
        
        // 2. Spawn a single temporary visual asset for the flight duration
        const flyingCard = this.renderCardSprite(startPos.x, startPos.y, templateCard, false, "field");
        flyingCard.setDepth(3000); // Glides clean on top of field boards

        // 3. Move across coordinate paths linearly
        this.tweens.add({
            targets: flyingCard,
            x: endPos.x,
            y: endPos.y,
            duration: duration,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                flyingCard.destroy(); // Purge asset out of memory
                
                // Unfreeze and execute final authoritative state paint pass
                this.handleStateRenderingLoop(this.lastReceivedState);
            }
        });
    }

    calculateZoneCoordinates(roleKey, zoneKey, itemIndex, currentCount) {
        const isLocal = roleKey === this.role;
        const c = isLocal ? this.fieldCoordinates.local : this.fieldCoordinates.remote;

        switch (zoneKey) {
            case "deck":
                return c.deck;
            case "discard":
                return c.discard;
            case "defeated":
                return c.defeated;
            case "stage":
                return c.stage;
            case "fighterA":
                return c.fighterA;
            case "fighterB":
                return c.fighterB;
            case "support":
                return {
                    x: c.supportStart.x + (itemIndex * c.supportOverlap),
                    y: c.supportStart.y
                };
            case "hand":
                const layout = this.getHandCardLayout(itemIndex, currentCount, isLocal);
                return {
                    x: layout.x,
                    y: c.handStart.y + layout.y
                };
            default:
                return { x: 0, y: 0 };
        }
    }

    checkAndAnimateStateChanges(sanitizedState) {
        if (!this.lastReceivedState) return false;

        const rolesToCheck = ["playerA", "playerB"];
        
        for (const targetRole of rolesToCheck) {
            const oldState = this.lastReceivedState[targetRole] || {};
            const newState = sanitizedState[targetRole] || {};

            const oldHand = oldState.hand || [];
            const newHand = newState.hand || [];
            const oldDiscard = oldState.discard || [];
            const newDiscard = newState.discard || [];
            const oldSupport = oldState.support || [];
            const newSupport = newState.support || [];
            const oldDefeated = oldState.defeated || [];
            const newDefeated = newState.defeated || [];

            const oldBZone = oldState.battleZone || {};
            const newBZone = newState.battleZone || {};

            // 1. DRAW CARD (Hand Grew)
            if (newHand.length > oldHand.length) {
                const start = this.calculateZoneCoordinates(targetRole, "deck");
                const end = this.calculateZoneCoordinates(targetRole, "hand", newHand.length - 1, newHand.length);
                
                this.lastReceivedState = sanitizedState;
                this.animateCardFlight(start, end, newHand[newHand.length - 1], this.role !== "spectator", 350);
                return true;
            }

            // 2. DISCARD FROM HAND (Hand Shrank & Discard Grew)
            if (newHand.length < oldHand.length && newDiscard.length > oldDiscard.length) {
                const start = this.calculateZoneCoordinates(targetRole, "hand", oldHand.length - 1, oldHand.length);
                const end = this.calculateZoneCoordinates(targetRole, "discard");
                
                this.lastReceivedState = sanitizedState;
                this.animateCardFlight(start, end, newDiscard[newDiscard.length - 1], false, 300);
                return true;
            }

            // 3. HAND TO SUPPORT TRAY (Hand Shrank & Support Grew)
            if (newHand.length < oldHand.length && newSupport.length > oldSupport.length) {
                const supportIdx = newSupport.length - 1;
                const start = this.calculateZoneCoordinates(targetRole, "hand", oldHand.length - 1, oldHand.length);
                const end = this.calculateZoneCoordinates(targetRole, "support", supportIdx);

                this.lastReceivedState = sanitizedState;
                this.animateCardFlight(start, end, newSupport[supportIdx], false, 300);
                return true;
            }

            // 4. HAND TO FIGHTER SLOT (Hand Shrank & Fighter Slot Filled)
            const slots = ["fighterA", "fighterB"];
            for (const slotKey of slots) {
                const oldCard = oldBZone[slotKey]?.card;
                const newCard = newBZone[slotKey]?.card;

                if (newHand.length < oldHand.length && !oldCard && newCard) {
                    const start = this.calculateZoneCoordinates(targetRole, "hand", oldHand.length - 1, oldHand.length);
                    const end = this.calculateZoneCoordinates(targetRole, slotKey);

                    this.lastReceivedState = sanitizedState;
                    this.animateCardFlight(start, end, newCard, newCard.isFaceDown, 300);
                    return true;
                }
            }

            // 5. FIGHTER TO DEFEATED ZONE (Fighter Emptied & Defeated Grew)
            for (const slotKey of slots) {
                const oldCard = oldBZone[slotKey]?.card;
                const newCard = newBZone[slotKey]?.card;

                if (oldCard && !newCard && newDefeated.length > oldDefeated.length) {
                    const start = this.calculateZoneCoordinates(targetRole, slotKey);
                    const end = this.calculateZoneCoordinates(targetRole, "defeated");
                    const defeatedCard = newDefeated[newDefeated.length - 1];

                    this.lastReceivedState = sanitizedState;
                    this.animateCardFlight(start, end, defeatedCard, false, 350);
                    return true;
                }
            }
        }

        return false; // Return false if no structural animation changes occurred
    }

}
