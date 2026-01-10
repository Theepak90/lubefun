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
