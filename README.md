# 🎮 CRB-SANDBOX CONTEXT RECOVERY ANCHOR

## 📋 1. ARCHITECTURE, MULTI-SOCKETS & FOW
* **Passive Phaser 4 / Multi-Socket Node.js Truth:** Server dictates all data layers via centralized `sendSanitizedState` serialization. Sockets only transmit raw data-agnostic intent parameters, eliminating local client prediction desyncs.
* **Array-Based Concurrent Seating (Multi-Socket Fixed Loop):** Tracks concurrent list arrays (`playerA: []`, `playerB: []`). Duplicate sockets are filtered out automatically during `joinTable` execution to prevent stale tab ghosting packets.
* **FOW Masking Layers:** Public (`discard`, `support`, `defeated`, `stage`). Private (`hand`, `extraDeck`) masked to enemy. Stacks (`faceDownStack`) and `deck` completely masked to *both* players as `Card Back` via a standardized `{name: "Card Back", isFaceDown: true}` schema signature. Only spectators hold true unmasked X-Ray vision.

## 🧮 2. GRAPHICS FALLBACKS & COORDINATE-AWARE INTERACTIVITY
* **Programmatic Vector Fallback Engine:** To support remote hosting configurations (GitHub Pages), the client dynamically falls back to drawing non-harsh off-white vectors (`0xF5F5F5`) with card code text layouts for face-up frames, and royal midnight blue vectors (`0x0B2545`) with custom diagonal striping and a centered bold "CRB Sandbox" logo frame layout for hidden card slots.
* **Adaptive Object Hitboxes (Dragging Fix):** Solves dragging locks by evaluating the runtime type of the generated asset instance. Fallback `Phaser.GameObjects.Container` targets receive centered geometry bounds rectangle masks (`-width/2`), while real card `Phaser.GameObjects.Image` nodes drop back to standard `.setInteractive({useHandCursor: true})` texture boundaries.

## 📡 3. CLOUD NETWORKING & STABLE RE-ENTRY GATES
* **Pure State Reactivity Transformation:** Auxiliary update events (`cardDrawnUpdate`, `cardDiscardedUpdate`, etc.) have been entirely extracted. All UI adjustments and element translations route through a single secure catch channel (`stateUpdate`) managed by a decoupled Delta Analyzer (`checkAndAnimateStateChanges`) and Coordinate Resolver (`calculateZoneCoordinates`).

## 🎴 4. CARD LAYER MANIPULATIONS & PHYSICS
* **Symmetric Flight Animation Loops:** Universal `animateCardFlight` utility tracks history updates to seamlessly launch motion flight paths for draws, dispatches, support trays, and fighter deployment fields in perfect horizontal viewport symmetry across players and spectators. Safely gates undefined object generations to keep active scenes alive.
* **Cryptographic UUID Identity Tracking:** Cryptographically secure `uuidv4()` tracking strings are generated directly inside `loadDeck` on the server layer. IDs are stamped onto child image matrices and vector containers inside `renderCardSprite()`, allowing the client's `cardTap` network listener to animate duplicate cards completely independently with zero cross-object string collisions.
