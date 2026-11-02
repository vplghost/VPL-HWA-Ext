(() => {
  // Guild Versus milestone chest rewards (chests 1 through 9)
  // Verified from remote config clanVersusChestConf/16cefd305f7585ef2f05d9d9b644b84e.json
  const chestRewards = {
    1: {
      energy: 50,
      gold: 30000,
      'consumable:20': 250,
      'consumable:40228': 1,
      'consumable:40230': 1
    },
    2: {
      energy: 100,
      gold: 60000,
      'consumable:20': 500,
      'consumable:40228': 2,
      'consumable:40230': 2
    },
    3: {
      'patron:1': 1,
      energy: 200,
      'consumable:20': 1250,
      'consumable:40228': 3,
      'consumable:40230': 3,
      'material:12': 50
    },
    4: {
      energy: 200,
      'coin:40077': 250,
      'consumable:40228': 3,
      'consumable:40230': 3,
      'speedUpResearch:2': 3
    },
    5: {
      energy: 300,
      'coin:40077': 350,
      'consumable:40228': 4,
      'consumable:40230': 4,
      'speedUpResearch:2': 6
    },
    6: {
      'patron:1': 1,
      energy: 400,
      'consumable:40232': 2,
      'consumable:40228': 5,
      'consumable:40230': 5,
      'material:12': 100,
      'speedUpResearch:2': 15
    },
    7: {
      energy: 400,
      'coin:40077': 550,
      'consumable:40228': 5,
      'consumable:40230': 5,
      'material:12': 50,
      'speedUpResearch:2': 8
    },
    8: {
      energy: 600,
      'coin:40077': 750,
      'consumable:40228': 7,
      'consumable:40230': 7,
      'material:12': 100,
      'speedUpResearch:2': 15
    },
    9: {
      'patron:1': 2,
      energy: 1000,
      'consumable:40232': 5,
      'consumable:40228': 5,
      'consumable:40230': 5,
      'material:12': 200,
      'speedUpResearch:2': 25
    }
  };

  // Milestone points thresholds for chests 1 through 9
  // Verified from remote config clanVersusChestConf
  const chestThresholds = {
    1: 25000,
    2: 100000,
    3: 400000,
    4: 600000,
    5: 1000000,
    6: 1500000,
    7: 2000000,
    8: 3000000,
    9: 4500000
  };

  const challengeNames = {
    7: 'Defeat 1 Map Monster (Lv. 1+)',
    8: 'Clear 1 Bandit Camp',
    13: 'Defeat 1 Map Boss / Rally',
    14: 'Increase Research Power by 1',
    15: 'Use 1 Research Speedup',
    16: 'Spend 1 Skill Book',
    17: 'Use 1 Training Speedup',
    18: 'Train 1 Tier 9 Troop',
    19: 'Train 1 Tier 8 Troop',
    20: 'Train 1 Tier 7 Troop',
    21: 'Train 1 Tier 6 Troop',
    22: 'Train 1 Tier 5 Troop',
    23: 'Train 1 Tier 4 Troop',
    24: 'Train 1 Tier 3 Troop',
    25: 'Train 1 Tier 2 Troop',
    26: 'Train 1 Tier 1 Troop',
    27: 'Increase Titan Power by 3',
    28: 'Summon 1 Titan in Circle',
    29: 'Open 1 Elemental Sphere',
    30: 'Fight 1 Arena Battle',
    31: 'Open 1 Tower Chest',
    32: 'Complete 1 Daily Quest',
    34: 'Open 1 Heroic Chest',
    35: 'Obtain 1 VIP Point',
    37: 'Spend 15 Hero Skin Stones',
    38: 'Open 1 Artifact Chest',
    39: 'Start 1 Expedition',
    40: 'Spend 100 Titan Potions',
    41: 'Equip 1 Red Item',
    42: 'Equip 1 Orange Item',
    43: 'Equip 1 Violet Item',
    44: 'Equip 1 Blue Item',
    45: 'Equip 1 Green Item',
    46: 'Equip 1 White Item',
    47: 'Collect 1 Hero Soul Stone',
    49: 'Spend 3 Energy',
    50: 'Spend 100 Rune Spheres',
    51: 'Spend 20 Rune Stones',
    52: 'Gain 1 Hero Power',
    53: 'Fight 1 Grand Arena Battle',
    54: 'Spend 15 Titan Skin Stones',
    55: 'Spend 10 Relic Shards',
    56: 'Spend 15 Mastery Crystals',
    57: 'Spend 1 Chaos Core',
    70: 'Use 1 Building Speedup',
    92: 'Spend 1 Honor Mark',
    113: 'Increase Building Power by 1',
    114: 'Open 1 Outland Chest'
  };

  // Points awarded per completion for each daily challenge ID
  // Verified from remote config clanVersusChallenge and tracking logs
  const challengePoints = {
    7: 2000,     // Defeat 1 Map Monster (Lv. 1+)
    8: 2500,     // Clear 1 Bandit Camp
    13: 850,     // Defeat 1 Map Boss / Rally
    14: 30,      // Increase Research Power by 1
    15: 200,     // Use 1 Research Speedup
    16: 5000,    // Spend 1 Skill Book
    17: 200,     // Use 1 Training Speedup
    18: 120,     // Train 1 Tier 9 Troop
    19: 100,     // Train 1 Tier 8 Troop
    20: 80,      // Train 1 Tier 7 Troop
    21: 65,      // Train 1 Tier 6 Troop
    22: 50,      // Train 1 Tier 5 Troop
    23: 40,      // Train 1 Tier 4 Troop
    24: 30,      // Train 1 Tier 3 Troop
    25: 20,      // Train 1 Tier 2 Troop
    26: 10,      // Train 1 Tier 1 Troop
    27: 100,     // Increase Titan Power by 3
    28: 1500,    // Summon 1 Titan in Circle
    29: 1200,    // Open 1 Elemental Sphere
    30: 6000,    // Fight 1 Arena Battle
    31: 4000,    // Open 1 Tower Chest
    32: 2000,    // Complete 1 Daily Quest
    34: 4000,    // Open 1 Heroic Chest
    35: 100,     // Obtain 1 VIP Point
    37: 700,     // Spend 15 Hero Skin Stones
    38: 750,     // Open 1 Artifact Chest
    39: 5000,    // Start 1 Expedition
    40: 150,     // Spend 100 Titan Potions
    41: 1250000, // Equip 1 Red Item
    42: 160000,  // Equip 1 Orange Item
    43: 27000,   // Equip 1 Violet Item
    44: 5000,    // Equip 1 Blue Item
    45: 1000,    // Equip 1 Green Item
    46: 200,     // Equip 1 White Item
    47: 500,     // Collect 1 Hero Soul Stone
    49: 100,     // Spend 3 Energy
    50: 50000,   // Spend 100 Rune Spheres
    51: 100,     // Spend 20 Rune Stones
    52: 30,      // Gain 1 Hero Power
    53: 6000,    // Fight 1 Grand Arena Battle
    54: 100,     // Spend 15 Titan Skin Stones
    55: 150000,  // Spend 10 Relic Shards
    56: 200,     // Spend 15 Mastery Crystals
    57: 3000,    // Spend 1 Chaos Core
    70: 200,     // Use 1 Building Speedup
    92: 2000,    // Spend 1 Honor Mark
    113: 200,    // Increase Building Power by 1
    114: 2000    // Open 1 Outland Chest
  };

  // Quests / point earning activities for all 6 battle rounds
  // Verified from remote config clanVersusRounds and clanVersusChallenge
  const roundQuests = {
    1: {
      theme: 'Radar Training & Titan Power',
      battlePoints: 1,
      quests: [
        { label: 'Increase Titan Power by 3', points: 100 },
        { label: 'Spend 15 Titan Skin Stones', points: 100 },
        { label: 'Summon 1 Titan in Circle', points: 1500 },
        { label: 'Open 1 Elemental Sphere', points: 1200 },
        { label: 'Spend 100 Titan Potions', points: 150 },
        { label: 'Spend 10 Relic Shards', points: 150000 },
        { label: 'Clear 1 Bandit Camp', points: 2500 },
        { label: 'Defeat 1 Map Boss / Rally', points: 850 },
        { label: 'Defeat 1 Map Monster Lv. 1+', points: 2000 },
        { label: 'Open 1 Tower Chest', points: 4000 },
        { label: 'Start 1 Expedition', points: 5000 },
        { label: 'Complete 1 Daily Quest', points: 2000 },
        { label: 'Obtain 1 VIP Point', points: 100 }
      ]
    },
    2: {
      theme: 'City Development & Gathering',
      battlePoints: 2,
      quests: [
        { label: 'Spend 15 Hero Skin Stones', points: 700 },
        { label: 'Increase Building Power by 1', points: 200 },
        { label: 'Use 1 Building Speedup', points: 200 },
        { label: 'Gather 3,000 Food on Map', points: 10 },
        { label: 'Gather 3,000 Wood on Map', points: 10 },
        { label: 'Gather 600 Stone on Map', points: 10 },
        { label: 'Gather 150 Iron on Map', points: 10 },
        { label: 'Fight 1 Arena Battle', points: 6000 },
        { label: 'Fight 1 Grand Arena Battle', points: 6000 },
        { label: 'Collect 1 Hero Soul Stone', points: 500 },
        { label: 'Open 1 Tower Chest', points: 4000 },
        { label: 'Start 1 Expedition', points: 5000 },
        { label: 'Complete 1 Daily Quest', points: 2000 },
        { label: 'Obtain 1 VIP Point', points: 100 }
      ]
    },
    3: {
      theme: 'Research & Wilderness',
      battlePoints: 2,
      quests: [
        { label: 'Increase Research Power by 1', points: 30 },
        { label: 'Use 1 Research Speedup', points: 200 },
        { label: 'Spend 1 Honor Mark', points: 2000 },
        { label: 'Clear 1 Bandit Camp', points: 2500 },
        { label: 'Defeat 1 Map Boss / Rally', points: 850 },
        { label: 'Defeat 1 Map Monster Lv. 1+', points: 2000 },
        { label: 'Open 1 Artifact Chest', points: 750 },
        { label: 'Spend 3 Energy', points: 100 },
        { label: 'Open 1 Tower Chest', points: 4000 },
        { label: 'Start 1 Expedition', points: 5000 },
        { label: 'Complete 1 Daily Quest', points: 2000 },
        { label: 'Obtain 1 VIP Point', points: 100 }
      ]
    },
    4: {
      theme: 'Hero Advancement & Equipment',
      battlePoints: 2,
      quests: [
        { label: 'Gain 1 Hero Power', points: 30 },
        { label: 'Spend 10 Relic Shards', points: 150000 },
        { label: 'Spend 15 Mastery Crystals', points: 200 },
        { label: 'Spend 1 Chaos Core', points: 3000 },
        { label: 'Equip 1 Red Item', points: 1250000 },
        { label: 'Equip 1 Orange Item', points: 160000 },
        { label: 'Equip 1 Violet Item', points: 27000 },
        { label: 'Equip 1 Blue Item', points: 5000 },
        { label: 'Equip 1 Green Item', points: 1000 },
        { label: 'Equip 1 White Item', points: 200 },
        { label: 'Gather Resources on Map', points: 10 },
        { label: 'Fight 1 Arena Battle', points: 6000 },
        { label: 'Fight 1 Grand Arena Battle', points: 6000 },
        { label: 'Open 1 Tower Chest', points: 4000 },
        { label: 'Start 1 Expedition', points: 5000 },
        { label: 'Complete 1 Daily Quest', points: 2000 },
        { label: 'Obtain 1 VIP Point', points: 100 }
      ]
    },
    5: {
      theme: 'Military Training & Outland',
      battlePoints: 2,
      quests: [
        { label: 'Train Troops (Tier 1-9)', points: 120 },
        { label: 'Use 1 Training Speedup', points: 200 },
        { label: 'Spend 1 Skill Book', points: 5000 },
        { label: 'Clear 1 Bandit Camp', points: 2500 },
        { label: 'Defeat 1 Map Boss / Rally', points: 850 },
        { label: 'Defeat 1 Map Monster Lv. 1+', points: 2000 },
        { label: 'Open 1 Heroic Chest', points: 4000 },
        { label: 'Open 1 Artifact Chest', points: 750 },
        { label: 'Open 1 Outland Chest', points: 2000 },
        { label: 'Open 1 Elemental Sphere', points: 1200 },
        { label: 'Open 1 Tower Chest', points: 4000 },
        { label: 'Start 1 Expedition', points: 5000 },
        { label: 'Complete 1 Daily Quest', points: 2000 },
        { label: 'Obtain 1 VIP Point', points: 100 }
      ]
    },
    6: {
      theme: 'Grand Finale & PvP Clash',
      battlePoints: 4,
      quests: [
        { label: 'Spend 100 Rune Spheres', points: 50000 },
        { label: 'Spend 20 Rune Stones', points: 100 },
        { label: 'Kill 1 Unit in PvP (Tier 1-9)', points: 30 },
        { label: 'Lose 1 Unit in PvP (Tier 1-9)', points: 18 },
        { label: 'Use 1 Healing Speedup', points: 200 },
        { label: 'Use 1 Training Speedup', points: 200 },
        { label: 'Fight 1 Arena Battle', points: 6000 },
        { label: 'Fight 1 Grand Arena Battle', points: 6000 },
        { label: 'Open 1 Tower Chest', points: 4000 },
        { label: 'Start 1 Expedition', points: 5000 },
        { label: 'Complete 1 Daily Quest', points: 2000 },
        { label: 'Obtain 1 VIP Point', points: 100 }
      ]
    }
  };

  globalThis.hwaHelperClanVersusRewards = chestRewards;
  globalThis.hwaHelperClanVersusChestThresholds = chestThresholds;
  globalThis.hwaHelperClanVersusChallengeNames = challengeNames;
  globalThis.hwaHelperClanVersusChallengePoints = challengePoints;
  globalThis.hwaHelperClanVersusRoundQuests = roundQuests;
})();
