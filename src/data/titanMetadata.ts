// Generated typed titan metadata and helpers
import type {
  TitanMetadataItem,
  TitanMetadataDict,
  TitanArtifactEvolveCostDict,
  TitanArtifactLevelCost,
  TitanRole,
  TitanElement,
} from '../types/game/titan.ts';

export const titanMetadata: TitanMetadataDict = {
  "4000": {
    "name": "Sigurd",
    "role": "Tank",
    "element": "Water",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4000.png",
    "skills": ["Icy Aegis"],
    "artifacts": [
      11001,
      12003,
      13003
    ]
  },
  "4001": {
    "name": "Nova",
    "role": "Marksman",
    "element": "Water",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4001.png",
    "skills": ["North Wind"],
    "artifacts": [
      11002,
      12003,
      13001
    ]
  },
  "4002": {
    "name": "Mairi",
    "role": "Support",
    "element": "Water",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4002.png",
    "skills": ["Abyss Curse"],
    "artifacts": [
      11003,
      12003,
      13002
    ]
  },
  "4003": {
    "name": "Hyperion",
    "role": "Supertitan",
    "element": "Water",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4003.png",
    "skills": ["Frost Needles","Frigid Healing"],
    "artifacts": [
      11004,
      12003,
      13002
    ]
  },
  "4004": {
    "name": "Tydus",
    "role": "Summoner",
    "element": "Water",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4004.png",
    "skills": ["Child of Water","Deep Current"],
    "artifacts": [
      11023,
      12003,
      13004
    ]
  },
  "4010": {
    "name": "Moloch",
    "role": "Tank",
    "element": "Fire",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4010.png",
    "skills": ["Crushing Blow"],
    "artifacts": [
      11005,
      12001,
      13003
    ]
  },
  "4011": {
    "name": "Vulcan",
    "role": "Marksman",
    "element": "Fire",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4011.png",
    "skills": ["Erupting Rage"],
    "artifacts": [
      11006,
      12001,
      13001
    ]
  },
  "4012": {
    "name": "Ignis",
    "role": "Support",
    "element": "Fire",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4012.png",
    "skills": ["Burning Blood"],
    "artifacts": [
      11007,
      12001,
      13002
    ]
  },
  "4013": {
    "name": "Araji",
    "role": "Supertitan",
    "element": "Fire",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4013.png",
    "skills": ["Incinerating Ray","Herald of Flame"],
    "artifacts": [
      11008,
      12001,
      13001
    ]
  },
  "4014": {
    "name": "Asherona",
    "role": "Summoner",
    "element": "Fire",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4014.png",
    "skills": ["Child of Flame","Blazing Blessing"],
    "artifacts": [
      11022,
      12001,
      13004
    ]
  },
  "4020": {
    "name": "Angus",
    "role": "Tank",
    "element": "Earth",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4020.png",
    "skills": ["Anger of the Earth"],
    "artifacts": [
      11009,
      12002,
      13003
    ]
  },
  "4021": {
    "name": "Sylva",
    "role": "Marksman",
    "element": "Earth",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4021.png",
    "skills": ["Emerald Storm"],
    "artifacts": [
      11010,
      12002,
      13001
    ]
  },
  "4022": {
    "name": "Avalon",
    "role": "Support",
    "element": "Earth",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4022.png",
    "skills": ["Forest Embrace"],
    "artifacts": [
      11011,
      12002,
      13002
    ]
  },
  "4023": {
    "name": "Eden",
    "role": "Supertitan",
    "element": "Earth",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4023.png",
    "skills": ["Burden of Creation","Subterranean Prison"],
    "artifacts": [
      11012,
      12002,
      13003
    ]
  },
  "4024": {
    "name": "Verdoc",
    "role": "Summoner",
    "element": "Earth",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4024.png",
    "skills": ["Child of Nature","Earth's Call"],
    "artifacts": [
      11021,
      12002,
      13004
    ]
  },
  "4030": {
    "name": "Brustar",
    "role": "Tank",
    "element": "Darkness",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4030.png",
    "skills": ["Wormhole"],
    "artifacts": [
      11014,
      12004,
      13003
    ]
  },
  "4031": {
    "name": "Keros",
    "role": "Marksman",
    "element": "Darkness",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4031.png",
    "skills": ["Essence Burnout"],
    "artifacts": [
      11013,
      12004,
      13001
    ]
  },
  "4032": {
    "name": "Mort",
    "role": "Support",
    "element": "Darkness",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4032.png",
    "skills": ["Shadow Rampage"],
    "artifacts": [
      11015,
      12004,
      13002
    ]
  },
  "4033": {
    "name": "Tenebris",
    "role": "Supertitan",
    "element": "Darkness",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4033.png",
    "skills": ["Touch of the Abyss","Eternal Sacrifice"],
    "artifacts": [
      11016,
      12004,
      13001
    ]
  },
  "4034": {
    "name": "Umbra",
    "role": "Summoner",
    "element": "Darkness",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4034.png",
    "skills": ["Child of Darkness","Shadow Bond"],
    "artifacts": [
      11025,
      12004,
      13004
    ]
  },
  "4040": {
    "name": "Rigel",
    "role": "Tank",
    "element": "Light",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4040.png",
    "skills": ["Vengeful Barrier"],
    "artifacts": [
      11017,
      12005,
      13003
    ]
  },
  "4041": {
    "name": "Amon",
    "role": "Marksman",
    "element": "Light",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4041.png",
    "skills": ["Stellar Destruction"],
    "artifacts": [
      11018,
      12005,
      13001
    ]
  },
  "4042": {
    "name": "Iyari",
    "role": "Support",
    "element": "Light",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4042.png",
    "skills": ["Beacon of Life"],
    "artifacts": [
      11019,
      12005,
      13002
    ]
  },
  "4043": {
    "name": "Solaris",
    "role": "Supertitan",
    "element": "Light",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4043.png",
    "skills": ["Scorching summoning","Invoke Light"],
    "artifacts": [
      11020,
      12005,
      13002
    ]
  },
  "4044": {
    "name": "Lumira",
    "role": "Summoner",
    "element": "Light",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4044.png",
    "skills": ["Child of Light","Eternal Sunshine"],
    "artifacts": [
      11024,
      12005,
      13004
    ]
  },
  "4050": {
    "name": "Pallant",
    "role": "Tank",
    "element": "Spirit",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4050.png",
    "skills": ["Elarite Ram"],
    "artifacts": [
      11028,
      12006,
      13007
    ]
  },
  "4051": {
    "name": "Alecto",
    "role": "Marksman",
    "element": "Spirit",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4051.png",
    "skills": ["Fate's Judgment"],
    "artifacts": [
      11026,
      12006,
      13005
    ]
  },
  "4052": {
    "name": "Orm",
    "role": "Support",
    "element": "Spirit",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4052.png",
    "skills": ["Devastating Link"],
    "artifacts": [
      11027,
      12006,
      13006
    ]
  },
  "4053": {
    "name": "Metida",
    "role": "Supertitan",
    "element": "Spirit",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4053.png",
    "skills": ["Crystal Vortex","Supreme Harmony"],
    "artifacts": [
      11029,
      12006,
      13006
    ]
  },
  "4054": {
    "name": "Valdur",
    "role": "Summoner",
    "element": "Spirit",
    "hasAvatar": true,
    "avatarFile": "assets/titans/4054.png",
    "skills": ["Child of Elarite","Elarite Resonance"],
    "artifacts": [
      11030,
      12006,
      13008
    ]
  }
};
export const titanArtifactEvolveCost: TitanArtifactEvolveCostDict = {
  "1": 15,
  "2": 300,
  "3": 900,
  "4": 1500,
  "5": 4500,
  "6": 15000
};
export const titanArtifactLevelCosts: TitanArtifactLevelCost[] = [null,[0,0],[25,20000],[35,22200],[40,23400],[50,24600],[62,26000],[66,27400],[68,28800],[72,30400],[76,32000],[78,33700],[82,35500],[86,37400],[90,39400],[94,41500],[98,43800],[104,46100],[110,48600],[115,51200],[120,53900],[125,56800],[130,59900],[135,63100],[140,66500],[150,70000],[155,73800],[160,77800],[170,81900],[180,86300],[185,90900],[195,95800],[205,101000],[215,106000],[220,112000],[230,118000],[240,124000],[260,131000],[270,138000],[280,146000],[290,153000],[310,162000],[320,170000],[340,179000],[350,189000],[370,199000],[380,210000],[400,221000],[420,233000],[440,245000],[460,258000],[480,272000],[500,287000],[530,302000],[550,318000],[580,336000],[600,354000],[630,373000],[660,392000],[690,414000],[730,436000],[760,459000],[790,484000],[830,510000],[870,537000],[910,566000],[950,596000],[1000,628000],[1040,662000],[1090,697000],[1140,734000],[1190,774000],[1250,815000],[1310,859000],[1370,905000],[1430,954000],[1500,1000000],[1570,1060000],[1640,1120000],[1720,1180000],[1790,1240000],[1880,1300000],[1970,1370000],[2060,1450000],[2150,1530000],[2250,1610000],[2360,1690000],[2460,1780000],[2580,1880000],[2700,1980000],[2820,2090000],[2950,2200000],[3090,2320000],[3240,2440000],[3390,2570000],[3540,2710000],[3710,2860000],[3880,3010000],[4060,3170000],[4250,3340000],[4440,3520000],[4650,3710000],[4860,3910000],[5090,4120000],[5330,4340000],[5570,4570000],[5830,4810000],[6100,5070000],[6390,5340000],[6680,5630000],[6990,5930000],[7320,6250000],[7650,6590000],[8010,6940000],[8380,7310000],[8770,7700000],[9180,8110000],[9600,8550000],[10050,9010000],[10510,9490000],[11000,10000000]];

export function getTitanMetadata(titanId: number | string): TitanMetadataItem | null {
  if (titanId == null) return null;
  return titanMetadata[String(titanId)] ?? titanMetadata[Number(titanId)] ?? null;
}

export function getTitanName(titanId: number | string): string {
  const meta = getTitanMetadata(titanId);
  return meta?.name || `Titan #${titanId}`;
}

export function getTitanRole(titanId: number | string): TitanRole {
  const meta = getTitanMetadata(titanId);
  return meta?.role || 'Unknown';
}

export function getTitanElement(titanId: number | string): TitanElement {
  const meta = getTitanMetadata(titanId);
  return meta?.element || 'Unknown';
}

export function getTitanAvatar(titanId: number | string): string | null {
  const meta = getTitanMetadata(titanId);
  return meta?.avatarFile || (meta?.hasAvatar ? `assets/titans/${titanId}.png` : null);
}

export function getTitanArtifactEvolveCost(star: number | string): number {
  return titanArtifactEvolveCost[String(star)] ?? titanArtifactEvolveCost[Number(star)] ?? 0;
}

export function getTitanArtifactLevelCost(level: number): [fragments: number, gold: number] | null {
  return titanArtifactLevelCosts[level] ?? null;
}

export const titanMetadataHelper = {
  data: titanMetadata,
  evolveCosts: titanArtifactEvolveCost,
  levelCosts: titanArtifactLevelCosts,
  getTitanMetadata,
  getTitanName,
  getTitanRole,
  getTitanElement,
  getTitanAvatar,
  getTitanArtifactEvolveCost,
  getTitanArtifactLevelCost,
};

export default titanMetadataHelper;
