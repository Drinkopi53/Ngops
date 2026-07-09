import * as mc from '../src/utils/mcdata.js';

/**
 * Iron Ore Miner Script - Mindcraft Deterministic Automation
 *
 * Script ini berjalan secara statis dan deterministik.
 * Mengumpulkan 100 Iron Ore, secara otomatis menggali ke kedalaman iron (Y=16) dan
 * melakukan branch mining jika tidak menemukan ore di area saat ini.
 */

export async function main(bot, skills, world) {
    const TARGET_ORE = 'iron_ore';
    const TARGET_QTY = 100;
    const SEARCH_RADIUS = 64;
    const TARGET_Y = 16; // Optimal for iron in 1.18+ is ~16 (or higher in mountains)

    console.log(`[Script] Memulai penambangan otomatis ${TARGET_QTY} ${TARGET_ORE}...`);
    skills.log(bot, `Memulai script pencarian ${TARGET_QTY} ${TARGET_ORE}...`);

    let hasPickaxe = bot.inventory.items().some(item => item.name.includes('pickaxe'));
    if (!hasPickaxe) {
        skills.log(bot, `Saya tidak memiliki Pickaxe (Beliung) di inventory! Script dihentikan.`);
        console.log(`[Script] Pickaxe tidak ditemukan. Menghentikan script.`);
        return;
    }

    let inventory = world.getInventoryCounts(bot);
    let currentIron = (inventory['raw_iron'] || 0) + (inventory['iron_ore'] || 0) + (inventory['deepslate_iron_ore'] || 0);

    if (currentIron >= TARGET_QTY) {
        skills.log(bot, `Target ${TARGET_QTY} Iron telah tercapai! (Sudah ada di inventory).`);
        console.log(`[Script] Selesai di awal. Total terkumpul: ${currentIron}`);
        return;
    }

    bot.scriptMemory = bot.scriptMemory || {};
    bot.scriptMemory.iron_ore = bot.scriptMemory.iron_ore || {
        failedAttempts: 0,
        ignoreBlocks: [],
        dugDown: false
    };

    let { failedAttempts, ignoreBlocks, dugDown } = bot.scriptMemory.iron_ore;

    while (Math.round(bot.entity.position.y) > TARGET_Y && !dugDown) {
        if (bot.interrupt_code) {
             bot.scriptMemory.iron_ore = { failedAttempts, ignoreBlocks, dugDown };
             return;
        }

        let enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), 16);
        if (enemy) {
            console.log(`[Script] Musuh terdeteksi: ${enemy.name}. Melawan balik...`);
            await skills.defendSelf(bot, 16);
            continue;
        }

        skills.log(bot, `Saat ini di Y=${Math.round(bot.entity.position.y)}. Menggali turun menuju Y=${TARGET_Y}...`);
        console.log(`[Script] Menggali turun ke Y=${TARGET_Y}...`);

        let dug = await skills.digDown(bot, Math.min(10, Math.round(bot.entity.position.y) - TARGET_Y));
        if (!dug) {
            skills.log(bot, `Terhalang bahaya (lava/air/jatuh) saat menggali turun. Bergeser sedikit...`);
            let moved = await skills.moveAway(bot, 5);
            if (!moved) {
                 bot.setControlState('jump', true);
                 bot.setControlState('forward', true);
                 await new Promise(r => setTimeout(r, 1000));
                 bot.clearControlStates();
            }
        } else if (Math.round(bot.entity.position.y) <= TARGET_Y + 2) {
            dugDown = true;
        }
    }

    skills.log(bot, `Telah berada di sekitar area iron (Y=${Math.round(bot.entity.position.y)}). Memulai pencarian...`);

    while (currentIron < TARGET_QTY) {
        if (bot.interrupt_code) {
            console.log(`[Script] Diinterupsi. Menyimpan state dan pause script.`);
            skills.log(bot, `Script iron_ore diinterupsi. Akan dilanjutkan setelah interupsi selesai.`);
            bot.scriptMemory.iron_ore = { failedAttempts, ignoreBlocks, dugDown };
            return;
        }

        let enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), 16);
        if (enemy) {
            console.log(`[Script] Musuh terdeteksi: ${enemy.name}. Melawan balik...`);
            skills.log(bot, `Musuh mendekat! Aku akan melawan ${enemy.name}!`);
            let survived = await skills.defendSelf(bot, 16);
            if (survived) {
                console.log(`[Script] Berhasil mengalahkan musuh. Melanjutkan script...`);
                skills.log(bot, `Berhasil mengatasi musuh, kembali mencari iron.`);
            }
            continue;
        }

        if (bot.inventory.emptySlotCount() === 0) {
            console.log(`[Script] Inventory is full. Stopping script.`);
            skills.log(bot, `Inventory saya penuh! Menghentikan pencarian iron.`);
            return;
        }

        let needed = TARGET_QTY - currentIron;
        console.log(`[Script] Membutuhkan ${needed} lagi. Mencari dalam radius ${SEARCH_RADIUS}...`);

        const filterBlock = (block) => {
            if (block.name !== TARGET_ORE && block.name !== 'deepslate_iron_ore') return false;
            return true;
        };

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
                break;
            }
        }

        if (!oreBlock) {
            skills.log(bot, `Could not find ${TARGET_ORE} in this area. Exploring to find a new area...`);
            console.log(`[Script] No ore in radius ${SEARCH_RADIUS}. Moving to a random location...`);

            try {
                let moved = await skills.moveAway(bot, 32);
                if (!moved) {
                     console.log(`[Script] Stuck saat eksplorasi. Mencoba unstuck manual.`);
                     bot.setControlState('jump', true);
                     bot.setControlState('right', true);
                     await new Promise(r => setTimeout(r, 1000));
                     bot.clearControlStates();
                }
                failedAttempts++;
                if (failedAttempts > 10) {
                     skills.log(bot, `Explored for too long but could not find iron_ore. Will keep trying...`);
                     failedAttempts = 0;
                }
                continue;
            } catch (err) {
                console.error(`[Script] Failed to explore:`, err);
                skills.log(bot, `Stuck while trying to explore. Mencoba unstuck manual.`);
                bot.setControlState('jump', true);
                bot.setControlState('left', true);
                await new Promise(r => setTimeout(r, 1000));
                bot.clearControlStates();
                continue;
            }
        }

        failedAttempts = 0;
        const targetType = oreBlock.name;
        console.log(`[Script] Found ${targetType} at ${oreBlock.position}. Heading to location...`);

        try {
            let success = await skills.collectBlock(bot, targetType, 1, ignoreBlocks);
            if (!success) {
                console.log(`[Script] Failed to collect ${targetType} (likely due to pathing/tools), adding to ignore list.`);
                ignoreBlocks.push(oreBlock.position);
            }
        } catch (err) {
            console.error(`[Script] Failed to mine block ${targetType}:`, err);
            skills.log(bot, `Failed to mine this ${targetType}, trying to find another one...`);
            ignoreBlocks.push(oreBlock.position);

            console.log(`[Script] Stuck saat menambang. Mencoba unstuck manual.`);
            bot.setControlState('jump', true);
            bot.setControlState('back', true);
            await new Promise(r => setTimeout(r, 1000));
            bot.clearControlStates();
        }

        inventory = world.getInventoryCounts(bot);
        currentIron = (inventory['raw_iron'] || 0) + (inventory['iron_ore'] || 0) + (inventory['deepslate_iron_ore'] || 0);
    }

    skills.log(bot, `Target of ${TARGET_QTY} Iron has been reached! Stopping mining.`);
    console.log(`[Script] Finished. Total collected: ${currentIron}`);
    bot.scriptMemory.iron_ore = null;
}
