/**
 * Coal Ore mining script for Mindcraft.
 * This script runs completely without LLM involvement once triggered.
 * It:
 *  1. Checks for a pickaxe.
 *  2. If no pickaxe is present, gathers wood/stone by hand, crafts a crafting table, crafts sticks/planks, and crafts a wooden pickaxe.
 *  3. Equips the best pickaxe available.
 *  4. Mines coal ore until the goal (20 coal) is met.
 *  5. Handles monster attacks by fighting back before resuming task.
 */

const WOOD_TYPES = [
    "oak_log", "birch_log", "spruce_log", "jungle_log", 
    "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log"
];

const PICKAXES = [
    "netherite_pickaxe", "diamond_pickaxe", "iron_pickaxe", "golden_pickaxe", "stone_pickaxe", "wooden_pickaxe"
];

// Hostile mobs that can attack the player
const HOSTILE_MOBS = [
    "zombie", "skeleton", "creeper", "spider", "cave_spider", 
    "enderman", "witch", "slime", "phantom", "drowned", 
    "husk", "stray", "wither_skeleton", "piglin", "piglin_brute",
    "vindicator", "evoker", "pillager", "ravager", "blaze", "ghast",
    "magma_cube", "shulker", "vex", "warden"
];

function getBestPickaxe(inventory) {
    for (const pickaxe of PICKAXES) {
        if (inventory[pickaxe] > 0) return pickaxe;
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
 * Check for nearby hostile mobs and fight them if found.
 * Returns true if a monster was fought, false otherwise.
 */
async function checkAndFightMonsters(bot, skills, world, say) {
    const mcData = require('minecraft-data')(bot.version);
    const monsters = [];
    
    // Find all hostile mobs within 16 blocks
    for (const mobType of HOSTILE_MOBS) {
        if (!mcData.entitiesByName[mobType]) continue;
        
        const entities = bot.entities.filter(e => {
            return e.name === mobType && 
                   e.position.distanceTo(bot.entity.position) < 16;
        });
        
        if (entities.length > 0) {
            monsters.push(...entities);
        }
    }
    
    if (monsters.length > 0) {
        // Sort by distance, fight closest first
        monsters.sort((a, b) => {
            return bot.entity.position.distanceTo(a.position) - 
                   bot.entity.position.distanceTo(b.position);
        });
        
        for (const monster of monsters) {
            if (bot.interrupt_code) return true;
            
            say(`⚠️ ${monster.name} detected at ${Math.round(monster.position.distanceTo(bot.entity.position))} blocks! Fighting...`);
            
            // Equip weapon if available
            const weapons = ["netherite_sword", "diamond_sword", "iron_sword", "golden_sword", "stone_sword", "wooden_sword", "bow"];
            let bestWeapon = null;
            const inventory = world.getInventoryCounts(bot);
            
            for (const weapon of weapons) {
                if (inventory[weapon] > 0) {
                    bestWeapon = weapon;
                    break;
                }
            }
            
            if (bestWeapon) {
                await skills.equip(bot, bestWeapon);
                say(`Equipped ${bestWeapon} for combat.`);
            } else {
                say("No weapon available, fighting with fists!");
            }
            
            // Attack the monster
            try {
                await skills.attack(bot, monster);
                say(`✓ Defeated ${monster.name}!`);
            } catch (err) {
                say(`Combat error: ${err.message}`);
            }
        }
        
        return true;
    }
    
    return false;
}

export default async function run(bot, skills, world, agent) {
    const say = (msg) => {
        if (agent && typeof agent.openChat === 'function') {
            agent.openChat(`[CoalMiner] ${msg}`);
        } else {
            bot.chat(`[CoalMiner] ${msg}`);
        }
        console.log(`[CoalMiner] ${msg}`);
    };

    say("Starting coal mining routine...");

    // Goal count: 20 coal ore
    const targetGoal = 20;
    
    // 1. Check for pickaxe in inventory
    let inventory = world.getInventoryCounts(bot);
    let bestPickaxe = getBestPickaxe(inventory);

    if (!bestPickaxe) {
        say("No pickaxe detected. Initiating craft sequence.");

        // We need a pickaxe. Let's make sure we have resources.
        // A wooden pickaxe needs 3 planks and 2 sticks.
        // If we don't have a crafting table nearby or in inventory, we need one (4 planks).
        let craftingTable = world.getNearestBlock(bot, 'crafting_table', 16);
        let hasCraftingTable = inventory['crafting_table'] > 0 || craftingTable !== null;

        // Collect logs first if we don't have enough wood.
        // Minimum logs needed:
        // - Wooden pickaxe: 3 planks + 2 sticks = 5 planks = 2 logs.
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

        // Step 3: Make planks for the pickaxe (needs 3 planks)
        if (planks < 3 && logs > 0) {
            say(`Converting 1 log to planks for pickaxe...`);
            await skills.craftRecipe(bot, activePlankType, 1);
            inventory = world.getInventoryCounts(bot);
            logs = getTotalLogs(inventory);
            planks = 0;
            for (const type of WOOD_TYPES) {
                planks += inventory[type.replace("_log", "_planks")] || 0;
            }
        }

        // Step 4: Craft wooden pickaxe
        if (planks >= 3 && sticks >= 2 && hasTable) {
            say("Crafting wooden pickaxe...");
            await skills.craftRecipe(bot, "wooden_pickaxe", 1);
            inventory = world.getInventoryCounts(bot);
            bestPickaxe = getBestPickaxe(inventory);
        }
    }

    if (bestPickaxe) {
        say(`Equipping pickaxe: ${bestPickaxe}`);
        await skills.equip(bot, bestPickaxe);
    } else {
        say("Failed to craft or find a pickaxe. Cannot mine coal efficiently.");
    }

    // 4. Mine coal ore until goal is met
    let currentCoal = inventory['coal'] || 0;
    say(`Current coal in inventory: ${currentCoal}/${targetGoal}`);

    while (currentCoal < targetGoal) {
        if (bot.interrupt_code) {
            say("Interrupt signal received. Stopping coal miner.");
            return;
        }

        // Check for hostile mobs before continuing task
        const monsterFought = await checkAndFightMonsters(bot, skills, world, say);
        if (monsterFought) {
            say("Resuming coal mining after combat...");
            inventory = world.getInventoryCounts(bot);
            currentCoal = inventory['coal'] || 0;
            continue;
        }

        // Find nearest coal ore block
        let targetCoalBlock = world.getNearestBlock(bot, 'coal_ore', 64);

        if (!targetCoalBlock) {
            say("No coal ore found nearby. Searching wider area...");
            await skills.moveAway(bot, 15);
            inventory = world.getInventoryCounts(bot);
            currentCoal = inventory['coal'] || 0;
            continue;
        }

        say(`Heading to coal ore at ${targetCoalBlock.position.x}, ${targetCoalBlock.position.y}, ${targetCoalBlock.position.z}...`);
        
        // We will collect one block of coal ore
        await skills.collectBlock(bot, 'coal_ore', 1);
        
        inventory = world.getInventoryCounts(bot);
        currentCoal = inventory['coal'] || 0;
        say(`Progress: ${currentCoal}/${targetGoal}`);
    }

    say("Goal achieved! Coal mining routine completed successfully.");
}
