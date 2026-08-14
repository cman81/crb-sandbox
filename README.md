# 🎮 CRB-SANDBOX CONTEXT RECOVERY ANCHOR

## 📋 1. ARCHITECTURE, MULTI-SOCKETS & FOW
* **Passive Phaser 4 / Multi-Socket Node.js Truth:** Server dictates all data layers via centralized `sendSanitizedState` serialization. Sockets only transmit raw data-agnostic intent parameters, eliminating local client prediction desyncs.
* **Array-Based Concurrent Seating (Multi-Socket Fixed Loop):** Tracks concurrent list arrays (`playerA: []`, `playerB: []`). Duplicate sockets are filtered out automatically during `joinTable` execution to prevent stale tab ghosting packets.
* **FOW Masking Layers:** Public (`discard`, `support`, `defeated`, `stage`). Private (`hand`, `extraDeck`) masked to enemy. Stacks (`faceDownStack`) and `deck` completely masked to *both* players as `Card Back` via a standardized `{name: "Card Back", isFaceDown: true}` schema signature. Only spectators hold true unmasked X-Ray vision.

## 🧮 2. GRAPHICS FALLBACKS & COORDINATE-AWARE INTERACTIVITY
* **Programmatic Vector Fallback Engine:** To support remote hosting configurations (GitHub Pages), the client dynamically falls back to drawing non-harsh off-white vectors (`0xF5F5F5`) with card code text layouts for face-up frames, and slate steel-blue vectors (`0x475569`) with "CARD BACK" typography labels for hidden slots whenever texture cache keys are missing.
* **Adaptive Object Hitboxes (Dragging Fix):** Solves dragging locks by evaluating the runtime type of the generated asset instance. Fallback `Phaser.GameObjects.Container` targets receive centered geometry bounds rectangle masks (`-width/2`), while real card `Phaser.GameObjects.Image` nodes drop back to standard `.setInteractive({useHandCursor: true})` texture boundaries.
* **Centralized Grid Layout Helper:** Refactored `getHandCardLayout(index, totalCards, isLocalSeat)` handles all dynamic grids (1-6 columns), inverse scaling factors, and vertical partition offsets. It propagates measurements dynamically to maintain scaling symmetry across mixed image and fallback layouts.

## 📡 3. CLOUD NETWORKING & STABLE RE-ENTRY GATES
* **Websocket Transport Enforcement:** Both client and server initializers explicitly force `transports: ['websocket']` parameters to bypass cross-origin browser HTTP polling filters, securing rapid transmission loops between `localhost` dev environments and the cloud backend.
* **`checkTableStatus` Fix:** Server no longer evaluates table readiness strictly by `deck.length > 0`. It checks the total active session state array footprint (`hand`, `discard`, `defeated`, `support`, and field slots). If any cards exist, it flags `hasDeckLoaded: true`, forcing `LobbyScene` to route players back into `GameScene` mid-match instead of dumping them into `DeckPrepScene`.
* **Inverted Reverse Drawer Targeting:** Drawer menu contents are rendered visually via `.slice().reverse()` to list items from top-to-bottom. Clicking a card calculates its true original array address index mathematically using `(cardList.length - 1) - index` to protect targeting precision across duplicate card lists.
* **Pure State Reactivity Transformation:** Auxiliary update events (`cardDrawnUpdate`, `cardDiscardedUpdate`, `discardToDefeatedUpdate`, `cardStackedUpdate`, `stackFlippedAndDiscardedUpdate`, `cardMovedToDefeatedZone`, `defeatedPointsTickedUpdate`, `discardRecycledUpdate`, and `cardTapUpdated`) have been entirely extracted. All UI adjustments and element translations route through a single secure catch channel (`stateUpdate`).

## 🎴 4. CLIENT OVERLAY TRICKERY TRAP (FIGHTER A)
* **`playCardFaceDown` (F Key):** Emits hand target parameters directly over the socket without predictive client modifications. The server mounts the item face down to `battleZone.fighterA.card` before executing a state redistribution sweep.
* **Overlay Isolation Fix:** To stop perspective rendering passes from vaporizing the graphics, instances are tracked dynamically via custom namespaces (`this.localFighterAOverlaySprite` vs `this.remoteFighterAOverlaySprite`).
* **Unmasked Flip Redirection Pipeline:** Clicking the card back overlay destroys it and transmits `flipCardFaceUp`. The server mutates the object parameter on the database schema (`card.isFaceDown = false`) and uses `sendSanitizedState()` to universally broadcast the unmasked target identity to all connected screens simultaneously.
