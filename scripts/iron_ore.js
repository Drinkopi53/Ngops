export default async function (bot) {
  const { GoalNear } = bot.pathfinder.goals;
  const mcData = require('minecraft-data')(bot.version);
  
  // Hostile mobs that can attack the player
  const HOSTILE_MOBS = [
    "zombie", "skeleton", "creeper", "spider", "cave_spider", 
    "enderman", "witch", "slime", "phantom", "drowned", 
    "husk", "stray", "wither_skeleton", "piglin", "piglin_brute",
    "vindicator", "evoker", "pillager", "ravager", "blaze", "ghast",
    "magma_cube", "shulker", "vex", "warden"
  ];

  /**
   * Check for nearby hostile mobs and fight them if found.
   * Returns true if a monster was fought, false otherwise.
   */
  async function checkAndFightMonsters(say) {
    const monsters = [];
    
    // Find all hostile mobs within 16 blocks
    for (const mobType of HOSTILE_MOBS) {
      if (!mcData.entitiesByName[mobType]) continue;
      
      const entities = bot.entities.filter(e => {
        return e.name === mobType && 
               e.position.distanceTo(bot.entity.position) < 16;
      });
      
      if (entities.length > 0) {
        monsters.push(...entities);
      }
    }
    
    if (monsters.length > 0) {
      // Sort by distance, fight closest first
      monsters.sort((a, b) => {
        return bot.entity.position.distanceTo(a.position) - 
               bot.entity.position.distanceTo(b.position);
      });
      
      for (const monster of monsters) {
        if (bot.interrupt_code) return true;
        
        say(`⚠️ ${monster.name} detected at ${Math.round(monster.position.distanceTo(bot.entity.position))} blocks! Fighting...`);
        
        // Equip weapon if available
        const weapons = ["netherite_sword", "diamond_sword", "iron_sword", "golden_sword", "stone_sword", "wooden_sword", "bow"];
        let bestWeapon = null;
        const inventory = bot.inventory.items();
        
        for (const weapon of weapons) {
          const item = inventory.find(i => i.name === weapon);
          if (item) {
            bestWeapon = item;
            break;
          }
        }
        
        if (bestWeapon) {
          await bot.equip(bestWeapon, 'hand');
          say(`Equipped ${bestWeapon.name} for combat.`);
        } else {
          say("No weapon available, fighting with fists!");
        }
        
        // Attack the monster
        try {
          await bot.attack(monster);
          say(`✓ Defeated ${monster.name}!`);
        } catch (err) {
          say(`Combat error: ${err.message}`);
        }
      }
      
      return true;
    }
    
    return false;
  }
  
  // Helper: Get best pickaxe available in inventory
  function getBestPickaxe() {
    const pickaxes = bot.inventory.items().filter(item => {
      return item.name.includes('pickaxe');
    });
    if (pickaxes.length === 0) return null;

    const toolValues = {
      'wooden_pickaxe': 1,
      'stone_pickaxe': 2,
      'golden_pickaxe': 3,
      'iron_pickaxe': 4,
      'diamond_pickaxe': 5,
      'netherite_pickaxe': 6
    };

    let best = pickaxes[0];
    let bestValue = toolValues[best.name] || 0;

    for (const p of pickaxes) {
      const val = toolValues[p.name] || 0;
      if (val > bestValue) {
        best = p;
        bestValue = val;
      }
    }
    return best;
  }

  // Helper: Craft a wooden pickaxe if none exists
  async function craftWoodenPickaxe() {
    bot.chat("Tidak ada linggis. Membuat linggis kayu...");

    // Check for crafting table
    let craftingTable = bot.findBlock({
      matching: mcData.blocksByName.crafting_table.id,
      maxDistance: 32
    });

    if (!craftingTable) {
      // Craft crafting table
      const log = bot.inventory.items().find(i => i.name.includes('_log') || i.name.includes('_wood'));
      if (!log || log.count < 1) {
        bot.chat("Tidak ada kayu untuk membuat meja kerajinan!");
        return false;
      }
      await bot.craft(mcData.recipes.find(r => r.result.name === 'crafting_table')[0], 1);
      bot.chat("Meja kerajinan dibuat.");

      // Place crafting table
      const dest = bot.entity.position.offset(1, 0, 0);
      await bot.placeBlock(craftingTable, dest);
      craftingTable = bot.blockAt(dest);
    }

    // Craft sticks
    const planks = bot.inventory.items().find(i => i.name.includes('planks'));
    if (!planks || planks.count < 2) {
      const log = bot.inventory.items().find(i => i.name.includes('_log') || i.name.includes('_wood'));
      if (!log) {
        bot.chat("Tidak ada kayu untuk membuat papan!");
        return false;
      }
      await bot.craft(mcData.recipes.find(r => r.result.name.includes('planks') && r.ingredients.some(ing => ing.name.includes('log') || ing.name.includes('wood')))[0], 4, craftingTable);
    }

    await bot.craft(mcData.recipes.find(r => r.result.name === 'stick')[0], 4, craftingTable);

    // Craft wooden pickaxe
    const recipe = mcData.recipes.find(r => r.result.name === 'wooden_pickaxe');
    if (!recipe) {
      bot.chat("Resep linggis kayu tidak ditemukan!");
      return false;
    }
    await bot.craft(recipe, 1, craftingTable);
    bot.chat("Linggis kayu berhasil dibuat.");
    return true;
  }

  // Helper: Find and mine iron_ore
  async function mineIronOre(targetCount) {
    let minedCount = 0;
    const searchRadius = 64;

    while (minedCount < targetCount) {
      // Check for hostile mobs before continuing task
      const monsterFought = await checkAndFightMonsters(msg => bot.chat("[IronMiner] " + msg));
      if (monsterFought) {
        bot.chat("Melanjutkan penambangan iron setelah pertempuran...");
        continue;
      }

      const oreBlock = bot.findBlock({
        matching: mcData.blocksByName.iron_ore.id,
        maxDistance: searchRadius
      });

      if (!oreBlock) {
        bot.chat("Tidak menemukan Iron Ore. Berpindah lokasi...");
        const x = Math.floor(bot.entity.position.x + (Math.random() - 0.5) * 30);
        const z = Math.floor(bot.entity.position.z + (Math.random() - 0.5) * 30);
        const y = Math.floor(bot.entity.position.y);
        await bot.pathfinder.goto(new GoalNear(x, y, z, 5));
        continue;
      }

      bot.chat(`Menemukan Iron Ore di ${oreBlock.position}. Menambang...`);
      await bot.pathfinder.goto(new GoalNear(oreBlock.position.x, oreBlock.position.y, oreBlock.position.z, 3));
      
      try {
        await bot.dig(oreBlock);
        minedCount++;
        bot.chat(`Berhasil menambang! Total: ${minedCount}/${targetCount}`);
      } catch (err) {
        bot.chat(`Gagal menambang: ${err.message}`);
      }

      // Wait a bit to avoid spamming
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    bot.chat(`Selesai! Berhasil mengumpulkan ${minedCount} Iron Ore.`);
  }

  // Main execution
  try {
    bot.chat("Memulai misi penambangan Iron Ore (Target: 60)...");

    // Ensure we have a pickaxe
    let pickaxe = getBestPickaxe();
    if (!pickaxe) {
      const success = await craftWoodenPickaxe();
      if (!success) {
        bot.chat("Gagal membuat linggis. Misi dibatalkan.");
        return;
      }
      pickaxe = getBestPickaxe();
    }

    bot.chat(`Menggunakan ${pickaxe.name} untuk menambang.`);
    await mineIronOre(60);

  } catch (error) {
    bot.chat(`Terjadi kesalahan: ${error.message}`);
    console.error(error);
  }
}
