import { useState, useRef } from "react";
import { Layout } from "@/components/ui/Layout";
import { useCoinflipGame } from "@/hooks/use-games";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { GAME_CONFIG } from "@shared/config";
import { useGameHistory } from "@/hooks/use-game-history";
import { useSound } from "@/hooks/use-sound";
import { RecentResults } from "@/components/RecentResults";
import { LiveWins } from "@/components/LiveWins";

const FLIP_DURATION = 1.4;
const FLIP_ROTATIONS = 6;

export default function Coinflip() {
  const { mutate: playCoinflip, isPending } = useCoinflipGame();
  const { user } = useAuth();
  const { results, addResult, clearHistory } = useGameHistory();
  const { play: playSound } = useSound();
  const [side, setSide] = useState<"heads" | "tails">("heads");
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState<"heads" | "tails" | null>(null);
  const [amount, setAmount] = useState<string>("10");
  const [targetRotation, setTargetRotation] = useState(0);
  const [doubleStake, setDoubleStake] = useState(false);
  const [insurance, setInsurance] = useState(false);
  const [twoFlipMode, setTwoFlipMode] = useState(false);
  const isAnimatingRef = useRef(false);

  const INSURANCE_FEE_PERCENT = 0.05;
  const INSURANCE_REFUND_PERCENT = 0.10;
  const TWO_FLIP_WIN_CHANCE = 0.75;
  const TWO_FLIP_MULTIPLIER = (1 / TWO_FLIP_WIN_CHANCE) * GAME_CONFIG.RTP;

  const baseMultiplier = twoFlipMode ? TWO_FLIP_MULTIPLIER : 2 * GAME_CONFIG.RTP;
  const winChance = twoFlipMode ? TWO_FLIP_WIN_CHANCE * 100 : 50;
  const multiplier = baseMultiplier.toFixed(4);
  
  const baseAmount = parseFloat(amount || "0");
  const stakeMultiplier = twoFlipMode ? 2 : (doubleStake ? 2 : 1);
  const effectiveBet = baseAmount * stakeMultiplier;
  const insuranceFee = insurance && !twoFlipMode ? baseAmount * INSURANCE_FEE_PERCENT : 0;
  const totalDeducted = effectiveBet + insuranceFee;
  const potentialProfit = effectiveBet * baseMultiplier - effectiveBet;
  const insuranceRefund = insurance && !twoFlipMode ? baseAmount * INSURANCE_REFUND_PERCENT : 0;
  const potentialLoss = effectiveBet - insuranceRefund;

  const handleBet = () => {
    if (isAnimatingRef.current) return;
    
    const val = parseFloat(amount);
    if (isNaN(val) || val < 1) return;
    if (totalDeducted > (user?.balance || 0)) return;
    
    isAnimatingRef.current = true;
    setFlipping(true);
    setResult(null);
    playSound("flip");
    
    const currentDoubleStake = doubleStake;
    const currentInsurance = insurance;
    const currentTwoFlipMode = twoFlipMode;
    const currentInsuranceFee = insuranceFee;
    const currentInsuranceRefund = insuranceRefund;
    const currentEffectiveBet = effectiveBet;
    const currentBaseMultiplier = baseMultiplier;
    
    playCoinflip(
      { betAmount: currentEffectiveBet, side },
      {
        onSuccess: (data: any) => {
          const flipResult = data.result.flip as "heads" | "tails";
          
          let won = data.won;
          let secondFlip: "heads" | "tails" | null = null;
          
          if (currentTwoFlipMode) {
            secondFlip = Math.random() < 0.5 ? "heads" : "tails";
            won = flipResult === side || secondFlip === side;
          }
          
          const baseRotations = FLIP_ROTATIONS * 360;
          const finalRotation = flipResult === "tails" ? baseRotations + 180 : baseRotations;
          setTargetRotation(finalRotation);
          
          let actualProfit: number;
          if (won) {
            actualProfit = currentEffectiveBet * currentBaseMultiplier - currentEffectiveBet;
          } else {
            actualProfit = -currentEffectiveBet;
            if (currentInsurance && !currentTwoFlipMode) {
              actualProfit = -val + currentInsuranceRefund;
            }
          }
          actualProfit -= currentInsuranceFee;
          
          const boosters: string[] = [];
          if (currentTwoFlipMode) boosters.push("Two-Flip");
          else if (currentDoubleStake) boosters.push("2x Stake");
          if (currentInsurance && !currentTwoFlipMode) boosters.push("Insurance");
          const boosterStr = boosters.length > 0 ? ` [${boosters.join(", ")}]` : "";
          
          const flipDetail = currentTwoFlipMode && secondFlip 
            ? `Picked ${side}, got ${flipResult} & ${secondFlip}` 
            : `Picked ${side}, got ${flipResult}`;
          
          addResult({
            game: "coinflip",
            betAmount: currentEffectiveBet + currentInsuranceFee,
            won: won,
            profit: actualProfit,
            detail: `${flipDetail}${boosterStr}`
          });
          
          setTimeout(() => {
            playSound("land");
          }, FLIP_DURATION * 1000 - 100);
          
          setTimeout(() => {
            setResult(flipResult);
            setFlipping(false);
            isAnimatingRef.current = false;
            playSound(won ? "win" : "lose");
          }, FLIP_DURATION * 1000 + 100);
        },
        onError: () => {
          setFlipping(false);
          isAnimatingRef.current = false;
        }
      }
    );
  };

  const setPercent = (percent: number) => {
    if (!user) return;
    setAmount((user.balance * percent).toFixed(2));
  };

  const halve = () => setAmount((prev) => (parseFloat(prev) / 2).toFixed(2));
  const double = () => setAmount((prev) => (parseFloat(prev) * 2).toFixed(2));

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Single unified game frame */}
        <div className="bg-[#0d1419] border border-[#1a2530] rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
          
          <div className="flex flex-col lg:flex-row">
            
            {/* Left Column: Betting Panel */}
            <div className="lg:w-72 shrink-0 bg-[#111921] border-b lg:border-b-0 lg:border-r border-[#1a2530] p-5">
              
              {/* Manual/Auto Tabs */}
              <div className="flex bg-[#0d1419] rounded-lg p-1 mb-5 border border-[#1a2530]">
                <button className="flex-1 py-2 rounded-md text-xs font-semibold bg-[#1a2530] text-white">
                  Manual
                </button>
                <button className="flex-1 py-2 rounded-md text-xs font-semibold text-slate-500 hover:text-slate-300 transition-colors">
                  Auto
                </button>
              </div>

              {/* Bet Amount */}
              <div className="space-y-2 mb-5">
                <div className="flex justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  <Label className="text-slate-500">Bet Amount</Label>
                  <span>${parseFloat(amount || "0").toFixed(2)}</span>
                </div>
                
                <div className="flex gap-1 bg-[#0d1419] p-1 rounded-lg border border-[#1a2530]">
                  <Input 
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="border-none bg-transparent h-9 focus-visible:ring-0 font-mono font-semibold text-white text-sm"
                    min={1}
                    max={1000}
                    data-testid="input-bet-amount"
                  />
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all"
                    onClick={halve}
                  >
                    ½
                  </button>
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all"
                    onClick={double}
                  >
                    2x
                  </button>
                </div>
                
                <div className="grid grid-cols-4 gap-1.5">
                  {[0.1, 0.25, 0.5, 1].map((pct) => (
                    <button 
                      key={pct} 
                      className="py-1.5 rounded-md bg-[#1a2530]/50 hover:bg-[#1a2530] text-[10px] font-semibold text-slate-500 hover:text-white transition-all border border-transparent hover:border-[#2a3a4a]"
                      onClick={() => setPercent(pct)}
                    >
                      {pct === 1 ? "Max" : `${pct * 100}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Profit on Win */}
              <div className="space-y-2 mb-4">
                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Profit on Win
                </Label>
                <div className="bg-[#0d1419] border border-[#1a2530] rounded-lg px-3 py-2.5">
                  <span className="font-mono font-semibold text-emerald-400 text-sm">
                    +${potentialProfit.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Boosters Section */}
              <div className="space-y-2 mb-5">
                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Boosters (Optional)
                </Label>

                {/* Two-Flip Mode */}
                <button
                  onClick={() => {
                    setTwoFlipMode(!twoFlipMode);
                    if (!twoFlipMode) {
                      setDoubleStake(false);
                      setInsurance(false);
                    }
                  }}
                  disabled={flipping}
                  className={cn(
                    "w-full p-3 rounded-lg border transition-all text-left",
                    twoFlipMode 
                      ? "bg-purple-500/10 border-purple-500/50 shadow-[0_0_10px_-3px_rgba(168,85,247,0.3)]" 
                      : "bg-[#0d1419] border-[#1a2530] hover:border-[#2a3a4a]"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn(
                      "text-xs font-semibold",
                      twoFlipMode ? "text-purple-400" : "text-slate-300"
                    )}>
                      Two-Flip Mode
                    </span>
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                      twoFlipMode ? "border-purple-400 bg-purple-400" : "border-slate-500"
                    )}>
                      {twoFlipMode && <div className="w-1.5 h-1.5 rounded-full bg-purple-900" />}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Stake: ${(baseAmount * 2).toFixed(2)} (2x) • Payout: ${(baseAmount * 2 * TWO_FLIP_MULTIPLIER).toFixed(2)}
                  </p>
                  <p className="text-[9px] text-slate-600 mt-0.5">
                    Win if either coin matches. Win chance: 75%
                  </p>
                </button>
                
                {/* Double Stake Booster */}
                <button
                  onClick={() => setDoubleStake(!doubleStake)}
                  disabled={flipping || twoFlipMode}
                  className={cn(
                    "w-full p-3 rounded-lg border transition-all text-left",
                    twoFlipMode ? "opacity-50 cursor-not-allowed" : "",
                    doubleStake && !twoFlipMode
                      ? "bg-amber-500/10 border-amber-500/50 shadow-[0_0_10px_-3px_rgba(245,158,11,0.3)]" 
                      : "bg-[#0d1419] border-[#1a2530] hover:border-[#2a3a4a]"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn(
                      "text-xs font-semibold",
                      doubleStake && !twoFlipMode ? "text-amber-400" : "text-slate-300"
                    )}>
                      Double Stake
                    </span>
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                      doubleStake && !twoFlipMode ? "border-amber-400 bg-amber-400" : "border-slate-500"
                    )}>
                      {doubleStake && !twoFlipMode && <div className="w-1.5 h-1.5 rounded-full bg-amber-900" />}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Bet ${(baseAmount * 2).toFixed(2)} → Win ${(baseAmount * 2 * 2 * GAME_CONFIG.RTP).toFixed(2)}
                  </p>
                  <p className="text-[9px] text-slate-600 mt-0.5">
                    Win chance stays at 50%
                  </p>
                </button>

                {/* Insurance Booster */}
                <button
                  onClick={() => setInsurance(!insurance)}
                  disabled={flipping || twoFlipMode}
                  className={cn(
                    "w-full p-3 rounded-lg border transition-all text-left",
                    twoFlipMode ? "opacity-50 cursor-not-allowed" : "",
                    insurance && !twoFlipMode
                      ? "bg-blue-500/10 border-blue-500/50 shadow-[0_0_10px_-3px_rgba(59,130,246,0.3)]" 
                      : "bg-[#0d1419] border-[#1a2530] hover:border-[#2a3a4a]"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn(
                      "text-xs font-semibold",
                      insurance && !twoFlipMode ? "text-blue-400" : "text-slate-300"
                    )}>
                      Insurance
                    </span>
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                      insurance && !twoFlipMode ? "border-blue-400 bg-blue-400" : "border-slate-500"
                    )}>
                      {insurance && !twoFlipMode && <div className="w-1.5 h-1.5 rounded-full bg-blue-900" />}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Fee: ${(baseAmount * INSURANCE_FEE_PERCENT).toFixed(2)} ({(INSURANCE_FEE_PERCENT * 100).toFixed(0)}%) • Refund: ${(baseAmount * INSURANCE_REFUND_PERCENT).toFixed(2)} ({(INSURANCE_REFUND_PERCENT * 100).toFixed(0)}%)
                  </p>
                  <p className="text-[9px] text-slate-600 mt-0.5">
                    Lose only ${(baseAmount - baseAmount * INSURANCE_REFUND_PERCENT).toFixed(2)} instead of ${baseAmount.toFixed(2)}
                  </p>
                </button>
              </div>

              {/* Total Cost Display */}
              {(twoFlipMode || doubleStake || insurance) && (
                <div className="bg-[#0d1419] border border-[#1a2530] rounded-lg p-2.5 mb-4">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Total cost:</span>
                    <span className="text-white font-mono font-semibold">${totalDeducted.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Place Bet Button */}
              <Button 
                size="lg" 
                className="w-full h-12 text-sm font-bold bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]" 
                onClick={handleBet}
                disabled={isPending || flipping || !user || totalDeducted > (user?.balance || 0)}
                data-testid="button-place-bet"
              >
                {isPending || flipping ? "Flipping..." : user ? "Place Bet" : "Login to Play"}
              </Button>
            </div>

            {/* Right Column: Game Panel */}
            <div className="flex-1 p-5 lg:p-8 relative flex flex-col items-center justify-center min-h-[480px]">
              
              {/* Fair Play Badge */}
              <div className="absolute top-4 right-4">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1a2530] rounded-full border border-[#2a3a4a]">
                  <Shield className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] font-medium text-emerald-400">Fair Play</span>
                </div>
              </div>

              {/* Side Selection Pills */}
              <div className="mb-8">
                <div className="flex bg-[#0d1419] p-1 rounded-full border border-[#1a2530]">
                  <button 
                    onClick={() => setSide("heads")}
                    className={cn(
                      "px-8 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 relative",
                      side === "heads" 
                        ? "bg-gradient-to-r from-yellow-500 to-amber-500 text-yellow-950 shadow-[0_0_20px_-3px_rgba(245,158,11,0.5)]" 
                        : "text-slate-400 hover:text-white"
                    )}
                  >
                    Heads
                  </button>
                  <button 
                    onClick={() => setSide("tails")}
                    className={cn(
                      "px-8 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 relative",
                      side === "tails" 
                        ? "bg-gradient-to-r from-slate-400 to-slate-500 text-slate-900 shadow-[0_0_20px_-3px_rgba(148,163,184,0.5)]" 
                        : "text-slate-400 hover:text-white"
                    )}
                  >
                    Tails
                  </button>
                </div>
              </div>

              {/* The Coin - Larger with premium lighting */}
              <div className="relative w-48 h-48" style={{ perspective: "1200px" }}>
                {/* Ambient glow */}
                <div className={cn(
                  "absolute inset-0 rounded-full blur-2xl transition-colors duration-500",
                  result === null ? "bg-yellow-500/20" :
                  result === side ? "bg-emerald-500/30" : "bg-red-500/30"
                )} />
                
                {/* Bounce container */}
                <motion.div
                  className="w-full h-full"
                  animate={{ 
                    y: flipping ? [0, -120, -80, -40, 0] : 0,
                    scale: flipping ? [1, 0.9, 0.95, 0.98, 1] : 1
                  }}
                  transition={{ 
                    duration: FLIP_DURATION,
                    ease: [0.22, 1, 0.36, 1],
                    times: [0, 0.3, 0.6, 0.85, 1]
                  }}
                >
                  {/* Rotation container - rotates on X axis for realistic flip */}
                  <motion.div
                    className="w-full h-full relative"
                    animate={{ 
                      rotateX: flipping ? targetRotation : (result === "tails" ? 180 : 0)
                    }}
                    transition={{ 
                      duration: FLIP_DURATION,
                      ease: [0.22, 1, 0.36, 1]
                    }}
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    {/* Front (Heads) */}
                    <div 
                      className="absolute inset-0 rounded-full flex items-center justify-center shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5),inset_0_-4px_10px_rgba(0,0,0,0.2),inset_0_4px_10px_rgba(255,255,255,0.3)]"
                      style={{ 
                        backfaceVisibility: "hidden",
                        background: "linear-gradient(145deg, #fcd34d 0%, #f59e0b 50%, #d97706 100%)"
                      }}
                    >
                      <div className="w-36 h-36 rounded-full border-2 border-yellow-600/40 flex items-center justify-center bg-gradient-to-br from-yellow-400/20 to-transparent">
                        <span className="text-3xl font-bold text-yellow-900/80 tracking-wide">HEADS</span>
                      </div>
                    </div>

                    {/* Back (Tails) */}
                    <div 
                      className="absolute inset-0 rounded-full flex items-center justify-center shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5),inset_0_-4px_10px_rgba(0,0,0,0.2),inset_0_4px_10px_rgba(255,255,255,0.3)]"
                      style={{ 
                        backfaceVisibility: "hidden",
                        transform: "rotateX(180deg)",
                        background: "linear-gradient(145deg, #cbd5e1 0%, #94a3b8 50%, #64748b 100%)"
                      }}
                    >
                      <div className="w-36 h-36 rounded-full border-2 border-slate-500/40 flex items-center justify-center bg-gradient-to-br from-slate-300/20 to-transparent">
                        <span className="text-3xl font-bold text-slate-700/80 tracking-wide">TAILS</span>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              </div>

              {/* Compact Result Area */}
              <div className="h-20 mt-6 flex flex-col items-center justify-center">
                <AnimatePresence mode="wait">
                  {result && !flipping ? (
                    <motion.div
                      key="result"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="flex flex-col items-center gap-2"
                    >
                      <span className={cn(
                        "text-2xl font-bold",
                        result === side ? "text-emerald-400" : "text-red-400"
                      )}>
                        {result === side ? "WIN" : "LOSS"}
                      </span>
                      <span className={cn(
                        "text-lg font-mono font-semibold",
                        result === side ? "text-emerald-400/80" : "text-red-400/80"
                      )}>
                        {result === side 
                          ? `+$${((parseFloat(amount || "0") * parseFloat(multiplier)) - parseFloat(amount || "0")).toFixed(2)}` 
                          : `-$${parseFloat(amount || "0").toFixed(2)}`}
                      </span>
                    </motion.div>
                  ) : flipping ? (
                    <motion.span
                      key="flipping"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-slate-400 text-sm font-medium"
                    >
                      Flipping...
                    </motion.span>
                  ) : (
                    <motion.span
                      key="ready"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-slate-500 text-sm"
                    >
                      Pick a side and place your bet
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom Stats Row */}
              <div className="flex gap-6 mt-4">
                <div className="text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Multiplier
                  </span>
                  <span className={cn(
                    "font-mono font-semibold",
                    twoFlipMode ? "text-purple-400" : "text-white"
                  )}>{multiplier}x</span>
                </div>
                <div className="w-px bg-[#1a2530]" />
                <div className="text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Win Chance
                  </span>
                  <span className={cn(
                    "font-mono font-semibold",
                    twoFlipMode ? "text-purple-400" : "text-white"
                  )}>{winChance.toFixed(2)}%</span>
                </div>
              </div>

            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RecentResults 
            results={results} 
            onClear={clearHistory}
            filterGame="coinflip"
          />
          <LiveWins />
        </div>
      </div>
    </Layout>
  );
}
