import crypto from "crypto";

export function generateServerSeed() {
  return crypto.randomBytes(32).toString("hex");
}

export function generateClientSeed() {
  return crypto.randomBytes(12).toString("hex");
}

export function getResult(serverSeed: string, clientSeed: string, nonce: number) {
  const hash = crypto
    .createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest("hex");
  return hash;
}

// Dice: 0.00 to 100.00
export function getDiceRoll(serverSeed: string, clientSeed: string, nonce: number) {
  const hash = getResult(serverSeed, clientSeed, nonce);
  // Take first 4 bytes
  const subHash = hash.substring(0, 8);
  const number = parseInt(subHash, 16);
  // Modulo 10001 to get 0-10000, then divide by 100 for 2 decimal precision
  const roll = (number % 10001) / 100;
  return roll;
}

// Coinflip: 0 (Cock) or 1 (Balls)
export function getCoinflipResult(serverSeed: string, clientSeed: string, nonce: number) {
  const hash = getResult(serverSeed, clientSeed, nonce);
  // Even or Odd on first byte? 
  // Simple modulo 2 on the first byte
  const firstByte = parseInt(hash.substring(0, 2), 16);
  return firstByte % 2 === 0 ? "cock" : "balls";
}

// Mines: Generate array of mine positions [0-24]
export function getMines(serverSeed: string, clientSeed: string, nonce: number, count: number): number[] {
  const hash = getResult(serverSeed, clientSeed, nonce);
  
  // Deterministic shuffle logic based on hash
  // We need distinct positions.
  const positions: number[] = [];
  const allPositions = Array.from({ length: 25 }, (_, i) => i);
  
  // Use hash to pick 'count' positions
  // This is a simplified Fisher-Yates shuffle using the hash as randomness source
  // For production, would need a more robust PRNG seeded by the hash.
  // Here we'll just cycle through hash bytes.
  
  let currentHash = hash;
  
  for (let i = 0; i < count; i++) {
    // Re-hash if needed for more entropy (simple chain)
    if (i > 0 && i % 8 === 0) {
      currentHash = crypto.createHash('sha256').update(currentHash).digest('hex');
    }
    
    // Take a segment
    const start = (i % 8) * 4;
    const value = parseInt(currentHash.substring(start, start + 4), 16);
    
    const index = value % allPositions.length;
    positions.push(allPositions[index]);
    allPositions.splice(index, 1);
  }
  
  return positions.sort((a, b) => a - b);
}

// Plinko: Generate the path of the ball (array of 0s and 1s for left/right bounces)
// Returns the path array and the final bin index
export function getPlinkoPath(serverSeed: string, clientSeed: string, nonce: number, rows: number): { path: number[], binIndex: number } {
  const hash = getResult(serverSeed, clientSeed, nonce);
  
  const path: number[] = [];
  let currentHash = hash;
  
  for (let i = 0; i < rows; i++) {
    // Re-hash if needed for more entropy
    if (i > 0 && i % 32 === 0) {
      currentHash = crypto.createHash('sha256').update(currentHash).digest('hex');
    }
    
    // Take 2 characters (1 byte) per row
    const byteIndex = (i % 32) * 2;
    const byteValue = parseInt(currentHash.substring(byteIndex, byteIndex + 2), 16);
    
    // 0 = left, 1 = right (based on even/odd)
    const direction = byteValue % 2;
    path.push(direction);
  }
  
  // Calculate final bin index: count of right moves
  const binIndex = path.reduce((sum, dir) => sum + dir, 0);
  
  return { path, binIndex };
}

// Roulette: 0-36 (European single-zero wheel)
export function getRouletteNumber(serverSeed: string, clientSeed: string, nonce: number): number {
  const hash = getResult(serverSeed, clientSeed, nonce);
  // Take first 4 bytes and mod 37 for 0-36
  const subHash = hash.substring(0, 8);
  const number = parseInt(subHash, 16);
  return number % 37;
}

// Blackjack: Generate a shuffled deck of 52 cards
// Returns an array of card indices 0-51 in shuffled order
// Cards: 0-12 = A-K Spades, 13-25 = A-K Hearts, 26-38 = A-K Diamonds, 39-51 = A-K Clubs
export function getShuffledDeck(serverSeed: string, clientSeed: string, nonce: number): number[] {
  const hash = getResult(serverSeed, clientSeed, nonce);
  
  // Create deck [0, 1, 2, ..., 51]
  const deck = Array.from({ length: 52 }, (_, i) => i);
  
  // Fisher-Yates shuffle using hash as randomness source
  let currentHash = hash;
  
  for (let i = 51; i > 0; i--) {
    // Re-hash periodically for more entropy
    if (i % 16 === 0 && i !== 51) {
      currentHash = crypto.createHash('sha256').update(currentHash).digest('hex');
    }
    
    // Take 4 hex chars (2 bytes) for each swap
    const byteIndex = ((51 - i) % 16) * 4;
    const value = parseInt(currentHash.substring(byteIndex, byteIndex + 4), 16);
    const j = value % (i + 1);
    
    // Swap
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  return deck;
}

// Card helper functions
export function getCardValue(cardIndex: number): number {
  const rank = cardIndex % 13; // 0=A, 1=2, ..., 9=10, 10=J, 11=Q, 12=K
  if (rank === 0) return 11; // Ace starts as 11
  if (rank >= 10) return 10; // J, Q, K = 10
  return rank + 1;
}

export function getCardRank(cardIndex: number): string {
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  return ranks[cardIndex % 13];
}

export function getCardSuit(cardIndex: number): string {
  const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
  return suits[Math.floor(cardIndex / 13)];
}

export function calculateHandTotal(cards: number[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  
  for (const card of cards) {
    const value = getCardValue(card);
    total += value;
    if (value === 11) aces++;
  }
  
  // Convert aces from 11 to 1 if over 21
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  
  // Soft hand has an ace counted as 11
  const soft = aces > 0 && total <= 21;
  
  return { total, soft };
}

// Pressure Valve: Returns burst decision and multiplier jump for a pump
// Uses hash to determine: 1) did it burst? 2) how much multiplier to add?
export function getPressureValvePump(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  pumpNumber: number
): { burst: boolean; multiplierJump: number } {
  const hash = getResult(serverSeed, clientSeed, nonce);
  
  // Use different parts of hash for burst check and multiplier
  const burstValue = parseInt(hash.substring(0, 8), 16);
  const multiplierValue = parseInt(hash.substring(8, 16), 16);
  
  // Burst chance: starts at 30% and ramps up to 90% max
  // Formula: baseChance + (pumpNumber * rampRate), capped at 90%
  const baseChance = 0.30; // 30% - high chance to burst on first pump
  const rampRate = 0.18; // 18% increase per pump
  const maxChance = 0.90; // 90% max
  const burstChance = Math.min(baseChance + (pumpNumber * rampRate), maxChance);
  
  // Convert to 0-1 range and check
  const burstRoll = (burstValue % 10000) / 10000;
  const burst = burstRoll < burstChance;
  
  // Multiplier jump: random between 1.4x and 2.0x
  // Maps 0-0xFFFFFFFF to 1.4-2.0 range
  const minJump = 1.4;
  const maxJump = 2.0;
  const jumpRange = maxJump - minJump;
  const multiplierJump = minJump + (multiplierValue / 0xFFFFFFFF) * jumpRange;
  
  return { burst, multiplierJump: Math.round(multiplierJump * 100) / 100 };
}
