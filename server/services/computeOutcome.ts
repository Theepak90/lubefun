import crypto from "crypto";
import { HOUSE_EDGE, RTP, MAX_PAYOUT } from "@shared/schema";

export interface GameChoice {
  target?: number;
  condition?: "above" | "below";
  side?: "cock" | "balls";
  minesCount?: number;
  risk?: "low" | "medium" | "high";
  rows?: number;
  betType?: string;
  straightNumber?: number;
  playerChoice?: "split" | "steal";
  tileIndex?: number;
  revealedCount?: number;
}

export interface OutcomeResult {
  win: boolean;
  payout: number;
  multiplier: number;
  rngProof: string;
  result: Record<string, unknown>;
  houseEdgeApplied: boolean;
}

export function generateServerSeed(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function generateClientSeed(): string {
  return crypto.randomBytes(12).toString("hex");
}

export function hashServerSeed(serverSeed: string): string {
  return crypto.createHash("sha256").update(serverSeed).digest("hex");
}

export function getHmacHash(serverSeed: string, clientSeed: string, nonce: number): string {
  return crypto
    .createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest("hex");
}

function hashToFloat(hash: string, offset: number = 0): number {
  const subHash = hash.substring(offset, offset + 8);
  const number = parseInt(subHash, 16);
  return number / 0xFFFFFFFF;
}

function hashToInt(hash: string, offset: number, max: number): number {
  const subHash = hash.substring(offset, offset + 8);
  const number = parseInt(subHash, 16);
  return number % max;
}

export function computeOutcome(
  gameId: string,
  wager: number,
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  choice: GameChoice
): OutcomeResult {
  const rngProof = getHmacHash(serverSeed, clientSeed, nonce);
  
  switch (gameId) {
    case "dice":
      return computeDiceOutcome(wager, rngProof, choice);
    case "coinflip":
      return computeCoinflipOutcome(wager, rngProof, choice);
    case "mines":
      return computeMinesOutcome(wager, rngProof, choice);
    case "plinko":
      return computePlinkoOutcome(wager, rngProof, choice);
    case "roulette":
      return computeRouletteOutcome(wager, rngProof, choice);
    case "blackjack":
      return computeBlackjackOutcome(wager, rngProof, choice);
    case "split_steal":
      return computeSplitStealOutcome(wager, rngProof, choice);
    case "pressure_valve":
      return computePressureValveOutcome(wager, rngProof, choice);
    default:
      throw new Error(`Unknown game: ${gameId}`);
  }
}

function computeDiceOutcome(wager: number, rngProof: string, choice: GameChoice): OutcomeResult {
  const { target = 50, condition = "above" } = choice;
  
  const roll = (parseInt(rngProof.substring(0, 8), 16) % 10001) / 100;
  
  const winChance = condition === "above" ? (100 - target) / 100 : target / 100;
  const fairMultiplier = 1 / winChance;
  const adjustedMultiplier = fairMultiplier * RTP;
  
  let win = false;
  if (condition === "above") {
    win = roll > target;
  } else {
    win = roll < target;
  }
  
  const rawPayout = win ? wager * adjustedMultiplier : 0;
  const payout = Math.min(rawPayout, MAX_PAYOUT);
  
  return {
    win,
    payout: Math.round(payout * 100) / 100,
    multiplier: Math.round(adjustedMultiplier * 100) / 100,
    rngProof,
    result: { roll, target, condition },
    houseEdgeApplied: true,
  };
}

function computeCoinflipOutcome(wager: number, rngProof: string, choice: GameChoice): OutcomeResult {
  const { side = "cock" } = choice;
  
  const firstByte = parseInt(rngProof.substring(0, 2), 16);
  const result = firstByte % 2 === 0 ? "cock" : "balls";
  
  const win = result === side;
  const fairMultiplier = 2;
  const adjustedMultiplier = fairMultiplier * RTP;
  
  const rawPayout = win ? wager * adjustedMultiplier : 0;
  const payout = Math.min(rawPayout, MAX_PAYOUT);
  
  return {
    win,
    payout: Math.round(payout * 100) / 100,
    multiplier: Math.round(adjustedMultiplier * 100) / 100,
    rngProof,
    result: { side, result },
    houseEdgeApplied: true,
  };
}

function computeMinesOutcome(wager: number, rngProof: string, choice: GameChoice): OutcomeResult {
  const { minesCount = 3, revealedCount = 0 } = choice;
  
  const totalTiles = 25;
  const safeTiles = totalTiles - minesCount;
  
  let multiplier = 1;
  for (let i = 0; i < revealedCount; i++) {
    const remainingSafe = safeTiles - i;
    const remainingTotal = totalTiles - i;
    multiplier *= remainingTotal / remainingSafe;
  }
  multiplier *= RTP;
  
  const payout = revealedCount > 0 ? Math.min(wager * multiplier, MAX_PAYOUT) : 0;
  
  return {
    win: revealedCount > 0,
    payout: Math.round(payout * 100) / 100,
    multiplier: Math.round(multiplier * 100) / 100,
    rngProof,
    result: { minesCount, revealedCount, status: "playing" },
    houseEdgeApplied: true,
  };
}

export function generateMinePositions(rngProof: string, count: number): number[] {
  const positions: number[] = [];
  const allPositions = Array.from({ length: 25 }, (_, i) => i);
  
  let currentHash = rngProof;
  
  for (let i = 0; i < count; i++) {
    if (i > 0 && i % 8 === 0) {
      currentHash = crypto.createHash('sha256').update(currentHash).digest('hex');
    }
    
    const start = (i % 8) * 4;
    const value = parseInt(currentHash.substring(start, start + 4), 16);
    
    const index = value % allPositions.length;
    positions.push(allPositions[index]);
    allPositions.splice(index, 1);
  }
  
  return positions.sort((a, b) => a - b);
}

function computePlinkoOutcome(wager: number, rngProof: string, choice: GameChoice): OutcomeResult {
  const { risk = "medium", rows = 12 } = choice;
  
  const multipliers = getPlinkoMultipliers(risk, rows);
  const { path, binIndex } = generatePlinkoPath(rngProof, rows);
  
  const rawMultiplier = multipliers[binIndex] || 0;
  const adjustedMultiplier = rawMultiplier * RTP;
  
  const win = adjustedMultiplier > 0;
  const rawPayout = wager * adjustedMultiplier;
  const payout = Math.min(rawPayout, MAX_PAYOUT);
  
  return {
    win,
    payout: Math.round(payout * 100) / 100,
    multiplier: Math.round(adjustedMultiplier * 100) / 100,
    rngProof,
    result: { path, binIndex, risk, rows },
    houseEdgeApplied: true,
  };
}

function generatePlinkoPath(rngProof: string, rows: number): { path: number[], binIndex: number } {
  const path: number[] = [];
  let currentHash = rngProof;
  
  for (let i = 0; i < rows; i++) {
    if (i > 0 && i % 32 === 0) {
      currentHash = crypto.createHash('sha256').update(currentHash).digest('hex');
    }
    
    const byteIndex = (i % 32) * 2;
    const byteValue = parseInt(currentHash.substring(byteIndex, byteIndex + 2), 16);
    
    const direction = byteValue % 2;
    path.push(direction);
  }
  
  const binIndex = path.reduce((sum, dir) => sum + dir, 0);
  
  return { path, binIndex };
}

function getPlinkoMultipliers(risk: string, rows: number): number[] {
  const multiplierSets: Record<string, Record<number, number[]>> = {
    low: {
      8: [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
      12: [10, 3, 1.6, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 1.6, 3, 10],
      16: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1.0, 0.5, 1.0, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    },
    medium: {
      8: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
      12: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
      16: [110, 41, 10, 5, 3, 1.5, 1.0, 0.5, 0.3, 0.5, 1.0, 1.5, 3, 5, 10, 41, 110],
    },
    high: {
      8: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
      12: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
      16: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
    },
  };
  
  return multiplierSets[risk]?.[rows] || multiplierSets.medium[12];
}

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

function computeRouletteOutcome(wager: number, rngProof: string, choice: GameChoice): OutcomeResult {
  const { betType = "red", straightNumber } = choice;
  
  const number = parseInt(rngProof.substring(0, 8), 16) % 37;
  const color = number === 0 ? "green" : RED_NUMBERS.includes(number) ? "red" : "black";
  
  let win = false;
  let fairMultiplier = 1;
  
  switch (betType) {
    case "straight":
      win = number === straightNumber;
      fairMultiplier = 36;
      break;
    case "red":
      win = RED_NUMBERS.includes(number);
      fairMultiplier = 2;
      break;
    case "black":
      win = number > 0 && !RED_NUMBERS.includes(number);
      fairMultiplier = 2;
      break;
    case "odd":
      win = number > 0 && number % 2 === 1;
      fairMultiplier = 2;
      break;
    case "even":
      win = number > 0 && number % 2 === 0;
      fairMultiplier = 2;
      break;
    case "1-18":
      win = number >= 1 && number <= 18;
      fairMultiplier = 2;
      break;
    case "19-36":
      win = number >= 19 && number <= 36;
      fairMultiplier = 2;
      break;
    case "1st12":
      win = number >= 1 && number <= 12;
      fairMultiplier = 3;
      break;
    case "2nd12":
      win = number >= 13 && number <= 24;
      fairMultiplier = 3;
      break;
    case "3rd12":
      win = number >= 25 && number <= 36;
      fairMultiplier = 3;
      break;
    case "col1":
      win = number > 0 && number % 3 === 1;
      fairMultiplier = 3;
      break;
    case "col2":
      win = number > 0 && number % 3 === 2;
      fairMultiplier = 3;
      break;
    case "col3":
      win = number > 0 && number % 3 === 0;
      fairMultiplier = 3;
      break;
  }
  
  const adjustedMultiplier = fairMultiplier * RTP;
  const rawPayout = win ? wager * adjustedMultiplier : 0;
  const payout = Math.min(rawPayout, MAX_PAYOUT);
  
  return {
    win,
    payout: Math.round(payout * 100) / 100,
    multiplier: Math.round(adjustedMultiplier * 100) / 100,
    rngProof,
    result: { number, color, betType, straightNumber },
    houseEdgeApplied: true,
  };
}

function computeBlackjackOutcome(wager: number, rngProof: string, choice: GameChoice): OutcomeResult {
  const deck = generateShuffledDeck(rngProof);
  
  return {
    win: false,
    payout: 0,
    multiplier: 0,
    rngProof,
    result: { deck: deck.slice(0, 10), deckHash: crypto.createHash('sha256').update(deck.join(',')).digest('hex').substring(0, 16) },
    houseEdgeApplied: false,
  };
}

function generateShuffledDeck(rngProof: string): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  let currentHash = rngProof;
  
  for (let i = 51; i > 0; i--) {
    if (i % 16 === 0 && i !== 51) {
      currentHash = crypto.createHash('sha256').update(currentHash).digest('hex');
    }
    
    const byteIndex = ((51 - i) % 16) * 4;
    const value = parseInt(currentHash.substring(byteIndex, byteIndex + 4), 16);
    const j = value % (i + 1);
    
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  return deck;
}

function computeSplitStealOutcome(wager: number, rngProof: string, choice: GameChoice): OutcomeResult {
  const { playerChoice = "split" } = choice;
  
  const aiValue = parseInt(rngProof.substring(0, 8), 16) % 100;
  const aiChoice = aiValue < 70 ? "split" : "steal";
  
  let win = false;
  let multiplier = 0;
  
  if (playerChoice === "split" && aiChoice === "split") {
    win = true;
    multiplier = 1.5 * RTP;
  } else if (playerChoice === "steal" && aiChoice === "split") {
    win = true;
    multiplier = 2 * RTP;
  } else if (playerChoice === "split" && aiChoice === "steal") {
    win = false;
    multiplier = 0;
  } else {
    win = false;
    multiplier = 0;
  }
  
  const rawPayout = win ? wager * multiplier : 0;
  const payout = Math.min(rawPayout, MAX_PAYOUT);
  
  return {
    win,
    payout: Math.round(payout * 100) / 100,
    multiplier: Math.round(multiplier * 100) / 100,
    rngProof,
    result: { playerChoice, aiChoice },
    houseEdgeApplied: true,
  };
}

function computePressureValveOutcome(wager: number, rngProof: string, choice: GameChoice): OutcomeResult {
  const pumpNumber = choice.revealedCount || 0;
  
  const burstValue = parseInt(rngProof.substring(0, 8), 16);
  const multiplierValue = parseInt(rngProof.substring(8, 16), 16);
  
  const baseChance = 0.47; // 47% - very high chance to burst on first pump
  const rampRate = 0.20; // 20% increase per pump
  const maxChance = 0.95; // 95% max
  const burstChance = Math.min(baseChance + (pumpNumber * rampRate), maxChance);
  
  const burstRoll = (burstValue % 10000) / 10000;
  const burst = burstRoll < burstChance;
  
  const minJump = 1.4;
  const maxJump = 2.0;
  const jumpRange = maxJump - minJump;
  const multiplierJump = minJump + (multiplierValue / 0xFFFFFFFF) * jumpRange;
  
  const baseMultiplier = 1;
  const currentMultiplier = baseMultiplier + (pumpNumber * multiplierJump * 0.3);
  const adjustedMultiplier = currentMultiplier * RTP;
  
  const win = !burst && pumpNumber > 0;
  const rawPayout = win ? wager * adjustedMultiplier : 0;
  const payout = Math.min(rawPayout, MAX_PAYOUT);
  
  return {
    win,
    payout: Math.round(payout * 100) / 100,
    multiplier: Math.round(adjustedMultiplier * 100) / 100,
    rngProof,
    result: { burst, pumpNumber, multiplierJump: Math.round(multiplierJump * 100) / 100, burstChance },
    houseEdgeApplied: true,
  };
}

export function validateWager(wager: number, minBet: number, maxBet: number): { valid: boolean; error?: string } {
  if (typeof wager !== 'number' || isNaN(wager)) {
    return { valid: false, error: "Invalid wager amount" };
  }
  if (wager < minBet) {
    return { valid: false, error: `Minimum bet is $${minBet}` };
  }
  if (wager > maxBet) {
    return { valid: false, error: `Maximum bet is $${maxBet}` };
  }
  return { valid: true };
}

export function checkMineHit(minePositions: number[], tileIndex: number): boolean {
  return minePositions.includes(tileIndex);
}
