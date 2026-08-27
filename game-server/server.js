const PORT = process.env.PORT || 3000;
const { v4: uuidv4 } = require("uuid");
const redis = require("redis");

// Initialize Socket.io with optimized WebSocket fallback streams
const io = require("socket.io")(PORT, {
    cors: {
        origin: [
            "https://github.io",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
            "http://localhost",
            "http://127.0.0.1"
        ],
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ["websocket"]
});

// Global tracking flag to determine our active hybrid persistence pipeline engine mode
let isRedisConnected = false;

// Create our Redis client instance with an instant-fail local reconnect strategy
const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    socket: {
        reconnectStrategy: false // Stop background retry loops immediately if database is missing locally
    }
});

// Handle edge-case database failures gracefully without allowing thread crashes
redisClient.on('error', (err) => {
    // Suppress heavy console error flooding log strings when running locally in simulation mode
    if (!process.env.REDIS_URL) return;
    console.error('🔴 Redis persistent engine layer error:', err.message);
});

// Execute the async cloud connection thread handshake
redisClient.connect().then(async () => {
    console.log("🟢 Success: Cloud Redis stream engine successfully attached.");
    isRedisConnected = true;

    // Trigger our streamlined auditing utility pass
    await auditProductionRegistry();
}).catch(err => {
    console.log("ℹ️ Local Notice: Redis URL not configured/running. Seamlessly defaulting to Memory Fallback Array.");
    isRedisConnected = false;
});

/**
 * Iterates through all standard room slots to verify that the target tables exist 
 * within the live production database instance, initializing them if missing.
 * Reduces cyclomatic complexity by abstracting row insertions into a single sub-task pass.
 * 
 * @returns {Promise<void>} Resolves when the entire production keys database audit loop finishes.
 */
async function auditProductionRegistry() {
    console.log("⚙️ Auditing persistent room table records inside production registry...");

    for (let i = 1; i <= 8; i++) {
        await provisioningTableSlot(i);
    }

    console.log("✅ Complete: Production database cluster fully provisioned and ready for players.");
}

/**
 * Checks a specific table index key map node inside Redis and seeds a clean 
 * factory structural data string template if the registry node is currently empty.
 * 
 * @param {number} tableIndex - The target table identification number (1 through 8).
 * @returns {Promise<void>} Resolves when the atomic database key map has been audited and verified.
 */
async function provisioningTableSlot(tableIndex) {
    const tableKey = `table:${tableIndex}:refs`;
    const tableExists = await redisClient.exists(tableKey);

    // Early exit if the table row has already been generated inside the Redis cluster memory
    if (tableExists) return;

    console.log(`📝 [PRODUCTION SCHEMA PROVISION]: Seeding factory references for Table ${tableIndex}`);

    // Extract the clean factory template straight out of your existing fallback array
    const factoryTemplate = tables.find(t => t.id === tableIndex);
    if (!factoryTemplate) return;

    // Seed the Redis database hash fields with standard setup configuration strings
    await redisClient.hSet(tableKey, {
        id: factoryTemplate.id.toString(),
        playerA: JSON.stringify(factoryTemplate.playerA),
        playerB: JSON.stringify(factoryTemplate.playerB),
        spectators: JSON.stringify(factoryTemplate.spectators),
        endGameSignalA: factoryTemplate.endGameSignals.playerA.toString(),
        endGameSignalB: factoryTemplate.endGameSignals.playerB.toString(),
        gameState: JSON.stringify(factoryTemplate.gameState)
    });
}

const tables = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    playerA: [],
    playerB: [],
    spectators: [],
    endGameSignals: { playerA: false, playerB: false },
    isTbdActive: false,
    timekeeper: "",
    currentPlayhead: null,
    liveHead: null,
    gameState: {
        battleLog: [], 
        playerA: {
            hand: [], deck: [], extraDeck: [], discard: [], support: [], defeated: [],
            defeatedPoints: 0, battleZone: {
                fighterA: { card: null, faceDownStack: [] },
                fighterB: { card: null, faceDownStack: [] },
                extraA: null,
                extraB: null,
                stage: null
            }
        },
        playerB: {
            hand: [], deck: [], extraDeck: [], discard: [], support: [], defeated: [],
            defeatedPoints: 0, battleZone: {
                fighterA: { card: null, faceDownStack: [] },
                fighterB: { card: null, faceDownStack: [] },
                extraA: null,
                extraB: null,
                stage: null
            }
        }
    }
}));

// =========================================================================
// HYBRID DATA MAPPING PIPELINE HELPERS
// =========================================================================

/**
 * Pulls the latest data for a specific table from the database or local memory.
 * It reads the timekeeper role tracking strings directly to prevent null states.
 *
 * @async
 * @param {string|number} tableId - The room number to look up.
 * @returns {Promise<Object|null>} The complete table object, or null if not found.
 */
async function getTableContext(tableId) {
    const parsedId = parseInt(tableId, 10);
    
    if (isRedisConnected) {
        const refs = await redisClient.hGetAll(`table:${parsedId}:refs`);
        if (!refs || Object.keys(refs).length === 0) return null;

        // 1. Find out which turn the timeline is looking at right now
        const playheadId = refs.currentPlayhead;
        let activeGameState = {};

        // 2. Fetch the board layout that matches this specific turn identifier
        if (playheadId) {
            const snapshotRaw = await redisClient.hGet(`table:${parsedId}:snapshots`, playheadId);
            if (snapshotRaw) {
                activeGameState = JSON.parse(snapshotRaw).gameState;
            }
        }

        // 3. Combine everything into a single operational table object
        return {
            id: parsedId,
            playerA: JSON.parse(refs.playerA || "[]"),
            playerB: JSON.parse(refs.playerB || "[]"),
            spectators: JSON.parse(refs.spectators || "[]"),
            endGameSignals: {
                playerA: refs.endGameSignalA === "true",
                playerB: refs.endGameSignalB === "true"
            },
            // ⏳ Timeline Tracking Data Maps
            isTbdActive: refs.isTbdActive === "true",
            timekeeper: refs.timekeeper || "", 
            currentPlayhead: playheadId || null,
            liveHead: refs.liveHead || null,
            gameState: activeGameState
        };
    }

    const memoryTable = tables.find(t => t.id === parsedId);
    return memoryTable || null;
}

/**
 * Saves a new table version and handles the Retcon Cut using clean player role strings.
 * If the role matches "playerA" or "playerB" while viewing history, it cuts off the
 * old future and makes this new move the official present day.
 *
 * @async
 * @param {string|number} tableId - The room number to save.
 * @param {Object} tableObj - The updated table data object from the server.
 * @param {string} [actingRole="system"] - The role making the move ("playerA", "playerB", or "system").
 * @param {string} [logMessage=""] - A text description of the gameplay action performed.
 * @returns {Promise<void>}
 */
async function saveTableContext(tableId, tableObj, actingRole = "system", logMessage = "") {
    const parsedId = parseInt(tableId, 10);

    if (isRedisConnected) {
        const refsKey = `table:${parsedId}:refs`;
        const snapshotsKey = `table:${parsedId}:snapshots`;

        const refs = await redisClient.hGetAll(refsKey);
        const oldPlayhead = refs.currentPlayhead || null;
        const oldLiveHead = refs.liveHead || null;

        let shortNodeId = uuidv4().split('-')[0];

        let collisionCheck = await redisClient.hExists(snapshotsKey, shortNodeId);
        while (collisionCheck) {
            shortNodeId = uuidv4().split('-')[0];
            collisionCheck = await redisClient.hExists(snapshotsKey, shortNodeId);
        }

        if (!tableObj.gameState.battleLog || !Array.isArray(tableObj.gameState.battleLog)) {
            tableObj.gameState.battleLog = [];
        }

        if (logMessage) {
            const timestamp = new Date().toLocaleTimeString();
            tableObj.gameState.battleLog.push(`[${timestamp}] ${logMessage}`);
            
            if (tableObj.gameState.battleLog.length > 50) {
                tableObj.gameState.battleLog.shift();
            }
        }

        // ⏳ The node graph now records a clean, persistent role string identifier
        const timelineNode = {
            nodeId: shortNodeId,
            parentId: oldPlayhead,
            actionBy: actingRole, // Stores "playerA", "playerB", or "system"
            timestamp: Date.now(),
            gameState: tableObj.gameState
        };
        await redisClient.hSet(snapshotsKey, shortNodeId, JSON.stringify(timelineNode));

        // 🔥 CLEAN ROLE RETCON GATEKEEPER:
        // If an actual playing role moves a card, advance the live head to this new turn.
        // If it is just a background configuration update ("system"), leave the future alone!
        let nextLiveHeadPointer = shortNodeId;
        if (actingRole === "system") {
            nextLiveHeadPointer = oldLiveHead || shortNodeId;
        }

        await redisClient.hSet(refsKey, {
            playerA: JSON.stringify(tableObj.playerA),
            playerB: JSON.stringify(tableObj.playerB),
            spectators: JSON.stringify(tableObj.spectators),
            endGameSignalA: tableObj.endGameSignals.playerA.toString(),
            endGameSignalB: tableObj.endGameSignals.playerB.toString(),
            isTbdActive: (tableObj.isTbdActive || false).toString(),
            timekeeper: tableObj.timekeeper || "",
            currentPlayhead: shortNodeId,
            liveHead: nextLiveHeadPointer
        });
        return;
    }

    const matchIdx = tables.findIndex(t => t.id === parsedId);
    if (matchIdx !== -1) {
        tables[matchIdx] = tableObj;
    }
}

/**
 * Sanitizes and sends the table state to a specific player or spectator socket.
 * It hides face-down or private opponent cards while appending the timeline variables.
 *
 * @param {Object} socket - The individual player's connected socket instance.
 * @param {Object} table - The active table data object loaded from the database.
 * @param {string} role - The connection's visibility lens ("playerA", "playerB", or "spectator").
 */
function sendSanitizedState(socket, table, role) {
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
            },
            extraA: battleZone.extraA,
            extraB: battleZone.extraB
        };
    };

    const isSpec = role === "spectator";
    const canSeeA = isSpec || role === "playerA";
    const canSeeB = isSpec || role === "playerB";
    const state = table.gameState;
    const sanitizedBattleLog = getSanitizedBattleLog(state, role);

    socket.emit("stateUpdate", {
        tableId: table.id,
        endGameSignals: table.endGameSignals,
        
        // ⏳ New Timeline variables added to the main payload loop
        isTbdActive: table.isTbdActive,
        timekeeper: table.timekeeper || null, 
        currentPlayhead: table.currentPlayhead,
        liveHead: table.liveHead,
        gameState: { battleLog: sanitizedBattleLog },

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

/**
 * Cleans the battle history logs based on who is viewing the game.
 * It hides private opponent actions (like private card draws wrapped in bracket tags)
 * and turns them into generic placeholders to preserve the game's Fog-of-War.
 *
 * @param {Object} state - The active game state object containing the raw battle log array.
 * @param {string} role - The room seat identity of the client looking at the logs ("playerA", "playerB", or "spectator").
 * @returns {Array<string>} A brand new, player-safe array of cleaned up history log strings.
 */
function getSanitizedBattleLog(state, role) {
    let sanitizedBattleLog = [];

    if (state.battleLog && Array.isArray(state.battleLog)) {
        sanitizedBattleLog = state.battleLog.map(line => {
            let processedLine = line;

            // Pattern checking for Player A secrets: [A:Secret Text]
            if (role === "playerB") {
                // If the viewer is the enemy, mask Player A's private card info completely
                processedLine = processedLine.replace(/\[A:.*?\]/g, "a card");
                // Mask Player B's own secrets too if they are looking backwards, or leave simple tags
                processedLine = processedLine.replace(/\[B:(.*?)\]/g, "$1");
            } else if (role === "playerA") {
                // If the viewer is the owner, strip the bracket tags but reveal the title text
                processedLine = processedLine.replace(/\[A:(.*?)\]/g, "$1");
                // Mask Player B's card choices for Player A
                processedLine = processedLine.replace(/\[B:.*?\]/g, "a card");
            } else {
                // Spectators hold X-Ray vision privileges: reveal everything cleanly
                processedLine = processedLine.replace(/\[A:(.*?)\]/g, "$1");
                processedLine = processedLine.replace(/\[B:(.*?)\]/g, "$1");
            }

            return processedLine;
        });
    }

    return sanitizedBattleLog;
}

/**
 * Splices a single card asset out of an un-shuffled pile array and transfers it directly 
 * into an active field coordinate location, validating placement bounds to protect against overwriting slots.
 * 
 * @param {Object} socket - The active client Socket.io connectivity connection handle.
 * @param {string|number} tableId - Target table array match slot key lookup.
 * @param {string} targetPlayer - Player reference string indicating who owns the card asset data.
 * @param {string} fromZone - Source storage bucket pile name ("hand", "discard", "deck", "extraDeck").
 * @param {number|string} fromIndex - Array sorting index targeting the object item position.
 * @param {string} toZone - Destination coordinate zone slot key ("fighterA", "fighterB", "stage").
 * @returns {Promise<void>} Resolves when the operational state update transaction is complete.
 */
async function moveCardToFighterOrStage(socket, tableId, targetPlayer, fromZone, fromIndex, toZone) {
    const table = await getTableContext(tableId);
    if (!table) return socket.emit("errorMsg", "Table not found.");
    if (fromZone == toZone) {
        return socket.emit("errorMsg", "Zones are the same, nothing to move.");
    }

    if (fromZone == 'extraDeck') {
        if (toZone == 'fighterA') {
            toZone = 'extraA';
        }
        if (toZone == 'fighterB') {
            toZone = 'extraB';
        }
    }

    const targetArray = table.gameState[targetPlayer]?.[fromZone];
    const destinationBattleZone = table.gameState[targetPlayer]?.battleZone;

    if (!targetArray || targetArray.length === 0) return socket.emit("errorMsg", fromZone + "zone is empty!");

    // If we are moving from the deck, disregard index - we are drawing from the end of the array, i.e.: the top of the deck
    const idx = (fromZone == 'deck') ? (targetArray.length - 1) : parseInt(fromIndex);
    if (isNaN(idx) || idx < 0 || idx >= targetArray.length) return socket.emit("errorMsg", "Invalid index selection.");

    const stageOrExtra = ['stage', 'extraA', 'extraB'];
    const destinationCard = (stageOrExtra.includes(toZone))
        ? destinationBattleZone[toZone]
        : destinationBattleZone[toZone].card;

    if (destinationCard !== null) {
        return socket.emit("errorMsg", `${toZone} is not empty, so we can't move a card into it.`);
    }

    // 1. Execute the mutation directly on the data model
    const [cardToMove] = targetArray.splice(idx, 1);

    cardToMove.isTapped = false;
    cardToMove.isFaceDown = (toZone == 'fighterA');

    if (stageOrExtra.includes(toZone)) {
        destinationBattleZone[toZone] = cardToMove;
    } else {
        destinationBattleZone[toZone].card = cardToMove;
    }

    const logText = `${targetPlayer} moved [${(targetPlayer == 'playerA') ? 'A' : 'B'}:${cardToMove.name}] from ${fromZone} to ${toZone}`;
    await saveTableContext(tableId, table, targetPlayer, logText);

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

async function moveCardToZone(socket, tableId, targetPlayer, fromZone, fromIndex, toZone, isPlaceOnTop = true, table = null) {
    if (!table) {
        table = await getTableContext(tableId);
    }
    if (!table) return socket.emit("errorMsg", "Table not found.");

    if (fromZone == toZone) {
        return socket.emit("errorMsg", "Zones are the same, nothing to move.");
    }

    const targetArray = table.gameState[targetPlayer]?.[fromZone];
    const destinationArray = table.gameState[targetPlayer]?.[toZone];

    if (!targetArray || targetArray.length === 0) return socket.emit("errorMsg", fromZone + " zone is empty!");

    // If we are moving from the deck, disregard index - we are drawing from the end of the array, i.e.: the top of the deck
    const idx = (fromZone == 'deck') ? (targetArray.length - 1) : parseInt(fromIndex);
    if (isNaN(idx) || idx < 0 || idx >= targetArray.length) return socket.emit("errorMsg", "Invalid index selection.");

    // 1. Execute the mutation directly on the data model
    const [cardToMove] = targetArray.splice(idx, 1);

    cardToMove.isTapped = false;
    switch (toZone) {
        case 'hand':
        case 'discard':
        case 'support':
        case 'defeated':
        case 'extraDeck':
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

    // Commit the state mutation and multi-cast update frames across the table room profile arrays
    const logText = `${targetPlayer} moved [${(targetPlayer == 'playerA') ? 'A' : 'B'}:${cardToMove.name}] from ${fromZone} to ${toZone}`;
    await saveTableContext(tableId, table, targetPlayer, logText);

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

/**
 * Removes a card from an active combat lane position slot and routes it back into a standard tracking array pile.
 * 
 * @param {Object} socket - The active client Socket.io connectivity connection handle.
 * @param {string|number} tableId - Target table array match slot key lookup.
 * @param {string} targetPlayer - Player reference string indicating who owns the card asset data.
 * @param {string} slot - The active field coordinate target location ("fighterA", "fighterB", "stage", "extraA", "extraB").
 * @param {string} toZone - Target storage collection matrix array name ("hand", "support", "discard", etc.).
 * @param {boolean} [isPlaceOnTop=true] - Array placement orientation parameter flag.
 * @returns {Promise<void>} Resolves when the operational state update transaction is complete.
 */
async function moveFighterOrStageToZone(socket, tableId, targetPlayer, slot, toZone, isPlaceOnTop = true) {
    const table = await getTableContext(tableId);
    if (!table) return socket.emit("errorMsg", "Table not found.");

    const pState = table.gameState[targetPlayer];
    let targetCard = pState?.battleZone?.[slot]?.card;

    const stageOrExtra = ['stage', 'extraA', 'extraB'];
    if (stageOrExtra.includes(slot)) {
        targetCard = pState?.battleZone?.[slot];
    }
    if (!targetCard) return socket.emit("errorMsg", "Card not found in battle slot " + slot);

    const destinationArray = pState?.[toZone];
    if (!destinationArray) return socket.emit("errorMsg", `Destination zone '${toZone}' not found.`);

    // 1. Mutate state model: empty the fighter/stage slot database node cleanly
    if (stageOrExtra.includes(slot)) {
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


    const logText = `📡 [FIGHTER RELOCATION ENGINE]: Shifted tracking frame from active slot ${slot} to array zone ${toZone} for ${targetPlayer}.`;
    console.log(logText);
    await saveTableContext(tableId, table, targetPlayer, logText);

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

/**
 * Global clean-up handler that strips a disconnected or exiting client socket ID 
 * out of all active seating and spectator tracking arrays across all 8 tables.
 * Seamlessly loops through local memory tracking arrays and active production
 * Redis database hashes to purge dead connectivity references.
 * 
 * @param {string} socketId - The unique connectivity identifier string of the departing socket.
 * @returns {Promise<void>} Resolves when the multi-table persistence scrub transaction finishes.
 */
async function leaveAll(socketId) {
    // 🧹 Purge Step 1: Clean your local development fallback RAM tracking array
    tables.forEach(t => {
        t.playerA = t.playerA.filter(id => id !== socketId);
        t.playerB = t.playerB.filter(id => id !== socketId);
        t.spectators = t.spectators.filter(id => id !== socketId);
    });

    // Early exit if running locally without a live production cluster attached
    if (!isRedisConnected) return;

    // 🧹 Purge Step 2: Clean your live persistent Redis cloud data layer rows
    for (let i = 1; i <= 8; i++) {
        const tableKey = `table:${i}:refs`;
        const data = await redisClient.hGetAll(tableKey);

        // Skip table nodes that haven't been seeded or are completely missing
        if (!data || Object.keys(data).length === 0) continue;

        // Parse text properties into fresh operational JavaScript list arrays
        const playerA = JSON.parse(data.playerA || "[]");
        const playerB = JSON.parse(data.playerB || "[]");
        const spectators = JSON.parse(data.spectators || "[]");

        // Apply filters to strip the target socket ID out of the seating collections
        const cleanA = playerA.filter(id => id !== socketId);
        const cleanB = playerB.filter(id => id !== socketId);
        const cleanSpec = spectators.filter(id => id !== socketId);

        // Commit modifications back down to Redis to maintain active room slot vacancies
        await redisClient.hSet(tableKey, {
            playerA: JSON.stringify(cleanA),
            playerB: JSON.stringify(cleanB),
            spectators: JSON.stringify(cleanSpec)
        });
    }
}

io.on("connection", socket => {
    /**
     * Handles table registration requests, routing connecting sockets to their selected
     * seating array while clearing their old seat assignments across our hybrid data layer.
     * 
     * @param {Object} payload - Incoming network transaction packet.
     * @param {string|number} payload.tableId - Target table layout identifier reference.
     * @param {string} payload.role - Target viewing role configuration assignment ("playerA", "playerB", "spectator").
     */
    socket.on("joinTable", async ({ tableId: tableId, role: role }) => {
        const table = await getTableContext(tableId);
        if (!table) return socket.emit("errorMsg", "Table not found.");

        // 1. Wipe this socket ID from all tables completely before seating it
        await leaveAll(socket.id);

        // Re-fetch a fresh instance of the target table to capture the cleanup adjustments
        const updatedTable = await getTableContext(tableId);
        if (!updatedTable) return socket.emit("errorMsg", "Table context tracking dropped.");

        // 2. Clear out any ghost duplicates from this target seat list before pushing
        if (role === "playerA") {
            updatedTable.playerA = updatedTable.playerA.filter(id => id !== socket.id);
            updatedTable.playerA.push(socket.id);
        } else if (role === "playerB") {
            updatedTable.playerB = updatedTable.playerB.filter(id => id !== socket.id);
            updatedTable.playerB.push(socket.id);
        } else if (role === "spectator") {
            updatedTable.spectators = updatedTable.spectators.filter(id => id !== socket.id);
            updatedTable.spectators.push(socket.id);
        } else {
            return socket.emit("errorMsg", "Invalid role definition.");
        }

        if (role === "playerA" || role === "playerB") {
            updatedTable.endGameSignals[role] = false;
        }

        // Commit the seating adjustments down to our active hybrid persistence tier
        const logText = `📡 [HYBRID PERSISTENCE SEAT]: Added socket ${socket.id} uniquely to Table ${tableId} for ${role}`;
        console.log(logText);
        await saveTableContext(tableId, updatedTable, role, logText);

        // Deliver a dedicated, perfectly masked state frame to the calling user session
        sendSanitizedState(socket, updatedTable, role);
    });

    socket.on("leaveTable", async () => await leaveAll(socket.id));

    socket.on("disconnect", async () => await leaveAll(socket.id));

    /**
     * Parses inbound deck validation arrays and converts raw card configurations into 
     * discrete sandbox objects, writing them to our verified hybrid persistence tier.
     * 
     * @param {Object} payload - Incoming data packet configuration reference.
     * @param {string|number} payload.tableId - Target table database identifier reference.
     * @param {string} payload.targetPlayer - Target player seat identification ("playerA" or "playerB").
     * @param {Array<Object>} payload.deckList - Array of user main deck card profiles.
     * @param {Array<Object>} payload.extraDeckList - Array of user side/extra deck card profiles.
     */
    socket.on("loadDeck", async ({ tableId: tableId, targetPlayer: targetPlayer, deckList: deckList, extraDeckList: extraDeckList }) => {
        const table = await getTableContext(tableId);
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

        table.gameState[targetPlayer].extraDeck = extraDeckList.map(cardObj => ({
            id: cardObj.id,
            title: cardObj.title,
            name: `Extra Card ${cardObj.id}`,
            isFaceDown: true,
            isTapped: false,
            uuid: uuidv4()
        }));

        // Commit the deck data mapping configurations straight down to our active hybrid database layer
        const logText = `${targetPlayer} loaded their deck with ${deckList.length} uniquely titled cards. Extra Deck: ${extraDeckList.length} entries.`;
        await saveTableContext(tableId, table, targetPlayer, logText);

        socket.emit("serverNotice", `Deck loaded with ${deckList.length} uniquely titled cards. Extra Deck: ${extraDeckList.length} entries.`);
    });

    socket.on('getGameState', async ({ tableId, role }) => {
        const table = await getTableContext(tableId);
        if (!table) return socket.emit('errorMsg', 'Table not found.');

        sendSanitizedState(socket, table, role);
    });

    /**
     * Shuffles a player's deck array inside our hybrid tier using a random UUID sort algorithm.
     * Safely updates configuration tables to maintain absolute room parity across connections.
     * 
     * @param {Object} payload - Incoming data packet configuration reference.
     * @param {string|number} payload.tableId - Target table database identifier reference.
     * @param {string} payload.targetPlayer - Target player seat string identification ("playerA" or "playerB").
     */
    socket.on('shuffleDeck', async ({ tableId, targetPlayer }) => {
        const table = await getTableContext(tableId);
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

        // Commit the randomized stack order back down to our hybrid persistence layer
        const logText = `${targetPlayer}'s deck shuffled successfully`;
        await saveTableContext(tableId, table, targetPlayer, logText);

        socket.emit('serverNotice', `Deck shuffled successfully using random UUID sort!`);
    });

    /**
     * Draws exactly 6 cards from the top of the player's deck array to establish an opening hand.
     * 
     * @param {Object} payload - Incoming data packet configuration reference.
     * @param {string|number} payload.tableId - Target table database identifier reference.
     * @param {string} payload.targetPlayer - Target player seat string identification ("playerA" or "playerB").
     */
    socket.on("draw6Cards", async ({ tableId: tableId, targetPlayer: targetPlayer }) => {
        const table = await getTableContext(tableId);
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

        // Commit the state mutation and multi-cast update frames across the table room profile arrays
        const logText = `${targetPlayer.toUpperCase()} successfully drew a 6-card opening hand.`;
        await saveTableContext(tableId, table, targetPlayer, logText);

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

    socket.on("flipCardFaceUp", async ({ tableId: tableId, targetPlayer: targetPlayer }) => {
        const table = await getTableContext(tableId);
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const card = table.gameState[targetPlayer]?.battleZone?.fighterA?.card;
        if (!card) return socket.emit("errorMsg", "No card found in Fighter A slot to flip.");

        // 1. Permanently remove the face-down mask condition on the server model
        card.isFaceDown = false;

        const logText = `📡 [DECOUPLED FLIP]: ${targetPlayer} card flipped face up for ${targetPlayer}. Broadcasting state...`;
        console.log(logText);
        await saveTableContext(tableId, table, targetPlayer, logText);

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

    socket.on("toggleCardTap", async ({ tableId, targetPlayer, zone, supportIndex }) => {
        const table = await getTableContext(tableId);
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const bZone = table.gameState[targetPlayer]?.battleZone;
        const support = table.gameState[targetPlayer]?.support;
        let targetCard = null;

        if (zone === "fighterA") {
            targetCard = (bZone?.extraA) ? (bZone?.extraA) : bZone?.fighterA?.card;
        }
        else if (zone === "fighterB") {
            targetCard = (bZone?.extraB) ? (bZone?.extraB) : bZone?.fighterB?.card;
        }
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

        // 📝 Build your descriptive action message string
        const stateLabel = targetCard.isTapped ? "TAPPED" : "UNTAPPED";        
        const logText = `${targetPlayer.toUpperCase()} shifted card in ${zone} to ${stateLabel}.`;

        await saveTableContext(tableId, table, targetPlayer, logText);

        // 3. Broadcast the animation instruction
        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();
        targetSockets.forEach(sockId => {
            io.to(sockId).emit("cardTap", animationPayload);
        });
    });

    socket.on("placeDeckCardToStack", async ({ tableId, targetPlayer, targetSlot }) => {
        const table = await getTableContext(tableId);
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const deck = table.gameState[targetPlayer]?.deck;
        const bZone = table.gameState[targetPlayer]?.battleZone;
        if (!deck || deck.length === 0) return socket.emit("errorMsg", "Deck is empty.");

        // Mutate state model
        const cardToStack = deck.pop();
        cardToStack.isFaceDown = true;
        if (!bZone[targetSlot].faceDownStack) bZone[targetSlot].faceDownStack = [];
        bZone[targetSlot].faceDownStack.push(cardToStack);

        const logText = `${targetPlayer} moved a card from their deck to the top of their face-down stack for ${targetSlot}`;
        await saveTableContext(tableId, table, targetPlayer, logText);

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

    socket.on("flipAndDiscardFromStack", async ({ tableId, targetPlayer, targetSlot }) => {
        const table = await getTableContext(tableId);
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

        const logText = `${targetPlayer} flipped up a card from the face-down stack of ${targetSlot} and discarded it`;
        await saveTableContext(tableId, table, targetPlayer, logText);

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

    socket.on("adjustDefeatedPoints", async ({ tableId: tableId, targetPlayer: targetPlayer, amount: amount }) => {
        const table = await getTableContext(tableId);
        if (!table) return socket.emit("errorMsg", "Table not found.");

        const pState = table.gameState[targetPlayer];
        if (!pState) return socket.emit("errorMsg", "Player state not found.");

        // 1. Mutate the data model on the server
        pState.defeatedPoints = Math.max(0, pState.defeatedPoints + parseInt(amount));

        const logText = `${targetPlayer} adjusted their defeated points by ${amount}`
        await saveTableContext(tableId, table, 'system', logText);

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

    socket.on("recycleDiscardToDeck", async ({ tableId: tableId, targetPlayer: targetPlayer }) => {
        const table = await getTableContext(tableId);
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

        const logText = `${targetPlayer} moved all discards to the deck and shuffled the deck`;
        await saveTableContext(tableId, table, targetPlayer, logText);

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

    socket.on("checkTableStatus", async ({ tableId: tableId, role: role }) => {
        const table = await getTableContext(tableId);
        if (!table) return socket.emit("errorMsg", "Table not found.");

        // 🛡️ CRASH GUARD: Spectators go straight to table; they have no deck state to check
        if (role === "spectator") {
            return socket.emit("tableStatusResponse", { tableId: table.id, role: role, hasDeckLoaded: false });
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

        socket.emit("tableStatusResponse", { tableId: table.id, role: role, hasDeckLoaded: hasDeckLoaded });
    });

    socket.on("signalEndGame", async ({ tableId, targetPlayer }) => {
        const table = await getTableContext(tableId);
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

        const logText = `${targetPlayer} wants to end the game`;
        await saveTableContext(tableId, table, 'system', logText);

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

    socket.on("revokeEndGame", async ({ tableId, targetPlayer }) => {
        const table = await getTableContext(tableId);
        if (!table) return socket.emit("errorMsg", "Table not found.");
        if (targetPlayer !== "playerA" && targetPlayer !== "playerB") return socket.emit("errorMsg", "Invalid player role.");

        table.endGameSignals[targetPlayer] = false;

        const logText = `${targetPlayer} no longer wants to end the game`;
        await saveTableContext(tableId, table, 'system', logText);

        const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();
        targetSockets.forEach(sockId => {
            const sock = io.sockets.sockets.get(sockId);
            if (sock) {
                let viewerRole = table.playerA.includes(sockId) ? "playerA" : table.playerB.includes(sockId) ? "playerB" : "spectator";
                sendSanitizedState(sock, table, viewerRole);
            }
        });
    });

    socket.on('requestCardMove', ({ tableId, targetPlayer, targetZone, targetIndex, destinationZone, isPlaceOnTop = true }) => {
        const validZones = ['hand', 'support', 'discard', 'defeated', 'deck', 'extraDeck'];
        if (!validZones.includes(targetZone)) return socket.emit("errorMsg", "Invalid target.");
        if (!validZones.includes(destinationZone)) return socket.emit("errorMsg", "Invalid destination.");

        return moveCardToZone(socket, tableId, targetPlayer, targetZone, targetIndex, destinationZone, isPlaceOnTop);
    });

    socket.on('requestCardToFighterOrStage', ({ tableId, targetPlayer, targetZone, targetIndex, destinationZone }) => {
        const validTargets = ['hand', 'support', 'discard', 'defeated', 'deck', 'extraDeck'];
        if (!validTargets.includes(targetZone)) return socket.emit("errorMsg", "Invalid target.");

        const validDestinations = ['fighterA', 'fighterB', 'stage', 'extraA', 'extraB'];
        if (!validDestinations.includes(destinationZone)) return socket.emit("errorMsg", "Invalid destination.");

        return moveCardToFighterOrStage(socket, tableId, targetPlayer, targetZone, targetIndex, destinationZone);
    })

    socket.on('requestFighterOrStageToZone', ({ tableId, targetPlayer, targetZone, destinationZone, isPlaceOnTop }) => {
        const validTargets = ['fighterA', 'fighterB', 'stage', 'extraA', 'extraB'];
        if (!validTargets.includes(targetZone)) return socket.emit("errorMsg", "Invalid target.");

        const validDestinations = ['hand', 'support', 'discard', 'defeated', 'deck', 'extraDeck'];
        if (!validDestinations.includes(destinationZone)) return socket.emit("errorMsg", "Invalid destination.");

        return moveFighterOrStageToZone(socket, tableId, targetPlayer, targetZone, destinationZone, isPlaceOnTop);
    })

    // --- TBD TIMELINE REGISTRY LISTENERS ---

    /**
     * Freezes time for a table and assigns lock ownership to a chosen role.
     * It checks which socket belongs to that role and gives them control.
     */
    socket.on("requestTimeFreeze", async ({ tableId, role }) => {
        const table = await getTableContext(tableId);
        if (!table) return socket.emit("errorMsg", "Table not found.");

        // Clean safety wrapper: format empty database values down to an empty text string
        const currentLockHolder = table.timekeeper || "";

        // ⏳ Updated Guard: Only block if time is active AND a different role owns the lock
        if (table.isTbdActive && currentLockHolder !== "" && currentLockHolder !== role) {
            return socket.emit("errorMsg", `Timeline is already frozen by ${currentLockHolder}.`);
        }

        table.isTbdActive = true;
        table.timekeeper = role;

        await redisClient.hSet(`table:${tableId}:refs`, {
            isTbdActive: "true",
            timekeeper: role
        });

        console.log(`⏳ [TIMELINE LOCK]: Table ${tableId} frozen by Timekeeper role: ${role}`);
        broadcastTableStateToRoom(table);
    });

    /**
     * Shifts the active board state backward or forward through the match history logs.
     * When moving forward, it looks for the next turn link leading toward the present edge.
     */
    socket.on("stepTimeline", async ({ tableId, direction, role }) => {
        const table = await getTableContext(tableId);
        if (!table) return socket.emit("errorMsg", "Table not found.");

        // ⏳ Simplified check: verify the role parameter matches the current lock holder string
        if (table.isTbdActive && table.timekeeper !== role) {
            return socket.emit("errorMsg", `Action blocked: Only ${table.timekeeper} can control the timeline right now.`);
        }

        const refsKey = `table:${tableId}:refs`;
        const snapshotsKey = `table:${tableId}:snapshots`;
        const currentPlayheadId = table.currentPlayhead;

        if (direction === "backward") {
            const nodeRaw = await redisClient.hGet(snapshotsKey, currentPlayheadId);
            if (nodeRaw) {
                const node = JSON.parse(nodeRaw);
                if (node.parentId) {
                    await redisClient.hSet(refsKey, "currentPlayhead", node.parentId);
                    console.log(`◀ [PLAYHEAD SHIFT]: Moved backward to parent [${node.parentId}]`);
                } else {
                    return socket.emit("errorMsg", "Already resting at the absolute genesis match turn.");
                }
            }
        } else if (direction === "forward") {
            if (currentPlayheadId === table.liveHead) {
                return socket.emit("errorMsg", "Cannot step forward. You are already looking at the present day.");
            }

            const allSnapshots = await redisClient.hGetAll(snapshotsKey);
            let nextForwardNodeId = null;

            for (const id in allSnapshots) {
                const node = JSON.parse(allSnapshots[id]);
                if (node.parentId === currentPlayheadId) {
                    nextForwardNodeId = id;
                    break;
                }
            }

            if (nextForwardNodeId) {
                await redisClient.hSet(refsKey, "currentPlayhead", nextForwardNodeId);
                console.log(`▶ [PLAYHEAD SHIFT]: Moved forward to child turn [${nextForwardNodeId}]`);
            } else {
                return socket.emit("errorMsg", "Could not discover a forward history path.");
            }
        }

        const updatedTable = await getTableContext(tableId);
        broadcastTableStateToRoom(updatedTable);
    });

    /**
     * Turns off the time freeze lock and returns the room to active live tracking.
     * It leaves the live head pointer alone so future turns are never accidentally erased.
     */
    socket.on("resumeTimeline", async ({ tableId, role }) => {
        const table = await getTableContext(tableId);
        if (!table) return socket.emit("errorMsg", "Table not found.");

        // ⏳ Check the role argument string
        if (table.isTbdActive && table.timekeeper !== role) {
            return socket.emit("errorMsg", `Action blocked: Only ${table.timekeeper} can unlock the timeline.`);
        }

        await redisClient.hSet(`table:${tableId}:refs`, {
            isTbdActive: "false",
            timekeeper: ""
        });

        console.log(`🟢 [TIMELINE RESUMED]: Match unfrozen on Table ${tableId}. Reality set to version [${table.currentPlayhead}]`);

        const updatedTable = await getTableContext(tableId);
        broadcastTableStateToRoom(updatedTable);
    });

});

/**
 * Sets up a new game table slot in Redis if it does not exist yet.
 * It copies the starting layout from memory, makes an 8-character ID 
 * for the very first turn, and saves all setup details to the database.
 *
 * @async
 * @param {number} tableIndex - The table number to set up (1 to 8).
 * @returns {Promise<void>}
 */
async function provisioningTableSlot(tableIndex) {
    const tableKey = `table:${tableIndex}:refs`;
    const tableExists = await redisClient.exists(tableKey);
    if (tableExists) return;

    console.log(`📝 [PRODUCTION SCHEMA PROVISION]: Seeding factory references for Table ${tableIndex}`);
    const factoryTemplate = tables.find(t => t.id === tableIndex);
    if (!factoryTemplate) return;

    // 1. Generate an 8-character unique Genesis Node key
    const genesisNodeId = uuidv4().split('-')[0];
    
    // 2. Wrap the initial structural game state inside your timeline node ledger format
    const initialTimelineNode = {
        nodeId: genesisNodeId,
        parentId: null,
        actionBy: "system",
        timestamp: Date.now(),
        gameState: factoryTemplate.gameState
    };

    // 3. Write this clean root block straight into your snapshots lookup hash map
    await redisClient.hSet(`table:${tableIndex}:snapshots`, genesisNodeId, JSON.stringify(initialTimelineNode));

    // 4. Seed the primary routing pointers container
    await redisClient.hSet(tableKey, {
        id: factoryTemplate.id.toString(),
        playerA: JSON.stringify(factoryTemplate.playerA),
        playerB: JSON.stringify(factoryTemplate.playerB),
        spectators: JSON.stringify(factoryTemplate.spectators),
        endGameSignalA: factoryTemplate.endGameSignals.playerA.toString(),
        endGameSignalB: factoryTemplate.endGameSignals.playerB.toString(),
        // ⏳ Timeline Tracking Seeds
        isTbdActive: "false",
        timekeeperSocketId: "",
        currentPlayhead: genesisNodeId,
        liveHead: genesisNodeId
    });
}

/**
 * Finds all sockets connected to a table and sends them their sanitized state updates.
 *
 * @param {Object} table - The active table data object loaded from the database.
 */
function broadcastTableStateToRoom(table) {
    const targetSockets = [table.playerA, table.playerB, ...table.spectators].filter(Boolean).flat();
    
    targetSockets.forEach(sockId => {
        const sock = io.sockets.sockets.get(sockId);
        if (sock) {
            let viewerRole = "spectator";
            if (table.playerA.includes(sockId)) viewerRole = "playerA";
            if (table.playerB.includes(sockId)) viewerRole = "playerB";
            
            // Invoke the clean core handler directly
            sendSanitizedState(sock, table, viewerRole);
        }
    });
}

/**
 * Checks if the game room is currently frozen by a timeline session.
 * It identifies the role of the moving player and returns true if they
 * do not match the assigned timekeeper role holding the lock.
 *
 * @param {Object} table - The active table object loaded from the database.
 * @param {string} socketId - The unique socket ID of the player attempting to act.
 * @returns {boolean} True if the player is locked out, false if their action is allowed.
 */
function isTimeFrozen(table, socketId) {
    if (table && table.isTbdActive) {
        // If time is frozen, identify which slot this incoming socket occupies
        let actingRole = null;
        if (table.playerA.includes(socketId)) actingRole = "playerA";
        if (table.playerB.includes(socketId)) actingRole = "playerB";

        // Block the move if their current role does not match the active timekeeper string
        return table.timekeeper !== actingRole;
    }
    return false;
}

console.log(`TCG Server on ${process.env.RAILWAY_PUBLIC_DOMAIN}`);
