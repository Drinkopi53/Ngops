/**
 * Lumberjack script for Mindcraft.
 * This script runs completely without LLM involvement once triggered.
 * It:
 *  1. Checks for an axe.
 *  2. If no axe is present, gathers wood by hand, crafts a crafting table, crafts sticks/planks, and crafts a wooden axe.
 *  3. Equips the best axe available.
 *  4. Harvests any nearby wood logs until the goal is met.
 */

const WOOD_TYPES = [
    "oak_log", "birch_log", "spruce_log", "jungle_log", 
    "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log"
];

const AXES = [
    "netherite_axe", "diamond_axe", "iron_axe", "golden_axe", "stone_axe", "wooden_axe"
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

        // Crafting table preparation
        if (!hasCraftingTable && inventory['crafting_table'] === 0) {
            say("Crafting a crafting table...");
            // Need planks first
            let logType = WOOD_TYPES.find(type => inventory[type] > 0);
            if (logType) {
                let plankType = logType.replace("_log", "_planks");
                await skills.craftRecipe(bot, plankType, 1);
                await skills.craftRecipe(bot, "crafting_table", 1);
            }
            inventory = world.getInventoryCounts(bot);
        }

        // Craft sticks first (needs 2 sticks, which consumes 2 planks)
        let stickCount = inventory['stick'] || 0;
        let logType = WOOD_TYPES.find(type => inventory[type] > 0);

        if (logType) {
            let plankType = logType.replace("_log", "_planks");
            
            if (stickCount < 2) {
                let plankCount = inventory[plankType] || 0;
                if (plankCount < 2) {
                    await skills.craftRecipe(bot, plankType, 1);
                    inventory = world.getInventoryCounts(bot);
                }
                // Craft sticks (yields 4 sticks from 2 planks)
                await skills.craftRecipe(bot, "stick", 1);
                inventory = world.getInventoryCounts(bot);
            }
        }

        // Craft planks next (needs 3 planks for the wooden axe)
        logType = WOOD_TYPES.find(type => inventory[type] > 0);
        if (logType) {
            let plankType = logType.replace("_log", "_planks");
            let plankCount = inventory[plankType] || 0;

            if (plankCount < 3) {
                await skills.craftRecipe(bot, plankType, 1);
                inventory = world.getInventoryCounts(bot);
            }

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
        
        // We will collect one block of this log type
        await skills.collectBlock(bot, targetLogBlock.name, 1);
        
        inventory = world.getInventoryCounts(bot);
        currentLogs = getTotalLogs(inventory);
        say(`Progress: ${currentLogs}/${targetGoal}`);
    }

    say("Goal achieved! Lumberjack routine completed successfully.");
}
