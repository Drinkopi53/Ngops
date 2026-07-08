/**
 * Diamond Ore Miner Script - Mindcraft Deterministic Automation
 *
 * Script ini berjalan secara statis dan deterministik.
 * Mengumpulkan 60 Diamond Ore (atau varian deepslate-nya).
 * Secara otomatis menggali ke kedalaman diamond (Y=-58) dan
 * melakukan branch mining/eksplorasi jika tidak menemukan ore di area saat ini.
 */

export async function main(bot, skills, world) {
    const TARGET_QTY = 60;
    const SEARCH_RADIUS = 32;
    const TARGET_Y = -58;

    console.log(`[Script] Memulai penambangan otomatis ${TARGET_QTY} diamond...`);
    bot.chat(`Memulai script pencarian ${TARGET_QTY} diamond...`);

    // Pengecekan Pickaxe (Iron atau Diamond diperlukan untuk drop diamond)
    let hasValidPickaxe = bot.inventory.items().some(item =>
        item.name === 'iron_pickaxe' || item.name === 'diamond_pickaxe' || item.name === 'netherite_pickaxe'
    );

    if (!hasValidPickaxe) {
        bot.chat(`Saya tidak memiliki Iron/Diamond Pickaxe di inventory! Diamond tidak akan drop. Script dihentikan.`);
        console.log(`[Script] Valid Pickaxe tidak ditemukan. Menghentikan script.`);
        return;
    }

    // Fungsi utilitas untuk mengecek jumlah diamond
    const getDiamondCount = () => {
        let inventory = world.getInventoryCounts(bot);
        return (inventory['diamond'] || 0) + (inventory['diamond_ore'] || 0) + (inventory['deepslate_diamond_ore'] || 0);
    };

    let currentDiamond = getDiamondCount();
    let failedAttempts = 0;
    let ignoreBlocks = []; // Array of block positions to ignore

    // Pindah ke level kedalaman yang tepat (Y=-58 untuk 1.21.11)
    while (Math.round(bot.entity.position.y) > TARGET_Y) {
        if (bot.interrupt_code) return;
        bot.chat(`Saat ini di Y=${Math.round(bot.entity.position.y)}. Menggali turun menuju Y=${TARGET_Y}...`);
        console.log(`[Script] Menggali turun ke Y=${TARGET_Y}...`);

        let dug = await skills.digDown(bot, Math.min(10, Math.round(bot.entity.position.y) - TARGET_Y));
        if (!dug) {
            bot.chat(`Terhalang bahaya (lava/air/jatuh) saat menggali turun. Bergeser sedikit...`);
            await skills.moveAway(bot, 5);
        }
    }

    bot.chat(`Telah mencapai area kedalaman diamond (Y=${Math.round(bot.entity.position.y)}). Memulai pencarian...`);

    let lastPos = bot.entity.position.clone();
    let stuckCount = 0;

    while (currentDiamond < TARGET_QTY) {
        if (bot.interrupt_code) {
            console.log(`[Script] Diinterupsi. Menghentikan script.`);
            bot.chat(`Script diamond_ore dihentikan karena interupsi (misalnya unstuck/stop).`);
            return;
        }

        if (bot.inventory.emptySlotCount() === 0) {
            console.log(`[Script] Inventory is full. Stopping script.`);
            bot.chat(`Inventory saya penuh! Menghentikan pencarian diamond.`);
            return;
        }

        let needed = TARGET_QTY - currentDiamond;
        console.log(`[Script] Membutuhkan ${needed} lagi. Mencari dalam radius ${SEARCH_RADIUS}...`);

        const filterBlock = (block) => {
            if (block.name !== 'diamond_ore' && block.name !== 'deepslate_diamond_ore') return false;
            return true;
        };

        // Cari blok terdekat
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
            bot.chat(`Tidak menemukan diamond di area ini. Bereksplorasi/Branch mining...`);
            console.log(`[Script] Tidak ada ore di radius ${SEARCH_RADIUS}.`);

            // Menghindari stuck di satu tempat karena eksplorasi pathfinder gagal
            if (bot.entity.position.distanceTo(lastPos) < 2) {
                stuckCount++;
            } else {
                stuckCount = 0;
                lastPos = bot.entity.position.clone();
            }

            try {
                if (stuckCount > 3) {
                     // Branch mining sederhana jika pathfinder stuck (membuat terowongan)
                     bot.chat(`Sepertinya jalan buntu, menggali terowongan ke depan...`);
                     let forwardBlock1 = bot.blockAtCursor(2); // Ambil arah pandang bot
                     if (forwardBlock1) {
                         await skills.breakBlockAt(bot, forwardBlock1.position.x, forwardBlock1.position.y, forwardBlock1.position.z);
                         await skills.breakBlockAt(bot, forwardBlock1.position.x, forwardBlock1.position.y + 1, forwardBlock1.position.z);
                         await skills.goToPosition(bot, forwardBlock1.position.x, bot.entity.position.y, forwardBlock1.position.z, 1);
                     } else {
                         // Fallback jika tidak ada block
                         await skills.moveAway(bot, 16);
                     }
                } else {
                    // Coba menjelajah gua/area sekitar
                    let moved = await skills.moveAway(bot, 16);
                    if (!moved) stuckCount += 2;
                }

                failedAttempts++;
                if (failedAttempts > 30) {
                     bot.chat(`Telah bereksplorasi terlalu lama tapi kesulitan menemukan diamond. Script dihentikan sementara.`);
                     return;
                }
                continue;
            } catch (err) {
                console.error(`[Script] Gagal bereksplorasi:`, err);
                stuckCount += 2;
                continue;
            }
        }

        // Reset fail count if we found one
        failedAttempts = 0;
        stuckCount = 0;
        lastPos = bot.entity.position.clone();

        const targetType = oreBlock.name;
        console.log(`[Script] Menemukan ${targetType} di ${oreBlock.position}. Menuju lokasi...`);

        // Mengumpulkan blok
        try {
            let success = await skills.collectBlock(bot, targetType, 1, ignoreBlocks);
            if (!success) {
                console.log(`[Script] Gagal mengumpulkan ${targetType}, menambahkannya ke daftar ignore.`);
                ignoreBlocks.push(oreBlock.position);
            }
        } catch (err) {
            console.error(`[Script] Gagal mengambil blok ${targetType}:`, err);
            ignoreBlocks.push(oreBlock.position);
            await skills.moveAway(bot, 2);
        }

        // Update jumlah
        currentDiamond = getDiamondCount();
    }

    bot.chat(`Target ${TARGET_QTY} Diamond telah tercapai! Berhenti menambang.`);
    console.log(`[Script] Selesai. Total terkumpul: ${currentDiamond}`);
}
