import crypto from "crypto";

const HOUSE_EDGE = 0.04;
const RTP = 0.96;
const SIMULATIONS = 100000;

interface SimResult {
  game: string;
  totalWagered: number;
  totalReturned: number;
  actualRTP: number;
  expectedRTP: number;
  variance: number;
}

function generateRngProof(serverSeed: string, clientSeed: string, nonce: number): string {
  return crypto
    .createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest("hex");
}

function hashToNumber(hash: string): number {
  return parseInt(hash.substring(0, 8), 16) / 0xffffffff;
}

function simulateDice(count: number): SimResult {
  let totalWagered = 0;
  let totalReturned = 0;
  const serverSeed = crypto.randomBytes(32).toString("hex");
  const clientSeed = crypto.randomBytes(12).toString("hex");
  
  for (let i = 0; i < count; i++) {
    const wager = 1;
    totalWagered += wager;
    
    const target = 50;
    const condition = "under";
    const rngProof = generateRngProof(serverSeed, clientSeed, i);
    const roll = hashToNumber(rngProof) * 101;
    
    const winChance = target / 100;
    const baseMultiplier = 1 / winChance;
    const multiplier = baseMultiplier * RTP;
    
    const won = condition === "under" ? roll < target : roll > target;
    if (won) {
      totalReturned += wager * multiplier;
    }
  }
  
  const actualRTP = totalReturned / totalWagered;
  return {
    game: "dice",
    totalWagered,
    totalReturned,
    actualRTP,
    expectedRTP: RTP,
    variance: Math.abs(actualRTP - RTP),
  };
}

function simulateCoinflip(count: number): SimResult {
  let totalWagered = 0;
  let totalReturned = 0;
  const serverSeed = crypto.randomBytes(32).toString("hex");
  const clientSeed = crypto.randomBytes(12).toString("hex");
  
  for (let i = 0; i < count; i++) {
    const wager = 1;
    totalWagered += wager;
    
    const chosenSide = "heads";
    const rngProof = generateRngProof(serverSeed, clientSeed, i);
    const roll = hashToNumber(rngProof);
    const result = roll < 0.5 ? "heads" : "tails";
    
    const multiplier = 2 * RTP;
    const won = result === chosenSide;
    if (won) {
      totalReturned += wager * multiplier;
    }
  }
  
  const actualRTP = totalReturned / totalWagered;
  return {
    game: "coinflip",
    totalWagered,
    totalReturned,
    actualRTP,
    expectedRTP: RTP,
    variance: Math.abs(actualRTP - RTP),
  };
}

function simulatePlinko(count: number): SimResult {
  let totalWagered = 0;
  let totalReturned = 0;
  const serverSeed = crypto.randomBytes(32).toString("hex");
  const clientSeed = crypto.randomBytes(12).toString("hex");
  
  const rows = 16;
  const bins = rows + 1;
  
  const baseMultipliers = [
    1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000
  ];
  
  function binomial(n: number, k: number): number {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    let result = 1;
    for (let i = 0; i < k; i++) {
      result = result * (n - i) / (i + 1);
    }
    return result;
  }
  
  const totalCombinations = Math.pow(2, rows);
  const binProbabilities = Array.from({ length: bins }, (_, k) => 
    binomial(rows, k) / totalCombinations
  );
  
  const rawExpected = binProbabilities.reduce((sum, prob, i) => 
    sum + prob * baseMultipliers[i], 0
  );
  const scaleFactor = 1 / rawExpected;
  const rtpAdjustedMultipliers = baseMultipliers.map(m => m * scaleFactor * RTP);
  
  for (let i = 0; i < count; i++) {
    const wager = 1;
    totalWagered += wager;
    
    let position = 0;
    for (let row = 0; row < rows; row++) {
      const rowHash = crypto
        .createHmac("sha256", serverSeed)
        .update(`${clientSeed}:${i}:${row}`)
        .digest("hex");
      const direction = hashToNumber(rowHash) < 0.5 ? 0 : 1;
      position += direction;
    }
    
    const binIndex = Math.max(0, Math.min(bins - 1, position));
    totalReturned += wager * rtpAdjustedMultipliers[binIndex];
  }
  
  const actualRTP = totalReturned / totalWagered;
  return {
    game: "plinko",
    totalWagered,
    totalReturned,
    actualRTP,
    expectedRTP: RTP,
    variance: Math.abs(actualRTP - RTP),
  };
}

function simulateRoulette(count: number): SimResult {
  let totalWagered = 0;
  let totalReturned = 0;
  const serverSeed = crypto.randomBytes(32).toString("hex");
  const clientSeed = crypto.randomBytes(12).toString("hex");
  
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  
  // European roulette: red has 18/37 probability, standard payout is 2x
  // Fair payout would be 37/18 = 2.055x for 100% RTP
  // With 96% RTP target, adjust multiplier: 2.055 * 0.96 = 1.973x
  const fairMultiplier = 37 / 18; // ~2.055
  const rtpAdjustedMultiplier = fairMultiplier * RTP; // ~1.973
  
  for (let i = 0; i < count; i++) {
    const wager = 1;
    totalWagered += wager;
    
    const rngProof = generateRngProof(serverSeed, clientSeed, i);
    const winningNumber = Math.floor(hashToNumber(rngProof) * 37);
    
    const isRed = redNumbers.includes(winningNumber);
    
    if (isRed) {
      totalReturned += wager * rtpAdjustedMultiplier;
    }
  }
  
  const actualRTP = totalReturned / totalWagered;
  return {
    game: "roulette",
    totalWagered,
    totalReturned,
    actualRTP,
    expectedRTP: RTP,
    variance: Math.abs(actualRTP - RTP),
  };
}

async function runSimulation() {
  console.log("=".repeat(60));
  console.log("RTP SIMULATION - 100,000 BETS PER GAME");
  console.log("=".repeat(60));
  console.log(`Expected RTP: ${(RTP * 100).toFixed(2)}%`);
  console.log(`House Edge: ${(HOUSE_EDGE * 100).toFixed(2)}%`);
  console.log("");
  
  const results: SimResult[] = [
    simulateDice(SIMULATIONS),
    simulateCoinflip(SIMULATIONS),
    simulatePlinko(SIMULATIONS),
    simulateRoulette(SIMULATIONS),
  ];
  
  console.log("RESULTS:");
  console.log("-".repeat(60));
  
  for (const result of results) {
    const status = result.variance < 0.02 ? "PASS" : "WARN";
    console.log(`${result.game.toUpperCase().padEnd(12)} | Actual RTP: ${(result.actualRTP * 100).toFixed(2)}% | Variance: ${(result.variance * 100).toFixed(3)}% | ${status}`);
  }
  
  console.log("-".repeat(60));
  
  const avgRTP = results.reduce((sum, r) => sum + r.actualRTP, 0) / results.length;
  const avgVariance = results.reduce((sum, r) => sum + r.variance, 0) / results.length;
  
  console.log(`AVERAGE     | Actual RTP: ${(avgRTP * 100).toFixed(2)}% | Variance: ${(avgVariance * 100).toFixed(3)}%`);
  console.log("");
  
  if (avgVariance < 0.02) {
    console.log("SIMULATION PASSED - RTP within expected bounds");
  } else {
    console.log("SIMULATION WARNING - RTP variance higher than expected");
  }
  
  console.log("=".repeat(60));
}

runSimulation().catch(console.error);
