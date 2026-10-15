// ==UserScript==
// @name         Grepolis Discord Attack Notifier
// @version      1.5
// @author       AbstractGR
// @description  Standalone script to send Discord alerts for incoming Grepolis attacks
// @match        http://*.grepolis.com/game/*
// @match        https://*.grepolis.com/game/*
// @updateURL    https://raw.githubusercontent.com/konstantinosloukaidis/grepolis-discord-notifier/main/GrepolisDiscordNotifier.user.js
// @downloadURL  https://raw.githubusercontent.com/konstantinosloukaidis/grepolis-discord-notifier/main/GrepolisDiscordNotifier.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      discord.com
// ==/UserScript==

(function() {
    'use strict';

    // Helper functions for storage (DIO-Tools pattern)
    function loadVal(key, def) {
        let v = typeof GM_getValue === 'function' ? GM_getValue(key) : localStorage.getItem(key);
        if (v === null || v === undefined) return def;
        try { return JSON.parse(v); } catch(e) { return v; }
    }
    function saveVal(key, val) {
        let serialized = JSON.stringify(val);
        if (typeof GM_setValue === 'function') GM_setValue(key, serialized);
        else localStorage.setItem(key, serialized);
    }

    // ==========================================
    // CONFIGURATION (Storage-backed with defaults)
    // ==========================================
    const PROD_WEBHOOK_DEFAULT = "https://discord.com/api/webhooks/1558509905793654966/kwunVuU8LeyjlxruqE3jUEdEsaC0kljM7f_vREKIEDCwqcx4fgz6ck2udANd2x9FhNv3";
    const DEV_WEBHOOK_DEFAULT = "https://discord.com/api/webhooks/1559104745531252746/TVa2F8xJQlnXiPBdc0GofYGVtJ48Vn6l32a6YPMNlJjKpzGRih-9NZs9xX4ItrgR73w6";

    let PING_EVERYONE = loadVal("sentry_ping", false); // Set to true to include @here in the alert
    let IS_DEV = loadVal("sentry_is_dev", false);
    let DETAILED = loadVal("sentry_detailed", true); // Set to true to include city status and troop details in the alert
    let LANG = loadVal("sentry_lang", "el"); // Options: "en" (English), "el" (Greek)
    let PROD_WEBHOOK = loadVal("sentry_prod_wh", PROD_WEBHOOK_DEFAULT);
    let DEV_WEBHOOK = loadVal("sentry_dev_wh", DEV_WEBHOOK_DEFAULT);
    let IGNORED_ALLIANCES = loadVal("sentry_ignored_alliances", []);
    console.log(IGNORED_ALLIANCES);

    let ALLIANCE_CACHE = null;

    async function getAlliances() {
        if (ALLIANCE_CACHE) return ALLIANCE_CACHE;

        try {
            const res = await fetch(`https://${window.location.hostname}/data/alliances.txt`);
            const text = await res.text();

            ALLIANCE_CACHE = text
                .split('\n')
                .map(line => {
                    const parts = line.split(',');
                    if (parts.length < 2 || !parts[1]) return null;

                    const cleanName = decodeURIComponent(parts[1].replace(/\+/g, ' ')).trim();
                    if (!cleanName) return null;

                    return {
                        id: Number(parts[0]),
                        name: cleanName
                    };
                })
                .filter(Boolean);

            return ALLIANCE_CACHE;
        } catch (err) {
            console.error("Failed to load alliances:", err);
            return [];
        }
    }

    function getWebhookUrl() {
        return IS_DEV ? DEV_WEBHOOK : PROD_WEBHOOK;
    }

    const I18N = {
        en: {
            flag: "🇬🇧",
            ping: "Under Attack!",
            title: "INCOMING ATTACK DETECTED",
            description: "An enemy movement has been spotted heading towards your city!",
            originCity: "🗡️ Origin City",
            originPlayer: "👤 Origin Player",
            targetCity: "🛡️ Target City",
            targetPlayer: "👤 Target Player",
            arrivalTime: "⏳ Arrival Time (DE Time)",
            cityStatus: "🏛️ City Status",
            senate: "Senate Level",
            wall: "Wall Level",
            god: "Active God",
            protection: "City Protection",
            protectionActive: "ACTIVE",
            protectionInactive: "INACTIVE",
            silver: "Cave Silver",
            nativeTroops: "🗡️ Native Troops (Owned)",
            supportTroops: "🛡️ Supporting Troops (Stationed)",
            noTroops: "_No troops inside_",
            none: "None",
            unknown: "Unknown",
            footer: "Grepolis Sentry System",
            impact: "on impact",
            alliance: "Alliance",

            // Regular Units
            sword: "swordsmen",
            slinger: "slingers",
            archer: "archers",
            hoplite: "hoplites",
            rider: "riders",
            chariot: "chariots",
            catapult: "catapults",
            militia: "militia",

            // Naval Units
            big_transporter: "slow transport ships",
            small_transporter: "fast transport ships",
            bireme: "biremes",
            attack_ship: "light ships",
            demolition_ship: "fire ships",
            trireme: "triremes",
            colonize_ship: "colony ships",

            // Mythical & Divine Units
            minotaur: "minotaurs",
            manticore: "manticores",
            zyklop: "cyclopes",
            harpy: "harpies",
            medusa: "medusas",
            centaur: "centaurs",
            pegasus: "pegasi",
            cerberus: "cerberuses",
            fury: "furies",
            griffin: "griffins",
            calydonian_boar: "calydonian boars",
            satyr: "satyrs",
            spartoi: "spartoi",
            siren: "sirens",
            sea_monster: "hydras",
            ladon: "ladons",
            godsent: "divine envoys",

            // Gods
            zeus: "Zeus",
            poseidon: "Poseidon",
            hera: "Hera",
            athena: "Athena",
            hades: "Hades",
            artemis: "Artemis",
            aphrodite: "Aphrodite",
            ares: "Ares",

            // Research, Buildings & Advisors
            phalanx: "Phalanx",
            ram: "Ram",
            tower: "Tower",
            lighthouse: "Lighthouse",
            captain: "Captain",
            commander: "Commander",
            yes: "Yes",
            no: "No"
        },
        el: {
            flag: "🇬🇷",
            ping: "Δεχόμαστε επίθεση!",
            title: "ΕΝΤΟΠΙΣΤΗΚΕ ΕΙΣΕΡΧΟΜΕΝΗ ΕΠΙΘΕΣΗ",
            description: "Εχθρικά στρατεύματα κατευθύνονται προς την πόλη σου!",
            originCity: "🗡️ Πόλη Προέλευσης",
            originPlayer: "👤 Παίκτης Προέλευσης",
            targetCity: "🛡️ Πόλη Στόχος",
            targetPlayer: "👤 Παίκτης Στόχος",
            arrivalTime: "⏳ Ώρα Άφιξης (Ώρα Γερμανίας)",
            cityStatus: "🏛️ Κατάσταση Πόλης",
            senate: "Επίπεδο Συγκλήτου",
            wall: "Επίπεδο Τείχους",
            god: "Λατρευόμενος Θεός",
            protection: "Προστασία Πόλης",
            protectionActive: "ΕΝΕΡΓΗ",
            protectionInactive: "ΑΝΕΝΕΡΓΗ",
            silver: "Ασήμι",
            nativeTroops: "🗡️ Δικά σου Στρατεύματα",
            supportTroops: "🛡️ Ξένες Υποστηρίξεις (Σταθμευμένες)",
            noTroops: "_Δεν υπάρχουν στρατεύματα_",
            none: "Κανένας",
            unknown: "Άγνωστο",
            footer: "Σύστημα Ειδοποιήσεων Grepolis",
            impact: "κατά την πρόσκρουση",
            alliance: "Συμμαχία",

            // Regular Units
            sword: "ξιφομάχοι",
            slinger: "σφεντόνες",
            archer: "τοξότες",
            hoplite: "οπλίτες",
            rider: "ιππείς",
            chariot: "άρματα",
            catapult: "καταπέλτες",
            militia: "εθνοφρουρά",

            // Naval Units
            big_transporter: "αργά μεταφορικά",
            small_transporter: "γρήγορα μεταφορικά",
            bireme: "διήρεις",
            attack_ship: "φάροι",
            demolition_ship: "πυρπολικά",
            trireme: "τριήρεις",
            colonize_ship: "αποικιακά",

            // Mythical & Divine Units
            minotaur: "μινώταυροι",
            manticore: "μαντιχώρες",
            zyklop: "κύκλωπες",
            harpy: "άρπυιες",
            medusa: "μέδουσες",
            centaur: "κένταυροι",
            pegasus: "πήγασοι",
            cerberus: "κέρβεροι",
            fury: "ερινύες",
            griffin: "γρύπες",
            calydonian_boar: "καλυδώνιοι κάπροι",
            satyr: "σάτυροι",
            spartoi: "σπαρτοί",
            siren: "σειρήνες",
            sea_monster: "ύδρες",
            ladon: "λάδωνες",
            godsent: "θεϊκοί απεσταλμένοι",

            // Gods
            zeus: "Δίας",
            poseidon: "Ποσειδώνας",
            hera: "Ήρα",
            athena: "Αθηνά",
            hades: "Άδης",
            artemis: "Άρτεμις",
            aphrodite: "Αφροδίτη",
            ares: "Άρης",

            // Research, Buildings & Advisors
            phalanx: "Φάλαγγα",
            ram: "Κριός",
            tower: "Πύργος",
            lighthouse: "Φάρος",
            captain: "Καπετάνιος",
            commander: "Στρατηγός",
            yes: "Ναι",
            no: "Όχι"
        }
    }
    // ==========================================

    const uw = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const knownAttacks = new Set(loadVal("sentry_known_attacks", [])); // Set of known attack IDs to prevent duplicate alerts

    // Utility for cross-manager HTTP requests
    const request = typeof GM_xmlhttpRequest !== "undefined" ? GM_xmlhttpRequest : GM.xmlHttpRequest;

    function initNotifier() {
        if (!uw.MM || !uw.GameEvents) {
            setTimeout(initNotifier, 1000);
            return;
        }

        console.log("Grepolis Discord Notifier: Initialized and listening for attacks.");

        // Listen to native game events for real-time notification
        uw.$.Observer(uw.GameEvents.attack.incoming).subscribe(() => {
            console.log("Grepolis Discord Notifier: Movement observed.");
            checkAttacks();
        });

        // Fallback polling just in case the UI event is missed
        setInterval(checkAttacks, IS_DEV ? 10000 : 120000); // Check every 10s in dev, every 120s in production

        // Observer for Settings window opening (/player/index) - DIO-Tools style
        uw.$(document).ajaxComplete(function (e, xhr, opt) {
            let url = (opt && opt.url) ? opt.url.split("?")[0] : "";
            if (url.includes("/player") || url.includes("/player/index")) {
                setTimeout(injectSettings, 200);
            }
        });
    }

    async function checkAttacks() {
        // console.log("Grepolis Discord Notifier: Checking for incoming attacks...");
        const models = uw.MM.getModels();
        if (!models || !models.MovementsUnits) return;

        const movements = models.MovementsUnits;
        const currentAttackIds = new Set();


        for (const key in movements) {
            const movement = movements[key].attributes;

            if (isIncoming(movement) && (movement.type === 'attack' || movement.command_type === 'Attack')) {
                currentAttackIds.add(movement.id);

                if (!knownAttacks.has(movement.id)) {
                    knownAttacks.add(movement.id);
                    const payload = await preparePayloadOneAttack(movement);
                    if (payload) sendDiscordAlert(payload);
                }
            }
        }

        for (const id of knownAttacks) {
            if (!currentAttackIds.has(id)) {
                knownAttacks.delete(id);
            }
        }
        saveVal("sentry_known_attacks", Array.from(knownAttacks));
    }

    function isIncoming(movement) {
        return IS_DEV || (movement.started_at === null && movement.home_town_id !== null);
    }

    async function preparePayloadOneAttack(movement) {
        const t = I18N[LANG] || I18N.en;

        const arrivalDate = new Date(movement.arrival_at * 1000);
        const arrivalTime = arrivalDate.toLocaleString("de-DE", { 
            timeZone: "Europe/Berlin",
            hour12: false
        });

        const player = uw.Game.player_name || t.unknown;
        const worldId = uw.Game.world_id || "zz34";
        const playerAllianceId = uw.Game.alliance_id || null;

        const oppPlayerInfo = await getPlayerInfoFromPolisId(movement.home_town_id, movement.target_town_id);

        if (filterOutIgnoredAlliances(oppPlayerInfo)) return null;

        const fields = [
            { 
                name: t.originCity, 
                value: movement.home_town_id 
                    ? `[**${movement.town_name_origin || t.unknown}**](https://grepodata.com/intel/town/${worldId}/${movement.home_town_id})` 
                    : `**${movement.town_name_origin || t.unknown}**`, 
                inline: true 
            },
            { 
                name: t.originPlayer, 
                value: `*${oppPlayerInfo.playerName || t.unknown}*`, 
                inline: true 
            },
            { 
                name: t.alliance, 
                value: `*${oppPlayerInfo.allianceName || t.unknown}*`, 
                inline: true 
            },
            { 
                name: t.targetCity, 
                value: `**${movement.town_name_destination || t.unknown}**`, 
                inline: true 
            },
            { 
                name: t.targetPlayer, 
                value: `*${player}*`, 
                inline: true 
            },
            { 
                name: t.arrivalTime, 
                value: `\`${arrivalTime}\``, 
                inline: false 
            }
        ];

        if (DETAILED) {
            const targetTownId = movement.target_town_id;
            const town = uw.ITowns.getTown(targetTownId);

            if (town) {
                const models = uw.MM.getModels();

                // 1. Wall Calculation & Projection
                const buildings = town.buildings?.()?.attributes || {};
                const currentWall = buildings.wall ?? 0;
                const senateLevel = buildings.main ?? 0;

                let projectedWall = currentWall;
                const buildingOrdersCollection = typeof town.buildingOrders === "function" ? town.buildingOrders() : town.buildingOrders;
                const orders = buildingOrdersCollection?.models || [];

                for (const order of orders) {
                    const attr = order.attributes;
                    if (attr && attr.building_type === "wall" && attr.to_be_completed_at <= movement.arrival_at) {
                        projectedWall += attr.tear_down ? -1 : 1;
                    }
                }

                const wallDisplay = projectedWall !== currentWall 
                    ? `\`${currentWall}\` ➔ **\`${projectedWall}\`** *(\`${t.impact}\`)*` 
                    : `\`${currentWall}\``;

                // 2. God, Protection & Silver
                const rawGod = typeof town.god === "function" ? town.god() : null;
                const godDisplay = rawGod ? t[rawGod] : t.none;

                let isProtected = false;
                if (typeof town.getCastedPowers === "function") {
                    const casted = town.getCastedPowers();
                    const powers = Array.isArray(casted) ? casted : (casted?.models || []);
                    isProtected = powers.some(p => {
                        const powerId = p.attributes?.power_id || p.power_id;
                        return powerId === "town_protection";
                    });
                }

                const silverStored = typeof town.getEspionageStorage === "function" 
                    ? Number(town.getEspionageStorage())
                    : "0";

                // 3. Researches
                const researches = models?.Researches?.attributes || {};
                const hasRam = researches.ram ?? false;
                const hasPhalanx = researches.phalanx ?? false;
                
                // 4. Premium
                const premium = models?.PremiumFeatures[uw.Game.player_id]?.attributes || {};
                const hasCaptain = (premium?.captain || 0) > movement.arrival_at ?? false;
                const hasCommander = (premium?.commander || 0) > movement.arrival_at ?? false;

                // 5. Tower or lighthouse
                const hasTower = buildings.tower > 0 ?? false;
                const hasLighthouse = buildings.lighthouse > 0 ?? false;

                // Format City Status with every attribute on its own clean line
                const statusLines = [
                    `🏛️ **${t.senate}:** \`${senateLevel}\``,
                    `🧱 **${t.wall}:**${wallDisplay}`,
                    `🏰 **${t.tower}:** ${hasTower ? t.yes : t.no} / **${t.lighthouse}:** ${hasLighthouse ? t.yes : t.no}`,
                    `🛡️ **${t.phalanx}:** ${hasPhalanx ? t.yes : t.no} / **${t.ram}:** ${hasRam ? t.yes : t.no}`,
                    `🪙 **${t.captain}:** ${hasCaptain ? t.yes : t.no} / **${t.commander}:** ${hasCommander ? t.yes : t.no}`,
                    `⚡ **${t.god}:** \`${godDisplay}\``,
                    `🛡️ **${t.protection}:** ${isProtected ? `\`${t.protectionActive}\`` : `\`${t.protectionInactive}\``}`,
                    `🪙 **${t.silver}:** \`${silverStored}\``
                ].join("\n");

                // 3. Line-by-Line Detailed Troop Formatter
                const formatUnitsVertical = (unitsObj) => {
                    const entries = Object.entries(unitsObj || {}).filter(([_, count]) => count > 0);
                    if (entries.length === 0) return t.noTroops;

                    return entries
                        .map(([unit, count]) => `• \`${String(count).padStart(5, " ")}\`  ${t[unit]}`)
                        .join("\n");
                };

                const nativeUnits = typeof town.units === "function" ? town.units() : {};
                const supportUnits = typeof town.unitsSupport === "function" ? town.unitsSupport() : {};

                fields.push(
                    {
                        name: t.cityStatus,
                        value: statusLines,
                        inline: false
                    },
                    {
                        name: t.nativeTroops,
                        value: formatUnitsVertical(nativeUnits),
                        inline: true
                    },
                    {
                        name: t.supportTroops,
                        value: formatUnitsVertical(supportUnits),
                        inline: true
                    }
                );
            }
        }

        return {
            username: "Grepolis Sentry",
            content: PING_EVERYONE ? `@here ⚔️ **${t.ping}**` : `⚔️ **${t.ping}**`,
            embeds: [
                {
                    title: `🚨 **${t.title}** 🚨`,
                    description: t.description,
                    color: 16711680,
                    fields: fields,
                    footer: {
                        text: `${t.flag} ${t.footer} • World: ${worldId}`
                    },
                    timestamp: new Date().toISOString()
                }
            ]
        };
    }

    function filterOutIgnoredAlliances(oppPlayerInfo) {
        if (playerAllianceId == oppPlayerInfo.allianceId || IGNORED_ALLIANCES.includes(oppPlayerInfo.allianceName)) {
            console.log("Grepolis Discord Notifier: Attack ignored due to alliance restrictions.");
            return true;
        }
        return false;
    }

    async function getPlayerInfoFromPolisId(oppTownId, defPolisId) {
        return new Promise((resolve, reject) => {
            const params = {
                id: defPolisId,
                town_id: oppTownId,
                nl_init: true
            };

            uw.gpAjax.ajaxGet('town_info', 'info', params, false, function (response) {
                const rawHtml = response?.html || response;
                const doc = new DOMParser().parseFromString(rawHtml, 'text/html');

                const playerName = doc.querySelector('#info_tab_content')?.dataset.player_name 
                    || doc.querySelector('.gp_player_link')?.textContent.trim() 
                    || null;

                const allianceName = doc.querySelector('.gp_alliance_link')?.textContent.trim() 
                    || null;

                const allianceId = doc.querySelector('#info_tab_content')?.dataset.alliance
                    || null;

                // This returns the object out to your caller
                resolve({ playerName, allianceName, allianceId });
            }, function (error) {
                reject(error);
            });
        });
    }

    

    function sendDiscordAlert(payload) {
        const webhookUrl = getWebhookUrl();

        if (!webhookUrl || webhookUrl === "YOUR_WEBHOOK_URL_HERE") {
            console.warn("Grepolis Discord Notifier: Webhook URL not configured.");
            return;
        }

        request({
            method: "POST",
            url: webhookUrl,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify(payload),
            onload: (res) => console.log("Attack alert sent. Discord response:", res.status),
            onerror: (err) => console.error("Failed to send attack alert.", err)
        });
    }

    // =========================================================================
    // DIO-TOOLS SETTINGS INJECTION LOGIC
    // =========================================================================
    function injectSettings() {
        const $menu = uw.$(".settings-menu ul:last");
        if (!$menu.length || uw.$("#sentry_settings_link").length) return;

        // Add sidebar entry into settings list
        $menu.append(`
            <li id="sentry_li">
                <a id="sentry_settings_link" href="javascript:void(0);">
                    <span class="left"><span class="right"><span class="middle">⚡ Discord Sentry</span></span></span>
                </a>
            </li>
        `);

        // Hide Sentry panel if user clicks back to standard settings tabs
        uw.$(".settings-link, .settings-menu li:not(#sentry_li) a").on("click", function () {
            uw.$(".section").show();
            uw.$("#sentry_settings_container").hide();
        });

        // Open Sentry settings pane
        uw.$("#sentry_settings_link").on("click", async function () {
            uw.$(".settings-container .section").hide();
            uw.$(".settings-menu li a").removeClass("active");
            uw.$(this).addClass("active");

            // Fetch alliances immediately so the list is ready before typing
            await getAlliances();

            let $panel = uw.$("#sentry_settings_container");
            if (!$panel.length) {
                let tempIgnoredAlliances = Array.isArray(IGNORED_ALLIANCES) ? [...IGNORED_ALLIANCES] : [];

                $panel = uw.$(`
                    <div id="sentry_settings_container" class="player_settings section" style="display:none; padding:15px; overflow-y:auto; max-height:430px;">
                        <div class="game_header bold">⚡ Discord Sentry Settings</div>
                        
                        <div style="margin: 12px 0;">
                            <label style="font-weight:bold; display:block; margin-bottom:4px;">Mode:</label>
                            <label><input type="radio" name="sentry_mode" value="prod" ${!IS_DEV ? "checked" : ""}> Production</label>
                            <label style="margin-left:15px;"><input type="radio" name="sentry_mode" value="dev" ${IS_DEV ? "checked" : ""}> Development (Dev Webhook)</label>
                        </div>

                        <div style="margin: 12px 0;">
                            <label style="font-weight:bold; display:block; margin-bottom:4px;">Production Webhook URL:</label>
                            <input type="text" id="sentry_prod_inp" value="${PROD_WEBHOOK}" style="width:90%; padding:4px;" />
                        </div>

                        <div style="margin: 12px 0;">
                            <label style="font-weight:bold; display:block; margin-bottom:4px;">Development Webhook URL:</label>
                            <input type="text" id="sentry_dev_inp" value="${DEV_WEBHOOK}" style="width:90%; padding:4px;" />
                        </div>

                        <div style="margin: 12px 0;">
                            <label style="font-weight:bold; display:block; margin-bottom:4px;">Language:</label>
                            <select id="sentry_lang_sel" style="padding:3px;">
                                <option value="el" ${LANG === "el" ? "selected" : ""}>🇬🇷 Ελληνικά (Greek)</option>
                                <option value="en" ${LANG === "en" ? "selected" : ""}>🇬🇧 English</option>
                            </select>
                        </div>

                        <!-- Multi-Select Alliance Filter -->
                        <div style="margin: 12px 0; position:relative;">
                            <label style="font-weight:bold; display:block; margin-bottom:4px;">Filtered Alliances (Ignore Attacks):</label>
                            <div id="sentry_tags_container" style="display:flex; flex-wrap:wrap; gap:4px; padding:4px; border:1px solid #7f5f3f; background:#fff7e2; min-height:28px; border-radius:3px; margin-bottom:4px; align-items:center;"></div>
                            <input type="text" id="sentry_ally_search" placeholder="Type alliance name..." style="width:90%; padding:4px;" autocomplete="off" />
                            <ul id="sentry_ally_dropdown" style="display:none; position:absolute; left:0; width:90%; max-height:140px; overflow-y:auto; background:#fffbf0; border:1px solid #7f5f3f; z-index:99999; list-style:none; padding:0; margin:2px 0 0 0; box-shadow:0 3px 6px rgba(0,0,0,0.3);"></ul>
                        </div>

                        <div style="margin: 12px 0;">
                            <label style="font-weight:bold; display:block; margin-bottom:4px;">Embed Features:</label>
                            <label><input type="checkbox" id="sentry_det_chk" ${DETAILED ? "checked" : ""}> Detailed (Wall, God, Units)</label><br/>
                            <label><input type="checkbox" id="sentry_ping_chk" ${PING_EVERYONE ? "checked" : ""}> Ping @here</label>
                        </div>

                        <div style="margin-top: 15px;">
                            <div id="sentry_save_btn" class="button_new" style="display:inline-block; cursor:pointer;">
                                <div class="left"></div><div class="right"></div>
                                <div class="caption js-caption">Save Sentry Settings<div class="effect js-effect"></div></div>
                            </div>
                        </div>
                    </div>
                `);

                uw.$(".settings-container").append($panel);

                const $tagBox =$panel.find("#sentry_tags_container");
                const $searchInp =$panel.find("#sentry_ally_search");
                const $dropdown =$panel.find("#sentry_ally_dropdown");

                // Renders the selected alliance badges
                // Helper to safely get the name whether ally is a string or object
                const getAllyName = (a) => (typeof a === 'object' && a !== null ? a.name : a) || '';

                function renderTags() {
                    $tagBox.empty();
                    if (!tempIgnoredAlliances.length) {
                        $tagBox.html('<span style="color:#888; font-size:11px; padding:2px 4px;">None filtered</span>');
                        return;
                    }
                    tempIgnoredAlliances.forEach((ally, idx) => {
                        const displayName = getAllyName(ally);
                        const $tag = uw.$(`
                            <span style="background:#543d2b; color:#fc6; font-size:11px; font-weight:bold; padding:2px 6px; border-radius:3px; display:inline-flex; align-items:center; gap:4px;">
                                ${displayName}
                                <span data-idx="${idx}" style="cursor:pointer; color:#fff; font-weight:bold; margin-left:2px;">&times;</span>
                            </span>
                        `);
                        $tag.find("span").on("click", function () {
                            const index = uw.$(this).data("idx");
                            tempIgnoredAlliances.splice(index, 1);
                            renderTags();
                        });
                        $tagBox.append($tag);
                    });
                }
                renderTags();

                // Autocomplete typing logic
                $searchInp.on("input", function () {
                    const term = uw.$(this).val().trim().toLowerCase();$dropdown.empty();

                    if (!term) {
                        $dropdown.hide();
                        return;
                    }

                    const pool = ALLIANCE_CACHE || [];
                    const ignoredNames = tempIgnoredAlliances.map(getAllyName);

                    // FIX 2: Safe string lookup
                    const matches = pool.filter(ally => {
                        const name = getAllyName(ally);
                        return name.toLowerCase().includes(term) && !ignoredNames.includes(name);
                    });

                    if (!matches.length) {
                        $dropdown.html('<li style="padding:5px 8px; color:#888; font-size:11px;">No matching alliances</li>').show();
                        return;
                    }

                    matches.slice(0, 10).forEach(ally => {
                        const displayName = getAllyName(ally);
                        const $item = uw.$(`
                            <li style="padding:5px 8px; cursor:pointer; font-size:12px; border-bottom:1px solid #ebd7b2; color:#3b2413;">
                                ${displayName}
                            </li>
                        `);
                        $item.hover(
                            function () { uw.$(this).css("background", "#fc6"); },
                            function () { uw.$(this).css("background", "none"); }
                        );
                        $item.on("click", function () {
                            const name = getAllyName(ally);
                            if (!tempIgnoredAlliances.some(a => getAllyName(a) === name)) {
                                tempIgnoredAlliances.push(name);
                                renderTags();
                            }
                            $searchInp.val("");
                            $dropdown.hide();
                        });
                        $dropdown.append($item);
                    });

                    $dropdown.show();
                });

                // Close dropdown if clicking elsewhere
                uw.$(document).on("click", function (e) {
                    if (!uw.$(e.target).closest("#sentry_ally_search, #sentry_ally_dropdown").length) {
                        $dropdown.hide();
                    }
                });

                // Save settings
                $panel.find("#sentry_save_btn").on("click", function () {
                    IS_DEV = $panel.find("input[name='sentry_mode']:checked").val() === "dev";
                    PROD_WEBHOOK = $panel.find("#sentry_prod_inp").val().trim();
                    DEV_WEBHOOK = $panel.find("#sentry_dev_inp").val().trim();
                    LANG = $panel.find("#sentry_lang_sel").val();
                    DETAILED = $panel.find("#sentry_det_chk").is(":checked");
                    PING_EVERYONE = $panel.find("#sentry_ping_chk").is(":checked");
                    IGNORED_ALLIANCES = [...tempIgnoredAlliances];

                    saveVal("sentry_is_dev", IS_DEV);
                    saveVal("sentry_prod_wh", PROD_WEBHOOK);
                    saveVal("sentry_dev_wh", DEV_WEBHOOK);
                    saveVal("sentry_lang", LANG);
                    saveVal("sentry_detailed", DETAILED);
                    saveVal("sentry_ping", PING_EVERYONE);
                    saveVal("sentry_ignored_alliances", IGNORED_ALLIANCES);

                    if (uw.HumanMessage) {
                        uw.HumanMessage.success("Sentry settings saved!");
                    } else {
                        alert("Sentry settings saved!");
                    }
                });
            }

            $panel.show();
        });
    }

    // Start the script
    initNotifier();

})();