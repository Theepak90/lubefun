export const GAME_CONFIG = {
  HOUSE_EDGE: 0.02,
  HOUSE_EDGE_PERCENT: 2,
  RTP: 0.98,
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
