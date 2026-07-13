// scripts/find_bastion.js
// Automates searching for a Bastion Remnant in the Nether.
//
// Strategy:
// 1. First descend safely to Y=50 (safe Nether mining level, above most lava lakes).
// 2. Spiral outward from start, tunneling through Netherrack at Y=50 when needed.
// 3. At each scan point, look for Piglin Brutes and Bastion-exclusive blocks within a wide radius.

export async function main(bot, skills, world) {
    // --- 1. PRE-FLIGHT CHECKS ---
    const currentDim = bot.game.dimension || '';
    if (!currentDim.includes('nether')) {
        bot.chat("I need to be in the Nether! Please use !goNether first.");
        return;
    }

    // Must have a pickaxe to tunnel through Netherrack
    const pickaxe = bot.inventory.items().find(item =>
        item.name.includes('pickaxe')
    );
    if (!pickaxe) {
        bot.chat("I need a pickaxe to tunnel through the Nether! Please give me one first.");
        return;
    }

    bot.chat("Starting Bastion Remnant search with tunneling... (Type !stop to cancel)");

    // --- CONSTANTS ---
    const BASTION_BLOCKS = [
        'gilded_blackstone',
        'chiseled_polished_blackstone',
        'polished_blackstone_bricks',
        'cracked_polished_blackstone_bricks',
        'polished_blackstone_brick_slab',
        'blackstone_slab',
    ];
    const SCAN_RADIUS  = 80;  // block detection radius
    const STEP_SIZE    = 80;  // distance traveled per spiral step
    const TUNNEL_Y     = 50;  // Y level to tunnel at — safe from most Nether lava lakes
    const MAX_STEPS    = 50;  // max spiral steps

    // --- HELPER: Scan current position for Bastion indicators ---
    async function scanCurrentArea() {
        if (bot.interrupt_code) return false;

        // A. Piglin Brute — exclusive to Bastion interior
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

        // B. Bastion-exclusive blocks
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

    // --- HELPER: Dig one column from current Y down to TUNNEL_Y safely ---
    async function descendToTunnelY() {
        if (bot.interrupt_code) return;
        const botPos = bot.entity.position;
        if (Math.round(botPos.y) <= TUNNEL_Y) return; // already at or below tunnel level

        bot.chat(`Descending to Y=${TUNNEL_Y} for safe tunneling...`);

        // Dig down column safely
        let currentY = Math.floor(botPos.y);
        while (currentY > TUNNEL_Y) {
            if (bot.interrupt_code) return;

            // Check two blocks below before digging (avoid dropping into lava)
            const below1 = bot.blockAt(bot.entity.position.offset(0, -1, 0));
            const below2 = bot.blockAt(bot.entity.position.offset(0, -2, 0));

            if (!below1 || below1.name.includes('lava') || below1.name.includes('fire')) {
                bot.chat("Lava detected below — cannot descend safely here. Stopping descent.");
                break;
            }
            if (!below2 || below2.name.includes('lava')) {
                bot.chat("Lava detected 2 blocks below — stopping 1 block above it.");
                break;
            }

            await skills.breakBlockAt(bot, Math.floor(botPos.x), currentY - 1, Math.floor(botPos.z));
            // Small wait for physics
            await new Promise(resolve => setTimeout(resolve, 300));
            currentY--;
        }
    }

    // --- HELPER: Tunnel forward from current position toward (targetX, TUNNEL_Y, targetZ) ---
    async function tunnelTo(targetX, targetZ) {
        if (bot.interrupt_code) return;

        const pos = bot.entity.position;
        const startX = Math.floor(pos.x);
        const startZ = Math.floor(pos.z);
        const endX   = Math.floor(targetX);
        const endZ   = Math.floor(targetZ);
        const y      = TUNNEL_Y;

        const stepsX = endX > startX ? 1 : (endX < startX ? -1 : 0);
        const stepsZ = endZ > startZ ? 1 : (endZ < startZ ? -1 : 0);

        let cx = startX;
        let cz = startZ;

        const totalDist = Math.max(Math.abs(endX - startX), Math.abs(endZ - startZ));

        bot.chat(`Tunneling from (${startX}, ${y}, ${startZ}) to (${endX}, ${y}, ${endZ})...`);

        for (let step = 0; step < totalDist + 2; step++) {
            if (bot.interrupt_code) return;

            // Step toward target
            if (cx !== endX) cx += stepsX;
            else if (cz !== endZ) cz += stepsZ;
            else break; // reached target

            // Get blocks at foot and head positions
            const footBlock = bot.blockAt({ x: cx, y: y,     z: cz });
            const headBlock = bot.blockAt({ x: cx, y: y + 1, z: cz });

            // Safe-check: don't dig into lava or fire
            if (footBlock && (footBlock.name.includes('lava') || footBlock.name.includes('fire'))) {
                bot.chat(`Lava/fire detected at (${cx}, ${y}, ${cz}) — skipping this route.`);
                break;
            }

            if (footBlock && footBlock.name !== 'air' && footBlock.name !== 'cave_air') {
                await skills.breakBlockAt(bot, cx, y, cz);
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (headBlock && headBlock.name !== 'air' && headBlock.name !== 'cave_air') {
                await skills.breakBlockAt(bot, cx, y + 1, cz);
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Every 8 blocks, move the bot through the tunnel to keep up
            if (step % 8 === 7 || (cx === endX && cz === endZ)) {
                try {
                    await skills.goToPosition(bot, cx, y, cz, 3);
                } catch (_) {}
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        // Final move to destination
        try {
            await skills.goToPosition(bot, targetX, y, targetZ, 5);
        } catch (_) {
            try { await skills.moveAway(bot, 8); } catch (_2) {}
        }

        // Wait for chunks to load at new position
        await new Promise(resolve => setTimeout(resolve, 800));
    }

    // --- 2. DESCEND FIRST ---
    await descendToTunnelY();
    if (bot.interrupt_code) { bot.chat("Search interrupted."); return; }

    // --- 3. SCAN STARTING POSITION ---
    if (await scanCurrentArea()) return;

    // --- 4. SPIRAL EXPLORATION WITH TUNNELING ---
    let x = bot.entity.position.x;
    let z = bot.entity.position.z;

    let stepCount  = 1;  // how many moves in current direction
    let stepsTaken = 0;
    let direction  = 0;  // 0=+X, 1=+Z, 2=-X, 3=-Z
    let turns      = 0;

    const dx = [STEP_SIZE, 0, -STEP_SIZE, 0];
    const dz = [0, STEP_SIZE, 0, -STEP_SIZE];

    for (let step = 0; step < MAX_STEPS; step++) {
        if (bot.interrupt_code) { bot.chat("Search interrupted."); return; }

        // Move in current spiral direction
        x += dx[direction];
        z += dz[direction];
        stepsTaken++;

        bot.chat(`Step ${step + 1}/${MAX_STEPS} → target (${Math.round(x)}, ${TUNNEL_Y}, ${Math.round(z)})`);

        // Tunnel to next spiral position
        await tunnelTo(x, z);
        if (bot.interrupt_code) { bot.chat("Search interrupted."); return; }

        // Scan at new position
        if (await scanCurrentArea()) return;

        // Advance spiral state
        if (stepsTaken === stepCount) {
            stepsTaken = 0;
            direction = (direction + 1) % 4;
            turns++;
            if (turns % 2 === 0) stepCount++;
        }
    }

    bot.chat("Search complete. No Bastion Remnant found. The Bastion may be very far away.");
}
