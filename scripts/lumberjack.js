/**
 * Lumberjack script for Mindcraft.
 * This script runs completely without LLM involvement once triggered.
 * It:
 *  1. Checks for an axe.
 *  2. If no axe is present, gathers wood by hand, crafts a crafting table, crafts sticks/planks, and crafts a wooden axe.
 *  3. Equips the best axe available.
 *  4. Harvests any nearby wood logs until the goal is met.
 *  5. Handles monster attacks by fighting back before resuming task.
 */

const WOOD_TYPES = [
    "oak_log", "birch_log", "spruce_log", "jungle_log", 
    "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log"
];

const AXES = [
    "netherite_axe", "diamond_axe", "iron_axe", "golden_axe", "stone_axe", "wooden_axe"
];

// Hostile mobs that can attack the player
const HOSTILE_MOBS = [
    "zombie", "skeleton", "creeper", "spider", "cave_spider", 
    "enderman", "witch", "slime", "phantom", "drowned", 
    "husk", "stray", "wither_skeleton", "piglin", "piglin_brute",
    "vindicator", "evoker", "pillager", "ravager", "blaze", "ghast",
    "magma_cube", "shulker", "vex", "warden"
];

function getBestAxe(inventory) {
    for (const axe of AXES) {
        if (inventory[axe] > 0) return axe;
    }
    return null;
}

function getTotalLogs(inventory) {
    let count = 0;
    for (const type of WOOD_TYPES) {
        count += inventory[type] || 0;
    }
    return count;
}

/**
 * combatGuard — Cek mob hostile di sekitar dan lawan sampai mati.
 * Kemudian equip kembali alat kerja sebelumnya.
 * Returns true jika ada monster yang dilawan.
 */
let lastSwordCraftTime = 0;
let lastShieldCraftTime = 0;

async function ensureSword(bot, skills, world, say) {
    if (Date.now() - lastSwordCraftTime < 15000) return null;

    let inv = world.getInventoryCounts(bot);
    const WEAPONS = [
        "netherite_sword", "netherite_axe",
        "diamond_sword", "diamond_axe",
        "iron_sword", "iron_axe",
        "stone_sword", "stone_axe",
        "wooden_sword", "wooden_axe",
        "golden_sword", "golden_axe"
    ];
    const currentWeapon = WEAPONS.find(w => inv[w] > 0);
    if (currentWeapon) return currentWeapon;

    const getLogs = (i) => WOOD_TYPES.reduce((s, t) => s + (i[t] || 0), 0);
    const getPlanks = (i) => WOOD_TYPES.reduce((s, t) => s + (i[t.replace("_log", "_planks")] || 0), 0);
    const getPType = (i) => {
        const l = WOOD_TYPES.find(t => i[t] > 0);
        return l ? l.replace("_log", "_planks") : "oak_planks";
    };

    // Periksa apakah ada crafting table atau bahan untuk membuatnya.
    const nbTable = world.getNearestBlock(bot, "crafting_table", 16);
    const hasTable = (inv["crafting_table"] || 0) > 0 || nbTable !== null;
    const canCraftTable = (getPlanks(inv) + getLogs(inv) * 4) >= 4;
    if (!hasTable && !canCraftTable) {
        return null;
    }

    // Set cooldown segera setelah mencoba membuat pedang
    lastSwordCraftTime = Date.now();

    let sticks = inv["stick"] || 0;
    
    // 1. Coba craft stone_sword
    let cobble = (inv["cobblestone"] || 0) + (inv["stone"] || 0);
    if (cobble >= 2) {
        if (sticks < 1) {
            let planks = getPlanks(inv);
            if (planks < 2 && getLogs(inv) > 0) {
                const pType = getPType(inv);
                await skills.craftRecipe(bot, pType, 1);
                inv = world.getInventoryCounts(bot);
            }
            if (getPlanks(inv) >= 2) {
                await skills.craftRecipe(bot, "stick", 1);
                inv = world.getInventoryCounts(bot);
                sticks = inv["stick"] || 0;
            }
        }
        if (sticks >= 1) {
            say("Crafting stone sword for protection...");
            const success = await skills.craftRecipe(bot, "stone_sword", 1);
            if (success) return "stone_sword";
        }
    }

    // 2. Coba craft wooden_sword
    let planks = getPlanks(inv);
    if (planks >= 2 || getLogs(inv) > 0) {
        if (planks < 3 && getLogs(inv) > 0) {
            const pType = getPType(inv);
            await skills.craftRecipe(bot, pType, 1);
            inv = world.getInventoryCounts(bot);
            planks = getPlanks(inv);
        }
        if (sticks < 1 && planks >= 2) {
            await skills.craftRecipe(bot, "stick", 1);
            inv = world.getInventoryCounts(bot);
            sticks = inv["stick"] || 0;
            planks = getPlanks(inv);
        }
        if (planks >= 2 && sticks >= 1) {
            say("Crafting wooden sword for protection...");
            const success = await skills.craftRecipe(bot, "wooden_sword", 1);
            if (success) return "wooden_sword";
        }
    }

    return null;
}

async function ensureShield(bot, skills, world, say) {
    if (Date.now() - lastShieldCraftTime < 15000) return;

    let inv = world.getInventoryCounts(bot);
    if ((inv["shield"] || 0) > 0) {
        // Pastikan terpasang di off-hand
        const shieldItem = bot.inventory.items().find(i => i.name === 'shield');
        const offhandItem = bot.inventory.slots[45]; // slot off-hand
        if (shieldItem && (!offhandItem || offhandItem.name !== 'shield')) {
            try {
                await bot.equip(shieldItem, 'off-hand');
            } catch (err) {
                console.error(`Failed to equip shield to off-hand:`, err);
            }
        }
        return;
    }

    const getLogs = (i) => WOOD_TYPES.reduce((s, t) => s + (i[t] || 0), 0);
    const getPlanks = (i) => WOOD_TYPES.reduce((s, t) => s + (i[t.replace("_log", "_planks")] || 0), 0);
    const getPType = (i) => {
        const l = WOOD_TYPES.find(t => i[t] > 0);
        return l ? l.replace("_log", "_planks") : "oak_planks";
    };

    // Periksa apakah ada crafting table atau bahan untuk membuatnya.
    const nbTable = world.getNearestBlock(bot, "crafting_table", 16);
    const hasTable = (inv["crafting_table"] || 0) > 0 || nbTable !== null;
    const canCraftTable = (getPlanks(inv) + getLogs(inv) * 4) >= 4;
    if (!hasTable && !canCraftTable) {
        return;
    }

    let iron = inv["iron_ingot"] || 0;
    let planks = getPlanks(inv);
    let logs = getLogs(inv);

    if (iron >= 1 && (planks >= 6 || (planks + logs * 4) >= 6)) {
        // Set cooldown segera setelah mencoba membuat tameng
        lastShieldCraftTime = Date.now();

        if (planks < 6) {
            const neededLogs = Math.ceil((6 - planks) / 4);
            const pType = getPType(inv);
            await skills.craftRecipe(bot, pType, neededLogs);
            inv = world.getInventoryCounts(bot);
        }
        say("Crafting shield for protection...");
        const success = await skills.craftRecipe(bot, "shield", 1);
        if (success) {
            inv = world.getInventoryCounts(bot);
            const shieldItem = bot.inventory.items().find(i => i.name === 'shield');
            if (shieldItem) {
                try {
                    await bot.equip(shieldItem, 'off-hand');
                    say("Equipped shield to off-hand.");
                } catch (err) {
                    console.error(`Failed to equip newly crafted shield:`, err);
                }
            }
        }
    }
}

// Riwayat posisi yang dikunjungi untuk mencegah bot mondar-mandir di area yang sama
const exploreHistory = [];

async function exploreNewArea(bot, skills, world, say, distance = 15) {
    const currentPos = bot.entity.position.clone();
    
    exploreHistory.push({ x: currentPos.x, y: currentPos.y, z: currentPos.z });
    if (exploreHistory.length > 5) {
        exploreHistory.shift();
    }

    let bestTarget = null;
    let maxMinDist = -1;

    for (let i = 0; i < 12; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dx = Math.cos(angle) * distance;
        const dz = Math.sin(angle) * distance;
        
        const targetX = Math.floor(currentPos.x + dx);
        const targetZ = Math.floor(currentPos.z + dz);
        const targetY = Math.floor(currentPos.y);
        
        let minDist = Infinity;
        for (const vPos of exploreHistory) {
            const d = Math.sqrt(Math.pow(targetX - vPos.x, 2) + Math.pow(targetZ - vPos.z, 2));
            if (d < minDist) {
                minDist = d;
            }
        }

        if (minDist > maxMinDist) {
            maxMinDist = minDist;
            bestTarget = { x: targetX, y: targetY, z: targetZ };
        }
    }

    if (bestTarget) {
        console.log(`[DEBUG EXPLORE] Heading to new area: (${bestTarget.x}, ${bestTarget.y}, ${bestTarget.z}) (dist to history: ${Math.round(maxMinDist)}m)`);
        
        try { bot.pathfinder.stop(); } catch(e) {}
        
        try {
            const goPromise = skills.goToPosition(bot, bestTarget.x, bestTarget.y, bestTarget.z, 4);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Exploration pathfinding timeout")), 12000)
            );
            await Promise.race([goPromise, timeoutPromise]);
        } catch (err) {
            console.log(`[DEBUG EXPLORE] Navigation to explore target finished or timed out: ${err.message || err}`);
            try { bot.pathfinder.stop(); } catch(e) {}
        }
    } else {
        await skills.moveAway(bot, distance);
    }
}

async function combatGuard(bot, skills, world, say, toolToReequip) {
    console.log(`[DEBUG COMBAT] Running combat check. Bot Health: ${bot.health}/20. Position: ${bot.entity.position}`);
    const HOSTILE_SET = new Set(HOSTILE_MOBS);

    const monsters = Object.values(bot.entities).filter(e => {
        if (!e || !e.name || !e.position) return false;
        const isMobType = e.type === 'mob' || e.type === 'hostile' || e.type === 'monster';
        const isNotGolem = e.name !== 'iron_golem' && e.name !== 'snow_golem';
        const distance = bot.entity.position.distanceTo(e.position);
        return isMobType && isNotGolem && HOSTILE_SET.has(e.name) && distance < 16;
    });

    if (monsters.length === 0) {
        console.log(`[DEBUG COMBAT] No hostile mobs detected in 16 blocks radius.`);
        return false;
    }

    console.log(`[DEBUG COMBAT] Hostile mobs detected:`, monsters.map(m => `${m.name} (dist: ${Math.round(bot.entity.position.distanceTo(m.position))}m)`));

    monsters.sort((a, b) =>
        bot.entity.position.distanceTo(a.position) -
        bot.entity.position.distanceTo(b.position)
    );

    say(`⚔️ ${monsters.length} monster(s) nearby! Pausing task to fight...`);

    const WEAPONS = [
        "netherite_sword", "netherite_axe",
        "diamond_sword", "diamond_axe",
        "iron_sword", "iron_axe",
        "stone_sword", "stone_axe",
        "wooden_sword", "wooden_axe",
        "golden_sword", "golden_axe"
    ];
    let inv = world.getInventoryCounts(bot);
    let weapon = WEAPONS.find(w => inv[w] > 0);
    
    if (!weapon) {
        // Coba buat pedang secara dinamis
        weapon = await ensureSword(bot, skills, world, say);
        inv = world.getInventoryCounts(bot);
    }

    if (weapon) { 
        console.log(`[DEBUG COMBAT] Found/Crafted weapon: ${weapon}. Attempting to equip...`);
        await skills.equip(bot, weapon); 
        say(`Equipped ${weapon}.`); 
    } else { 
        console.log(`[DEBUG COMBAT] No weapon found in inventory. Fighting with current item/fists.`);
        say("No weapon. Fighting with current tool!"); 
    }

    // Equip shield to off-hand if available
    if (inv["shield"] > 0) {
        console.log(`[DEBUG COMBAT] Found shield in inventory. Equipping to off-hand...`);
        try {
            const shieldItem = bot.inventory.items().find(i => i.name === 'shield');
            if (shieldItem) await bot.equip(shieldItem, 'off-hand');
        } catch (shieldErr) {
            console.error(`[DEBUG COMBAT ERROR] Failed to equip shield:`, shieldErr);
        }
    }

    for (const mob of monsters) {
        if (bot.interrupt_code) {
            console.log(`[DEBUG COMBAT] Combat interrupted by bot interrupt_code.`);
            break;
        }
        if (!mob.isValid) {
            console.log(`[DEBUG COMBAT] Mob is no longer valid, skipping.`);
            continue;
        }

        // Heal checking during fight
        if (bot.health < 12) {
            console.log(`[DEBUG COMBAT] Health is low (${bot.health}/20). Forcing autoEat eat()...`);
            if (bot.autoEat && typeof bot.autoEat.eat === 'function') {
                try {
                    await bot.autoEat.eat();
                    console.log(`[DEBUG COMBAT] Forced autoEat completed. Health: ${bot.health}`);
                } catch (eatErr) {
                    console.warn(`[DEBUG COMBAT] Forced autoEat failed:`, eatErr);
                }
            }
        }
        
        console.log(`[DEBUG COMBAT] Attacking entity: ${mob.name} (ID: ${mob.id}) at pos ${mob.position}`);
        say(`⚔️ Fighting ${mob.name}...`);
        
        try { 
            await skills.attackEntity(bot, mob); 
            console.log(`[DEBUG COMBAT] Defeated ${mob.name} successfully.`);
            say(`✅ Defeated ${mob.name}!`); 
        } catch (e) { 
            console.error(`[DEBUG COMBAT ERROR] Failed to attack ${mob.name}:`, e);
            say(`Combat: ${e.message}`); 
        }
    }

    if (bot.health < 10) {
        console.log(`[DEBUG COMBAT] Health is low (${bot.health}/20). Resting for 3 seconds...`);
        say(`Health ${bot.health.toFixed(1)}/20. Resting...`);
        await new Promise(r => setTimeout(r, 3000));
    }

    if (toolToReequip) { 
        console.log(`[DEBUG COMBAT] Re-equipping previous tool: ${toolToReequip}`);
        try { await skills.equip(bot, toolToReequip); } catch (e) {
            console.error(`[DEBUG COMBAT ERROR] Failed to re-equip tool ${toolToReequip}:`, e);
        } 
    }
    console.log(`[DEBUG COMBAT] Combat loop finished. Returning to task.`);
    say("⚔️ Combat over. Resuming task...");
    return true;
}

async function recoverFromStuck(bot, skills, say) {
    console.warn(`[DEBUG STUCK] recoverFromStuck triggered. Bot position: ${bot.entity.position}`);
    say("🔴 I'm Stuck!");
    
    console.log(`[DEBUG STUCK] Clearing control states.`);
    bot.clearControlStates();
    
    console.log(`[DEBUG STUCK] Executing recovery jump.`);
    bot.setControlState('jump', true);
    await new Promise(r => setTimeout(r, 250));
    bot.setControlState('jump', false);
    
    try {
        console.log(`[DEBUG STUCK] Attempting to moveAway (3 blocks)...`);
        await skills.moveAway(bot, 3);
        console.log(`[DEBUG STUCK] moveAway completed. Bot position now: ${bot.entity.position}`);
    } catch (e) {
        console.warn(`[DEBUG STUCK ERROR] moveAway failed, executing manual backward movement:`, e);
        bot.setControlState('back', true);
        await new Promise(r => setTimeout(r, 500));
        bot.setControlState('back', false);
        console.log(`[DEBUG STUCK] Manual backward movement completed. Bot position: ${bot.entity.position}`);
    }
    say("🟢 I'm Free!");
}




export default async function run(bot, skills, world, agent) {
    const say = (msg) => {
        if (agent && typeof agent.openChat === 'function') {
            agent.openChat(`[Lumberjack] ${msg}`);
        } else {
            bot.chat(`[Lumberjack] ${msg}`);
        }
async function ensureAxe(bot, skills, world, say) {
    let inventory = world.getInventoryCounts(bot);
    let bestAxe = getBestAxe(inventory);

    if (!bestAxe) {
        say("No axe detected. Initiating craft sequence.");

        let craftingTable = world.getNearestBlock(bot, 'crafting_table', 16);
        let hasCraftingTable = inventory['crafting_table'] > 0 || craftingTable !== null;

        let neededLogs = hasCraftingTable ? 2 : 3;
        let logs = getTotalLogs(inventory);

        if (logs < neededLogs) {
            let logsToCollect = neededLogs - logs;
            say(`Collecting ${logsToCollect} logs by hand to craft tools...`);
            let logType = "oak_log";
            for (const t of WOOD_TYPES) {
                if (world.getNearestBlock(bot, t, 32)) { logType = t; break; }
            }
            await skills.collectBlock(bot, logType, logsToCollect);
            inventory = world.getInventoryCounts(bot);
            logs = getTotalLogs(inventory);
        }

        let planks = 0;
        for (const type of WOOD_TYPES) {
            planks += inventory[type.replace("_log", "_planks")] || 0;
        }

        let activePlankType = "oak_planks";
        for (const type of WOOD_TYPES) {
            if (inventory[type] > 0) {
                activePlankType = type.replace("_log", "_planks");
                break;
            }
        }

        const nbTable = world.getNearestBlock(bot, 'crafting_table', 16);
        let hasTable = inventory['crafting_table'] > 0 || nbTable !== null;

        // Step 1: Crafting table
        if (!hasTable) {
            if (planks < 4 && logs > 0) {
                say("Converting logs to planks for crafting table...");
                await skills.craftRecipe(bot, activePlankType, 1);
                inventory = world.getInventoryCounts(bot);
                logs = getTotalLogs(inventory);
                planks = 0;
                for (const type of WOOD_TYPES) {
                    planks += inventory[type.replace("_log", "_planks")] || 0;
                }
            }
            if (planks >= 4) {
                say("Crafting crafting table...");
                await skills.craftRecipe(bot, "crafting_table", 1);
                inventory = world.getInventoryCounts(bot);
                hasTable = true;
                planks = 0;
                for (const type of WOOD_TYPES) {
                    planks += inventory[type.replace("_log", "_planks")] || 0;
                }
            }
        }

        // Step 2: Sticks (needs 2 sticks)
        let sticks = inventory['stick'] || 0;
        if (sticks < 2) {
            if (planks < 2 && logs > 0) {
                say("Converting logs to planks for sticks...");
                await skills.craftRecipe(bot, activePlankType, 1);
                inventory = world.getInventoryCounts(bot);
                logs = getTotalLogs(inventory);
                planks = 0;
                for (const type of WOOD_TYPES) {
                    planks += inventory[type.replace("_log", "_planks")] || 0;
                }
            }
            if (planks >= 2) {
                say("Crafting sticks...");
                await skills.craftRecipe(bot, "stick", 1);
                inventory = world.getInventoryCounts(bot);
                sticks = inventory['stick'] || 0;
            }
        }

        // Step 3: Make planks for the axe (needs 3 planks)
        if (planks < 3 && logs > 0) {
            say(`Converting 1 log to planks for axe...`);
            await skills.craftRecipe(bot, activePlankType, 1);
            inventory = world.getInventoryCounts(bot);
            planks = 0;
            for (const type of WOOD_TYPES) {
                planks += inventory[type.replace("_log", "_planks")] || 0;
            }
        }

        // Step 4: Craft wooden axe
        if (planks >= 3 && sticks >= 2 && hasTable) {
            say("Crafting wooden axe...");
            await skills.craftRecipe(bot, "wooden_axe", 1);
            inventory = world.getInventoryCounts(bot);
            bestAxe = getBestAxe(inventory);
        }
    }

    return bestAxe;
}

export default async function run(bot, skills, world, agent) {
    const say = (msg) => {
        const full = `[Lumberjack] ${msg}`;
        if (agent && typeof agent.openChat === "function") agent.openChat(full);
        else bot.chat(full);
        console.log(full);
    };

    lastSwordCraftTime = 0;
    lastShieldCraftTime = 0;

    say("Starting lumberjack routine...");

    // Goal count: 50 wood logs of any type
    const targetGoal = 50;
    
    // ── Pastikan ada axe ─────────────────────────────
    let bestAxe = await ensureAxe(bot, skills, world, say);
    if (bestAxe) {
        say(`Equipping axe: ${bestAxe}`);
        await skills.equip(bot, bestAxe);
    } else {
        say("Failed to craft or find an axe. Gathering logs by hand.");
    }

    // 4. Harvest logs until goal is met
    let inventory = world.getInventoryCounts(bot);
    let currentLogs = getTotalLogs(inventory);
    say(`Current logs in inventory: ${currentLogs}/${targetGoal}`);

    // Blacklist untuk menyimpan koordinat kayu yang tidak dapat dijangkau
    const blacklist = new Set();

    while (currentLogs < targetGoal) {
        if (bot.interrupt_code) {
            say("Interrupt signal received. Stopping lumberjack.");
            return;
        }

        // ── Pastikan memiliki pedang untuk pertahanan diri ──
        await ensureSword(bot, skills, world, say);

        // ── Pastikan memiliki shield untuk pertahanan diri ──
        await ensureShield(bot, skills, world, say);

        // ── Pastikan ada axe dan di-equip ──
        bestAxe = await ensureAxe(bot, skills, world, say);
        if (bestAxe) {
            await skills.equip(bot, bestAxe);
        } else {
            say("Warning: No axe available. Harvesting logs by hand.");
        }

        // ── Combat Guard: lawan monster sebelum lanjut tebang ──
        await combatGuard(bot, skills, world, say, bestAxe);
        inventory = world.getInventoryCounts(bot);
        currentLogs = getTotalLogs(inventory);
        if (currentLogs >= targetGoal) break;

        // Find nearest log block (membatasi radius ke 16 agar mendeteksi pohon terdekat)
        let targetLogBlock = null;
        let shortestDist = Infinity;
        const blocks = world.getNearestBlocks(bot, WOOD_TYPES, 16, 32);
        
        for (const blk of blocks) {
            if (!blk || !blk.position) continue;
            const posKey = `${blk.position.x},${blk.position.y},${blk.position.z}`;
            if (blacklist.has(posKey)) continue;

            const d = bot.entity.position.distanceTo(blk.position);
            if (d < shortestDist) {
                shortestDist = d;
                targetLogBlock = blk;
            }
        }

        if (!targetLogBlock) {
            say("No reachable logs found nearby. Searching wider area...");
            await exploreNewArea(bot, skills, world, say, 16);
            inventory = world.getInventoryCounts(bot);
            currentLogs = getTotalLogs(inventory);
            continue;
        }

        say(`Heading to tree at ${targetLogBlock.position.x}, ${targetLogBlock.position.y}, ${targetLogBlock.position.z}...`);
        
        const startPos = bot.entity.position.clone();
        const startLogs = currentLogs;

        try {
            const collectPromise = skills.collectBlock(bot, targetLogBlock.name, 1);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Logging timeout (20s limit reached)")), 20000)
            );
            await Promise.race([collectPromise, timeoutPromise]);
        } catch (err) {
            say(`Collection failed or timeout: ${err.message || err}`);
            const posKey = `${targetLogBlock.position.x},${targetLogBlock.position.y},${targetLogBlock.position.z}`;
            blacklist.add(posKey);
            
            // Hentikan pathfinder pergerakan agar bot tidak jalan terus
            try { bot.pathfinder.stop(); } catch(e) {}
            
            await combatGuard(bot, skills, world, say, bestAxe);
            inventory = world.getInventoryCounts(bot);
            currentLogs = getTotalLogs(inventory);
            continue;
        }
        
        inventory = world.getInventoryCounts(bot);
        currentLogs = getTotalLogs(inventory);
        const endPos = bot.entity.position;

        if (currentLogs === startLogs && endPos.distanceTo(startPos) < 0.5) {
            // Gagal menebang dan posisi tidak berubah -> Masukkan ke blacklist
            const posKey = `${targetLogBlock.position.x},${targetLogBlock.position.y},${targetLogBlock.position.z}`;
            blacklist.add(posKey);
            console.log(`[DEBUG LOGGING] Blacklisted unreachable block: ${targetLogBlock.name} at ${targetLogBlock.position}`);

            await recoverFromStuck(bot, skills, say);
            inventory = world.getInventoryCounts(bot);
            currentLogs = getTotalLogs(inventory);
            continue;
        }

        say(`Progress: ${currentLogs}/${targetGoal}`);
    }

    say("Goal achieved! Lumberjack routine completed successfully.");
}
