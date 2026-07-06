/**
 * ============================================================
 *  AUTO WOODCUTTER SCRIPT - Mindcraft Bot (Dryzikhov)
 * ============================================================
 *  Script ini dijalankan dengan command:
 *    !runScript("auto_woodcutter")
 *
 *  Atau jika allow_insecure_coding=true, kirim ke bot:
 *    !newAction("Run the auto woodcutter script")
 *
 *  CARA PAKAI MANUAL (tanpa LLM):
 *  Script ini adalah referensi kode yang bisa kamu adaptasi
 *  dan jalankan langsung via newAction saat insecure coding ON.
 *
 *  KONFIGURASI — ubah nilai di bawah sesuai kebutuhan:
 * ============================================================
 */

// ── KONFIGURASI ─────────────────────────────────────────────
const CONFIG = {
    // Jenis kayu yang ingin ditebang
    // Pilihan: "oak_log", "birch_log", "spruce_log", "jungle_log",
    //          "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log"
    woodType: "oak_log",

    // Jumlah kayu yang dikumpulkan per ronde sebelum kembali ke base
    logsPerRound: 32,

    // Radius pencarian pohon dari posisi bot (dalam blok)
    searchRadius: 64,

    // Apakah bot harus simpan kayu ke chest setelah tiap ronde?
    // true  = pergi ke chest terdekat dan simpan
    // false = biarkan di inventory, terus tebang
    depositToChest: true,

    // Apakah bot harus craft kayu menjadi plank otomatis?
    // true  = setelah simpan ke chest, craft jadi planks dulu
    craftPlanks: false,

    // Jumlah maksimum ronde sebelum berhenti. -1 = tidak terbatas
    maxRounds: -1,

    // Jeda antar ronde dalam milidetik (beri waktu server bernafas)
    delayBetweenRounds: 2000,

    // Nama lokasi base yang sudah disimpan via !rememberHere("base")
    // Digunakan untuk kembali ke base sebelum deposit
    // Kosongkan ("") jika tidak mau pakai fitur ini
    baseName: "base",
};
// ────────────────────────────────────────────────────────────


/**
 * Fungsi utama auto woodcutter.
 * Dipanggil dengan: await autoWoodcutter(bot, skills, world)
 */
async function autoWoodcutter(bot, skills, world) {
    const say = (msg) => {
        bot.chat(msg);
        console.log(`[AutoWoodcutter] ${msg}`);
    };

    // Tentukan jenis log dan sapling yang sesuai
    const logType    = CONFIG.woodType;
    const plankType  = logType.replace("_log", "_planks");

    say(`🪓 Auto Woodcutter dimulai! Target: ${logType}`);
    say(`📋 ${CONFIG.logsPerRound} log per ronde | Radius: ${CONFIG.searchRadius} blok`);

    let round = 0;

    // ── LOOP UTAMA ──────────────────────────────────────────
    while (true) {
        // Cek batas ronde
        if (CONFIG.maxRounds !== -1 && round >= CONFIG.maxRounds) {
            say(`✅ Selesai! Sudah ${round} ronde.`);
            break;
        }

        round++;
        say(`\n🌲 === RONDE ${round} dimulai ===`);

        // ── LANGKAH 1: Cari pohon terdekat ─────────────────
        say(`🔍 Mencari ${logType} dalam radius ${CONFIG.searchRadius} blok...`);

        const nearestLog = world.getNearestBlock(bot, logType, CONFIG.searchRadius);

        if (!nearestLog) {
            say(`⚠️ Tidak ada ${logType} ditemukan dalam radius ${CONFIG.searchRadius} blok!`);
            say(`🚶 Mencoba perluas pencarian...`);

            // Coba pindah dan cari lagi
            await skills.moveAway(bot, 20);
            const retryLog = world.getNearestBlock(bot, logType, CONFIG.searchRadius);

            if (!retryLog) {
                say(`❌ Tidak ada pohon sama sekali. Script berhenti.`);
                break;
            }
        }

        // ── LANGKAH 2: Pergi ke pohon & tebang ─────────────
        say(`🪓 Menebang ${CONFIG.logsPerRound}x ${logType}...`);

        const collected = await skills.collectBlock(bot, logType, CONFIG.logsPerRound);

        if (!collected) {
            say(`⚠️ Gagal mengumpulkan kayu. Coba lagi ronde berikutnya...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            continue;
        }

        // Hitung kayu di inventory sekarang
        const inventory = world.getInventoryCounts(bot);
        const totalLogs = inventory[logType] || 0;
        say(`📦 Inventory sekarang: ${totalLogs}x ${logType}`);

        // ── LANGKAH 3: Craft planks (opsional) ─────────────
        if (CONFIG.craftPlanks && totalLogs > 0) {
            say(`🔨 Crafting ${logType} → ${plankType}...`);

            // Craft semua log yang ada (1 log = 4 planks)
            const craftCount = totalLogs;
            await skills.craftRecipe(bot, plankType, craftCount);

            const newInv = world.getInventoryCounts(bot);
            const planks = newInv[plankType] || 0;
            say(`✅ Berhasil craft: ${planks}x ${plankType}`);
        }

        // ── LANGKAH 4: Kembali ke base (opsional) ──────────
        if (CONFIG.baseName && CONFIG.depositToChest) {
            say(`🏠 Kembali ke base "${CONFIG.baseName}"...`);

            const basePos = bot.memory_bank ? bot.memory_bank.recallPlace(CONFIG.baseName) : null;

            if (basePos) {
                await skills.goToPosition(bot, basePos[0], basePos[1], basePos[2], 2);
                say(`📍 Sampai di base!`);
            } else {
                say(`⚠️ Lokasi "${CONFIG.baseName}" belum disimpan. Gunakan !rememberHere("${CONFIG.baseName}") dulu.`);
                say(`⏩ Skip deposit, lanjut tebang...`);
                await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenRounds));
                continue;
            }
        }

        // ── LANGKAH 5: Deposit ke chest (opsional) ─────────
        if (CONFIG.depositToChest) {
            const itemToDeposit = CONFIG.craftPlanks ? plankType : logType;
            const invNow = world.getInventoryCounts(bot);
            const amountToDeposit = invNow[itemToDeposit] || 0;

            if (amountToDeposit > 0) {
                say(`📥 Menyimpan ${amountToDeposit}x ${itemToDeposit} ke chest...`);

                const deposited = await skills.putInChest(bot, itemToDeposit, amountToDeposit);

                if (deposited) {
                    say(`✅ Berhasil simpan ke chest!`);
                } else {
                    say(`⚠️ Gagal simpan ke chest (chest penuh atau tidak ada chest?)`);
                }
            } else {
                say(`ℹ️ Tidak ada ${itemToDeposit} untuk disimpan.`);
            }
        }

        // ── LANGKAH 6: Jeda sebelum ronde berikutnya ───────
        say(`⏳ Jeda ${CONFIG.delayBetweenRounds / 1000} detik sebelum ronde berikutnya...`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenRounds));
    }

    say(`🏁 Auto Woodcutter selesai setelah ${round} ronde!`);
}


// ============================================================
//  CARA MENJALANKAN SCRIPT INI
// ============================================================
//
//  OPSI A — Via !newAction (butuh allow_insecure_coding=true):
//  ──────────────────────────────────────────────────────────
//  Aktifkan di settings.js:
//    "allow_insecure_coding": true,
//    "manual_only": false,  ← LLM harus ON untuk newAction
//
//  Lalu kirim ke bot via chat Minecraft:
//    !newAction("Tebang kayu oak otomatis, kumpulkan 32 per ronde,
//                simpan ke chest, ulangi terus.")
//
//  OPSI B — Integrasikan langsung ke agent (DIREKOMENDASIKAN):
//  ──────────────────────────────────────────────────────────
//  Tambahkan command kustom di:
//    src/agent/commands/actions.js
//
//  Contoh command yang bisa ditambahkan:
//
//    {
//        name: '!woodcutter',
//        description: 'Mulai auto woodcutter mode.',
//        params: {
//            'woodType': { type: 'string', description: 'Jenis kayu (oak_log, birch_log, dll)' },
//            'amount':   { type: 'int', description: 'Jumlah kayu per ronde', domain: [1, 512] }
//        },
//        perform: runAsAction(async (agent, woodType, amount) => {
//            const skills = await import('../library/skills.js');
//            const world  = await import('../library/world.js');
//            CONFIG.woodType = woodType;
//            CONFIG.logsPerRound = amount;
//            await autoWoodcutter(agent.bot, skills, world);
//        })
//    },
//
//  Setelah ditambahkan, kirim command manual:
//    !woodcutter("oak_log", 32)
//
// ============================================================


// Export untuk dipakai modul lain jika diperlukan
export { autoWoodcutter, CONFIG as woodcutterConfig };
