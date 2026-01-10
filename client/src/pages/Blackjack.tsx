import { useState } from "react";
import { Layout } from "@/components/ui/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Shield, Spade, Heart, Diamond, Club } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { GAME_CONFIG } from "@shared/config";
import { useGameHistory } from "@/hooks/use-game-history";
import { RecentResults } from "@/components/RecentResults";
import { LiveWins } from "@/components/LiveWins";

export default function Blackjack() {
  const { user } = useAuth();
  const { results, clearHistory } = useGameHistory();
  const [amount, setAmount] = useState<string>("10");
  const [gameActive, setGameActive] = useState(false);

  const baseAmount = parseFloat(amount || "0");

  const setPercent = (percent: number) => {
    if (!user) return;
    setAmount((user.balance * percent).toFixed(2));
  };

  const halve = () => setAmount((prev) => (parseFloat(prev) / 2).toFixed(2));
  const double = () => setAmount((prev) => (parseFloat(prev) * 2).toFixed(2));

  const handleDeal = () => {
    if (baseAmount < 0.1 || baseAmount > (user?.balance || 0)) return;
    setGameActive(true);
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
                    disabled={gameActive}
                    data-testid="input-bet-amount"
                  />
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all disabled:opacity-50"
                    onClick={halve}
                    disabled={gameActive}
                    data-testid="button-halve"
                  >
                    ½
                  </button>
                  <button 
                    className="h-9 w-9 rounded-md font-mono text-xs text-slate-500 hover:text-white hover:bg-[#1a2530] transition-all disabled:opacity-50"
                    onClick={double}
                    disabled={gameActive}
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
                      disabled={gameActive}
                      data-testid={`button-percent-${pct * 100}`}
                    >
                      {pct === 1 ? "Max" : `${pct * 100}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Potential Win */}
              <div className="space-y-2 mb-5">
                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Blackjack Pays
                </Label>
                <div className="bg-[#0d1419] border border-[#1a2530] rounded-lg px-3 py-2.5">
                  <span className="font-mono font-semibold text-emerald-400 text-sm">
                    3:2 (+${(baseAmount * 1.5).toFixed(2)})
                  </span>
                </div>
              </div>

              {/* Game Info */}
              <div className="bg-[#0d1419] border border-[#1a2530] rounded-lg p-3 mb-5">
                <div className="space-y-2 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Win Payout:</span>
                    <span className="text-white font-mono">1:1</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Blackjack:</span>
                    <span className="text-white font-mono">3:2</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Insurance:</span>
                    <span className="text-white font-mono">2:1</span>
                  </div>
                </div>
              </div>

              {/* Deal Button */}
              {!gameActive ? (
                <Button 
                  size="lg" 
                  className="w-full h-12 text-sm font-bold bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]" 
                  onClick={handleDeal}
                  disabled={!user || baseAmount > (user?.balance || 0) || baseAmount < 0.1}
                  data-testid="button-deal"
                >
                  {user ? "Deal Cards" : "Login to Play"}
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      className="h-10 text-sm font-semibold bg-amber-500 hover:bg-amber-400"
                      data-testid="button-hit"
                    >
                      Hit
                    </Button>
                    <Button 
                      className="h-10 text-sm font-semibold bg-slate-600 hover:bg-slate-500"
                      data-testid="button-stand"
                    >
                      Stand
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="outline"
                      className="h-10 text-sm font-semibold border-[#2a3a4a] text-slate-300"
                      data-testid="button-double"
                    >
                      Double
                    </Button>
                    <Button 
                      variant="outline"
                      className="h-10 text-sm font-semibold border-[#2a3a4a] text-slate-300"
                      onClick={() => setGameActive(false)}
                      data-testid="button-surrender"
                    >
                      Surrender
                    </Button>
                  </div>
                </div>
              )}
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

              {/* Blackjack Table */}
              <div className="w-full max-w-md">
                {/* Dealer Area */}
                <div className="mb-8">
                  <div className="text-center mb-3">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dealer</span>
                  </div>
                  <div className="flex justify-center gap-2">
                    {gameActive ? (
                      <>
                        <div className="w-16 h-24 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 border-2 border-slate-600 flex items-center justify-center shadow-lg">
                          <span className="text-2xl font-bold text-white">?</span>
                        </div>
                        <div className="w-16 h-24 rounded-lg bg-white border-2 border-slate-300 flex flex-col items-center justify-center shadow-lg">
                          <Spade className="w-4 h-4 text-slate-800" />
                          <span className="text-xl font-bold text-slate-800">K</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex gap-2">
                        <div className="w-16 h-24 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 border-2 border-slate-600/50 flex items-center justify-center opacity-30">
                          <div className="w-10 h-14 rounded border border-slate-500/50" />
                        </div>
                        <div className="w-16 h-24 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 border-2 border-slate-600/50 flex items-center justify-center opacity-30">
                          <div className="w-10 h-14 rounded border border-slate-500/50" />
                        </div>
                      </div>
                    )}
                  </div>
                  {gameActive && (
                    <div className="text-center mt-2">
                      <span className="text-lg font-mono font-bold text-white">10+</span>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-[#2a3a4a] to-transparent my-6" />

                {/* Player Area */}
                <div>
                  <div className="text-center mb-3">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your Hand</span>
                  </div>
                  <div className="flex justify-center gap-2">
                    {gameActive ? (
                      <>
                        <div className="w-16 h-24 rounded-lg bg-white border-2 border-slate-300 flex flex-col items-center justify-center shadow-lg">
                          <Heart className="w-4 h-4 text-red-500" />
                          <span className="text-xl font-bold text-red-500">A</span>
                        </div>
                        <div className="w-16 h-24 rounded-lg bg-white border-2 border-slate-300 flex flex-col items-center justify-center shadow-lg">
                          <Diamond className="w-4 h-4 text-red-500" />
                          <span className="text-xl font-bold text-red-500">7</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex gap-2">
                        <div className="w-16 h-24 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 border-2 border-slate-600/50 flex items-center justify-center opacity-30">
                          <div className="w-10 h-14 rounded border border-slate-500/50" />
                        </div>
                        <div className="w-16 h-24 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 border-2 border-slate-600/50 flex items-center justify-center opacity-30">
                          <div className="w-10 h-14 rounded border border-slate-500/50" />
                        </div>
                      </div>
                    )}
                  </div>
                  {gameActive && (
                    <div className="text-center mt-2">
                      <span className="text-lg font-mono font-bold text-emerald-400">18</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Instructions */}
              {!gameActive && (
                <div className="mt-8 text-center">
                  <p className="text-slate-500 text-sm">Place your bet and click Deal to start</p>
                </div>
              )}

              {/* Bottom Stats Row */}
              <div className="flex gap-6 mt-8">
                <div className="text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Decks
                  </span>
                  <span className="font-mono font-semibold text-white">6</span>
                </div>
                <div className="w-px bg-[#1a2530]" />
                <div className="text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    House Edge
                  </span>
                  <span className="font-mono font-semibold text-white">0.5%</span>
                </div>
              </div>

            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RecentResults 
            results={results} 
            onClear={clearHistory}
            filterGame="blackjack"
          />
          <LiveWins />
        </div>
      </div>
    </Layout>
  );
}
