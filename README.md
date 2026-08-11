# Sandbox Multiplayer TCG (crb-sandbox)

A real-time, multiplayer 2-player Tabletop Card Game (TCG) sandbox environment built with **Phaser 4 (Beta/Esm)** and **Socket.io**. 

Unlike a fully automated video game, this project is explicitly built as a **rule-agnostic sandbox**. The engine does not validate or enforce structural card mechanics or turn sequencing; instead, it provides a physical simulation layer with tools for two players and multiple spectators to manipulate hands, manage card orientations, arrange field lanes, track stacks, and maintain public scores.

---

## 🏗️ System Architecture

The project splits state preservation and client-side view logic across two decoupled layers:

1. **Authoritative State Server (`server.js`)**: Tracks rooms/tables 1-8. Operates as the centralized, single source of truth. Sanitizes state payloads depending on player role (Player A vs. Player B vs. Spectator) to maintain structural Fog of War rules.
2. **Interactive Front End Engine (`crb-sandbox` client)**: Built using Phaser 4 for game canvas rendering, alongside dynamic HTML overlay structures integrated directly into Phaser scenes via DOM game objects.

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

## 🗂️ Project Directory Structure

* **`index.html`**: Client entry point setting up structural canvas styles and initializing the global network layer.
* **`game.js`**: Core Phaser configuration file defining viewport dimensions, renderer modes, and scene order.
* **`LobbyScene.js`**: Initial interaction layer handling server table discovery, matchmaking, and role registration.
* **`GameScene.js`**: The main field rendering suite mapping interactive board zones, localized visual components, high-fidelity card inspection mechanics, and mouse interactions.
* **`DeckPrepScene.js`**: Loaded via direct global script reference. Interfaces between Lobby and Match rooms. Employs embedded HTML textareas to extract text deck lists, parses cards natively via regex formatting, displays a responsive visual miniature thumbnail preview matrix grid, and pushes sequential outbound events (`loadDeck` and `shuffleDeck`) to server.js before migrating view targets cleanly over into `GameScene`.
* **`DeveloperMode.js`**: An extensive testing overlay running HTML DOM panels that simulate deck layouts, inspect hidden states, and track raw structural network interactions.
* **`server.js`**: Headless backend server tracking active room matrix arrays, handling secure role masking, and executing state mutation payloads.

---

## 🛠️ Deep Dive: Core Component Architecture

### 1. `DeveloperMode.js` Admin Layout
The `DeveloperMode` scene operates as an administrative overlay split into three main viewports. It coordinates unified inputs via a **Cross-Tab Synchronizer Loop** (instantly mirroring changes to Table IDs or target options across panels).
* **Tab 1: Lobby Configuration Panel**: Manages table joining/leaving routines for `playerA`, `playerB`, or `spectator`.
* **Tab 2: Deck Loader & Prep Panel**: Parses and flattens text-formatted decklists using a customized Regular Expression: `^\s*(\d+)\s+(.*?)\s*\[([A-Za-z0-9-]+)\]`. Provides setup macros for physical board preparation.
* **Tab 3: Game Actions Suite**: Provides direct buttons to trigger individual lane management, card rotation, score adjustments, and deck recycling events.
* **Live Hand Matrix**: A dedicated UI table updating in real time to show exact card titles and unique alphanumeric IDs held at specific hand indexes.
* **Server Response Stream Log**: An auto-scrolling telemetry field rendering timestamps alongside inbound network payloads.

### 2. `GameScene.js` Render Matrix & Visual Columns
The main arena runs at a fixed canvas resolution of **1920x1080** pixels, mapped out across three distinct operational grid columns divided by bounding vectors.
* **Column 1 (`x: 0` to `384`)**: Dedicated Hand Management Workspace. Renders local cards inside an auto-wrapping 3-column mathematical grid (Width step: 115px, Height step: 170px). Opponent hand cards render as static, unmovable face-down arrays.
* **Column 2 (`x: 384` to `1536`)**: Core Arena Layout. Divided horizontally at `y: 540` to cleanly mirror `local` and `remote` perspectives based on role assignments (`playerA` vs `playerB`). Holds static drop hitboxes for `fighterA`, `fighterB`, `stage`, `discard`, and `defeated` areas, alongside a horizontal cascading `support` tray (Width step: +25px per card).
* **Column 3 (`x: 1536` to `1920`)**: Full-scale Card Inspection Preview Panel. Uses an explicit bounds-sweeper step (`x > 1536`) to clean old imagery and prevent memory leaks. Renders hovered card components at a scale of `260x364` pixels centered at `x: 1728, y: 540`.

### 3. Mouse Vectors & Spacebar Hit-Test Mechanics
Card selection does not track active mouse hover states globally to preserve rendering performance. Instead, users position their mouse cursor over an item and tap the **Spacebar Key (`keydown-SPACE`)**. This fires a targeted vector loop via `scanCardHitboxesForPreview` that sequentially checks bounding arrays:
1. **Hand Matrix**: Evaluates column/row offsets in Column 1.
2. **Support Area Tray**: Slices and reverses the lane array to prioritize overlapping cards on top. If a bounding match is found, the engine updates `this.selectedPreviewCard` and executes an isolated redraw restricted to Column 3, leaving the main board unaffected.

### 4. Authoritative State & Masking Model (`server.js`)
The backend orchestrates structural consistency across 8 independent sandbox rooms. It features role-aware masking routines designed to protect data privacy while enforcing physical sandbox bounds:
* **Zone Visibility Flags**: The `discard`, `support`, and `defeated` zones are transparently sent unmasked to all roles. Hands filter automatically to their respective seats.
* **X-Ray Spectator Lens**: Decks are completely concealed from active competitors. Spectators bypass these masking boundaries, acquiring full visibility into player deck stacks.
* **Face-Down Stack Obfuscation**: The `faceDownStack` sub-arrays nested underneath combat positions strip metadata values automatically—broadcasting uniform `Card Back` placeholders to *both* the zone owner and the opponent. Only spectators can inspect these hidden stacks natively.
* **Array Coordinate Protocol**: Top-of-deck mutations utilize `.push()` and `.pop()` array methods (operating on the tail of the array). Bottom-of-deck insertions are unshifted explicitly to index `0` via `.unshift()`.
* **Cryptographic UUID Sort**: Deck shuffles inject temporary `uuidv4` parameters onto each card block, sort using a structural `.localeCompare()` evaluation string loop, and delete the transient tokens before broadcasting.

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

### 📥 Inbound Events (Processed from Server)
*   **`stateUpdate`**: Delivers a sanitized game state snapshot. Re-renders the **Hand Matrix** view using specific criteria based on role visibility.
*   **`errorMsg`**: Receives server-side exception logs and prints them to the terminal console view.
*   **`serverNotice`**: Confirms valid operations and triggers an immediate `getGameState` loop to sync client records.
*   **`cardDrawnUpdate`**: Asymmetric routing loops dispatch tailored payloads: Owner receives full stats, Opponent receives `maskCard()` blocks, and Spectators capture unmasked telemetry. Triggers an optimized standalone local path on `this.lastReceivedState` to update hand layouts instantly.
*   **`cardStackedUpdate`**: Tracks layer counts when cards are added to field piles.
*   **`cardPlayedToSupportUpdate` / `cardPlayedToFighterUpdate`**: Syncs visible field changes when cards enter public view lanes.
*   **`cardTapUpdated`**: Coordinates rotation alignments based on tap conditions across lanes.
*   **`cardMovedToDefeatedZone` / `defeatedPointsTickedUpdate`**: Updates win/loss scoring values (`BREAK POINTS: X / 10`). Changes text color to alert red (`#ff3333`) at 7+ points, and outputs an elimination warning notice if a total hits 10.
*   **`cardDiscardedUpdate` / `stackFlippedAndDiscardedUpdate`**: Tracks changes to the public discard pile.
*   **`handToDeckUpdate` / `discardRecycledUpdate`**: Synchronizes card totals when cards are recycled back into the deck.
*   **`discardToDefeatedUpdate`**: Confirms a card from the discard heap was retired to the scoring zone.

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
<!-- PASTE THIS ENTIRE SECTION INTO A NEW AI SESSION TO INSTANTLY BOOTSTRAP CONTEXT -->
*   **Project Name:** crb-sandbox
*   **Tech Stack:** Phaser 4 (Beta/Esm), Socket.io, Node.js (`server.js`).
*   **Core Architecture:** Rule-agnostic, multiplayer 2-player/spectator tabletop sandbox simulator. Engine acts as a pure visual terminal. State tracking, lanes, hands, scores, and Fog of War masking rules are strictly authoritative on `server.js`.
*   **Rules Layer:** No rule enforcement or turn sequencing; features manual physical triggers for cards (move, stack, shuffle, draw, tap/rest) and scoring.
*   **Backend Memory Matrix (server.js):**
    *   Instantiates 8 tracked tables. Rooms maintain state blocks: `hand`, `deck`, `extraDeck`, `discard`, `support`, `defeated`, `defeatedPoints`.
    *   Nested `battleZone` structural layouts hold components for `fighterA`, `fighterB`, and `stage`. Fighter positions manage unique object nodes: `{ card, faceDownStack: [] }`.
*   **Authoritative Fog-of-War / Masking Architecture:**
    *   `discard`, `support`, and `defeated` fields are unconditionally public.
    *   `hand` and `extraDeck` arrays filter automatically to target players.
    *   `deck` arrays block all players. **Only Spectators receive structural X-Ray unmasked access.**
    *   `faceDownStack` data strips card properties and outputs uniform `Card Back` wrappers to both players (including the zone owner). Only Spectators see raw stack data.
*   **Deck & Stack Index Arrays Protocol:**
    *   *Top of Deck / Stack:* Hard-coded to the **end** of the array (`.push()` / `.pop()`).
    *   *Bottom of Deck / Stack:* Hard-coded to index `0` / **beginning** of the array (`.unshift()`).
    *   *Recycling Triggers:* `recycleDiscardToDeck` drains the discard array via a `while` block, turns items face-down, pushes them to the deck, and executes a full UUID-based sort routine (`.localeCompare`).
*   **File Manifest:**
    *   `index.html`: Entry point, styles, sequential scripts structure loading custom global network layer variables.
    *   `game.js`: Core Phaser config, viewport dimensions (1920x1080), renderer modes, global window-scoped class scene registry.
    *   `LobbyScene.js`: Discovery, table management (1-8), role selection. Includes hidden character key sequence listener buffer mapping the word `dev` to swap targets straight into `DeveloperMode`.
    *   `DeckPrepScene.js`: Mid-tier data ingestion overlay between Lobby and Match rooms. Preloads texture assets, employs HTML textareas to extract inputs, flattens card properties utilizing identical regex formatting patterns (`^\s*(\d+)\s+(.*?)\s*\[([A-Za-z0-9-]+)\]`), and displays an 11-column miniature asset visual thumbnail grid.
    *   `GameScene.js`: Primary canvas running 3 visual layout columns. Tracks mouse vectors via spacebar key coordinates for targeted asset inspections (`scanCardHitboxesForPreview`), handles horizontal cascading support lane steps (+25px), local drag input wrappers, and texture routing for `BS1-`, `BS2-`, `BS3-`, and `BS10-` prefixes.
    *   `DeveloperMode.js`: Debug console scene utilizing Phaser DOM elements. Features cross-tab data synchronizer, auto-scrolling telemetry log, and a real-time index-mapped Hand Matrix table.
    *   `server.js`: Node.js authoritative state engine running asymmetric payload slicing across customized network sockets.
*   **Deck Insertion Sequence:** `DeckPrepScene.js` pushes a sequential packet burst to `server.js` upon verification: `loadDeck` ➔ `shuffleDeck` ➔ `draw6Cards`. It intercepts the server's shuffle confirmation notice to securely transition the client straight into `GameScene` with initialized starting hands.
*   **State & Networking Matrix:**
    *   *Outbound Emissions:* `joinTable`, `leaveTable`, `loadDeck` (`[{id, title}]`), `getGameState`, `drawCard`, `draw6Cards`, `shuffleDeck`, `playCardFaceDown`, `flipCardFaceUp`, `placeDeckCardToStack`, `flipAndDiscardFromStack`, `playCardToSupport`, `playCardToFighter`, `toggleCardTap`, `discardCardFromHand`, `moveFighterToDefeated`, `adjustDefeatedPoints`, `moveDiscardToDefeated`, `recycleDiscardToDeck`, `playHandToTopDeck`, `playHandToBottomDeck`.
    *   *Inbound Payload Processing:* `stateUpdate` (forces hand matrix render), `errorMsg`, `serverNotice` (auto-fires `getGameState`), `cardDrawnUpdate` (asymmetric network payload slicing for Owner, Opponent, and Spectator paths), `cardStackedUpdate`, `cardPlayedToSupportUpdate`, `cardPlayedToFighterUpdate`, `cardTapUpdated` (updates orientation), `cardMovedToDefeatedZone`, `defeatedPointsTickedUpdate` (triggers match loss alert at 10+ points), `cardDiscardedUpdate`, `stackFlippedAndDiscardedUpdate`, `handToDeckUpdate`, `discardRecycledUpdate`, `discardToDefeatedUpdate`.
*   **IP Constraint:** Completely rule-agnostic, generic TCG mechanics only. Avoid any direct references to specific card franchises or proprietary branding to prevent intellectual property issues.
*   **Localized Player Deck Tracking:** `server.js` evaluates player readiness independently rather than applying global table states. It intercepts a `checkTableStatus` query containing both a `tableId` and a targeting `role`, and evaluates the raw length index of `table.gameState[role].deck`.
*   **Lobby Branching Matrix:** Before authorizing scene swaps for competitor seats, `LobbyScene.js` dispatches an exploratory `checkTableStatus` packet passing the targeted seat intent. It listens for a `tableStatusResponse` packet: if `hasDeckLoaded === true` (indicating an active session recovery, page refresh, or persistent seat layout match), it launches `GameScene.js` instantly. Otherwise, it safely diverts the individual user through the `DeckPrepScene.js` pipeline.
