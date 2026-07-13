// scripts/find_bastion.js
// Automates searching for a Bastion Remnant in the Nether.
// Strategy: Spiral outward from the starting position in large steps, scanning each new area.

export async function main(bot, skills, world) {
    // --- 1. PRE-FLIGHT CHECKS ---
    const currentDim = bot.game.dimension || '';
    if (!currentDim.includes('nether')) {
        bot.chat("I need to be in the Nether! Please use !goNether first.");
        return;
    }

    bot.chat("Starting Bastion Remnant search... (Type !stop to cancel)");

    // Bastion-unique blocks, ordered by exclusivity (most unique first)
    const BASTION_BLOCKS = [
        'gilded_blackstone',
        'blackstone_slab',
        'chiseled_polished_blackstone',
        'polished_blackstone_bricks',
        'cracked_polished_blackstone_bricks',
        'polished_blackstone_brick_slab',
    ];

    const SCAN_RADIUS = 80;   // Block scan radius per position
    const STEP_SIZE  = 96;    // How far to travel between scan points (slightly larger than scan radius to avoid overlap)
    const MAX_STEPS  = 40;    // Total exploration steps = ~40 * 96 = ~3840 block range

    // --- Helper: check once at current position ---
    async function scanCurrentArea() {
        if (bot.interrupt_code) return false;

        // A. Piglin Brute — only spawns inside Bastions
        const brute = world.getNearestEntityWhere(bot, entity => {
            const n = entity.name || '';
            return n === 'piglin_brute' || n === 'minecraft:piglin_brute';
        }, SCAN_RADIUS);

        if (brute) {
            const bx = Math.round(brute.position.x);
            const by = Math.round(brute.position.y);
            const bz = Math.round(brute.position.z);
            bot.chat(`Found Piglin Brute at ${bx}, ${by}, ${bz}! Moving to Bastion...`);
            try {
                await skills.goToPosition(bot, brute.position.x, brute.position.y, brute.position.z, 4);
            } catch (_) {}
            bot.chat("Reached the Bastion! Search complete.");
            return true;
        }

        // B. Scan for Bastion-exclusive blocks
        for (const blockName of BASTION_BLOCKS) {
            const blockData = bot.registry.blocksByName[blockName];
            if (!blockData) continue;

            const found = bot.findBlocks({
                matching: blockData.id,
                maxDistance: SCAN_RADIUS,
                count: 1
            });

            if (found.length > 0) {
                const pos = found[0];
                bot.chat(`Found Bastion block "${blockName}" at ${pos.x}, ${pos.y}, ${pos.z}! Moving there...`);
                try {
                    await skills.goToPosition(bot, pos.x, pos.y, pos.z, 4);
                } catch (_) {}
                bot.chat("Reached the Bastion! Search complete.");
                return true;
            }
        }

        return false;
    }

    // --- Helper: move to a target position robustly ---
    async function moveTo(targetX, targetZ) {
        if (bot.interrupt_code) return;
        const currentY = bot.entity.position.y;

        try {
            await skills.goToPosition(bot, targetX, currentY, targetZ, 5);
        } catch (_) {
            if (bot.interrupt_code) return;
            // If direct path fails, try moveAway to get unstuck, then try again
            try {
                await skills.moveAway(bot, 16);
            } catch (_2) {}
        }

        // Wait for chunks to load
        await new Promise(resolve => setTimeout(resolve, 800));
    }

    // --- 2. SCAN STARTING POSITION FIRST ---
    if (await scanCurrentArea()) return;

    // --- 3. SPIRAL EXPLORATION ---
    // Uses a rectangular spiral pattern: right → down → left → up, growing each lap.
    // This guarantees full coverage without revisiting areas.
    const startX = bot.entity.position.x;
    const startZ = bot.entity.position.z;
    let x = startX;
    let z = startZ;

    // Spiral state
    let stepCount  = 1;   // steps to take in current direction
    let stepsTaken = 0;   // how many steps taken at current count
    let direction  = 0;   // 0=+X, 1=+Z, 2=-X, 3=-Z
    let turns      = 0;   // how many turns taken at current stepCount

    const dx = [STEP_SIZE, 0, -STEP_SIZE, 0];
    const dz = [0, STEP_SIZE, 0, -STEP_SIZE];

    for (let step = 0; step < MAX_STEPS; step++) {
        if (bot.interrupt_code) {
            bot.chat("Search interrupted.");
            return;
        }

        // Move in current spiral direction
        x += dx[direction];
        z += dz[direction];
        stepsTaken++;

        bot.chat(`Exploring step ${step + 1}/${MAX_STEPS}: moving to ${Math.round(x)}, ${Math.round(z)}...`);
        await moveTo(x, z);

        if (bot.interrupt_code) {
            bot.chat("Search interrupted.");
            return;
        }

        // Scan at new position
        if (await scanCurrentArea()) return;

        // Advance spiral
        if (stepsTaken === stepCount) {
            stepsTaken = 0;
            direction = (direction + 1) % 4;
            turns++;
            // After every 2 turns, increase the step count
            if (turns % 2 === 0) {
                stepCount++;
            }
        }
    }

    bot.chat("Search complete. No Bastion Remnant found in the explored area. Try searching further away.");
}
