# 🎮 CRB-SANDBOX MASTER CONTEXT RECOVERY BOOTSTRAP

## 📋 1. ARCHITECTURAL PHILOSOPHY
* **Authoritative Server Truth:** Node.js (`server.js` on port 3000) acts as the single source of truth for all indices, states, hands, lanes, scoring, and visibility rules. 
* **Passive Display Terminal:** Phaser 4 functions purely as a rendering window. It executes no local rules, calculates no math states, and repaints the canvas solely based on incoming server data packets.
* **Persistent Connection Loop:** `globalSocket` is preserved globally across scene transitions. 
* **The Lifecycle Reset Fix:** To completely isolate graphic layers on table re-entry and prevent canvas blanking bugs, all custom scene graphics variables (`this.fieldGraphics`, `this.dividerGraphics`) are explicitly set to `null` at the top of the scene's `create()` constructor method.

---

## 🔒 2. FOG OF WAR (FOW) VISIBILITY MASKING LAYER
* **Public Unmasked Zones:** `discard`, `support`, and `defeated` arrays are completely transparent across all active player seats and spectator connections.
* **Private Owned Zones:** `hand` and `extraDeck` arrays are fully readable *only* by the true owner seat. Opposing active players receive generic `Card Back` text models.
* **The Sub-Stack Stack Rule:** Cards inside a `faceDownStack` sub-array securely strip all identity and code properties, outputting uniform `Card Back` wrappers to *both* active players (even the owner). Only connections registered as `"spectator"` hold unmasked X-Ray vision paths to view raw stack items.
* **Deck Array Vision:** `deck` collections are universally hidden from active players; only `spectator` users hold X-Ray deck vision.

---

## 🧮 3. RIGID LAYOUT MATH & MUTATION PROTOCOLS

### Index Protocol Math
* **Top of Deck/Stack:** Maps explicitly to the array tail boundary (`.push()` / `.pop()`).
* **Bottom of Deck/Stack:** Maps explicitly to array index `0` (`.unshift()`).
* **Programs Shuffle Scramble:** Drains target arrays via a `while` loop, tags cards face-down, pushes them to the deck tail (`.push`), assigns a unique tracker string using `uuidv4()`, sorts alphanumerically via `.localeCompare()`, and deletes tracking keys.

### Dynamic Hand Grid Scaler
Computes grid layout width configuration (`gridDim`) based on hand array total count elements:
$$\text{Cards} \le 1 \rightarrow 1, \quad \le 4 \rightarrow 2, \quad \le 9 \rightarrow 3, \quad \le 16 \rightarrow 4, \quad \le 25 \rightarrow 5, \quad \text{else } 6$$
* **Horizontal Column Spacing:** `startX=55, endX=330` (If `gridDim==1`, spacing defaults to `192`; if `gridDim==2`, `startX=100, endX=284`). $\text{colSpacing} = (\text{endX} - \text{startX}) / (\text{gridDim} - 1)$.
* **Vertical Row Spacing:** `gridDim==1` → 0, `2` → 200, `3` → 140, `4` → 100, `else` 75.
* **Inverse Sizing Scale Factor:** `1` → 2.4x, `2` → 1.4x, `3` → 0.8x, `4` → 0.6x, `5` → 0.48x, `else` 0.38x.

### Vertical Spacing Overlap Correction
To prevent large-scaled hand rows from bleeding upward past the central partition and covering layout text headers, a layout shift parameter pushes cards down dynamically:
* `gridDim == 1` (2.4x scale, 369px card height): $\text{verticalPushOffset} = (\text{Local: } 110px \mid \text{Remote: } 80px)$
* `gridDim == 2` (1.4x scale, 215px card height): $\text{verticalPushOffset} = (\text{Local: } 45px \mid \text{Remote: } 30px)$
* `gridDim \ge 3$: $\text{verticalPushOffset} = 0px$.
$$\text{cardY} = \text{c.handStart.y} + (\text{row} \times \text{rowSpacing}) + \text{verticalPushOffset}$$

---

## ⌨️ 4. KEYBOARD SHORTCUTS MATRIX
Active participants hovering their mouse cursor over any card in their local hand column can trigger stateless action shortcut macros. These incorporate local client-side prediction splices to instantly compress hand card gaps and refresh pile layouts before WebSocket packets finish round-trip passes:

| Key Input | Network Emitter Call | Client-Side Local Prediction Impact |
| :--- | :--- | :--- |
| **`D`** | `discardCardFromHand` | Slices card out of hand instantly; compresses grid gaps; appends face-up to discard tail. |
| **`T`** | `playHandToTopDeck` | Slices card out of hand instantly; compresses grid gaps; pushes face-down to deck tail (`.push`). |
| **`B`** | `playHandToBottomDeck` | Slices card out of hand instantly; compresses grid gaps; unshifts face-down to deck index 0 (`.unshift`). |

---

## 📡 5. REFACTORED STATE AND TRANSACTIONAL APIS

### Match Termination Flow
* `signalEndGame` `({ tableId, targetPlayer })` -> Flags termination intent to `true` on server. Spawns "Thanks for playing" modal window instantly on screen.
* `revokeEndGame` `({ tableId, targetPlayer })` -> Retracts intent to `false`. Emitted inside `create()` scene boot pass to automate table re-entry self-healing.
* `leaveTable` -> Tells the server to clear a player's seat string ID immediately without destroying match history. Executed when clicking "DISMISS" on the thanks modal before transitioning to `LobbyScene`.

### Core Field Interactions
* `loadDeck`: `({ tableId, targetPlayer, deckList })` -> Processes list via text workspace regex: `^\s*(\d+)\s+(.*?)\s*\[([A-Za-z0-9-]+)\]`. Instantiates face-down deck items on server.
* `shuffleDeck`: `({ tableId, targetPlayer })` -> Fires programmatic random UUID alphanumeric sort scramble pass.
* `drawCard` / `draw6Cards`: `({ tableId, targetPlayer })` -> Pops elements from deck tail array into target hand. 
* `placeDeckCardToStack`: `({ tableId, targetPlayer, targetSlot })` -> Pops card from deck tail array into fighter's sub-stack tail array.
* `flipAndDiscardFromStack`: `({ tableId, targetPlayer, targetSlot })` -> Pops card from sub-stack tail, flips face-up, and pushes into public discard pile.
* `playCardToSupport`: `({ tableId, targetPlayer, handIndex })` -> Splices card from hand, sets face-up, and pushes to support lane.
* `playCardToFighter`: `({ tableId, targetPlayer, handIndex, targetSlot })` -> Splices card from hand, sets face-up, and populates empty battle slot.
* `moveFighterToDefeated`: `({ tableId, targetPlayer, slot })` -> Empties fighter slot (`null`) and moves card face-up into public defeated collection array.
* `adjustDefeatedPoints`: `({ tableId, targetPlayer, amount })` -> Updates scores. Sends critical failure alerts (`isEliminated: true`) if a seat hits $\ge 10$ points.
* `toggleCardTap`: `({ tableId, targetPlayer, zone, supportIndex })` -> Inverts active orientation flag (`!card.isTapped`). Rotated cards alter collision dimensions by swapping bounds width and height parameters.
* `cardDiscardedUpdate`: `({ targetPlayer, card, discardCount, handCount })` -> Public update. Remote clients intercept this packet to compress the opponent's hand size total count and refresh their discard pile view face-up.
