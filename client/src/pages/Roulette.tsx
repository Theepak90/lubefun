import { useState, useCallback, useRef, useEffect } from "react";
import { Layout } from "@/components/ui/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { ROULETTE_CONFIG, getRouletteColor } from "@shared/config";
import { useGameHistory } from "@/hooks/use-game-history";
import { RecentResults } from "@/components/RecentResults";
import { LiveWins } from "@/components/LiveWins";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type BetType = "red" | "black" | "odd" | "even" | "1-18" | "19-36" | "straight";

interface RouletteResponse {
  bet: any;
  winningNumber: number;
  color: "red" | "black" | "green";
  won: boolean;
  payout: number;
}

const WHEEL_NUMBERS = ROULETTE_CONFIG.WHEEL_ORDER;
const RED_NUMBERS = ROULETTE_CONFIG.RED_NUMBERS;

export default function Roulette() {
  const { user } = useAuth();
  const { results, addResult, clearHistory } = useGameHistory();
  const { toast } = useToast();
  
  const [amount, setAmount] = useState<string>("1");
  const [selectedBet, setSelectedBet] = useState<BetType | null>(null);
  const [straightNumber, setStraightNumber] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [lastResult, setLastResult] = useState<{ number: number; color: string; won: boolean } | null>(null);
  const [recentNumbers, setRecentNumbers] = useState<number[]>([32, 15, 19, 4, 21]);

  const spinRef = useRef<NodeJS.Timeout | null>(null);

  const baseAmount = parseFloat(amount || "0");

  const getMultiplier = (bet: BetType | null) => {
    if (!bet) return 0;
    if (bet === "straight") return 36;
    return 2;
  };

  const rouletteMutation = useMutation({
    mutationFn: async (data: { betAmount: number; betType: string; straightNumber?: number }) => {
      const res = await apiRequest("POST", "/api/games/roulette", data);
      return res.json() as Promise<RouletteResponse>;
    },
    onSuccess: (data) => {
      animateWheel(data.winningNumber, data.color, data.won, data.bet, data.payout);
    },
    onError: (error: any) => {
      setSpinning(false);
      toast({
        title: "Error",
        description: error.message || "Failed to place bet",
        variant: "destructive",
      });
    },
  });

  const animateWheel = useCallback((winningNumber: number, color: string, won: boolean, bet: any, payout: number) => {
    const numberIndex = WHEEL_NUMBERS.indexOf(winningNumber);
    const segmentAngle = 360 / WHEEL_NUMBERS.length;
    const targetAngle = 360 - (numberIndex * segmentAngle) - (segmentAngle / 2);
    const totalRotation = wheelRotation + 1800 + targetAngle;
    
    setWheelRotation(totalRotation);

    spinRef.current = setTimeout(() => {
      setSpinning(false);
      setLastResult({ number: winningNumber, color, won });
      
      setRecentNumbers(prev => [winningNumber, ...prev.slice(0, 4)]);
      
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });

      const betTypeLabel = selectedBet === "straight" 
        ? `#${straightNumber}` 
        : selectedBet?.toUpperCase() || "";
      
      addResult({
        game: "roulette",
        betAmount: bet.betAmount,
        won: bet.won,
        profit: bet.profit,
        detail: `${betTypeLabel} → ${winningNumber} ${color}`,
      });

      setTimeout(() => {
        setLastResult(null);
      }, 3000);
    }, 4000);
  }, [wheelRotation, selectedBet, straightNumber, addResult]);

  useEffect(() => {
    return () => {
      if (spinRef.current) {
        clearTimeout(spinRef.current);
      }
    };
  }, []);

  const setPercent = (percent: number) => {
    if (!user) return;
    setAmount((user.balance * percent).toFixed(2));
  };

  const halve = () => setAmount((prev) => Math.max(0.1, parseFloat(prev) / 2).toFixed(2));
  const double = () => setAmount((prev) => (parseFloat(prev) * 2).toFixed(2));

  const handleSpin = () => {
    if (baseAmount < 0.1 || !selectedBet || baseAmount > (user?.balance || 0) || spinning) return;
    if (selectedBet === "straight" && straightNumber === null) {
      toast({ title: "Select a number", description: "Pick a number 0-36 for straight bet", variant: "destructive" });
      return;
    }
    
    setSpinning(true);
    setLastResult(null);
    
    const payload: { betAmount: number; betType: string; straightNumber?: number } = {
      betAmount: baseAmount,
      betType: selectedBet,
    };
    if (selectedBet === "straight" && straightNumber !== null) {
      payload.straightNumber = straightNumber;
    }
    
    rouletteMutation.mutate(payload);
  };

  const getNumberColor = (num: number): "red" | "black" | "green" => {
    return getRouletteColor(num);
  };

  const selectStraightNumber = (num: number) => {
    setSelectedBet("straight");
    setStraightNumber(num);
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="bg-[#0d1419] border border-[#1a2530] rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
          
          <div className="flex flex-col lg:flex-row">
            
            {/* Left Column: Betting Panel */}
            <div className="lg:w-72 shrink-0 bg-[#111921] border-b lg:border-b-0 lg:border-r border-[#1a2530] p-5 max-h-[600px] overflow-y-auto">
              
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
                  Color Bets (2x)
                </Label>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setSelectedBet("red"); setStraightNumber(null); }}
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
                    onClick={() => { setSelectedBet("black"); setStraightNumber(null); }}
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
              </div>

              {/* Other Outside Bets */}
              <div className="space-y-2 mb-5">
                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Outside Bets (2x)
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setSelectedBet("odd"); setStraightNumber(null); }}
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
                    onClick={() => { setSelectedBet("even"); setStraightNumber(null); }}
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
                    onClick={() => { setSelectedBet("1-18"); setStraightNumber(null); }}
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
                    onClick={() => { setSelectedBet("19-36"); setStraightNumber(null); }}
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

              {/* Straight Number Bets */}
              <div className="space-y-2 mb-5">
                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Straight Number (36x)
                </Label>
                <div className="grid grid-cols-6 gap-1">
                  {[0, ...Array.from({ length: 36 }, (_, i) => i + 1)].map((num) => {
                    const color = getNumberColor(num);
                    return (
                      <button
                        key={num}
                        onClick={() => selectStraightNumber(num)}
                        disabled={spinning}
                        data-testid={`button-number-${num}`}
                        className={cn(
                          "w-full aspect-square rounded text-[10px] font-bold transition-all",
                          selectedBet === "straight" && straightNumber === num
                            ? "ring-2 ring-white ring-offset-1 ring-offset-[#111921] scale-110"
                            : "",
                          color === "red" ? "bg-red-500/80 text-white hover:bg-red-500" :
                          color === "black" ? "bg-slate-700 text-white hover:bg-slate-600" :
                          "bg-emerald-500/80 text-white hover:bg-emerald-500"
                        )}
                      >
                        {num}
                      </button>
                    );
                  })}
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
            <div className="flex-1 p-5 lg:p-8 relative flex flex-col items-center justify-center min-h-[520px]">
              
              {/* Fair Play Badge */}
              <div className="absolute top-4 right-4">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1a2530] rounded-full border border-[#2a3a4a]">
                  <Shield className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] font-medium text-emerald-400">Fair Play</span>
                </div>
              </div>

              {/* Roulette Wheel */}
              <div className="relative">
                {/* Outer wheel with numbers */}
                <div 
                  className="w-64 h-64 rounded-full border-4 border-amber-600 bg-gradient-to-br from-amber-900 to-amber-950 shadow-2xl relative overflow-hidden"
                  style={{
                    transform: `rotate(${wheelRotation}deg)`,
                    transition: spinning ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
                  }}
                >
                  {/* Number segments */}
                  {WHEEL_NUMBERS.map((num, i) => {
                    const angle = (i * 360) / WHEEL_NUMBERS.length;
                    const color = getNumberColor(num);
                    return (
                      <div
                        key={num}
                        className="absolute w-full h-full"
                        style={{
                          transform: `rotate(${angle}deg)`,
                        }}
                      >
                        <div 
                          className={cn(
                            "absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[50%] origin-bottom flex items-start justify-center pt-1",
                          )}
                        >
                          <div className={cn(
                            "w-5 h-8 rounded-t-sm flex items-center justify-center text-[8px] font-bold text-white",
                            color === "red" ? "bg-red-600" :
                            color === "black" ? "bg-slate-800" :
                            "bg-emerald-600"
                          )}>
                            {num}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Inner circle */}
                  <div className="absolute inset-8 rounded-full bg-gradient-to-br from-amber-800 to-amber-900 border-4 border-amber-700 shadow-inner" />
                  
                  {/* Center hub */}
                  <div className="absolute inset-20 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 border-2 border-amber-500 shadow-lg flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-amber-400 shadow-inner" />
                  </div>
                </div>
                
                {/* Ball indicator (stationary pointer) */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-10">
                  <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[16px] border-l-transparent border-r-transparent border-t-white drop-shadow-lg" />
                </div>
              </div>

              {/* Result Display */}
              {lastResult && (
                <div className="mt-6 text-center animate-pulse">
                  <div className={cn(
                    "inline-flex items-center gap-3 px-6 py-3 rounded-xl",
                    lastResult.color === "red" ? "bg-red-500/20 border border-red-500/40" :
                    lastResult.color === "black" ? "bg-slate-700/40 border border-slate-600" :
                    "bg-emerald-500/20 border border-emerald-500/40"
                  )}>
                    <div className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-lg",
                      lastResult.color === "red" ? "bg-red-500" :
                      lastResult.color === "black" ? "bg-slate-800" :
                      "bg-emerald-500"
                    )}>
                      {lastResult.number}
                    </div>
                    <div className="text-left">
                      <div className={cn(
                        "text-lg font-bold",
                        lastResult.won ? "text-emerald-400" : "text-red-400"
                      )}>
                        {lastResult.won ? "WIN!" : "LOSE"}
                      </div>
                      <div className="text-slate-400 text-sm capitalize">{lastResult.color}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Numbers */}
              <div className="mt-6">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2 text-center">
                  Recent Numbers
                </div>
                <div className="flex gap-2">
                  {recentNumbers.map((num, i) => (
                    <div 
                      key={i}
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shadow-md transition-all",
                        i === 0 && lastResult ? "scale-110 ring-2 ring-white/50" : "",
                        getNumberColor(num) === "green" ? "bg-emerald-500 text-white" :
                        getNumberColor(num) === "red" ? "bg-red-500 text-white" : "bg-slate-800 text-white"
                      )}
                    >
                      {num}
                    </div>
                  ))}
                </div>
              </div>

              {/* Instructions */}
              <div className="mt-4 text-center">
                <p className="text-slate-500 text-sm">
                  {selectedBet === "straight" && straightNumber !== null
                    ? `Betting on #${straightNumber} (36x payout)`
                    : selectedBet 
                      ? `Betting on ${selectedBet.toUpperCase()} (2x payout)` 
                      : "Select a bet type to begin"}
                </p>
              </div>

              {/* Bottom Stats Row */}
              <div className="flex gap-6 mt-4">
                <div className="text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Straight Payout
                  </span>
                  <span className="font-mono font-semibold text-white">36x</span>
                </div>
                <div className="w-px bg-[#1a2530]" />
                <div className="text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Outside Payout
                  </span>
                  <span className="font-mono font-semibold text-white">2x</span>
                </div>
                <div className="w-px bg-[#1a2530]" />
                <div className="text-center">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    House Edge
                  </span>
                  <span className="font-mono font-semibold text-white">2.7%</span>
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
