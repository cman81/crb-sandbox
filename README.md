# CRB Sandbox - Desktop Client Application

A high-performance desktop sandbox terminal for testing card interactions, custom rulesets, and deck list validation loops of a trading card game. The application operates as a standalone client wrapper connected via WebSockets to a remote live server link, rendering game states using a buildless, zero-dependency Phaser 3 framework architecture.

## 🛠️ System Overview & Framework Architecture

- **Rendering Engine:** Phaser 3 (`Phaser.AUTO`) utilizing a baseline 1920x1080 high-fidelity viewport layout.
- **Aspect Ratio Management:** Combines programmatic canvas fitting (`Phaser.Scale.FIT`) with critical container CSS overrides (`object-fit: contain`) to guarantee accurate aspect tracking across varying screen dimensions and dynamic window resizes without stretching layouts.
- **Networking Backbone:** Employs a single global gateway instance (`globalSocket`) initialized over highly isolated Socket.io transport threads to maintain realtime data synchronization pipelines with the live remote server tracking match parameters.
- **Asset Deployment Guard:** Leverages a lightweight Programmatic Vector Fallback Engine to dynamically substitute missing sheet graphics with procedural vector placeholders—preventing critical application freeze crashes when local texture resources are missing.

---

## 📂 Project Repository Layout

Ensure your root development directory matches this structural profile before launching testing pipelines:

```text
crb-sandbox/
├── assets/
│   ├── BS01.png & BS01.json
│   ├── BS02.png & BS02.json
│   ├── BS03.png & BS03.json
│   └── atlas.png & atlas.json
├── vendor/
│   ├── socketio/
│   │   └── socket.io.min.js
│   └── phaserjs/
│       └── phaser.min.js
├── index.html         # Application viewport structure and style layout rules
├── game.js            # Engine initialization configuration and scene routing loops
├── BootScene.js       # Global preloading pipeline and coordinate map hydrators
├── LobbyScene.js      # Table seating layout parameters and keyboard mode triggers
├── DeckPrepScene.js   # Multi-line text layout parsing mechanics and submission handlers
├── GameScene.js       # Real-time state replication logic and interaction processors
└── DeveloperMode.js   # Tabbed administration dashboard and socket trace consoles
```

---

## 🔧 Phaser 3 Conversion Refactoring Checklist

If migrating legacy code from modern module versions, verify that these specific core components are implemented inside your codebase to match buildless Phaser 3 engine constraints:

### 1. BootScene.js — Standard JSON Texture Atlases
Phaser 3 requires explicit pathway parameters for both the physical image container and the coordinating text description layout file.

```javascript
// Replace modern unparsed loaders with standard explicit JSON mapping paths
this.load.atlas('BS01_cards', 'assets/BS01.png', 'assets/BS01.json');
this.load.atlas('BS02_cards', 'assets/BS02.png', 'assets/BS02.json');
this.load.atlas('BS03_cards', 'assets/BS03.png', 'assets/BS03.json');
this.load.atlas('BS10_cards', 'assets/atlas.png', 'assets/atlas.json');
```

### 2. GameScene.js — Container-Bound Drawing Coordinate Matrix
Procedural shapes generated dynamically inside container frames must link coordinates directly to the container scene reference space to lock rotation alignments and track layout transformations.

```javascript
// Ensure drawVectorCardBack hooks graphics creation to the child container's layout frame
drawVectorCardBack(container, width, height, scaleFactor) {
    const halfW = width / 2;
    const halfH = height / 2;
    
    // Bind the procedural context node cleanly onto the scene thread context
    const cardShape = container.scene.add.graphics();
    container.add(cardShape); // Anchor immediately into local parent coordinates
```

### 3. GameScene.js — Native Container Component Extraction
Do not attempt manual display-list manipulations during active loop execution passes. Hand the component asset over directly to the container instance.

```javascript
// Inside renderDrawerContents(), use native container add logic
// Phaser 3 automatically strips the card cleanly from the parent scene tree!
this.drawerContainer.add(drawerCardImg);
```

---

## 🚀 Local Testing & Execution Protocols

### Container Web Servicing (Chromebook / Linux Containers)
Because the codebase operates completely buildless without compilers, you can test modifications locally through any standard server layer instantly. Execute this command inside your root workspace folder to launch:

```bash
python3 -m http.server 8080
```

Once running, target your device browser terminal layer toward `http://localhost:8080` to evaluate real-time UI render states and network handshake updates.

### Keyboard Shortcut Cheatsheet (GameScene)
- **`[SPACEBAR]`**: Open dedicated structural asset code inspection detail layout frame.
- **`[T]`**: Toggle card tap orientation (Arena) OR drop a card straight to the Top of Deck (Hand position).
- **`[D]`**: Discard active card choice down into public graveyard pile.
- **`[B]`**: Route selected card index down to the Bottom profile of the deck array.
- **`[F]`**: Flip active card layout parameters down to execute Face-Down field play loops.
- **`[S]`**: Play chosen card resource asset directly to the Stage zone boundary space.
