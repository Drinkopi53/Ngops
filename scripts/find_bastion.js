// scripts/find_bastion.js
// This script automates searching for a Bastion Remnant in the Nether.

export async function main(bot, skills, world) {
    const currentDim = bot.game.dimension || '';
    if (!currentDim.includes('nether')) {
        bot.chat("I need to be in the Nether to search for a Bastion! Please use !goNether first.");
        return;
    }

    bot.chat("Starting search for the nearest Bastion Remnant...");

    const uniqueBlocks = ['gilded_blackstone', 'polished_blackstone_bricks', 'chiseled_polished_blackstone'];
    const maxScanDistance = 64;
    const exploreStep = 24;

    for (let attempts = 0; attempts < 30; attempts++) {
        if (bot.interrupt_code) {
            bot.chat("Script find_bastion interrupted.");
            return;
        }

        // 1. Scan for Piglin Brute (only spawns in Bastions)
        const brute = world.getNearestEntityWhere(bot, entity => {
            return entity.name === 'piglin_brute' || entity.name === 'minecraft:piglin_brute';
        }, 64);

        if (brute) {
            bot.chat(`Found a Piglin Brute at ${Math.round(brute.position.x)}, ${Math.round(brute.position.y)}, ${Math.round(brute.position.z)}! Navigating to Bastion...`);
            await skills.goToPosition(bot, brute.position.x, brute.position.y, brute.position.z, 2);
            bot.chat("Successfully reached the Bastion!");
            return;
        }

        // 2. Scan for Bastion unique blocks
        for (const blockName of uniqueBlocks) {
            const blockId = bot.registry.blocksByName[blockName]?.id;
            if (!blockId) continue;

            const blocks = bot.findBlocks({
                matching: blockId,
                maxDistance: maxScanDistance,
                count: 1
            });

            if (blocks.length > 0) {
                const targetPos = blocks[0];
                bot.chat(`Detected Bastion block (${blockName}) at ${targetPos.x}, ${targetPos.y}, ${targetPos.z}! Navigating...`);
                await skills.goToPosition(bot, targetPos.x, targetPos.y, targetPos.z, 2);
                bot.chat("Successfully reached the Bastion!");
                return;
            }
        }

        // 3. Explore: Move in a direction to scan a new area
        bot.chat(`No Bastion detected in this area. Exploring further (step ${attempts + 1}/30)...`);
        try {
            // Move away by exploreStep (24 blocks) in a safe pathfinder direction
            await skills.moveAway(bot, exploreStep);
            // Wait a moment for chunk loading and rendering
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
            if (bot.interrupt_code) {
                bot.chat("Script find_bastion interrupted.");
                return;
            }
            bot.chat(`Navigation warning during exploration: ${err.message || err}. Trying another direction...`);
            // Choose a random position nearby and go to it
            const currentPos = bot.entity.position;
            const rx = currentPos.x + (Math.random() * 20 - 10);
            const rz = currentPos.z + (Math.random() * 20 - 10);
            try {
                await skills.goToPosition(bot, rx, currentPos.y, rz, 2);
            } catch (_) {}
        }
    }

    bot.chat("Search finished. Could not find any Bastion Remnant in the explored range.");
}
