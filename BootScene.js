class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    // Phaser 3 lets you handle async requests inside init or preload via standard plugins
    async create() {
        console.log("🔍 Scanning for cross-platform community card mod assets...");
        
        let moddedFiles = [];
        
        // 🛡️ Safe check to ensure we are running inside Electron and not a standard browser tab
        if (window.crbElectronBridge && typeof window.crbElectronBridge.getModdedFilesList === 'function') {
            moddedFiles = await window.crbElectronBridge.getModdedFilesList();
        }

        console.log(`📦 Found ${moddedFiles.length} file entries inside user mod directory.`);

        // --- ATOMIC TEXTURE REGISTRATION PIPELINE ---
        const targetBundles = ['BS01_cards', 'BS02_cards', 'BS03_cards', 'BS10_cards'];
        
        let localModHookActive = false;

        // Configuration profile mapping bundle keys to their single coordinating description text file
        const fileKeyMap = {
            'BS01_cards': 'BS01',
            'BS02_cards': 'BS02',
            'BS03_cards': 'BS03',
            'BS10_cards': 'atlas' // 🔍 This is your multi-image layout driver
        };

        Object.keys(fileKeyMap).forEach(bundleKey => {
            const baseFileName = fileKeyMap[bundleKey];
            const jsonTarget = `${baseFileName}.json`;

            // 🔍 CHECK IF THE MOD WORKSPACE CONTAINS THE COORDINATING SINGLE MAP JSON FILE
            if (moddedFiles.includes(jsonTarget)) {
                console.log(`🎨 [MULTIPACK ENGAGED]: Routing multi-sheet bundle ${bundleKey} through secure protocol.`);
                
                // 🛠️ PHASER 3 FIX: Use multiatlas instead of atlas. 
                // Param 1: Your internal scene bundle identifier string (e.g., 'BS10_cards')
                // Param 2: The path routing to the single JSON mapping description file
                // Param 3: The root folder path where the engine should look for the referenced 'atlas_X.png' assets
                this.load.multiatlas(bundleKey, `crb-mod://${jsonTarget}`, 'crb-mod://');
                
                localModHookActive = true;
            } else {
                // FALLBACK GRAPHICS SYSTEM: If the JSON descriptor file is missing,
                // do nothing here. The GameScene Vector Engine will procedurally draw mockups!
                console.log(`🛡️ [VECTOR PROMPT]: No descriptor found for ${bundleKey}. Falling back to procedural drawing context.`);
            }
        });

        // Track your mod engine state globally
        this.registry.set('customArtModsActive', localModHookActive);

        // Start the internal loader routine manually since we ran an async check first
        this.load.once('complete', () => {
            console.log("🚀 Custom asset sideload compilation complete. Routing to LobbyScene...");
            this.scene.start("LobbyScene");
        });
        
        this.load.start();
    }
}
