/**
 * auto_farmer.js - Custom script for Mindcraft bot (Dryzikhov)
 *
 * Alur kerja:
 *  1. Scan area dalam radius 32 blok mencari tanaman matang:
 *     - wheat (age >= 7)
 *     - carrots (age >= 7)
 *     - potatoes (age >= 7)
 *     - beetroots (age >= 3)
 *  2. Jika ada:
 *     - Dekati tanaman, panen (break block).
 *     - Ambil item yang jatuh.
 *     - Tanam kembali benih yang sesuai pada farmland di bawahnya.
 *  3. Jika tidak ada tanaman matang:
 *     - Cari farmland kosong (berlahan udara di atasnya).
 *     - Tanam benih yang tersedia di inventory (seeds, carrot, potato, dll).
 *  4. Proteksi terintegrasi: combatGuard jika diserang monster, dan recoverFromStuck jika macet.
 *  5. Berjalan terus-menerus secara dinamis sampai di-interrupt.
 */

const HOSTILE_MOBS = new Set([
    "zombie", "skeleton", "creeper", "spider", "cave_spider",
    "enderman", "witch", "slime", "phantom", "drowned",
    "husk", "stray", "wither_skeleton", "piglin", "piglin_brute",
    "vindicator", "evoker", "pillager", "ravager", "blaze",
    "ghast", "magma_cube", "shulker", "vex", "warden", "bogged", "breeze"
]);

const CROP_TO_SEED = {
    'wheat': 'wheat_seeds',
    'carrots': 'carrot',
    'potatoes': 'potato',
    'beetroots': 'beetroot_seeds'
};

const SEED_TO_CROP = {
    'wheat_seeds': 'wheat',
    'carrot': 'carrots',
    'potato': 'potatoes',
    'beetroot_seeds': 'beetroots'
};

function isFullyGrown(block) {
    if (!block) return false;
    const name = block.name;
    const age = block.metadata; // metadata/age
    if (name === 'wheat' || name === 'carrots' || name === 'potatoes') {
        return age >= 7;
    }
    if (name === 'beetroots') {
        return age >= 3;
    }
    return false;
}

async function combatGuard(bot, skills, world, say) {
    console.log(`[DEBUG COMBAT] Running combat check. Bot Health: ${bot.health}/20. Position: ${bot.entity.position}`);
    const HOSTILE_SET = new Set(HOSTILE_MOBS);

    const monsters = Object.values(bot.entities).filter(e =>
        e.type === 'mob' && e.isValid &&
        HOSTILE_SET.has(e.name) &&
        bot.entity.position.distanceTo(e.position) < 16
    );

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

    const WEAPONS = ["netherite_sword", "diamond_sword", "iron_sword",
                     "golden_sword", "stone_sword", "wooden_sword"];
    const inv = world.getInventoryCounts(bot);
    const weapon = WEAPONS.find(w => inv[w] > 0);
    if (weapon) { 
        console.log(`[DEBUG COMBAT] Found sword: ${weapon}. Attempting to equip...`);
        await skills.equip(bot, weapon); 
        say(`Equipped ${weapon}.`); 
    } else { 
        console.log(`[DEBUG COMBAT] No sword found in inventory. Fighting with current item/fists.`);
        say("No sword. Fighting with current tool!"); 
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
    console.log(`[DEBUG COMBAT] Combat loop finished. Returning to task.`);
    say("⚔️ Combat over. Resuming task...");
    return true;
}

async function recoverFromStuck(bot, skills, say) {
    console.warn(`[DEBUG STUCK] recoverFromStuck triggered. Bot position: ${bot.entity.position}`);
    say("🔴 I'm Stuck!");
    bot.clearControlStates();
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
    }
    say("🟢 I'm Free!");
}

export default async function run(bot, skills, world, agent) {
    const say = (msg) => {
        const full = `[Farmer] ${msg}`;
        if (agent && typeof agent.openChat === "function") agent.openChat(full);
        else bot.chat(full);
        console.log(full);
    };

    say("Starting automatic farming loop...");

    while (true) {
        if (bot.interrupt_code) {
            say("Interrupt signal received. Stopping farmer.");
            return;
        }

        // 1. Combat check
        await combatGuard(bot, skills, world, say);

        // 2. Cari tanaman yang matang di radius 32
        let harvestTarget = null;
        let shortestDist = Infinity;

        // Scan blok sekitar menggunakan world helper
        const cropNames = Object.keys(CROP_TO_SEED);
        for (const cropName of cropNames) {
            const block = world.getNearestBlock(bot, cropName, 32);
            if (block && isFullyGrown(block)) {
                const d = bot.entity.position.distanceTo(block.position);
                if (d < shortestDist) {
                    shortestDist = d;
                    harvestTarget = block;
                }
            }
        }

        // FASE A: Memanen tanaman matang
        if (harvestTarget) {
            say(`Harvesting mature ${harvestTarget.name} at (${harvestTarget.position.x}, ${harvestTarget.position.y}, ${harvestTarget.position.z})...`);
            
            const startPos = bot.entity.position.clone();
            const pos = harvestTarget.position;

            try {
                // Pergi ke tanaman
                await skills.goToPosition(bot, pos.x, pos.y, pos.z, 2);
                
                // Break block
                const blockToBreak = bot.blockAt(pos);
                if (blockToBreak && blockToBreak.name !== 'air') {
                    await bot.dig(blockToBreak);
                }
                
                // Ambil drops
                await new Promise(r => setTimeout(r, 500));
                await skills.pickupNearbyItems(bot);
                
                // Tanam kembali benih yang sesuai
                const seedName = CROP_TO_SEED[harvestTarget.name];
                let inv = world.getInventoryCounts(bot);
                if (inv[seedName] > 0) {
                    say(`Re-planting ${seedName} on farmland at (${pos.x}, ${pos.y - 1}, ${pos.z})...`);
                    await skills.tillAndSow(bot, pos.x, pos.y - 1, pos.z, seedName);
                } else {
                    say(`No ${seedName} in inventory to replant.`);
                }
            } catch (err) {
                say(`Farming error during harvest: ${err.message || err}`);
                await combatGuard(bot, skills, world, say);
                await recoverFromStuck(bot, skills, say);
                continue;
            }

            // Stuck detection pasif
            const endPos = bot.entity.position;
            if (endPos.distanceTo(startPos) < 0.2) {
                // Jika bot tidak bergerak sama sekali
                await recoverFromStuck(bot, skills, say);
            }
            
            await new Promise(r => setTimeout(r, 500));
            continue; // Loop kembali untuk cari target berikutnya
        }

        // FASE B: Menanam benih pada Farmland kosong (jika tidak ada tanaman matang)
        let emptyFarmland = null;
        let shortestFarmlandDist = Infinity;

        // Cari farmland terdekat
        const farmlandBlock = world.getNearestBlock(bot, 'farmland', 32);
        if (farmlandBlock) {
            // Cek apakah di atas farmland tersebut adalah udara (air)
            const aboveBlock = bot.blockAt(farmlandBlock.position.offset(0, 1, 0));
            if (aboveBlock && aboveBlock.name === 'air') {
                emptyFarmland = farmlandBlock;
            }
        }

        if (emptyFarmland) {
            let inv = world.getInventoryCounts(bot);
            // Cari benih apa saja yang dimiliki di inventory
            const seedToPlant = Object.keys(SEED_TO_CROP).find(seed => inv[seed] > 0);

            if (seedToPlant) {
                const pos = emptyFarmland.position;
                say(`Found empty farmland. Planting ${seedToPlant} at (${pos.x}, ${pos.y}, ${pos.z})...`);
                
                try {
                    await skills.tillAndSow(bot, pos.x, pos.y, pos.z, seedToPlant);
                    await new Promise(r => setTimeout(r, 500));
                } catch (err) {
                    say(`Farming error during planting: ${err.message || err}`);
                    await combatGuard(bot, skills, world, say);
                    await recoverFromStuck(bot, skills, say);
                }
                continue;
            }
        }

        // FASE C: Jika tidak ada kerjaan (tidak ada yang bisa dipanen/ditanam)
        say("All crops are clean and planted. Waiting for crops to grow...");
        await new Promise(r => setTimeout(r, 10000)); // Istirahat 10 detik sebelum scan ulang
    }
}
