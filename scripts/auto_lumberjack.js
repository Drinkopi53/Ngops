/**
 * Auto Lumberjack Script - Mindcraft Deterministic Automation
 * 
 * Script ini berjalan secara statis dan deterministik tanpa LLM.
 * Menggunakan API bawaan: bot, skills, dan world.
 */

export async function main(bot, skills, world) {
    const TARGET_WOOD = 'oak_log';
    const TARGET_QTY = 16;
    const SEARCH_RADIUS = 32;

    // 1. Catat lokasi awal sebagai base untuk kembali nanti
    const startPosition = bot.entity.position.clone();
    console.log([Script] Memulai Auto Lumberjack. Lokasi base awal: );
    bot.chat(Memulai script Auto Lumberjack...);

    // 2. Cek jumlah kayu saat ini di inventory
    let inventory = world.getInventoryCounts(bot);
    let currentWood = inventory[TARGET_WOOD] || 0;

    // 3. Loop Penebangan
    while (currentWood < TARGET_QTY) {
        let needed = TARGET_QTY - currentWood;
        bot.chat(Mencari kayu... (/ di inventory));
        console.log([Script] Membutuhkan   lagi.);

        // Cari blok kayu terdekat
        let woodBlock = world.getNearestBlock(bot, TARGET_WOOD, SEARCH_RADIUS);
        if (!woodBlock) {
            bot.chat(Tidak menemukan blok  dalam radius  blok. Script dihentikan.);
            return;
        }

        console.log([Script] Menemukan  di . Menuju lokasi...);
        
        // Pergi ke blok kayu dan kumpulkan
        try {
            // Kita kumpulkan 1 per 1 agar loop berjalan presisi
            await skills.collectBlock(bot, TARGET_WOOD, 1);
        } catch (err) {
            console.error([Script] Gagal mengambil blok:, err);
            bot.chat(Gagal menebang kayu ini, mencoba mencari blok lain...);
            await skills.moveAway(bot, 2); // Menjauh sedikit jika stuck
        }

        // Update inventory count
        inventory = world.getInventoryCounts(bot);
        currentWood = inventory[TARGET_WOOD] || 0;
    }

    bot.chat(Target  kayu tercapai! Kembali ke base...);
    console.log([Script] Kembali ke base di: );

    // 4. Kembali ke lokasi awal
    await skills.goToPosition(bot, startPosition.x, startPosition.y, startPosition.z, 1);
    bot.chat(Tiba di base. Mencari peti terdekat untuk menyimpan kayu...);

    // 5. Cari peti (chest) terdekat untuk menaruh hasil
    let chestBlock = world.getNearestBlock(bot, 'chest', 8);
    if (chestBlock) {
        console.log([Script] Menemukan peti di . Menyimpan kayu...);
        try {
            await skills.putInChest(bot, TARGET_WOOD, TARGET_QTY);
            bot.chat(Kayu berhasil disimpan di peti!);
        } catch (err) {
            console.error([Script] Gagal menaruh barang ke peti:, err);
            bot.chat(Menemukan peti, tapi gagal menaruh kayu ke dalamnya.);
        }
    } else {
        bot.chat(Tidak ada peti di dekat base. Menyimpan kayu di inventory saja.);
    }

    bot.chat(Script Auto Lumberjack selesai dijalankan!);
    console.log([Script] Selesai.);
}
