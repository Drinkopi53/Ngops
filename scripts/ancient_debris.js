import * as mc from '../src/utils/mcdata.js';

/**
 * Ancient Debris Miner Script - Mindcraft Deterministic Automation
 *
 * Script ini berjalan secara statis dan deterministik.
 * Mengumpulkan 60 Ancient Debris di dimensi Nether.
 * Secara otomatis melakukan perjalanan ke Nether jika portal terdeteksi,
 * menggali ke level Y=15, dan mencari ore serta melakukan strip mining.
 */

export async function main(bot, skills, world) {
    const TARGET_ORE = 'ancient_debris';
    const TARGET_QTY = 60;
    const SEARCH_RADIUS = 32;
    const TARGET_Y = 15;

    console.log(`[Script] Memulai penambangan otomatis ${TARGET_QTY} ${TARGET_ORE}...`);
    skills.log(bot, `Memulai script pencarian ${TARGET_QTY} ${TARGET_ORE}...`);

    // Pengecekan Pickaxe (Harus Diamond atau Netherite Pickaxe)
    let hasValidPickaxe = bot.inventory.items().some(item =>
        item.name === 'diamond_pickaxe' || item.name === 'netherite_pickaxe'
    );

    if (!hasValidPickaxe) {
        skills.log(bot, `Saya tidak memiliki Diamond/Netherite Pickaxe! Ancient Debris hanya drop jika ditambang dengan Diamond/Netherite Pickaxe. Script dihentikan.`);
        console.log(`[Script] Valid Pickaxe tidak ditemukan. Menghentikan script.`);
        return;
    }

    // Pengecekan Dimensi (Harus di Nether)
    const currentDim = bot.game.dimension || '';
    if (!currentDim.includes('nether')) {
        skills.log(bot, `Saya saat ini berada di Overworld. Mencoba mendeteksi portal nether untuk pergi ke Nether...`);
        let traveled = await skills.useNetherPortal(bot, 'nether');
        if (!traveled) {
            skills.log(bot, `Tidak dapat pergi ke Nether secara otomatis. Silakan bawa saya ke Nether terlebih dahulu.`);
            console.log(`[Script] Gagal berpindah ke Nether.`);
            return;
        }
    }

    const getDebrisCount = () => {
        let inventory = world.getInventoryCounts(bot);
        return (inventory['ancient_debris'] || 0);
    };

    let currentDebris = getDebrisCount();

    if (currentDebris >= TARGET_QTY) {
        skills.log(bot, `Target ${TARGET_QTY} Ancient Debris telah tercapai! (Sudah ada di inventory).`);
        console.log(`[Script] Selesai di awal. Total terkumpul: ${currentDebris}`);
        return;
    }

    bot.scriptMemory = bot.scriptMemory || {};
    bot.scriptMemory.ancient_debris = bot.scriptMemory.ancient_debris || {
        failedAttempts: 0,
        ignoreBlocks: [],
        stuckCount: 0,
        dugDown: false
    };

    let { failedAttempts, ignoreBlocks, stuckCount, dugDown } = bot.scriptMemory.ancient_debris;

    // Turun atau naik ke Y level TARGET_Y
    while (Math.round(bot.entity.position.y) > TARGET_Y && !dugDown) {
        if (bot.interrupt_code) {
             bot.scriptMemory.ancient_debris = { failedAttempts, ignoreBlocks, stuckCount, dugDown };
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
                 bot.setControlState('left', true);
                 await new Promise(r => setTimeout(r, 1000));
                 bot.clearControlStates();
            }
        } else if (Math.round(bot.entity.position.y) <= TARGET_Y + 2) {
             dugDown = true;
        }
    }

    skills.log(bot, `Telah mencapai area kedalaman Ancient Debris (Y=${Math.round(bot.entity.position.y)}). Memulai pencarian...`);

    let lastPos = bot.entity.position.clone();

    while (currentDebris < TARGET_QTY) {
        if (bot.interrupt_code) {
            console.log(`[Script] Diinterupsi. Menyimpan state dan pause script.`);
            skills.log(bot, `Script ancient_debris diinterupsi. Akan dilanjutkan setelah interupsi selesai.`);
            bot.scriptMemory.ancient_debris = { failedAttempts, ignoreBlocks, stuckCount, dugDown };
            return;
        }

        let enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), 16);
        if (enemy) {
            console.log(`[Script] Musuh terdeteksi: ${enemy.name}. Melawan balik...`);
            skills.log(bot, `Musuh mendekat! Aku akan melawan ${enemy.name}!`);
            let survived = await skills.defendSelf(bot, 16);
            if (survived) {
                console.log(`[Script] Berhasil mengalahkan musuh. Melanjutkan script...`);
                skills.log(bot, `Berhasil mengatasi musuh, kembali mencari Ancient Debris.`);
            }
            continue;
        }

        if (bot.inventory.emptySlotCount() === 0) {
            console.log(`[Script] Inventory penuh. Menghentikan script.`);
            skills.log(bot, `Inventory saya penuh! Menghentikan pencarian Ancient Debris.`);
            return;
        }

        let needed = TARGET_QTY - currentDebris;
        console.log(`[Script] Membutuhkan ${needed} lagi. Mencari dalam radius ${SEARCH_RADIUS}...`);

        const filterBlock = (block) => {
            if (block.name !== TARGET_ORE) return false;
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
            skills.log(bot, `Tidak menemukan Ancient Debris di sekitar. Bereksplorasi/Membuka terowongan...`);
            console.log(`[Script] Tidak ada ore di radius ${SEARCH_RADIUS}.`);

            if (bot.entity.position.distanceTo(lastPos) < 2) {
                stuckCount++;
            } else {
                stuckCount = 0;
                lastPos = bot.entity.position.clone();
            }

            try {
                if (stuckCount > 3) {
                     skills.log(bot, `Sepertinya jalan buntu, menggali terowongan ke depan...`);
                     let forwardBlock1 = bot.blockAtCursor(2);
                     if (forwardBlock1) {
                         await skills.breakBlockAt(bot, forwardBlock1.position.x, forwardBlock1.position.y, forwardBlock1.position.z);
                         await skills.breakBlockAt(bot, forwardBlock1.position.x, forwardBlock1.position.y + 1, forwardBlock1.position.z);
                         let moved = await skills.goToPosition(bot, forwardBlock1.position.x, bot.entity.position.y, forwardBlock1.position.z, 1);
                         if (!moved) stuckCount++;
                     } else {
                         let moved = await skills.moveAway(bot, 16);
                         if (!moved) {
                              bot.setControlState('jump', true);
                              bot.setControlState('forward', true);
                              await new Promise(r => setTimeout(r, 1000));
                              bot.clearControlStates();
                         }
                     }
                } else {
                    let moved = await skills.moveAway(bot, 16);
                    if (!moved) {
                         stuckCount += 2;
                         bot.setControlState('jump', true);
                         bot.setControlState('left', true);
                         await new Promise(r => setTimeout(r, 1000));
                         bot.clearControlStates();
                    }
                }

                failedAttempts++;
                if (failedAttempts > 30) {
                     skills.log(bot, `Telah bereksplorasi terlalu lama. Akan terus mencari...`);
                     failedAttempts = 0;
                }
                continue;
            } catch (err) {
                console.error(`[Script] Gagal bereksplorasi:`, err);
                stuckCount += 2;
                bot.setControlState('jump', true);
                bot.setControlState('right', true);
                await new Promise(r => setTimeout(r, 1000));
                bot.clearControlStates();
                continue;
            }
        }

        failedAttempts = 0;
        stuckCount = 0;
        lastPos = bot.entity.position.clone();

        const targetType = oreBlock.name;
        console.log(`[Script] Menemukan ${targetType} di ${oreBlock.position}. Menuju lokasi...`);

        try {
            let success = await skills.collectBlock(bot, targetType, 1, ignoreBlocks);
            if (!success) {
                console.log(`[Script] Gagal mengumpulkan ${targetType}, menambahkannya ke daftar ignore.`);
                ignoreBlocks.push(oreBlock.position);
            }
        } catch (err) {
            console.error(`[Script] Gagal mengambil blok ${targetType}:`, err);
            ignoreBlocks.push(oreBlock.position);

            bot.setControlState('jump', true);
            bot.setControlState('back', true);
            await new Promise(r => setTimeout(r, 1000));
            bot.clearControlStates();
        }

        currentDebris = getDebrisCount();
    }

    skills.log(bot, `Target ${TARGET_QTY} Ancient Debris telah tercapai! Berhenti menambang.`);
    console.log(`[Script] Selesai. Total terkumpul: ${currentDebris}`);
    bot.scriptMemory.ancient_debris = null;
}
