export interface SmartGatherMineDef {
  type: 'food' | 'wood' | 'stone' | 'iron';
  level: number;
  amount: number;
  speedPerMinute: number;
}

export interface SmartGatherDailyStep {
  id: number;
  target: number;
}

export interface SmartGatherDailyChain {
  steps: SmartGatherDailyStep[];
  target: number;
}

export interface SmartGatherSourceDef {
  url: string;
  md5: string;
}

export interface SmartGatherData {
  sources: {
    quest: SmartGatherSourceDef;
    questChain: SmartGatherSourceDef;
    globalMapMine: SmartGatherSourceDef;
  };
  daily: {
    food: SmartGatherDailyChain;
    iron: SmartGatherDailyChain;
    stone: SmartGatherDailyChain;
    wood: SmartGatherDailyChain;
  };
  mines: Record<string | number, SmartGatherMineDef>;
}

export const smartGatherData: SmartGatherData = {
  sources: {
    quest: {
      url: "https://hwmb-remote-config-cdn.nextersglobal.com/config/quest/b1b8d8f88d714ab34604dfb22f4af15e.json",
      md5: "b1b8d8f88d714ab34604dfb22f4af15e"
    },
    questChain: {
      url: "https://hwmb-remote-config-cdn.nextersglobal.com/config/questChain/822f98416eb5676f77ccec2b31f4ff07.json",
      md5: "822f98416eb5676f77ccec2b31f4ff07"
    },
    globalMapMine: {
      url: "https://hwmb-remote-config-cdn.nextersglobal.com/config/globalMapMine/8e7146741646f82dca4a58e87ee61598.json",
      md5: "8e7146741646f82dca4a58e87ee61598"
    }
  },
  daily: {
    food: {
      steps: [
        { id: 354, target: 50000 },
        { id: 358, target: 250000 }
      ],
      target: 250000
    },
    iron: {
      steps: [
        { id: 357, target: 3000 },
        { id: 361, target: 15000 }
      ],
      target: 15000
    },
    stone: {
      steps: [
        { id: 356, target: 10000 },
        { id: 360, target: 50000 }
      ],
      target: 50000
    },
    wood: {
      steps: [
        { id: 355, target: 50000 },
        { id: 359, target: 250000 }
      ],
      target: 250000
    }
  },
  mines: {
    "12": { type: "wood", level: 1, amount: 70000, speedPerMinute: 5275 },
    "20": { type: "wood", level: 2, amount: 150000, speedPerMinute: 5540 },
    "21": { type: "wood", level: 3, amount: 300000, speedPerMinute: 5806 },
    "22": { type: "wood", level: 4, amount: 600000, speedPerMinute: 6072 },
    "23": { type: "wood", level: 5, amount: 1200000, speedPerMinute: 6336 },
    "24": { type: "wood", level: 6, amount: 3000000, speedPerMinute: 6601 },
    "27": { type: "food", level: 1, amount: 70000, speedPerMinute: 5275 },
    "28": { type: "food", level: 2, amount: 150000, speedPerMinute: 5540 },
    "29": { type: "food", level: 3, amount: 300000, speedPerMinute: 5806 },
    "30": { type: "food", level: 4, amount: 600000, speedPerMinute: 6072 },
    "31": { type: "food", level: 5, amount: 1200000, speedPerMinute: 6336 },
    "32": { type: "food", level: 6, amount: 3000000, speedPerMinute: 6601 },
    "35": { type: "stone", level: 1, amount: 14000, speedPerMinute: 1054 },
    "36": { type: "stone", level: 2, amount: 30000, speedPerMinute: 1108 },
    "37": { type: "stone", level: 3, amount: 60000, speedPerMinute: 1161 },
    "38": { type: "stone", level: 4, amount: 120000, speedPerMinute: 1214 },
    "39": { type: "stone", level: 5, amount: 240000, speedPerMinute: 1267 },
    "40": { type: "stone", level: 6, amount: 600000, speedPerMinute: 1320 },
    "43": { type: "iron", level: 1, amount: 3500, speedPerMinute: 264 },
    "44": { type: "iron", level: 2, amount: 7500, speedPerMinute: 277 },
    "45": { type: "iron", level: 3, amount: 15000, speedPerMinute: 290 },
    "46": { type: "iron", level: 4, amount: 30000, speedPerMinute: 304 },
    "47": { type: "iron", level: 5, amount: 60000, speedPerMinute: 317 },
    "48": { type: "iron", level: 6, amount: 150000, speedPerMinute: 330 },
    "55": { type: "wood", level: 7, amount: 5000000, speedPerMinute: 6699 },
    "56": { type: "wood", level: 8, amount: 7500000, speedPerMinute: 6805 },
    "57": { type: "wood", level: 9, amount: 10500000, speedPerMinute: 6963 },
    "58": { type: "wood", level: 10, amount: 14000000, speedPerMinute: 7121 },
    "65": { type: "food", level: 7, amount: 5000000, speedPerMinute: 6699 },
    "66": { type: "food", level: 8, amount: 7500000, speedPerMinute: 6805 },
    "67": { type: "food", level: 9, amount: 10500000, speedPerMinute: 6963 },
    "68": { type: "food", level: 10, amount: 14000000, speedPerMinute: 7121 },
    "75": { type: "stone", level: 7, amount: 1000000, speedPerMinute: 1340 },
    "76": { type: "stone", level: 8, amount: 1500000, speedPerMinute: 1361 },
    "77": { type: "stone", level: 9, amount: 2100000, speedPerMinute: 1393 },
    "78": { type: "stone", level: 10, amount: 2800000, speedPerMinute: 1424 },
    "85": { type: "iron", level: 7, amount: 250000, speedPerMinute: 335 },
    "86": { type: "iron", level: 8, amount: 375000, speedPerMinute: 340 },
    "87": { type: "iron", level: 9, amount: 525000, speedPerMinute: 348 },
    "88": { type: "iron", level: 10, amount: 700000, speedPerMinute: 356 }
  }
};

export default smartGatherData;
