# 🎮 CRB-SANDBOX CONTEXT RECOVERY ANCHOR

## 📋 1. ARCHITECTURE & FOW
* **Passive Phaser 4 / Strict Node.js Truth:** Server dictates all data. Client flushes graphics buffers (`fieldGraphics = null`) at the top of `create()` to heal canvas re-entry blanking bugs.
* **FOW Masking Layers:** Public (`discard`, `support`, `defeated`). Private (`hand`, `extraDeck`) masked to enemy. Stacks (`faceDownStack`) and `deck` completely masked to *both* players as `Card Back`. Only spectators hold true unmasked X-Ray vision.

## 🧮 2. REFACTORED LAYOUT MATH & FIXED HITBOXES
* **Centralized Grid Layout Helper:** Refactored `getHandCardLayout(index, totalCards, isLocalSeat)` handles all dynamic grids (1-6 columns), inverse scaling factors, and vertical partition offsets. 
* **Hitbox Synchronization Fix:** Both `scanCardHitboxesForPreview` (Spacebar), `handleKeyboardDiscardAction` (D), `handleHandToDeckShortcut` (T/B), and `handleKeyboardFaceDownAction` (F) consume this *exact same layout helper* to eliminate pixel mismatches when hand card sizes scale. Spacebar check now explicitly raycasts the `defeated` zone.

## 📡 3. LOBBY ENTRY STATE GATES
* **`checkTableStatus` Fix:** Server no longer evaluates table readiness strictly by `deck.length > 0`. It checks the total active session state array footprint (`hand`, `discard`, `defeated`, `support`, and field slots). If any cards exist, it flags `hasDeckLoaded: true`, forcing `LobbyScene` to route players back into `GameScene` mid-match instead of dumping them into `DeckPrepScene`.

## 🔄 4. ATOMIC DEV MULLIGAN MACRO
* **`executeDevMulligan` Endpoint:** Merged into Tab 2 button of `DeveloperMode`. Pops hand elements to deck tail, shuffles via random UUID alphanumeric `localeCompare` sorting, redeals 6 cards, and invokes `sendSanitizedState` to force synchronized FOW canvas repaints.

## 🎴 5. CLIENT OVERLAY TRICKERY TRAP (FIGHTER A)
* **`playCardFaceDown` (F Key):** Slices local hand; initializes client prediction parameters (`isFaceDown: true`, `isFaceUp: false`, `isTapped: false`) to avoid frame flashes.
* **Overlay Isolation Fix:** To stop perspective rendering passes from vaporizing the graphics, instances are tracked dynamically via custom namespaces (`this.localFighterAOverlaySprite` vs `this.remoteFighterAOverlaySprite`).
* **Prediction Redraw Protection:** Clicking the card back overlay destroys it, transmits `flipCardFaceUp`, and *instantly* forces local memory keys to `isFaceDown = false` and `isFaceUp = true`. This prevents background stack modifications (+1/-1 buttons) from re-triggering overlay redraw loops.
* **Hydration Sync:** The client loop uses `!!targetCard.isFaceDown || targetCard.isFaceUp === false` so that table re-entry paths cleanly restore the trickery overlay.
