# ⏳ CRB-SANDBOX ROADMAP: "TO BE DETERMINED" (TBD) ENGINE IMPLEMENTATION

This document outlines the phased design and delivery metrics for integrating a state history tracking engine, an asymmetric playback control layer, and a non-destructive multi-timeline mechanics engine. All layers use the "To Be Determined..." identifier to maintain absolute legal compliance and clear visual cueing.

---

## 🏗️ INFRASTRUCTURE HYBRID BLUEPRINT (PERSISTENCE LAYER)
To prevent server crash state resets on Railway and eliminate Node.js memory leaks, the TBD Engine separates volatile pointers from structural document storage:
* **Redis Reference Tier:** Manages real-time `head` pointers, active table structures, and string branch manifests (`table:tableId:refs`) with sub-millisecond execution speeds.
* **MongoDB Object Store:** A permanent document container that writes and Indexes historical timeline nodes (`{ nodeId, parentId, sharedState }`) using full JSON storage, completely decoupling history from the active server process memory footprint.

---

## 🛠️ PHASE 1: CHRONOLOGICAL REWIND & IMMUTABLE GIT STORAGE (MVP)
*Goal: Establish a centralized chronological log tree capable of stepping forward and backward through gameplay states, utilizing Git-inspired structural sharing to conserve database memory.*

### 📡 1. Git-Inspired Structural Reference Serializer
* **The Pointer Architecture:** Transition the server away from flat arrays. Introduce an immutable node graph where each snapshot tracks backward using a `parentId` field. 
* **Structural Reference Sharing:** Eliminate deep copies. When a player takes an action, shallow-copy only their modified property arrays (e.g., `[...playerA.hand]`). Pass the unchanged opponent objects (`playerB`) completely by memory reference, generating identical cache hits and saving RAM.
* **Volatile Playhead Tracking:** Write active table references straight to Redis. Track `head: "node-uuid"` to dictate which chronological block the client is currently viewing.

### 🔒 2. Mode Activation & The Timekeeper Lock
* **State Toggle Engine:** Establish a table status toggle (`table.tbdActive = true/false`) and assign a lock string (`table.timekeeperSocketId = socket.id`).
* **Input Intercept Guards:** Create a global verification helper function (`isTimeFrozen(table, socketId)`). Inject this guard onto the first line of all standard player interaction listeners (`requestCardToFighterOrStage`, `toggleCardTap`, `requestCardMove`).
* **Action Blocking:** If `tbdActive` is true, immediately short-circuit and emit an error payload to any socket attempt that does not match the initiating `timekeeper` player ID.
* **Resilient Disconnection Recovery:** Map an execution hook to the server's global `leaveAll` / `disconnect` loops. If the socket matching `table.timekeeperSocketId` exits the room mid-pause, the server will **not** reset the match. Instead, it instantly forces `table.tbdActive = false`, releases the input lock, sets the table's current live state to whatever snapshot the playhead was resting on, and broadcasts a resumed state.

### 🎨 3. "To Be Determined..." UI Rendering & View Synchronization
* **The Monochrome Shader Filter:** When the server broadcasts that `tbdActive` is true, the non-initiating player experiences a total grayscale desaturation filter applied to their viewport. Standard canvas object click/drag interactions are completely stripped.
* **The Timekeeper Panel:** Provide the initiating player with an un-filtered color viewport overlay featuring an eyebrow label reading: `⏳ CHRONOS INTERRUPT: TO BE DETERMINED...` along with three interactive controls: `◀ STEP BACK`, `STEP FORWARD ▶`, and `▶ RESUME PLAY`.
* **The Target Overlay:** The frozen player's screen displays a static black eyebrow panel reading: `🔒 TIMELINE FROZEN: TO BE DETERMINED...` in a muted grayscale monospace font.
* **The Spectator Overlay:** Spectators experience the black-and-white clinical analytical mode with a custom eyebrow reading: `👁️ SPECTATOR VIEW: TO BE DETERMINED...`. They retain full unmasked X-Ray vision to see face-down frames and hidden hand configurations for active match casting.
* **Standard Fog-of-War Preservation:** Pass all historical snapshots retrieved by the playhead index directly through the original `sendSanitizedState()` pipeline. Ensure that under no circumstances does the non-initiating player gain x-ray visibility into hidden opponent frames or private deck configurations.

### 🔀 4. The Flat "Retcon" Cut
* **Playhead Splice:** If the playhead is positioned in the past and the Timekeeper player commands a brand-new, active gameplay motion from their hand or board, trigger a destructive slice from the current pointer node, discarding the old future nodes from MongoDB and setting the new event as the official head of the sequence.

---

## 🌀 PHASE 2: NON-DESTRUCTIVE MULTIVERSE BRANCH ENGINE (FUTURE Upgrade)
*Goal: Evolve the history logging system from a sequential flat array into a node-based Timeline Tree, allowing coaches, players, and testers to explore branch pathways without losing the original game match future.*

### 🌲 1. Relational Snapshot Nodes
* **Metadata Expansion:** Upgrade the items stored in MongoDB from bare states into structured tracking nodes containing unique IDs and relational pointers:
  ```json
  {
      "nodeId": "6f2a89b1-7b3c-4d5e",
      "parentId": "1a2b3c4d-5e6f-7a8b",
      "action": { "type": "placeDeckCardToStack", "player": "playerA" },
      "sharedState": { ... }
  }
  ```

### 🔀 2. Multi-Timeline Branch Generation (Git Refs)
* **Branch Isolation:** Completely remove the destructive Phase 1 slicing mechanism. When an action is played while resting in the past, append the fresh node straight to MongoDB, setting its `parentId` pointer back to the exact step node where the diversion occurred.
* **Lightweight Branch Pointers:** Save a manifest dictionary of text branches inside Redis (`table:tableId:branches`). Keep the original timeline sequence entirely untouched and active in memory:
  ```javascript
  {
    "Main Match Reality": "node-uuid-original-future",
    "Alternative Stack Charge Plan": "node-uuid-new-branch-tail"
  }
  ```

### 🎛️ 3. Advanced Timekeeper Interactive Dropdowns
* **Timeline Switching Protocols:** Upgrade the client-side control layout to pull an active list of valid branch variants discovered from the Redis reference directory.
* **Comparative Playback:** Enable the Timekeeper player to effortlessly alternate between different strategic branches via a simple UI drop-down menu within the "To Be Determined..." control bar, automatically re-syncing viewport states instantly upon selection.
