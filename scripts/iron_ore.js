/**
 * Iron Ore Miner Script - Mindcraft Deterministic Automation
 *
 * This script runs statically and deterministically without LLM.
 * Collects 100 Iron Ore, searching within a 64 block radius,
 * and explores if no ore is found in the current area.
 */

export async function main(bot, skills, world) {
    const TARGET_ORE = 'iron_ore';
    const TARGET_QTY = 100;
    const SEARCH_RADIUS = 64;

    console.log(`[Script] Starting automatic mining of ${TARGET_QTY} ${TARGET_ORE}...`);
    bot.chat(`Starting search script for ${TARGET_QTY} ${TARGET_ORE}...`);

    // Pengecekan Pickaxe (Pickaxe check)
    let hasPickaxe = bot.inventory.items().some(item => item.name.includes('pickaxe'));
    if (!hasPickaxe) {
        bot.chat(`I don't have a Pickaxe in my inventory! Script stopped.`);
        console.log(`[Script] Pickaxe not found. Stopping script.`);
        return;
    }

    let inventory = world.getInventoryCounts(bot);
    let currentIron = (inventory['raw_iron'] || 0) + (inventory['iron_ore'] || 0) + (inventory['deepslate_iron_ore'] || 0);

    let failedAttempts = 0;
    let ignoreBlocks = []; // Array of block positions to ignore

    while (currentIron < TARGET_QTY) {
        if (bot.interrupt_code) {
            console.log(`[Script] Interrupted. Stopping script.`);
            bot.chat(`Script iron_ore stopped due to interruption (e.g. unstuck/stop).`);
            return;
        }

        if (bot.inventory.emptySlotCount() === 0) {
            console.log(`[Script] Inventory is full. Stopping script.`);
            bot.chat(`My inventory is full! Stopping iron ore search.`);
            return;
        }

        let needed = TARGET_QTY - currentIron;
        console.log(`[Script] Need ${needed} more. Searching within radius ${SEARCH_RADIUS}...`);

        const filterBlock = (block) => {
            if (block.name !== TARGET_ORE && block.name !== 'deepslate_iron_ore') return false;
            return true;
        };

        // Search for nearest iron ore blocks
        let rawBlocks = world.getNearestBlocksWhere(bot, filterBlock, SEARCH_RADIUS, 100);

        let oreBlock = null;
        for (let block of rawBlocks) {
            let isIgnored = false;
            for (let pos of ignoreBlocks) {
                if (pos.x === block.position.x && pos.y === block.position.y && pos.z === block.position.z) {
                    isIgnored = true;
                    break;
                }
            }
            if (!isIgnored) {
                oreBlock = block;
                break; // Take the first block that is not in the ignore list
            }
        }

        if (!oreBlock) {
            bot.chat(`Could not find ${TARGET_ORE} in this area. Exploring to find a new area...`);
            console.log(`[Script] No ore in radius ${SEARCH_RADIUS}. Moving to a random location...`);

            // Move away to explore
            try {
                // Move at least 32 blocks away in a random direction
                await skills.moveAway(bot, 32);
                failedAttempts++;
                if (failedAttempts > 10) {
                     bot.chat(`Explored for too long but could not find iron_ore. Script stopped temporarily.`);
                     return;
                }
                // Continue to the next iteration to search again
                continue;
            } catch (err) {
                console.error(`[Script] Failed to explore:`, err);
                bot.chat(`Stuck while trying to explore.`);
                return;
            }
        }

        // Reset fail count if we found one
        failedAttempts = 0;

        const targetType = oreBlock.name; // 'iron_ore' or 'deepslate_iron_ore'
        console.log(`[Script] Found ${targetType} at ${oreBlock.position}. Heading to location...`);

        // Collect block
        try {
            let success = await skills.collectBlock(bot, targetType, 1, ignoreBlocks);
            if (!success) {
                console.log(`[Script] Failed to collect ${targetType} (likely due to pathing/tools), adding to ignore list.`);
                ignoreBlocks.push(oreBlock.position);
            }
        } catch (err) {
            console.error(`[Script] Failed to mine block ${targetType}:`, err);
            bot.chat(`Failed to mine this ${targetType}, trying to find another one...`);
            ignoreBlocks.push(oreBlock.position);
            await skills.moveAway(bot, 2);
        }

        // Update inventory count
        inventory = world.getInventoryCounts(bot);
        currentIron = (inventory['raw_iron'] || 0) + (inventory['iron_ore'] || 0) + (inventory['deepslate_iron_ore'] || 0);
    }

    bot.chat(`Target of ${TARGET_QTY} Iron has been reached! Stopping mining.`);
    console.log(`[Script] Finished. Total collected: ${currentIron}`);
}
