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
        let localModHookActive = false;

        // Configuration profile mapping bundle keys to their single coordinating description text file
        const fileKeyMap = {
            'BS01_cards': 'BS1', 'BS02_cards': 'BS2', 'BS03_cards': 'BS3', 'BS04_cards': 'BS4',
            'BS05_cards': 'BS5', 'BS06_cards': 'BS6', 'BS07_cards': 'BS7', 'BS08_cards': 'BS8',
            'BS09_cards': 'BS9', 'BS10_cards': 'BS10', 'BS11_cards': 'BS11', 'P_cards': 'P',
            'ST01_cards': 'ST1', 'ST02_cards': 'ST2', 'ST03_cards': 'ST3', 'ST04_cards': 'ST4',
            'ST05_cards': 'ST5', 'ST06_cards': 'ST6', 'ST07_cards': 'ST7', 'ST08_cards': 'ST8',
            'ST09_cards': 'ST9', 'ST10_cards': 'ST10',
        };
        
        // --- 📊 VISUAL CHECKLIST & PROGRESS BAR PIPELINE ---
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Background progress bar box
        const progressBox = this.add.graphics().setDepth(5);
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(width / 2 - 160, height / 2 - 120, 320, 40);

        // Actual progress fill bar
        const progressBar = this.add.graphics().setDepth(6);

        // Overall progress percentage text
        const loadingText = this.make.text({
            x: width / 2,
            y: height / 2 - 150,
            text: 'Loading Mods... 0%',
            style: { font: '20px Arial, sans-serif', fill: '#ffffff' }
        }).setOrigin(0.5, 0.5).setDepth(10);

        // This object will map file keys to their specific text lines on screen
        const checklistItems = {};
        
        // 🧩 3-COLUMN LAYOUT MATH GRID CONFIGURATION
        let currentItemIndex = 0;
        const maxRowsPerColumn = 8;     // Wraps to the next column after 8 entries
        const columnWidth = 160;        // Horizontal gap spacing between columns
        const rowHeight = 22;           // Vertical spacing between rows
        
        const startX = width / 2 - 220; // Anchors the leftmost column baseline position
        const startY = height / 2 - 50; // Starting height position below the main bar

        // Helper function to dynamically add a file row into a grid coordinate system
        const addChecklistItem = (displayName, lookupKey) => {
            // Calculate column placement index math (0, 1, or 2)
            const col = Math.floor(currentItemIndex / maxRowsPerColumn);
            // Calculate row index math within that column context
            const row = currentItemIndex % maxRowsPerColumn;

            const itemText = this.make.text({
                x: startX + (col * columnWidth), // Shifts text horizontally right per column
                y: startY + (row * rowHeight),   // Shifts text down per row element
                text: `⏳ ${displayName}`,
                style: { font: '13px Arial, sans-serif', fill: '#aaaaaa' } // Slightly smaller font size for layout sizing
            }).setDepth(10);
            
            checklistItems[lookupKey] = itemText;
            currentItemIndex++; // Advance index position counter for next grid registration
        };

        // --- QUEUE ASSETS AND GENERATE VISUAL CHECKLIST ---
        Object.keys(fileKeyMap).forEach(bundleKey => {
            const baseFileName = fileKeyMap[bundleKey];
            const jsonTarget = `${baseFileName}.json`;

            // 🔍 CHECK IF THE MOD WORKSPACE CONTAINS THE COORDINATING SINGLE MAP JSON FILE
            if (moddedFiles.includes(jsonTarget)) {
                console.log(`🎨 [MULTIPACK ENGAGED]: Routing multi-sheet bundle ${bundleKey}`);
                this.load.multiatlas(bundleKey, `crb-mod://${jsonTarget}`, 'crb-mod://');
                localModHookActive = true;
                
                // Add the file entry to our screen list tracking system
                addChecklistItem(jsonTarget, bundleKey); 
            }
        });

        // Add the system UI fallback image to our checklist
        this.load.image('system_ui', 'crb-mod://card-back.png');
        addChecklistItem('card-back.png', 'system_ui');

        // Track your mod engine state globally
        this.registry.set('customArtModsActive', localModHookActive);
        // --- LOADER EVENT LISTENERS ---

        // 1. Smoothly fill the main progress bar vector
        this.load.on('progress', (value) => {
            progressBar.clear();
            progressBar.fillStyle(0x00ffcc, 1); // Vibrant teal progress color indicator
            progressBar.fillRect(width / 2 - 150, height / 2 - 110, 300 * value, 20);
            
            loadingText.setText(`Loading Mods... ${parseInt(value * 100)}%`);
        });

        // 2. ⚡ THE EMOJI FLIP: Swap out icons as Phaser completely finishes files
        this.load.on('filecomplete', (key) => {
            if (checklistItems[key]) {
                const currentText = checklistItems[key].text;
                const completedText = currentText.replace('⏳', '✅');
                
                checklistItems[key].setText(completedText);
                checklistItems[key].setStyle({ fill: '#00ff66' }); // Turns text neon green when finished!
            }
        });

        // 3. Clean up the dynamic graphics and checklist elements upon scene transition
        this.load.once('complete', () => {
            progressBar.destroy();
            progressBox.destroy();
            loadingText.destroy();
            
            // Cleanly loop through and delete all generated checklist text elements from RAM
            Object.values(checklistItems).forEach(txtObj => txtObj.destroy());

            if (this.textures.exists('system_ui')) {
                const baseTexture = this.textures.get('system_ui');
                const baseFrame = baseTexture.get('system_ui'); // Fetches default frame
                
                // Add the explicit frame mapping definition so the engine can resolve both keys!
                baseTexture.add(
                    'card_back', 
                    baseFrame.sourceIndex, 
                    baseFrame.x, 
                    baseFrame.y, 
                    baseFrame.width, 
                    baseFrame.height
                );
                
                console.log("🎴 [TEXTURE ENGINE]: Bound custom protocol stream 'system_ui' to frame key 'card_back'.");
            }

            console.log("🚀 Custom asset sideload compilation complete. Routing to LobbyScene...");
            this.scene.start("LobbyScene");
        });
        
        this.load.start();
    }
}
