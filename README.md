# CRB Sandbox - Desktop Client Application

A high-performance desktop sandbox terminal for testing card interactions, custom rulesets, and deck list validation loops of a trading card game. The application operates as a standalone client wrapper connected via WebSockets to a remote live server link, rendering game states using a buildless, zero-dependency Phaser 3 framework architecture.

## ⚙️ Core Architecture Rules
- **Environment:** Zero-dependency, buildless Phaser 3 (`Phaser.AUTO`, 1920x1080 canvas fit). 
- **Paradigms:** Pure global instances (`Phaser`, `io`). No ES6 modules, imports, or exports.
- **Coordinates:** Shapes generated inside containers must anchor relative to parent container space (`-halfW`, `-halfH`).
- **Fail-safes:** Automatic Programmatic Vector Fallback Engine if textures are missing. Memory leaks prevented by sweeping display list layers (`Text`, `Image`, `Container`) via `child.destroy()` before building structural frames.

## 📂 Current Scene Implementation Trackers

### 🎯 GameScene.js Assembly State
1. **Network Engine:** WebSocket tracking (`globalSocket`) decoupled entirely from UI state. Handshakes and data synchronization loops strictly use remote state replication payloads.
2. **Keyboard Shortcut Hitboxes:** Double-click tracking mapped onto custom boundary rectangles. Orthogonal tap calculation changes boundary detection sizes seamlessly via:
   `const hW = card.isTapped ? halfH : halfW;`
3. **Stack Drawer & Camera Blurring:** An overlay drawer panel glides smoothly along the x-axis (`-1536` to `0`). High-res inspection invokes viewport blurring via camera post-processes (`addBlur`) and custom camera ignores.
4. **Defeated Pile Layout:** Updated to a top-to-bottom waterfall layout. It iterates through the pile array applying an explicit `30px` vertical layout step and sequential layer depths (`50 + index`) to ensure proper overlapping visualization.
