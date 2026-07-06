/**
 * iron_ore.js - Custom script for Mindcraft bot (Dryzikhov)
 *
 * Alur kerja:
 *  1. Periksa apakah ada pickaxe di inventory (stone+ lebih efisien).
 *  2. Jika tidak ada: kumpulkan kayu -> buat crafting table -> buat
 *     wooden_pickaxe. Jika punya cobblestone, upgrade ke stone_pickaxe.
 *  3. Equip pickaxe terbaik yang ada.
 *  4. Tambang iron_ore / deepslate_iron_ore sampai 10 raw_iron.
 *  5. Smelt raw_iron menjadi iron_ingot jika ada furnace di sekitar
 *     (atau bot bisa menaruh furnace dari inventory).
 */

const WOOD_TYPES = [
    "oak_log", "birch_log", "spruce_log", "jungle_log",
    "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log"
];

const PICKAXES = [
    "netherite_pickaxe", "diamond_pickaxe", "iron_pickaxe",
    "golden_pickaxe", "stone_pickaxe", "wooden_pickaxe"
];

const IRON_BLOCKS = ["iron_ore", "deepslate_iron_ore"];

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

const HOSTILE_MOBS = new Set([
    "zombie", "skeleton", "creeper", "spider", "cave_spider",
    "enderman", "witch", "slime", "phantom", "drowned",
    "husk", "stray", "wither_skeleton", "piglin", "piglin_brute",
    "vindicator", "evoker", "pillager", "ravager", "blaze",
    "ghast", "magma_cube", "shulker", "vex", "warden", "bogged", "breeze"
]);

async function combatGuard(bot, skills, world, say, toolToReequip) {
    const monsters = Object.values(bot.entities).filter(e =>
        e.type === 'mob' && e.isValid &&
        HOSTILE_MOBS.has(e.name) &&
        bot.entity.position.distanceTo(e.position) < 16
    );
    if (monsters.length === 0) return false;
    monsters.sort((a, b) =>
        bot.entity.position.distanceTo(a.position) -
        bot.entity.position.distanceTo(b.position)
    );
    say(`⚔️ ${monsters.length} monster(s) nearby! Pausing task to fight...`);
    const WEAPONS = ["netherite_sword", "diamond_sword", "iron_sword",
                     "golden_sword", "stone_sword", "wooden_sword"];
    const inv = world.getInventoryCounts(bot);
    const weapon = WEAPONS.find(w => inv[w] > 0);
    if (weapon) { await skills.equip(bot, weapon); say(`Equipped ${weapon}.`); }
    else { say("No sword. Fighting with current tool!"); }
    for (const mob of monsters) {
        if (bot.interrupt_code || !mob.isValid) continue;
        say(`⚔️ Fighting ${mob.name}...`);
        try { await skills.attackEntity(bot, mob); say(`✅ Defeated ${mob.name}!`); }
        catch (e) { say(`Combat: ${e.message}`); }
    }
    if (bot.health < 10) {
        say(`Health ${bot.health.toFixed(1)}/20. Resting...`);
        await new Promise(r => setTimeout(r, 3000));
    }
    if (toolToReequip) { try { await skills.equip(bot, toolToReequip); } catch (_) {} }
    say("⚔️ Combat over. Resuming task...");
    return true;
}

export default async function run(bot, skills, world, agent) {
    const say = (msg) => {
        const full = `[IronMiner] ${msg}`;
        if (agent && typeof agent.openChat === "function") agent.openChat(full);
        else bot.chat(full);
        console.log(full);
    };

    const TARGET_RAW_IRON = 10;
    say("Starting iron mining routine...");

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

    // ── UPGRADE ke stone pickaxe jika punya cobblestone ──────────
    // Stone pickaxe jauh lebih efisien untuk menambang iron ore.
    if (bestPick === "wooden_pickaxe") {
        inv = world.getInventoryCounts(bot);
        const cobble = (inv["cobblestone"] || 0) + (inv["stone"] || 0);
        const sticks2 = inv["stick"] || 0;

        if (cobble >= 3 && sticks2 >= 2) {
            say("Have enough cobblestone. Upgrading to stone pickaxe...");
            await skills.craftRecipe(bot, "stone_pickaxe", 1);
            inv = world.getInventoryCounts(bot);
            const upgraded = getBestPickaxe(inv);
            if (upgraded === "stone_pickaxe") bestPick = upgraded;
        } else if (cobble >= 3 && sticks2 < 2) {
            // Craft sticks terlebih dahulu jika butuh
            const planksForStick = getTotalPlanks(inv);
            if (planksForStick >= 2) {
                await skills.craftRecipe(bot, "stick", 1);
                inv = world.getInventoryCounts(bot);
                await skills.craftRecipe(bot, "stone_pickaxe", 1);
                inv = world.getInventoryCounts(bot);
                const upgraded = getBestPickaxe(inv);
                if (upgraded === "stone_pickaxe") bestPick = upgraded;
            }
        }
    }

    if (bestPick) {
        say(`Equipping ${bestPick}...`);
        await skills.equip(bot, bestPick);
    } else {
        say("Warning: No pickaxe available. Mining may fail on iron ore.");
    }

    // ── FASE 2: Tambang iron_ore sampai 10 raw_iron ──────────────
    let inv2       = world.getInventoryCounts(bot);
    let rawIron    = inv2["raw_iron"] || 0;
    say(`Raw iron in inventory: ${rawIron}/${TARGET_RAW_IRON}`);

    while (rawIron < TARGET_RAW_IRON) {
        if (bot.interrupt_code) {
            say("Interrupted. Stopping iron miner.");
            return;
        }

        // ── Combat Guard ──
        await combatGuard(bot, skills, world, say, bestPick);
        inv2    = world.getInventoryCounts(bot);
        rawIron = inv2["raw_iron"] || 0;
        if (rawIron >= TARGET_RAW_IRON) break;

        // Cari iron_ore atau deepslate_iron_ore terdekat
        let target  = null;
        let nearest = Infinity;
        for (const name of IRON_BLOCKS) {
            const blk = world.getNearestBlock(bot, name, 64);
            if (blk) {
                const d = bot.entity.position.distanceTo(blk.position);
                if (d < nearest) { nearest = d; target = blk; }
            }
        }

        if (!target) {
            say("No iron ore nearby. Moving to search wider area...");
            await skills.moveAway(bot, 20);
            inv2    = world.getInventoryCounts(bot);
            rawIron = inv2["raw_iron"] || 0;
            continue;
        }

        say(`Mining ${target.name} at (${target.position.x}, ${target.position.y}, ${target.position.z})...`);
        await skills.collectBlock(bot, target.name, 1);

        inv2    = world.getInventoryCounts(bot);
        rawIron = inv2["raw_iron"] || 0;
        say(`Progress: ${rawIron}/${TARGET_RAW_IRON}`);
    }

    say(`Collected ${rawIron} raw iron! Starting smelting phase...`);

    // ── FASE 3: Smelt raw_iron menjadi iron_ingot ─────────────────
    // Cari atau buat furnace, kemudian smelt semua raw_iron.
    inv2 = world.getInventoryCounts(bot);
    const totalRaw = inv2["raw_iron"] || 0;

    if (totalRaw > 0) {
        // Cek apakah ada furnace di inventory atau di sekitar
        const hasFurnaceItem = (inv2["furnace"] || 0) > 0;
        const nearbyFurnace  = world.getNearestBlock(bot, "furnace", 32);

        if (!nearbyFurnace && !hasFurnaceItem) {
            // Buat furnace dari cobblestone jika tersedia
            const cobbleCount = (inv2["cobblestone"] || 0) + (inv2["stone"] || 0);
            if (cobbleCount >= 8) {
                say("Crafting furnace from cobblestone...");
                await skills.craftRecipe(bot, "furnace", 1);
                inv2 = world.getInventoryCounts(bot);
            } else {
                say(`Not enough cobblestone for furnace (need 8, have ${cobbleCount}). Skipping smelting.`);
                say(`You have ${totalRaw} raw_iron in inventory. Smelt manually with !smeltItem("raw_iron", ${totalRaw})`);
                say("Iron mining routine finished.");
                return;
            }
        }

        // Cek bahan bakar untuk furnace
        const hasFuel = (inv2["coal"] || 0) > 0 ||
                        (inv2["charcoal"] || 0) > 0 ||
                        getTotalLogs(inv2) > 0 ||
                        getTotalPlanks(inv2) > 0;

        if (!hasFuel) {
            say("No fuel available for smelting. Skipping smelt phase.");
            say(`You have ${totalRaw} raw_iron. Smelt manually with !smeltItem("raw_iron", ${totalRaw})`);
            say("Iron mining routine finished.");
            return;
        }

        say(`Smelting ${totalRaw} raw_iron into iron_ingot...`);
        await skills.smeltItem(bot, "raw_iron", totalRaw);

        inv2 = world.getInventoryCounts(bot);
        const ingots = inv2["iron_ingot"] || 0;
        say(`Smelting complete! Got ${ingots} iron_ingot.`);
    }

    say("Goal reached! Iron mining and smelting routine completed successfully.");
}
