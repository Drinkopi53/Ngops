// scripts/find_bastion.js
// Automates searching for a Bastion Remnant in the Nether.
//
// Strategy:
// 1. Descend safely to Y=50 (safe Nether tunneling level, above most lava lakes).
// 2. Spiral outward from start, tunneling through Netherrack at Y=50.
// 3. At each scan point, look for Piglin Brutes and Bastion-exclusive blocks.

import Vec3 from 'vec3';

export async function main(bot, skills, world) {
    // --- 1. PRE-FLIGHT CHECKS ---
    const currentDim = bot.game.dimension || '';
    if (!currentDim.includes('nether')) {
        bot.chat("I need to be in the Nether! Please use !goNether first.");
        return;
    }

    const pickaxe = bot.inventory.items().find(item => item.name.includes('pickaxe'));
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
    const SCAN_RADIUS = 80;  // block/entity detection radius per scan point
    const STEP_SIZE   = 80;  // distance between spiral waypoints
    const TUNNEL_Y    = 50;  // Y level to tunnel at (above most lava lakes in the Nether)
    const MAX_STEPS   = 50;  // max spiral steps

    // --- HELPER: Get block safely using Vec3 ---
    function getBlock(x, y, z) {
        try {
            return bot.blockAt(new Vec3(Math.floor(x), Math.floor(y), Math.floor(z)));
        } catch (_) {
            return null;
        }
    }

    // --- HELPER: Check if block name is dangerous (lava/fire) ---
    function isDangerous(block) {
        if (!block) return false;
        return block.name.includes('lava') || block.name.includes('fire');
    }

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
            try { await skills.goToPosition(bot, brute.position.x, brute.position.y, brute.position.z, 4); } catch (_) {}
            bot.chat("Reached the Bastion! Search complete.");
            return true;
        }

        // B. Bastion-exclusive blocks
        for (const blockName of BASTION_BLOCKS) {
            const blockData = bot.registry.blocksByName[blockName];
            if (!blockData) continue;

            const found = bot.findBlocks({ matching: blockData.id, maxDistance: SCAN_RADIUS, count: 1 });
            if (found.length > 0) {
                const pos = found[0];
                bot.chat(`Found Bastion block "${blockName}" at ${pos.x}, ${pos.y}, ${pos.z}! Moving there...`);
                try { await skills.goToPosition(bot, pos.x, pos.y, pos.z, 4); } catch (_) {}
                bot.chat("Reached the Bastion! Search complete.");
                return true;
            }
        }

        return false;
    }

    // --- HELPER: Descend from current Y down to TUNNEL_Y by digging ---
    async function descendToTunnelY() {
        if (bot.interrupt_code) return;
        const startY = Math.floor(bot.entity.position.y);
        if (startY <= TUNNEL_Y) return;

        bot.chat(`Descending to Y=${TUNNEL_Y}...`);

        for (let currentY = startY - 1; currentY >= TUNNEL_Y; currentY--) {
            if (bot.interrupt_code) return;

            const bx = Math.floor(bot.entity.position.x);
            const bz = Math.floor(bot.entity.position.z);

            // Check for lava/fire before digging each step
            const blockBelow = getBlock(bx, currentY, bz);
            const blockTwoBelow = getBlock(bx, currentY - 1, bz);

            if (isDangerous(blockBelow)) {
                bot.chat(`Lava/fire at Y=${currentY} — stopping descent here.`);
                break;
            }
            if (isDangerous(blockTwoBelow)) {
                bot.chat(`Lava 2 blocks below at Y=${currentY - 1} — stopping 1 block above.`);
                break;
            }

            await skills.breakBlockAt(bot, bx, currentY, bz);
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }

    // --- HELPER: Tunnel a 1×2 corridor toward (targetX, TUNNEL_Y, targetZ) ---
    async function tunnelTo(targetX, targetZ) {
        if (bot.interrupt_code) return;

        const pos  = bot.entity.position;
        const curX = Math.floor(pos.x);
        const curZ = Math.floor(pos.z);
        const endX = Math.floor(targetX);
        const endZ = Math.floor(targetZ);
        const y    = TUNNEL_Y;

        const stepX = endX > curX ? 1 : (endX < curX ? -1 : 0);
        const stepZ = endZ > curZ ? 1 : (endZ < curZ ? -1 : 0);
        const totalDist = Math.max(Math.abs(endX - curX), Math.abs(endZ - curZ));

        bot.chat(`Tunneling to (${endX}, ${y}, ${endZ})...`);

        let cx = curX;
        let cz = curZ;

        for (let step = 0; step < totalDist; step++) {
            if (bot.interrupt_code) return;

            // Advance one block toward target
            if (cx !== endX) cx += stepX;
            else if (cz !== endZ) cz += stepZ;
            else break;

            // Lava/fire safety check before digging
            const footBlock = getBlock(cx, y, cz);
            const headBlock = getBlock(cx, y + 1, cz);

            if (isDangerous(footBlock) || isDangerous(headBlock)) {
                bot.chat(`Lava/fire detected at (${cx}, ${y}, ${cz}) — abandoning this tunnel segment.`);
                break;
            }

            // Break foot block if solid
            if (footBlock && footBlock.name !== 'air' && footBlock.name !== 'cave_air') {
                await skills.breakBlockAt(bot, cx, y, cz);
                await new Promise(resolve => setTimeout(resolve, 120));
            }
            // Break head block if solid
            if (headBlock && headBlock.name !== 'air' && headBlock.name !== 'cave_air') {
                await skills.breakBlockAt(bot, cx, y + 1, cz);
                await new Promise(resolve => setTimeout(resolve, 120));
            }

            // Every 8 blocks, walk through the tunnel to keep up
            if (step % 8 === 7) {
                try { await skills.goToPosition(bot, cx, y, cz, 3); } catch (_) {}
                await new Promise(resolve => setTimeout(resolve, 400));
            }
        }

        // Final walk to destination
        try {
            await skills.goToPosition(bot, endX, y, endZ, 5);
        } catch (_) {
            try { await skills.moveAway(bot, 8); } catch (_2) {}
        }

        // Allow chunks at new location to load
        await new Promise(resolve => setTimeout(resolve, 800));
    }

    // === MAIN SEARCH LOOP ===

    // Step 1 — Descend to tunneling level
    await descendToTunnelY();
    if (bot.interrupt_code) { bot.chat("Search interrupted."); return; }

    // Step 2 — Scan starting position
    if (await scanCurrentArea()) return;

    // Step 3 — Spiral outward while tunneling
    let x = bot.entity.position.x;
    let z = bot.entity.position.z;

    let stepCount  = 1;  // consecutive steps in current direction
    let stepsTaken = 0;
    let direction  = 0;  // 0=+X, 1=+Z, 2=-X, 3=-Z
    let turns      = 0;

    const dx = [STEP_SIZE, 0, -STEP_SIZE, 0];
    const dz = [0, STEP_SIZE, 0, -STEP_SIZE];

    for (let step = 0; step < MAX_STEPS; step++) {
        if (bot.interrupt_code) { bot.chat("Search interrupted."); return; }

        x += dx[direction];
        z += dz[direction];
        stepsTaken++;

        bot.chat(`Step ${step + 1}/${MAX_STEPS} → (${Math.round(x)}, ${TUNNEL_Y}, ${Math.round(z)})`);

        await tunnelTo(x, z);
        if (bot.interrupt_code) { bot.chat("Search interrupted."); return; }

        if (await scanCurrentArea()) return;

        // Advance spiral
        if (stepsTaken === stepCount) {
            stepsTaken = 0;
            direction = (direction + 1) % 4;
            turns++;
            if (turns % 2 === 0) stepCount++;
        }
    }

    bot.chat("Search complete. No Bastion Remnant found in the explored area.");
}
