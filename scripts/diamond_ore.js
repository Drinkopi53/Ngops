/**
 * diamond_ore.js - Custom script for Mindcraft bot (Dryzikhov)
 *
 * Alur kerja:
 *  1. Periksa pickaxe — butuh MINIMUM iron_pickaxe (wooden/stone tidak
 *     bisa mendrop diamond).
 *  2. Jika hanya punya wooden/stone pickaxe atau tidak punya sama sekali:
 *     a. Kumpulkan kayu -> buat crafting_table -> buat wooden_pickaxe.
 *     b. Tambang cobblestone -> upgrade ke stone_pickaxe.
 *     c. Tambang iron_ore -> smelt raw_iron -> craft iron_pickaxe.
 *  3. Equip iron_pickaxe (atau yang lebih baik).
 *  4. Navigasi turun ke Y = -58 (diamond level di 1.18+).
 *  5. Tambang deepslate_diamond_ore / diamond_ore sampai 10 diamonds.
 */

const WOOD_TYPES = [
    "oak_log", "birch_log", "spruce_log", "jungle_log",
    "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log"
];

// Urutan prioritas pickaxe (terbaik ke terburuk)
const PICKAXES = [
    "netherite_pickaxe", "diamond_pickaxe", "iron_pickaxe",
    "golden_pickaxe", "stone_pickaxe", "wooden_pickaxe"
];

// Pickaxe yang valid untuk menambang diamond
const VALID_FOR_DIAMOND = [
    "netherite_pickaxe", "diamond_pickaxe", "iron_pickaxe"
];

const DIAMOND_BLOCKS = ["deepslate_diamond_ore", "diamond_ore"];
const IRON_BLOCKS    = ["iron_ore", "deepslate_iron_ore"];

// ── Helper functions ──────────────────────────────────────────
function getBestPickaxe(inv) {
    for (const p of PICKAXES) { if (inv[p] > 0) return p; }
    return null;
}

function isValidForDiamond(pickaxe) {
    return pickaxe && VALID_FOR_DIAMOND.includes(pickaxe);
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

// Buat crafting table + sticks + pickaxe dari bahan yang ada
async function craftPickaxe(bot, skills, world, say, pickaxeItem) {
    let inv = world.getInventoryCounts(bot);

    // Pastikan crafting table tersedia
    const nbTable = world.getNearestBlock(bot, "crafting_table", 16);
    let hasTable  = (inv["crafting_table"] || 0) > 0 || nbTable !== null;

    if (!hasTable) {
        let planks = getTotalPlanks(inv);
        let logs   = getTotalLogs(inv);
        const pType = getPlankType(inv);
        if (planks < 4 && logs > 0) {
            await skills.craftRecipe(bot, pType, 1);
            inv = world.getInventoryCounts(bot);
            planks = getTotalPlanks(inv);
        }
        if (planks >= 4) {
            say("Crafting crafting table...");
            await skills.craftRecipe(bot, "crafting_table", 1);
            inv = world.getInventoryCounts(bot);
            hasTable = true;
        }
    }
    if (!hasTable) { say("Cannot craft: no crafting table!"); return false; }

    // Pastikan sticks tersedia
    let sticks = inv["stick"] || 0;
    if (sticks < 2) {
        let planks = getTotalPlanks(inv);
        const pType = getPlankType(inv);
        if (planks < 2 && getTotalLogs(inv) > 0) {
            await skills.craftRecipe(bot, pType, 1);
            inv = world.getInventoryCounts(bot);
            planks = getTotalPlanks(inv);
        }
        if (planks >= 2) {
            await skills.craftRecipe(bot, "stick", 1);
            inv = world.getInventoryCounts(bot);
            sticks = inv["stick"] || 0;
        }
    }

    // Craft pickaxe
    say(`Crafting ${pickaxeItem}...`);
    await skills.craftRecipe(bot, pickaxeItem, 1);
    return true;
}

// ── Combat Guard (shared by all ore scripts) ─────────────────
const HOSTILE_MOBS = new Set([
    "zombie", "skeleton", "creeper", "spider", "cave_spider",
    "enderman", "witch", "slime", "phantom", "drowned",
    "husk", "stray", "wither_skeleton", "piglin", "piglin_brute",
    "vindicator", "evoker", "pillager", "ravager", "blaze",
    "ghast", "magma_cube", "shulker", "vex", "warden", "bogged", "breeze"
]);

let lastSwordCraftTime = 0;
let lastShieldCraftTime = 0;

async function ensureSword(bot, skills, world, say) {
    if (Date.now() - lastSwordCraftTime < 15000) return null;

    let inv = world.getInventoryCounts(bot);
    const WEAPONS = [
        "netherite_sword", "netherite_axe",
        "diamond_sword", "diamond_axe",
        "iron_sword", "iron_axe",
        "stone_sword", "stone_axe",
        "wooden_sword", "wooden_axe",
        "golden_sword", "golden_axe"
    ];
    const currentWeapon = WEAPONS.find(w => inv[w] > 0);
    if (currentWeapon) return currentWeapon;

    // Periksa apakah ada crafting table atau bahan untuk membuatnya.
    const nbTable = world.getNearestBlock(bot, "crafting_table", 16);
    const hasTable = (inv["crafting_table"] || 0) > 0 || nbTable !== null;
    const canCraftTable = (getTotalPlanks(inv) + getTotalLogs(inv) * 4) >= 4;
    if (!hasTable && !canCraftTable) {
        return null;
    }

    // Set cooldown segera setelah mencoba membuat pedang
    lastSwordCraftTime = Date.now();

    let sticks = inv["stick"] || 0;
    
    // 1. Coba craft iron_sword jika punya besi ingot
    let ironIngots = inv["iron_ingot"] || 0;
    if (ironIngots >= 2) {
        if (sticks < 1) {
            let planks = getTotalPlanks(inv);
            if (planks < 2 && getTotalLogs(inv) > 0) {
                const pType = getPlankType(inv);
                await skills.craftRecipe(bot, pType, 1);
                inv = world.getInventoryCounts(bot);
            }
            if (getTotalPlanks(inv) >= 2) {
                await skills.craftRecipe(bot, "stick", 1);
                inv = world.getInventoryCounts(bot);
                sticks = inv["stick"] || 0;
            }
        }
        if (sticks >= 1) {
            say("Crafting iron sword for protection...");
            const success = await skills.craftRecipe(bot, "iron_sword", 1);
            if (success) return "iron_sword";
        }
    }

    // 2. Coba craft stone_sword
    let cobble = (inv["cobblestone"] || 0) + (inv["stone"] || 0);
    if (cobble >= 2) {
        if (sticks < 1) {
            let planks = getTotalPlanks(inv);
            if (planks < 2 && getTotalLogs(inv) > 0) {
                const pType = getPlankType(inv);
                await skills.craftRecipe(bot, pType, 1);
                inv = world.getInventoryCounts(bot);
            }
            if (getTotalPlanks(inv) >= 2) {
                await skills.craftRecipe(bot, "stick", 1);
                inv = world.getInventoryCounts(bot);
                sticks = inv["stick"] || 0;
            }
        }
        if (sticks >= 1) {
            say("Crafting stone sword for protection...");
            const success = await skills.craftRecipe(bot, "stone_sword", 1);
            if (success) return "stone_sword";
        }
    }

    // 3. Coba craft wooden_sword
    let planks = getTotalPlanks(inv);
    if (planks >= 2 || getTotalLogs(inv) > 0) {
        if (planks < 3 && getTotalLogs(inv) > 0) {
            const pType = getPlankType(inv);
            await skills.craftRecipe(bot, pType, 1);
            inv = world.getInventoryCounts(bot);
            planks = getTotalPlanks(inv);
        }
        if (sticks < 1 && planks >= 2) {
            await skills.craftRecipe(bot, "stick", 1);
            inv = world.getInventoryCounts(bot);
            sticks = inv["stick"] || 0;
            planks = getTotalPlanks(inv);
        }
        if (planks >= 2 && sticks >= 1) {
            say("Crafting wooden sword for protection...");
            const success = await skills.craftRecipe(bot, "wooden_sword", 1);
            if (success) return "wooden_sword";
        }
    }

    return null;
}

async function ensureShield(bot, skills, world, say) {
    if (Date.now() - lastShieldCraftTime < 15000) return;

    let inv = world.getInventoryCounts(bot);
    if ((inv["shield"] || 0) > 0) {
        // Pastikan terpasang di off-hand
        const shieldItem = bot.inventory.items().find(i => i.name === 'shield');
        const offhandItem = bot.inventory.slots[45]; // slot off-hand
        if (shieldItem && (!offhandItem || offhandItem.name !== 'shield')) {
            try {
                await bot.equip(shieldItem, 'off-hand');
            } catch (err) {
                console.error(`Failed to equip shield to off-hand:`, err);
            }
        }
        return;
    }

    // Periksa apakah ada crafting table atau bahan untuk membuatnya.
    const nbTable = world.getNearestBlock(bot, "crafting_table", 16);
    const hasTable = (inv["crafting_table"] || 0) > 0 || nbTable !== null;
    const canCraftTable = (getTotalPlanks(inv) + getTotalLogs(inv) * 4) >= 4;
    if (!hasTable && !canCraftTable) {
        return;
    }

    let iron = inv["iron_ingot"] || 0;
    let planks = getTotalPlanks(inv);
    let logs = getTotalLogs(inv);

    if (iron >= 1 && (planks >= 6 || (planks + logs * 4) >= 6)) {
        // Set cooldown segera setelah mencoba membuat tameng
        lastShieldCraftTime = Date.now();

        if (planks < 6) {
            const neededLogs = Math.ceil((6 - planks) / 4);
            const pType = getPlankType(inv);
            await skills.craftRecipe(bot, pType, neededLogs);
            inv = world.getInventoryCounts(bot);
        }
        say("Crafting shield for protection...");
        const success = await skills.craftRecipe(bot, "shield", 1);
        if (success) {
            inv = world.getInventoryCounts(bot);
            const shieldItem = bot.inventory.items().find(i => i.name === 'shield');
            if (shieldItem) {
                try {
                    await bot.equip(shieldItem, 'off-hand');
                    say("Equipped shield to off-hand.");
                } catch (err) {
                    console.error(`Failed to equip newly crafted shield:`, err);
                }
            }
        }
    }
}

async function combatGuard(bot, skills, world, say, toolToReequip) {
    console.log(`[DEBUG COMBAT] Running combat check. Bot Health: ${bot.health}/20. Position: ${bot.entity.position}`);
    const HOSTILE_SET = new Set(HOSTILE_MOBS);

    const monsters = Object.values(bot.entities).filter(e => {
        if (!e || !e.name || !e.position) return false;
        const isMobType = e.type === 'mob' || e.type === 'hostile' || e.type === 'monster';
        const isNotGolem = e.name !== 'iron_golem' && e.name !== 'snow_golem';
        const distance = bot.entity.position.distanceTo(e.position);
        return isMobType && isNotGolem && HOSTILE_SET.has(e.name) && distance < 16;
    });

    if (monsters.length === 0) {
        console.log(`[DEBUG COMBAT] No hostile mobs detected in 16 blocks radius.`);
        return false;
    }

    console.log(`[DEBUG COMBAT] Hostile mobs detected:`, monsters.map(m => `${m.name} (dist: ${Math.round(bot.entity.position.distanceTo(m.position))}m)`));

    monsters.sort((a, b) =>
        bot.entity.position.distanceTo(a.position) -
        bot.entity.position.distanceTo(b.position)
    );

    say(`⚔️ ${monsters.length} monster(s) nearby! Pausing task to fight...`);

    const WEAPONS = [
        "netherite_sword", "netherite_axe",
        "diamond_sword", "diamond_axe",
        "iron_sword", "iron_axe",
        "stone_sword", "stone_axe",
        "wooden_sword", "wooden_axe",
        "golden_sword", "golden_axe"
    ];
    let inv = world.getInventoryCounts(bot);
    let weapon = WEAPONS.find(w => inv[w] > 0);
    
    if (!weapon) {
        // Coba buat pedang secara dinamis
        weapon = await ensureSword(bot, skills, world, say);
        inv = world.getInventoryCounts(bot);
    }

    if (weapon) { 
        console.log(`[DEBUG COMBAT] Found/Crafted weapon: ${weapon}. Attempting to equip...`);
        await skills.equip(bot, weapon); 
        say(`Equipped ${weapon}.`); 
    } else { 
        console.log(`[DEBUG COMBAT] No weapon found in inventory. Fighting with current item/fists.`);
        say("No weapon. Fighting with current tool!"); 
    }

    // Equip shield to off-hand if available
    if (inv["shield"] > 0) {
        console.log(`[DEBUG COMBAT] Found shield in inventory. Equipping to off-hand...`);
        try {
            const shieldItem = bot.inventory.items().find(i => i.name === 'shield');
            if (shieldItem) await bot.equip(shieldItem, 'off-hand');
        } catch (shieldErr) {
            console.error(`[DEBUG COMBAT ERROR] Failed to equip shield:`, shieldErr);
        }
    }

    for (const mob of monsters) {
        if (bot.interrupt_code) {
            console.log(`[DEBUG COMBAT] Combat interrupted by bot interrupt_code.`);
            break;
        }
        if (!mob.isValid) {
            console.log(`[DEBUG COMBAT] Mob is no longer valid, skipping.`);
            continue;
        }

        // Heal checking during fight
        if (bot.health < 12) {
            console.log(`[DEBUG COMBAT] Health is low (${bot.health}/20). Forcing autoEat eat()...`);
            if (bot.autoEat && typeof bot.autoEat.eat === 'function') {
                try {
                    await bot.autoEat.eat();
                    console.log(`[DEBUG COMBAT] Forced autoEat completed. Health: ${bot.health}`);
                } catch (eatErr) {
                    console.warn(`[DEBUG COMBAT] Forced autoEat failed:`, eatErr);
                }
            }
        }
        
        console.log(`[DEBUG COMBAT] Attacking entity: ${mob.name} (ID: ${mob.id}) at pos ${mob.position}`);
        say(`⚔️ Fighting ${mob.name}...`);
        
        try { 
            await skills.attackEntity(bot, mob); 
            console.log(`[DEBUG COMBAT] Defeated ${mob.name} successfully.`);
            say(`✅ Defeated ${mob.name}!`); 
        } catch (e) { 
            console.error(`[DEBUG COMBAT ERROR] Failed to attack ${mob.name}:`, e);
            say(`Combat: ${e.message}`); 
        }
    }

    if (bot.health < 10) {
        console.log(`[DEBUG COMBAT] Health is low (${bot.health}/20). Resting for 3 seconds...`);
        say(`Health ${bot.health.toFixed(1)}/20. Resting...`);
        await new Promise(r => setTimeout(r, 3000));
    }

    if (toolToReequip) { 
        console.log(`[DEBUG COMBAT] Re-equipping previous tool: ${toolToReequip}`);
        try { await skills.equip(bot, toolToReequip); } catch (e) {
            console.error(`[DEBUG COMBAT ERROR] Failed to re-equip tool ${toolToReequip}:`, e);
        } 
    }
    console.log(`[DEBUG COMBAT] Combat loop finished. Returning to task.`);
    say("⚔️ Combat over. Resuming task...");
    return true;
}

async function recoverFromStuck(bot, skills, say) {
    console.warn(`[DEBUG STUCK] recoverFromStuck triggered. Bot position: ${bot.entity.position}`);
    say("🔴 I'm Stuck!");
    
    console.log(`[DEBUG STUCK] Clearing control states.`);
    bot.clearControlStates();
    
    console.log(`[DEBUG STUCK] Executing recovery jump.`);
    bot.setControlState('jump', true);
    await new Promise(r => setTimeout(r, 250));
    bot.setControlState('jump', false);
    
    try {
        console.log(`[DEBUG STUCK] Attempting to moveAway (3 blocks)...`);
        await skills.moveAway(bot, 3);
        console.log(`[DEBUG STUCK] moveAway completed. Bot position now: ${bot.entity.position}`);
    } catch (e) {
        console.warn(`[DEBUG STUCK ERROR] moveAway failed, executing manual backward movement:`, e);
        bot.setControlState('back', true);
        await new Promise(r => setTimeout(r, 500));
        bot.setControlState('back', false);
        console.log(`[DEBUG STUCK] Manual backward movement completed. Bot position: ${bot.entity.position}`);
    }
    say("🟢 I'm Free!");
}


async function ensureDiamondPickaxe(bot, skills, world, say) {
    let inv = world.getInventoryCounts(bot);
    let bestPick = getBestPickaxe(inv);

    if (!isValidForDiamond(bestPick)) {
        say(`Current pickaxe (${bestPick || "none"}) cannot mine diamonds. Need iron+ pickaxe.`);

        // --- Step A: Pastikan ada wooden pickaxe untuk menambang batu ---
        if (!bestPick) {
            say("No pickaxe at all. Crafting wooden pickaxe first...");
            let logs = getTotalLogs(inv);
            if (logs < 3) {
                const toGet = 3 - logs;
                say(`Collecting ${toGet} log(s) by hand...`);
                let foundType = "oak_log";
                for (const t of WOOD_TYPES) {
                    if (world.getNearestBlock(bot, t, 32)) { foundType = t; break; }
                }
                await skills.collectBlock(bot, foundType, toGet);
                inv = world.getInventoryCounts(bot);
            }

            let planks = getTotalPlanks(inv);
            const pType = getPlankType(inv);
            if (planks < 3) {
                await skills.craftRecipe(bot, pType, 1);
                inv = world.getInventoryCounts(bot);
            }

            await craftPickaxe(bot, skills, world, say, "wooden_pickaxe");
            inv = world.getInventoryCounts(bot);
            bestPick = getBestPickaxe(inv);
        }

        // --- Step B: Tambang cobblestone untuk stone pickaxe ---
        if (bestPick === "wooden_pickaxe") {
            say("Mining cobblestone to upgrade to stone pickaxe...");
            const cobble = (inv["cobblestone"] || 0) + (inv["stone"] || 0);
            if (cobble < 3) {
                await skills.equip(bot, bestPick);
                await skills.collectBlock(bot, "stone", 3 - cobble);
                inv = world.getInventoryCounts(bot);
            }
            const newCobble = (inv["cobblestone"] || 0) + (inv["stone"] || 0);
            if (newCobble >= 3) {
                await craftPickaxe(bot, skills, world, say, "stone_pickaxe");
                inv = world.getInventoryCounts(bot);
                bestPick = getBestPickaxe(inv);
            }
        }

        // --- Step C: Tambang iron ore dan smelt menjadi iron ingot ---
        say("Mining iron ore to craft iron pickaxe...");
        inv = world.getInventoryCounts(bot);
        let ironIngots = inv["iron_ingot"] || 0;
        let rawIron    = inv["raw_iron"] || 0;

        // Butuh minimal 3 iron ingots untuk iron pickaxe
        const neededIngots = Math.max(0, 3 - ironIngots);
        const neededRaw    = Math.max(0, neededIngots - rawIron);

        if (neededRaw > 0) {
            say(`Need ${neededRaw} more raw_iron. Mining iron ore...`);
            let mined = 0;
            while (mined < neededRaw) {
                if (bot.interrupt_code) { say("Interrupted."); return null; }

                let ironTarget = null;
                let nearest    = Infinity;
                for (const name of IRON_BLOCKS) {
                    const blk = world.getNearestBlock(bot, name, 64);
                    if (blk) {
                        const d = bot.entity.position.distanceTo(blk.position);
                        if (d < nearest) { nearest = d; ironTarget = blk; }
                    }
                }
                if (!ironTarget) {
                    say("No iron ore nearby. Moving to search...");
                    await skills.moveAway(bot, 20);
                    continue;
                }
                say(`Mining ${ironTarget.name}...`);
                
                // Equip best pickaxe (wooden or stone) for mining iron
                let bestForIron = getBestPickaxe(inv);
                if (bestForIron) await skills.equip(bot, bestForIron);

                await skills.collectBlock(bot, ironTarget.name, 1);
                inv     = world.getInventoryCounts(bot);
                mined   = inv["raw_iron"] || 0;
                rawIron = mined;
                say(`Raw iron collected: ${mined}/${neededRaw}`);
            }
        }

        // Smelt raw_iron menjadi iron_ingot
        inv     = world.getInventoryCounts(bot);
        rawIron = inv["raw_iron"] || 0;
        if (rawIron > 0) {
            say(`Smelting ${rawIron} raw_iron into iron_ingot...`);

            const hasFurnaceItem = (inv["furnace"] || 0) > 0;
            const nearbyFurnace  = world.getNearestBlock(bot, "furnace", 32);

            if (!nearbyFurnace && !hasFurnaceItem) {
                const cobbleCount = (inv["cobblestone"] || 0);
                if (cobbleCount >= 8) {
                    say("Crafting furnace...");
                    await skills.craftRecipe(bot, "furnace", 1);
                    inv = world.getInventoryCounts(bot);
                } else {
                    say(`Not enough cobblestone for furnace (have ${cobbleCount}/8). Cannot smelt.`);
                    return null;
                }
            }

            const hasFuel = (inv["coal"] || 0) > 0 ||
                            (inv["charcoal"] || 0) > 0 ||
                            getTotalLogs(inv) > 0 ||
                            getTotalPlanks(inv) > 0;

            if (!hasFuel) {
                say("No fuel for furnace. Cannot smelt raw_iron.");
                return null;
            }

            await skills.smeltItem(bot, "raw_iron", rawIron);
            inv = world.getInventoryCounts(bot);
        }

        // Craft iron pickaxe
        inv = world.getInventoryCounts(bot);
        ironIngots = inv["iron_ingot"] || 0;
        if (ironIngots >= 3) {
            say(`Have ${ironIngots} iron_ingot. Crafting iron pickaxe...`);
            await craftPickaxe(bot, skills, world, say, "iron_pickaxe");
            inv = world.getInventoryCounts(bot);
            bestPick = getBestPickaxe(inv);
        } else {
            say(`Not enough iron ingots (have ${ironIngots}, need 3). Cannot craft iron pickaxe.`);
            return null;
        }
    }

    return bestPick;
}

// ── Main script ───────────────────────────────────────────────
export default async function run(bot, skills, world, agent) {
    const say = (msg) => {
        const full = `[DiamondMiner] ${msg}`;
        if (agent && typeof agent.openChat === "function") agent.openChat(full);
        else bot.chat(full);
        console.log(full);
    };

    lastSwordCraftTime = 0;
    lastShieldCraftTime = 0;

    const TARGET = 60;
    say("Starting diamond mining routine...");
    say("WARNING: This will dig deep underground. Make sure you are in a safe area!");

    // ── Pastikan ada iron pickaxe atau lebih baik ─────────────
    let bestPick = await ensureDiamondPickaxe(bot, skills, world, say);
    if (bestPick) {
        say(`Equipping ${bestPick}...`);
        await skills.equip(bot, bestPick);
    } else {
        say("Still no valid pickaxe for diamond. Aborting.");
        return;
    }

    // ── FASE 2: Gali shaft vertikal yang aman ke Y = -58 ─────────
    const targetY = -58;  // Diamond level pada Minecraft 1.18+

    const currentY = Math.floor(bot.entity.position.y);
    if (currentY > targetY) {
        say(`Current Y: ${currentY}. Digging safe shaft down to Y ${targetY}...`);
        say("Digging 1x2 vertical shaft (safe method, no falling risk).");

        let stuckCounter = 0;
        let lastY = currentY;

        while (Math.floor(bot.entity.position.y) > targetY + 1) {
            if (bot.interrupt_code) { say("Interrupted."); return; }

            // ── Pastikan memiliki pedang untuk pertahanan diri ──
            await ensureSword(bot, skills, world, say);

            // ── Pastikan memiliki shield untuk pertahanan diri ──
            await ensureShield(bot, skills, world, say);

            // Pastikan ada pickaxe untuk menggali
            bestPick = await ensureDiamondPickaxe(bot, skills, world, say);
            if (bestPick) await skills.equip(bot, bestPick);

            // ── Combat Guard: Hentikan penggalian jika ada monster mendekat! ──
            await combatGuard(bot, skills, world, say, bestPick);
            
            // Sinkronisasi koordinat pasca-combat
            if (Math.floor(bot.entity.position.y) <= targetY + 1) break;

            const posNow = bot.entity.position;
            const nowY   = Math.floor(posNow.y);

            // Deteksi stuck: jika Y tidak berubah setelah beberapa iterasi
            if (nowY === lastY) {
                stuckCounter++;
                if (stuckCounter > 20) {
                    say(`Stuck at Y ${nowY}. Nudging forward to slide off ledge...`);
                    // Nudge forward sedikit untuk meluncur dari tepi blok ke dalam lubang
                    bot.setControlState('forward', true);
                    await new Promise(r => setTimeout(r, 250));
                    bot.setControlState('forward', false);
                    stuckCounter = 0;
                }
            } else {
                stuckCounter = 0;
                lastY = nowY;
            }

            // Gali blok di bawah kaki (y-1), kaki (y), dan kepala (y+1)
            const targets = [
                bot.blockAt(posNow.offset(0, -1, 0)),  // blok di bawah kaki
                bot.blockAt(posNow.offset(0,  0, 0)),  // blok di kaki
                bot.blockAt(posNow.offset(0,  1, 0)),  // blok setinggi kepala
            ];

            let dugAny = false;
            for (const blk of targets) {
                if (!blk) continue;
                const n = blk.name;
                // Hanya gali blok solid (bukan air, udara, lava, bedrock)
                if (n === "air" || n === "water" || n === "lava" || n === "bedrock") continue;
                try {
                    // Gunakan bot.dig langsung tanpa canDigBlock karena bot sering memblokir line-of-sight dirinya sendiri
                    await bot.dig(blk);
                    dugAny = true;
                } catch (_) { /* blok tidak bisa digali, skip */ }
            }

            // Jika shaft sudah terbuka, beri waktu untuk jatuh/turun
            if (!dugAny) {
                await new Promise(r => setTimeout(r, 150));
            } else {
                await new Promise(r => setTimeout(r, 250));
            }

            // Log progress setiap 10 blok
            const newY = Math.floor(bot.entity.position.y);
            if (Math.abs(newY - lastY) >= 10 || (lastY !== nowY && newY % 10 === 0)) {
                say(`Descending... Y: ${newY} → target: ${targetY}`);
            }
        }

        say(`Reached Y: ${Math.floor(bot.entity.position.y)}. Searching for diamonds...`);
    } else {
        say(`Already at Y ${currentY}, at or below diamond level. Good!`);
    }

    // ── FASE 3: Tambang diamond ore sampai 10 diamonds ───────────
    let inv3    = world.getInventoryCounts(bot);
    let diamonds = inv3["diamond"] || 0;
    say(`Diamonds in inventory: ${diamonds}/${TARGET}`);

    // Blacklist untuk menyimpan koordinat bijih berlian yang tidak dapat dijangkau
    const blacklist = new Set();

    while (diamonds < TARGET) {
        if (bot.interrupt_code) {
            say("Interrupted. Stopping diamond miner.");
            return;
        }

        // ── Pastikan memiliki pedang untuk pertahanan diri ──
        await ensureSword(bot, skills, world, say);

        // ── Pastikan memiliki shield untuk pertahanan diri ──
        await ensureShield(bot, skills, world, say);

        // ── Pastikan ada iron+ pickaxe dan di-equip ──
        bestPick = await ensureDiamondPickaxe(bot, skills, world, say);
        if (!bestPick) {
            say("Cannot mine: No valid iron+ pickaxe available. Retrying...");
            await new Promise(r => setTimeout(r, 3000));
            continue;
        }
        await skills.equip(bot, bestPick);

        // ── Combat Guard: lawan monster sebelum lanjut gali ──
        await combatGuard(bot, skills, world, say, bestPick);
        inv3     = world.getInventoryCounts(bot);
        diamonds = inv3["diamond"] || 0;
        if (diamonds >= TARGET) break;

        // Cari deepslate_diamond_ore atau diamond_ore terdekat (menggunakan pencarian cepat native)
        let target  = null;
        let nearest = Infinity;
        const blocks = world.getNearestBlocks(bot, DIAMOND_BLOCKS, 32, 32);
        
        for (const blk of blocks) {
            if (!blk || !blk.position) continue;
            const posKey = `${blk.position.x},${blk.position.y},${blk.position.z}`;
            if (blacklist.has(posKey)) continue;

            const d = bot.entity.position.distanceTo(blk.position);
            if (d < nearest) {
                nearest = d;
                target = blk;
            }
        }

        if (!target) {
            // Tidak ada di sekitar — bergerak untuk menjelajah area baru
            say("No reachable diamond ore visible. Exploring nearby area...");
            await skills.moveAway(bot, 10);

            // Pastikan tetap di level diamond
            const nowY = Math.floor(bot.entity.position.y);
            if (nowY > targetY + 5) {
                say(`Drifted up to Y ${nowY}. Going back down to Y ${targetY}...`);
                await skills.goToPosition(
                    bot,
                    Math.floor(bot.entity.position.x),
                    targetY,
                    Math.floor(bot.entity.position.z),
                    2
                );
            }

            inv3     = world.getInventoryCounts(bot);
            diamonds = inv3["diamond"] || 0;
            continue;
        }

        say(`Mining ${target.name} at (${target.position.x}, ${target.position.y}, ${target.position.z})...`);
        
        const startPos = bot.entity.position.clone();
        const startDiamonds = diamonds;

        try {
            await skills.collectBlock(bot, target.name, 1);
        } catch (err) {
            say(`Mining failed: ${err.message || err}`);
            await combatGuard(bot, skills, world, say, bestPick);
            await recoverFromStuck(bot, skills, say);
            inv3     = world.getInventoryCounts(bot);
            diamonds = inv3["diamond"] || 0;
            continue;
        }

        inv3     = world.getInventoryCounts(bot);
        diamonds = inv3["diamond"] || 0;
        const endPos = bot.entity.position;

        if (diamonds === startDiamonds && endPos.distanceTo(startPos) < 0.5) {
            // Gagal menambang dan posisi tidak berubah -> Masukkan ke blacklist
            const posKey = `${target.position.x},${target.position.y},${target.position.z}`;
            blacklist.add(posKey);
            console.log(`[DEBUG MINING] Blacklisted unreachable block: ${target.name} at ${target.position}`);
            
            await recoverFromStuck(bot, skills, say);
            inv3     = world.getInventoryCounts(bot);
            diamonds = inv3["diamond"] || 0;
            continue;
        }

        say(`Progress: ${diamonds}/${TARGET} diamonds`);
    }

    say(`Goal reached! Collected ${diamonds} diamonds successfully!`);
    say("TIP: Return to surface carefully. Use !goToPosition to get back.");
}
