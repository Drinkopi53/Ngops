/**
 * Diamond Ore mining script for Mindcraft.
 * This script runs completely without LLM involvement once triggered.
 * It:
 *  1. Checks for a pickaxe (iron or better required for diamond).
 *  2. If no suitable pickaxe is present, gathers resources and crafts an iron pickaxe.
 *  3. Equips the best pickaxe available.
 *  4. Mines diamond ore until the goal is met.
 *  5. Handles monster attacks by fighting back before resuming task.
 */

const WOOD_TYPES = [
    "oak_log", "birch_log", "spruce_log", "jungle_log", 
    "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log"
];

const PICKAXES = [
    "netherite_pickaxe", "diamond_pickaxe", "iron_pickaxe", "golden_pickaxe", "stone_pickaxe", "wooden_pickaxe"
];

// Diamond requires iron pickaxe or better
const MIN_PICKAXE_FOR_DIAMOND = ["netherite_pickaxe", "diamond_pickaxe", "iron_pickaxe"];

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

function hasValidPickaxeForDiamond(inventory) {
    for (const pickaxe of MIN_PICKAXE_FOR_DIAMOND) {
        if (inventory[pickaxe] > 0) return true;
    }
    return false;
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
            agent.openChat(`[DiamondMiner] ${msg}`);
        } else {
            bot.chat(`[DiamondMiner] ${msg}`);
        }
        console.log(`[DiamondMiner] ${msg}`);
    };

    say("Starting diamond mining routine...");

    // Goal count: 5 diamond ore (diamonds are rare!)
    const targetGoal = 5;
    
    // 1. Check for suitable pickaxe in inventory
    let inventory = world.getInventoryCounts(bot);
    let bestPickaxe = getBestPickaxe(inventory);

    if (!hasValidPickaxeForDiamond(inventory)) {
        say("No iron/diamond/netherite pickaxe detected. Initiating craft sequence.");

        // We need at least an iron pickaxe to mine diamonds
        // First, try to find or craft iron pickaxe
        let craftingTable = world.getNearestBlock(bot, 'crafting_table', 16);
        let hasCraftingTable = inventory['crafting_table'] > 0 || craftingTable !== null;

        // Check if we have iron ingots
        let ironIngots = inventory['iron_ingot'] || 0;

        if (ironIngots >= 3) {
            // We have enough iron to craft an iron pickaxe
            say("Found iron ingots. Crafting iron pickaxe...");
            
            if (!hasCraftingTable) {
                // Need to craft and place crafting table first
                let logs = getTotalLogs(inventory);
                let planks = 0;
                for (const type of WOOD_TYPES) {
                    planks += inventory[type.replace("_log", "_planks")] || 0;
                }
                
                if (planks < 4 && logs > 0) {
                    let logType = WOOD_TYPES.find(type => inventory[type] > 0);
                    if (logType) {
                        await skills.craftRecipe(bot, logType.replace("_log", "_planks"), 1);
                        inventory = world.getInventoryCounts(bot);
                    }
                }
                
                if (planks >= 4 || inventory['oak_planks'] >= 4 || inventory['birch_planks'] >= 4) {
                    await skills.craftRecipe(bot, "crafting_table", 1);
                    hasCraftingTable = true;
                }
            }

            if (hasCraftingTable || world.getNearestBlock(bot, 'crafting_table', 16)) {
                try {
                    await skills.craftRecipe(bot, "iron_pickaxe", 1);
                    say("Iron pickaxe crafted successfully!");
                    inventory = world.getInventoryCounts(bot);
                    bestPickaxe = getBestPickaxe(inventory);
                } catch (err) {
                    say(`Failed to craft iron pickaxe: ${err.message}`);
                }
            }
        } else {
            // Need to mine iron first
            say(`Not enough iron ingots (${ironIngots}/3). Mining iron ore first...`);
            
            // Mine some iron ore
            const mcData = require('minecraft-data')(bot.version);
            let ironMined = 0;
            const ironNeeded = 3 - ironIngots;
            
            while (ironMined < ironNeeded) {
                if (bot.interrupt_code) {
                    say("Interrupt signal received. Stopping.");
                    return;
                }

                let oreBlock = bot.findBlock({
                    matching: mcData.blocksByName.iron_ore.id,
                    maxDistance: 64
                });

                if (!oreBlock) {
                    say("No iron ore found nearby. Searching wider area...");
                    await skills.moveAway(bot, 15);
                    continue;
                }

                say(`Mining iron ore at ${oreBlock.position}...`);
                await bot.pathfinder.goto(new (bot.pathfinder.goals.GoalNear)(oreBlock.position.x, oreBlock.position.y, oreBlock.position.z, 3));
                
                try {
                    await bot.dig(oreBlock);
                    ironMined++;
                    say(`Iron ore mined: ${ironMined}/${ironNeeded}`);
                } catch (err) {
                    say(`Failed to mine iron ore: ${err.message}`);
                }

                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Smelt iron ore if needed (simplified - assuming we can use iron ingots directly)
            say("Please smelt iron ore into ingots using a furnace, then run this script again.");
            say("Alternatively, ensure you have 3 iron ingots before running this script.");
            return;
        }
    }

    if (bestPickaxe) {
        say(`Equipping pickaxe: ${bestPickaxe}`);
        await skills.equip(bot, bestPickaxe);
    } else {
        say("Failed to obtain a suitable pickaxe. Cannot mine diamond.");
        return;
    }

    // Verify we have a valid pickaxe for diamond
    inventory = world.getInventoryCounts(bot);
    if (!hasValidPickaxeForDiamond(inventory)) {
        say("Error: Still no iron/diamond/netherite pickaxe. Diamond mining aborted.");
        return;
    }

    // 4. Mine diamond ore until goal is met
    let currentDiamonds = inventory['diamond'] || 0;
    say(`Current diamonds in inventory: ${currentDiamonds}/${targetGoal}`);

    while (currentDiamonds < targetGoal) {
        if (bot.interrupt_code) {
            say("Interrupt signal received. Stopping diamond miner.");
            return;
        }

        // Check for hostile mobs before continuing task
        const monsterFought = await checkAndFightMonsters(bot, skills, world, say);
        if (monsterFought) {
            say("Resuming diamond mining after combat...");
            inventory = world.getInventoryCounts(bot);
            currentDiamonds = inventory['diamond'] || 0;
            continue;
        }

        // Find nearest diamond ore block
        const mcData = require('minecraft-data')(bot.version);
        let targetDiamondBlock = bot.findBlock({
            matching: mcData.blocksByName.diamond_ore.id,
            maxDistance: 64
        });

        if (!targetDiamondBlock) {
            say("No diamond ore found nearby. Searching wider area...");
            await skills.moveAway(bot, 20);
            inventory = world.getInventoryCounts(bot);
            currentDiamonds = inventory['diamond'] || 0;
            continue;
        }

        say(`Heading to diamond ore at ${targetDiamondBlock.position.x}, ${targetDiamondBlock.position.y}, ${targetDiamondBlock.position.z}...`);
        
        await bot.pathfinder.goto(new (bot.pathfinder.goals.GoalNear)(targetDiamondBlock.position.x, targetDiamondBlock.position.y, targetDiamondBlock.position.z, 3));
        
        try {
            await bot.dig(targetDiamondBlock);
            say(`Diamond ore mined! Checking inventory...`);
        } catch (err) {
            say(`Failed to mine diamond ore: ${err.message}`);
        }

        inventory = world.getInventoryCounts(bot);
        currentDiamonds = inventory['diamond'] || 0;
        say(`Progress: ${currentDiamonds}/${targetGoal}`);

        // Wait a bit to avoid spamming
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    say(`Goal achieved! Successfully collected ${currentDiamonds} diamond(s). Diamond mining routine completed.`);
}
