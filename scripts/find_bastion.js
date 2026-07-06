// find_bastion.js
// Script untuk mencari Bastion Remnant di Nether secara otomatis
// Cara pakai: !runScript("find_bastion")

export async function main(bot, skills, world, agent) {
    const { chat, log } = agent;
    
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
    
    // Main execution
    try {
        log("🔍 [FIND_BASTION] Memulai pencarian Bastion Remnant di Nether...");
        chat("🔍 Mulai mencari Bastion Remnant!");
        
        // Cek apakah di Nether
        const dimension = bot.game.dimension;
        if (dimension !== 'minecraft:nether' && dimension !== 'nether') {
            log("⚠️ Bot tidak berada di Nether! Pindah ke Nether dulu.");
            chat("⚠️ Saya tidak di Nether! Perlu portal nether.");
            searchComplete = true;
            return;
        }
        
        log("✅ Berada di Nether, memulai pencarian...");
        
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
        }
        
    } catch (err) {
        log(`❌ [FIND_BASTION] Error: ${err.message}`);
        chat(`❌ Error: ${err.message}`);
        console.error(err);
    }
}
