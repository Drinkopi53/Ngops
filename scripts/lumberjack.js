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
        if (agent && typeof agent.openChat === 'function') {
            agent.openChat(`[Lumberjack] ${msg}`);
        } else {
            bot.chat(`[Lumberjack] ${msg}`);
        }
        console.log(`[Lumberjack] ${msg}`);
    };

    say("Starting lumberjack routine...");

    // Goal count: 10 wood logs of any type
    const targetGoal = 10;
    
    // 1. Check for axe in inventory
    let inventory = world.getInventoryCounts(bot);
    let bestAxe = getBestAxe(inventory);

    if (!bestAxe) {
        say("No axe detected. Initiating craft sequence.");

        // We need an axe. Let's make sure we have resources.
        // A wooden axe needs 3 planks and 2 sticks.
        // If we don't have a crafting table nearby or in inventory, we need one (4 planks).
        let craftingTable = world.getNearestBlock(bot, 'crafting_table', 16);
        let hasCraftingTable = inventory['crafting_table'] > 0 || craftingTable !== null;

        // Collect logs first if we don't have enough wood.
        // Minimum logs needed:
        // - Wooden axe: 3 planks + 2 sticks = 5 planks = 2 logs.
        // - Crafting table (if needed): 4 planks = 1 log.
        // Total logs needed: 2 (or 3 if we need to craft a crafting table).
        let neededLogs = hasCraftingTable ? 2 : 3;
        let currentLogs = getTotalLogs(inventory);

        if (currentLogs < neededLogs) {
            let logsToCollect = neededLogs - currentLogs;
            say(`Collecting ${logsToCollect} logs by hand to craft tools...`);
            
            // Try to find any log block nearby
            let foundLogType = "oak_log";
            for (const type of WOOD_TYPES) {
                let block = world.getNearestBlock(bot, type, 32);
                if (block) {
                    foundLogType = type;
                    break;
                }
            }

            await skills.collectBlock(bot, foundLogType, logsToCollect);
            inventory = world.getInventoryCounts(bot);
            currentLogs = getTotalLogs(inventory);
        }

        // Robust step-by-step crafting sequence
        let logs = getTotalLogs(inventory);
        let planks = 0;
        let activePlankType = "oak_planks";
        
        // Find which plank type we can use
        let logType = WOOD_TYPES.find(type => inventory[type] > 0);
        if (logType) {
            activePlankType = logType.replace("_log", "_planks");
        }
        
        for (const type of WOOD_TYPES) {
            let pType = type.replace("_log", "_planks");
            planks += inventory[pType] || 0;
        }
        
        let sticks = inventory['stick'] || 0;
        let tables = inventory['crafting_table'] || 0;
        let nearbyTable = world.getNearestBlock(bot, 'crafting_table', 16);
        let hasTable = tables > 0 || nearbyTable !== null;

        say(`Resources: logs=${logs}, planks=${planks}, sticks=${sticks}, table=${hasTable}`);

        // Step 1: Make crafting table if we don't have one nearby or in inventory
        if (!hasTable) {
            if (planks < 4 && logs > 0) {
                say(`Converting 1 log to planks to craft table...`);
                await skills.craftRecipe(bot, activePlankType, 1);
                inventory = world.getInventoryCounts(bot);
                logs = getTotalLogs(inventory);
                planks = 0;
                for (const type of WOOD_TYPES) {
                    planks += inventory[type.replace("_log", "_planks")] || 0;
                }
            }
            if (planks >= 4) {
                say(`Crafting crafting table...`);
                await skills.craftRecipe(bot, "crafting_table", 1);
                inventory = world.getInventoryCounts(bot);
                planks = 0;
                for (const type of WOOD_TYPES) {
                    planks += inventory[type.replace("_log", "_planks")] || 0;
                }
                tables = inventory['crafting_table'] || 0;
                hasTable = true;
            }
        }

        // Step 2: Make sticks if we have less than 2
        if (sticks < 2) {
            if (planks < 2 && logs > 0) {
                say(`Converting 1 log to planks for sticks...`);
                await skills.craftRecipe(bot, activePlankType, 1);
                inventory = world.getInventoryCounts(bot);
                logs = getTotalLogs(inventory);
                planks = 0;
                for (const type of WOOD_TYPES) {
                    planks += inventory[type.replace("_log", "_planks")] || 0;
                }
            }
            if (planks >= 2) {
                say(`Crafting sticks...`);
                await skills.craftRecipe(bot, "stick", 1);
                inventory = world.getInventoryCounts(bot);
                planks = 0;
                for (const type of WOOD_TYPES) {
                    planks += inventory[type.replace("_log", "_planks")] || 0;
                }
                sticks = inventory['stick'] || 0;
            }
        }

        // Step 3: Make planks for the axe (needs 3 planks)
        if (planks < 3 && logs > 0) {
            say(`Converting 1 log to planks for axe...`);
            await skills.craftRecipe(bot, activePlankType, 1);
            inventory = world.getInventoryCounts(bot);
            logs = getTotalLogs(inventory);
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

    if (bestAxe) {
        say(`Equipping axe: ${bestAxe}`);
        await skills.equip(bot, bestAxe);
    } else {
        say("Failed to craft or find an axe. Gathering logs by hand.");
    }

    // 4. Harvest logs until goal is met
    let currentLogs = getTotalLogs(inventory);
    say(`Current logs in inventory: ${currentLogs}/${targetGoal}`);

    while (currentLogs < targetGoal) {
        if (bot.interrupt_code) {
            say("Interrupt signal received. Stopping lumberjack.");
            return;
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
