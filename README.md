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
* **`DeveloperMode.js`**: An extensive testing overlay running HTML DOM panels that simulate deck layouts, inspect hidden states, and track raw structural network interactions.

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
* **Column 2 (`x: 384` to `1536`)**: Core Arena Layout. Divided horizontally at `y: 540` to cleanly mirror `local` and `remote` perspectives based on role assignments (`playerA` vs `playerB`). Holds static drop hitboxes for `fighterA`, `fighterB`, `stage`, `discard`, and `defeated` areas, alongside a horizontal cascading `support` tray.
* **Column 3 (`x: 1536` to `1920`)**: Full-scale Card Inspection Preview Panel. Uses an explicit bounds-sweeper step (`x > 1536`) to clean old imagery and prevent memory leaks. Renders hovered card components at a scale of `260x364` pixels centered at `x: 1728, y: 540`.

### 3. Mouse Vectors & Spacebar Hit-Test Mechanics
Card selection does not track active mouse hover states globally to preserve rendering performance. Instead, users position their mouse cursor over an item and tap the **Spacebar Key (`keydown-SPACE`)**. This fires a targeted vector loop via `scanCardHitboxesForPreview` that sequentially checks bounding arrays:
1. **Hand Matrix**: Evaluates column/row offsets in Column 1.
2. **Support Area Tray**: Slices and reverses the lane array to prioritize overlapping cards on top. If a bounding match is found, the engine updates `this.selectedPreviewCard` and executes an isolated redraw restricted to Column 3, leaving the main board unaffected.

### 4. Interactive Drag-and-Drop Loop
The local player's hand components have physics-based dragging injected via `this.input.setDraggable`. Elements follow the active cursor at a prioritized height layer (`setDepth(1000)`). Dropping an element outside an active zone triggers an auto-snap routing method that snaps it back to its cached coordinates (`originalX`, `originalY`). Dropping onto a designated zone targets network emission events (`playCardToSupport` or `playCardToFighter`), dissolving the local asset upon completion. Spectators can visually move components, but drop interactions instantly flag a role constraint and reject changes before emitting payloads to the network.

### 5. Texture Bundle Prefix Routing Table
The internal card factory uses custom cache schemas (`this.load.atlasPCT`) rather than typical Phaser loaders. It matches asset codes to their respective high-resolution `.pct` sheet packs using specific string prefix keys:
*   `BS1-` strings match texture bundle `BS01_cards`
*   `BS2-` strings match texture bundle `BS02_cards`
*   `BS3-` strings match texture bundle `BS03_cards`
*   `BS10-` strings match texture bundle `BS10_cards`
*   All unrecognized tags or objects containing a `"Card Back"` property route natively to the generic `system_ui` package via frame `card_back`. Tapped orientation shifts are hardcoded to a horizontal alignment of `setAngle(90)`.

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
| `draw6Cards` | `{ tableId: Number, targetPlayer: String }` | Setup utility drawing a complete starting hand. |
| `shuffleDeck` | `{ tableId: Number, targetPlayer: String }` | Triggers a server-side randomize routine on the specified deck array. |
| `playCardFaceDown`| `{ tableId: Number, targetPlayer: String, handIndex: Number }` | Deploys a hidden token to a primary zone. |
| `flipCardFaceUp`| `{ tableId: Number, targetPlayer: String }` | Exposes a face-down item on the board. |
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
*   **`cardDrawnUpdate`**: Fired on active deck interactions. Triggers an optimized standalone local mutate path on `this.lastReceivedState`, updating element counts and re-rendering instantly without waiting for global server confirmation loops.
*   **`cardStackedUpdate`**: Tracks layer counts when cards are added to field piles.
*   **`cardPlayedToSupportUpdate` / `cardPlayedToFighterUpdate`**: Syncs visible field changes when cards enter public view lanes.
*   **`cardTapUpdated`**: Coordinates rotation alignments based on tap conditions across lanes.
*   **`cardMovedToDefeatedZone` / `defeatedPointsTickedUpdate`**: Updates win/loss scoring values (`BREAK POINTS: X / 10`). Changes text color to alert red (`#ff3333`) at 7+ points, and outputs an elimination warning notice if a total hits 10.
*   **`cardDiscardedUpdate` / `stackFlippedAndDiscardedUpdate`**: Tracks changes to the public discard pile.
*   **`handToDeckUpdate` / `discardRecycledUpdate`**: Synchronizes card totals when cards are recycled back into the deck.

---

## 🎯 Development Roadmap Context

When designing new features, expanding layouts, or fixing bugs, remember:
*   **No Logic in Phaser**: All positional arrays, deck item lists, and scoreboard ticks are managed by `server.js`. Phaser is just a visual terminal.
*   **Fog of War Protection**: Cards labeled `"Card Back"` must remain hidden. They do not reveal item properties unless the server sends a specific disclosure event payload.
*   **Garbage Collection Pattern**: The canvas re-render flow operates by completely deleting and re-spawning all text and image structures (`resetRenderLayer`) rather than moving existing card objects across coordinates.
*   **IP Constraint**: Completely rule-agnostic, generic TCG mechanics only. Avoid any direct references to specific card franchises or proprietary branding to prevent intellectual property issues.

---

## 🤖 LLM Context Bootstrap (Session Init)
<!-- PASTE THIS ENTIRE SECTION INTO A NEW AI SESSION TO INSTANTLY BOOTSTRAP CONTEXT -->
*   **Project Name:** crb-sandbox
*   **Tech Stack:** Phaser 4 (Beta/Esm), Socket.io, Node.js (`server.js`).
*   **Core Architecture:** Rule-agnostic, multiplayer 2-player/spectator tabletop sandbox simulator. Engine acts as a visual terminal. State tracking, lanes, hands, scores, and Fog of War masking rules are strictly authoritative on `server.js`.
*   **Rules Layer:** No rule enforcement or turn sequencing; features manual physical triggers for cards (move, stack, shuffle, draw, tap/rest) and scoring.
*   **File Manifest:**
    *   `index.html`: Entry point, styles, initialization of `globalSocket`.
    *   `game.js`: Core Phaser config, viewport dimensions, renderer modes, scene registry.
    *   `LobbyScene.js`: Discovery, table management (1-8), role selection.
    *   `GameScene.js`: Primary canvas running 3 visual layout columns. Tracks mouse vectors via spacebar key coordinates for targeted asset inspections (`scanCardHitboxesForPreview`), handles horizontal cascading lane steps (+25px), local drag input wrappers, and texture routing for `BS1-`, `BS2-`, `BS3-`, and `BS10-` prefixes.
    *   `DeveloperMode.js`: Debug console scene utilizing Phaser DOM elements. Features cross-tab data synchronizer, decklist regex parser (`^\s*(\d+)\s+(.*?)\s*\[([A-Za-z0-9-]+)\]`), auto-scrolling telemetry log, and a real-time index-mapped Hand Matrix table.
*   **State & Networking Matrix:**
    *   *Outbound Emissions:* `joinTable`, `leaveTable`, `loadDeck` (`[{id, title}]`), `getGameState`, `drawCard`, `draw6Cards`, `shuffleDeck`, `playCardFaceDown`, `flipCardFaceUp`, `placeDeckCardToStack`, `flipAndDiscardFromStack`, `playCardToSupport`, `playCardToFighter`, `toggleCardTap`, `discardCardFromHand`, `moveFighterToDefeated`, `adjustDefeatedPoints`, `moveDiscardToDefeated`, `recycleDiscardToDeck`, `playHandToTopDeck`, `playHandToBottomDeck`.
    *   *Inbound Payload Processing:* `stateUpdate` (forces hand matrix render), `errorMsg`, `serverNotice` (auto-fires `getGameState`), `cardDrawnUpdate` (optimized local mutate intercept path), `cardStackedUpdate`, `cardPlayedToSupportUpdate`, `cardPlayedToFighterUpdate`, `cardTapUpdated` (updates orientation), `cardMovedToDefeatedZone`, `defeatedPointsTickedUpdate` (triggers match loss alert at 10+ points), `cardDiscardedUpdate`, `stackFlippedAndDiscardedUpdate`, `handToDeckUpdate`, `discardRecycledUpdate`.
*   **IP Constraint:** Completely rule-agnostic, generic TCG mechanics only. Avoid any direct references to specific card franchises or proprietary branding to prevent intellectual property issues.
