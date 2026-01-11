export const GAME_CONFIG = {
  HOUSE_EDGE: 0.04,
  HOUSE_EDGE_PERCENT: 4,
  RTP: 0.96,
};

export function getMultiplierWithEdge(baseMultiplier: number): number {
  return baseMultiplier * GAME_CONFIG.RTP;
}

export function getDiceMultiplier(winChance: number): number {
  const baseMultiplier = 100 / winChance;
  return baseMultiplier * GAME_CONFIG.RTP;
}

export function getCoinflipMultiplier(): number {
  return 2 * GAME_CONFIG.RTP;
}

export const PLINKO_CONFIG = {
  MIN_ROWS: 8,
  MAX_ROWS: 16,
  RISKS: ["low", "medium", "high"] as const,
};

export type PlinkoRisk = typeof PLINKO_CONFIG.RISKS[number];

export const PLINKO_MULTIPLIERS: Record<PlinkoRisk, Record<number, number[]>> = {
  low: {
    8:  [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
    9:  [5.6, 2.0, 1.6, 1.0, 0.7, 0.7, 1.0, 1.6, 2.0, 5.6],
    10: [8.9, 3.0, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 3.0, 8.9],
    11: [8.4, 3.0, 1.9, 1.3, 1.0, 0.7, 0.7, 1.0, 1.3, 1.9, 3.0, 8.4],
    12: [10, 3.0, 1.6, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 1.6, 3.0, 10],
    13: [8.1, 4.0, 3.0, 1.9, 1.2, 0.9, 0.7, 0.7, 0.9, 1.2, 1.9, 3.0, 4.0, 8.1],
    14: [7.1, 4.0, 1.9, 1.4, 1.3, 1.1, 1.0, 0.5, 1.0, 1.1, 1.3, 1.4, 1.9, 4.0, 7.1],
    15: [15, 8.0, 3.0, 2.0, 1.5, 1.1, 1.0, 0.7, 0.7, 1.0, 1.1, 1.5, 2.0, 3.0, 8.0, 15],
    16: [16, 9.0, 2.0, 1.4, 1.4, 1.2, 1.1, 1.0, 0.5, 1.0, 1.1, 1.2, 1.4, 1.4, 2.0, 9.0, 16],
  },
  medium: {
    8:  [13, 3.0, 1.3, 0.7, 0.4, 0.7, 1.3, 3.0, 13],
    9:  [18, 4.0, 1.7, 0.9, 0.5, 0.5, 0.9, 1.7, 4.0, 18],
    10: [22, 5.0, 2.0, 1.4, 0.6, 0.4, 0.6, 1.4, 2.0, 5.0, 22],
    11: [24, 6.0, 3.0, 1.8, 0.7, 0.5, 0.5, 0.7, 1.8, 3.0, 6.0, 24],
    12: [33, 11, 4.0, 2.0, 1.1, 0.6, 0.3, 0.6, 1.1, 2.0, 4.0, 11, 33],
    13: [43, 13, 6.0, 3.0, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3.0, 6.0, 13, 43],
    14: [58, 15, 7.0, 4.0, 1.9, 1.0, 0.5, 0.2, 0.5, 1.0, 1.9, 4.0, 7.0, 15, 58],
    15: [88, 18, 11, 5.0, 3.0, 1.3, 0.5, 0.3, 0.3, 0.5, 1.3, 3.0, 5.0, 11, 18, 88],
    16: [110, 41, 10, 5.0, 3.0, 1.5, 1.0, 0.5, 0.3, 0.5, 1.0, 1.5, 3.0, 5.0, 10, 41, 110],
  },
  high: {
    // Edge bin probabilities: (1/2)^rows per edge
    // 8 rows: 0.39%, 12 rows: 0.024%, 14 rows: 0.006%, 15 rows: 0.003%, 16 rows: 0.0015%
    8:  [29, 4.0, 1.5, 0.3, 0.2, 0.3, 1.5, 4.0, 29],
    9:  [43, 7.0, 2.0, 0.6, 0.2, 0.2, 0.6, 2.0, 7.0, 43],
    10: [76, 10, 3.0, 0.9, 0.3, 0.2, 0.3, 0.9, 3.0, 10, 76],
    11: [120, 14, 5.2, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 5.2, 14, 120],
    12: [170, 24, 8.1, 2.0, 0.7, 0.2, 0.2, 0.2, 0.7, 2.0, 8.1, 24, 170],
    13: [260, 37, 11, 4.0, 1.0, 0.2, 0.2, 0.2, 0.2, 1.0, 4.0, 11, 37, 260],
    // 14 rows: 1000x jackpot at edges (0.006% chance each = 0.012% total)
    // Base = 1020.41 so after RTP (0.98) = 1000x displayed
    14: [1020.41, 56, 18, 5.0, 1.9, 0.3, 0.2, 0.2, 0.2, 0.3, 1.9, 5.0, 18, 56, 1020.41],
    // 15 rows: 1000x jackpot at edges (0.003% chance each = 0.006% total)
    15: [1020.41, 83, 27, 8.0, 3.0, 0.5, 0.2, 0.2, 0.2, 0.2, 0.5, 3.0, 8.0, 27, 83, 1020.41],
    // 16 rows: 1000x jackpot at edges (0.0015% chance each = 0.003% total)
    16: [1020.41, 130, 26, 9.0, 4.0, 2.0, 0.2, 0.2, 0.2, 0.2, 0.2, 2.0, 4.0, 9.0, 26, 130, 1020.41],
  },
};

export function getPlinkoMultipliers(risk: PlinkoRisk, rows: number): number[] {
  const baseMultipliers = PLINKO_MULTIPLIERS[risk][rows];
  if (!baseMultipliers) return [];
  return baseMultipliers.map(m => Math.round(m * GAME_CONFIG.RTP * 100) / 100);
}

// Roulette configuration
export const ROULETTE_CONFIG = {
  RED_NUMBERS: [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36],
  BLACK_NUMBERS: [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35],
  WHEEL_ORDER: [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26],
  BET_TYPES: ["red", "black", "odd", "even", "1-18", "19-36", "straight", "1st12", "2nd12", "3rd12", "col1", "col2", "col3"] as const,
  BASE_PAYOUTS: {
    red: 2,
    black: 2,
    odd: 2,
    even: 2,
    "1-18": 2,
    "19-36": 2,
    straight: 36,
    "1st12": 3,
    "2nd12": 3,
    "3rd12": 3,
    col1: 3,
    col2: 3,
    col3: 3,
  } as const,
  get PAYOUTS() {
    const rtp = GAME_CONFIG.RTP;
    return {
      red: 2 * rtp,
      black: 2 * rtp,
      odd: 2 * rtp,
      even: 2 * rtp,
      "1-18": 2 * rtp,
      "19-36": 2 * rtp,
      straight: 36 * rtp,
      "1st12": 3 * rtp,
      "2nd12": 3 * rtp,
      "3rd12": 3 * rtp,
      col1: 3 * rtp,
      col2: 3 * rtp,
      col3: 3 * rtp,
    };
  },
  COLUMN_NUMBERS: {
    col1: [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
    col2: [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
    col3: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  },
};

export type RouletteBetType = typeof ROULETTE_CONFIG.BET_TYPES[number];

export function getRouletteColor(num: number): "red" | "black" | "green" {
  if (num === 0) return "green";
  return ROULETTE_CONFIG.RED_NUMBERS.includes(num) ? "red" : "black";
}

export function checkRouletteWin(num: number, betType: RouletteBetType, straightNumber?: number): boolean {
  if (betType === "straight") {
    return num === straightNumber;
  }
  if (betType === "red") {
    return ROULETTE_CONFIG.RED_NUMBERS.includes(num);
  }
  if (betType === "black") {
    return ROULETTE_CONFIG.BLACK_NUMBERS.includes(num);
  }
  if (betType === "odd") {
    return num > 0 && num % 2 === 1;
  }
  if (betType === "even") {
    return num > 0 && num % 2 === 0;
  }
  if (betType === "1-18") {
    return num >= 1 && num <= 18;
  }
  if (betType === "19-36") {
    return num >= 19 && num <= 36;
  }
  if (betType === "1st12") {
    return num >= 1 && num <= 12;
  }
  if (betType === "2nd12") {
    return num >= 13 && num <= 24;
  }
  if (betType === "3rd12") {
    return num >= 25 && num <= 36;
  }
  if (betType === "col1") {
    return ROULETTE_CONFIG.COLUMN_NUMBERS.col1.includes(num);
  }
  if (betType === "col2") {
    return ROULETTE_CONFIG.COLUMN_NUMBERS.col2.includes(num);
  }
  if (betType === "col3") {
    return ROULETTE_CONFIG.COLUMN_NUMBERS.col3.includes(num);
  }
  return false;
}

// Blackjack configuration
export const BLACKJACK_CONFIG = {
  DEALER_STANDS_ON_SOFT_17: true,
  BLACKJACK_PAYOUT: 2.5,
  WIN_PAYOUT: 2,
  PUSH_PAYOUT: 1,
  STATUSES: ["betting", "playing", "dealer_turn", "completed"] as const,
  OUTCOMES: ["win", "lose", "push", "blackjack"] as const,
};

export type BlackjackStatus = typeof BLACKJACK_CONFIG.STATUSES[number];
export type BlackjackOutcome = typeof BLACKJACK_CONFIG.OUTCOMES[number];
