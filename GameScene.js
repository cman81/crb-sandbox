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
        // Load your audio assets here (adjust paths to your asset directory)
        this.load.audio("sound_draw", "assets/sounds/draw.mp3");
        this.load.audio("sound_play", "assets/sounds/play.mp3");
        this.load.audio("sound_recycle", "assets/sounds/recycle.mp3");
    }

    create() {
        // 1. Core Visual Layer Setup
        this.initializeGraphicsLayers();
        this.renderMatchBackground();
        this.initializeCardDimensions();

        // 2. State & Networking Hydration
        this.initializeStateTrackingArrays();
        this.establishServerConnection();
        this.setupNetworkEventListeners();

        // 3. User Input & Macro Routing Maps
        this.registerKeyboardShortcuts();
        this.registerMouseInteractionListeners();
    }

     /**
     * Sets up mouse actions for dragging cards, dropping cards into zones, and clicking the deck.
     * Tells the server when actions happen and returns cards if a move is invalid.
     */
    registerMouseInteractionListeners() {
        // 1. Handle Active Dragging Movements
        this.input.on("drag", (pointer, gameObject, dragX, dragY) => {
            gameObject.x = dragX;
            gameObject.y = dragY;
            gameObject.setDepth(1000);
        });

        // 2. Handle Failed Drag Releases
        this.input.on("dragend", (pointer, gameObject, dropped) => {
            if (!dropped && gameObject.data?.has("originalX")) {
                this.resetCardPosition(gameObject);
            }
        });

        // 3. Handle Dropping Cards onto Drop Zones
        this.input.on("drop", (pointer, gameObject, dropZone) => {
            const handIndex = gameObject.data.get("handIndex");
            const zoneKey = dropZone.data.get("zoneKey");

            if (this.role === "spectator" || handIndex === undefined || handIndex === null) {
                this.resetCardPosition(gameObject);
                return;
            }

            // Prevent stacking if the target slot is already occupied
            if (this.isZoneOccupied(zoneKey)) {
                console.log(`⚠️ [ACTION BLOCKED]: Cannot play card. ${zoneKey} is already occupied.`);
                this.resetCardPosition(gameObject);
                return;
            }

            // Temporarily freeze input while the server processes the move
            this.lastDropPos = { x: pointer.x, y: pointer.y };
            gameObject.setAlpha(0.8);
            gameObject.disableInteractive();
            gameObject.setData("isPendingServer", true);

            // Execute network payload transfer using the new assistant method
            this.sendCardPlayToServer(zoneKey, handIndex, gameObject);
        });

        // 4. Handle Deck Clicking Interactions
        this.input.on("pointerdown", pointer => {
            if (this.role === "spectator" || !this.lastReceivedState) return;
            if (this.drawerState?.isOpen) return;

            if (this.isPointerOverDeck(pointer)) {
                this.executeDeckDrawAction();
            }
        });
    }

    /**
     * Sends a network event to the server when a card is dropped into a zone.
     * Resets the card position if the targeted zone is invalid.
     * 
     * @param {string} zoneKey - Target zone identifier.
     * @param {number} handIndex - Hand array index of the moved card.
     * @param {Phaser.GameObjects.GameObject} gameObject - The card visual component.
     */
    sendCardPlayToServer(zoneKey, handIndex, gameObject) {
        const payload = { tableId: this.tableId, targetPlayer: this.role, handIndex: handIndex };

        switch (zoneKey) {
            case "support":
                this.socket.emit("playCardToSupport", payload);
                break;
            case "fighterA":
            case "fighterB":
                this.socket.emit("playCardToFighter", { ...payload, targetSlot: zoneKey });
                break;
            case "discard":
                this.socket.emit("discardCardFromHand", payload);
                break;
            case "stage":
                this.socket.emit("playCardToStage", payload);
                break;
            default:
                // Fallback for invalid custom targets
                this.lastDropPos = null;
                gameObject.setData("isPendingServer", false);
                this.resetCardPosition(gameObject);
                break;
        }
    }

    /**
     * Resets a card's position, opacity, and interactivity back to its default state.
     * 
     * @param {Phaser.GameObjects.GameObject} gameObject - The card visual component.
     */
    resetCardPosition(gameObject) {
        gameObject.x = gameObject.data.get("originalX");
        gameObject.y = gameObject.data.get("originalY");
        gameObject.setAlpha(1);
        gameObject.setInteractive();
        gameObject.setDepth(0);
    }

    /**
     * Checks if the mouse pointer is hovering over the deck coordinates.
     * 
     * @param {Object} pointer - Mouse pointer object.
     * @returns {boolean} True if the pointer is over the deck.
     */
    isPointerOverDeck(pointer) {
        const deckCoord = this.fieldCoordinates?.local?.deck;
        if (!deckCoord) return false;

        const halfW = this.cardWidth / 2;
        const halfH = this.cardHeight / 2;

        return (
            pointer.x >= deckCoord.x - halfW &&
            pointer.x <= deckCoord.x + halfW &&
            pointer.y >= deckCoord.y - halfH &&
            pointer.y <= deckCoord.y + halfH
        );
    }

    /**
     * Checks the player's remaining deck size and sends a draw command to the server.
     * Suppresses the draw sound cue if the deck is completely empty.
     */
    executeDeckDrawAction() {
        const myStateData = this.lastReceivedState[this.role] || {};
        const deckArray = myStateData.deck || [];
        const cardsRemaining = Array.isArray(deckArray) ? deckArray.length : 0;

        if (cardsRemaining <= 0) {
            console.log("⚠️ [AUDIO ABORT]: Deck is empty. Suppressing draw audio cue.");
            return;
        }

        console.log("🎲 [DECOUPLED INPUT]: Clean singular deck draw event issued via permanent listener.");
        
        // Play audio feedback with a small randomized pitch shift
        this.sound.play("sound_draw", {
            volume: 0.8,
            pitch: Phaser.Math.FloatBetween(0.96, 1.04)
        });

        this.socket.emit("drawCard", { tableId: this.tableId, targetPlayer: this.role });
    }

    /**
     * Checks if a specific field zone already has a card inside it.
     * 
     * @param {string} zoneKey - Target zone identifier.
     * @returns {boolean} True if the zone is already occupied.
     */
    isZoneOccupied(zoneKey) {
        const state = this.lastReceivedState;
        const myBZone = state?.[this.role]?.battleZone || {};

        if (zoneKey === "stage") {
            return myBZone.stage && Object.keys(myBZone.stage).length > 0;
        }
        if (zoneKey === "fighterA" || zoneKey === "fighterB") {
            const slotCard = myBZone[zoneKey]?.card;
            return slotCard && Object.keys(slotCard).length > 0;
        }
        return false;
    }

    registerKeyboardShortcuts() {
        // Spacebar triggers a quick card preview on the right panel
        this.input.keyboard.on("keydown-SPACE", () => {
            this.scanCardHitboxesForPreview();
        });

        // Enter triggers a full-sized card inspection modal zoom overlay
        this.input.keyboard.on("keydown-ENTER", () => {
            this.scanCardHitboxesForPreview();
            
            if (this.selectedPreviewCard) {
                this.displayLargeCardModal(this.selectedPreviewCard);
            }
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

        this.input.keyboard.on("keydown-E", () => {
            if (this.role === "spectator") return;
            const mouseX = this.input.activePointer.x;
            const mouseY = this.input.activePointer.y;
            
            // Scan exactly what card the player's cursor is hovering over
            const targetInfo = this.findCardAtCoordinates(mouseX, mouseY);
            
            if (targetInfo) {
                // Enforce basic team security checks
                if (targetInfo.ownerId !== this.role) {
                    console.log("⚠️ [ACTION BLOCKED]: You cannot move your opponent's cards.");
                    return;
                }

                const validZones = ['hand', 'defeated', 'support', 'discard', 'fighterA', 'fighterB', 'stage'];
                if (!validZones.includes(targetInfo.zoneName)) {
                    return;
                }

                // Pass the full target info payload to the modal constructor
                this.displayDeckPlacementModal(targetInfo);
            }
        });

        // 🧪 SEAT-SWAP SANDBOX CHEAT CODE: Press [K] to toggle between Player A and Player B seats instantly
        this.input.keyboard.on("keydown-K", () => {
            // Ignore if you are currently just a spectator
            if (this.role === "spectator") {
                console.log("⚠️ [CHEAT CODE ABORTED]: Spectators cannot jump into active player seats.");
                return;
            }

            const oldRole = this.role;
            // Swap the string variable seamlessly
            this.role = oldRole === "playerA" ? "playerB" : "playerA";
            
            console.log(`⚡ [SANDBOX CHEAT]: Swapping active seating perspectives from ${oldRole} ➡️ ${this.role}`);

            // 1. Notify the server of our updated state identity
            this.socket.emit("joinTable", { tableId: this.tableId, role: this.role });
            
            // 2. Request a clean master state refresh payload from the server channel
            this.socket.emit("getGameState", { tableId: this.tableId, role: this.role });

            // 3. Force Phaser to clear and redraw everything from our new perspective angle
            if (this.lastReceivedState) {
                this.handleStateRenderingLoop(this.lastReceivedState);
            }
        });

        // Various keys for moving a card from one zone to another:
        // (H)and, (S)upport, (D)iscard, De(f)eated, D(e)ck
        this.input.keyboard.on("keydown", event => {
            if (this.role === "spectator") return;

            const key = event.key.toLowerCase();
            const keyMap = {
                h: "hand",
                s: "support",
                d: "discard",
                f: "defeated",
                a: "fighterA",
                b: "fighterB",
                g: "stage",
                x: "extraDeck"
            };
            const destinationZone = keyMap[key];
            if (!destinationZone) return;

            const mouseX = this.input.activePointer.x;
            const mouseY = this.input.activePointer.y;
            const targetInfo = this.findCardAtCoordinates(mouseX, mouseY);

            if (targetInfo) {
                this.executeKeyboardZoneTransfer(targetInfo, destinationZone, mouseX, mouseY, key);
            }
        });
    }

    /**
     * Moves a card to a new zone when you press a keyboard shortcut, then updates the screen and sends the
     * move to the server.
     * 
     * @param {Object} targetInfo - Card info.
     * @param {string} destinationZone - Zone where the card is heading.
     * @param {number} mouseX - Mouse pointer x-coorindate.
     * @param {number} mouseY - Mouse pointer y-coorindate.
     * @param {string} key - Keyboard key that was pressed.
     */
    executeKeyboardZoneTransfer(targetInfo, destinationZone, mouseX, mouseY, key) {
        // Enforce boundary parameters: Block moving opponent assets or tracking redundant zones
        if (targetInfo.zoneName === destinationZone) {
            console.log(`⚠️ [ACTION BLOCKED]: Card is already in the ${destinationZone} zone.`);
            return;
        }
        if (targetInfo.ownerId !== this.role) {
            console.log("⚠️ [ACTION BLOCKED]: You cannot move your opponent's cards!");
            return;
        }

        // Cache the last target location vectors for flight pathway interpolation engines
        this.lastDropPos = { x: mouseX, y: mouseY };
        console.log(`📡 [DYNAMIC SHORTCUT ROUTER]: Moving card index ${targetInfo.index} from ${targetInfo.zoneName} to ${destinationZone}.`);

        const fighterOrStageZones = ["fighterA", "fighterB", "stage", "extraA", "extraB"];

        // 1. Route actions if moving OUT of a restricted combat zone slot matrix
        if (fighterOrStageZones.includes(targetInfo.zoneName)) {
            this.socket.emit("requestFighterOrStageToZone", {
                tableId: this.tableId,
                targetPlayer: targetInfo.ownerId,
                targetZone: targetInfo.zoneName,
                destinationZone: destinationZone
            });
        }

        // 2. Select the correct callback method depending on where the item is going INTO
        const callbackEvent = fighterOrStageZones.includes(destinationZone) 
            ? "requestCardToFighterOrStage" 
            : "requestCardMove";

        this.socket.emit(callbackEvent, {
            tableId: this.tableId,
            targetPlayer: targetInfo.ownerId,
            targetZone: targetInfo.zoneName,
            targetIndex: targetInfo.index,
            destinationZone: destinationZone
        });

        // 3. Coordinate sliding menu drawer states dynamically based on hotkeys pressed
        if (targetInfo.zoneName === "extraDeck") {
            this.toggleStackDrawer(null);
        }
        if (key === "x") {
            this.toggleStackDrawer(this.role, "extraDeck");
        }
    }

    setupNetworkEventListeners() {
        this.socket.on("stateUpdate", sanitizedState => {
            // 1. Hand off the incoming state array frame to your decoupled Motion Analyzer
            const didTriggerAnimation = this.checkAndAnimateStateChanges(sanitizedState);

            // 2. If a card flight (draw/discard/deploy) animation is running, yield early
            if (didTriggerAnimation) return;

            // 3. Fallback: Execute the definitive visual paint pass immediately
            this.lastReceivedState = sanitizedState;
            this.handleStateRenderingLoop(sanitizedState);
        });

        this.socket.on("cardTap", tapData => {
            console.log(`📡 [NETWORK RECEIVE]: UUID cardTap caught for token: ${tapData.uuid}`);

            let matchedObject = null;
            for (let i = 0; i < this.children.list.length; i++) {
                const child = this.children.list[i];
                if (child.data && child.data.get("uuid") === tapData.uuid && child.x <= 1536) {
                    matchedObject = child;
                    break; // Guard verified. Kill loop instantly to prevent preview hijack.
                }
            }

            if (!matchedObject) {
                console.warn("⚠️ [ANIMATION ABORT]: Could not locate matching UUID asset: " + tapData.uuid);
                return;
            }

            // 1. LOCK VISIBILITY: Register this card's unique UUID as actively animating
            this.animatingUuids.push(tapData.uuid);

            const finalAngle = tapData.isTapped ? -450 : 360;
            const startAngle = tapData.isTapped ? 0 : -90;

            matchedObject.setAngle(startAngle);
            matchedObject.setDepth(3000); // Elevate above everything else while spinning

            this.tweens.add({
                targets: matchedObject,
                angle: finalAngle,
                duration: 500,
                ease: 'Cubic.easeInOut',
                onComplete: () => {
                    matchedObject.setAngle(tapData.isTapped ? -90 : 0);

                    // Manually sync local cache data arrays to match the server model
                    if (this.lastReceivedState && this.lastReceivedState[tapData.targetPlayer]) {
                        const targetState = this.lastReceivedState[tapData.targetPlayer];
                        const bZone = targetState.battleZone || {};

                        if (tapData.zone === "fighterA" && bZone.fighterA && bZone.fighterA.card) {
                            if (bZone.extraA) {
                                bZone.extraA.isTapped = tapData.isTapped;
                            } else {
                                bZone.fighterA.card.isTapped = tapData.isTapped;
                            }
                        }
                        else if (tapData.zone === "fighterB" && bZone.fighterB && bZone.fighterB.card) {
                            if (bZone.extraB) {
                                bZone.extraB.isTapped = tapData.isTapped;
                            } else {
                                bZone.fighterB.card.isTapped = tapData.isTapped;
                            }
                        }
                        else if (tapData.zone === "stage" && bZone.stage) bZone.stage.isTapped = tapData.isTapped;
                        else if (tapData.zone === "support" && Array.isArray(targetState.support) && targetState.support[tapData.supportIndex]) {
                            targetState.support[tapData.supportIndex].isTapped = tapData.isTapped;
                        }
                    }

                    // 2. UNLOCK VISIBILITY: Remove the UUID from our lock list
                    if (this.animatingUuids) {
                        this.animatingUuids = this.animatingUuids.filter(id => id !== tapData.uuid);
                    }

                    // Force a clean visual paint pass so the real card shows back up at its perfect final position
                    this.handleStateRenderingLoop(this.lastReceivedState);
                }
            });
        });
    }

    establishServerConnection() {
        this.socket = globalSocket;
        this.socket.emit('joinTable', { tableId: this.tableId, role: this.role });

        // --- AUTO-REVOKE ON ENTRY ---
        if (this.role === "playerA" || this.role === "playerB") {
            this.socket.emit("revokeEndGame", { tableId: this.tableId, targetPlayer: this.role });
        }

        this.socket.emit('getGameState', { tableId: this.tableId, role: this.role });
    }

    /**
     * Define Card Dimensions (Standard Field size)
     */
    initializeCardDimensions() {
        this.cardWidth = 110;
        this.cardHeight = 154;

        // THREE-COLUMN HORIZONTAL GRID MATRIX COORDINATES WITH ADJUSTED TRAYS
        this.fieldCoordinates = {
            local: {
                deck: { x: 1450, y: 700 },
                discard: { x: 1450, y: 880 },
                defeated: { x: 470, y: 700 },
                stage: { x: 1310, y: 700 },
                fighterA: { x: 760, y: 700 },
                fighterB: { x: 1060, y: 700 },

                // Bottom tray layout specs
                supportStart: { x: 620, y: 920 },
                supportOverlap: 65,
                trayWidth: 730,
                trayHeight: 166,

                handStart: { x: 80, y: 650 },
                handSpacingX: 115,
                handSpacingY: 170
            },
            remote: {
                deck: { x: 470, y: 380 },
                discard: { x: 470, y: 200 },
                defeated: { x: 1430, y: 160 },
                stage: { x: 610, y: 380 },
                fighterA: { x: 1060, y: 380 },
                fighterB: { x: 760, y: 380 },

                supportStart: { x: 620, y: 160 },
                supportOverlap: 65,
                trayWidth: 730,
                trayHeight: 166,

                handStart: { x: 80, y: 120 },
                handSpacingX: 115,
                handSpacingY: 170
            },
            previewAnchor: { x: 1728, y: 540 }
        };

        // extraA and extraB cards get placed directly over fighterA and fighterB respectively
        this.fieldCoordinates.local.extraA = this.fieldCoordinates.local.fighterA;
        this.fieldCoordinates.local.extraB = this.fieldCoordinates.local.fighterB;
        this.fieldCoordinates.remote.extraA = this.fieldCoordinates.remote.fighterA;
        this.fieldCoordinates.remote.extraB = this.fieldCoordinates.remote.fighterB;
    }

    /**
     * Paint the entire 1920x1080 canvas viewport window space with this table's flat arena color
     */
    renderMatchBackground() {
        const bgFill = this.add.graphics();
        bgFill.fillStyle(this.backgroundColor, 1);
        bgFill.fillRect(0, 0, 1920, 1080);
        bgFill.setDepth(-200);
    }

    /**
     * Hard wipe old, dead graphics container properties from prior visits
     */
    initializeGraphicsLayers() {
        this.fieldGraphics = null;
        this.dividerGraphics = null;
    }

    /**
     * Renders a card image or generates a vector fallback if the asset is missing.
     * Sets up scaling parameters, textures, tracking data, and pointer inspection events.
     * 
     * @param {number} x - Target center x-coordinate.
     * @param {number} y - Target center y-coordinate.
     * @param {Object} card - Card info.
     * @param {boolean} isTapped - Tapped rotation state.
     * @param {string} [currentZone="field"] - Target zone identity.
     * @param {number} [baseDepth=50] - Rendering layer priority.
     * @returns {Phaser.GameObjects.Image|Phaser.GameObjects.Container} Rendered Phaser component.
     */
    renderCardSprite(x, y, card, isTapped, currentZone = "field", baseDepth = 50) {
        let bundleKey = "system_ui";
        let frameKey = "card_back";
        let useFallback = false;
        let appliedWidth = this.cardWidth;
        let appliedHeight = this.cardHeight;
        let currentScaleFactor = 1;

        const isCardBack = !card || card.title === "Card Back" || card.name === "Card Back" || card.isFaceDown;

        // 1. Calculate dynamic hand scale parameters
        if (this.lastReceivedState && card && !isCardBack && currentZone === "hand") {
            const playerState = this.lastReceivedState[this.role] || {};
            const handArray = playerState.hand || [];
            const cardIdToMatch = card.id || "";
            const handIndex = handArray.findIndex(c => c && c.id === cardIdToMatch);

            if (handIndex !== -1) {
                const layout = this.getHandCardLayout(handIndex, handArray.length, true);
                appliedWidth = layout.width;
                appliedHeight = layout.height;
                currentScaleFactor = layout.width / this.cardWidth;
            }
        }

        if (!isCardBack) {
            frameKey = card.id || "";
            bundleKey = this.getBundleKeyFromCard(card, bundleKey);
        }

        if (!this.textures.exists(bundleKey) || !this.textures.get(bundleKey).has(frameKey)) {
            useFallback = true;
        }

        const targetAngle = (isTapped === true || (isTapped !== false && card?.isTapped)) ? -90 : 0;

        // 2. Branch A: Standard Image Asset Render Path
        if (!useFallback) {
            const cardSprite = this.add.image(x, y, bundleKey, frameKey);
            cardSprite.setDisplaySize(appliedWidth, appliedHeight);
            cardSprite.setAngle(targetAngle);
            cardSprite.setDepth(baseDepth);

            if (card?.uuid) cardSprite.setData("uuid", card.uuid);
            if (card?.uuid && this.animatingUuids?.indexOf(card.uuid) !== -1) cardSprite.setAlpha(0);

            this.attachCardInspectionListeners(cardSprite, card, isCardBack);
            return cardSprite;
        }

        // 3. Branch B: Procedural Vector Fallback Container Path
        const fallbackContainer = this.add.container(x, y);
        fallbackContainer.setDepth(baseDepth);
        fallbackContainer.setAngle(targetAngle);

        if (isCardBack) {
            this.drawVectorCardBack(fallbackContainer, appliedWidth, appliedHeight, currentScaleFactor);
        } else {
            this.drawVectorCardFront(fallbackContainer, card, appliedWidth, appliedHeight, currentScaleFactor);
        }

        if (card?.uuid) fallbackContainer.setData("uuid", card.uuid);
        fallbackContainer.setData("cardData", card);
        fallbackContainer.setData("computedWidth", appliedWidth);
        fallbackContainer.setData("computedHeight", appliedHeight);

        if (card?.uuid && this.animatingUuids?.indexOf(card.uuid) !== -1) {
            fallbackContainer.setAlpha(0);
        }

        this.attachCardInspectionListeners(fallbackContainer, card, isCardBack);
        return fallbackContainer;
    }

    /**
     * Draws the text elements, rounded borders, and background plate for a fallback card front.
     * Separates complex text wrap configurations and vector rendering from the main sprite pipeline.
     * 
     * @param {Phaser.GameObjects.Container} container - Target parent container component.
     * @param {Object} card - Card info.
     * @param {number} width - Rendered width boundary.
     * @param {number} height - Rendered height boundary.
     * @param {number} scaleFactor - Hand display scale multiplier.
     */
    drawVectorCardFront(container, card, width, height, scaleFactor) {
        const halfW = width / 2;
        const halfH = height / 2;

        const cardShape = this.add.graphics();
        cardShape.fillStyle(16119285, 1); // #f5f5f5
        cardShape.lineStyle(2, 9741240, 1); // #94a3b8
        cardShape.fillRoundedRect(-halfW, -halfH, width, height, 6);
        cardShape.strokeRoundedRect(-halfW, -halfH, width, height, 6);
        container.add(cardShape);

        // Render card title text with wrap parameters
        const titleFontSize = Math.max(7, Math.floor(10 * scaleFactor));
        const rawTitle = card.title || card.name || "Unknown Card";
        const titleStyle = {
            fontSize: `${titleFontSize}px`,
            fontFamily: "monospace",
            fill: "#1e293b",
            fontWeight: "bold",
            align: "center",
            wordWrap: { width: width - 8 }
        };
        const titleText = this.add.text(0, -halfH + Math.floor(12 * scaleFactor), rawTitle, titleStyle).setOrigin(0.5, 0);
        container.add(titleText);

        // Render bottom corner card code ID markers
        const idFontSize = Math.max(6, Math.floor(9 * scaleFactor));
        const idStyle = {
            fontSize: `${idFontSize}px`,
            fontFamily: "monospace",
            fill: "#64748b",
            fontWeight: "bold"
        };
        const idText = this.add.text(-halfW + Math.floor(6 * scaleFactor), halfH - Math.floor(10 * scaleFactor), card.id || "N/A", idStyle).setOrigin(0, 0.5);
        container.add(idText);
    }

    /**
     * Draws the striped procedural pattern overlay for a fallback card back.
     * Separates math-heavy canvas line generation cycles from core asset managers.
     * 
     * @param {Phaser.GameObjects.Container} container - Target parent container component.
     * @param {number} width - Rendered width boundary.
     * @param {number} height - Rendered height boundary.
     * @param {number} scaleFactor - Hand display scale multiplier.
     */
    drawVectorCardBack(container, width, height, scaleFactor) {
        const halfW = width / 2;
        const halfH = height / 2;

        const cardShape = container.scene.add.graphics();
        container.add(cardShape);
        
        cardShape.fillStyle(730437, 1);
        cardShape.lineStyle(2, 3718648, 1);
        cardShape.fillRoundedRect(-halfW, -halfH, width, height, 6);
        cardShape.strokeRoundedRect(-halfW, -halfH, width, height, 6);
        cardShape.lineStyle(2, 1261684, 0.4);

        const stripeSpacing = Math.max(10, Math.floor(16 * scaleFactor));
        for (let offset = -height; offset < width + height; offset += stripeSpacing) {
            let startX = offset;
            let startY = -halfH;
            let endX = offset + height;
            let endY = halfH;

            if (startX < -halfW) {
                startY += -halfW - startX;
                startX = -halfW;
            }
            if (endX > halfW) {
                endY -= endX - halfW;
                endX = halfW;
            }
            if (startY < halfH && endY > -halfH && startX < halfW && endX > -halfW) {
                cardShape.lineBetween(startX, startY, endX, endY);
            }
        }

        const logoFontSize = Math.max(14, Math.floor(22 * scaleFactor));
        const logoStyle = { fontSize: `${logoFontSize}px`, fontFamily: "monospace", fill: "#38bdf8", fontWeight: "900", align: "center" };
        const logoText = this.add.text(0, -Math.floor(10 * scaleFactor), "CRB", logoStyle).setOrigin(0.5);
        container.add(logoText);

        const tagFontSize = Math.max(8, Math.floor(11 * scaleFactor));
        const tagStyle = { fontSize: `${tagFontSize}px`, fontFamily: "monospace", fill: "#e2e8f0", fontWeight: "bold", align: "center" };
        const tagText = this.add.text(0, Math.floor(16 * scaleFactor), "Sandbox", tagStyle).setOrigin(0.5);
        container.add(tagText);
    }

    getBundleKeyFromCard(card, bundleKey) {
        if (card.id.startsWith('BS1-')) bundleKey = 'BS01_cards';
        else if (card.id.startsWith('BS2-')) bundleKey = 'BS02_cards';
        else if (card.id.startsWith('BS3-')) bundleKey = 'BS03_cards';
        else if (card.id.startsWith('BS4-')) bundleKey = 'BS04_cards';
        else if (card.id.startsWith('BS5-')) bundleKey = 'BS05_cards';
        else if (card.id.startsWith('BS6-')) bundleKey = 'BS06_cards';
        else if (card.id.startsWith('BS7-')) bundleKey = 'BS07_cards';
        else if (card.id.startsWith('BS8-')) bundleKey = 'BS08_cards';
        else if (card.id.startsWith('BS9-')) bundleKey = 'BS09_cards';
        else if (card.id.startsWith('BS10-')) bundleKey = 'BS10_cards';
        else if (card.id.startsWith('BS11-')) bundleKey = 'BS11_cards';
        else if (card.id.startsWith('P-')) bundleKey = 'P_cards';
        else if (card.id.startsWith('ST1-')) bundleKey = 'ST01_cards';
        else if (card.id.startsWith('ST2-')) bundleKey = 'ST02_cards';
        else if (card.id.startsWith('ST3-')) bundleKey = 'ST03_cards';
        else if (card.id.startsWith('ST4-')) bundleKey = 'ST04_cards';
        else if (card.id.startsWith('ST5-')) bundleKey = 'ST05_cards';
        else if (card.id.startsWith('ST6-')) bundleKey = 'ST06_cards';
        else if (card.id.startsWith('ST7-')) bundleKey = 'ST07_cards';
        else if (card.id.startsWith('ST8-')) bundleKey = 'ST08_cards';
        else if (card.id.startsWith('ST9-')) bundleKey = 'ST09_cards';
        else if (card.id.startsWith('ST10-')) bundleKey = 'ST10_cards';
        return bundleKey;
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

    handleStateRenderingLoop(state) {
        this.resetRenderLayer();
        this.drawPanelDividers();
        
        if (this.fieldGraphics) {
            this.fieldGraphics.lineStyle(2, 16777215, .15);
        }
        
        this.drawFieldBoard(state);
        this.drawPreviewPanel();
        
        if (this.drawerContainer && this.drawerState && this.drawerState.isOpen) {
            this.renderDrawerContents();
            this.drawerContainer.setVisible(true);
        } else if (this.drawerContainer) {
            this.drawerContainer.setVisible(false);
        }

        // FIX: Commit the newly rendered state to your historical cache 
        // at the very end of the pass, preserving delta accuracy during drawings!
        this.lastReceivedState = state;
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
            if (child.type === "Text" && (child.text.includes("HAND") || child.text.includes("ARENA ZONE") || child.text.includes("INSPECTION"))) {
                return;
            }
            // KEEP THE GHOST PLACEHOLDER ALIVE DURING INTERMEDIARY RE-RENDERS
            if (child.data && child.data.get("isPendingServer") === true) {
                return;
            }
            if (child.type === "Text" || child.type === "Image") {
                childrenToDestroy.push(child);
            }
            if (child.type === "Container") {
                if (this.drawerContainer && child === this.drawerContainer) {
                    return;
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

        // 🎨 VISUAL TEXT MOD INDICATOR ENGINE
        // Read the global registry status parameter passed down by BootScene
        const isModdedGraphicsActive = this.registry.get('customArtModsActive') === true;

        const engineTagStyle = {
            fontSize: "11px",
            fontFamily: "monospace",
            fontWeight: "bold",
            padding: { x: 8, y: 4 }
        };

        if (isModdedGraphicsActive) {
            // Drop a clean neon teal notification block right inside your arena terminal line area
            this.add.text(1180, 16, "🎨 MODDED GRAPHICS ENGINE ACTIVE", {
                ...engineTagStyle,
                fill: "#38bdf8",
                backgroundColor: "#0c4a6e"
            }).setOrigin(0, 0);
        } else {
            // Drop a quiet slate gray block showing fallback vector operations are running
            this.add.text(1180, 16, "⚙️ PROCEDURAL VECTOR ENGINE PROMPT", {
                ...engineTagStyle,
                fill: "#94a3b8",
                backgroundColor: "#1e293b"
            }).setOrigin(0, 0);
        }
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
            this.renderCardSprite(c.deck.x, c.deck.y, { name: "Card Back", isFaceDown: true }, false);
        }

        // Calculate vertical layout step position relative to the discard pile boundary
        const extraDeckBtnY = isLocalSeat 
            ? c.discard.y + this.cardHeight / 2 + 22   // Below local discard
            : c.discard.y - this.cardHeight / 2 - 22;  // Above remote discard

        const extraDeckBtnStyle = {
            fontSize: "12px",
            fontFamily: "monospace",
            fill: "#38bdf8",
            fontWeight: "bold",
            backgroundColor: "#1e293b",
            padding: { x: 10, y: 5 }
        };

        // Render text anchor layout
        const extraDeckBtn = this.add.text(c.discard.x, extraDeckBtnY, "🃏 EXTRA DECK", extraDeckBtnStyle).setOrigin(0.5);
        this.drawButtonOutline(extraDeckBtn);

        // Bind input tracker to slide out the matching player asset lane
        extraDeckBtn.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
            this.toggleStackDrawer(stateKey, "extraDeck");
        });
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
        
        if (zoneKey === "fighterA" || zoneKey === "fighterB") {
            this.renderFighterZoneContents(point, battleZone, zoneKey);
            
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
        } else if (zoneKey === "stage") {
            const stageCard = battleZone.stage || pData.stage;
            if (stageCard && Object.keys(stageCard).length > 0) {
                this.renderCardSprite(point.x, point.y, stageCard, stageCard.isTapped || false, "field");
            }
        } else if (zoneKey === "deck") {
            this.renderDeckZoneStack(point, pData.deck, isLocalSeat);
        } else if (zoneKey === "discard" || zoneKey === "defeated") {
            const targetPile = pData[zoneKey];
            if (Array.isArray(targetPile) && targetPile.length > 0) {
                if (zoneKey === "defeated") {
                    // Splay cards from top to bottom with a 30px vertical cascade
                    targetPile.forEach((card, index) => {
                        this.renderCardSprite(
                            point.x, 
                            point.y + (index * 30), 
                            card, 
                            card.isTapped || false, 
                            "field", 
                            50 + index // Dynamically elevates depth so newer cards lay on top
                        );
                    });
                } else {
                    // Keep standard stacked render for discard pile
                    const topCard = targetPile[targetPile.length - 1];
                    if (topCard) {
                        this.renderCardSprite(point.x, point.y, topCard, topCard.isTapped || false, "field");
                    }
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
            this.drawButtonOutline(addBtn);
            addBtn.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
                this.socket.emit("placeDeckCardToStack", { tableId: this.tableId, targetPlayer: this.role, targetSlot: zoneKey })
            });

            const remBtn = this.add.text(point.x + 30, btnY, "-1", btnStyle).setOrigin(0.5);
            this.drawButtonOutline(remBtn);
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
            const clickHitName = `${zoneKey}ClickHit_${stateKey}`;
            const dropHitName = `${zoneKey}DropHit_${stateKey}`;
            
            if (this[clickHitName]) { this[clickHitName].destroy(); this[clickHitName] = null; }
            if (this[dropHitName]) { this[dropHitName].destroy(); this[dropHitName] = null; }

            // FIXED: Safely fetch the array using the active stateKey from your cached server data
            const playerDataCache = this.lastReceivedState && this.lastReceivedState[stateKey] ? this.lastReceivedState[stateKey] : {};
            const targetPile = playerDataCache[zoneKey] || [];
            const totalStackedCards = Array.isArray(targetPile) ? targetPile.length : 0;

            // 1. Standard flat drop zone layer for moving things to discard
            if (zoneKey === "discard") {
                this[dropHitName] = this.add.zone(point.x, point.y, this.cardWidth, this.cardHeight);
                this[dropHitName].setRectangleDropZone(this.cardWidth, this.cardHeight);
                this[dropHitName].setData("zoneKey", zoneKey);
                this[dropHitName].setDepth(100);
            }

            // 2. DYNAMIC GEOMETRIC FOOTPRINT:
            // Expand the collision box height so it blankets the visual waterfall area
            let computedZoneHeight = this.cardHeight;
            let computedOffsetY = 0;

            if (zoneKey === "defeated" && totalStackedCards > 0) {
                computedZoneHeight = this.cardHeight + ((totalStackedCards - 1) * 30);
                computedOffsetY = ((totalStackedCards - 1) * 30) / 2;
            }

            // 3. Create the pointer interaction listener grid
            this[clickHitName] = this.add.zone(point.x, point.y + computedOffsetY, this.cardWidth, computedZoneHeight);
            this[clickHitName].setInteractive({ useHandCursor: true });
            this[clickHitName].setData("zoneKey", zoneKey);
            this[clickHitName].setDepth(150);

            this[clickHitName].on("pointerdown", pointer => {
                // FAIL-SAFE: Block if an asset drag loop is currently active
                if (this.input.dragactive) return;
                
                // Discard pile is flat, open it instantly
                if (zoneKey === "discard") {
                    this.toggleStackDrawer(stateKey, zoneKey);
                    return;
                }

                // Verify we hit a valid asset and that it specifically belongs to the defeated pile
                const targetInfo = this.findCardAtCoordinates(pointer.worldX, pointer.worldY);
                if (targetInfo && targetInfo.zoneName === "defeated") {
                    console.log(`🎯 [RAYCAST CLICK]: Validated cursor intersection on card ${targetInfo.card.id}. Opening drawer...`);
                    this.toggleStackDrawer(stateKey, zoneKey);
                }
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
    renderFighterZoneContents(point, battleZone, zoneKey) {
        const fighterSlot = battleZone[zoneKey];
        if (!fighterSlot) return;

        const activeCard = fighterSlot.card;
        const extraCard = (zoneKey == 'fighterA') ? battleZone.extraA : battleZone.extraB;
        if (extraCard) {
            this.renderCardSprite(point.x, point.y, extraCard, extraCard.isTapped);
        } else if (activeCard && Object.keys(activeCard).length > 0) {
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
            const untapAllBtn = this.add.text(point.x - 75, point.y + countYOffset, "UNTAP ALL", untapStyle).setOrigin(0.5);
            this.drawButtonOutline(untapAllBtn, 1096065); 
            untapAllBtn.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
                this.executeUntapAllMacro();
            });
        }

        if(totalDeckCount > 0){
            this.renderCardSprite(point.x, point.y, { name: "Card Back", isFaceDown: true }, false);
        }
    }
    
    /**
     * Handles rendering the score counter and score increment/decrement buttons (+1, -1).
     */
    renderDefeatedPointsPanel(defeatedPoint, defeatedPoints, isLocalSeat) {
        this.add.text(defeatedPoint.x, defeatedPoint.y - this.cardHeight / 2 - 19, `POINTS: ${defeatedPoints} / 10`, {
            fontSize: "12px", 
            fontFamily: "monospace", 
            color: defeatedPoints >= 7 ? "#ff3333" : "#e2e8f0", 
            fontWeight: "bold"
        }).setOrigin(0.5);

        if (isLocalSeat && this.role !== "spectator") {
            const ptBtnY = defeatedPoint.y - this.cardHeight / 2 - 47;
            const ptBtnStyle = { 
                fontSize: "13px", 
                fontFamily: "monospace", 
                fill: "#e2e8f0", 
                fontWeight: "bold", 
                backgroundColor: "#1e293b", 
                padding: { x: 8, y: 4 } 
            };

            const incPtBtn = this.add.text(defeatedPoint.x - 30, ptBtnY, "+1", ptBtnStyle).setOrigin(0.5);
            this.drawButtonOutline(incPtBtn, 6583435);
            incPtBtn.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
                this.socket.emit("adjustDefeatedPoints", { tableId: this.tableId, targetPlayer: this.role, amount: 1 });
            });

            const decPtBtn = this.add.text(defeatedPoint.x + 30, ptBtnY, "-1", ptBtnStyle).setOrigin(0.5);
            this.drawButtonOutline(decPtBtn, 6583435);
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
            { key: "[SPACE]", desc: "Preview Card" },
            { key: "[ENTER]", desc: "Show Large Card" },
            { key: "[T]    ", desc: "Tap Card" },
            { key: "[D]    ", desc: "Move to (D)iscard Pile" },
            { key: "[S]    ", desc: "Move to (S)upport Lane" },
            { key: "[H]    ", desc: "Move to (H)and" },
            { key: "[F]    ", desc: "Move to De(f)eated Pile" },
            { key: "[A]    ", desc: "Move to Fighter (A)" },
            { key: "[B]    ", desc: "Move to Fighter (B)" },
            { key: "[G]    ", desc: "Move to Sta(g)e" },
            { key: "[E]    ", desc: "Return to D(e)ck" },
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

    /**
     * Scans the card underneath the mouse cursor to show its preview on the right panel.
     * Defaults to the live mouse pointer position if coordinates are not provided.
     * 
     * @param {number} [mouseX] - Mouse pointer x-coordinate.
     * @param {number} [mouseY] - Mouse pointer y-coordinate.
     */
    scanCardHitboxesForPreview(mouseX, mouseY) {
        const targetX = mouseX !== undefined ? mouseX : this.input.activePointer.x;
        const targetY = mouseY !== undefined ? mouseY : this.input.activePointer.y;

        // 1. Check open drawer overlays first
        if (this.drawerContainer && this.drawerState?.isOpen) {
            const drawerTarget = this.findCardInDrawer();
            if (drawerTarget) {
                this.selectedPreviewCard = drawerTarget.card;
                this.drawPreviewPanel();
            }
            return;
        }

        if (!this.lastReceivedState) return;

        // 2. Scan the field for any card overlapping the target coordinates
        const foundTarget = this.findCardAtCoordinates(targetX, targetY);
        if (foundTarget) {
            this.selectedPreviewCard = foundTarget.card;
            this.drawPreviewPanel();
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
                bundleKey = this.getBundleKeyFromCard(cardItem, bundleKey);
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
     * @param {string} zoneType - 'discard' or 'defeated' or 'extraDeck' depending on origin clicked.
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
        
        // 🆕 Expand data selection array mapping
        let cardList = [];
        if (zoneType === "defeated") {
            cardList = targetState.defeated || [];
        } else if (zoneType === "extraDeck") {
            cardList = targetState.extraDeck || [];
        } else {
            cardList = targetState.discard || [];
        }

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
        const instructionString = "💡 INSPECTION MODE | PRESS [SPACEBAR] TO PREVIEW DETAILED CODE FRAME";

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
                this.sound.play("sound_recycle", { 
                    volume: 0.85,
                    pitch: Phaser.Math.FloatBetween(0.98, 1.02) 
                });
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


            // 🔒 HAND-STYLE SECURITY ENGINE:
            // If it's the extra deck zone, force a card back ONLY if it belongs to the remote opponent.
            // If it belongs to the local player, we clone it and force 'isFaceDown = false' so they can see it!
            let finalCardData = card;

            if (zoneType === "extraDeck") {
                if (playerKey !== this.role) {
                    // Opponent's card: Always lock as a card back
                    finalCardData = { name: "Card Back", isFaceDown: true };
                } else if (card) {
                    // Local player's card: Reveal it by forcing face down to be false
                    finalCardData = { ...card, isFaceDown: false, isFaceUp: true };
                }
            }

            const drawerCardImg = this.renderCardSprite(posX, posY, finalCardData, false, "field");
            if (drawerCardImg) {
                drawerCardImg.setData("drawerCardRef", finalCardData);
                // Recompute original array indexes mathematically to preserve flawless targeting
                const originalIndex = (cardList.length - 1) - index;
                drawerCardImg.setData("drawerCardIndex", originalIndex);

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

        // 1. SCAN LOCAL FIGHTER A - (Also handles extraA)
        if (bZone.fighterA && bZone.fighterA.card) {
            const card = (bZone.extraA) ? bZone.extraA : bZone.fighterA.card;
            // Dynamic check: Invert detection dimensions if the asset card is tapped
            const hW = card.isTapped ? halfH : halfW;
            const hH = card.isTapped ? halfW : halfH;

            if (mouseX >= c.fighterA.x - hW && mouseX <= c.fighterA.x + hW &&
                mouseY >= c.fighterA.y - hH && mouseY <= c.fighterA.y + hH) {
                this.socket.emit('toggleCardTap', { tableId: this.tableId, targetPlayer: this.role, zone: 'fighterA', supportIndex: null });
                return;
            }
        }

        // 2. SCAN LOCAL FIGHTER B - (Also handles extraB)
        if (bZone.fighterB && bZone.fighterB.card) {
            const card = (bZone.extraB) ? bZone.extraB : bZone.fighterB.card;
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

         if (bZone.stage && bZone.stage.isTapped) {
            this.socket.emit('toggleCardTap', {
                tableId: this.tableId,
                targetPlayer: this.role,
                zone: 'stage',
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
     * Routes a card from the user's hand back into their main deck repository stack.
     * Reuses the central coordinate index layer to handle slot target verification.
     * 
     * @param {number} mouseX - Current pointer position tracking width axis.
     * @param {number} mouseY - Current pointer position tracking height axis.
     * @param {string} destination - Direction modifier, either "top" or "bottom".
     * @returns {void} Emits the respective deck layout update event to the server.
     */
    handleHandToDeckShortcut(mouseX, mouseY, destination) {
        if (!this.lastReceivedState) return;

        // Route coordinates straight through your master targeting engine
        const targetInfo = this.findCardAtCoordinates(mouseX, mouseY);

        // Enforce that the targeted card is in your hand and belongs to you
        if (!targetInfo || targetInfo.ownerId !== this.role || targetInfo.zoneName !== "hand") return;

        console.log(`📡 [DECOUPLED DECK MOVE EMIT]: Moving hand index ${targetInfo.index} to ${destination} of deck.`);
        
        const socketEvent = destination === "top" ? "playHandToTopDeck" : "playHandToBottomDeck";
        this.socket.emit(socketEvent, {
            tableId: this.tableId,
            targetPlayer: this.role,
            handIndex: targetInfo.index
        });
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

                const bZone = this.lastReceivedState?.[this.role]?.battleZone || {};
                if (bZone.fighterA?.card && Object.keys(bZone.fighterA.card).length > 0) {
                    console.log("❌ [LOCAL ALERT]: Fighter A position is already occupied.");
                    return;
                }
                
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

    handleKeyboardToSupportAction(mouseX, mouseY) {
        if (!this.lastReceivedState || !this.lastReceivedState[this.role]) return;
        
        const state = this.lastReceivedState;
        const c = this.fieldCoordinates.local;
        const halfW = this.cardWidth / 2;
        const halfH = this.cardHeight / 2;
        const myBZone = state[this.role]?.battleZone || {};
        
        // -----------------------------------------------------------------
        // CONTEXT A: Hovering Over Fighter A -> Move Fighter to Support
        // -----------------------------------------------------------------
        if (myBZone.fighterA && myBZone.fighterA.card) {
            const card = myBZone.fighterA.card;
            // Dynamically adjust boundary detection sizes based on Rest Mode (isTapped) orientation
            const hW = card.isTapped ? halfH : halfW;
            const hH = card.isTapped ? halfW : halfH;
            
            if (mouseX >= c.fighterA.x - hW && mouseX <= c.fighterA.x + hW && mouseY >= c.fighterA.y - hH && mouseY <= c.fighterA.y + hH) {
                console.log("📡 [SHORTCUT S EMIT]: Moving card from Fighter A slot to Support Lane...");
                this.socket.emit("moveFighterToSupport", {
                    tableId: this.tableId,
                    targetPlayer: this.role,
                    slot: "fighterA"
                });
                return; // Exit early
            }
        }

        // -----------------------------------------------------------------
        // CONTEXT B: Hovering Over Fighter B -> Move Fighter to Support
        // -----------------------------------------------------------------
        if (myBZone.fighterB && myBZone.fighterB.card) {
            const card = myBZone.fighterB.card;
            const hW = card.isTapped ? halfH : halfW;
            const hH = card.isTapped ? halfW : halfH;
            
            if (mouseX >= c.fighterB.x - hW && mouseX <= c.fighterB.x + hW && mouseY >= c.fighterB.y - hH && mouseY <= c.fighterB.y + hH) {
                console.log("📡 [SHORTCUT S EMIT]: Moving card from Fighter B slot to Support Lane...");
                this.socket.emit("moveFighterToSupport", {
                    tableId: this.tableId,
                    targetPlayer: this.role,
                    slot: "fighterB"
                });
                return; // Exit early
            }
        }

        // -----------------------------------------------------------------
        // CONTEXT C: Hovering Over The Deck -> Draw to Support
        // -----------------------------------------------------------------
        if (mouseX >= c.deck.x - halfW && mouseX <= c.deck.x + halfW && mouseY >= c.deck.y - halfH && mouseY <= c.deck.y + halfH) {
            if (this.drawerState && this.drawerState.isOpen) return;
            const myDeck = state[this.role].deck || [];
            if (myDeck.length <= 0) return;
            
            console.log("📡 [SHORTCUT S EMIT]: Drawing card directly from deck into Support Lane...");
            this.socket.emit("drawSupport", { tableId: this.tableId, targetPlayer: this.role });
            return;
        }

        // -----------------------------------------------------------------
        // CONTEXT D: Fallback (Hovering Over Hand) -> Existing Support Loop
        // -----------------------------------------------------------------
        const hand = state[this.role].hand || [];
        for (let index = hand.length - 1; index >= 0; index--) {
            const layout = this.getHandCardLayout(index, hand.length, true);
            const cardX = layout.x;
            const cardY = c.handStart.y + layout.y;
            const handHalfW = layout.width / 2;
            const handHalfH = layout.height / 2;
            
            if (mouseX >= cardX - handHalfW && mouseX <= cardX + handHalfW && mouseY >= cardY - handHalfH && mouseY <= cardY + handHalfH) {
                console.log(`📡 [SHORTCUT S EMIT]: Redirecting hand index ${index} face up into the Support Lane...`);
                this.socket.emit("playCardToSupport", { tableId: this.tableId, targetPlayer: this.role, handIndex: index });
                return;
            }
        }
    }

    handleKeyboardHAction(mouseX, mouseY) {
        if (!this.lastReceivedState || !this.lastReceivedState[this.role]) return;
        
        const state = this.lastReceivedState;
        const c = this.fieldCoordinates.local;
        const halfW = this.cardWidth / 2;
        const halfH = this.cardHeight / 2;
        
        // ----------------------------------------------------
        // CONTEXT A: Hovering Over The Local Deck -> Draw Card
        // ----------------------------------------------------
        if (mouseX >= c.deck.x - halfW && mouseX <= c.deck.x + halfW && mouseY >= c.deck.y - halfH && mouseY <= c.deck.y + halfH) {
            if (this.drawerState && this.drawerState.isOpen) return;
            
            // Safety check to ensure deck has cards remaining
            const myDeck = state[this.role].deck || [];
            if (myDeck.length <= 0) {
                console.log("⚠️ [SHORTCUT H ABORT]: Deck is empty. Suppressing draw event.");
                return;
            }
            
            console.log("🎲 [SHORTCUT H]: Clean draw card shortcut issued via keyboard context verification.");
            
            // Play draw sound with your dynamic pitch randomization config
            this.sound.play("sound_draw", { 
                volume: 0.8,
                pitch: Phaser.Math.FloatBetween(0.96, 1.04) 
            });
            
            this.socket.emit("drawCard", { tableId: this.tableId, targetPlayer: this.role });
            return;
        }
        
        // -----------------------------------------------------------
        // CONTEXT B: Hovering Over A Support Card -> Return to Hand
        // -----------------------------------------------------------
        const support = state[this.role].support || [];
        
        // Iterate from front-to-back (reverse) to prioritize clicking overlapping cards accurately
        for (let i = support.length - 1; i >= 0; i--) {
            const card = support[i];
            const shiftX = c.supportStart.x + i * c.supportOverlap;
            
            // Adjust hitbox orientation cleanly based on Rest Mode (isTapped) state
            const hW = card.isTapped ? halfH : halfW;
            const hH = card.isTapped ? halfW : halfH;
            
            if (mouseX >= shiftX - hW && mouseX <= shiftX + hW && mouseY >= c.supportStart.y - hH && mouseY <= c.supportStart.y + hH) {
                console.log(`📡 [SHORTCUT H EMIT]: Reclaiming support index ${i} (${card.id}) back to hand array list.`);
                                
                this.socket.emit("returnSupportToHand", {
                    tableId: this.tableId,
                    targetPlayer: this.role,
                    supportIndex: i
                });
                return;
            }
        }
    }

    animateCardFlight(startPos, endPos, cardData, isFaceDown = false, duration = 350, customStartPos = null) {
        // LOCATE AND CLEAN UP THE GHOST CARD
        this.children.list.forEach(child => {
            if (child.data && child.data.get("isPendingServer") === true) {
                child.destroy();
            }
        });

        const templateCard = isFaceDown ? { name: "Card Back", isFaceDown: true } : cardData;
        const actualStart = customStartPos ? customStartPos : startPos;
        
        const flyingCard = this.renderCardSprite(actualStart.x, actualStart.y, templateCard, false, "field");
        if (!flyingCard) {
            console.warn("⚠️ [ANIMATION EYE]: Render factory returned invalid object. Bypassing flight path animation.");
            this.handleStateRenderingLoop(this.lastReceivedState);
            return;
        }
        
        if (!isFaceDown && cardData && cardData.name !== "Card Back") {
            this.sound.play("sound_play", { 
                volume: 0.7,
                pitch: Phaser.Math.FloatBetween(0.95, 1.05) 
            });
        }

        flyingCard.setDepth(3e3);
        this.tweens.add({
            targets: flyingCard,
            x: endPos.x,
            y: endPos.y,
            duration: duration,
            ease: "Cubic.easeOut",
            onComplete: () => {
                flyingCard.destroy();
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

    /**
     * Moves a card to a new zone when you press a keyboard shortcut, then updates the screen and sends the
     * move to the server.
     * 
     * @param {Object} sanitizedState - Incoming game state payload.
     * @returns {boolean} True if an animation sequence was successfully initialized.
     */
    checkAndAnimateStateChanges(sanitizedState) {
        if (!this.lastReceivedState) return false;

        const rolesToCheck = ["playerA", "playerB"];

        for (const targetRole of rolesToCheck) {
            const oldPlayer = this.lastReceivedState[targetRole] || {};
            const newPlayer = sanitizedState[targetRole] || {};

            // Flatten loops: Build flat lookup maps using our extracted helper method
            const oldCardPositions = this.mapPlayerCardPositions(oldPlayer);
            const newCardPositions = this.mapPlayerCardPositions(newPlayer);

            for (const uuid in newCardPositions) {
                const prev = oldCardPositions[uuid];
                const current = newCardPositions[uuid];

                // Delta validation rule pass: Identify crossing zone coordinates
                if (prev && prev.zone !== current.zone) {
                    this.executeStateTransitionAnimation(targetRole, prev, current, sanitizedState);
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Loops through all zones on a player's side of the board to find where every card is.
     * Puts all of the card positions into a single flat list to make searching faster.
     * 
     * @param {Object} player - Player data from the server state.
     * @returns {Object} A flat list of card positions sorted by card UUID numbers.
     */
    mapPlayerCardPositions(player) {
        const positions = {};
        const listZones = ["hand", "support", "discard", "defeated", "deck", "fighterA", "fighterB", "stage"];

        listZones.forEach(zone => {
            let list = [];
            
            // Centralized path routing logic
            if (zone === "fighterA" || zone === "fighterB") {
                list = player.battleZone?.[zone]?.card ? [player.battleZone[zone].card] : [];
            } else if (zone === "stage") {
                list = player.battleZone?.stage ? [player.battleZone.stage] : [];
            } else {
                list = player[zone] || [];
            }

            list.forEach((card, index) => {
                if (card && card.uuid) {
                    positions[card.uuid] = { zone, index, totalCount: list.length, cardRef: card };
                }
            });
        });

        return positions;
    }

    /**
     * Figures out the start and end positions of a moving card and starts its flight animation.
     * Updates the saved game state and clears any leftover mouse drag positions.
     * 
     * @param {string} targetRole - The player seat currently making a move.
     * @param {Object} prev - The card's previous location data.
     * @param {Object} current - The card's new destination location data.
     * @param {Object} sanitizedState - The new game state payload from the server.
     */
    executeStateTransitionAnimation(targetRole, prev, current, sanitizedState) {
        console.log(`✨ [CONSOLIDATED DELTA ENGINE]: Card ${current.cardRef.id} moved from '${prev.zone}' to '${current.zone}' (${targetRole}).`);

        let startPos = this.calculateZoneCoordinates(targetRole, prev.zone, prev.index, prev.totalCount);
        
        // Handle optimistic cursor path overrides for interactive loops
        if (targetRole === this.role && this.lastDropPos) {
            startPos = { x: this.lastDropPos.x, y: this.lastDropPos.y };
        }

        const endPos = this.calculateZoneCoordinates(targetRole, current.zone, current.index, current.totalCount);
        const isMaskedBack = targetRole !== this.role && this.role !== "spectator" && current.zone === "hand";

        // Save states and clean tracking metrics immediately to prevent layout tearing bugs
        this.lastReceivedState = sanitizedState;
        this.lastDropPos = null;

        this.animateCardFlight(startPos, endPos, current.cardRef, isMaskedBack, 300);
    }

    attachCardInspectionListeners(displayObject, card, isCardBack) {
        // Only bind interaction loops if it's a real card face (ignore empty backs)
        if (!card || isCardBack) return;

        // Ensure the object can receive pointer events
        if (displayObject.type === "Container") {
            // Calculate dynamic relative bounds matching your geometry rules
            const compW = displayObject.getData("computedWidth") || this.cardWidth;
            const compH = displayObject.getData("computedHeight") || this.cardHeight;
            displayObject.setInteractive(
                new Phaser.Geom.Rectangle(-compW / 2, -compH / 2, compW, compH),
                Phaser.Geom.Rectangle.Contains
            );
        } else {
            displayObject.setInteractive({ useHandCursor: true });
        }

        // 1. Keep track of what the mouse is hovering for the [ENTER] shortcut
        displayObject.on("pointerover", () => { 
            this.hoveredCardData = card; 
        });
        
        displayObject.on("pointerout", () => { 
            if (this.hoveredCardData === card) this.hoveredCardData = null; 
        });

        // 2. Track rapid double-clicks using precise engine delta timing
        displayObject.on("pointerdown", (pointer) => {
            const clickDelay = pointer.time - (displayObject.lastClickTime || 0);
            displayObject.lastClickTime = pointer.time;

            if (clickDelay < 350) { // 350ms double-click window threshold
                this.displayLargeCardModal(card);
            }
        });
    }

    displayLargeCardModal(card) {
        if (this.modalActiveBlocker) return;

        this.input.keyboard.enabled = false;

        // 1. EXTRACT DATA CONSTANTS UP FRONT
        const isUnknown = !card || card.title === "Card Back" || card.name === "Card Back" || card.isFaceDown;
        const cardId = isUnknown ? "UNKNOWN" : (card.id || "N/A");
        const title = card.title || card.name || "Unknown Card";
        const description = card.description || card.text || "No rule text provided.";

        const canvasCenterX = 1920 / 2;
        const canvasCenterY = 1080 / 2;

        // 2. STAGE BACKDROP CAMERA SLICE
        // Apply the hardware blur safely strictly onto your main board game layer
        if (this.cameras.main.postFX) {
            this.modalBlurEffect = this.cameras.main.postFX.addBlur(0, 2, 2, 4);
            this.tweens.add({
                targets: this.modalBlurEffect,
                blur: 8,
                duration: 150
            });
        }

        // 3. INSTANTIATE THE OVERLAY MODAL CAMERA (Stays perfectly sharp)
        // Creates a secondary viewing frame covering your exact viewport canvas configuration
        this.modalCamera = this.cameras.add(0, 0, 1920, 1080);
        this.modalCamera.setScroll(0, 0);

        // 4. LAYER 1: THE DARK GRAPHICS BLOCKER MASK
        this.modalActiveBlocker = this.add.graphics();
        this.modalActiveBlocker.fillStyle(0x0f172a, 0.85); // 85% opacity backdrop
        this.modalActiveBlocker.fillRect(0, 0, 1920, 1080);
        this.modalActiveBlocker.setInteractive(new Phaser.Geom.Rectangle(0, 0, 1920, 1080), Phaser.Geom.Rectangle.Contains);

        // 5. LAYER 2: THE MODAL DISPLAY ASSET GRAPHICS
        let bundleKey = "system_ui";
        let frameKey = "card_back";
        if (card && card.id && !isUnknown) {
            frameKey = card.id;
            bundleKey = this.getBundleKeyFromCard(card, bundleKey);
        }
        const hasRealTexture = this.textures.exists(bundleKey) && this.textures.get(bundleKey).has(frameKey);

        if (hasRealTexture && !isUnknown) {
            // --- PROFILE A: CINEMATIC IMAGE ---
            this.modalDisplayAsset = this.renderCardSprite(canvasCenterX, canvasCenterY, card, false, "field", 0);
            if (this.modalDisplayAsset) {
                this.modalDisplayAsset.setDisplaySize(540, 756); // True massive presentation frame
            }
        } else {
            // --- PROFILE B: VECTOR DETAILS FRAME CONTAINER ---
            this.modalDisplayAsset = this.add.container(canvasCenterX, canvasCenterY);
            const boxW = 540;
            const boxH = 420;

            const basePlate = this.add.graphics();
            basePlate.fillStyle(0x1e293b, 1);
            basePlate.lineStyle(3, 0x38bdf8, 1);
            basePlate.fillRoundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 16);
            basePlate.strokeRoundedRect(-boxW / 2, -boxH / 2, boxW, boxH, 16);
            this.modalDisplayAsset.add(basePlate);

            const metaText = this.add.text(-boxW / 2 + 24, -boxH / 2 + 24, `CODE: ${cardId}`, { fontSize: "14px", fontFamily: "monospace", fill: "#38bdf8", fontWeight: "bold" });
            const sysText = this.add.text(boxW / 2 - 24, -boxH / 2 + 24, "🔍 SYSTEM INSPECTOR", { fontSize: "12px", fontFamily: "monospace", fill: "#64748b" }).setOrigin(1, 0);
            const titleText = this.add.text(-boxW / 2 + 24, -boxH / 2 + 56, title.toUpperCase(), { fontSize: "24px", fontFamily: "monospace", fill: "#f1f5f9", fontWeight: "900" });
            this.modalDisplayAsset.add([metaText, sysText, titleText]);

            const textBg = this.add.graphics();
            textBg.fillStyle(0x0f172a, 1);
            textBg.lineStyle(1, 0x334155, 1);
            textBg.fillRoundedRect(-boxW / 2 + 24, -boxH / 2 + 100, boxW - 48, 220, 6);
            textBg.strokeRoundedRect(-boxW / 2 + 24, -boxH / 2 + 100, boxW - 48, 220, 6);
            textBg.fillStyle(0x38bdf8, 1);
            textBg.fillRect(-boxW / 2 + 24, -boxH / 2 + 100, 4, 220);
            this.modalDisplayAsset.add(textBg);

            const descText = this.add.text(-boxW / 2 + 44, -boxH / 2 + 116, description, {
                fontSize: "14px",
                fontFamily: "monospace",
                fill: "#e2e8f0",
                lineSpacing: 6,
                wordWrap: { width: boxW - 88 }
            });
            this.modalDisplayAsset.add(descText);

            const dismissTip = this.add.text(0, boxH / 2 - 24, "💡 CLICK ANYWHERE TO DISMISS INTERFACE", { fontSize: "11px", fontFamily: "monospace", fill: "#64748b", fontWeight: "bold" }).setOrigin(0.5);
            this.modalDisplayAsset.add(dismissTip);
        }

        // 6. 🌟 CRITICAL ROUTING MASK ASSIGNMENTS
        // A: Tell your main camera loop to IGNORE drawing the modal assets
        this.cameras.main.ignore([this.modalActiveBlocker, this.modalDisplayAsset]);

        // B: Tell your sharp overlay camera to IGNORE drawing the base board game field children list
        // This allows the blur filter to safely churn background elements in separation
        this.children.list.forEach(child => {
            if (child !== this.modalActiveBlocker && child !== this.modalDisplayAsset) {
                this.modalCamera.ignore(child);
            }
        });

        // 7. TEARDOWN DISMISS LISTENER HANDSHAKE
        this.modalActiveBlocker.on("pointerdown", () => {
            this.input.keyboard.enabled = true; // Restore keystrokes

            // Clean up the blur filter on main camera pipeline
            if (this.modalBlurEffect) {
                this.cameras.main.postFX.remove(this.modalBlurEffect);
                this.modalBlurEffect = null;
            }

            // Cleanly erase assets out of memory arrays
            if (this.modalDisplayAsset) {
                this.modalDisplayAsset.destroy();
                this.modalDisplayAsset = null;
            }

            if (this.modalActiveBlocker) {
                this.modalActiveBlocker.destroy();
                this.modalActiveBlocker = null;
            }

            // Destroy the stacked camera slice cleanly to free viewport memory allocations
            if (this.modalCamera) {
                this.cameras.remove(this.modalCamera);
                this.modalCamera = null;
            }
        });
    }

    initializeStateTrackingArrays() {
        this.selectedPreviewCard = null;
        this.hoveredCardData = null;
        this.animatingUuids = [];
        this.lastReceivedState = null;
    }

    findCardAtCoordinates(mouseX, mouseY) {
        const foundCard = this.findCardInDrawer();
        if (foundCard) return foundCard;

        if (!this.lastReceivedState) return null;

        const state = this.lastReceivedState;
        const isPlayerB = this.role === "playerB";
        
        // Map seats to check both local player bounds and remote player bounds
        const perspectiveMap = [
            { stateKey: isPlayerB ? "playerB" : "playerA", coordKey: "local" },
            { stateKey: isPlayerB ? "playerA" : "playerB", coordKey: "remote" }
        ];

        const halfW = this.cardWidth / 2;
        const halfH = this.cardHeight / 2;
        // 'extra' zones need to be scanned before fighters...
        const zones = ['defeated', 'support', 'hand', 'discard', 'deck', 'extraA', 'extraB', 'fighterA', 'fighterB', 'stage'];

        for (const p of perspectiveMap) {
            const c = this.fieldCoordinates[p.coordKey];
            const playerData = state[p.stateKey] || {};
            const isLocalSeat = c === this.fieldCoordinates.local;

            // Loop dynamically through each zone target sequence
            for (const zone of zones) {
                let cardList;
                switch (zone) {
                    case 'fighterA':
                    case 'fighterB':
                        cardList = (playerData.battleZone[zone].card) ? [playerData.battleZone[zone].card] : [];
                        break;
                    case 'stage':
                    case 'extraA':
                    case 'extraB':
                        cardList = (playerData.battleZone[zone]) ? [playerData.battleZone[zone]] : [];
                        break;
                    default:
                        cardList = playerData[zone] || [];
                }
                if (cardList.length === 0) continue;

                // Iterate backward through the pile arrays to grab the top graphic layer first
                for (let i = cardList.length - 1; i >= 0; i--) {
                    const card = cardList[i];
                    let targetX = 0;
                    let targetY = 0;
                    let currentW = halfW;
                    let currentH = halfH;

                    // Route layout math strategies based on the target zone string
                    switch (zone) {
                        case 'defeated':
                            targetX = c.defeated.x;
                            targetY = c.defeated.y + (i * 30); // 30px vertical layout step rule
                            break;

                        case 'support':
                            targetX = c.supportStart.x + (i * c.supportOverlap);
                            targetY = c.supportStart.y;
                            // Handle dynamic orthogonal tap orientation math adjustments
                            currentW = card.isTapped ? halfH : halfW;
                            currentH = card.isTapped ? halfW : halfH;
                            break;

                        case 'hand':
                            const layout = this.getHandCardLayout(i, cardList.length, isLocalSeat);
                            targetX = layout.x;
                            targetY = c.handStart.y + layout.y;
                            currentW = layout.width / 2;
                            currentH = layout.height / 2;
                            break;

                        case 'discard':
                        case 'deck':
                        case 'fighterA':
                        case 'fighterB':
                        case 'stage':
                        case 'extraA':
                        case 'extraB':
                            // Structural check: Only the top card on the stack can be clicked/inspected
                            if (i !== cardList.length - 1) continue;
                            targetX = c[zone].x;
                            targetY = c[zone].y;
                            break;
                    }

                    // Execute the singular consolidated boundary bounds collision check
                    if (mouseX >= targetX - currentW && mouseX <= targetX + currentW &&
                        mouseY >= targetY - currentH && mouseY <= targetY + currentH) {
                        return {
                            card: card,
                            ownerId: p.stateKey,
                            zoneName: zone,
                            index: i
                        };
                    }
                }
            }
        }

        return null; // Mouse cursor is over empty table canvas space
    }

    displayDeckPlacementModal(targetInfo) {
        // Prevent stacking duplicate placement menus
        if (document.getElementById("deckPlacementModalContainer")) return;

        // Temporarily pause scene keyboard captures so keys don't trigger underlying loops
        this.input.keyboard.enabled = false;

        const cardTitle = targetInfo.card.title || "this card";
        const sourceZoneName = targetInfo.zoneName.toUpperCase();

        const modalHtml = `
            <div id="deckPlacementModalContainer" style="
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: #f8fafc;
                font-family: monospace;
                font-size: 14px;
                background: #0f172a;
                padding: 30px;
                border-radius: 12px;
                width: 340px;
                text-align: center;
                border: 2px solid #38bdf8;
                box-shadow: 0px 10px 30px rgba(0,0,0,0.85);
                z-index: 10000;
            ">
                <h3 style="color: #38bdf8; margin-top: 0; font-size: 18px; margin-bottom: 10px;">DECK PLACEMENT</h3>
                <p style="margin-bottom: 20px; color: #94a3b8; line-height: 1.4;">
                    Where would you like to place <br>
                    <b style="color:#e2e8f0;">${cardTitle}</b> <br>
                    from your <span style="color: #f43f5e; fontWeight: bold;">${sourceZoneName}</span>?
                </p>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button id="placeDeckTopBtn" style="flex: 1; background: #10b981; color: #ffffff; font-weight: bold; padding: 10px; border: none; border-radius: 6px; cursor: pointer; font-family: monospace;">🔝 TOP</button>
                    <button id="placeDeckBottomBtn" style="flex: 1; background: #3b82f6; color: #ffffff; font-weight: bold; padding: 10px; border: none; border-radius: 6px; cursor: pointer; font-family: monospace;">📥 BOTTOM</button>
                </div>
                <button id="cancelDeckPlacementBtn" style="margin-top: 15px; width: 100%; background: #334155; color: #94a3b8; padding: 8px; border: none; border-radius: 6px; cursor: pointer; font-family: monospace;">CANCEL</button>
            </div>
        `;

        const placementDom = this.add.dom(960, 540).createFromHTML(modalHtml).setOrigin(.5);
        placementDom.setDepth(6000);
        placementDom.addListener("click");

        placementDom.on("click", event => {
            const id = event.target.id;
            if (!id) return;

            const cleanupModal = () => {
                this.input.keyboard.enabled = true;
                const rawNode = document.getElementById("deckPlacementModalContainer");
                if (rawNode) rawNode.remove();
                placementDom.destroy();
            };

            // Universal structure mapping payload
            let payload = {
                tableId: this.tableId,
                targetPlayer: this.role,
                targetZone: targetInfo.zoneName,
                targetIndex: targetInfo.index,
                destinationZone: 'deck'
            };

            if (id === "cancelDeckPlacementBtn") {
                cleanupModal();
                return;
            }

            payload.isPlaceOnTop = (id === "placeDeckTopBtn");
            const topBotLabel = (id === "placeDeckTopBtn") ? 'TOP' : 'BOTTOM';
            console.log(`📡 [UNIVERSAL DECK]: Moving index ${targetInfo.index} from ${targetInfo.zoneName} to ${topBotLabel} of deck.`);
            
            const fighterOrStage = ['fighterA', 'fighterB', 'stage'];
            if (fighterOrStage.includes(payload.targetZone)) {
                this.socket.emit('requestFighterOrStageToZone', payload);
                cleanupModal();
                return;
            }
            this.socket.emit("requestCardMove", payload);
            cleanupModal();

        });
    }

    findCardInDrawer() {
        // 🆕 DRAWER HOVER CHECKER: If a drawer is open, check it FIRST
        if (this.drawerContainer && this.drawerState && this.drawerState.isOpen) {
            // Raycast directly through the items currently sitting inside the drawer container
            const targets = this.input.manager.hitTest(this.input.activePointer, this.drawerContainer.list, this.cameras.main);
            
            for (const target of targets) {
                if (target.data && target.data.has("drawerCardRef")) {
                    const cardData = target.data.get("drawerCardRef");
                    const cardIndex = target.data.get("drawerCardIndex"); // Retrieve the original pile index
                    
                    // Security Lockout: Opponents cannot use shortcuts on your hidden card stacks
                    if (this.drawerState.playerKey !== this.role) {
                        console.log("⚠️ [ACTION BLOCKED]: You cannot move your opponent's extra deck cards.");
                        return null;
                    }

                    console.log(`🎯 [DRAWER HOTKEY TARGET]: Located cursor over drawer index ${cardIndex} in zone '${this.drawerState.zoneType}'`);
                    
                    // Return the same payload structure your keydown router expects!
                    return {
                        card: cardData,
                        ownerId: this.drawerState.playerKey,
                        zoneName: this.drawerState.zoneType, // Will report "extraDeck" or "discard"
                        index: cardIndex
                    };
                }
            }
        }
    }

    /**
     * Draws a clean vector rectangle border around a text button component.
     * Uses the center origin math of the text block to center the border lines.
     * 
     * @param {Phaser.GameObjects.Text} textButton - The text object button.
     * @param {number} [color=3718648] - Decimal hex code color value.
     */
    drawButtonOutline(textButton, color = 3718648) {
        this.fieldGraphics.lineStyle(1, color, 0.6);
        this.fieldGraphics.strokeRect(
            textButton.x - textButton.width / 2, 
            textButton.y - textButton.height / 2, 
            textButton.width, 
            textButton.height
        );
    }

}
