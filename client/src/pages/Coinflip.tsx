import { useState, useRef, useEffect, useCallback } from "react";
import { Layout } from "@/components/ui/Layout";
import { useCoinflipGame } from "@/hooks/use-games";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { GAME_CONFIG } from "@shared/config";
import { useGameHistory } from "@/hooks/use-game-history";
import { useSound } from "@/hooks/use-sound";
import { useProfitTracker, formatCurrency } from "@/hooks/use-profit-tracker";
import { ProfitTrackerWidget } from "@/components/ProfitTrackerWidget";
import { RecentResults } from "@/components/RecentResults";
import { LiveWins } from "@/components/LiveWins";
import { useToast } from "@/hooks/use-toast";
import coinCockImg from "@assets/Golden_rooster_on_shining_coin_1768116520918.png";
import coinBallsImg from "@assets/ChatGPT_Image_Jan_11,_2026,_07_22_38_AM_1768116520919.png";

const FLIP_DURATION = 1.4;
const FLIP_ROTATIONS = 6;

export default function Coinflip() {
  const { mutate: playCoinflip, isPending } = useCoinflipGame();
  const { user } = useAuth();
  const { results, addResult, clearHistory } = useGameHistory();
  const { play: playSound } = useSound();
  const { recordResult } = useProfitTracker();
  const { toast } = useToast();
  const [side, setSide] = useState<"cock" | "balls">("cock");
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState<"cock" | "balls" | null>(null);
  const [amount, setAmount] = useState<string>("10");
  const [targetRotation, setTargetRotation] = useState(0);
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [autoBetCount, setAutoBetCount] = useState<string>("10");
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoBetsRemaining, setAutoBetsRemaining] = useState(0);
  const [stopOnWin, setStopOnWin] = useState(false);
  const [stopOnLoss, setStopOnLoss] = useState(false);
  const isAnimatingRef = useRef(false);
  const autoStopRef = useRef(false);

  const baseMultiplier = 2 * GAME_CONFIG.RTP;
  const multiplier = baseMultiplier.toFixed(4);
  
  const baseAmount = parseFloat(amount || "0");
  const potentialProfit = baseAmount * baseMultiplier - baseAmount;

  const handleBet = useCallback((isAutoBet = false) => {
    if (isAnimatingRef.current) return;
    
    const val = parseFloat(amount);
    if (isNaN(val) || val < 0.1) return;
    if (val > (user?.balance || 0)) return;
    
    isAnimatingRef.current = true;
    setFlipping(true);
    setResult(null);
    playSound("flip");
    
    const currentSide = side;
    const currentAmount = val;
    const currentStopOnWin = stopOnWin;
    const currentStopOnLoss = stopOnLoss;
    
    playCoinflip(
      { betAmount: val, side },
      {
        onSuccess: (data: any) => {
          const flipResult = data.result.flip as "cock" | "balls";
          const won = data.won;
          
          const baseRotations = FLIP_ROTATIONS * 360;
          const finalRotation = flipResult === "balls" ? baseRotations + 180 : baseRotations;
          setTargetRotation(finalRotation);
          
          const profit = won ? currentAmount * baseMultiplier - currentAmount : -currentAmount;
          
          addResult({
            game: "coinflip",
            betAmount: currentAmount,
            won: won,
            profit: profit,
            detail: `Picked ${currentSide}, got ${flipResult}`
          });
          
          setTimeout(() => {
            playSound("land");
          }, FLIP_DURATION * 1000 - 100);
          
          setTimeout(() => {
            setResult(flipResult);
            setFlipping(false);
            isAnimatingRef.current = false;
            playSound(won ? "win" : "lose");
            
            const payout = won ? currentAmount * baseMultiplier : 0;
            recordResult("coinflip", currentAmount, payout, won);
            
            toast({
              title: won ? "You won!" : "You lost",
              description: won 
                ? `Won ${formatCurrency(payout)} (profit ${formatCurrency(profit)})`
                : `Lost ${formatCurrency(currentAmount)} (profit ${formatCurrency(-currentAmount)})`,
              duration: 1500,
            });
            
            if (isAutoBet && !autoStopRef.current) {
              if ((won && currentStopOnWin) || (!won && currentStopOnLoss)) {
                setAutoRunning(false);
                setAutoBetsRemaining(0);
                autoStopRef.current = true;
              } else {
                setAutoBetsRemaining(prev => {
                  const newCount = prev - 1;
                  if (newCount <= 0) {
                    setAutoRunning(false);
                    autoStopRef.current = true;
                  }
                  return newCount;
                });
              }
            }
          }, FLIP_DURATION * 1000 + 100);
        },
        onError: () => {
          setFlipping(false);
          isAnimatingRef.current = false;
          if (isAutoBet) {
            setAutoRunning(false);
            setAutoBetsRemaining(0);
          }
        }
      }
    );
  }, [amount, side, user?.balance, playCoinflip, playSound, addResult, baseMultiplier, stopOnWin, stopOnLoss, recordResult, toast]);

  useEffect(() => {
    if (autoRunning && autoBetsRemaining > 0 && !flipping && !isAnimatingRef.current && !autoStopRef.current) {
      const timer = setTimeout(() => {
        if (!autoStopRef.current && autoBetsRemaining > 0) {
          handleBet(true);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoRunning, autoBetsRemaining, flipping, handleBet]);

  const startAutoBet = () => {
    const count = parseInt(autoBetCount);
    if (isNaN(count) || count < 1) return;
    autoStopRef.current = false;
    setAutoBetsRemaining(count);
    setAutoRunning(true);
  };

  const stopAutoBet = () => {
    autoStopRef.current = true;
    setAutoRunning(false);
    setAutoBetsRemaining(0);
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
        <div className="bg-[#0d1419] border border-[#1a2530] rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
          
          <div className="flex flex-col lg:flex-row">
            
            {/* Left Column: Betting Panel */}
            <div className="lg:w-72 shrink-0 bg-[#111921] border-b lg:border-b-0 lg:border-r border-[#1a2530] p-5">
              
              {/* Manual/Auto Tabs */}
              <div className="flex bg-[#0d1419] rounded-lg p-1 mb-5 border border-[#1a2530]">
                <button 
                  onClick={() => { setMode("manual"); stopAutoBet(); }}
                  className={cn(
                    "flex-1 py-2 rounded-md text-xs font-semibold transition-colors",
                    mode === "manual" ? "bg-[#1a2530] text-white" : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  Manual
                </button>
                <button 
                  onClick={() => setMode("auto")}
                  className={cn(
                    "flex-1 py-2 rounded-md text-xs font-semibold transition-colors",
                    mode === "auto" ? "bg-[#1a2530] text-white" : "text-slate-500 hover:text-slate-300"
                  )}
                >
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
                    min={0.1}
                    step={0.1}
                    max={1000}
                    disabled={autoRunning}
                    data-testid="input-bet-amount"
                  />
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all disabled:opacity-50"
                    onClick={halve}
                    disabled={autoRunning}
                  >
                    ½
                  </button>
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all disabled:opacity-50"
                    onClick={double}
                    disabled={autoRunning}
                  >
                    2x
                  </button>
                </div>
                
                <div className="grid grid-cols-4 gap-1.5">
                  {[0.1, 0.25, 0.5, 1].map((pct) => (
                    <button 
                      key={pct} 
                      className="py-1.5 rounded-md bg-[#1a2530]/50 hover:bg-[#1a2530] text-[10px] font-semibold text-slate-500 hover:text-white transition-all border border-transparent hover:border-[#2a3a4a] disabled:opacity-50"
                      onClick={() => setPercent(pct)}
                      disabled={autoRunning}
                    >
                      {pct === 1 ? "Max" : `${pct * 100}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Profit on Win */}
              <div className="space-y-2 mb-5">
                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Profit on Win
                </Label>
                <div className="bg-[#0d1419] border border-[#1a2530] rounded-lg px-3 py-2.5">
                  <span className="font-mono font-semibold text-emerald-400 text-sm">
                    +${potentialProfit.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Auto Bet Settings */}
              {mode === "auto" && (
                <div className="space-y-3 mb-5">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                      Number of Bets
                    </Label>
                    <div className="flex gap-1 bg-[#0d1419] p-1 rounded-lg border border-[#1a2530]">
                      <Input 
                        type="number"
                        value={autoBetCount}
                        onChange={(e) => setAutoBetCount(e.target.value)}
                        className="border-none bg-transparent h-9 focus-visible:ring-0 font-mono font-semibold text-white text-sm"
                        min={1}
                        max={100}
                        disabled={autoRunning}
                        data-testid="input-auto-bet-count"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                      Stop Conditions
                    </Label>
                    <div className="space-y-2">
                      <button
                        onClick={() => setStopOnWin(!stopOnWin)}
                        disabled={autoRunning}
                        className={cn(
                          "w-full p-2.5 rounded-lg border transition-all text-left flex items-center justify-between",
                          stopOnWin 
                            ? "bg-emerald-500/10 border-emerald-500/50" 
                            : "bg-[#0d1419] border-[#1a2530] hover:border-[#2a3a4a]"
                        )}
                      >
                        <span className={cn(
                          "text-xs font-medium",
                          stopOnWin ? "text-emerald-400" : "text-slate-400"
                        )}>
                          Stop on Win
                        </span>
                        <div className={cn(
                          "w-4 h-4 rounded border-2 flex items-center justify-center",
                          stopOnWin ? "border-emerald-400 bg-emerald-400" : "border-slate-500"
                        )}>
                          {stopOnWin && <div className="w-2 h-2 text-emerald-900">✓</div>}
                        </div>
                      </button>
                      <button
                        onClick={() => setStopOnLoss(!stopOnLoss)}
                        disabled={autoRunning}
                        className={cn(
                          "w-full p-2.5 rounded-lg border transition-all text-left flex items-center justify-between",
                          stopOnLoss 
                            ? "bg-red-500/10 border-red-500/50" 
                            : "bg-[#0d1419] border-[#1a2530] hover:border-[#2a3a4a]"
                        )}
                      >
                        <span className={cn(
                          "text-xs font-medium",
                          stopOnLoss ? "text-red-400" : "text-slate-400"
                        )}>
                          Stop on Loss
                        </span>
                        <div className={cn(
                          "w-4 h-4 rounded border-2 flex items-center justify-center",
                          stopOnLoss ? "border-red-400 bg-red-400" : "border-slate-500"
                        )}>
                          {stopOnLoss && <div className="w-2 h-2 text-red-900">✓</div>}
                        </div>
                      </button>
                    </div>
                  </div>

                  {autoRunning && (
                    <div className="bg-[#0d1419] border border-[#1a2530] rounded-lg p-2.5">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500">Bets remaining:</span>
                        <span className="text-amber-400 font-mono font-semibold">{autoBetsRemaining}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Button */}
              {mode === "manual" ? (
                <Button 
                  size="lg" 
                  className="w-full h-12 text-sm font-bold bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]" 
                  onClick={() => handleBet(false)}
                  disabled={isPending || flipping || !user || baseAmount > (user?.balance || 0)}
                  data-testid="button-place-bet"
                >
                  {isPending || flipping ? "Flipping..." : user ? "Place Bet" : "Login to Play"}
                </Button>
              ) : autoRunning ? (
                <Button 
                  size="lg" 
                  className="w-full h-12 text-sm font-bold bg-red-500 hover:bg-red-400 shadow-lg shadow-red-500/20 transition-all active:scale-[0.98]" 
                  onClick={stopAutoBet}
                  data-testid="button-stop-auto"
                >
                  <Square className="w-4 h-4 mr-2" />
                  Stop Auto Bet
                </Button>
              ) : (
                <Button 
                  size="lg" 
                  className="w-full h-12 text-sm font-bold bg-amber-500 hover:bg-amber-400 shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98]" 
                  onClick={startAutoBet}
                  disabled={!user || baseAmount > (user?.balance || 0) || parseInt(autoBetCount) < 1}
                  data-testid="button-start-auto"
                >
                  {user ? "Start Auto Bet" : "Login to Play"}
                </Button>
              )}
            </div>

            {/* Right Column: Game Panel */}
            <div className="flex-1 p-5 lg:p-8 relative flex flex-col items-center justify-center min-h-[480px]">
              
              {/* Fair Play Badge + Profit Tracker */}
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <ProfitTrackerWidget gameId="coinflip" />
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1a2530] rounded-full border border-[#2a3a4a]">
                  <Shield className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] font-medium text-emerald-400">Fair Play</span>
                </div>
              </div>

              {/* Side Selection Pills */}
              <div className="mb-8">
                <div className="flex bg-[#0d1419] p-1 rounded-full border border-[#1a2530]">
                  <button 
                    onClick={() => setSide("cock")}
                    disabled={autoRunning}
                    className={cn(
                      "px-8 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 relative disabled:opacity-70",
                      side === "cock" 
                        ? "bg-gradient-to-r from-yellow-500 to-amber-500 text-yellow-950 shadow-[0_0_20px_-3px_rgba(245,158,11,0.5)]" 
                        : "text-slate-400 hover:text-white"
                    )}
                  >
                    Cock
                  </button>
                  <button 
                    onClick={() => setSide("balls")}
                    disabled={autoRunning}
                    className={cn(
                      "px-8 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 relative disabled:opacity-70",
                      side === "balls" 
                        ? "bg-gradient-to-r from-slate-400 to-slate-500 text-slate-900 shadow-[0_0_20px_-3px_rgba(148,163,184,0.5)]" 
                        : "text-slate-400 hover:text-white"
                    )}
                  >
                    Balls
                  </button>
                </div>
              </div>

              {/* The Coin - Larger with premium lighting */}
              <div className="relative w-64 h-64" style={{ perspective: "1200px" }}>
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
                      rotateX: flipping ? targetRotation : (result === "balls" ? 180 : 0)
                    }}
                    transition={{ 
                      duration: FLIP_DURATION,
                      ease: [0.22, 1, 0.36, 1]
                    }}
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    {/* Front (Cock) */}
                    <div 
                      className="absolute inset-0 rounded-full overflow-hidden shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)]"
                      style={{ 
                        backfaceVisibility: "hidden"
                      }}
                    >
                      <img 
                        src={coinCockImg} 
                        alt="Cock" 
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Back (Balls) */}
                    <div 
                      className="absolute inset-0 rounded-full overflow-hidden shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)]"
                      style={{ 
                        backfaceVisibility: "hidden",
                        transform: "rotateX(180deg)"
                      }}
                    >
                      <img 
                        src={coinBallsImg} 
                        alt="Balls" 
                        className="w-full h-full object-cover"
                      />
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
                          ? `+$${potentialProfit.toFixed(2)}` 
                          : `-$${baseAmount.toFixed(2)}`}
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
                      Pick cock or balls and place your bet
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
                  <span className="font-mono font-semibold text-white">{multiplier}x</span>
                </div>
                <div className="w-px bg-[#1a2530]" />
                <div className="text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Win Chance
                  </span>
                  <span className="font-mono font-semibold text-white">50.00%</span>
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
