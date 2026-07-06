// find_bastion.js
// Script untuk mencari Bastion Remnant di Nether secara otomatis
// Cara pakai: !runScript("find_bastion")

export async function main(bot, skills, world, agent) {
    const chat = (msg) => agent.openChat(msg);
    const log = (msg) => {
        console.log(`[FindBastion] ${msg}`);
        bot.output += msg + '\n';
    };
    
    // Konfigurasi
    const SEARCH_RADIUS = 200; // Radius pencarian dalam block
    const CHECK_INTERVAL = 5; // Cek setiap 5 block
    const SAFE_DISTANCE = 16; // Jarak aman dari monster
    
    let bastionFound = false;
    let searchComplete = false;
    
    // Fungsi untuk cek apakah ada Bastion di sekitar
    async function checkForBastion() {
        // Cari struktur bastion menggunakan world.structures
        const structures = world.getStructures();
        if (structures && structures.length > 0) {
            for (const structure of structures) {
                if (structure.type && structure.type.toLowerCase().includes('bastion')) {
                    const dist = bot.entity.position.distanceTo(structure.position);
                    if (dist < SEARCH_RADIUS) {
                        return { found: true, structure: structure, distance: dist };
                    }
                }
            }
        }
        return { found: false, structure: null, distance: Infinity };
    }
    
    // Fungsi untuk melawan monster jika diserang
    async function fightMobsIfNearby() {
        const mobs = world.getNearbyEntities(['zombified_piglin', 'piglin', 'piglin_brute', 'ghast', 'magma_cube'], SAFE_DISTANCE);
        if (mobs && mobs.length > 0) {
            // Sort by distance, attack closest
            mobs.sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position));
            const target = mobs[0];
            
            if (target) {
                log(`⚔️ Monster terdeteksi: ${target.type}, jarak: ${bot.entity.position.distanceTo(target.position).toFixed(1)} block`);
                await skills.attack(target);
                return true; // Masih ada combat
            }
        }
        return false; // Tidak ada combat
    }
    
    // Fungsi untuk cek dan bebas jika stuck
    async function checkAndFreeFromStuck() {
        const startPos = bot.entity.position.clone();
        const startTick = Date.now();
        
        // Gerakan kecil untuk test
        await skills.moveForward(1);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const newPos = bot.entity.position.clone();
        const moved = startPos.distanceTo(newPos) > 0.5;
        
        if (!moved) {
            log("🔒 I'm Stuck! Mencoba melepaskan diri...");
            
            // Coba jump
            await skills.jump();
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Coba move backward
            await skills.moveBackward(2);
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Coba jump lagi
            await skills.jump();
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Coba move forward
            await skills.moveForward(2);
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const finalPos = bot.entity.position.clone();
            const freed = startPos.distanceTo(finalPos) > 0.5;
            
            if (freed) {
                log("✅ I'm Free! Melanjutkan pencarian...");
            } else {
                log("⚠️ Masih stuck, mencoba gerakan acak...");
                // Gerakan acak
                const directions = ['forward', 'backward', 'left', 'right'];
                for (let i = 0; i < 3; i++) {
                    const dir = directions[Math.floor(Math.random() * directions.length)];
                    if (dir === 'forward') await skills.moveForward(1);
                    else if (dir === 'backward') await skills.moveBackward(1);
                    else if (dir === 'left') await skills.strafeLeft(1);
                    else if (dir === 'right') await skills.strafeRight(1);
                    await skills.jump();
                    await new Promise(resolve => setTimeout(resolve, 400));
                }
                
                const afterRandomPos = bot.entity.position.clone();
                if (startPos.distanceTo(afterRandomPos) > 0.5) {
                    log("✅ I'm Free! Melanjutkan pencarian...");
                } else {
                    log("❌ Gagal bebas dari stuck, coba teleport sedikit...");
                    // Last resort: teleport kecil
                    const lookDir = bot.entity.yaw;
                    const newX = bot.entity.position.x + Math.sin(lookDir) * 3;
                    const newZ = bot.entity.position.z - Math.cos(lookDir) * 3;
                    await skills.moveTo(newX, bot.entity.position.y, newZ);
                }
            }
        }
    }
    
    // Fungsi untuk bergerak ke arah tertentu
    async function moveInDirection(direction, distance) {
        const pos = bot.entity.position;
        let targetX, targetZ;
        
        switch(direction) {
            case 'north':
                targetX = pos.x;
                targetZ = pos.z - distance;
                break;
            case 'south':
                targetX = pos.x;
                targetZ = pos.z + distance;
                break;
            case 'east':
                targetX = pos.x + distance;
                targetZ = pos.z;
                break;
            case 'west':
                targetX = pos.x - distance;
                targetZ = pos.z;
                break;
            default:
                targetX = pos.x;
                targetZ = pos.z;
        }
        
        await skills.moveTo(targetX, pos.y, targetZ);
    }
    
    // Fungsi untuk loot semua chest di bastion
    async function lootAllChests() {
        log("📦 Mulai mencari dan menjarah semua chest di Bastion...");
        chat("📦 Menjarah semua chest di Bastion...");
        
        const MAX_LOOT_ATTEMPTS = 50; // Maksimal percobaan cari chest
        let lootAttempts = 0;
        let chestsLooted = 0;
        let lastChestPos = null;
        
        while (lootAttempts < MAX_LOOT_ATTEMPTS) {
            // Cari chest terdekat
            const chest = world.getNearestBlock('chest', 32); // Radius 32 block dari posisi bot
            
            if (!chest) {
                log("✅ Tidak ada chest lagi yang terdeteksi dalam radius 32 block.");
                break;
            }
            
            // Cek apakah ini chest yang sama dengan yang terakhir
            if (lastChestPos && chest.position.distanceTo(lastChestPos) < 1) {
                log("⚠️ Chest sudah di-loot atau tidak bisa diakses, mencari yang lain...");
                // Pindah posisi sedikit untuk refresh pencarian
                await skills.moveForward(2);
                await new Promise(resolve => setTimeout(resolve, 500));
                await skills.moveBackward(2);
                await new Promise(resolve => setTimeout(resolve, 500));
                lootAttempts++;
                continue;
            }
            
            const distToChest = bot.entity.position.distanceTo(chest.position);
            log(`🔍 Chest ditemukan! Jarak: ${distToChest.toFixed(1)} block`);
            
            try {
                // Menuju chest
                if (distToChest > 2) {
                    await skills.moveTo(chest.position.x, chest.position.y, chest.position.z);
                }
                
                // Buka dan loot chest
                log("📦 Membuka chest...");
                const items = await skills.openChestAndLoot(chest);
                
                if (items && items.length > 0) {
                    chestsLooted++;
                    log(`✅ Chest berhasil di-loot! Mendapat ${items.length} item.`);
                    
                    // Log item yang didapat
                    const itemCounts = {};
                    items.forEach(item => {
                        itemCounts[item.name] = (itemCounts[item.name] || 0) + item.count;
                    });
                    
                    for (const [itemName, count] of Object.entries(itemCounts)) {
                        log(`   - ${count}x ${itemName}`);
                    }
                    
                    chat(`✅ Chest ${chestsLooted} di-loot! Dapat ${items.length} item.`);
                } else {
                    log("⚠️ Chest kosong atau sudah di-loot.");
                }
                
                lastChestPos = chest.position.clone();
                lootAttempts = 0; // Reset counter setelah sukses loot
                
            } catch (err) {
                log(`⚠️ Gagal loot chest: ${err.message}`);
                lootAttempts++;
                
                // Coba pindah posisi dan retry
                await skills.moveForward(3);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Small delay
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        log(`🎉 Selesai! Total ${chestsLooted} chest berhasil di-loot.`);
        chat(`🎉 Penjarahan selesai! ${chestsLooted} chest diambil.`);
        
        return chestsLooted;
    }
    
    // Fungsi untuk kembali ke overworld melalui portal
    async function returnToOverworld() {
        log("🌀 Mempersiapkan kembali ke Overworld...");
        chat("🌀 Kembali ke Overworld...");
        
        // Cari portal nether terdekat
        const portal = world.getNearestBlock('nether_portal', 64);
        
        if (!portal) {
            log("❌ Tidak menemukan portal Nether untuk kembali!");
            chat("❌ Tidak ada portal untuk kembali!");
            return false;
        }
        
        const distToPortal = bot.entity.position.distanceTo(portal.position);
        log(`🌀 Portal ditemukan! Jarak: ${distToPortal.toFixed(1)} block`);
        
        try {
            // Menuju portal
            await skills.moveTo(portal.position.x, portal.position.y, portal.position.z);
            
            // Masuk portal
            log("⏳ Masuk ke portal...");
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Cek dimensi
            const newDimension = bot.game.dimension;
            if (newDimension === 'minecraft:overworld' || newDimension === 'overworld') {
                log("✅ Berhasil kembali ke Overworld!");
                chat("✅ Tiba di Overworld!");
                return true;
            } else {
                log(`⚠️ Masih di dimensi: ${newDimension}`);
                return false;
            }
            
        } catch (err) {
            log(`❌ Gagal kembali ke Overworld: ${err.message}`);
            chat(`⚠️ Gagal kembali: ${err.message}`);
            return false;
        }
    }
    
    // Main execution
    try {
        log("🔍 [FIND_BASTION] Memulai pencarian Bastion Remnant...");
        chat("🔍 Mulai mencari Bastion Remnant!");
        
        // Simpan posisi portal awal untuk kembali
        let overworldPortalPos = null;
        
        // Cek apakah di Overworld atau Nether
        let dimension = bot.game.dimension;
        log(`📍 Dimensi saat ini: ${dimension}`);
        
        // Jika di Overworld, cari dan masuk portal nether terdekat
        if (dimension === 'minecraft:overworld' || dimension === 'overworld') {
            log("🌍 Bot berada di Overworld. Mencari portal Nether terdekat...");
            chat("🌍 Saya di Overworld, mencari portal Nether...");
            
            // Cari portal nether (nether_portal block)
            const portal = world.getNearestBlock('nether_portal', 64); // Radius 64 block
            
            if (!portal) {
                log("❌ Tidak menemukan portal Nether dalam radius 64 block!");
                chat("❌ Tidak ada portal Nether di sekitar! Buat portal dulu.");
                return;
            }
            
            overworldPortalPos = portal.position.clone();
            const distToPortal = bot.entity.position.distanceTo(portal.position);
            log(`🌀 Portal Nether ditemukan! Jarak: ${distToPortal.toFixed(1)} block`);
            chat(`🌀 Portal Nether ditemukan! Jarak: ${distToPortal.toFixed(0)} block`);
            
            // Menuju portal
            log("🚶 Menuju ke portal Nether...");
            chat("🚶 Masuk ke portal Nether...");
            
            try {
                // Move ke posisi portal
                await skills.moveTo(portal.position.x, portal.position.y, portal.position.z);
                
                // Masuk portal (tunggu beberapa detik untuk teleportasi)
                log("⏳ Masuk ke portal...");
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Cek dimensi lagi setelah masuk portal
                dimension = bot.game.dimension;
                log(`✅ Berhasil masuk ke dimensi: ${dimension}`);
                
            } catch (err) {
                log(`⚠️ Gagal mencapai portal: ${err.message}`);
                chat("⚠️ Ada halangan menuju portal!");
                return;
            }
        }
        
        // Cek apakah sekarang di Nether
        if (dimension !== 'minecraft:nether' && dimension !== 'nether') {
            log("⚠️ Bot masih tidak berada di Nether setelah mencoba masuk portal!");
            chat("⚠️ Gagal masuk ke Nether. Periksa portal Anda.");
            return;
        }
        
        log("✅ Berada di Nether, memulai pencarian Bastion...");
        chat("🔥 Sekarang di Nether, mencari Bastion Remnant...");
        
        // Pattern pencarian spiral/box
        const directions = ['north', 'east', 'south', 'west'];
        let stepSize = 20;
        let currentStep = 0;
        let directionIndex = 0;
        
        while (!bastionFound && !searchComplete) {
            // Cek bastion
            const bastionCheck = await checkForBastion();
            if (bastionCheck.found) {
                bastionFound = true;
                const bastion = bastionCheck.structure;
                const dist = bastionCheck.distance;
                
                log(`🏰 BASTION DITEMUKAN! Tipe: ${bastion.type}`);
                log(`📍 Lokasi: X=${bastion.position.x.toFixed(0)}, Y=${bastion.position.y.toFixed(0)}, Z=${bastion.position.z.toFixed(0)}`);
                log(`📏 Jarak: ${dist.toFixed(1)} block dari posisi sekarang`);
                
                chat(`🏰 BASTION DITEMUKAN! Jarak: ${dist.toFixed(0)} block`);
                chat(`📍 Koordinat: ${bastion.position.x.toFixed(0)}, ${bastion.position.y.toFixed(0)}, ${bastion.position.z.toFixed(0)}`);
                
                // Opsional: Move ke bastion
                log("🚀 Menuju ke Bastion...");
                chat("🚀 Menuju ke Bastion...");
                
                try {
                    await skills.moveTo(bastion.position.x, bastion.position.y, bastion.position.z);
                    log("✅ Tiba di lokasi Bastion!");
                    chat("✅ Tiba di Bastion Remnant!");
                } catch (err) {
                    log(`⚠️ Gagal mencapai bastion: ${err.message}`);
                    chat("⚠️ Ada halangan menuju bastion, tapi sudah ketemu lokasinya!");
                }
                
                break;
            }
            
            // Cek monster
            await fightMobsIfNearby();
            
            // Cek stuck
            await checkAndFreeFromStuck();
            
            // Bergerak ke arah berikutnya
            const direction = directions[directionIndex];
            log(`🔄 Mencari ke arah ${direction} (${stepSize} block)...`);
            
            try {
                await moveInDirection(direction, stepSize);
            } catch (err) {
                log(`⚠️ Error saat bergerak: ${err.message}`);
            }
            
            currentStep++;
            directionIndex = (directionIndex + 1) % 4;
            
            // Increase step size setiap 2 arah (spiral pattern)
            if (currentStep % 2 === 0) {
                stepSize += 20;
            }
            
            // Cek batas maksimal pencarian
            if (stepSize > SEARCH_RADIUS) {
                log("⚠️ Mencapai batas radius pencarian.");
                searchComplete = true;
            }
            
            // Small delay untuk tidak overload
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        if (!bastionFound) {
            log("❌ [FIND_BASTION] Bastion tidak ditemukan dalam radius pencarian.");
            chat("❌ Bastion tidak ditemukan di area ini. Coba area lain atau perluas pencarian.");
        } else {
            log("✅ [FIND_BASTION] Pencarian berhasil!");
            chat("✅ Pencarian Bastion selesai!");
            
            // LOOT SEMUA CHEST
            await lootAllChests();
            
            // KEMBALI KE OVERWORLD
            await returnToOverworld();
        }
        
    } catch (err) {
        log(`❌ [FIND_BASTION] Error: ${err.message}`);
        chat(`❌ Error: ${err.message}`);
        console.error(err);
    }
}
