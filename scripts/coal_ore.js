/**
 * coal_ore.js - Custom script for Mindcraft bot (Dryzikhov)
 *
 * Alur kerja:
 *  1. Periksa apakah ada pickaxe di inventory.
 *  2. Jika tidak ada: kumpulkan kayu dengan tangan, buat crafting table,
 *     buat planks + sticks, lalu buat wooden_pickaxe.
 *  3. Equip pickaxe terbaik yang ada.
 *  4. Cari dan tambang coal_ore / deepslate_coal_ore sampai 10 biji.
 */

const WOOD_TYPES = [
    "oak_log", "birch_log", "spruce_log", "jungle_log",
    "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log"
];

const PICKAXES = [
    "netherite_pickaxe", "diamond_pickaxe", "iron_pickaxe",
    "golden_pickaxe", "stone_pickaxe", "wooden_pickaxe"
];

const COAL_BLOCKS = ["coal_ore", "deepslate_coal_ore"];

function getBestPickaxe(inv) {
    for (const p of PICKAXES) { if (inv[p] > 0) return p; }
    return null;
}

function getTotalLogs(inv) {
    return WOOD_TYPES.reduce((s, t) => s + (inv[t] || 0), 0);
}

function getTotalPlanks(inv) {
    return WOOD_TYPES.reduce((s, t) => s + (inv[t.replace("_log", "_planks")] || 0), 0);
}

function getPlankType(inv) {
    const l = WOOD_TYPES.find(t => inv[t] > 0);
    return l ? l.replace("_log", "_planks") : "oak_planks";
}

const HOSTILE_MOBS = new Set([
    "zombie", "skeleton", "creeper", "spider", "cave_spider",
    "enderman", "witch", "slime", "phantom", "drowned",
    "husk", "stray", "wither_skeleton", "piglin", "piglin_brute",

    "vindicator", "evoker", "pillager", "ravager", "blaze",
    "ghast", "magma_cube", "shulker", "vex", "warden", "bogged", "breeze"
]);

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

    // Periksa apakah ada crafting table atau bahan untuk membuatnya.
    // Jika tidak ada, jangan coba-coba craft untuk menghindari spam.
    const nbTable = world.getNearestBlock(bot, "crafting_table", 16);
    const hasTable = (inv["crafting_table"] || 0) > 0 || nbTable !== null;
    const canCraftTable = (getTotalPlanks(inv) + getTotalLogs(inv) * 4) >= 4;
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
            let planks = getTotalPlanks(inv);
            if (planks < 2 && getTotalLogs(inv) > 0) {
                const pType = getPlankType(inv);
                await skills.craftRecipe(bot, pType, 1);
                inv = world.getInventoryCounts(bot);
            }
            if (getTotalPlanks(inv) >= 2) {
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
    let planks = getTotalPlanks(inv);
    if (planks >= 2 || getTotalLogs(inv) > 0) {
        if (planks < 3 && getTotalLogs(inv) > 0) {
            const pType = getPlankType(inv);
            await skills.craftRecipe(bot, pType, 1);
            inv = world.getInventoryCounts(bot);
            planks = getTotalPlanks(inv);
        }
        if (sticks < 1 && planks >= 2) {
            await skills.craftRecipe(bot, "stick", 1);
            inv = world.getInventoryCounts(bot);
            sticks = inv["stick"] || 0;
            planks = getTotalPlanks(inv);
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

    // Periksa apakah ada crafting table atau bahan untuk membuatnya.
    const nbTable = world.getNearestBlock(bot, "crafting_table", 16);
    const hasTable = (inv["crafting_table"] || 0) > 0 || nbTable !== null;
    const canCraftTable = (getTotalPlanks(inv) + getTotalLogs(inv) * 4) >= 4;
    if (!hasTable && !canCraftTable) {
        return;
    }

    let iron = inv["iron_ingot"] || 0;
    let planks = getTotalPlanks(inv);
    let logs = getTotalLogs(inv);

    if (iron >= 1 && (planks >= 6 || (planks + logs * 4) >= 6)) {
        // Set cooldown segera setelah mencoba membuat tameng
        lastShieldCraftTime = Date.now();

        if (planks < 6) {
            const neededLogs = Math.ceil((6 - planks) / 4);
            const pType = getPlankType(inv);
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



async function ensurePickaxe(bot, skills, world, say) {
    let inv = world.getInventoryCounts(bot);
    let bestPick = getBestPickaxe(inv);

    if (!bestPick) {
        say("No pickaxe found. Starting crafting sequence...");

        // Hitung kebutuhan minimum logs
        const nearby      = world.getNearestBlock(bot, "crafting_table", 16);
        const hasTableNow = (inv["crafting_table"] || 0) > 0 || nearby !== null;
        const neededLogs  = hasTableNow ? 2 : 3;
        let logs          = getTotalLogs(inv);

        if (logs < neededLogs) {
            const toGet = neededLogs - logs;
            say(`Collecting ${toGet} log(s) by hand...`);
            let foundType = "oak_log";
            for (const t of WOOD_TYPES) {
                if (world.getNearestBlock(bot, t, 32)) { foundType = t; break; }
            }
            await skills.collectBlock(bot, foundType, toGet);
            inv = world.getInventoryCounts(bot);
        }

        // Sinkronisasi state real-time
        logs           = getTotalLogs(inv);
        let planks     = getTotalPlanks(inv);
        let sticks     = inv["stick"] || 0;
        let pType      = getPlankType(inv);
        const nbTable  = world.getNearestBlock(bot, "crafting_table", 16);
        let hasTable   = (inv["crafting_table"] || 0) > 0 || nbTable !== null;

        say(`Resources - logs:${logs} planks:${planks} sticks:${sticks} table:${hasTable}`);

        // Step 1: Crafting table
        if (!hasTable) {
            if (planks < 4 && logs > 0) {
                say("Converting log to planks (for crafting table)...");
                await skills.craftRecipe(bot, pType, 1);
                inv = world.getInventoryCounts(bot);
                logs = getTotalLogs(inv); planks = getTotalPlanks(inv);
            }
            if (planks >= 4) {
                say("Crafting crafting table...");
                await skills.craftRecipe(bot, "crafting_table", 1);
                inv = world.getInventoryCounts(bot);
                planks = getTotalPlanks(inv); hasTable = true;
            }
        }

        // Step 2: Sticks
        if (sticks < 2) {
            if (planks < 2 && logs > 0) {
                say("Converting log to planks (for sticks)...");
                pType = getPlankType(inv);
                await skills.craftRecipe(bot, pType, 1);
                inv = world.getInventoryCounts(bot);
                logs = getTotalLogs(inv); planks = getTotalPlanks(inv);
            }
            if (planks >= 2) {
                say("Crafting sticks...");
                await skills.craftRecipe(bot, "stick", 1);
                inv = world.getInventoryCounts(bot);
                planks = getTotalPlanks(inv); sticks = inv["stick"] || 0;
            }
        }

        // Step 3: Planks untuk kepala pickaxe (butuh 3)
        if (planks < 3 && logs > 0) {
            say("Converting log to planks (for pickaxe head)...");
            pType = getPlankType(inv);
            await skills.craftRecipe(bot, pType, 1);
            inv = world.getInventoryCounts(bot);
            planks = getTotalPlanks(inv);
        }

        // Step 4: Craft wooden pickaxe
        if (planks >= 3 && sticks >= 2 && hasTable) {
            say("Crafting wooden pickaxe...");
            await skills.craftRecipe(bot, "wooden_pickaxe", 1);
            inv = world.getInventoryCounts(bot);
            bestPick = getBestPickaxe(inv);
        }
    }

    return bestPick;
}

export default async function run(bot, skills, world, agent) {
    const say = (msg) => {
        const full = `[CoalMiner] ${msg}`;
        if (agent && typeof agent.openChat === "function") agent.openChat(full);
        else bot.chat(full);
        console.log(full);
    };

    lastSwordCraftTime = 0;
    lastShieldCraftTime = 0;

    const TARGET = 100;
    say("Starting coal mining routine...");

    // ── Pastikan ada pickaxe ─────────────────────────────
    let bestPick = await ensurePickaxe(bot, skills, world, say);
    if (bestPick) {
        say(`Equipping ${bestPick}...`);
        await skills.equip(bot, bestPick);
    } else {
        say("Warning: No pickaxe available. Mining may be slow or fail.");
    }

    // ── FASE 2: Tambang coal_ore sampai target ────────────────────
    let inv2 = world.getInventoryCounts(bot);
    let coal = inv2["coal"] || 0;
    say(`Coal in inventory: ${coal}/${TARGET}`);

    // Blacklist untuk menyimpan koordinat bijih batu bara yang tidak dapat dijangkau
    const blacklist = new Set();

    while (coal < TARGET) {
        if (bot.interrupt_code) {
            say("Interrupted. Stopping coal miner.");
            return;
        }

        // ── Pastikan memiliki pedang untuk pertahanan diri ──
        await ensureSword(bot, skills, world, say);

        // ── Pastikan memiliki shield untuk pertahanan diri ──
        await ensureShield(bot, skills, world, say);

        // ── Pastikan pickaxe ada dan di-equip ──
        bestPick = await ensurePickaxe(bot, skills, world, say);
        if (!bestPick) {
            say("Cannot mine: No valid pickaxe available. Retrying...");
            await new Promise(r => setTimeout(r, 3000));
            continue;
        }
        await skills.equip(bot, bestPick);

        // ── Combat Guard ──
        await combatGuard(bot, skills, world, say, bestPick);
        inv2 = world.getInventoryCounts(bot);
        coal = inv2["coal"] || 0;
        if (coal >= TARGET) break;

        // Cari coal_ore atau deepslate_coal_ore terdekat (membatasi radius ke 12 agar hanya mendeteksi yang dekat)
        let target  = null;
        let nearest = Infinity;
        const blocks = world.getNearestBlocks(bot, COAL_BLOCKS, 12, 32);
        
        for (const blk of blocks) {
            if (!blk || !blk.position) continue;
            const posKey = `${blk.position.x},${blk.position.y},${blk.position.z}`;
            if (blacklist.has(posKey)) continue;

            const d = bot.entity.position.distanceTo(blk.position);
            if (d < nearest) {
                nearest = d;
                target = blk;
            }
        }

        if (!target) {
            say("No reachable coal ore nearby. Moving to search wider area...");
            await skills.moveAway(bot, 20);
            inv2 = world.getInventoryCounts(bot);
            coal = inv2["coal"] || 0;
            continue;
        }

        say(`Mining ${target.name} at (${target.position.x}, ${target.position.y}, ${target.position.z})...`);
        
        const startPos = bot.entity.position.clone();
        const startCoal = coal;

        try {
            const collectPromise = skills.collectBlock(bot, target.name, 1);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Mining timeout (20s limit reached)")), 20000)
            );
            await Promise.race([collectPromise, timeoutPromise]);
        } catch (err) {
            say(`Mining failed or timeout: ${err.message || err}`);
            const posKey = `${target.position.x},${target.position.y},${target.position.z}`;
            blacklist.add(posKey);
            
            // Hentikan pathfinder pergerakan agar bot tidak jalan terus
            try { bot.pathfinder.stop(); } catch(e) {}
            
            await combatGuard(bot, skills, world, say, bestPick);
            inv2 = world.getInventoryCounts(bot);
            coal = inv2["coal"] || 0;
            continue;
        }

        inv2 = world.getInventoryCounts(bot);
        coal = inv2["coal"] || 0;
        const endPos = bot.entity.position;

        if (coal === startCoal && endPos.distanceTo(startPos) < 0.5) {
            // Gagal menambang dan posisi tidak berubah -> Masukkan ke blacklist
            const posKey = `${target.position.x},${target.position.y},${target.position.z}`;
            blacklist.add(posKey);
            console.log(`[DEBUG MINING] Blacklisted unreachable block: ${target.name} at ${target.position}`);
            
            await recoverFromStuck(bot, skills, say);
            inv2 = world.getInventoryCounts(bot);
            coal = inv2["coal"] || 0;
            continue;
        }

        say(`Progress: ${coal}/${TARGET}`);
    }

    say("Goal reached! 10 coal collected successfully.");
}
