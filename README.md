# Sandbox Multiplayer TCG (crb-sandbox)

A real-time, multiplayer 2-player Tabletop Card Game (TCG) sandbox environment built with **Phaser 4 (Beta/Esm)** and **Socket.io**. 

Unlike a fully automated video game, this project is explicitly built as a **rule-agnostic sandbox**. The engine does not validate or enforce structural card mechanics or turn sequencing; instead, it provides a physical simulation layer with tools for two players and multiple spectators to manipulate hands, manage card orientations, arrange field lanes, track stacks, and maintain public scores.

---

## 🏗️ System Architecture

The project splits state preservation and client-side view logic across two decoupled layers:

1. **Authoritative State Server (`server.js`)**: Tracks rooms/tables 1-8. Operates as the centralized, single source of truth for all indices, states, hands, lanes, and Fog of War visibility masking rules. Sanitizes state payloads depending on player role (Player A vs. Player B vs. Spectator) to maintain structural Fog of War rules.
2. **Interactive Front End Engine (`crb-sandbox` client)**: Built using Phaser 4 for game canvas rendering, alongside dynamic HTML overlay structures integrated directly into Phaser scenes via DOM game objects (utilizing `createContainer: true`).

```text
          ┌────────────────────────────────────────┐
          │      Socket.io State Server            │
          │            (server.js)                 │
          └───────────────────▲────────────────────┘
                              │
               Network Events │ State Snapshots
               & API Requests │ & Public Notices
                              │
          ┌───────────────────▼────────────────────┐
          │         Phaser 4 Sandbox Client        │
          │            (crb-sandbox)               │
          └────────────────────────────────────────┘
```

---

## 📂 Project Directory Structure

* **`index.html`**: Client entry point setting up structural canvas styles and initializing the global network layer by loading script libraries sequentially.
* **`game.js`**: Core Phaser configuration file defining viewport dimensions (1920x1080), renderer modes, global socket initialization (`globalSocket`), and scene registry index boot priority order.
* **`BootScene.js`**: Array index 0 entry scene. Executes exactly once on browser load. Preloads massive high-res asset sheets (`BS01_cards`, `BS02_cards`, `BS03_cards`, `BS10_cards`) into the global cache registry to permanently eliminate transition rendering lag across scenes, then hands off execution to Lobby.
* **`LobbyScene.js`**: Initial interaction layer handling server table discovery, matchmaking, and role registration. Dispatches an exploratory `checkTableStatus` packet before routing players. Holds a hidden character sequence keyboard buffer: typing `dev` sequentially anywhere on the page immediately triggers a hard context scene swap to `DeveloperMode`.
* **`DeckPrepScene.js`**: Mid-tier text ingestion workspace stripped of preload assets. Interfaces between Lobby and Match rooms. Employs embedded HTML textareas to extract text deck lists, flattens card properties natively utilizing identical regex formatting rules (`^\s*(\d+)\s+(.*?)\s*\[([A-Za-z0-9-]+)\]`), renders a responsive 11-column miniature thumbnail preview matrix grid, and fires a sequential transactional network burst (`loadDeck` ➔ `shuffleDeck` ➔ `draw6Cards`) to `server.js` before migrating view targets cleanly over into `GameScene`.
* **`GameScene.js`**: The main field rendering suite mapping interactive board zones, localized visual components, high-fidelity card inspection mechanics, automated layout counters, cascading lane spreads, animated drawer panels, and drag physics.
* **`DeveloperMode.js`**: An extensive testing overlay running HTML DOM panels that simulate deck layouts, inspect hidden states, monitor administrative overrides, and track raw structural network interactions.
* **`server.js`**: Headless backend server tracking active room matrix arrays, handling secure role masking, executing state mutation payloads, and managing match closure ready checks.

---

## 🔐 Authoritative State & Masking Model

The backend orchestrates structural consistency across 8 independent sandbox rooms. It features role-aware masking routines designed to protect data privacy while enforcing physical sandbox bounds:

* **Zone Visibility Flags**: The `discard`, `support`, and `defeated` zones are transparently sent completely unmasked to all roles. Hands and extra decks filter automatically and show only to their respective owner seats.
* **X-Ray Spectator Lens**: Decks are completely concealed from active competitors. Spectators bypass these masking boundaries, acquiring full visibility into player deck stacks.
* **Face-Down Stack Obfuscation**: The `faceDownStack` sub-arrays nested underneath combat positions securely strip raw structural card properties (`id`, `name`, custom signatures)—broadcasting uniform `Card Back` text wrapper placeholders to *both* the zone owner and the opponent. Only spectators can inspect these hidden stacks natively.
* **Array Coordinate Protocol**: Top-of-deck and top-of-stack mutations utilize `.push()` and `.pop()` array methods (operating on the tail of the array). Bottom-of-deck insertions are unshifted explicitly to index `0` via `.unshift()`.
* **Cryptographic UUID Sort**: The `recycleDiscardToDeck` engine drains the discard array via a `while` block, flips asset tags face-down, pushes them to the deck, and executes a programmatic shuffle. It injects temporary `uuidv4` parameters onto each card block, sorts using a structural `.localeCompare()` evaluation string loop, and deletes the transient tokens before broadcasting.
* **Seat Interceptor Branching Matrix**: When a user selects a player role in the lobby, the client queries `checkTableStatus` with `tableId` and `role`. The server checks the specific array length of `table.gameState[role].deck`. If `hasDeckLoaded === true` (indicating a reconnect or page refresh), the user bypasses deck configuration and routes straight to `GameScene`. Otherwise, they are diverted into `DeckPrepScene`. Spectators always bypass deck validation and route straight to `GameScene`.

---

## 🕹️ GameScene Interaction Model & UI Layout

### 📐 Three-Column Layout Matrix
The main arena runs at a fixed canvas resolution of **1920x1080** pixels, divided by bounding vectors into three distinct operational layout columns.
1.  **Column 1 (`x: 0` to `384`)**: Dedicated Hand Management Workspace. Features an adaptive, responsive square-matrix grid system. Opponent hand cards render as static, unmovable face-down arrays.
2.  **Column 2 (`x: 384` to `1536`)**: Core Arena Layout. Divided horizontally at `y: 540` to cleanly mirror `local` and `remote` perspectives based on role assignments (`playerA` vs `playerB`). Holds static drop hitboxes for `fighterA`, `fighterB`, `stage`, `discard`, and `defeated` areas.
3.  **Column 3 (`x: 1536` to `1920`)**: Full-scale Card Inspection Preview Panel. Uses an explicit bounds-sweeper step (`x > 1536`) to clean old imagery and prevent memory leaks. Renders hovered card components at a scale of `260x364` pixels centered at `x: 1728, y: 540`.

```text
+-----------------------------------------------------------------------------------------+
|                          CRB-SANDBOX 1920x1080 VIEWPORT WINDOW                          |
+-----------------------------------+-----------------------------------+-----------------+
| COLUMN 1: HAND WORKSPACE          | COLUMN 2: THE ARENA ZONE          | COL 3: PREVIEW  |
+-----------------------------------+-----------------------------------+-----------------+
|                                   |          OPPONENT FIELD           |                 |
|   OPPONENT HAND GRID              |   [Defeated] [Stage] [FighterA/B] |  🔍 INSPECTOR   |
|   (Dynamic Packing)               |   [Discard]       [Support Tray]  |                 |
|                                   |  ===============================  |  * Hover +      |
|                                   |        ⚔️ ARENA CENTER LINE       |    SPACEBAR     |
|                                   |  ===============================  |  * High-Res     |
|   PLAYER HAND GRID                |   [Support Tray]  [Discard]       |    Art & Code   |
|   (Dynamic Scaling 1² to 6²)      |   [FighterA/B] [Stage] [Defeated] |    Signatures   |
|                                   |   (Buttons: +1 / -1 / ☠️)         |                 |
|                                   |           PLAYER FIELD            |                 |
+-----------------------------------+-----------------------------------+-----------------+
| 📁 SLIDING DRAWER: Click Discard/Defeated -> Slides out from Left (Covers Cols 1 & 2)   |
+-----------------------------------------------------------------------------------------+
```

### 🎴 Adaptive Square-Matrix Hand Grid
The hand zone dynamically computes row/column distribution templates depending on the current `hand.length` value to maximize screen real estate and prevent card layout clipping. Spacing and scale bounds adjust dynamically:
*   **1 Card (1²):** Center-anchored layout. Expands the single card into a massive visual display centerpiece (`2.4x` scale) dominating Column 1.
*   **2–4 Cards (2²):** Arranges items into a 2-column layout utilizing an optimized `1.4x` scale format.
*   **5–9 Cards (3²):** Baseline 3x3 layout operating at a standard `0.80` scale.
*   **10–16 Cards (4²):** Tightly compresses items into a 4x4 matrix grid running at a scaled `0.60` factor.
*   **17–36+ Cards (5² to 6²):** Automatically applies progressive scale reduction down to `0.38` and sets row spacing to a tight `75px` vertical step to securely keep large hand sizes within the viewport margins.

### ⚔️ Battle Zone & Splayed Face-Down Stacks
To support rule-agnostic stack stacking mechanics, the **Player Fighter B** (`x: 1060`) and **Opponent Fighter A** (`x: 1060`) coordinates are shifted exactly 100px leftward to clear space for the `faceDownStack` array visuals:
*   **Splay Transforms:** Cards added onto a slot's stack shrink down to `0.55` scale, rotate **-90° Counter-Clockwise (CCW)**, and splay downward from top-to-bottom based on array index depth.
*   **Fighter Operational Buttons:** Bordered, interactive control blocks rest directly above your local fighters (visible to connected players only, completely hidden from spectators):
    *   **`[ +1 ]` Button:** Emits `placeDeckCardToStack` to pop the top card of your deck onto that slot's stack.
    *   **`[ -1 ]` Button:** Emits `flipAndDiscardFromStack` to peel the top card off the stack, flip it face up, and send it directly to public discard.
    *   **`[ ☠️ ]` Button:** Emits `moveFighterToDefeated` to retire the primary combat card directly into the points scoring zone.

### 🛡️ Extended Support Lane & Resource Monitors
*   **Cascade Spacing:** Support lane horizontal cascading interval offsets are expanded to **`65px`** to let overlapping support rows breathe cleanly without obscuring text titles or image graphics.
*   **Resource Tracking Indicator:** The support tray banner dynamically parses the state to track resource availability in real time, rendering an untapped indicator above the lane coordinates (e.g., `SUPPORT REMAINING: 3 / 4`).

### 🗂️ Unified Sliding Stack Drawer
Clicking either a player's **Discard Pile** or **Defeated Pile** activates a smooth, cubic tween animation that slides a dark overlay panel from the left (`X: -1536`) to cleanly cover Columns 1 and 2, leaving the Column 3 preview screen completely exposed.
*   **Contextual Filtering:** The drawer reads the zone clicked to toggle titles and interface permissions dynamically.
*   **Discard Mode:** Owners view an explicit green button to **`♻️ RECYCLE ALL DISCARDS TO DECK`** and can click individual cards inside the drawer grid to slice them out to the defeated zone.
*   **Defeated Mode & Opponent Inspection:** Disables state-mutating actions and strips help text, locking the container down to an observation-only view.
*   **Input Blocking Safe Close:** Clicking **`❌ CLOSE`** slides the panel off-screen and explicitly flags visibility to `false`, unblocking Phaser's hit-test engine so underlying zone clicks register flawlessly.

### ⌨️ Universal Keyboard Controls
Card selection and orientation manipulation does not track active mouse hover states globally to preserve rendering performance. Instead, users position their mouse cursor over an item and tap the following keys:
*   **Spacebar Key (`keydown-SPACE`)**: Targeted vector loop checks bounding arrays. Hovering over any card (on the field, hand, discard pile, or inside an active sliding drawer grid) and pressing `SPACEBAR` locks mouse coordinates, runs an inverted boundary hit-test check, and loads the card into Column 3.
*   **'T' Key (Orientation Toggle)**: Hovering over your active Fighter slots or Support tray cards and pressing `T` toggles their orientation angle to **-90° CCW** (Tapped) or straightens them to **0°** (Untapped), automatically incrementing or decrementing your *Support Remaining* resource counts.
    *   *Depth Layer Awareness:* Reverse loop iteration sorting ensures that pressing `T` over heavily overlapped cascading support lines always targets and taps the **frontmost visible card** first.

### ☠️ Point Tracking & Game Ending Setup
*   **Point Metrics:** Bounded adjustment triggers (`[ +1 ]` and `[ -1 ]`) layer above your defeated pile box frame to modify score counts, clamping values at floor zero via `Math.max(0, ...)` rules. The indicator text reads simply as `POINTS: X / 10`.
*   **Ready Check Game Reset:** Handled as a mutual-consent staging flag state machine to prevent single accidental click table wipes:
    *   Clicking an end-game confirmation match macro flags that slot's readiness flag to `true`, notifying the room. Active slots can revoke this signal at any point to drop the flag back to `false`.
    *   The exact frame that **BOTH** players signal readiness, the server executes a hard data scrub: clears all cards from all zones, zeroes out points, demotes both sockets to spectators, and resets deck length counts to `0` so the **Seat Interceptor Matrix** forces subsequent logins to reload a fresh deck from scratch.

---

## 🛠️ System Table Administration (Dev Tab 4)

The HTML DOM panel overlay tracker inside `DeveloperMode.js` features a production-ready **Tab 4: Table Admin** engine workspace running flush with your auto-scrolling log streams.

### 🌐 Cross-Tab Sync Features
Tab 4 embeds into the main `setupCrossTabSynchronizer()` input mirroring array chains. Selecting a Table ID number or Player Role selector dropdown on any tab instantly synchronizes the selection states on all other tabs.

### 📡 Administrative Actions
*   **🚨 SIGNAL END GAME:** Allows a developer or moderator to override local buttons and manually force an end-game match closure proposal signal onto any selected table seat over the network bridge.
*   **`↩️ REVOKE END GAME`:** Instantly retracts a match closure signal for the specified table and role, returning its staging environment flag to idle status.

---

## 📡 Network Protocol & Event Matrix

The client connects through a global Socket instance (`globalSocket`) using the following structural event schemas:

### 📤 Outbound Events (Emitted to Server)

| Event Name | Payload Structure | Functional Intent |
| :--- | :--- | :--- |
| `joinTable` | `{ tableId: Number, role: String }` | Authenticates and locks connection into a specific room and perspective. |
| `leaveTable` | *None* | Severs table mapping and resets local memory fields. |
| `loadDeck` | `{ tableId: Number, targetPlayer: String, deckList: Array }` | Sends a flattened array of parsed card items (`{ id, title }`) to build a deck. |
| `getGameState`| `{ tableId: Number, role: String }` | Queries a complete room state snapshot evaluated under a specific view lens. |
| `drawCard` | `{ tableId: Number, targetPlayer: String }` | Draws exactly 1 card from the deck to the hand. |
| `draw6Cards` | `{ tableId: Number, targetPlayer: String }` | Setup utility drawing a complete 6-card starting hand. |
| `shuffleDeck` | `{ tableId: Number, targetPlayer: String }` | Triggers a server-side randomize routine on the specified deck array. |
| `playCardFaceDown`| `{ tableId: Number, targetPlayer: String, handIndex: Number }` | Deploys a hidden token out of hand to a primary fighterA zone. |
| `flipCardFaceUp`| `{ tableId: Number, targetPlayer: String }` | Exposes a face-down item on the fighterA board position. |
| `placeDeckCardToStack`| `{ tableId: Number, targetPlayer: String, targetSlot: String }` | Layers the top card of the deck underneath a target slot. |
| `flipAndDiscardFromStack`| `{ tableId: Number, targetPlayer: String, targetSlot: String }` | Peels the top card from a stack and sends it face-up to the discard pile. |
| `playCardToSupport`| `{ tableId: Number, targetPlayer: String, handIndex: Number }` | Commits a card from hand to the public support lane array. |
| `playCardToFighter`| `{ tableId: Number, targetPlayer: String, handIndex: Number, targetSlot: String }` | Moves a card from hand to a primary combat position. |
| `toggleCardTap`| `{ tableId: Number, targetPlayer: String, zone: String, supportIndex: Number }` | Rotates a target asset between standard and tapped states. |
| `discardCardFromHand`| `{ tableId: Number, targetPlayer: String, handIndex: Number }` | Sends a card directly out of hand into the public discard array. |
| `moveFighterToDefeated`| `{ tableId: Number, targetPlayer: String, slot: String }` | Retires a combat asset to the point-scoring area. |
| `adjustDefeatedPoints`| `{ tableId: Number, targetPlayer: String, amount: Number }` | Modifies total score values by small numeric increments. |
| `moveDiscardToDefeated`| `{ tableId: Number, targetPlayer: String, discardIndex: Number }` | Shifts an item directly out of trash into the score area. |
| `recycleDiscardToDeck`| `{ tableId: Number, targetPlayer: String }` | Collects all discard elements, appends them to deck, and shuffles. |
| `playHandToTopDeck` / `playHandToBottomDeck`| `{ tableId: Number, targetPlayer: String, handIndex: Number }` | Recycles hand cards back into the deck. |
| `signalEndGame` | `{ tableId: Number, targetPlayer: String }` | Flags readiness status intent to close match and clear table. |
| `revokeEndGame` | `{ tableId: Number, targetPlayer: String }` | Retracts a previously submitted end-game signal. |

### 📥 Inbound Events (Processed from Server)
*   **`stateUpdate`**: Delivers a sanitized game state snapshot. Re-renders the **Hand Matrix** view using specific criteria based on role visibility.
*   **`errorMsg`**: Receives server-side exception logs and prints them to the terminal console view.
*   **`serverNotice`**: Confirms valid operations and triggers an immediate `getGameState` loop to sync client records.
*   **`cardDrawnUpdate`**: Asymmetric routing loops dispatch tailored payloads: Owner receives full stats, Opponent receives `maskCard()` blocks, and Spectators capture unmasked telemetry. Triggers an optimized standalone local path on `this.lastReceivedState` to update hand layouts instantly.
*   **`cardStackedUpdate`**: Tracks layer counts when cards are added to field piles.
*   **`cardPlayedToSupportUpdate` / `cardPlayedToFighterUpdate`**: Syncs visible field changes when cards enter public view lanes.
*   **`cardTapUpdated`**: Coordinates rotation alignments based on tap conditions across lanes.
*   **`cardMovedToDefeatedZone` / `defeatedPointsTickedUpdate`**: Updates win/loss scoring values (`POINTS: X / 10`). Changes text color to alert red (`#ff3333`) at 7+ points, and outputs an elimination warning notice if a total hits 10.
*   **`cardDiscardedUpdate` / `stackFlippedAndDiscardedUpdate`**: Tracks changes to the public discard pile.
*   **`handToDeckUpdate` / `discardRecycledUpdate`**: Synchronizes card totals when cards are recycled back into the deck.
*   **`discardToDefeatedUpdate`**: Confirms a card from the discard heap was retired to the scoring zone.
*   **`endGameSignalUpdate`**: Outputs the live readiness status matrix of both seats to the developer telemetry panel.
*   **`tableClearedReset`**: Logs a table wipe event to developer terminals when mutual consent match closures conclude.

---

## 🎯 Development Roadmap Context

When designing new features, expanding layouts, or fixing bugs, remember:
*   **No Logic in Phaser**: All positional arrays, deck item lists, and scoreboard ticks are managed by `server.js`. Phaser is just a visual terminal.
*   **Collision Detection Constraints**: The `playCardToFighter` event enforces a structural validation step—rejecting the inbound payload if a slot already holds an active asset reference.
*   **Garbage Collection Pattern**: The canvas re-render flow operates by completely deleting and re-spawning all text and image structures (`resetRenderLayer`) rather than moving existing card objects across coordinates.
*   **IP Constraint**: Completely rule-agnostic, generic TCG mechanics only. Avoid any direct references to specific card franchises or proprietary branding to prevent intellectual property issues.

---

## 🔐 System Controls & Hidden Dev Overrides

### 1. Lobby Router Interceptors
The initial screen manages connection parameters via `LobbyScene.js`. When a connection request executes, the system analyzes target seat payloads to prevent unauthorized field collisions and route workflows optimally:
*   **Spectator View Route**: Skips initialization arrays entirely and transitions straight to the rendering pipelines inside `GameScene.js` as an observer.
*   **Competitor View Route**: Redirects users directly into `DeckPrepScene.js` to parse text deck inputs before authorizing field instance initialization.

### 2. Easter Egg Keyboard Telemetry Overrides
The engine monitors background keyboard sequences inside the main menu lobby area. It uses a clean character collection index buffer to capture specialized codes without conflicting with browser navigation controls:
*   **Activation Sequence**: Typing `d` ➔ `e` ➔ `v` sequentially anywhere on the page instantly drops the UI layer.
*   **Behavioral Trigger**: Clears memory reference buffers, kills active menus, and fires an instantaneous hard context shift forcing the engine directly into the full admin array panel view (`DeveloperMode.js`).

---

## 🤖 LLM Context Bootstrap (Session Init)
*   **Project Specs:** crb-sandbox. Rule-agnostic, 2-player/spectator TCG sandbox. Node.js server (`server.js`) is authoritative single source of truth for all indices, states, hands, lanes, and Fog of War visibility masking rules. Phaser 4 acts as a passive visual display terminal.
*   **FOW Visibility Model:** `discard`, `support`, and `defeated` are public unmasked arrays. `hand` and `extraDeck` show only to the owner seat. `deck` arrays hide from all active players; only Spectators hold unmasked X-Ray deck vision. Face-down sub-arrays (`faceDownStack`) securely strip metadata properties, outputting uniform `Card Back` text wrappers to both players. Only Spectators view raw stack items.
*   **Deck Arrays Index Protocol:** Top of deck/stack maps to array tail (`.push()` / `.pop()`). Bottom of deck/stack maps to array index `0` (`.unshift()`). `recycleDiscardToDeck` drains the discard array via a `while` block, flips tags face-down, pushes to deck, and executes a programmatic UUID sort (`.localeCompare`).
*   **File Manifest & Core Engine Flows:**
    *   `index.html`: Main body wrapper structure loading external script libraries sequentially.
    *   `game.js`: Core Phaser config (1920x1080), sets `createContainer: true` for DOM elements, initializes global socket (`globalSocket`), and defines scene registry priority.
    *   `BootScene.js`: Array index 0 entry scene. Executes exactly once on browser load. Preloads massive high-res asset sheets (`BS01_cards`, `BS02_cards`, `BS03_cards`, `BS10_cards`) into cache registry to eliminate rendering lag, then hands off to Lobby.
    *   `LobbyScene.js`: Dispatches exploratory `checkTableStatus` packet before routing players. Tracks hidden character sequence keyboard buffer for typing `dev`.
    *   `DeckPrepScene.js`: Mid-tier text ingestion workspace. Uses HTML textareas, flattens card properties utilizing identical regex rules (`^\s*(\d+)\s+(.*?)\s*\[([A-Za-z0-9-]+)\]`), renders an 11-column thumbnail preview matrix, and fires transactional network burst upon completion: `loadDeck` ➔ `shuffleDeck` ➔ `draw6Cards`.
    *   `GameScene.js`: Primary play area running 3 visual layout grid columns. Tracks mouse vectors via spacebar key coordinates for targeted asset popups (`scanCardHitboxesForPreview`), handles horizontal cascading lane steps (+65px), local drag input wrappers (depth 1000 with fail-safe automatic snapbacks), and graphic prefix texture routing.
    *   `DeveloperMode.js`: Comprehensive testing overlay utilizing Phaser HTML DOM panels. Tracks cross-tab data synchronizer, auto-scrolling terminal console logger, and live index-mapped Hand Matrix table.
