import { useState, useCallback, useRef, useEffect } from "react";
import { Layout } from "@/components/ui/Layout";
import { Button } from "@/components/ui/button";
import { Shield, Undo2, Trash2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { ROULETTE_CONFIG, getRouletteColor } from "@shared/config";
import { useGameHistory } from "@/hooks/use-game-history";
import { RecentResults } from "@/components/RecentResults";
import { LiveWins } from "@/components/LiveWins";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type BetType = "red" | "black" | "odd" | "even" | "1-18" | "19-36" | "straight" | "1st12" | "2nd12" | "3rd12" | "col1" | "col2" | "col3";

interface PlacedBet {
  type: BetType;
  number?: number;
  amount: number;
}

interface RouletteResponse {
  bet: any;
  winningNumber: number;
  color: "red" | "black" | "green";
  won: boolean;
  payout: number;
}

const WHEEL_NUMBERS = ROULETTE_CONFIG.WHEEL_ORDER;
const RED_NUMBERS = ROULETTE_CONFIG.RED_NUMBERS;

const CHIP_DENOMINATIONS = [0.20, 1, 2, 10, 50, 200, 1000, 4000];

const TABLE_ROWS = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
];

export default function Roulette() {
  const { user } = useAuth();
  const { results, addResult, clearHistory } = useGameHistory();
  const { toast } = useToast();
  
  const [selectedChip, setSelectedChip] = useState<number>(1);
  const [placedBets, setPlacedBets] = useState<PlacedBet[]>([]);
  const [betHistory, setBetHistory] = useState<PlacedBet[][]>([]);
  const [lastBets, setLastBets] = useState<PlacedBet[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [lastResult, setLastResult] = useState<{ number: number; color: string; won: boolean } | null>(null);
  const [recentNumbers, setRecentNumbers] = useState<number[]>([32, 15, 19, 4, 21]);

  const spinRef = useRef<NodeJS.Timeout | null>(null);

  const totalBet = placedBets.reduce((sum, b) => sum + b.amount, 0);

  const getNumberColor = (num: number): "red" | "black" | "green" => {
    return getRouletteColor(num);
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
      
      setRecentNumbers(prev => [winningNumber, ...prev.slice(0, 9)]);
      
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });

      addResult({
        game: "roulette",
        betAmount: bet.betAmount,
        won: bet.won,
        profit: bet.profit,
        detail: `${winningNumber} ${color}`,
      });

      setLastBets(placedBets);
      setPlacedBets([]);
      setBetHistory([]);

      setTimeout(() => {
        setLastResult(null);
      }, 3000);
    }, 4000);
  }, [wheelRotation, addResult, placedBets]);

  useEffect(() => {
    return () => {
      if (spinRef.current) {
        clearTimeout(spinRef.current);
      }
    };
  }, []);

  const placeBet = (type: BetType, number?: number) => {
    if (spinning || !user) return;
    if (totalBet + selectedChip > user.balance) {
      toast({ title: "Insufficient balance", variant: "destructive" });
      return;
    }

    setBetHistory(prev => [...prev, placedBets]);
    
    setPlacedBets(prev => {
      const existing = prev.find(b => b.type === type && b.number === number);
      if (existing) {
        return prev.map(b => 
          b.type === type && b.number === number 
            ? { ...b, amount: b.amount + selectedChip }
            : b
        );
      }
      return [...prev, { type, number, amount: selectedChip }];
    });
  };

  const getBetAmount = (type: BetType, number?: number): number => {
    const bet = placedBets.find(b => b.type === type && b.number === number);
    return bet?.amount || 0;
  };

  const handleUndo = () => {
    if (betHistory.length === 0) return;
    const lastState = betHistory[betHistory.length - 1];
    setPlacedBets(lastState);
    setBetHistory(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setBetHistory(prev => [...prev, placedBets]);
    setPlacedBets([]);
  };

  const handleRepeat = () => {
    if (lastBets.length === 0) return;
    const repeatTotal = lastBets.reduce((sum, b) => sum + b.amount, 0);
    if (repeatTotal > (user?.balance || 0)) {
      toast({ title: "Insufficient balance to repeat", variant: "destructive" });
      return;
    }
    setBetHistory(prev => [...prev, placedBets]);
    setPlacedBets(lastBets);
  };

  const handleSpin = async () => {
    if (placedBets.length === 0 || spinning || !user) return;
    if (totalBet > user.balance) {
      toast({ title: "Insufficient balance", variant: "destructive" });
      return;
    }

    setSpinning(true);
    setLastResult(null);

    // For now, we'll process the first bet only (simplified)
    // In a full implementation, you'd process all bets
    const firstBet = placedBets[0];
    const payload: { betAmount: number; betType: string; straightNumber?: number } = {
      betAmount: totalBet,
      betType: firstBet.type === "straight" ? "straight" : firstBet.type,
    };
    if (firstBet.type === "straight" && firstBet.number !== undefined) {
      payload.straightNumber = firstBet.number;
    }
    
    rouletteMutation.mutate(payload);
  };

  const ChipStack = ({ amount, small = false }: { amount: number; small?: boolean }) => {
    if (amount === 0) return null;
    const size = small ? "w-5 h-5 text-[8px]" : "w-7 h-7 text-[9px]";
    return (
      <div className={cn(
        "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 border-2 border-yellow-300 shadow-lg flex items-center justify-center font-bold text-slate-900 z-10",
        size
      )}>
        {amount >= 1000 ? `${(amount/1000).toFixed(0)}k` : amount.toFixed(amount < 1 ? 2 : 0)}
      </div>
    );
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="bg-[#0d1419] border border-[#1a2530] rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
          
          {/* Header with balance and recent numbers */}
          <div className="flex items-center justify-between p-4 border-b border-[#1a2530]">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1a2530] rounded-full border border-[#2a3a4a]">
                <Shield className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] font-medium text-emerald-400">Provably Fair</span>
              </div>
              <span className="text-sm text-slate-400">
                Balance: <span className="text-white font-mono font-semibold">${user?.balance?.toFixed(2) || '0.00'}</span>
              </span>
            </div>
            
            {/* Recent Numbers */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide mr-2">Last:</span>
              {recentNumbers.slice(0, 10).map((num, i) => (
                <div 
                  key={i}
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm",
                    getNumberColor(num) === "green" ? "bg-emerald-600 text-white" :
                    getNumberColor(num) === "red" ? "bg-red-600 text-white" : "bg-slate-800 text-white"
                  )}
                >
                  {num}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col lg:flex-row">
            
            {/* Left: Mini Wheel Display */}
            <div className="lg:w-72 shrink-0 bg-[#0a0f13] border-b lg:border-b-0 lg:border-r border-[#1a2530] p-6 flex flex-col items-center justify-center">
              
              {/* Roulette Wheel */}
              <div className="relative mb-4">
                <div 
                  className="w-48 h-48 rounded-full border-4 border-amber-600 bg-gradient-to-br from-amber-900 to-amber-950 shadow-2xl relative overflow-hidden"
                  style={{
                    transform: `rotate(${wheelRotation}deg)`,
                    transition: spinning ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
                  }}
                >
                  {WHEEL_NUMBERS.map((num, i) => {
                    const angle = (i * 360) / WHEEL_NUMBERS.length;
                    const color = getNumberColor(num);
                    return (
                      <div
                        key={num}
                        className="absolute w-full h-full"
                        style={{ transform: `rotate(${angle}deg)` }}
                      >
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-[50%] origin-bottom flex items-start justify-center pt-0.5">
                          <div className={cn(
                            "w-4 h-6 rounded-t-sm flex items-center justify-center text-[6px] font-bold text-white",
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
                  <div className="absolute inset-6 rounded-full bg-gradient-to-br from-amber-800 to-amber-900 border-4 border-amber-700 shadow-inner" />
                  <div className="absolute inset-16 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 border-2 border-amber-500 shadow-lg flex items-center justify-center">
                    <div className="w-6 h-6 rounded-full bg-amber-400 shadow-inner" />
                  </div>
                </div>
                
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10">
                  <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[12px] border-l-transparent border-r-transparent border-t-white drop-shadow-lg" />
                </div>
              </div>

              {/* Result Display */}
              {lastResult && (
                <div className="text-center animate-pulse mb-4">
                  <div className={cn(
                    "inline-flex items-center gap-2 px-4 py-2 rounded-xl",
                    lastResult.color === "red" ? "bg-red-500/20 border border-red-500/40" :
                    lastResult.color === "black" ? "bg-slate-700/40 border border-slate-600" :
                    "bg-emerald-500/20 border border-emerald-500/40"
                  )}>
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold text-white shadow-lg",
                      lastResult.color === "red" ? "bg-red-500" :
                      lastResult.color === "black" ? "bg-slate-800" :
                      "bg-emerald-500"
                    )}>
                      {lastResult.number}
                    </div>
                    <span className={cn(
                      "text-lg font-bold",
                      lastResult.won ? "text-emerald-400" : "text-red-400"
                    )}>
                      {lastResult.won ? "WIN!" : "LOSE"}
                    </span>
                  </div>
                </div>
              )}

              {/* Total Bet & Spin Button */}
              <div className="w-full space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total Bet:</span>
                  <span className="text-white font-mono font-semibold">${totalBet.toFixed(2)}</span>
                </div>
                <Button 
                  size="lg" 
                  className="w-full h-12 text-sm font-bold bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]" 
                  onClick={handleSpin}
                  disabled={!user || placedBets.length === 0 || spinning || totalBet > (user?.balance || 0)}
                  data-testid="button-spin"
                >
                  {spinning ? "Spinning..." : user ? "SPIN" : "Login to Play"}
                </Button>
              </div>
            </div>

            {/* Right: Betting Table */}
            <div className="flex-1 p-4 lg:p-6">
              
              {/* Betting Grid */}
              <div className="bg-[#0f4c3a] rounded-xl p-3 border-4 border-[#1a6b4f] shadow-inner">
                
                {/* Zero */}
                <div className="flex mb-1">
                  <button
                    onClick={() => placeBet("straight", 0)}
                    disabled={spinning}
                    data-testid="button-number-0"
                    className="relative w-10 h-24 bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 rounded-l-lg flex items-center justify-center text-white font-bold text-lg transition-all"
                  >
                    0
                    <ChipStack amount={getBetAmount("straight", 0)} />
                  </button>
                  
                  {/* Main number grid */}
                  <div className="flex-1 grid grid-rows-3 gap-px">
                    {TABLE_ROWS.map((row, rowIdx) => (
                      <div key={rowIdx} className="grid grid-cols-12 gap-px">
                        {row.map((num) => {
                          const color = getNumberColor(num);
                          return (
                            <button
                              key={num}
                              onClick={() => placeBet("straight", num)}
                              disabled={spinning}
                              data-testid={`button-number-${num}`}
                              className={cn(
                                "relative h-8 flex items-center justify-center text-white font-bold text-xs transition-all border border-opacity-30",
                                color === "red" 
                                  ? "bg-red-600 hover:bg-red-500 border-red-400" 
                                  : "bg-slate-800 hover:bg-slate-700 border-slate-600"
                              )}
                            >
                              {num}
                              <ChipStack amount={getBetAmount("straight", num)} small />
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  {/* Column bets on right */}
                  <div className="flex flex-col gap-px ml-1">
                    {["col1", "col2", "col3"].map((col, i) => (
                      <button
                        key={col}
                        onClick={() => placeBet(col as BetType)}
                        disabled={spinning}
                        data-testid={`button-${col}`}
                        className="relative w-10 h-8 bg-[#1a6b4f] hover:bg-[#228b5b] border border-[#2a8b6f] flex items-center justify-center text-white font-bold text-[10px] transition-all"
                      >
                        2:1
                        <ChipStack amount={getBetAmount(col as BetType)} small />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dozens row */}
                <div className="grid grid-cols-3 gap-1 mt-2 mb-2">
                  {[
                    { type: "1st12" as BetType, label: "1st 12" },
                    { type: "2nd12" as BetType, label: "2nd 12" },
                    { type: "3rd12" as BetType, label: "3rd 12" },
                  ].map(({ type, label }) => (
                    <button
                      key={type}
                      onClick={() => placeBet(type)}
                      disabled={spinning}
                      data-testid={`button-${type}`}
                      className="relative h-10 bg-[#1a6b4f] hover:bg-[#228b5b] border border-[#2a8b6f] rounded flex items-center justify-center text-white font-bold text-xs transition-all"
                    >
                      {label}
                      <ChipStack amount={getBetAmount(type)} />
                    </button>
                  ))}
                </div>

                {/* Outside bets row */}
                <div className="grid grid-cols-6 gap-1">
                  {[
                    { type: "1-18" as BetType, label: "1-18" },
                    { type: "even" as BetType, label: "EVEN" },
                    { type: "red" as BetType, label: "", isRed: true },
                    { type: "black" as BetType, label: "", isBlack: true },
                    { type: "odd" as BetType, label: "ODD" },
                    { type: "19-36" as BetType, label: "19-36" },
                  ].map(({ type, label, isRed, isBlack }) => (
                    <button
                      key={type}
                      onClick={() => placeBet(type)}
                      disabled={spinning}
                      data-testid={`button-${type}`}
                      className={cn(
                        "relative h-10 border rounded flex items-center justify-center text-white font-bold text-xs transition-all",
                        isRed ? "bg-red-600 hover:bg-red-500 border-red-400" :
                        isBlack ? "bg-slate-800 hover:bg-slate-700 border-slate-600" :
                        "bg-[#1a6b4f] hover:bg-[#228b5b] border-[#2a8b6f]"
                      )}
                    >
                      {isRed && <div className="w-5 h-5 bg-red-500 rotate-45 border border-red-300" />}
                      {isBlack && <div className="w-5 h-5 bg-slate-900 rotate-45 border border-slate-600" />}
                      {label}
                      <ChipStack amount={getBetAmount(type)} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Chip Selection */}
              <div className="mt-4 flex items-center justify-between gap-4">
                
                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUndo}
                    disabled={betHistory.length === 0 || spinning}
                    className="border-[#2a3a4a] text-slate-400 hover:text-white"
                    data-testid="button-undo"
                  >
                    <Undo2 className="w-4 h-4 mr-1" />
                    Undo
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClear}
                    disabled={placedBets.length === 0 || spinning}
                    className="border-[#2a3a4a] text-slate-400 hover:text-white"
                    data-testid="button-clear"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Clear
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRepeat}
                    disabled={lastBets.length === 0 || spinning}
                    className="border-[#2a3a4a] text-slate-400 hover:text-white"
                    data-testid="button-repeat"
                  >
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Repeat
                  </Button>
                </div>

                {/* Chips */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wide mr-2">Chip:</span>
                  {CHIP_DENOMINATIONS.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => setSelectedChip(chip)}
                      disabled={spinning}
                      data-testid={`chip-${chip}`}
                      className={cn(
                        "relative w-10 h-10 rounded-full font-bold text-[9px] transition-all",
                        "bg-gradient-to-br border-2 shadow-md",
                        selectedChip === chip 
                          ? "from-yellow-400 to-yellow-600 border-yellow-300 ring-2 ring-white ring-offset-2 ring-offset-[#0d1419] scale-110" 
                          : "from-slate-600 to-slate-800 border-slate-500 hover:from-slate-500 hover:to-slate-700",
                        chip > (user?.balance || 0) && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      <span className={selectedChip === chip ? "text-slate-900" : "text-white"}>
                        {chip >= 1000 ? `${chip/1000}k` : chip}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Info Row */}
              <div className="flex justify-center gap-8 mt-4 text-center">
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Straight Payout
                  </span>
                  <span className="font-mono font-semibold text-white">36x</span>
                </div>
                <div className="w-px bg-[#1a2530]" />
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Outside Payout
                  </span>
                  <span className="font-mono font-semibold text-white">2x</span>
                </div>
                <div className="w-px bg-[#1a2530]" />
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    House Edge
                  </span>
                  <span className="font-mono font-semibold text-white">2.7%</span>
                </div>
              </div>

            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
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
