import { useState } from "react";
import { Layout } from "@/components/ui/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { GAME_CONFIG } from "@shared/config";
import { useGameHistory } from "@/hooks/use-game-history";
import { RecentResults } from "@/components/RecentResults";
import { LiveWins } from "@/components/LiveWins";

type BetType = "red" | "black" | "green" | "odd" | "even" | "1-18" | "19-36" | null;

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const WHEEL_NUMBERS = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

export default function Roulette() {
  const { user } = useAuth();
  const { results, clearHistory } = useGameHistory();
  const [amount, setAmount] = useState<string>("10");
  const [selectedBet, setSelectedBet] = useState<BetType>(null);
  const [spinning, setSpinning] = useState(false);

  const baseAmount = parseFloat(amount || "0");

  const getMultiplier = (bet: BetType) => {
    if (bet === "green") return 35;
    if (bet === "red" || bet === "black" || bet === "odd" || bet === "even" || bet === "1-18" || bet === "19-36") return 2;
    return 0;
  };

  const setPercent = (percent: number) => {
    if (!user) return;
    setAmount((user.balance * percent).toFixed(2));
  };

  const halve = () => setAmount((prev) => (parseFloat(prev) / 2).toFixed(2));
  const double = () => setAmount((prev) => (parseFloat(prev) * 2).toFixed(2));

  const handleSpin = () => {
    if (baseAmount < 0.1 || !selectedBet || baseAmount > (user?.balance || 0)) return;
    setSpinning(true);
    setTimeout(() => setSpinning(false), 3000);
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="bg-[#0d1419] border border-[#1a2530] rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
          
          <div className="flex flex-col lg:flex-row">
            
            {/* Left Column: Betting Panel */}
            <div className="lg:w-72 shrink-0 bg-[#111921] border-b lg:border-b-0 lg:border-r border-[#1a2530] p-5">
              
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
                    disabled={spinning}
                    data-testid="input-bet-amount"
                  />
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all disabled:opacity-50"
                    onClick={halve}
                    disabled={spinning}
                    data-testid="button-halve"
                  >
                    ½
                  </button>
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all disabled:opacity-50"
                    onClick={double}
                    disabled={spinning}
                    data-testid="button-double"
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
                      disabled={spinning}
                      data-testid={`button-percent-${pct * 100}`}
                    >
                      {pct === 1 ? "Max" : `${pct * 100}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected Bet Info */}
              {selectedBet && (
                <div className="space-y-2 mb-5">
                  <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                    Potential Win
                  </Label>
                  <div className="bg-[#0d1419] border border-[#1a2530] rounded-lg px-3 py-2.5">
                    <span className="font-mono font-semibold text-emerald-400 text-sm">
                      +${(baseAmount * getMultiplier(selectedBet) - baseAmount).toFixed(2)}
                    </span>
                    <span className="text-slate-500 text-xs ml-2">({getMultiplier(selectedBet)}x)</span>
                  </div>
                </div>
              )}

              {/* Bet Type Selection */}
              <div className="space-y-2 mb-5">
                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Place Your Bet
                </Label>
                
                {/* Color Bets */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setSelectedBet("red")}
                    disabled={spinning}
                    data-testid="button-bet-red"
                    className={cn(
                      "py-3 rounded-lg font-semibold text-xs transition-all",
                      selectedBet === "red"
                        ? "bg-red-500 text-white shadow-lg shadow-red-500/30"
                        : "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                    )}
                  >
                    Red
                  </button>
                  <button
                    onClick={() => setSelectedBet("green")}
                    disabled={spinning}
                    data-testid="button-bet-green"
                    className={cn(
                      "py-3 rounded-lg font-semibold text-xs transition-all",
                      selectedBet === "green"
                        ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                        : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30"
                    )}
                  >
                    Green
                  </button>
                  <button
                    onClick={() => setSelectedBet("black")}
                    disabled={spinning}
                    data-testid="button-bet-black"
                    className={cn(
                      "py-3 rounded-lg font-semibold text-xs transition-all",
                      selectedBet === "black"
                        ? "bg-slate-700 text-white shadow-lg shadow-slate-700/30"
                        : "bg-slate-700/40 text-slate-300 hover:bg-slate-700/60 border border-slate-600/30"
                    )}
                  >
                    Black
                  </button>
                </div>

                {/* Other Bets */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSelectedBet("odd")}
                    disabled={spinning}
                    data-testid="button-bet-odd"
                    className={cn(
                      "py-2.5 rounded-lg font-semibold text-xs transition-all",
                      selectedBet === "odd"
                        ? "bg-[#2a3a4a] text-white border border-slate-500"
                        : "bg-[#1a2530] text-slate-400 hover:text-white border border-[#2a3a4a]"
                    )}
                  >
                    Odd
                  </button>
                  <button
                    onClick={() => setSelectedBet("even")}
                    disabled={spinning}
                    data-testid="button-bet-even"
                    className={cn(
                      "py-2.5 rounded-lg font-semibold text-xs transition-all",
                      selectedBet === "even"
                        ? "bg-[#2a3a4a] text-white border border-slate-500"
                        : "bg-[#1a2530] text-slate-400 hover:text-white border border-[#2a3a4a]"
                    )}
                  >
                    Even
                  </button>
                  <button
                    onClick={() => setSelectedBet("1-18")}
                    disabled={spinning}
                    data-testid="button-bet-1-18"
                    className={cn(
                      "py-2.5 rounded-lg font-semibold text-xs transition-all",
                      selectedBet === "1-18"
                        ? "bg-[#2a3a4a] text-white border border-slate-500"
                        : "bg-[#1a2530] text-slate-400 hover:text-white border border-[#2a3a4a]"
                    )}
                  >
                    1-18
                  </button>
                  <button
                    onClick={() => setSelectedBet("19-36")}
                    disabled={spinning}
                    data-testid="button-bet-19-36"
                    className={cn(
                      "py-2.5 rounded-lg font-semibold text-xs transition-all",
                      selectedBet === "19-36"
                        ? "bg-[#2a3a4a] text-white border border-slate-500"
                        : "bg-[#1a2530] text-slate-400 hover:text-white border border-[#2a3a4a]"
                    )}
                  >
                    19-36
                  </button>
                </div>
              </div>

              {/* Spin Button */}
              <Button 
                size="lg" 
                className="w-full h-12 text-sm font-bold bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]" 
                onClick={handleSpin}
                disabled={!user || !selectedBet || spinning || baseAmount > (user?.balance || 0) || baseAmount < 0.1}
                data-testid="button-spin"
              >
                {spinning ? "Spinning..." : user ? "Spin" : "Login to Play"}
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

              {/* Roulette Wheel Placeholder */}
              <div className="relative">
                <div className={cn(
                  "w-48 h-48 rounded-full border-8 border-[#2a3a4a] bg-gradient-to-br from-[#1a2530] to-[#0d1419] flex items-center justify-center shadow-2xl",
                  spinning && "animate-spin"
                )} style={{ animationDuration: "0.5s" }}>
                  <div className="w-32 h-32 rounded-full border-4 border-[#3a4a5a] bg-[#111921] flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg">
                      <span className="text-2xl font-bold text-white">0</span>
                    </div>
                  </div>
                </div>
                
                {/* Ball indicator */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2">
                  <div className="w-4 h-4 rounded-full bg-white shadow-lg border-2 border-slate-300" />
                </div>
              </div>

              {/* Recent Numbers */}
              <div className="mt-8 flex gap-2">
                {[32, 15, 19, 4, 21].map((num, i) => (
                  <div 
                    key={i}
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-md",
                      num === 0 ? "bg-emerald-500 text-white" :
                      RED_NUMBERS.includes(num) ? "bg-red-500 text-white" : "bg-slate-800 text-white"
                    )}
                  >
                    {num}
                  </div>
                ))}
              </div>

              {/* Instructions */}
              <div className="mt-6 text-center">
                <p className="text-slate-500 text-sm">
                  {selectedBet ? `Betting on ${selectedBet.toUpperCase()}` : "Select a bet type to begin"}
                </p>
              </div>

              {/* Bottom Stats Row */}
              <div className="flex gap-6 mt-6">
                <div className="text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Green Payout
                  </span>
                  <span className="font-mono font-semibold text-white">35x</span>
                </div>
                <div className="w-px bg-[#1a2530]" />
                <div className="text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Color Payout
                  </span>
                  <span className="font-mono font-semibold text-white">2x</span>
                </div>
              </div>

            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RecentResults 
            results={results} 
            onClear={clearHistory}
            filterGame="roulette"
          />
          <LiveWins />
        </div>
      </div>
    </Layout>
  );
}
