/**
 * iron_ore.js - Custom script for Mindcraft bot (Dryzikhov)
 *
 * Alur kerja:
 *  1. Periksa apakah ada pickaxe di inventory (stone+ lebih efisien).
 *  2. Jika tidak ada: kumpulkan kayu -> buat crafting table -> buat
 *     wooden_pickaxe. Jika punya cobblestone, upgrade ke stone_pickaxe.
 *  3. Equip pickaxe terbaik yang ada.
 *  4. Tambang iron_ore / deepslate_iron_ore sampai 10 raw_iron.
 *  5. Smelt raw_iron menjadi iron_ingot jika ada furnace di sekitar
 *     (atau bot bisa menaruh furnace dari inventory).
 */

const WOOD_TYPES = [
    "oak_log", "birch_log", "spruce_log", "jungle_log",
    "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log"
];

const PICKAXES = [
    "netherite_pickaxe", "diamond_pickaxe", "iron_pickaxe",
    "golden_pickaxe", "stone_pickaxe", "wooden_pickaxe"
];

const IRON_BLOCKS = ["iron_ore", "deepslate_iron_ore"];

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
    const VALID = ["netherite_pickaxe", "diamond_pickaxe", "iron_pickaxe", "stone_pickaxe"];
    let bestPick = VALID.find(p => inv[p] > 0);
    
    if (bestPick) {
        return bestPick;
    }

    say("No valid stone+ pickaxe found. Repairing/crafting sequence...");

    // Check if we have a wooden pickaxe to mine stone
    let woodenPick = inv["wooden_pickaxe"] > 0 ? "wooden_pickaxe" : null;
    if (!woodenPick) {
        say("No pickaxe at all. Crafting wooden pickaxe first...");

        const nearby = world.getNearestBlock(bot, "crafting_table", 16);
        const hasTableNow = (inv["crafting_table"] || 0) > 0 || nearby !== null;
        const neededLogs = hasTableNow ? 2 : 3;
        let logs = getTotalLogs(inv);

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

        // Step 1: Crafting table
        if (!hasTable) {
            if (planks < 4 && logs > 0) {
                await skills.craftRecipe(bot, pType, 1);
                inv = world.getInventoryCounts(bot);
                logs = getTotalLogs(inv); planks = getTotalPlanks(inv);
            }
            if (planks >= 4) {
                await skills.craftRecipe(bot, "crafting_table", 1);
                inv = world.getInventoryCounts(bot);
                planks = getTotalPlanks(inv); hasTable = true;
            }
        }

        // Step 2: Sticks
        if (sticks < 2) {
            if (planks < 2 && logs > 0) {
                pType = getPlankType(inv);
                await skills.craftRecipe(bot, pType, 1);
                inv = world.getInventoryCounts(bot);
                logs = getTotalLogs(inv); planks = getTotalPlanks(inv);
            }
            if (planks >= 2) {
                await skills.craftRecipe(bot, "stick", 1);
                inv = world.getInventoryCounts(bot);
                planks = getTotalPlanks(inv); sticks = inv["stick"] || 0;
            }
        }

        // Step 3: Planks
        if (planks < 3 && logs > 0) {
            pType = getPlankType(inv);
            await skills.craftRecipe(bot, pType, 1);
            inv = world.getInventoryCounts(bot);
            planks = getTotalPlanks(inv);
        }

        // Step 4: Craft wooden pickaxe
        if (planks >= 3 && sticks >= 2 && hasTable) {
            await skills.craftRecipe(bot, "wooden_pickaxe", 1);
            inv = world.getInventoryCounts(bot);
            woodenPick = inv["wooden_pickaxe"] > 0 ? "wooden_pickaxe" : null;
        }
    }

    if (!woodenPick) {
        say("Failed to prepare wooden pickaxe.");
        return null;
    }

    // Now we have a wooden pickaxe, check cobblestone to craft a stone pickaxe
    let cobble = (inv["cobblestone"] || 0) + (inv["stone"] || 0);
    if (cobble < 3) {
        say("Mining 3 stone blocks to upgrade to stone pickaxe...");
        await skills.equip(bot, woodenPick);
        await skills.collectBlock(bot, "stone", 3);
        inv = world.getInventoryCounts(bot);
        cobble = (inv["cobblestone"] || 0) + (inv["stone"] || 0);
    }

    let sticks = inv["stick"] || 0;
    if (sticks < 2) {
        let planks = getTotalPlanks(inv);
        if (planks < 2 && getTotalLogs(inv) > 0) {
            const pType = getPlankType(inv);
            await skills.craftRecipe(bot, pType, 1);
            inv = world.getInventoryCounts(bot);
            planks = getTotalPlanks(inv);
        }
        if (planks >= 2) {
            await skills.craftRecipe(bot, "stick", 1);
            inv = world.getInventoryCounts(bot);
            sticks = inv["stick"] || 0;
        }
    }

    if (cobble >= 3 && sticks >= 2) {
        say("Upgrading to stone pickaxe...");
        await skills.craftRecipe(bot, "stone_pickaxe", 1);
        inv = world.getInventoryCounts(bot);
        bestPick = VALID.find(p => inv[p] > 0);
    }

    return bestPick;
}

export default async function run(bot, skills, world, agent) {
    const say = (msg) => {
        const full = `[IronMiner] ${msg}`;
        if (agent && typeof agent.openChat === "function") agent.openChat(full);
        else bot.chat(full);
        console.log(full);
    };

    const TARGET_RAW_IRON = 100;
    say("Starting iron mining routine...");

    // ── Pastikan ada pickaxe ─────────────────────────────
    let bestPick = await ensurePickaxe(bot, skills, world, say);
    if (bestPick) {
        say(`Equipping ${bestPick}...`);
        await skills.equip(bot, bestPick);
    } else {
        say("Warning: No pickaxe available. Mining may fail on iron ore.");
    }

    // ── FASE 2: Tambang iron_ore sampai 10 raw_iron ──────────────
    let inv2       = world.getInventoryCounts(bot);
    let rawIron    = inv2["raw_iron"] || 0;
    say(`Raw iron in inventory: ${rawIron}/${TARGET_RAW_IRON}`);

    // Blacklist untuk menyimpan koordinat bijih besi yang tidak dapat dijangkau
    const blacklist = new Set();

    while (rawIron < TARGET_RAW_IRON) {
        if (bot.interrupt_code) {
            say("Interrupted. Stopping iron miner.");
            return;
        }

        // ── Pastikan pickaxe ada dan di-equip ──
        bestPick = await ensurePickaxe(bot, skills, world, say);
        if (!bestPick) {
            say("Cannot mine: No valid stone+ pickaxe available. Retrying...");
            await new Promise(r => setTimeout(r, 3000));
            continue;
        }
        await skills.equip(bot, bestPick);

        // ── Combat Guard ──
        await combatGuard(bot, skills, world, say, bestPick);
        inv2    = world.getInventoryCounts(bot);
        rawIron = inv2["raw_iron"] || 0;
        if (rawIron >= TARGET_RAW_IRON) break;

        // Cari iron_ore atau deepslate_iron_ore terdekat (abaikan yang di-blacklist)
        let target  = null;
        let nearest = Infinity;
        for (const name of IRON_BLOCKS) {
            const blocks = world.getNearestBlocksWhere(bot, blk => {
                if (!blk || !blk.position) return false;
                if (blk.name !== name) return false;
                const posKey = `${blk.position.x},${blk.position.y},${blk.position.z}`;
                return !blacklist.has(posKey);
            }, 64, 16);
            
            for (const blk of blocks) {
                const d = bot.entity.position.distanceTo(blk.position);
                if (d < nearest) { nearest = d; target = blk; }
            }
        }

        if (!target) {
            say("No reachable iron ore nearby. Moving to search wider area...");
            await skills.moveAway(bot, 20);
            inv2    = world.getInventoryCounts(bot);
            rawIron = inv2["raw_iron"] || 0;
            continue;
        }

        say(`Mining ${target.name} at (${target.position.x}, ${target.position.y}, ${target.position.z})...`);
        
        const startPos = bot.entity.position.clone();
        const startIron = rawIron;

        try {
            await skills.collectBlock(bot, target.name, 1);
        } catch (err) {
            say(`Mining failed: ${err.message || err}`);
            await combatGuard(bot, skills, world, say, bestPick);
            await recoverFromStuck(bot, skills, say);
            inv2    = world.getInventoryCounts(bot);
            rawIron = inv2["raw_iron"] || 0;
            continue;
        }

        inv2    = world.getInventoryCounts(bot);
        rawIron = inv2["raw_iron"] || 0;
        const endPos = bot.entity.position;

        if (rawIron === startIron && endPos.distanceTo(startPos) < 0.5) {
            // Gagal menambang dan posisi tidak berubah -> Masukkan ke blacklist
            const posKey = `${target.position.x},${target.position.y},${target.position.z}`;
            blacklist.add(posKey);
            console.log(`[DEBUG MINING] Blacklisted unreachable block: ${target.name} at ${target.position}`);
            
            await recoverFromStuck(bot, skills, say);
            inv2    = world.getInventoryCounts(bot);
            rawIron = inv2["raw_iron"] || 0;
            continue;
        }

        say(`Progress: ${rawIron}/${TARGET_RAW_IRON}`);
    }

    say(`Collected ${rawIron} raw iron! Starting smelting phase...`);

    // ── FASE 3: Smelt raw_iron menjadi iron_ingot ─────────────────
    // Cari atau buat furnace, kemudian smelt semua raw_iron.
    inv2 = world.getInventoryCounts(bot);
    const totalRaw = inv2["raw_iron"] || 0;

    if (totalRaw > 0) {
        // Cek apakah ada furnace di inventory atau di sekitar
        const hasFurnaceItem = (inv2["furnace"] || 0) > 0;
        const nearbyFurnace  = world.getNearestBlock(bot, "furnace", 32);

        if (!nearbyFurnace && !hasFurnaceItem) {
            // Buat furnace dari cobblestone jika tersedia
            const cobbleCount = (inv2["cobblestone"] || 0) + (inv2["stone"] || 0);
            if (cobbleCount >= 8) {
                say("Crafting furnace from cobblestone...");
                await skills.craftRecipe(bot, "furnace", 1);
                inv2 = world.getInventoryCounts(bot);
            } else {
                say(`Not enough cobblestone for furnace (need 8, have ${cobbleCount}). Skipping smelting.`);
                say(`You have ${totalRaw} raw_iron in inventory. Smelt manually with !smeltItem("raw_iron", ${totalRaw})`);
                say("Iron mining routine finished.");
                return;
            }
        }

        // Cek bahan bakar untuk furnace
        const hasFuel = (inv2["coal"] || 0) > 0 ||
                        (inv2["charcoal"] || 0) > 0 ||
                        getTotalLogs(inv2) > 0 ||
                        getTotalPlanks(inv2) > 0;

        if (!hasFuel) {
            say("No fuel available for smelting. Skipping smelt phase.");
            say(`You have ${totalRaw} raw_iron. Smelt manually with !smeltItem("raw_iron", ${totalRaw})`);
            say("Iron mining routine finished.");
            return;
        }

        say(`Smelting ${totalRaw} raw_iron into iron_ingot...`);
        await skills.smeltItem(bot, "raw_iron", totalRaw);

        inv2 = world.getInventoryCounts(bot);
        const ingots = inv2["iron_ingot"] || 0;
        say(`Smelting complete! Got ${ingots} iron_ingot.`);
    }

    say("Goal reached! Iron mining and smelting routine completed successfully.");
}
