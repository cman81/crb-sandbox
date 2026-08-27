class DeveloperMode extends Phaser.Scene {
    constructor() {
        super({ key: "DeveloperMode" });
        this.socket = null;
        this.myActiveTable = null;
        this.myActiveRole = null;
    }

    preload() {
        this.socket = globalSocket;
    }

    create() {
        this.initializeStateTrackingArrays();
        
        // Inject the complete responsive full-screen console interface container
        this.renderUnifiedConsoleFramework();
        
        this.setupSocketListeners();
        this.setupCrossTabSynchronizer();
        this.switchTab(1);
    }

    initializeStateTrackingArrays() {
        this.selectedPreviewCard = null;
        this.hoveredCardData = null;
        this.animatingUuids = [];
        this.lastReceivedState = null;
    }

    renderUnifiedConsoleFramework() {
        // 1. Calculate your laptop's precise active hardware scaling ratio live on boot
        // Math: Available Laptop Physical Width (1707.33) / Intended Virtual Coordinate Width (1920) = ~0.8892
        const currentWindowScaleFactor = window.innerWidth / 1920;

        // 2. Inject the master layout container with automated browser zoom adaptation
        let masterOverlayHtml = `
            <div id="devConsoleMasterLayer" style="
                display: flex;
                flex-direction: column;
                width: 1920px;
                height: 1080px;
                box-sizing: border-box;
                background: #0f172a; 
                padding: 30px;
                gap: 20px;
                font-family: monospace;
                color: #f8fafc;
                user-select: none;
                
                /* 🌟 THE HIGH-DPI CALIBRATION PATCH */
                /* Forces the browser to scale the 1920x1080 panel container uniformly down,
                perfectly compressing the elements to stay inside your physical monitor frame! */
                zoom: ${currentWindowScaleFactor} !important;
                transform: translate(0px, 0px) !important;
            ">
                <!-- HEADER APP HUD BANNER -->
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #334155; padding-bottom: 15px;">
                    <h1 style="margin: 0; font-size: 32px; color: #00ff00; font-weight: bold; letter-spacing: -0.5px;">🛠️ TCG DEVELOPER MODE CONSOLE</h1>
                    <span id="devTerminalPerspectiveTag" style="background: #1e293b; padding: 6px 12px; border-radius: 4px; font-size: 13px; color: #94a3b8; font-weight: bold; border: 1px solid #334155;">📢 PERSPECTIVE: UNBOUND LOBBY</span>
                </div>

                <!-- TAB ROW SELECTOR MATRIX -->
                <div style="display: flex; gap: 10px;">
                    <button id="devTabBtn1" style="background: #222; color: #00ff00; font-family: monospace; font-size: 14px; font-weight: bold; padding: 10px 20px; border: 1px solid #00ff00; border-radius: 6px; cursor: pointer;">[ TAB 1: LOBBY ]</button>
                    <button id="devTabBtn2" style="background: #111; color: #fff; font-family: monospace; font-size: 14px; font-weight: bold; padding: 10px 20px; border: 1px solid #334155; border-radius: 6px; cursor: pointer;">[ TAB 2: DECK LOADER ]</button>
                    <button id="devTabBtn3" style="background: #111; color: #fff; font-family: monospace; font-size: 14px; font-weight: bold; padding: 10px 20px; border: 1px solid #334155; border-radius: 6px; cursor: pointer;">[ TAB 3: ACTIONS ]</button>
                    <button id="devTabBtn4" style="background: #111; color: #fff; font-family: monospace; font-size: 14px; font-weight: bold; padding: 10px 20px; border: 1px solid #334155; border-radius: 6px; cursor: pointer;">[ TAB 4: TABLE ADMIN ]</button>
                </div>

                <!-- THREE-COLUMN RESPONSIVE WORKING FIELD GRID -->
                /* 🌟 CHANGED: flex-grow expands your middle log text area to swallow all 
                remaining hardware screen space between your left form and right hand table */
                <div style="display: flex; flex-grow: 1; gap: 20px; height: 0; min-height: 0; width: 100%;">
                    
                    <!-- COLUMN 1 CONTAINER: ACTIVE UTILITY WORKSPACE (460px FIXED) -->
                    <div id="devLeftColumnContainer" style="width: 460px; display: flex; flex-direction: column; height: 100%;">
        `;

        // 2. Initialize a separate panel tracker string variable to hold left utility panels
        let visualHtml = "";

        // --- TAB PANEL 1: LOBBY CONFIGURATION ---
        visualHtml += `
            <div id="panelLobby" style="display: block; background: #1e293b; padding: 24px; border-radius: 12px; border: 1px solid #334155; height: 100%; box-sizing: border-box; display: flex; flex-direction: column;">
                <h3 style="margin-top:0; color:#00ff00; font-size: 20px; margin-bottom: 20px;">1. Table Configuration</h3>
                <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
                    <label style="color: #94a3b8;">Table ID (1-8):</label>
                    <input type="number" id="devTableId" min="1" max="8" value="1" style="width: 80px; font-size: 16px; padding: 6px; background: #0f172a; color: #fff; border: 1px solid #334155; border-radius: 6px; text-align: center;">
                </div>
                <div style="margin-bottom: 40px; display: flex; justify-content: space-between; align-items: center;">
                    <label style="color: #94a3b8;">Select Role:</label>
                    <select id="devRole" style="width: 160px; font-size: 16px; padding: 6px; background: #0f172a; color: #fff; border: 1px solid #334155; border-radius: 6px;">
                        <option value="playerA">Player A</option>
                        <option value="playerB">Player B</option>
                        <option value="spectator">Spectator</option>
                    </select>
                </div>
                <div style="display: flex; gap: 15px; margin-top: auto;">
                    <button id="lobbyJoinBtn" style="flex: 1; background: #00ff00; color: #000; font-weight: bold; font-size: 16px; padding: 14px; border: none; border-radius: 6px; cursor: pointer;">JOIN TABLE</button>
                    <button id="lobbyLeaveBtn" style="flex: 1; background: #ef4444; color: #fff; font-weight: bold; font-size: 16px; padding: 14px; border: none; border-radius: 6px; cursor: pointer;">LEAVE TABLE</button>
                </div>
            </div>
        `;
        // --- TAB PANEL 2: DECK LOADER ---
        visualHtml += `
            <div id="panelDeckLoader" style="display: none; background: #1e293b; padding: 24px; border-radius: 12px; border: 1px solid #334155; height: 100%; box-sizing: border-box; overflow-y: auto;">
                <h3 style="margin-top:0; color:#00ff00; font-size: 20px; margin-bottom: 12px;">2. Game Setup Panel</h3>
                <div style="margin-bottom: 15px; display: flex; justify-content: space-between;">
                    <div>
                        <label style="color: #94a3b8;">Table:</label>
                        <input type="number" id="deckTableId" min="1" max="8" value="1" style="width:50px; background:#0f172a; color:#fff; border:1px solid #334155; padding:6px; border-radius: 6px; text-align: center;">
                    </div>
                    <div>
                        <label style="color: #94a3b8;">Slot:</label>
                        <select id="deckTargetPlayer" style="width:120px; background:#0f172a; color:#fff; border:1px solid #334155; padding:6px; border-radius: 6px;">
                            <option value="playerA">Player A</option>
                            <option value="playerB">Player B</option>
                        </select>
                    </div>
                </div>
                <label style="display:block; margin-bottom:6px; font-size:14px; color: #aaa;">Paste Raw Decklist Below:</label>
                <textarea id="deckRawInput" placeholder="2 Adventurer Cookie [ST1-013]..." style="width:100%; height:140px; background:#0f172a; color:#fff; font-family:monospace; font-size:13px; border:1px solid #334155; padding:8px; box-sizing:border-box; resize:none; border-radius: 6px; margin-bottom: 12px;"></textarea>
                <button id="deckLoadBtn" style="width:100%; background:#00ff00; color:#000; font-weight:bold; font-size:15px; padding:12px; border:none; border-radius:6px; cursor:pointer; margin-bottom: 15px;">LOAD DECKLIST</button>
                
                <div style="background: #0f172a; padding: 14px; border-radius: 8px; border: 1px solid #334155; display: flex; flex-direction: column; gap: 10px;">
                    <div style="display: flex; gap: 8px;">
                        <button id="deckShuffleBtn" style="flex: 1; background:#eab308; color:#000; font-weight:bold; font-size:13px; padding:10px; border:none; border-radius:6px; cursor:pointer;">⚡ SHUFFLE</button>
                        <button id="setupDraw6Btn" style="flex: 1; background:#10b981; color:#000; font-weight:bold; font-size:13px; padding:10px; border:none; border-radius:6px; cursor:pointer;">🎴 DRAW 6</button>
                    </div>
                    <button id="setupFlipUpBtn" style="width:100%; background:#d946ef; color:#fff; font-weight:bold; font-size:12px; padding:10px; border:none; border-radius:6px; cursor:pointer;">👁️ FLIP FACE UP</button>
                </div>
            </div>
        `;
        // --- TAB PANEL 3: GAME ACTIONS PANEL (PART A) ---
        visualHtml += `
            <div id="panelGameActions" style="display: none; background: #1e293b; padding: 20px; border-radius: 12px; border: 1px solid #334155; height: 100%; box-sizing: border-box; overflow-y: auto;">
                <h3 style="margin-top:0; color:#00ff00; font-size: 20px; margin-bottom: 8px;">3. Game Actions</h3>
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <div>
                        <label style="color:#94a3b8;">Table:</label>
                        <input type="number" id="actionTableId" min="1" max="8" value="1" style="width:45px; background:#0f172a; color:#fff; border:1px solid #334155; padding:6px; border-radius:6px; text-align:center;">
                    </div>
                    <div>
                        <label style="color:#94a3b8;">Player:</label>
                        <select id="actionTargetPlayer" style="width:120px; background:#0f172a; color:#fff; border:1px solid #334155; padding:6px; border-radius:6px;">
                            <option value="playerA">Player A</option>
                            <option value="playerB">Player B</option>
                        </select>
                    </div>
                </div>

                <div style="background: #0f172a; padding: 10px; border-radius: 8px; border: 1px solid #334155; display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                        <label style="font-size:12px; color:#00ffff; font-weight:bold;">Stack target:</label>
                        <select id="actionStackSlot" style="width:110px; background:#1e293b; color:#fff; border:1px solid #334155; padding:4px; border-radius:6px;">
                            <option value="fighterA">Fighter A</option>
                            <option value="fighterB">Fighter B</option>
                        </select>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button id="actionStackTopDeckBtn" style="flex:1; background:#06b6d4; color:#000; font-weight:bold; font-size:11px; padding:8px; border:none; border-radius:6px; cursor:pointer;">⬇️ STACK CARD</button>
                        <button id="actionFlipDiscardBtn" style="flex:1; background:#f97316; color:#000; font-weight:bold; font-size:11px; padding:8px; border:none; border-radius:6px; cursor:pointer;">🔥 FLIP & DISC</button>
                    </div>
                </div>
        `;
        visualHtml += `
            <div style="background: #0f172a; padding: 12px; border-radius: 8px; border: 1px solid #3b82f6; display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px;">
                <label style="font-size:12px; color:#3b82f6; font-weight:bold;">🔄 Universal Move Matrix:</label>
                
                <div style="display: flex; gap: 6px; align-items: center;">
                    <label style="font-size:11px; color:#aaa; width: 35px;">From:</label>
                    <select id="moveSrcZone" style="flex: 1; background:#1e293b; color:#fff; border:1px solid #334155; padding:4px; border-radius:6px; font-size:12px;">
                        <option value="hand">Hand</option>
                        <option value="support">Support</option>
                        <option value="discard">Discard</option>
                        <option value="defeated">Defeated Pile</option>
                        <option value="deck">Deck</option>
                        <option value="extraDeck">Extra Deck</option>
                        <option value="fighterA">Fighter A</option>
                        <option value="fighterB">Fighter B</option>
                        <option value="stage">Stage</option>
                        <option value="extraDeck">Extra Deck</option>
                        <option value="extraA">Extra A</option>
                        <option value="extraB">Extra B</option>
                    </select>
                    <label style="font-size:11px; color:#aaa;">Idx:</label>
                    <input type="number" id="moveSrcIdx" min="0" value="0" style="width:40px; background:#1e293b; color:#fff; border:1px solid #334155; padding:4px; border-radius:6px; text-align:center; font-size:12px;">
                </div>

                <div style="display: flex; gap: 6px; align-items: center;">
                    <label style="font-size:11px; color:#aaa; width: 35px;">To:</label>
                    <select id="moveDestZone" style="flex: 1; background:#1e293b; color:#fff; border:1px solid #334155; padding:4px; border-radius:6px; font-size:12px;">
                        <option value="hand">Hand</option>
                        <option value="support">Support</option>
                        <option value="discard">Discard</option>
                        <option value="defeated">Defeated Pile</option>
                        <option value="deck">Deck</option>
                        <option value="extraDeck">Extra Deck</option>
                        <option value="fighterA">Fighter A</option>
                        <option value="fighterB">Fighter B</option>
                        <option value="stage">Stage</option>
                        <option value="extraDeck">Extra Deck</option>
                        <option value="extraA">Extra A</option>
                        <option value="extraB">Extra B</option>
                    </select>
                    <div style="display: flex; gap: 4px;">
                        <button id="universalMoveTopBtn" style="background:#10b981; color:#fff; font-weight:bold; font-size:10px; padding:6px 8px; border:none; border-radius:6px; cursor:pointer;">TO TOP</button>
                        <button id="universalMoveBotBtn" style="background:#3b82f6; color:#fff; font-weight:bold; font-size:10px; padding:6px 8px; border:none; border-radius:6px; cursor:pointer;">TO BOT</button>
                    </div>
                </div>
            </div>
        `;

        // --- TAB PANEL 3: GAME ACTIONS PANEL (PART B) ---
        visualHtml += `
                <div style="background: #0f172a; padding: 10px; border-radius: 8px; border: 1px solid #00ffcc; display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px;">
                    <div style="display: flex; gap: 6px;">
                        <button id="actionRecycleDiscardBtn" style="flex:1; background:#00ffcc; color:#000; font-weight:bold; font-size:11px; padding:6px; border:none; border-radius:6px; cursor:pointer;">♻️ DISC TO DECK</button>
                    </div>
                </div>

                <div style="background: #0f172a; padding: 10px; border-radius: 8px; border: 1px solid #ef4444; display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px;">
                    <div style="display: flex; gap: 6px;">
                        <button id="actionDefeatPlus1Btn" style="flex: 1; background:#10b981; color:#000; font-weight:bold; font-size:11px; padding:6px; border:none; border-radius:6px; cursor:pointer;">DEFEAT +1</button>
                        <button id="actionDefeatMinus1Btn" style="flex: 1; background:#f59e0b; color:#000; font-weight:bold; font-size:11px; padding:6px; border:none; border-radius:6px; cursor:pointer;">DEFEAT -1</button>
                    </div>
                </div>

                <div style="background: #0f172a; padding: 8px; border-radius: 8px; border: 1px solid #eab308; display: flex; align-items: center; justify-content: space-between;">
                    <select id="tapZoneSelect" style="width:110px; background:#1e293b; color:#fff; border:1px solid #334155; padding:4px; border-radius: 6px;">
                        <option value="fighterA">Fighter A</option>
                        <option value="fighterB">Fighter B</option>
                        <option value="support">Support</option>
                    </select>
                    <div>
                        <label style="font-size:12px; color:#aaa;">Idx:</label>
                        <input type="number" id="tapSupportIdx" min="0" value="0" style="width: 40px; background: #1e293b; color: #fff; border: 1px solid #334155; padding: 4px; border-radius: 6px; text-align: center;">
                    </div>
                    <button id="actionToggleTapBtn" style="background:#eab308; color:#000; font-weight:bold; padding:6px 12px; border:none; border-radius:6px; cursor:pointer; font-size:12px;">🔄 TAP</button>
                </div>
            </div>
        `;
        // --- TAB PANEL 4: TABLE ADMINISTRATION ---
        visualHtml += `
            <div id="panelTableAdmin" style="display: none; background: #1e293b; padding: 24px; border-radius: 12px; border: 1px solid #334155; height: 100%; box-sizing: border-box; display: flex; flex-direction: column;">
                <h3 style="margin-top:0; color:#ef4444; font-size: 20px; margin-bottom: 20px;">4. Table Administration</h3>                
                <div style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
                    <label style="color: #94a3b8;">Table ID (1-8):</label>
                    <select id="adminTableId" style="width: 160px; font-size: 16px; padding: 6px; background: #0f172a; color: #fff; border: 1px solid #334155; border-radius: 6px; font-family: monospace;">
                        <option value="1">Table 1</option><option value="2">Table 2</option><option value="3">Table 3</option><option value="4">Table 4</option>
                        <option value="5">Table 5</option><option value="6">Table 6</option><option value="7">Table 7</option><option value="8">Table 8</option>
                    </select>
                </div>
                <div style="margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center;">
                    <label style="color: #94a3b8;">Select Role:</label>
                    <select id="adminRole" style="width: 160px; font-size: 16px; padding: 6px; background: #0f172a; color: #fff; border: 1px solid #334155; border-radius: 6px; font-family: monospace;">
                        <option value="playerA">Player A</option>
                        <option value="playerB">Player B</option>
                    </select>
                </div>

                <!-- ⏳ INJECTED TIMEKEEPER CONTROLS AREA -->
                <div style="background: #0f172a; padding: 16px; border-radius: 8px; border: 1px solid #fbbf24; display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
                    <span style="font-weight: bold; color: #fbbf24; font-size: 14px;">⏱️ TIMEKEEPER CONTROLS</span>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; background: #1e293b; padding: 8px; border-radius: 6px; border: 1px solid #334155;">
                        <span id="devTimelinePlayheadTag" style="font-size: 12px; color: #38bdf8;">STATUS: LIVE PRESENT</span>
                    </div>

                    <!-- Lock Control Row -->
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <select id="devTimekeeperRole" style="flex: 1; font-size: 13px; padding: 8px; background: #1e293b; color: #fff; border: 1px solid #334155; border-radius: 6px; font-family: monospace;">
                            <option value="playerA">Control as Player A</option>
                            <option value="playerB">Control as Player B</option>
                        </select>
                    </div>

                    <!-- 🌟 ROW 1: MASTER TIME RECONCILIATION TOGGLES -->
                    <div style="display: flex; gap: 8px;">
                        <button id="devControlTimeBtn" style="flex: 1; background: #fbbf24; color: #000; font-weight: bold; font-size: 12px; padding: 10px; border: none; border-radius: 6px; cursor: pointer; font-family: monospace;">🧊 FREEZE TIME</button>
                        <button id="devTimelineResumeBtn" style="flex: 1; background: #047857; color: #fff; font-weight: bold; font-size: 12px; padding: 10px; border: none; border-radius: 6px; cursor: pointer; font-family: monospace;">⏳ RESUME TIME</button>
                    </div>

                    <!-- 🌟 ROW 2: HISTORY SCRUBBING NAVIGATION BUTTONS -->
                    <div style="display: flex; gap: 8px; width: 100%;">
                        <button id="devTimelineStepBackBtn" style="flex: 1; background: #334155; color: #fff; font-family: monospace; font-size: 12px; font-weight: bold; padding: 10px; border: 1px solid #475569; border-radius: 6px; cursor: pointer;">◀ STEP BACKWARD</button>
                        <button id="devTimelineStepForwardBtn" style="flex: 1; background: #06b6d4; color: #000; font-family: monospace; font-size: 12px; font-weight: bold; padding: 10px; border: none; border-radius: 6px; cursor: pointer;">▶ STEP FORWARD</button>
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 15px; margin-top: auto;">
                    <button id="adminSignalBtn" style="background: #991b1b; color: #fff; font-weight: bold; font-size: 16px; padding: 14px; border: 1px solid #ef4444; border-radius: 6px; cursor: pointer;">🚨 SIGNAL END GAME</button>
                    <button id="adminRevokeBtn" style="background: #334155; color: #fff; font-weight: bold; font-size: 16px; padding: 14px; border: 1px solid #475569; border-radius: 6px; cursor: pointer;">↩️ REVOKE END GAME</button>
                </div>
            </div>
        `;

        // 🌟 CONSOLIDATING CODES BLOCK INTRODUCER
        // Close our column 1 panel element and append it directly into your primary full-screen overlay string
        masterOverlayHtml += visualHtml;
        masterOverlayHtml += `</div>`; // Safely caps off the #devLeftColumnContainer wrapper div element
        // --- COLUMN 2: CENTER WORKSPACE CONSOLE & STATE INSPECTOR TOOLBAR ---
        masterOverlayHtml += `
            <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 15px; height: 100%;">
                <!-- Dynamic Hardware-Accelerated Auto-Scrolling Server Stream Log Box -->
                <textarea id="devLog" readonly style="width: 100%; flex-grow: 1; background-color: #050505; color: #33ff33; font-family: 'Courier New', monospace; font-size: 16px; border: 1px solid #33ff33; padding: 15px; border-radius: 12px; resize: none; box-shadow: inset 0 0 10px #000; box-sizing: border-box;"></textarea>
                
                <!-- Bottom State Inspector Multi-Cast Toolbar Row -->
                <div style="color: white; font-family: monospace; font-size: 15px; background: #1e293b; padding: 16px 20px; border-radius: 12px; border: 1px solid #00ff00; box-shadow: 0px 4px 15px rgba(0,0,0,0.7); box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <span style="color: #00ff00; font-weight: bold; font-size: 16px;">🔎 State Inspector Loop:</span>
                        <label style="color:#aaa;">Table:</label>
                        <input type="number" id="inspectTableId" min="1" max="8" value="1" style="width: 50px; background: #0f172a; color: #fff; border: 1px solid #334155; padding: 6px; border-radius: 6px; text-align: center;">
                        <label style="color:#aaa; margin-left: 5px;">Perspective:</label>
                        <select id="inspectRole" style="width: 160px; background: #0f172a; color: #fff; border: 1px solid #334155; padding: 6px; border-radius: 6px;">
                            <option value="spectator">Spectator (X-Ray)</option>
                            <option value="playerA">Player A</option>
                            <option value="playerB">Player B</option>
                        </select>
                    </div>
                    <button id="inspectGetStateBtn" style="background: #00ff00; color: #000; font-weight: bold; font-size: 15px; padding: 10px 24px; border: none; border-radius: 6px; cursor: pointer; box-shadow: 0px 0px 10px rgba(0,255,0,0.4);">GET GAME STATE</button>
                </div>
            </div>
        `;

        // --- COLUMN 3: RIGHT SIDE HIGH-DENSITY CARD LOOKUP MATRIX ---
         masterOverlayHtml += `
            <div style="width: 320px; background: #1e293b; padding: 20px; border-radius: 12px; border: 1px solid #444; box-shadow: 0px 4px 15px rgba(0,0,0,0.5); box-sizing: border-box; display: flex; flex-direction: column; height: calc(50% - 10px);">
                <h3 style="margin-top:0; color:#eab308; font-size: 18px; margin-bottom: 12px; border-bottom: 1px solid #334155; padding-bottom: 6px;">📋 HAND MATRIX</h3>
                <div style="flex-grow: 1; overflow-y: auto; width: 100%;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left;">
                        <thead>
                            <tr style="border-bottom: 2px solid #334155; color: #aaa; font-size: 12px;">
                                <th style="padding: 6px; width: 80px;">POSITION</th>
                                <th style="padding: 6px;">CARD ID</th>
                            </tr>
                        </thead>
                        <tbody id="handMatrixBody">
                            <tr><td colspan="2" style="padding: 20px; text-align: center; color: #475569; font-style: italic;">[No Hand Data Loaded]</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- ⏳ INJECTED TIMELINE LOG BLOCK: Positioned safely outside the hand matrix wrapper -->
            <div style="width: 320px; background: #1e293b; padding: 20px; border-radius: 12px; border: 1px solid #444; box-shadow: 0px 4px 15px rgba(0,0,0,0.5); box-sizing: border-box; display: flex; flex-direction: column; height: calc(50% - 10px); margin-top: 15px;">
                <h3 style="margin-top:0; color:#fbbf24; font-size: 16px; margin-bottom: 12px; border-bottom: 1px solid #334155; padding-bottom: 6px;">📜 TIMELINE SNAPSHOT LOG</h3>
                <div id="devTimelineLogBox" style="flex-grow: 1; overflow-y: auto; width: 100%; font-size: 12px; color: #fbbf24; font-family: monospace; display: flex; flex-direction: column; gap: 6px;">
                    <span style="color: #475569; font-style: italic;">[No Timeline Actions Recorded]</span>
                </div>
            </div>
        `;

        // Safely close the layout columns flex gap, then close the master full-screen root div block
        masterOverlayHtml += `</div></div>`; 
        // 🌟 THE AUTOMATED CANVAS SNAP LOCK
        // Instead of dropping it at (0,0) and manually pushing it around with hardcoded translations,
        // we anchor the panel mass right to the center of Phaser's virtual matrix (960, 540).
        // setOrigin(0.5) forces the entire full-screen panel grid to align with the game canvas.
        this.masterDevConsoleDom = this.add.dom(960, 540).createFromHTML(masterOverlayHtml).setOrigin(0.5);
        this.masterDevConsoleDom.addListener("click");
        
        // Wire up parent click interception routing event handlers
        this.masterDevConsoleDom.on("click", (event) => {
            // Tab changes selectors
            if (event.target.id === "devTabBtn1") this.switchTab(1);
            if (event.target.id === "devTabBtn2") this.switchTab(2);
            if (event.target.id === "devTabBtn3") this.switchTab(3);
            if (event.target.id === "devTabBtn4") this.switchTab(4);

            // Tab 1: Lobby triggers
            if (event.target.id === "lobbyJoinBtn") this.handleJoin();
            if (event.target.id === "lobbyLeaveBtn") this.handleLeave();

            // Tab 2: Deck setup initialization triggers
            if (event.target.id === "deckLoadBtn") this.handleDeckLoad();
            if (event.target.id === "deckShuffleBtn") this.handleDeckShuffle();
            if (event.target.id === "setupDraw6Btn") this.handleDraw6Cards();
            if (event.target.id === "setupFlipUpBtn") this.handleFlipCardFaceUp();

            // Tab 3: Detailed macro operations buttons
            if (event.target.id === "actionRecycleDiscardBtn") this.handleRecycleDiscard();
            if (event.target.id === "actionStackTopDeckBtn") this.handlePlaceDeckToStack();
            if (event.target.id === "actionFlipDiscardBtn") this.handleFlipAndDiscardFromStack();
            if (event.target.id === "actionToggleTapBtn") this.handleToggleTapEmit();
            if (event.target.id === "actionDefeatPlus1Btn") this.handleScoreAdjustmentEmit(1);
            if (event.target.id === "actionDefeatMinus1Btn") this.handleScoreAdjustmentEmit(-1);
            if (event.target.id === "universalMoveTopBtn") this.handleUniversalMoveEmit(true);
            if (event.target.id === "universalMoveBotBtn") this.handleUniversalMoveEmit(false);

            // Toolbar: Perspective state inspector manual override poll
            if (event.target.id === "inspectGetStateBtn") this.handleGetGameState();

            // Tab 4: System table closure commands
            if (event.target.id === "adminSignalBtn") this.handleAdminSignalEnd();
            if (event.target.id === "adminRevokeBtn") this.handleAdminRevokeEnd();
            if (event.target.id === "devControlTimeBtn") { this.handleTimeLockRequest(); }
            if (event.target.id === "devTimelineStepBackBtn") { this.handleTimelineStep("backward"); }
            if (event.target.id === "devTimelineStepForwardBtn") { this.handleTimelineStep("forward"); }
            if (event.target.id === "devTimelineResumeBtn") { this.handleTimelineResumeExecution(); }
        });
    }
    switchTab(tabNum) {
        const btn1 = document.getElementById("devTabBtn1");
        const btn2 = document.getElementById("devTabBtn2");
        const btn3 = document.getElementById("devTabBtn3");
        const btn4 = document.getElementById("devTabBtn4");

        const p1 = document.getElementById("panelLobby");
        const p2 = document.getElementById("panelDeckLoader");
        const p3 = document.getElementById("panelGameActions");
        const p4 = document.getElementById("panelTableAdmin");

        // --- BROWSER RESET OVERRIDE PIPELINE ---
        [btn1, btn2, btn3, btn4].forEach(b => { 
            if (b) { 
                b.style.color = "#fff"; 
                b.style.backgroundColor = "#111"; 
                b.style.borderColor = "#334155"; 
            } 
        });
        [p1, p2, p3, p4].forEach(p => { 
            if (p) p.style.display = "none"; 
        });

        // --- 🌟 THE LAYOUT MATRIX FIX ---
        // Swapping from "flex" to "block" forces the browser to evaluate the interior 
        // padding and column properties exactly as they were written!
        if (tabNum === 1) {
            if (btn1) { btn1.style.color = "#00ff00"; btn1.style.backgroundColor = "#222"; btn1.style.borderColor = "#00ff00"; }
            if (p1) p1.style.display = "block";
        } else if (tabNum === 2) {
            if (btn2) { btn2.style.color = "#00ff00"; btn2.style.backgroundColor = "#222"; btn2.style.borderColor = "#00ff00"; }
            if (p2) p2.style.display = "block";
        } else if (tabNum === 3) {
            if (btn3) { btn3.style.color = "#00ff00"; btn3.style.backgroundColor = "#222"; btn3.style.borderColor = "#00ff00"; }
            if (p3) p3.style.display = "block";
        } else if (tabNum === 4) {
            if (btn4) { btn4.style.color = "#ef4444"; btn4.style.backgroundColor = "#222"; btn4.style.borderColor = "#ef4444"; }
            if (p4) p4.style.display = "block";
        }
    }

    setupSocketListeners() {
        // 1. Core State Snapshot Synchronizer
        this.socket.on("stateUpdate", sanitizedState => {
            this.logToConsole(`[RECEIVED stateUpdate]:\n${JSON.stringify(sanitizedState, null, 2)}`);
            this.refreshBattleLog(sanitizedState);
            const activeTargetPlayer = document.getElementById("actionTargetPlayer")?.value || "playerA";
            const handData = sanitizedState[activeTargetPlayer]?.hand || [];
            this.refreshHandMatrixTable(handData);
        });

        // 2. Exception/Error Interceptors
        this.socket.on("errorMsg", msg => {
            this.logToConsole(`[SERVER ERROR]: ${msg}`);
        });

        // 3. Command Confirmation Handshake
        this.socket.on("serverNotice", msg => {
            this.logToConsole(`[SERVER SUCCESS]: ${msg}`);
            const tableId = document.getElementById("actionTableId")?.value;
            const targetPlayer = document.getElementById("actionTargetPlayer")?.value;
            if (tableId && targetPlayer) {
                this.socket.emit("getGameState", { tableId: parseInt(tableId), role: targetPlayer });
            }
        });

        // 4. Live Interaction Tracers
        this.socket.on("cardDrawnUpdate", drawEvent => {
            this.updateStreamPerspectiveTitle();
            const isOwner = this.myActiveRole === drawEvent.targetPlayer;
            const isSpectator = this.myActiveRole === "spectator";
            let tag = isOwner ? "[YOUR HAND VISION]" : (isSpectator ? "[SPECTATOR X-RAY VISION]" : "[ENEMY VISION]");
            this.logToConsole(`[LIVE DRAW EVENT] ${tag}\nPlayer ${drawEvent.targetPlayer} drew a card.\nVisible Data payload: ${JSON.stringify(drawEvent.card)}\nRemaining Deck: ${drawEvent.deckCount}`);
        });

        this.socket.on("cardStackedUpdate", stackEvent => {
            const isOwner = this.myActiveRole === stackEvent.targetPlayer;
            const isSpectator = this.myActiveRole === "spectator";
            let tag = isOwner ? "[YOUR STACK VISION]" : (isSpectator ? "[SPECTATOR X-RAY VISION]" : "[ENEMY VISION]");
            this.logToConsole(`[LIVE STACK EVENT] ${tag}\nPlayer ${stackEvent.targetPlayer} added a card to stack next to ${stackEvent.targetSlot}.\nVisible Card Data: ${JSON.stringify(stackEvent.card)}\nStack Count: ${stackEvent.stackCount}\nRemaining Deck: ${stackEvent.deckCount}`);
        });

        this.socket.on("cardPlayedToSupportUpdate", playEvent => {
            this.logToConsole(`[LIVE FIELD EVENT] [PUBLIC ZONE REVEAL]\nPlayer ${playEvent.targetPlayer} played a card face up into support lane!\nCard Data: ${JSON.stringify(playEvent.card)}\nSupport Count: ${playEvent.supportCount}\nHand Count: ${playEvent.handCount}`);
        });

        this.socket.on("cardTapUpdated", tapEvent => {
            const loc = tapEvent.zone === "support" ? `support lane index ${tapEvent.supportIndex}` : `${tapEvent.zone} active slot`;
            this.logToConsole(`[LIVE ORIENTATION EVENT]\nPlayer ${tapEvent.targetPlayer}'s card in ${loc} is now: ${tapEvent.isTapped ? "🚨 TAPPED (RESTING)" : "🟢 UNTAPPED (ACTIVE)"}`);
        });

        this.socket.on("cardPlayedToFighterUpdate", playEvent => {
            this.logToConsole(`[LIVE FIELD EVENT] [PUBLIC SLOT REVEAL]\nPlayer ${playEvent.targetPlayer} played a card face up into field slot: ${playEvent.targetSlot}!\nCard Data: ${JSON.stringify(playEvent.card)}\nHand Count: ${playEvent.handCount}`);
        });

        this.socket.on("cardMovedToDefeatedZone", moveEvent => {
            this.logToConsole(`[LIVE FIELD EVENT] [CARD RETIRED]\nPlayer ${moveEvent.targetPlayer}'s card in ${moveEvent.slot} moved to Defeated Area!\nRetired Card: ${JSON.stringify(moveEvent.card)}\nDefeated Pile Count: ${moveEvent.defeatedCount}`);
        });

        this.socket.on("defeatedPointsTickedUpdate", scoreEvent => {
            let notice = scoreEvent.isEliminated ? `\n⚠️ ELIMINATION MARGIN REACHED: PLAYER ${scoreEvent.targetPlayer.toUpperCase()} HAS HIT 10+ DEFEATED POINTS AND LOSE!` : "";
            this.logToConsole(`[LIVE METRIC EVENT] [SCORE TICKED]\nPlayer ${scoreEvent.targetPlayer}'s Defeated Points updated!\nCurrent Total: ${scoreEvent.totalDefeatedPoints} / 10 pts${notice}`);
        });

        this.socket.on("cardDiscardedUpdate", discardEvent => {
            this.logToConsole(`[LIVE DISCARD EVENT] [PUBLIC PILE REVEAL]\nPlayer ${discardEvent.targetPlayer} discarded a card from hand!\nCard Details: ${JSON.stringify(discardEvent.card)}\nDiscard Count: ${discardEvent.discardCount}\nHand Count: ${discardEvent.handCount}`);
        });

        this.socket.on("handToDeckUpdate", deckEvent => {
            this.logToConsole(`[LIVE RECYCLE EVENT] [BLIND TRACK DEPLOY]\nPlayer ${deckEvent.targetPlayer} put a card face down into deck at ${deckEvent.location.toUpperCase()} position!\nVisible Card Data: ${JSON.stringify(deckEvent.card)}\nDeck Count: ${deckEvent.deckCount}\nHand Count: ${deckEvent.handCount}`);
        });

        this.socket.on("stackFlippedAndDiscardedUpdate", discardEvent => {
            this.logToConsole(`[LIVE REVEAL EVENT] [PUBLIC PILE REVEAL]\nPlayer ${discardEvent.targetPlayer} peeled top card off ${discardEvent.targetSlot} stack and flipped face up into discard pile!\nRevealed Card: ${JSON.stringify(discardEvent.card)}\nRemaining Stack: ${discardEvent.stackCount}\nDiscard Pile Count: ${discardEvent.discardCount}`);
        });

        this.socket.on("discardRecycledUpdate", recycleEvent => {
            this.logToConsole(`[LIVE FIELD EVENT] [PILE RECOVERY COMPLETE]\nPlayer ${recycleEvent.targetPlayer} moved ALL cards from discard pile face down into deck, fully reshuffled!\nDeck Count: ${recycleEvent.deckCount}\nDiscard Pile Count: ${recycleEvent.discardCount}`);
        });

        this.socket.on("discardToDefeatedUpdate", defeatEvent => {
            this.logToConsole(`[LIVE FIELD EVENT] [DISCARD RETIRED]\nPlayer ${defeatEvent.targetPlayer} retired a card out of discard into defeated zone!\nRetired Card: ${JSON.stringify(defeatEvent.card)}\nDiscard Count: ${defeatEvent.discardCount}\nDefeated Pile Count: ${defeatEvent.defeatedCount}`);
        });
    }

    refreshBattleLog(sanitizedState) {
        const logBox = document.getElementById("devTimelineLogBox");
        if (logBox) {
            logBox.innerHTML = "";
            const historyLines = sanitizedState.gameState?.battleLog || [];

            if (historyLines.length === 0) {
                logBox.innerHTML = `<span style="color: #475569; font-style: italic;">[No Timeline Actions Recorded]</span>`;
            } else {
                // Render actions backward so the freshest move is always at the top of the box
                historyLines.slice().reverse().forEach(line => {
                    logBox.innerHTML += `<div style="border-bottom: 1px solid #2d3748; padding-bottom: 4px; line-height: 1.4;">${line}</div>`;
                });
            }
        }
    }

    setupCrossTabSynchronizer() {
        const tableInputs = ["devTableId", "deckTableId", "actionTableId", "inspectTableId"];
        tableInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener("input", event => {
                    const newValue = event.target.value;
                    tableInputs.forEach(targetId => {
                        const targetEl = document.getElementById(targetId);
                        if (targetEl && targetEl.value !== newValue) {
                            targetEl.value = newValue;
                        }
                    });
                });
            }
        });

        const roleSelectors = ["devRole", "deckTargetPlayer", "actionTargetPlayer", "inspectRole"];
        roleSelectors.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener("change", event => {
                    const chosenRole = event.target.value;
                    if (chosenRole === "spectator") return; // Guard spectator crashes
                    roleSelectors.forEach(targetId => {
                        const targetEl = document.getElementById(targetId);
                        if (targetEl) {
                            if (targetEl.querySelector(`option[value="${chosenRole}"]`)) {
                                targetEl.value = chosenRole;
                            }
                        }
                    });
                });
            }
        });

        // Setup immediate auto-pull loops on variable alteration
        const masterTableInput = document.getElementById("actionTableId");
        const masterPlayerDropdown = document.getElementById("actionTargetPlayer");
        const forceMatrixSync = () => {
            if (masterTableInput && masterPlayerDropdown && masterTableInput.value) {
                this.socket.emit("getGameState", { tableId: parseInt(masterTableInput.value), role: masterPlayerDropdown.value });
            }
        };
        if (masterTableInput) masterTableInput.addEventListener("input", forceMatrixSync);
        if (masterPlayerDropdown) masterPlayerDropdown.addEventListener("change", forceMatrixSync);
    }

    logToConsole(message) {
        const textarea = document.getElementById("devLog");
        if (textarea) {
            const timestamp = (new Date()).toLocaleTimeString();
            textarea.value += `[${timestamp}] ${message}\n\n`;
            textarea.scrollTop = textarea.scrollHeight; // Natively snap viewport to bottom
        }
    }

    refreshHandMatrixTable(handArray) {
        const tbody = document.getElementById("handMatrixBody");
        if (!tbody) return;
        tbody.innerHTML = "";

        if (!handArray || handArray.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="2" style="padding: 20px; text-align: center; color: #ef4444; font-weight: bold; background: rgba(239,68,68,0.05);">
                        ⚠️ [HAND IS COMPLETELY EMPTY]
                    </td>
                </tr>
            `;
            return;
        }

        handArray.forEach((card, index) => {
            let displayId = "🚫 [CARD BACK - HIDDEN]";
            const isCardBack = !card || card.name === "Card Back" || card.title === "Card Back";
            const rowColor = isCardBack ? "#f97316" : "#00ff88"; // Orange vs. System Green

            if (!isCardBack) {
                displayId = card.title ? `${card.title} [${card.id}]` : card.id;
            }

            const rowHtml = `
                <tr style="border-bottom: 1px solid #334155; font-size: 13px;">
                    <td style="padding: 8px 4px; font-weight: bold; color: #64748b;">Index ${index}</td>
                    <td style="padding: 8px 4px; color: ${rowColor}; font-weight: bold;">${displayId}</td>
                </tr>
            `;
            tbody.innerHTML += rowHtml;
        });
    }

    updateStreamPerspectiveTitle() {
        const titleEl = document.getElementById("devTerminalPerspectiveTag");
        if (!titleEl) return;

        if (this.myActiveTable && this.myActiveRole) {
            titleEl.textContent = `📢 PERSPECTIVE: TABLE ${this.myActiveTable} AS ${this.myActiveRole.toUpperCase()}`;
            titleEl.style.color = "#eab308"; // Shift to warning yellow when locked to a seat
        } else {
            titleEl.textContent = "📢 PERSPECTIVE: UNBOUND LOBBY";
            titleEl.style.color = "#94a3b8";
        }
    }

    handleJoin() {
        const tableId = document.getElementById("devTableId").value;
        const role = document.getElementById("devRole").value;
        this.myActiveTable = parseInt(tableId, 10);
        this.myActiveRole = role;
        this.updateStreamPerspectiveTitle();
        this.logToConsole(`>> Emitting joinTable: Table ${tableId} as ${role}`);
        this.socket.emit("joinTable", { tableId: this.myActiveTable, role: role });
    }

    handleLeave() {
        this.logToConsole(`>> Emitting leaveTable`);
        this.socket.emit("leaveTable");
        this.myActiveTable = null;
        this.myActiveRole = null;
        this.updateStreamPerspectiveTitle();
    }

    handleDeckLoad() {
        const tableId = document.getElementById("deckTableId").value;
        const targetPlayer = document.getElementById("deckTargetPlayer").value;
        const rawText = document.getElementById("deckRawInput").value;
        
        if (!rawText.trim()) return this.logToConsole("[CLIENT ERROR]: Deck text field is completely empty!");
        
        const lines = rawText.split("\n");
        
        // Separate allocation targets matching your server model schema
        const processedDeck = [];
        const processedExtraDeck = [];
        
        // Parser State Machine tracker: defaults to writing into main deck
        let currentTargetZone = "main"; 

        const regex = /^\s*(\d+)\s+(.*?)\s*\[([A-Za-z0-9-]+)\]/;

        lines.forEach((line, index) => {
            const cleanLine = line.trim();
            if (!cleanLine) return; // Ignore blank spaces

            // 1. STATE MACHINE ZONE TRANSITION CHECKERS
            const lowerLine = cleanLine.toLowerCase();
            if (lowerLine.includes("decklist")) {
                currentTargetZone = "main";
                this.logToConsole(`📝 [PARSER STATE]: Toggled parsing target array focus to MAIN DECK.`);
                return;
            }
            if (lowerLine.includes("extra")) {
                currentTargetZone = "extra";
                this.logToConsole(`🎴 [PARSER STATE]: Toggled parsing target array focus to EXTRA DECK.`);
                return;
            }

            // 2. CARD REGEX EXTRACTOR MATCH PASS
            const match = cleanLine.match(regex);
            if (match) {
                const count = parseInt(match[1], 10);
                const cardTitle = match[2].trim();
                const cardCode = match[3].trim();
                
                if (!isNaN(count) && count > 0) {
                    const targetPayload = { id: cardCode, title: cardTitle };
                    
                    // Direct data routing strictly matching our state tracking destination flags
                    for (let i = 0; i < count; i++) {
                        if (currentTargetZone === "main") {
                            processedDeck.push(targetPayload);
                        } else if (currentTargetZone === "extra") {
                            processedExtraDeck.push(targetPayload);
                        }
                    }
                }
            }
        });

        this.logToConsole(`>> Emitting loadDeck: Table ${tableId} (${targetPlayer}) | Main: ${processedDeck.length} cards, Extra: ${processedExtraDeck.length} cards.`);
        this.socket.emit("loadDeck", { tableId: parseInt(tableId, 10), targetPlayer: targetPlayer, deckList: processedDeck, extraDeckList: processedExtraDeck });
    }

    handleDeckShuffle() {
        const tableId = document.getElementById('deckTableId').value;
        const targetPlayer = document.getElementById('deckTargetPlayer').value;
        this.logToConsole(`>> Emitting shuffleDeck: Table ${tableId} (${targetPlayer}) via unique UUID sort routine.`);
        this.socket.emit('shuffleDeck', { tableId: parseInt(tableId), targetPlayer });
    }

    handleGetGameState() {
        const tableId = document.getElementById("inspectTableId").value;
        const role = document.getElementById("inspectRole").value;
        this.logToConsole(`>> Emitting getGameState Request: Fetching Table ${tableId} via '${role}' lens.`);
        this.socket.emit("getGameState", { tableId: parseInt(tableId, 10), role: role });
    }

    handleDraw6Cards() {
        const tableId = document.getElementById("deckTableId").value;
        const targetPlayer = document.getElementById("deckTargetPlayer").value;
        this.logToConsole(`>> Emitting draw6Cards: Table ${tableId} for ${targetPlayer}`);
        this.socket.emit("draw6Cards", { tableId: parseInt(tableId, 10), targetPlayer: targetPlayer });
    }

    handleFlipCardFaceUp() {
        const tableId = document.getElementById("deckTableId").value;
        const targetPlayer = document.getElementById("deckTargetPlayer").value;
        this.logToConsole(`>> Emitting flipCardFaceUp: Table ${tableId} fighterA slot for ${targetPlayer}`);
        this.socket.emit("flipCardFaceUp", { tableId: parseInt(tableId, 10), targetPlayer: targetPlayer });
    }

    handlePlaceDeckToStack() {
        const tableId = document.getElementById("actionTableId").value;
        const targetPlayer = document.getElementById("actionTargetPlayer").value;
        const targetSlot = document.getElementById("actionStackSlot").value;
        this.logToConsole(`>> Emitting placeDeckCardToStack: Table ${tableId} moving top deck card to ${targetPlayer}'s ${targetSlot} stack.`);
        this.socket.emit("placeDeckCardToStack", { tableId: parseInt(tableId, 10), targetPlayer: targetPlayer, targetSlot: targetSlot });
    }

    handleToggleTapEmit() {
        const tableId = document.getElementById("actionTableId").value;
        const targetPlayer = document.getElementById("actionTargetPlayer").value;
        const zone = document.getElementById("tapZoneSelect").value;
        const supportIndex = document.getElementById("tapSupportIdx").value;
        this.logToConsole(`>> Emitting toggleCardTap: Table ${tableId} shifting state in ${zone} for ${targetPlayer}.`);
        this.socket.emit("toggleCardTap", { tableId: parseInt(tableId, 10), targetPlayer: targetPlayer, zone: zone, supportIndex: parseInt(supportIndex, 10) });
    }

    handleScoreAdjustmentEmit(pointDelta) {
        const tableId = document.getElementById("actionTableId").value;
        const targetPlayer = document.getElementById("actionTargetPlayer").value;
        this.logToConsole(`>> Emitting adjustDefeatedPoints: Table ${tableId} shifting ${targetPlayer}'s points by: ${pointDelta}.`);
        this.socket.emit("adjustDefeatedPoints", { tableId: parseInt(tableId, 10), targetPlayer: targetPlayer, amount: pointDelta });
    }

    handleFlipAndDiscardFromStack() {
        const tableId = document.getElementById("actionTableId").value;
        const targetPlayer = document.getElementById("actionTargetPlayer").value;
        const targetSlot = document.getElementById("actionStackSlot").value;
        this.logToConsole(`>> Emitting flipAndDiscardFromStack: Table ${tableId} peeling top card from ${targetPlayer}'s ${targetSlot} stack.`);
        this.socket.emit("flipAndDiscardFromStack", { tableId: parseInt(tableId, 10), targetPlayer: targetPlayer, targetSlot: targetSlot });
    }

    handleRecycleDiscard() {
        const tableId = document.getElementById("actionTableId").value;
        const targetPlayer = document.getElementById("actionTargetPlayer").value;
        this.logToConsole(`>> Emitting recycleDiscardToDeck: Table ${tableId} recycling discard pile for ${targetPlayer}.`);
        this.socket.emit("recycleDiscardToDeck", { tableId: parseInt(tableId, 10), targetPlayer: targetPlayer });
    }

    handleAdminSignalEnd() {
        const tableId = parseInt(document.getElementById("adminTableId").value, 10);
        const targetPlayer = document.getElementById("adminRole").value;
        this.logToConsole(`🚨 [DEV ADMIN]: Proposing match closure signal for Table ${tableId}, Role: ${targetPlayer}`);
        this.socket.emit("signalEndGame", { tableId: tableId, targetPlayer: targetPlayer });
    }

    handleAdminRevokeEnd() {
        const tableId = parseInt(document.getElementById("adminTableId").value, 10);
        const targetPlayer = document.getElementById("adminRole").value;
        this.logToConsole(`↩️ [DEV ADMIN]: Retracting match closure signal for Table ${tableId}, Role: ${targetPlayer}`);
        this.socket.emit("revokeEndGame", { tableId: tableId, targetPlayer: targetPlayer });
    }

    handleUniversalMoveEmit(isPlaceOnTop = true) {
        const tableId = document.getElementById("actionTableId").value;
        const targetPlayer = document.getElementById("actionTargetPlayer").value;
        const targetZone = document.getElementById("moveSrcZone").value;
        const targetIndex = document.getElementById("moveSrcIdx").value;
        const destinationZone = document.getElementById("moveDestZone").value;
        
        const alignmentLabel = isPlaceOnTop ? "TOP" : "BOTTOM";
        this.logToConsole(`>> Emitting universal request: Shifting ${targetZone} (${targetIndex}) into ${destinationZone} [Stack Target: ${alignmentLabel}] for ${targetPlayer}.`);

        const fighterOrStage = ['fighterA', 'fighterB', 'stage', 'extraA', 'extraB'];
        
        // Route 1: Source card is leaving an arena battlefield slot
        if (fighterOrStage.includes(targetZone)) {
            this.socket.emit("requestFighterOrStageToZone", {
                tableId: parseInt(tableId, 10),
                targetPlayer: targetPlayer,
                targetZone: targetZone,
                destinationZone: destinationZone,
                isPlaceOnTop: isPlaceOnTop
            });
            return;
        }
        
        // Route 2: Destination card is landing in an arena slot (Stays un-impacted by stack alignment)
        if (fighterOrStage.includes(destinationZone)) {
            this.socket.emit("requestCardToFighterOrStage", {
                tableId: parseInt(tableId, 10),
                targetPlayer: targetPlayer,
                targetZone: targetZone,
                targetIndex: parseInt(targetIndex, 10),
                destinationZone: destinationZone
            });
            return;
        }

        // Route 3: Standard flat zone-to-zone transport array mapping
        // We pass the new isPlaceOnTop flag directly inside the data packet structure
        this.socket.emit("requestCardMove", {
            tableId: parseInt(tableId, 10),
            targetPlayer: targetPlayer,
            targetZone: targetZone,
            targetIndex: parseInt(targetIndex, 10),
            destinationZone: destinationZone,
            isPlaceOnTop: isPlaceOnTop 
        });
    }

    /**
     * Tells the server to freeze time for the active table.
     * It sends the table number and the chosen player role (Player A or Player B)
     * so the server knows who is locking the game board.
     */
    handleTimeLockRequest() {
        const tableId = document.getElementById("adminTableId").value;
        const chosenTimekeeperRole = document.getElementById("devTimekeeperRole").value;

        this.logToConsole(`⏳ [TIMEKEEPER ACTION]: Requesting time freeze lock for Table ${tableId} as ${chosenTimekeeperRole.toUpperCase()}...`);
        
        // Emits freeze signal to server handler
        this.socket.emit("requestTimeFreeze", {
            tableId: parseInt(tableId, 10),
            role: chosenTimekeeperRole
        });
    }

    /**
     * Tells the server to shift the game history backward or forward by one turn.
     * It appends the selected timekeeper role so the server can authorize the step.
     *
     * @param {string} direction - The timeline scrub direction ("backward" or "forward").
     */
    handleTimelineStep(direction) {
        const tableId = document.getElementById("adminTableId").value;
        const chosenTimekeeperRole = document.getElementById("devTimekeeperRole").value;

        this.logToConsole(`⏳ [TIMEKEEPER ACTION]: Stepping timeline [${direction.toUpperCase()}] on Table ${tableId} as ${chosenTimekeeperRole.toUpperCase()}.`);
        
        // Pass the tableId, direction, and chosen role context string to the server
        this.socket.emit("stepTimeline", {
            tableId: parseInt(tableId, 10),
            direction: direction,
            role: chosenTimekeeperRole
        });
    }

    /**
     * Tells the server to unlock time and turn off the freeze lock.
     * It appends the selected timekeeper role to pass authorization gates.
     */
    handleTimelineResumeExecution() {
        const tableId = document.getElementById("adminTableId").value;
        const chosenTimekeeperRole = document.getElementById("devTimekeeperRole").value;

        this.logToConsole(`⏳ [TIMEKEEPER ACTION]: Sending request to unlock timeline on Table ${tableId} as ${chosenTimekeeperRole.toUpperCase()}.`);
        
        // Pass the tableId and role string context
        this.socket.emit("resumeTimeline", {
            tableId: parseInt(tableId, 10),
            role: chosenTimekeeperRole
        });
    }

}
