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
    const exploreStep = 32;

    // Track exploration direction to prevent going back and forth
    const directions = [
        { x: exploreStep, z: 0 },
        { x: -exploreStep, z: 0 },
        { x: 0, z: exploreStep },
        { x: 0, z: -exploreStep }
    ];
    let dirIndex = Math.floor(Math.random() * directions.length);

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

        // 3. Explore: Move in the current fixed direction
        bot.chat(`No Bastion detected. Exploring in direction index ${dirIndex} (step ${attempts + 1}/30)...`);
        
        const currentPos = bot.entity.position;
        const targetX = currentPos.x + directions[dirIndex].x;
        const targetZ = currentPos.z + directions[dirIndex].z;
        
        try {
            await skills.goToPosition(bot, targetX, currentPos.y, targetZ, 3);
            // Wait a moment for chunk loading and rendering
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
            if (bot.interrupt_code) {
                bot.chat("Script find_bastion interrupted.");
                return;
            }
            
            // If path blocked, rotate 90 degrees
            dirIndex = (dirIndex + 1) % directions.length;
            bot.chat(`Path blocked! Turning to direction index ${dirIndex}...`);
            
            try {
                // Take a small random step to get unstuck
                await skills.moveAway(bot, 12);
            } catch (_) {}
        }
    }

    bot.chat("Search finished. Could not find any Bastion Remnant in the explored range.");
}
