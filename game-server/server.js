const PORT = process.env.PORT || 3000;
const io = require("socket.io")(process.env.PORT || 3000, {
    cors: {
        origin: [
            "https://github.io",       // Your GHP URL
            "http://localhost:8000",          // Standard Localhost port
            "http://127.0.0.1:8000",          // Alternate loopback IP port
            "http://localhost",               // Bare localhost address
            "http://127.0.0.1"
        ],
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket'] // Mirror the client setting on the server layer
});


const { v4: uuidv4 } = require('uuid');

const tables = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    playerA: [], // <--- Changed from null to []
    playerB: [], // <--- Changed from null to []
    spectators: [],
    endGameSignals: { playerA: false, playerB: false },
    gameState: {
        playerA: {
            hand: [], deck: [], extraDeck: [], discard: [], support: [], defeated: [],
            defeatedPoints: 0, battleZone: {
                fighterA: { card: null, faceDownStack: [] },
                fighterB: { card: null, faceDownStack: [] },
                stage: null
            }
        },
        playerB: {
            hand: [], deck: [], extraDeck: [], discard: [], support: [], defeated: [],
            defeatedPoints: 0, battleZone: {
                fighterA: { card: null, faceDownStack: [] },
                fighterB: { card: null, faceDownStack: [] },
                stage: null
            }
        }
    }
}));

function sendSanitizedState(socket, table, role){
    const maskCard = () => ({ name: "Card Back", isFaceDown: true });
    const sanitizeZone = (zone, isVisible) => {
        if (isVisible) return zone;
        return Array.isArray(zone) ? zone.map(maskCard) : Object.keys(zone).length ? maskCard() : {};
    };
    
    const sanitizeBattleZone = (battleZone, zoneOwner, viewerRole) => {
        if (!battleZone) return null;
        const isSpec = viewerRole === "spectator";
        const isOwner = viewerRole === zoneOwner;
        const maskIfHidden = card => {
            if (!card || Object.keys(card).length === 0) return null;
            if (card.isFaceDown && !isOwner && !isSpec) return maskCard();
            return card;
        };
        return {
            stage: battleZone.stage,
            fighterA: {
                card: maskIfHidden(battleZone.fighterA.card),
                faceDownStack: isSpec ? battleZone.fighterA.faceDownStack : battleZone.fighterA.faceDownStack.map(maskCard)
            },
            fighterB: {
                card: maskIfHidden(battleZone.fighterB.card),
                faceDownStack: isSpec ? battleZone.fighterB.faceDownStack : battleZone.fighterB.faceDownStack.map(maskCard)
            }
        };
    };

    const isSpec = role === "spectator";
    const canSeeA = isSpec || role === "playerA";
    const canSeeB = isSpec || role === "playerB";
    const state = table.gameState;

    // Standardized Payload: Includes FOW cards AND absolute match parameters
    socket.emit("stateUpdate", {
        tableId: table.id,
        endGameSignals: table.endGameSignals, // Explicitly unified here
        playerA: {
            hand: sanitizeZone(state.playerA.hand, canSeeA),
            deck: sanitizeZone(state.playerA.deck, isSpec),
            extraDeck: sanitizeZone(state.playerA.extraDeck, canSeeA),
            discard: state.playerA.discard,
            support: state.playerA.support,
            defeated: state.playerA.defeated,
            defeatedPoints: state.playerA.defeatedPoints,
            battleZone: sanitizeBattleZone(state.playerA.battleZone, "playerA", role)
        },
        playerB: {
            hand: sanitizeZone(state.playerB.hand, canSeeB),
            deck: sanitizeZone(state.playerB.deck, isSpec),
            extraDeck: sanitizeZone(state.playerB.extraDeck, canSeeB),
            discard: state.playerB.discard,
            support: state.playerB.support,
            defeated: state.playerB.defeated,
            defeatedPoints: state.playerB.defeatedPoints,
            battleZone: sanitizeBattleZone(state.playerB.battleZone, "playerB", role)
        }
    });
}

function moveCardToFighterOrStage(socket, tableId, targetPlayer, fromZone, fromIndex, toZone) {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");
        if (fromZone == toZone) {
            return socket.emit("errorMsg", "Zones are the same, nothing to move.");
        }

        const targetArray = table.gameState[targetPlayer]?.[fromZone];
        const destinationBattleZone = table.gameState[targetPlayer]?.battleZone;
        
        if (!targetArray || targetArray.length === 0) return socket.emit("errorMsg", fromZone + "zone is empty!");
        
        // If we are moving from the deck, disregard index - we are drawing from the end of the array, i.e.: the top of the deck
        const idx = (fromZone == 'deck') ? (targetArray.length - 1): parseInt(fromIndex);
        if (isNaN(idx) || idx < 0 || idx >= targetArray.length) return socket.emit("errorMsg", "Invalid index selection.");

        const destinationCard = (toZone == 'stage')
            ? destinationBattleZone.stage
            : destinationBattleZone[toZone].card;

        if (destinationCard !== null) {
            return socket.emit("errorMsg", `${toZone} is not empty, so we can't move a card into it.`);
        } 

        // 1. Execute the mutation directly on the data model
        const [cardToMove] = targetArray.splice(idx, 1);

        cardToMove.isTapped = false;
        cardToMove.isFaceDown = (toZone == 'fighterA');
       
        if (toZone == 'stage') {
            destinationBattleZone.stage = cardToMove;
        } else {
            destinationBattleZone[toZone].card = cardToMove;
        }

        // 2. Aggregate all multi-socket connections for this table instance
        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();

        // 3. Loop over connections and dispatch individualized, FOW-masked state frames
        targetSockets.forEach(sockId => {
            const sock = io.sockets.sockets.get(sockId);
            if (sock) {
                let viewerRole = "spectator";
                if (table.playerA.includes(sockId)) viewerRole = "playerA";
                if (table.playerB.includes(sockId)) viewerRole = "playerB";
                
                sendSanitizedState(sock, table, viewerRole);
            }
        });

        socket.emit("serverNotice", `Successfully moved card with index ${idx} from ${fromZone} to ${toZone}.`);
}

function moveCardToZone(socket, tableId, targetPlayer, fromZone, fromIndex, toZone, isPlaceOnTop = true) {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");
        if (fromZone == toZone) {
            return socket.emit("errorMsg", "Zones are the same, nothing to move.");
        }

        const targetArray = table.gameState[targetPlayer]?.[fromZone];
        const destinationArray = table.gameState[targetPlayer]?.[toZone];
        
        if (!targetArray || targetArray.length === 0) return socket.emit("errorMsg", fromZone + " zone is empty!");
        
        // If we are moving from the deck, disregard index - we are drawing from the end of the array, i.e.: the top of the deck
        const idx = (fromZone == 'deck') ? (targetArray.length - 1): parseInt(fromIndex);
        if (isNaN(idx) || idx < 0 || idx >= targetArray.length) return socket.emit("errorMsg", "Invalid index selection.");

        // 1. Execute the mutation directly on the data model
        const [cardToMove] = targetArray.splice(idx, 1);

        cardToMove.isTapped = false;
        switch (toZone) {
            case 'hand':
            case 'extraDeck':
            case 'discard':
            case 'support':
            case 'defeated':
                cardToMove.isFaceDown = false;
                break;
            case 'deck':
                cardToMove.isFaceDown = true;
                break;
        }
        if (isPlaceOnTop) {
            destinationArray.push(cardToMove);
        } else {
            destinationArray.unshift(cardToMove);
        }

        // 2. Aggregate all multi-socket connections for this table instance
        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();

        // 3. Loop over connections and dispatch individualized, FOW-masked state frames
        targetSockets.forEach(sockId => {
            const sock = io.sockets.sockets.get(sockId);
            if (sock) {
                let viewerRole = "spectator";
                if (table.playerA.includes(sockId)) viewerRole = "playerA";
                if (table.playerB.includes(sockId)) viewerRole = "playerB";
                
                sendSanitizedState(sock, table, viewerRole);
            }
        });

        socket.emit("serverNotice", `Successfully moved card with index ${idx} from ${fromZone} to ${toZone}.`);
}

function moveFighterOrStageToZone(socket, tableId, targetPlayer, slot, toZone, isPlaceOnTop = true) {
    const table = tables.find(t => t.id === parseInt(tableId));
    if (!table) return socket.emit("errorMsg", "Table not found.");

    const pState = table.gameState[targetPlayer];
    let targetCard = pState?.battleZone?.[slot]?.card;
    if (slot == 'stage') {
        targetCard = pState?.battleZone?.[slot];
    }
    if (!targetCard) return socket.emit("errorMsg", "Card not found in battle slot " + slot);

    const destinationArray = pState?.[toZone];
    if (!destinationArray) return socket.emit("errorMsg", `Destination zone '${toZone}' not found.`);

    // 1. Mutate state model: empty the fighter/stage slot database node cleanly
    if (slot == 'stage') {
        pState.battleZone[slot] = null;
    } else {
        pState.battleZone[slot].card = null;
    }
    
    // 2. Prepare card state properties according to uniform destination rules
    targetCard.isTapped = false;
    switch (toZone) {
        case "hand":
        case "extraDeck":
        case "discard":
        case "support":
        case "defeated":
            targetCard.isFaceDown = false;
            break;
        case "deck":
            targetCard.isFaceDown = true;
            break;
    }
    
    // 3. Push card cleanly into the designated linear destination array list
    if (isPlaceOnTop) {
        destinationArray.push(targetCard);
    } else {
        destinationArray.unshift(targetCard);
    }


    console.log(`📡 [FIGHTER RELOCATION ENGINE]: Shifted tracking frame from active slot ${slot} to array zone ${toZone} for ${targetPlayer}.`);

    // 4. Secure broadcast - individual FOW-masked state multi-cast sweep
    const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();
    targetSockets.forEach(sockId => {
        const sock = io.sockets.sockets.get(sockId);
        if (sock) {
            let viewerRole = table.playerA.includes(sockId) ? "playerA" : table.playerB.includes(sockId) ? "playerB" : "spectator";
            sendSanitizedState(sock, table, viewerRole);
        }
    });

    socket.emit("serverNotice", `Successfully moved card from active slot ${slot} to array zone ${toZone}.`);
}

function leaveAll(socketId) {
    tables.forEach(t => {
        t.playerA = t.playerA.filter(id => id !== socketId);
        t.playerB = t.playerB.filter(id => id !== socketId);
        t.spectators = t.spectators.filter(id => id !== socketId);
    });
}

io.on("connection", socket => {
    socket.on("joinTable", ({tableId: tableId, role: role}) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");
        
        // 1. Wipe this socket ID from all tables completely before seating it
        leaveAll(socket.id); 

        // 2. Clear out any ghost duplicates from this target seat list before pushing
        if (role === "playerA") {
            table.playerA = table.playerA.filter(id => id !== socket.id);
            table.playerA.push(socket.id);
        } else if (role === "playerB") {
            table.playerB = table.playerB.filter(id => id !== socket.id);
            table.playerB.push(socket.id);
        } else if (role === "spectator") {
            table.spectators = table.spectators.filter(id => id !== socket.id);
            table.spectators.push(socket.id);
        } else {
            return socket.emit("errorMsg", "Invalid role definition.");
        }

        if (role === "playerA" || role === "playerB") {
            table.endGameSignals[role] = false;
        }
        console.log(`📡 [STAGE 2 SEAT]: Added socket ${socket.id} uniquely to the list for ${role}`);
    });

    socket.on("leaveTable", () => leaveAll(socket.id));

    socket.on("disconnect", () => leaveAll(socket.id));

    socket.on("loadDeck", ({tableId: tableId, targetPlayer: targetPlayer, deckList: deckList}) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");
        if (targetPlayer !== "playerA" && targetPlayer !== "playerB") return socket.emit("errorMsg", "Invalid target player.");
        
        table.gameState[targetPlayer].deck = deckList.map(cardObj => ({
            id: cardObj.id,
            title: cardObj.title,
            name: `Card ${cardObj.id}`,
            isFaceDown: true,
            isTapped: false,
            uuid: uuidv4() // Assign a permanent runtime unique string tracker
        }));
        
        socket.emit("serverNotice", `Deck loaded with ${deckList.length} uniquely titled cards.`);
    });

    socket.on('getGameState', ({ tableId, role }) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit('errorMsg', 'Table not found.');

        sendSanitizedState(socket, table, role);
    });

    socket.on('shuffleDeck', ({ tableId, targetPlayer }) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit('errorMsg', 'Table not found.');

        const deck = table.gameState[targetPlayer]?.deck;
        if (!deck || deck.length === 0) {
            return socket.emit('errorMsg', `No cards found in ${targetPlayer}'s deck to shuffle.`);
        }

        deck.forEach(card => {
            card.shuffleId = uuidv4(); // Assign a random unique string identifier
        });

        deck.sort((a, b) => a.shuffleId.localeCompare(b.shuffleId));

        deck.forEach((card) => {
            delete card.shuffleId; // Keep the game state payload clean
        });

        socket.emit('serverNotice', `Deck shuffled successfully using random UUID sort!`);
    });

    socket.on("drawCard", ({tableId: tableId, targetPlayer: targetPlayer}) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");
        
        const deck = table.gameState[targetPlayer]?.deck;
        return moveCardToZone(socket, tableId, targetPlayer, 'deck', (deck.length - 1), 'hand');
    });

    socket.on("draw6Cards", ({tableId: tableId, targetPlayer: targetPlayer}) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const deck = table.gameState[targetPlayer]?.deck;
        const hand = table.gameState[targetPlayer]?.hand;
        
        if (!deck || deck.length < 6) return socket.emit("errorMsg", "Not enough cards to draw 6!");

        // Execute the draw loop
        for (let i = 0; i < 6; i++) {
            const drawnCard = deck.pop();
            drawnCard.isFaceDown = false;
            hand.push(drawnCard);
        }

        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();

        targetSockets.forEach(sockId => {
            const sock = io.sockets.sockets.get(sockId);
            if (sock) {
                let viewerRole = "spectator";
                if (table.playerA.includes(sockId)) viewerRole = "playerA";
                if (table.playerB.includes(sockId)) viewerRole = "playerB";
                
                sendSanitizedState(sock, table, viewerRole);
            }
        });

        socket.emit("serverNotice", `${targetPlayer} successfully drew a 6-card opening hand.`);
    });

    socket.on("playCardFaceDown", ({tableId: tableId, targetPlayer: targetPlayer, handIndex: handIndex}) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const hand = table.gameState[targetPlayer]?.hand;
        const bZone = table.gameState[targetPlayer]?.battleZone;
        const idx = parseInt(handIndex);
        
        if (!hand || idx < 0 || idx >= hand.length) return socket.emit("errorMsg", "Invalid hand index selection.");

        // 1. Execute the mutation directly on the server database
        const [cardToPlay] = hand.splice(idx, 1);
        cardToPlay.isFaceDown = true;
        cardToPlay.isTapped = false;
        
        // Mount the trickery card face down specifically to fighterA
        bZone.fighterA.card = cardToPlay;

        // 2. Aggregate all multi-socket connections for this table instance
        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();

        // 3. Dispatch individualized, secure views via your serialization engine
        targetSockets.forEach(sockId => {
            const sock = io.sockets.sockets.get(sockId);
            if (sock) {
                let viewerRole = "spectator";
                if (table.playerA.includes(sockId)) viewerRole = "playerA";
                if (table.playerB.includes(sockId)) viewerRole = "playerB";
                sendSanitizedState(sock, table, viewerRole);
            }
        });
    });

    socket.on("flipCardFaceUp", ({tableId: tableId, targetPlayer: targetPlayer}) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const card = table.gameState[targetPlayer]?.battleZone?.fighterA?.card;
        if (!card) return socket.emit("errorMsg", "No card found in Fighter A slot to flip.");

        // 1. Permanently remove the face-down mask condition on the server model
        card.isFaceDown = false;

        console.log(`📡 [DECOUPLED FLIP]: Fighter A card flipped face up for ${targetPlayer}. Broadcasting state...`);

        // 2. Aggregate all multi-socket connections for this table instance
        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();

        // 3. Re-serialize and distribute safe, updated views to everyone via your central engine
        targetSockets.forEach(sockId => {
            const sock = io.sockets.sockets.get(sockId);
            if (sock) {
                let viewerRole = "spectator";
                if (table.playerA.includes(sockId)) viewerRole = "playerA";
                if (table.playerB.includes(sockId)) viewerRole = "playerB";
                
                sendSanitizedState(sock, table, viewerRole);
            }
        });
    });

    socket.on("playHandToTopDeck", ({tableId: tableId, targetPlayer: targetPlayer, handIndex: handIndex}) => {
        return moveCardToZone(socket, tableId, targetPlayer, 'hand', handIndex, 'deck');
    });

    socket.on("playHandToBottomDeck", ({ tableId, targetPlayer, handIndex }) => {
        // Pass false as the 7th argument to force the card to the bottom (unshift)
        return moveCardToZone(socket, tableId, targetPlayer, 'hand', handIndex, 'deck', false);
    });

    socket.on("toggleCardTap", ({ tableId, targetPlayer, zone, supportIndex }) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const bZone = table.gameState[targetPlayer]?.battleZone;
        const support = table.gameState[targetPlayer]?.support;
        let targetCard = null;

        if (zone === "fighterA") targetCard = bZone?.fighterA?.card;
        else if (zone === "fighterB") targetCard = bZone?.fighterB?.card;
        else if (zone === "stage") targetCard = bZone?.stage;
        else if (zone === "support" && Array.isArray(support)) targetCard = support[parseInt(supportIndex)];

        if (!targetCard) return socket.emit("errorMsg", "Target card not found to tap.");

        // 1. Mutate the server data model silently
        targetCard.isTapped = !targetCard.isTapped;

        // 2. Build the lightweight, UUID-safe animation payload
        const animationPayload = {
            targetPlayer: targetPlayer,
            uuid: targetCard.uuid, // Track this specific physical copy copy
            zone: zone,
            supportIndex: zone === "support" ? parseInt(supportIndex) : null,
            isTapped: targetCard.isTapped
        };

        // 3. Broadcast the animation instruction
        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();
        targetSockets.forEach(sockId => {
            io.to(sockId).emit("cardTap", animationPayload);
        });
    });


    socket.on("playCardToSupport", ({tableId: tableId, targetPlayer: targetPlayer, handIndex: handIndex}) => {
        return moveCardToZone(socket, tableId, targetPlayer, 'hand', handIndex, 'support');
    });

    socket.on("playCardToFighter", ({tableId: tableId, targetPlayer: targetPlayer, handIndex: handIndex, targetSlot: targetSlot}) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const hand = table.gameState[targetPlayer]?.hand;
        const bZone = table.gameState[targetPlayer]?.battleZone;
        const idx = parseInt(handIndex);
        
        if (!hand || idx < 0 || idx >= hand.length) return socket.emit("errorMsg", "Invalid hand index selection.");
        if (bZone?.[targetSlot]?.card && Object.keys(bZone[targetSlot].card).length > 0) {
            return socket.emit("errorMsg", `The ${targetSlot === 'fighterA' ? 'Fighter A' : 'Fighter B'} slot is already occupied!`);
        }

        const [cardToPlay] = hand.splice(idx, 1);
        cardToPlay.isFaceDown = false;
        cardToPlay.isTapped = false;
        bZone[targetSlot].card = cardToPlay;

        // Broadcast secure FOW states to all connections
        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();
        targetSockets.forEach(sockId => {
            const sock = io.sockets.sockets.get(sockId);
            if (sock) {
                let viewerRole = "spectator";
                if (table.playerA.includes(sockId)) viewerRole = "playerA";
                if (table.playerB.includes(sockId)) viewerRole = "playerB";
                sendSanitizedState(sock, table, viewerRole);
            }
        });
    });

    socket.on("placeDeckCardToStack", ({ tableId, targetPlayer, targetSlot }) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const deck = table.gameState[targetPlayer]?.deck;
        const bZone = table.gameState[targetPlayer]?.battleZone;
        if (!deck || deck.length === 0) return socket.emit("errorMsg", "Deck is empty.");

        // Mutate state model
        const cardToStack = deck.pop();
        cardToStack.isFaceDown = true;
        if (!bZone[targetSlot].faceDownStack) bZone[targetSlot].faceDownStack = [];
        bZone[targetSlot].faceDownStack.push(cardToStack);

        // Secure broadcast
        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();
        targetSockets.forEach(sockId => {
            const sock = io.sockets.sockets.get(sockId);
            if (sock) {
                let viewerRole = table.playerA.includes(sockId) ? "playerA" : table.playerB.includes(sockId) ? "playerB" : "spectator";
                sendSanitizedState(sock, table, viewerRole);
            }
        });
    });

    socket.on("flipAndDiscardFromStack", ({ tableId, targetPlayer, targetSlot }) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const bZone = table.gameState[targetPlayer]?.battleZone;
        const stack = bZone?.[targetSlot]?.faceDownStack;
        const discard = table.gameState[targetPlayer]?.discard;
        if (!stack || stack.length === 0) return socket.emit("errorMsg", "Stack empty.");

        // Mutate state model
        const poppedCard = stack.pop();
        poppedCard.isFaceDown = false;
        poppedCard.isTapped = false;
        discard.push(poppedCard);

        // Secure broadcast
        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();
        targetSockets.forEach(sockId => {
            const sock = io.sockets.sockets.get(sockId);
            if (sock) {
                let viewerRole = table.playerA.includes(sockId) ? "playerA" : table.playerB.includes(sockId) ? "playerB" : "spectator";
                sendSanitizedState(sock, table, viewerRole);
            }
        });
    });

    socket.on("moveFighterToDefeated", ({ tableId, targetPlayer, slot }) => {
        return moveFighterOrStageToZone(socket, tableId, targetPlayer, slot, 'defeated');
    });

    socket.on("moveFighterToSupport", ({ tableId, targetPlayer, slot }) => {
        return moveFighterOrStageToZone(socket, tableId, targetPlayer, slot, 'support');
    });

    socket.on("discardCardFromHand", ({tableId: tableId, targetPlayer: targetPlayer, handIndex: handIndex}) => {
        return moveCardToZone(socket, tableId, targetPlayer, 'hand', handIndex, 'discard');
    });

    socket.on("adjustDefeatedPoints", ({tableId: tableId, targetPlayer: targetPlayer, amount: amount}) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const pState = table.gameState[targetPlayer];
        if (!pState) return socket.emit("errorMsg", "Player state not found.");

        // 1. Mutate the data model on the server
        pState.defeatedPoints = Math.max(0, pState.defeatedPoints + parseInt(amount));

        // 2. Aggregate all multi-socket connections
        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();

        // 3. Broadcast clean, role-aware frames via your serialization engine
        targetSockets.forEach(sockId => {
            const sock = io.sockets.sockets.get(sockId);
            if (sock) {
                let viewerRole = "spectator";
                if (table.playerA.includes(sockId)) viewerRole = "playerA";
                if (table.playerB.includes(sockId)) viewerRole = "playerB";
                sendSanitizedState(sock, table, viewerRole);
            }
        });
    });

    socket.on("recycleDiscardToDeck", ({tableId: tableId, targetPlayer: targetPlayer}) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const playerState = table.gameState[targetPlayer];
        if (!playerState) return socket.emit("errorMsg", `Player state not found.`);

        const deck = playerState.deck;
        const discard = playerState.discard;

        if (!discard || discard.length === 0) {
            return socket.emit("errorMsg", `Discard pile is empty! Nothing to recycle.`);
        }

        const recycledCount = discard.length;

        // Execute the core array mutations on the server database
        while (discard.length > 0) {
            const card = discard.pop();
            card.isFaceDown = true;
            card.isTapped = false;
            deck.push(card);
        }

        // Run UUID randomization sort sequence
        deck.forEach(card => { card.shuffleId = uuidv4() });
        deck.sort((a, b) => a.shuffleId.localeCompare(b.shuffleId));
        deck.forEach(card => { delete card.shuffleId });

        // Aggregate connections and dispatch individualized FOW updates
        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();
        targetSockets.forEach(sockId => {
            const sock = io.sockets.sockets.get(sockId);
            if (sock) {
                let viewerRole = "spectator";
                if (table.playerA.includes(sockId)) viewerRole = "playerA";
                if (table.playerB.includes(sockId)) viewerRole = "playerB";
                sendSanitizedState(sock, table, viewerRole);
            }
        });

        socket.emit("serverNotice", `Recycled all ${recycledCount} cards from discard to deck face down, and fully shuffled the deck!`);
    });

    socket.on("checkTableStatus", ({tableId: tableId, role: role}) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");
        
        // 🛡️ CRASH GUARD: Spectators go straight to table; they have no deck state to check
        if (role === "spectator") {
            return socket.emit("tableStatusResponse", {tableId: table.id, role: role, hasDeckLoaded: false});
        }

        const targetPlayerState = table.gameState[role];
        let hasDeckLoaded = false;
        
        if (targetPlayerState) {
            const bZone = targetPlayerState.battleZone || {};
            const hasDeckCards = !!(targetPlayerState.deck && targetPlayerState.deck.length > 0);
            const hasHandCards = !!(targetPlayerState.hand && targetPlayerState.hand.length > 0);
            const hasDiscardCards = !!(targetPlayerState.discard && targetPlayerState.discard.length > 0);
            const hasSupportCards = !!(targetPlayerState.support && targetPlayerState.support.length > 0);
            const hasDefeatedCards = !!(targetPlayerState.defeated && targetPlayerState.defeated.length > 0);
            const hasFighterA = !!(bZone.fighterA && bZone.fighterA.card);
            const hasFighterB = !!(bZone.fighterB && bZone.fighterB.card);
            const hasStage = !!bZone.stage;
            const hasStackA = !!(bZone.fighterA && bZone.fighterA.faceDownStack && bZone.fighterA.faceDownStack.length > 0);
            const hasStackB = !!(bZone.fighterB && bZone.fighterB.faceDownStack && bZone.fighterB.faceDownStack.length > 0);
            
            hasDeckLoaded = hasDeckCards || hasHandCards || hasDiscardCards || hasSupportCards || hasDefeatedCards || hasFighterA || hasFighterB || hasStage || hasStackA || hasStackB;
        }
        
        socket.emit("tableStatusResponse", {tableId: table.id, role: role, hasDeckLoaded: hasDeckLoaded});
    });


    socket.on("moveDiscardToDefeated", ({ tableId, targetPlayer, discardIndex }) => {
        return moveCardToZone(socket, tableId, targetPlayer, 'discard', discardIndex, 'defeated');
    });

    socket.on("playCardToStage", ({tableId: tableId, targetPlayer: targetPlayer, handIndex: handIndex}) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const hand = table.gameState[targetPlayer]?.hand;
        const battleZone = table.gameState[targetPlayer]?.battleZone;
        
        if (!hand || hand.length === 0) return socket.emit("errorMsg", "Hand is completely empty!");

        const idx = parseInt(handIndex);
        if (isNaN(idx) || idx < 0 || idx >= hand.length) return socket.emit("errorMsg", "Invalid hand position index selection.");

        // FIX: Safely verify occupancy without running Object.keys on null pointers
        if (battleZone.stage && Object.keys(battleZone.stage).length > 0) {
            return socket.emit("errorMsg", "The Stage zone position is already occupied!");
        }

        const [cardToStage] = hand.splice(idx, 1);
        cardToStage.isFaceDown = false;
        cardToStage.isTapped = false;
        battleZone.stage = cardToStage;

        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();
        targetSockets.forEach(sockId => {
            const sock = io.sockets.sockets.get(sockId);
            if (sock) {
                let viewerRole = "spectator";
                if (table.playerA.includes(sockId)) viewerRole = "playerA";
                if (table.playerB.includes(sockId)) viewerRole = "playerB";
                sendSanitizedState(sock, table, viewerRole);
            }
        });

        socket.emit("serverNotice", `Successfully placed card into stage position.`);
    });

    socket.on("signalEndGame", ({ tableId, targetPlayer }) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");
        if (targetPlayer !== "playerA" && targetPlayer !== "playerB") return socket.emit("errorMsg", "Invalid player role.");

        table.endGameSignals[targetPlayer] = true;

        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();

        // Check if mutual consent is achieved
        if (table.endGameSignals.playerA && table.endGameSignals.playerB) {
            console.log(`🧼 [SYSTEM RESET]: Mutual consent achieved on Table ${tableId}. Resetting board...`);
            
            // Flatten multi-socket arrays securely into spectators list
            if (Array.isArray(table.playerA)) table.spectators.push(...table.playerA);
            if (Array.isArray(table.playerB)) table.spectators.push(...table.playerB);
            
            // Sanitize seats back to baseline state arrays
            table.playerA = [];
            table.playerB = [];
            table.endGameSignals.playerA = false;
            table.endGameSignals.playerB = false;

            const baselineState = () => ({
                hand: [], deck: [], extraDeck: [], discard: [], support: [], defeated: [], defeatedPoints: 0,
                battleZone: { fighterA: { card: null, faceDownStack: [] }, fighterB: { card: null, faceDownStack: [] }, stage: null }
            });
            table.gameState.playerA = baselineState();
            table.gameState.playerB = baselineState();
        }

        // Direct, centralized broadcast to all multi-socket pointers
        targetSockets.forEach(sockId => {
            const sock = io.sockets.sockets.get(sockId);
            if (sock) {
                let viewerRole = "spectator";
                if (table.playerA.includes(sockId)) viewerRole = "playerA";
                if (table.playerB.includes(sockId)) viewerRole = "playerB";
                sendSanitizedState(sock, table, viewerRole);
            }
        });
    });

    socket.on("revokeEndGame", ({ tableId, targetPlayer }) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");
        if (targetPlayer !== "playerA" && targetPlayer !== "playerB") return socket.emit("errorMsg", "Invalid player role.");

        table.endGameSignals[targetPlayer] = false;

        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();
        targetSockets.forEach(sockId => {
            const sock = io.sockets.sockets.get(sockId);
            if (sock) {
                let viewerRole = table.playerA.includes(sockId) ? "playerA" : table.playerB.includes(sockId) ? "playerB" : "spectator";
                sendSanitizedState(sock, table, viewerRole);
            }
        });
    });

    socket.on("returnSupportToHand", ({ tableId, targetPlayer, supportIndex }) => {
        return moveCardToZone(socket, tableId, targetPlayer, 'support', supportIndex, 'hand');
    });

    socket.on("discardSupport", ({ tableId, targetPlayer, supportIndex }) => {
        return moveCardToZone(socket, tableId, targetPlayer, 'support', supportIndex, 'discard');
    });

    socket.on("drawSupport", ({ tableId, targetPlayer }) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");
        
        const deck = table.gameState[targetPlayer]?.deck;
        return moveCardToZone(socket, tableId, targetPlayer, 'deck', (deck.length - 1), 'support');
    });

    socket.on('requestCardMove', ({ tableId, targetPlayer, targetZone, targetIndex, destinationZone, isPlaceOnTop = true }) => {
        const validZones = ['hand', 'support', 'discard', 'defeated', 'deck'];
        if (!validZones.includes(targetZone)) return socket.emit("errorMsg", "Invalid target."); 
        if (!validZones.includes(destinationZone)) return socket.emit("errorMsg", "Invalid destination."); 

        return moveCardToZone(socket, tableId, targetPlayer, targetZone, targetIndex, destinationZone, isPlaceOnTop);
    });

    socket.on('requestCardToFighterOrStage', ({ tableId, targetPlayer, targetZone, targetIndex, destinationZone }) => {
        const validTargets = ['hand', 'support', 'discard', 'defeated', 'deck'];
        if (!validTargets.includes(targetZone)) return socket.emit("errorMsg", "Invalid target."); 

        const validDestinations = ['fighterA', 'fighterB', 'stage'];
        if (!validDestinations.includes(destinationZone)) return socket.emit("errorMsg", "Invalid destination.");

        return moveCardToFighterOrStage(socket, tableId, targetPlayer, targetZone, targetIndex, destinationZone);
    })

    socket.on('requestFighterOrStageToZone', ({ tableId, targetPlayer, targetZone, destinationZone, isPlaceOnTop }) => {
        const validTargets = ['fighterA', 'fighterB', 'stage'];
        if (!validTargets.includes(targetZone)) return socket.emit("errorMsg", "Invalid target."); 

        const validDestinations = ['hand', 'support', 'discard', 'defeated', 'deck'];
        if (!validDestinations.includes(destinationZone)) return socket.emit("errorMsg", "Invalid destination.");

        return moveFighterOrStageToZone(socket, tableId, targetPlayer, targetZone, destinationZone, isPlaceOnTop);
    })

});

console.log(`TCG Server on ${process.env.RAILWAY_PUBLIC_DOMAIN}`);
