import { useState } from "react";
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
import { RecentResults } from "@/components/RecentResults";

export default function Coinflip() {
  const { mutate: playCoinflip, isPending } = useCoinflipGame();
  const { user } = useAuth();
  const { results, addResult, clearHistory } = useGameHistory();
  const [side, setSide] = useState<"heads" | "tails">("heads");
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState<"heads" | "tails" | null>(null);
  const [amount, setAmount] = useState<string>("10");

  const multiplier = (2 * GAME_CONFIG.RTP).toFixed(4);

  const handleBet = () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val < 1) return;
    
    setFlipping(true);
    setResult(null);
    
    setTimeout(() => {
      playCoinflip(
        { betAmount: val, side },
        {
          onSuccess: (data: any) => {
            setResult(data.result.flip);
            setFlipping(false);
            
            addResult({
              game: "coinflip",
              betAmount: val,
              won: data.won,
              profit: data.profit,
              detail: `Picked ${side}, got ${data.result.flip}`
            });
          },
          onError: () => setFlipping(false)
        }
      );
    }, 1000);
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
              <div className="space-y-2 mb-6">
                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Profit on Win
                </Label>
                <div className="bg-[#0d1419] border border-[#1a2530] rounded-lg px-3 py-2.5">
                  <span className="font-mono font-semibold text-emerald-400 text-sm">
                    +${((parseFloat(amount || "0") * parseFloat(multiplier)) - parseFloat(amount || "0")).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Place Bet Button */}
              <Button 
                size="lg" 
                className="w-full h-12 text-sm font-bold bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]" 
                onClick={handleBet}
                disabled={isPending || flipping || !user || parseFloat(amount) > (user?.balance || 0)}
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

              {/* Side Selection */}
              <div className="mb-10 flex gap-6">
                <button 
                  onClick={() => setSide("heads")}
                  className={cn(
                    "w-28 h-28 rounded-full border-4 flex items-center justify-center transition-all duration-300 relative overflow-hidden",
                    side === "heads" 
                      ? "border-emerald-500 bg-emerald-500/10 scale-110 shadow-[0_0_30px_-5px_rgba(16,185,129,0.5)]" 
                      : "border-[#2a3a4a] bg-[#1a2530] hover:border-emerald-500/50"
                  )}
                >
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-600 flex items-center justify-center shadow-inner">
                    <span className="text-yellow-900 font-bold text-xl">H</span>
                  </div>
                </button>

                <button 
                  onClick={() => setSide("tails")}
                  className={cn(
                    "w-28 h-28 rounded-full border-4 flex items-center justify-center transition-all duration-300 relative overflow-hidden",
                    side === "tails" 
                      ? "border-emerald-500 bg-emerald-500/10 scale-110 shadow-[0_0_30px_-5px_rgba(16,185,129,0.5)]" 
                      : "border-[#2a3a4a] bg-[#1a2530] hover:border-emerald-500/50"
                  )}
                >
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center shadow-inner">
                    <span className="text-gray-800 font-bold text-xl">T</span>
                  </div>
                </button>
              </div>

              {/* The Coin */}
              <div className="relative w-40 h-40 perspective-[1000px]">
                <motion.div
                  className="w-full h-full relative preserve-3d"
                  animate={{ 
                    rotateY: flipping ? 1800 : (result === "tails" ? 180 : 0) 
                  }}
                  transition={{ 
                    duration: flipping ? 2 : 0.5, 
                    ease: "circOut" 
                  }}
                  style={{ transformStyle: "preserve-3d" }}
                >
                  {/* Front (Heads) */}
                  <div className="absolute inset-0 backface-hidden rounded-full bg-gradient-to-br from-yellow-300 to-yellow-600 shadow-xl border-4 border-yellow-200 flex items-center justify-center">
                    <div className="w-32 h-32 rounded-full border-2 border-yellow-700/30 flex items-center justify-center">
                      <span className="text-4xl font-bold text-yellow-900">HEADS</span>
                    </div>
                  </div>

                  {/* Back (Tails) */}
                  <div className="absolute inset-0 backface-hidden rounded-full bg-gradient-to-br from-gray-300 to-gray-500 shadow-xl border-4 border-gray-200 flex items-center justify-center" style={{ transform: "rotateY(180deg)" }}>
                    <div className="w-32 h-32 rounded-full border-2 border-gray-700/30 flex items-center justify-center">
                      <span className="text-4xl font-bold text-gray-800">TAILS</span>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Result Message */}
              <div className="h-12 mt-8 flex items-center justify-center">
                <AnimatePresence>
                  {result && !flipping && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "text-xl font-bold px-6 py-2 rounded-full",
                        result === side 
                          ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/30" 
                          : "text-red-400 bg-red-500/10 border border-red-500/30"
                      )}
                    >
                      {result === side ? "YOU WON!" : "YOU LOST"}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom Stats Row */}
              <div className="grid grid-cols-2 gap-3 mt-6 w-full max-w-sm">
                <div className="bg-[#111921] border border-[#1a2530] rounded-lg p-3">
                  <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                    Multiplier
                  </label>
                  <Input 
                    type="text"
                    value={`${multiplier}x`}
                    readOnly
                    className="bg-[#0d1419] border-[#1a2530] text-white font-mono text-sm h-8 rounded-md"
                  />
                </div>

                <div className="bg-[#111921] border border-[#1a2530] rounded-lg p-3">
                  <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                    Win Chance
                  </label>
                  <Input 
                    type="text"
                    value="50.00%"
                    readOnly
                    className="bg-[#0d1419] border-[#1a2530] text-white font-mono text-sm h-8 rounded-md"
                  />
                </div>
              </div>

            </div>
          </div>
        </div>
        
        <RecentResults 
          results={results} 
          onClear={clearHistory}
          filterGame="coinflip"
        />
      </div>
    </Layout>
  );
}
