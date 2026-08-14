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


function sendSanitizedState(socket, table, role) {
    const maskCard = () => ({ name: "Card Back", isFaceDown: true });

    const sanitizeZone = (zone, isVisible) => {
        if (isVisible) return zone;
        return Array.isArray(zone) ? zone.map(maskCard) : (Object.keys(zone).length ? maskCard() : {});
    };

    // --- Fixed, Secure Role-Aware BattleZone Masking ---
    const sanitizeBattleZone = (battleZone, zoneOwner, viewerRole) => {
        if (!battleZone) return null;

        const isSpec = viewerRole === 'spectator';
        const isOwner = viewerRole === zoneOwner;

        // Helper function to hide a single card if it's face down and viewed by an opponent
        const maskIfHidden = (card) => {
            if (!card || Object.keys(card).length === 0) return null;
            if (card.isFaceDown && !isOwner && !isSpec) return maskCard();
            return card;
        };

        return {
            stage: battleZone.stage,
            fighterA: {
                card: maskIfHidden(battleZone.fighterA.card),
                // CHANGE: Only spectators see the real cards inside the stack. 
                // Players (even the owner) only see card backs!
                faceDownStack: isSpec
                    ? battleZone.fighterA.faceDownStack
                    : battleZone.fighterA.faceDownStack.map(maskCard)
            },
            fighterB: {
                card: maskIfHidden(battleZone.fighterB.card),
                // CHANGE: Applied identically to fighterB's stack
                faceDownStack: isSpec
                    ? battleZone.fighterB.faceDownStack
                    : battleZone.fighterB.faceDownStack.map(maskCard)
            }
        };
    };

    const isSpec = role === 'spectator';
    const canSeeA = isSpec || role === 'playerA';
    const canSeeB = isSpec || role === 'playerB';
    const state = table.gameState;

    socket.emit('stateUpdate', {
        playerA: {
            hand: sanitizeZone(state.playerA.hand, canSeeA),
            deck: sanitizeZone(state.playerA.deck, isSpec),
            extraDeck: sanitizeZone(state.playerA.extraDeck, canSeeA),
            discard: state.playerA.discard,
            support: state.playerA.support,
            defeated: state.playerA.defeated,
            // Pass 'playerA' as the zone owner to check permissions against the viewer's role
            battleZone: sanitizeBattleZone(state.playerA.battleZone, 'playerA', role)
        },
        playerB: {
            hand: sanitizeZone(state.playerB.hand, canSeeB),
            deck: sanitizeZone(state.playerB.deck, isSpec),
            extraDeck: sanitizeZone(state.playerB.extraDeck, canSeeB),
            discard: state.playerB.discard,
            support: state.playerB.support,
            defeated: state.playerB.defeated,
            // Pass 'playerB' as the zone owner to check permissions against the viewer's role
            battleZone: sanitizeBattleZone(state.playerB.battleZone, 'playerB', role)
        }
    });
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

    socket.on('loadDeck', ({ tableId, targetPlayer, deckList }) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit('errorMsg', 'Table not found.');
        if (targetPlayer !== 'playerA' && targetPlayer !== 'playerB') return socket.emit('errorMsg', 'Invalid target player.');

        // Map over the incoming array payload structures
        table.gameState[targetPlayer].deck = deckList.map(cardObj => ({
            id: cardObj.id,
            title: cardObj.title, // Cache the clean captured title string safely
            name: `Card ${cardObj.id}`, // Maintain previous placeholder legacy support compatibility
            isFaceDown: true,
            isTapped: false
        }));

        socket.emit('serverNotice', `Deck loaded with ${deckList.length} uniquely titled cards.`);
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
        const hand = table.gameState[targetPlayer]?.hand;
        
        if (!deck || deck.length === 0) return socket.emit("errorMsg", `${targetPlayer}'s deck is empty!`);

        // 1. Execute the draw mutation on the server data model
        const drawnCard = deck.pop();
        drawnCard.isFaceDown = false;
        hand.push(drawnCard);

        // 2. Aggregate all multi-socket connection strings for this table instance
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

        socket.emit("serverNotice", `${targetPlayer} successfully drew 1 card.`);
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
        if (!hand || idx < 0 || idx >= hand.length) return socket.emit("errorMsg", "Invalid index.");

        const [cardToPlay] = hand.splice(idx, 1);
        cardToPlay.isFaceDown = true;
        cardToPlay.isTapped = false;
        bZone.fighterA.card = cardToPlay;

        const maskCard = () => ({name: "Card Back", isFaceDown: true});
        const ownerPayload = {targetPlayer: targetPlayer, card: cardToPlay, handCount: hand.length};
        const opponentPayload = {targetPlayer: targetPlayer, card: maskCard(), handCount: hand.length};

        // FIX: Loop arrays while routing proper masked payloads by seat perspective
        table.playerA.forEach(sid => io.to(sid).emit("cardPlayedFaceDownUpdate", targetPlayer === "playerA" ? ownerPayload : opponentPayload));
        table.playerB.forEach(sid => io.to(sid).emit("cardPlayedFaceDownUpdate", targetPlayer === "playerB" ? ownerPayload : opponentPayload));
        table.spectators.forEach(sid => io.to(sid).emit("cardPlayedFaceDownUpdate", ownerPayload));
    });

    socket.on("flipCardFaceUp", ({tableId: tableId, targetPlayer: targetPlayer}) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");
        const card = table.gameState[targetPlayer]?.battleZone?.fighterA?.card;
        if (!card) return socket.emit("errorMsg", "No card found.");

        card.isFaceDown = false;
        const payload = {targetPlayer: targetPlayer, card: card};
        
        // FIX: Loop arrays to reveal the flipped card to everyone simultaneously
        table.playerA.forEach(sid => io.to(sid).emit("cardFlippedFaceUpUpdate", payload));
        table.playerB.forEach(sid => io.to(sid).emit("cardFlippedFaceUpUpdate", payload));
        table.spectators.forEach(sid => io.to(sid).emit("cardFlippedFaceUpUpdate", payload));
    });

    socket.on("playHandToTopDeck", ({tableId: tableId, targetPlayer: targetPlayer, handIndex: handIndex}) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const hand = table.gameState[targetPlayer]?.hand;
        const deck = table.gameState[targetPlayer]?.deck;
        
        const idx = parseInt(handIndex);
        if (!hand || idx < 0 || idx >= hand.length) return socket.emit("errorMsg", "Invalid hand index selection.");

        // 1. Mutate the server model (Push to the end of the deck array)
        const [cardToDeck] = hand.splice(idx, 1);
        cardToDeck.isFaceDown = true;
        cardToDeck.isTapped = false;
        deck.push(cardToDeck);

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

    socket.on("playHandToBottomDeck", ({tableId: tableId, targetPlayer: targetPlayer, handIndex: handIndex}) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const hand = table.gameState[targetPlayer]?.hand;
        const deck = table.gameState[targetPlayer]?.deck;
        
        const idx = parseInt(handIndex);
        if (!hand || idx < 0 || idx >= hand.length) return socket.emit("errorMsg", "Invalid hand index selection.");

        // 1. Mutate the server model (Unshift to the front of the deck array)
        const [cardToDeck] = hand.splice(idx, 1);
        cardToDeck.isFaceDown = true;
        cardToDeck.isTapped = false;
        deck.unshift(cardToDeck);

        // 2. Aggregate connections
        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();

        // 3. Broadcast securely
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

    socket.on("toggleCardTap", ({tableId: tableId, targetPlayer: targetPlayer, zone: zone, supportIndex: supportIndex}) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");
        const bZone = table.gameState[targetPlayer]?.battleZone;
        const support = table.gameState[targetPlayer]?.support;
        
        let targetCard = null;
        if (zone === "fighterA") targetCard = bZone?.fighterA?.card;
        else if (zone === "fighterB") targetCard = bZone?.fighterB?.card;
        else if (zone === "stage") targetCard = bZone?.stage;
        else if (zone === "support") targetCard = support[parseInt(supportIndex)];

        if (!targetCard) return socket.emit("errorMsg", "Card not found.");
        targetCard.isTapped = !targetCard.isTapped;

        const payload = {targetPlayer: targetPlayer, zone: zone, supportIndex: zone === "support" ? parseInt(supportIndex) : null, isTapped: targetCard.isTapped};
        
        // FIX: Loop through player arrays instead of targeting a single string ID
        table.playerA.forEach(sid => io.to(sid).emit("cardTapUpdated", payload));
        table.playerB.forEach(sid => io.to(sid).emit("cardTapUpdated", payload));
        table.spectators.forEach(sid => io.to(sid).emit("cardTapUpdated", payload));
    });

    socket.on("playCardToSupport", ({tableId: tableId, targetPlayer: targetPlayer, handIndex: handIndex}) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const hand = table.gameState[targetPlayer]?.hand;
        const support = table.gameState[targetPlayer]?.support;
        const idx = parseInt(handIndex);
        
        if (!hand || idx < 0 || idx >= hand.length) return socket.emit("errorMsg", "Invalid hand index selection.");

        const [cardToPlay] = hand.splice(idx, 1);
        cardToPlay.isFaceDown = false;
        support.push(cardToPlay);

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

    socket.on("playCardToFighter", ({tableId: tableId, targetPlayer: targetPlayer, handIndex: handIndex, targetSlot: targetSlot}) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const hand = table.gameState[targetPlayer]?.hand;
        const bZone = table.gameState[targetPlayer]?.battleZone;
        const idx = parseInt(handIndex);
        
        if (!hand || idx < 0 || idx >= hand.length) return socket.emit("errorMsg", "Invalid hand index selection.");

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
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const pState = table.gameState[targetPlayer];
        const targetCard = pState?.battleZone?.[slot]?.card;
        if (!targetCard) return socket.emit("errorMsg", "Card not found.");

        // Mutate state model
        pState.battleZone[slot].card = null;
        targetCard.isFaceDown = false;
        targetCard.isTapped = false;
        pState.defeated.push(targetCard);

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

    socket.on("adjustDefeatedPoints", ({tableId: tableId, targetPlayer: targetPlayer, amount: amount}) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");
        const pState = table.gameState[targetPlayer];
        if (!pState) return socket.emit("errorMsg", "Player state not found.");
        
        pState.defeatedPoints = Math.max(0, pState.defeatedPoints + parseInt(amount));

        const payload = {targetPlayer: targetPlayer, totalDefeatedPoints: pState.defeatedPoints, isEliminated: pState.defeatedPoints >= 10};
        
        // FIX: Loop through multi-socket arrays instead of single strings
        table.playerA.forEach(sid => io.to(sid).emit("defeatedPointsTickedUpdate", payload));
        table.playerB.forEach(sid => io.to(sid).emit("defeatedPointsTickedUpdate", payload));
        table.spectators.forEach(sid => io.to(sid).emit("defeatedPointsTickedUpdate", payload));
    });

    socket.on("discardCardFromHand", ({tableId: tableId, targetPlayer: targetPlayer, handIndex: handIndex}) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const hand = table.gameState[targetPlayer]?.hand;
        const discard = table.gameState[targetPlayer]?.discard;
        
        if (!hand || hand.length === 0) return socket.emit("errorMsg", "Hand is empty!");
        
        const idx = parseInt(handIndex);
        if (isNaN(idx) || idx < 0 || idx >= hand.length) return socket.emit("errorMsg", "Invalid hand index selection.");

        // 1. Execute the mutation directly on the data model
        const [cardToDiscard] = hand.splice(idx, 1);
        cardToDiscard.isFaceDown = false;
        cardToDiscard.isTapped = false;
        discard.push(cardToDiscard);

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

        socket.emit("serverNotice", `Successfully discarded card from hand index ${idx}.`);
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
        while (discard.length > 0) {
            const card = discard.pop();
            card.isFaceDown = true;
            card.isTapped = false;
            deck.push(card);
        }

        deck.forEach(card => { card.shuffleId = uuidv4() });
        deck.sort((a, b) => a.shuffleId.localeCompare(b.shuffleId));
        deck.forEach(card => { delete card.shuffleId });

        const cleanPayload = {targetPlayer: targetPlayer, deckCount: deck.length, discardCount: 0, updatedDiscard: []};

        // FIX: Multi-socket array loops for discard recycling
        table.playerA.forEach(sid => io.to(sid).emit("discardRecycledUpdate", cleanPayload));
        table.playerB.forEach(sid => io.to(sid).emit("discardRecycledUpdate", cleanPayload));
        table.spectators.forEach(sid => io.to(sid).emit("discardRecycledUpdate", cleanPayload));

        socket.emit("serverNotice", `Recycled all ${recycledCount} cards from discard to deck face down, and fully shuffled the deck!`);
    });

    socket.on("checkTableStatus", ({ tableId: tableId, role: role }) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const targetPlayerState = table.gameState[role];

        // Evaluate if ANY zone contains cards to determine if a deck was loaded for this match
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

            hasDeckLoaded = hasDeckCards || hasHandCards || hasDiscardCards ||
                hasSupportCards || hasDefeatedCards || hasFighterA ||
                hasFighterB || hasStage || hasStackA || hasStackB;
        }

        socket.emit("tableStatusResponse", {
            tableId: table.id,
            role: role,
            hasDeckLoaded: hasDeckLoaded
        });
    });

    socket.on("moveDiscardToDefeated", ({ tableId, targetPlayer, discardIndex }) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const playerState = table.gameState[targetPlayer];
        if (!playerState) return socket.emit("errorMsg", "Player state structural map not found.");

        const discard = playerState.discard;
        const defeated = playerState.defeated;

        if (!discard || discard.length === 0) {
            return socket.emit("errorMsg", "Discard pile is completely empty!");
        }

        const idx = parseInt(discardIndex);
        if (isNaN(idx) || idx < 0 || idx >= discard.length) {
            return socket.emit("errorMsg", `Invalid discard index choice.`);
        }

        // 1. Mutate the data model on the server (the single source of truth)
        const [retiredCard] = discard.splice(idx, 1);
        retiredCard.isFaceDown = false;
        retiredCard.isTapped = false;
        
        // Push directly to the top of the defeated pile array
        defeated.push(retiredCard);

        // 2. Build a flat participant list to distribute the updates
        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();

        // 3. Leverage sendSanitizedState to securely push individual FOW views
        targetSockets.forEach(sockId => {
            const sock = io.sockets.sockets.get(sockId);
            if (sock) {
                let viewerRole = "spectator";
                if (table.playerA.includes(sockId)) viewerRole = "playerA";
                if (table.playerB.includes(sockId)) viewerRole = "playerB";
                
                sendSanitizedState(sock, table, viewerRole);
            }
        });

        socket.emit("serverNotice", `Successfully extracted card from discard index ${idx} to defeated zone.`);
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

    socket.on("executeDevMulligan", ({ tableId, targetPlayer }) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const pState = table.gameState[targetPlayer];
        if (!pState) return socket.emit("errorMsg", "Invalid player slot targeted.");

        console.log(`⚡ [DEV MACRO]: Processing atomic Mulligan matrix loop for player slot: ${targetPlayer}`);

        // 1. Flush hand cards face-down back into the deck's tail boundary array
        while (pState.hand.length > 0) {
            const card = pState.hand.pop();
            card.isFaceDown = true;
            card.isTapped = false;
            pState.deck.push(card);
        }

        // 2. Execute program shuffle scramble with alphabetic UUID sorting rules
        pState.deck.forEach(card => { card.shuffleId = uuidv4(); });
        pState.deck.sort((a, b) => a.shuffleId.localeCompare(b.shuffleId));
        pState.deck.forEach(card => { delete card.shuffleId; });

        // 3. Pop 6 fresh top deck cards into the player hand
        for (let i = 0; i < 6; i++) {
            if (pState.deck.length > 0) {
                const drawnCard = pState.deck.pop();
                drawnCard.isFaceDown = false;
                pState.hand.push(drawnCard);
            }
        }

        // 4. Dispatch synchronized sanitization states across all active sockets
        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean);
        targetSockets.forEach(sockId => {
            const targetSock = io.sockets.sockets.get(sockId);
            if (targetSock) {
                let viewerRole = "spectator";
                if (sockId === table.playerA) viewerRole = "playerA";
                if (sockId === table.playerB) viewerRole = "playerB";
                sendSanitizedState(targetSock, table, viewerRole);
            }
        });

        socket.emit("serverNotice", `Mulligan completed! Hand returned to deck tail, scrambled via UUID, and 6 cards redrawn.`);
    });

    socket.on('signalEndGame', ({ tableId, targetPlayer }) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit('errorMsg', 'Table not found.');
        if (targetPlayer !== 'playerA' && targetPlayer !== 'playerB') {
            return socket.emit('errorMsg', 'Invalid player role targeted.');
        }

        // 1. Commit the pending intent signal flag to the staging map
        table.endGameSignals[targetPlayer] = true;

        // Broadcast status to the developer stream and active clients
        const signalStatus = `Player A: ${table.endGameSignals.playerA ? '🚨' : '🟢'} | Player B: ${table.endGameSignals.playerB ? '🚨' : '🟢'}`;
        io.emit('serverNotice', `[TABLE ${tableId} ADMIN]: Match end proposed. Current matrix: ${signalStatus}`);

        // Dispatch a targeted logging update for the developer mode console listeners
        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean);
        targetSockets.forEach(sockId => {
            const sock = io.sockets.sockets.get(sockId);
            if (sock) sock.emit('endGameSignalUpdate', { tableId: table.id, ...table.endGameSignals });
        });

        // 2. RESOLUTION RESOLVER: Check if BOTH active seats have consented to clear the table
        if (table.endGameSignals.playerA && table.endGameSignals.playerB) {
            console.log(`🧼 [SYSTEM RESET TRIPPED]: Mutual consent achieved on Table ${tableId}. Clearing board...`);
            
            // Use spread syntax to cleanly flatten multi-socket arrays into spectators
            if (Array.isArray(table.playerA)) table.spectators.push(...table.playerA);
            if (Array.isArray(table.playerB)) table.spectators.push(...table.playerB);
            
            // RESET SEATS TO RE-INITIALIZED ARRAYS, NEVER NULL
            table.playerA = [];
            table.playerB = [];
            table.endGameSignals.playerA = false;
            table.endGameSignals.playerB = false;


            // Hard-scrub all game state nested data structures
            const baselineState = () => ({
                hand: [], deck: [], extraDeck: [], discard: [], support: [], defeated: [],
                defeatedPoints: 0,
                battleZone: {
                    fighterA: { card: null, faceDownStack: [] },
                    fighterB: { card: null, faceDownStack: [] },
                    stage: null
                }
            });

            table.gameState.playerA = baselineState();
            table.gameState.playerB = baselineState();

            // 3. MULTI-CHANNEL BROADCAST RIPPLE EFFECT
            // Send specialized developer logger packet
            targetSockets.forEach(sockId => {
                const sock = io.sockets.sockets.get(sockId);
                if (!sock) return;

                sock.emit('tableClearedReset', { tableId: table.id });

                // Force a soft redraw pass. Because players are now spectators, 
                // they will instantly see a pristine, completely blank screen area.
                let viewerRole = 'spectator';
                if (sockId === table.playerA) viewerRole = 'playerA';
                if (sockId === table.playerB) viewerRole = 'playerB';
                sendSanitizedState(sock, table, viewerRole);
            });
        }
    });

    socket.on('revokeEndGame', ({ tableId, targetPlayer }) => {
        const table = tables.find(t => t.id === parseInt(tableId));
        if (!table) return socket.emit('errorMsg', 'Table not found.');
        if (targetPlayer !== 'playerA' && targetPlayer !== 'playerB') {
            return socket.emit('errorMsg', 'Invalid player role targeted.');
        }

        // Retract the signal flag back to idle status
        table.endGameSignals[targetPlayer] = false;

        const signalStatus = `Player A: ${table.endGameSignals.playerA ? '🚨' : '🟢'} | Player B: ${table.endGameSignals.playerB ? '🚨' : '🟢'}`;
        io.emit('serverNotice', `[TABLE ${tableId} ADMIN]: Match end proposal revoked. Current matrix: ${signalStatus}`);

        // Update logging streams across developer consoles
        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean);
        targetSockets.forEach(sockId => {
            const sock = io.sockets.sockets.get(sockId);
            if (sock) sock.emit('endGameSignalUpdate', { tableId: table.id, ...table.endGameSignals });
        });
    });

});

console.log(`TCG Server on ${process.env.RAILWAY_PUBLIC_DOMAIN}`);
