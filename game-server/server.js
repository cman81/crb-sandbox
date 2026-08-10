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

    table.gameState[targetPlayer].deck = deckList.map(code => ({
      id: code,
      name: `Card ${code}`,
      isFaceDown: true,
      isTapped: false
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

  socket.on('drawCard', ({ tableId, targetPlayer }) => {
    const table = tables.find(t => t.id === parseInt(tableId));
    if (!table) return socket.emit('errorMsg', 'Table not found.');

    const deck = table.gameState[targetPlayer]?.deck;
    const hand = table.gameState[targetPlayer]?.hand;

    if (!deck || deck.length === 0) {
      return socket.emit('errorMsg', `${targetPlayer}'s deck is empty! Cannot draw.`);
    }

    // Process the physical card draw
    const drawnCard = deck.pop();
    drawnCard.isFaceDown = false; 
    hand.push(drawnCard);

    // --- Dynamic Network Notification Broadcasting ---
    const maskCard = () => ({ name: "Card Back", isFaceDown: true });
    
    // 1. The Owner Payload (Full card identity data)
    const ownerPayload = {
      targetPlayer,
      card: drawnCard,
      deckCount: deck.length
    };

    // 2. The Opponent Payload (Masked card back identity data)
    const opponentPayload = {
      targetPlayer,
      card: maskCard(),
      deckCount: deck.length
    };

    // 3. The Spectator Payload (Full card identity data)
    const spectatorPayload = {
      targetPlayer,
      card: drawnCard,
      deckCount: deck.length
    };

    // Route notifications accurately based on the drawing player slot
    if (targetPlayer === 'playerA') {
      if (table.playerA) io.to(table.playerA).emit('cardDrawnUpdate', ownerPayload);
      if (table.playerB) io.to(table.playerB).emit('cardDrawnUpdate', opponentPayload);
    } else {
      if (table.playerA) io.to(table.playerA).emit('cardDrawnUpdate', opponentPayload);
      if (table.playerB) io.to(table.playerB).emit('cardDrawnUpdate', ownerPayload);
    }

    // Spectators always get full X-Ray data pushed directly
    table.spectators.forEach(specId => {
      io.to(specId).emit('cardDrawnUpdate', spectatorPayload);
    });

    socket.emit('serverNotice', `${targetPlayer} successfully drew 1 card.`);
  });

  socket.on('draw6Cards', ({ tableId, targetPlayer }) => {
    const table = tables.find(t => t.id === parseInt(tableId));
    if (!table) return socket.emit('errorMsg', 'Table not found.');

    const deck = table.gameState[targetPlayer]?.deck;
    const hand = table.gameState[targetPlayer]?.hand;

    if (!deck || deck.length < 6) {
      return socket.emit('errorMsg', `Not enough cards in ${targetPlayer}'s deck to draw 6!`);
    }

    const maskCard = () => ({ name: "Card Back", isFaceDown: true });

    // Loop exactly 6 times, replicating single-draw logic perfectly per iteration
    for (let i = 0; i < 6; i++) {
      const drawnCard = deck.pop();
      drawnCard.isFaceDown = false; 
      hand.push(drawnCard);

      // Construct individual tailored, minimal data streams
      const ownerPayload = { targetPlayer, card: drawnCard, deckCount: deck.length };
      const opponentPayload = { targetPlayer, card: maskCard(), deckCount: deck.length };
      const spectatorPayload = { targetPlayer, card: drawnCard, deckCount: deck.length };

      // Dispatch real-time updates instantly based on seats
      if (targetPlayer === 'playerA') {
        if (table.playerA) io.to(table.playerA).emit('cardDrawnUpdate', ownerPayload);
        if (table.playerB) io.to(table.playerB).emit('cardDrawnUpdate', opponentPayload);
      } else {
        if (table.playerA) io.to(table.playerA).emit('cardDrawnUpdate', opponentPayload);
        if (table.playerB) io.to(table.playerB).emit('cardDrawnUpdate', ownerPayload);
      }

      table.spectators.forEach(specId => {
        io.to(specId).emit('cardDrawnUpdate', spectatorPayload);
      });
    }

    socket.emit('serverNotice', `${targetPlayer} successfully drew a 6-card opening hand.`);
  });

  socket.on('playCardFaceDown', ({ tableId, targetPlayer, handIndex }) => {
    const table = tables.find(t => t.id === parseInt(tableId));
    if (!table) return socket.emit('errorMsg', 'Table not found.');

    const hand = table.gameState[targetPlayer]?.hand;
    const battleZone = table.gameState[targetPlayer]?.battleZone;

    if (!hand || hand.length === 0) {
      return socket.emit('errorMsg', `Hand is empty! Cannot place a fighter card.`);
    }

    const idx = parseInt(handIndex);
    if (isNaN(idx) || idx < 0 || idx >= hand.length) {
      return socket.emit('errorMsg', `Invalid hand position! Choose an index between 0 and ${hand.length - 1}.`);
    }

    // Explicitly remove the card at that index from the hand array
    const [cardToPlay] = hand.splice(idx, 1);
    
    cardToPlay.isFaceDown = true; 
    battleZone.fighterA.card = cardToPlay;

    socket.emit('serverNotice', `Placed card from hand index ${idx} face down into ${targetPlayer}'s fighterA position.`);
  });

  socket.on('flipCardFaceUp', ({ tableId, targetPlayer }) => {
    const table = tables.find(t => t.id === parseInt(tableId));
    if (!table) return socket.emit('errorMsg', 'Table not found.');

    const fighterACard = table.gameState[targetPlayer]?.battleZone?.fighterA?.card;

    if (!fighterACard || Object.keys(fighterACard).length === 0) {
      return socket.emit('errorMsg', `No card found in fighterA to flip face up!`);
    }

    fighterACard.isFaceDown = false; // Reveal to all clients

    socket.emit('serverNotice', `Flipped ${targetPlayer}'s active fighterA card face up.`);
  });

  socket.on('placeDeckCardToStack', ({ tableId, targetPlayer, targetSlot }) => {
    const table = tables.find(t => t.id === parseInt(tableId));
    if (!table) return socket.emit('errorMsg', 'Table not found.');

    const deck = table.gameState[targetPlayer]?.deck;
    const battleZone = table.gameState[targetPlayer]?.battleZone;

    if (!deck || deck.length === 0) {
      return socket.emit('errorMsg', `${targetPlayer}'s deck is empty!`);
    }

    if (targetSlot !== 'fighterA' && targetSlot !== 'fighterB') {
      return socket.emit('errorMsg', 'Invalid target stack slot.');
    }

    // Standardized: Pull from the end (top) of the deck array using .pop()
    const cardToStack = deck.pop(); 
    cardToStack.isFaceDown = true; 

    // Appends to the end (top) of the stack array
    battleZone[targetSlot].faceDownStack.push(cardToStack);

    // Dynamic notifications: Everyone gets a masked update except spectators
    const maskCard = () => ({ name: "Card Back", isFaceDown: true });
    
    const standardPayload = { targetPlayer, targetSlot, card: maskCard(), stackCount: battleZone[targetSlot].faceDownStack.length, deckCount: deck.length };
    const spectatorPayload = { targetPlayer, targetSlot, card: cardToStack, stackCount: battleZone[targetSlot].faceDownStack.length, deckCount: deck.length };

    if (table.playerA) io.to(table.playerA).emit('cardStackedUpdate', standardPayload);
    if (table.playerB) io.to(table.playerB).emit('cardStackedUpdate', standardPayload);
    
    table.spectators.forEach(specId => {
      io.to(specId).emit('cardStackedUpdate', spectatorPayload);
    });

    socket.emit('serverNotice', `Moved card from deck to ${targetSlot}'s face-down stack.`);
  });

  socket.on('playCardToSupport', ({ tableId, targetPlayer, handIndex }) => {
    const table = tables.find(t => t.id === parseInt(tableId));
    if (!table) return socket.emit('errorMsg', 'Table not found.');

    const hand = table.gameState[targetPlayer]?.hand;
    const support = table.gameState[targetPlayer]?.support;

    if (!hand || hand.length === 0) {
      return socket.emit('errorMsg', `Hand is empty! No card to play.`);
    }

    const idx = parseInt(handIndex);
    if (isNaN(idx) || idx < 0 || idx >= hand.length) {
      return socket.emit('errorMsg', `Invalid hand position! Choose an index between 0 and ${hand.length - 1}.`);
    }

    // Explicitly remove the card at that index from the hand array
    const [cardToPlay] = hand.splice(idx, 1);
    
    // Support cards are played face up on the table
    cardToPlay.isFaceDown = false; 

    // Append to the end of the support array lane
    support.push(cardToPlay);

    // Build the payload (since it's a public zone, everybody gets the raw card info)
    const payload = {
      targetPlayer,
      card: cardToPlay,
      supportCount: support.length,
      handCount: hand.length
    };

    // Broadcast the live update instantly to all table positions
    if (table.playerA) io.to(table.playerA).emit('cardPlayedToSupportUpdate', payload);
    if (table.playerB) io.to(table.playerB).emit('cardPlayedToSupportUpdate', payload);
    table.spectators.forEach(specId => {
      io.to(specId).emit('cardPlayedToSupportUpdate', payload);
    });

    socket.emit('serverNotice', `Played card from hand index ${idx} face up into ${targetPlayer}'s support zone.`);
  });

  socket.on('toggleCardTap', ({ tableId, targetPlayer, zone, supportIndex }) => {
    const table = tables.find(t => t.id === parseInt(tableId));
    if (!table) return socket.emit('errorMsg', 'Table not found.');

    const battleZone = table.gameState[targetPlayer]?.battleZone;
    const support = table.gameState[targetPlayer]?.support;
    let targetCard = null;

    // 1. Locate the physical target card based on the user's selected zone criteria
    if (zone === 'fighterA') {
      targetCard = battleZone?.fighterA?.card;
    } else if (zone === 'fighterB') {
      targetCard = battleZone?.fighterB?.card;
    } else if (zone === 'support') {
      const idx = parseInt(supportIndex);
      if (!support || isNaN(idx) || idx < 0 || idx >= support.length) {
        return socket.emit('errorMsg', 'Invalid support lane index.');
      }
      targetCard = support[idx];
    }

    if (!targetCard || Object.keys(targetCard).length === 0) {
      return socket.emit('errorMsg', `No card found in ${zone} to tap/untap.`);
    }

    // 2. Flip the boolean value state parameter
    targetCard.isTapped = !targetCard.isTapped;

    // 3. Construct a public broadcast payload notice
    const payload = {
      targetPlayer,
      zone,
      supportIndex: zone === 'support' ? parseInt(supportIndex) : null,
      isTapped: targetCard.isTapped
    };

    if (table.playerA) io.to(table.playerA).emit('cardTapUpdated', payload);
    if (table.playerB) io.to(table.playerB).emit('cardTapUpdated', payload);
    table.spectators.forEach(specId => io.to(specId).emit('cardTapUpdated', payload));

    socket.emit('serverNotice', `Toggled tap state for card in ${zone} to: ${targetCard.isTapped}`);
  });
});

console.log('TCG Server on 3000');
