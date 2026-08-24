# CRB Sandbox Client

Welcome to the **CRB Sandbox Client**, a native desktop multiplayer sandbox terminal designed for testing card interactions, custom rulesets, and deck list validation loops for the Competitive Ruleset Battle trading card game.

*Note: This application functions as a flexible testing playground and does not enforce rigid game rules automatically.*

---

## ✨ Features

* 📦 **Zero-Installation Portable App:** Fully self-contained Windows application—no installation wizards, external frameworks, or runtimes required.
* 🌐 **Live Multiplayer Testing:** Connects directly via real-time network streams to a live remote server using Socket.io.
* 🛠️ **Built-in Community Mod Support:** Drop your own custom card layouts, textures, and JSON configs directly into your system folder to load them instantly.

---

## 🚀 How to Run the Sandbox

The client is distributed as a pre-compiled, portable Windows executable. 

### Windows Instructions
1. Download the compiled **`CRB Sandbox Client.exe`** file provided by the development team.
2. Double-click the file to launch the sandbox instantly. 
*(Because it is portable, you can run it from any folder or a USB drive without installing it.)*

### Chromebook / Developer Start Commands
If you are running the project from a development environment or terminal:
* **Standard Launch:** `npm start`
* **Chromebook Optimization (GPU Disable):** `npm run chromebook`

---

## 📂 How to Add Custom Mods

The sandbox features an automatic asset-loading system. When you boot the application for the very first time, it generates a dedicated repository directory on your computer's hard drive.

### 1. Locate Your Mod Folder
Open your file explorer, navigate to your standard system **Documents** directory, and open the following folder:
📁 `Documents/CRB_Sandbox_Mods/`

### 2. Add Your Custom Content
You can inject your own content into the engine by placing files directly inside that folder:
* 🖼️ **`.png` files:** Custom card art, layout frames, or graphic textures.
* 📄 **`.json` files:** Custom card statistics, data structures, or rule definitions.

The application automatically checks this directory on startup and safely streams your community mods into the Phaser rendering engine.

---

## 🎮 Game Flow & Testing Loop

1. **Launch the app** to initialize the `BootScene` core assets and load local community mods.
2. Navigate to the **Lobby** to manage your room or look for multiplayer matches.
3. Open the **Deck Prep** screen to customize your loadout and select your card configurations.
4. Enter the **Game Scene** to begin testing interactive card loops and custom validation states.
5. Use **Developer Mode** features at any point during your testing session to toggle debugging options.
