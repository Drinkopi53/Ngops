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

async function combatGuard(bot, skills, world, say, toolToReequip) {
    console.log(`[DEBUG COMBAT] Running combat check. Bot Health: ${bot.health}/20. Position: ${bot.entity.position}`);
    const HOSTILE_SET = new Set(HOSTILE_MOBS);

    const monsters = Object.values(bot.entities).filter(e =>
        e.type === 'mob' && e.isValid &&
        HOSTILE_SET.has(e.name) &&
        bot.entity.position.distanceTo(e.position) < 16
    );

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

    const WEAPONS = ["netherite_sword", "diamond_sword", "iron_sword",
                     "golden_sword", "stone_sword", "wooden_sword"];
    const inv = world.getInventoryCounts(bot);
    const weapon = WEAPONS.find(w => inv[w] > 0);
    if (weapon) { 
        console.log(`[DEBUG COMBAT] Found sword: ${weapon}. Attempting to equip...`);
        await skills.equip(bot, weapon); 
        say(`Equipped ${weapon}.`); 
    } else { 
        console.log(`[DEBUG COMBAT] No sword found in inventory. Fighting with current item/fists.`);
        say("No sword. Fighting with current tool!"); 
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
        const full = `[CoalMiner] ${msg}`;
        if (agent && typeof agent.openChat === "function") agent.openChat(full);
        else bot.chat(full);
        console.log(full);
    };

    const TARGET = 10;
    say("Starting coal mining routine...");

    // ── FASE 1: Pastikan ada pickaxe ─────────────────────────────
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

    while (coal < TARGET) {
        if (bot.interrupt_code) {
            say("Interrupted. Stopping coal miner.");
            return;
        }

        // ── Combat Guard ──
        await combatGuard(bot, skills, world, say, bestPick);
        inv2 = world.getInventoryCounts(bot);
        coal = inv2["coal"] || 0;
        if (coal >= TARGET) break;

        // Cari coal_ore atau deepslate_coal_ore terdekat
        let target  = null;
        let nearest = Infinity;
        for (const name of COAL_BLOCKS) {
            const blk = world.getNearestBlock(bot, name, 64);
            if (blk) {
                const d = bot.entity.position.distanceTo(blk.position);
                if (d < nearest) { nearest = d; target = blk; }
            }
        }

        if (!target) {
            say("No coal ore nearby. Moving to search wider area...");
            await skills.moveAway(bot, 20);
            inv2 = world.getInventoryCounts(bot);
            coal = inv2["coal"] || 0;
            continue;
        }

        say(`Mining ${target.name} at (${target.position.x}, ${target.position.y}, ${target.position.z})...`);
        
        const startPos = bot.entity.position.clone();
        const startCoal = coal;

        try {
            await skills.collectBlock(bot, target.name, 1);
        } catch (err) {
            say(`Mining failed: ${err.message || err}`);
            await combatGuard(bot, skills, world, say, bestPick);
            await recoverFromStuck(bot, skills, say);
            inv2 = world.getInventoryCounts(bot);
            coal = inv2["coal"] || 0;
            continue;
        }

        inv2 = world.getInventoryCounts(bot);
        coal = inv2["coal"] || 0;
        const endPos = bot.entity.position;

        if (coal === startCoal && endPos.distanceTo(startPos) < 0.5) {
            await recoverFromStuck(bot, skills, say);
            inv2 = world.getInventoryCounts(bot);
            coal = inv2["coal"] || 0;
            continue;
        }

        say(`Progress: ${coal}/${TARGET}`);
    }

    say("Goal reached! 10 coal collected successfully.");
}
