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

// Coinflip: 0 (Heads) or 1 (Tails)
export function getCoinflipResult(serverSeed: string, clientSeed: string, nonce: number) {
  const hash = getResult(serverSeed, clientSeed, nonce);
  // Even or Odd on first byte? 
  // Simple modulo 2 on the first byte
  const firstByte = parseInt(hash.substring(0, 2), 16);
  return firstByte % 2 === 0 ? "heads" : "tails";
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
