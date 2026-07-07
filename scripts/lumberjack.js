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

    while (currentLogs < targetGoal) {
        if (bot.interrupt_code) {
            say("Interrupt signal received. Stopping lumberjack.");
            return;
        }

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

        // Find nearest log block
        let targetLogBlock = null;
        let shortestDist = Infinity;
        
        for (const type of WOOD_TYPES) {
            let block = world.getNearestBlock(bot, type, 64);
            if (block) {
                let dist = bot.entity.position.distanceTo(block.position);
                if (dist < shortestDist) {
                    shortestDist = dist;
                    targetLogBlock = block;
                }
            }
        }

        if (!targetLogBlock) {
            say("No more logs found nearby. Searching wider area...");
            await skills.moveAway(bot, 15);
            inventory = world.getInventoryCounts(bot);
            currentLogs = getTotalLogs(inventory);
            continue;
        }

        say(`Heading to tree at ${targetLogBlock.position.x}, ${targetLogBlock.position.y}, ${targetLogBlock.position.z}...`);
        
        const startPos = bot.entity.position.clone();
        const startLogs = currentLogs;

        try {
            await skills.collectBlock(bot, targetLogBlock.name, 1);
        } catch (err) {
            say(`Collection failed: ${err.message || err}`);
            await combatGuard(bot, skills, world, say, bestAxe);
            await recoverFromStuck(bot, skills, say);
            inventory = world.getInventoryCounts(bot);
            currentLogs = getTotalLogs(inventory);
            continue;
        }
        
        inventory = world.getInventoryCounts(bot);
        currentLogs = getTotalLogs(inventory);
        const endPos = bot.entity.position;

        if (currentLogs === startLogs && endPos.distanceTo(startPos) < 0.5) {
            await recoverFromStuck(bot, skills, say);
            inventory = world.getInventoryCounts(bot);
            currentLogs = getTotalLogs(inventory);
            continue;
        }

        say(`Progress: ${currentLogs}/${targetGoal}`);
    }

    say("Goal achieved! Lumberjack routine completed successfully.");
}
