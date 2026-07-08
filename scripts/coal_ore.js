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

    let inventory = world.getInventoryCounts(bot);
    // Count both raw coal and coal ore depending on what drops / silk touch,
    // but typically coal ore drops 'coal'. If the user specifically meant the block 'coal_ore'
    // then 'coal_ore' needs to be counted. Let's count both to be safe, or just 'coal'
    // since mining coal ore drops 'coal'. The prompt asks for 100 "Coal Ore", but mining it drops "coal".
    // We will track the total coal obtained to see progress.
    let currentCoal = (inventory['coal'] || 0) + (inventory['coal_ore'] || 0);

    let failedAttempts = 0;

    while (currentCoal < TARGET_QTY) {
        let needed = TARGET_QTY - currentCoal;
        console.log(`[Script] Membutuhkan ${needed} lagi. Mencari dalam radius ${SEARCH_RADIUS}...`);

        // Cari blok coal ore terdekat
        let oreBlock = world.getNearestBlock(bot, TARGET_ORE, SEARCH_RADIUS);

        if (!oreBlock) {
            // Coba cari deepslate_coal_ore juga jika tidak menemukan coal_ore biasa
            oreBlock = world.getNearestBlock(bot, 'deepslate_coal_ore', SEARCH_RADIUS);
        }

        if (!oreBlock) {
            bot.chat(`Tidak menemukan ${TARGET_ORE} di area ini. Bereksplorasi mencari area baru...`);
            console.log(`[Script] Tidak ada ore di radius ${SEARCH_RADIUS}. Bergerak ke lokasi acak...`);

            // Bergerak menjauh untuk bereksplorasi
            try {
                // Bergerak setidaknya 32 blok ke arah acak
                await skills.moveAway(bot, 32);
                failedAttempts++;
                if (failedAttempts > 10) {
                     bot.chat(`Telah bereksplorasi terlalu lama tapi tidak menemukan coal_ore. Script dihentikan sementara.`);
                     return;
                }
                // Lanjut iterasi berikutnya untuk mencari lagi
                continue;
            } catch (err) {
                console.error(`[Script] Gagal bereksplorasi:`, err);
                bot.chat(`Stuck saat mencoba bereksplorasi.`);
                return;
            }
        }

        // Reset fail count if we found one
        failedAttempts = 0;

        const targetType = oreBlock.name; // 'coal_ore' atau 'deepslate_coal_ore'
        console.log(`[Script] Menemukan ${targetType} di ${oreBlock.position}. Menuju lokasi...`);

        // Mengumpulkan blok
        try {
            await skills.collectBlock(bot, targetType, 1);
        } catch (err) {
            console.error(`[Script] Gagal mengambil blok ${targetType}:`, err);
            bot.chat(`Gagal menambang ${targetType} ini, mencoba mencari yang lain...`);
            await skills.moveAway(bot, 2); // Menjauh sedikit jika stuck
        }

        // Update inventory count
        inventory = world.getInventoryCounts(bot);
        currentCoal = (inventory['coal'] || 0) + (inventory['coal_ore'] || 0);
    }

    bot.chat(`Target ${TARGET_QTY} Coal telah tercapai! Berhenti menambang.`);
    console.log(`[Script] Selesai. Total terkumpul: ${currentCoal}`);
}
