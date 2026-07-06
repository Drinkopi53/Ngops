/**
 * coal_ore.js - Custom script for Mindcraft bot (Dryzikhov)
 *
 * Alur kerja:
 *  1. Periksa apakah ada pickaxe di inventory.
 *  2. Jika tidak ada: kumpulkan kayu dengan tangan, buat crafting table,
 *     buat planks + sticks, lalu buat wooden_pickaxe.
 *  3. Equip pickaxe terbaik yang ada.
 *  4. Cari dan tambang coal_ore / deepslate_coal_ore sampai 10 biji.
 */

const WOOD_TYPES = [
    "oak_log", "birch_log", "spruce_log", "jungle_log",
    "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log"
];

const PICKAXES = [
    "netherite_pickaxe", "diamond_pickaxe", "iron_pickaxe",
    "golden_pickaxe", "stone_pickaxe", "wooden_pickaxe"
];

const COAL_BLOCKS = ["coal_ore", "deepslate_coal_ore"];

function getBestPickaxe(inv) {
    for (const p of PICKAXES) { if (inv[p] > 0) return p; }
    return null;
}

function getTotalLogs(inv) {
    return WOOD_TYPES.reduce((s, t) => s + (inv[t] || 0), 0);
}

function getTotalPlanks(inv) {
    return WOOD_TYPES.reduce((s, t) => s + (inv[t.replace("_log", "_planks")] || 0), 0);
}

function getPlankType(inv) {
    const l = WOOD_TYPES.find(t => inv[t] > 0);
    return l ? l.replace("_log", "_planks") : "oak_planks";
}

export default async function run(bot, skills, world, agent) {
    const say = (msg) => {
        const full = `[CoalMiner] ${msg}`;
        if (agent && typeof agent.openChat === "function") agent.openChat(full);
        else bot.chat(full);
        console.log(full);
    };

    const TARGET = 10;
    say("Starting coal mining routine...");

    // ── FASE 1: Pastikan ada pickaxe ─────────────────────────────
    let inv = world.getInventoryCounts(bot);
    let bestPick = getBestPickaxe(inv);

    if (!bestPick) {
        say("No pickaxe found. Starting crafting sequence...");

        // Hitung kebutuhan minimum logs
        const nearby      = world.getNearestBlock(bot, "crafting_table", 16);
        const hasTableNow = (inv["crafting_table"] || 0) > 0 || nearby !== null;
        const neededLogs  = hasTableNow ? 2 : 3;
        let logs          = getTotalLogs(inv);

        if (logs < neededLogs) {
            const toGet = neededLogs - logs;
            say(`Collecting ${toGet} log(s) by hand...`);
            let foundType = "oak_log";
            for (const t of WOOD_TYPES) {
                if (world.getNearestBlock(bot, t, 32)) { foundType = t; break; }
            }
            await skills.collectBlock(bot, foundType, toGet);
            inv = world.getInventoryCounts(bot);
        }

        // Sinkronisasi state real-time
        logs           = getTotalLogs(inv);
        let planks     = getTotalPlanks(inv);
        let sticks     = inv["stick"] || 0;
        let pType      = getPlankType(inv);
        const nbTable  = world.getNearestBlock(bot, "crafting_table", 16);
        let hasTable   = (inv["crafting_table"] || 0) > 0 || nbTable !== null;

        say(`Resources - logs:${logs} planks:${planks} sticks:${sticks} table:${hasTable}`);

        // Step 1: Crafting table
        if (!hasTable) {
            if (planks < 4 && logs > 0) {
                say("Converting log to planks (for crafting table)...");
                await skills.craftRecipe(bot, pType, 1);
                inv = world.getInventoryCounts(bot);
                logs = getTotalLogs(inv); planks = getTotalPlanks(inv);
            }
            if (planks >= 4) {
                say("Crafting crafting table...");
                await skills.craftRecipe(bot, "crafting_table", 1);
                inv = world.getInventoryCounts(bot);
                planks = getTotalPlanks(inv); hasTable = true;
            }
        }

        // Step 2: Sticks
        if (sticks < 2) {
            if (planks < 2 && logs > 0) {
                say("Converting log to planks (for sticks)...");
                pType = getPlankType(inv);
                await skills.craftRecipe(bot, pType, 1);
                inv = world.getInventoryCounts(bot);
                logs = getTotalLogs(inv); planks = getTotalPlanks(inv);
            }
            if (planks >= 2) {
                say("Crafting sticks...");
                await skills.craftRecipe(bot, "stick", 1);
                inv = world.getInventoryCounts(bot);
                planks = getTotalPlanks(inv); sticks = inv["stick"] || 0;
            }
        }

        // Step 3: Planks untuk kepala pickaxe (butuh 3)
        if (planks < 3 && logs > 0) {
            say("Converting log to planks (for pickaxe head)...");
            pType = getPlankType(inv);
            await skills.craftRecipe(bot, pType, 1);
            inv = world.getInventoryCounts(bot);
            planks = getTotalPlanks(inv);
        }

        // Step 4: Craft wooden pickaxe
        if (planks >= 3 && sticks >= 2 && hasTable) {
            say("Crafting wooden pickaxe...");
            await skills.craftRecipe(bot, "wooden_pickaxe", 1);
            inv = world.getInventoryCounts(bot);
            bestPick = getBestPickaxe(inv);
        }
    }

    if (bestPick) {
        say(`Equipping ${bestPick}...`);
        await skills.equip(bot, bestPick);
    } else {
        say("Warning: No pickaxe available. Mining may be slow or fail.");
    }

    // ── FASE 2: Tambang coal_ore sampai target ────────────────────
    let inv2 = world.getInventoryCounts(bot);
    let coal = inv2["coal"] || 0;
    say(`Coal in inventory: ${coal}/${TARGET}`);

    while (coal < TARGET) {
        if (bot.interrupt_code) {
            say("Interrupted. Stopping coal miner.");
            return;
        }

        // Cari coal_ore atau deepslate_coal_ore terdekat
        let target  = null;
        let nearest = Infinity;
        for (const name of COAL_BLOCKS) {
            const blk = world.getNearestBlock(bot, name, 64);
            if (blk) {
                const d = bot.entity.position.distanceTo(blk.position);
                if (d < nearest) { nearest = d; target = blk; }
            }
        }

        if (!target) {
            say("No coal ore nearby. Moving to search wider area...");
            await skills.moveAway(bot, 20);
            inv2 = world.getInventoryCounts(bot);
            coal = inv2["coal"] || 0;
            continue;
        }

        say(`Mining ${target.name} at (${target.position.x}, ${target.position.y}, ${target.position.z})...`);
        await skills.collectBlock(bot, target.name, 1);

        inv2 = world.getInventoryCounts(bot);
        coal = inv2["coal"] || 0;
        say(`Progress: ${coal}/${TARGET}`);
    }

    say("Goal reached! 10 coal collected successfully.");
}
