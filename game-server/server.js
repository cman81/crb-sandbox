const io = require('socket.io')(3000, { cors: { origin: "*" } });
const { v4: uuidv4 } = require('uuid');

const tables = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1, 
  playerA: null, 
  playerB: null, 
  spectators: [],
  gameState: {
    playerA: { hand: [], deck: [], extraDeck: [], discard: [], support: [], defeated: [], battleZone: { fighterA: { card: null, faceDownStack: [] }, fighterB: { card: null, faceDownStack: [] }, stage: null } },
    playerB: { hand: [], deck: [], extraDeck: [], discard: [], support: [], defeated: [], battleZone: { fighterA: { card: null, faceDownStack: [] }, fighterB: { card: null, faceDownStack: [] }, stage: null } }
  }
}));

function sendSanitizedState(socket, table, role) {
  const maskCard = () => ({ name: "Card Back", isFaceDown: true });
  
  const sanitizeZone = (zone, isVisible) => {
    if (isVisible) return zone;
    return Array.isArray(zone) ? zone.map(maskCard) : (Object.keys(zone).length ? maskCard() : {});
  };

  const sanitizeBattleZone = (battleZone, isSpec) => {
    if (!battleZone) return null;
    return {
      stage: battleZone.stage,
      fighterA: {
        card: battleZone.fighterA.card,
        faceDownStack: isSpec ? battleZone.fighterA.faceDownStack : battleZone.fighterA.faceDownStack.map(maskCard)
      },
      fighterB: {
        card: battleZone.fighterB.card,
        faceDownStack: isSpec ? battleZone.fighterB.faceDownStack : battleZone.fighterB.faceDownStack.map(maskCard)
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
      battleZone: sanitizeBattleZone(state.playerA.battleZone, isSpec)
    },
    playerB: {
      hand: sanitizeZone(state.playerB.hand, canSeeB),
      deck: sanitizeZone(state.playerB.deck, isSpec),
      extraDeck: sanitizeZone(state.playerB.extraDeck, canSeeB),
      discard: state.playerB.discard,
      support: state.playerB.support,
      defeated: state.playerB.defeated,
      battleZone: sanitizeBattleZone(state.playerB.battleZone, isSpec)
    }
  });
}

function leaveAll(socketId) {
  tables.forEach(t => {
    if (t.playerA === socketId) t.playerA = null;
    if (t.playerB === socketId) t.playerB = null;
    t.spectators = t.spectators.filter(id => id !== socketId);
    // Automatic broadcast tracking completely removed here
  });
}

io.on('connection', (socket) => {
  socket.on('joinTable', ({ tableId, role }) => {
    const table = tables.find(t => t.id === parseInt(tableId));
    if (!table) return socket.emit('errorMsg', 'Table not found.');
    leaveAll(socket.id);

    if (role === 'playerA' && !table.playerA) table.playerA = socket.id;
    else if (role === 'playerB' && !table.playerB) table.playerB = socket.id;
    else if (role === 'spectator') table.spectators.push(socket.id);
    else return socket.emit('errorMsg', 'Seat taken.');
    
  });

  socket.on('leaveTable', () => leaveAll(socket.id));
  socket.on('disconnect', () => leaveAll(socket.id));

  socket.on('loadDeck', ({ tableId, targetPlayer, deckList }) => {
    const table = tables.find(t => t.id === parseInt(tableId));
    if (!table) return socket.emit('errorMsg', 'Table not found.');
    if (targetPlayer !== 'playerA' && targetPlayer !== 'playerB') return socket.emit('errorMsg', 'Invalid target player.');

    table.gameState[targetPlayer].deck = deckList.map((code) => ({
      id: code,
      name: `Card ${code}`,
      isFaceDown: true
    }));

    socket.emit('serverNotice', `Deck loaded with ${deckList.length} uniquely indexed cards.`);
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
});

console.log('TCG Server on 3000');
