import * as mc from '../src/utils/mcdata.js';

/**
 * Coal Ore Miner Script - Mindcraft Deterministic Automation
 *
 * Script ini berjalan secara statis dan deterministik tanpa LLM.
 * Mengumpulkan 100 Coal Ore, mencari dalam radius 64 blok,
 * dan bereksplorasi jika tidak menemukan ore di area saat ini.
 */

export async function main(bot, skills, world) {
    const TARGET_ORE = 'coal_ore';
    const TARGET_QTY = 100;
    const SEARCH_RADIUS = 64;

    console.log(`[Script] Memulai penambangan otomatis ${TARGET_QTY} ${TARGET_ORE}...`);
    bot.chat(`Memulai script pencarian ${TARGET_QTY} ${TARGET_ORE}...`);

    // Pengecekan Pickaxe
    let hasPickaxe = bot.inventory.items().some(item => item.name.includes('pickaxe'));
    if (!hasPickaxe) {
        bot.chat(`Saya tidak memiliki Pickaxe (Beliung) di inventory! Script dihentikan.`);
        console.log(`[Script] Pickaxe tidak ditemukan. Menghentikan script.`);
        return;
    }

    let inventory = world.getInventoryCounts(bot);
    let currentCoal = (inventory['coal'] || 0) + (inventory['coal_ore'] || 0);

    if (currentCoal >= TARGET_QTY) {
        bot.chat(`Target ${TARGET_QTY} Coal telah tercapai! (Sudah ada di inventory).`);
        console.log(`[Script] Selesai di awal. Total terkumpul: ${currentCoal}`);
        return;
    }

    // Initialize or restore memory
    bot.scriptMemory = bot.scriptMemory || {};
    bot.scriptMemory.coal_ore = bot.scriptMemory.coal_ore || {
        failedAttempts: 0,
        ignoreBlocks: []
    };

    let { failedAttempts, ignoreBlocks } = bot.scriptMemory.coal_ore;

    while (currentCoal < TARGET_QTY) {
        if (bot.interrupt_code) {
            console.log(`[Script] Diinterupsi. Menyimpan state dan pause script.`);
            bot.chat(`Script coal_ore diinterupsi. Akan dilanjutkan setelah interupsi selesai.`);
            bot.scriptMemory.coal_ore = { failedAttempts, ignoreBlocks };
            return;
        }

        // --- Proactive Zombie/Hostile defense check ---
        let enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), 16);
        if (enemy) {
            console.log(`[Script] Musuh terdeteksi: ${enemy.name}. Melawan balik...`);
            bot.chat(`Musuh mendekat! Aku akan melawan ${enemy.name}!`);
            let survived = await skills.defendSelf(bot, 16);
            if (survived) {
                console.log(`[Script] Berhasil mengalahkan musuh. Melanjutkan script...`);
                bot.chat(`Berhasil mengatasi musuh, kembali mencari coal.`);
            }
            continue; // Ulangi loop setelah bertarung
        }
        // ---------------------------------------------

        let needed = TARGET_QTY - currentCoal;
        console.log(`[Script] Membutuhkan ${needed} lagi. Mencari dalam radius ${SEARCH_RADIUS}...`);

        const filterBlock = (block) => {
            if (block.name !== TARGET_ORE && block.name !== 'deepslate_coal_ore') return false;
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
            bot.chat(`Tidak menemukan ${TARGET_ORE} di area ini. Bereksplorasi mencari area baru...`);
            console.log(`[Script] Tidak ada ore di radius ${SEARCH_RADIUS}. Bergerak ke lokasi acak...`);

            try {
                let moved = await skills.moveAway(bot, 32);
                if (!moved) {
                     // Stuck handling: try jumping and moving a bit
                     console.log(`[Script] Stuck saat eksplorasi. Mencoba unstuck manual.`);
                     bot.setControlState('jump', true);
                     bot.setControlState('left', true);
                     await new Promise(r => setTimeout(r, 1000));
                     bot.clearControlStates();
                }
                failedAttempts++;
                if (failedAttempts > 10) {
                     bot.chat(`Telah bereksplorasi terlalu lama tapi tidak menemukan coal_ore. Akan terus mencoba...`);
                     failedAttempts = 0; // Don't stop, just keep trying
                }
                continue;
            } catch (err) {
                console.error(`[Script] Gagal bereksplorasi:`, err);
                bot.chat(`Stuck saat mencoba bereksplorasi. Mencoba unstuck manual.`);
                bot.setControlState('jump', true);
                bot.setControlState('right', true);
                await new Promise(r => setTimeout(r, 1000));
                bot.clearControlStates();
                continue; // Don't return, keep trying
            }
        }

        failedAttempts = 0;
        const targetType = oreBlock.name;
        console.log(`[Script] Menemukan ${targetType} di ${oreBlock.position}. Menuju lokasi...`);

        try {
            let success = await skills.collectBlock(bot, targetType, 1, ignoreBlocks);
            if (!success) {
                console.log(`[Script] Gagal mengumpulkan ${targetType} (kemungkinan karena pathing/tools), menambahkannya ke daftar ignore.`);
                ignoreBlocks.push(oreBlock.position);
            }
        } catch (err) {
            console.error(`[Script] Gagal mengambil blok ${targetType}:`, err);
            bot.chat(`Gagal menambang ${targetType} ini, mencoba mencari yang lain...`);
            ignoreBlocks.push(oreBlock.position);

            // Stuck handling fallback
            console.log(`[Script] Stuck saat menambang. Mencoba unstuck manual.`);
            bot.setControlState('jump', true);
            bot.setControlState('back', true);
            await new Promise(r => setTimeout(r, 1000));
            bot.clearControlStates();
        }

        inventory = world.getInventoryCounts(bot);
        currentCoal = (inventory['coal'] || 0) + (inventory['coal_ore'] || 0);
    }

    bot.chat(`Target ${TARGET_QTY} Coal telah tercapai! Berhenti menambang.`);
    console.log(`[Script] Selesai. Total terkumpul: ${currentCoal}`);
    bot.scriptMemory.coal_ore = null; // Clear memory on finish
}
