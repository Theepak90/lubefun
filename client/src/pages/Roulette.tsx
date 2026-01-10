import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/ui/Layout";
import { Button } from "@/components/ui/button";
import { Shield, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { getRouletteColor, ROULETTE_CONFIG } from "@shared/config";
import { useGameHistory } from "@/hooks/use-game-history";
import { RecentResults } from "@/components/RecentResults";
import { LiveWins } from "@/components/LiveWins";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRouletteSocket } from "@/hooks/use-roulette-socket";
import { useSound } from "@/hooks/use-sound";

type BetType = "red" | "black" | "odd" | "even" | "1-18" | "19-36" | "straight" | "1st12" | "2nd12" | "3rd12" | "col1" | "col2" | "col3";

interface PlacedBet {
  type: BetType;
  number?: number;
  amount: number;
  confirmed?: boolean;
}

const WHEEL_NUMBERS = ROULETTE_CONFIG.WHEEL_ORDER;
const CHIP_DENOMINATIONS = [0.20, 1, 2, 10, 50, 200, 1000, 4000];

const RANDOM_NAMES = [
  "sergio", "maria", "james", "alex", "sofia", "marco", "lisa", "diego",
  "emma", "carlos", "olivia", "lucas", "mia", "noah", "ava", "leo",
  "luna", "max", "zoe", "felix", "ruby", "oscar", "ivy", "jack",
  "bella", "sam", "nina", "theo", "jade", "kai"
];

interface SimulatedWinner {
  name: string;
  amount: number;
}

function generateSimulatedWinners(): SimulatedWinner[] {
  const count = 6 + Math.floor(Math.random() * 7); // 6-12 winners
  const winners: SimulatedWinner[] = [];
  const usedNames = new Set<string>();
  
  for (let i = 0; i < count; i++) {
    let name: string;
    do {
      name = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    } while (usedNames.has(name) && usedNames.size < RANDOM_NAMES.length);
    usedNames.add(name);
    
    // Random amounts between $2 and $500
    const amount = Math.round((2 + Math.random() * 498) * 100) / 100;
    winners.push({ name, amount });
  }
  
  return winners;
}

const TABLE_ROWS = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
];

export default function Roulette() {
  const { user } = useAuth();
  const { results, addResult, clearHistory } = useGameHistory();
  const { toast } = useToast();
  const { roundState, connected } = useRouletteSocket();
  const { enabled: soundEnabled, toggle: toggleSound, play: playSound } = useSound();
  
  const [selectedChip, setSelectedChip] = useState<number>(1);
  const [pendingBets, setPendingBets] = useState<PlacedBet[]>([]);
  const [lastBets, setLastBets] = useState<PlacedBet[]>([]);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [lastWinningNumber, setLastWinningNumber] = useState<number | null>(null);
  const [simulatedWinners, setSimulatedWinners] = useState<SimulatedWinner[]>([]);
  
  const spinAnimatedRef = useRef(false);
  const lastResultsRoundRef = useRef<number | null>(null);
  const lastCountdownRef = useRef<number>(0);
  const spinSoundPlayedRef = useRef<number | null>(null);

  const status = roundState?.status || "betting";
  const countdown = Math.ceil((roundState?.countdown || 0) / 1000);
  const isBettingOpen = status === "betting" && countdown > 0;
  const isSpinning = status === "spinning";
  const isResults = status === "results";

  const totalPendingBet = pendingBets.reduce((sum, b) => sum + b.amount, 0);

  const getNumberColor = (num: number): "red" | "black" | "green" => {
    return getRouletteColor(num);
  };

  // Animate wheel when spinning starts
  useEffect(() => {
    if (isSpinning && roundState?.winningNumber !== undefined && !spinAnimatedRef.current) {
      spinAnimatedRef.current = true;
      const numberIndex = WHEEL_NUMBERS.indexOf(roundState.winningNumber);
      const segmentAngle = 360 / WHEEL_NUMBERS.length;
      const targetAngle = 360 - (numberIndex * segmentAngle) - (segmentAngle / 2);
      const totalRotation = wheelRotation + 1800 + targetAngle;
      setWheelRotation(totalRotation);
      setLastWinningNumber(roundState.winningNumber);
    }
  }, [isSpinning, roundState?.winningNumber, wheelRotation]);

  // Reset for new round
  useEffect(() => {
    if (status === "betting" && spinAnimatedRef.current) {
      spinAnimatedRef.current = false;
      setPendingBets([]);
    }
  }, [status, roundState?.roundId]);

  // Log results when round completes
  useEffect(() => {
    if (isResults && roundState?.winningNumber !== undefined) {
      addResult({
        game: "roulette",
        betAmount: totalPendingBet,
        won: false, // We don't track individual wins in this simple version
        profit: 0,
        detail: `${roundState.winningNumber} ${roundState.winningColor}`,
      });
      setLastBets(pendingBets);
    }
  }, [isResults, roundState?.roundId]);

  // Generate simulated winners for results phase
  useEffect(() => {
    if (isResults && roundState?.roundId && lastResultsRoundRef.current !== roundState.roundId) {
      lastResultsRoundRef.current = roundState.roundId;
      setSimulatedWinners(generateSimulatedWinners());
    }
    if (!isResults) {
      // Clear winners when leaving results phase
      if (simulatedWinners.length > 0) {
        setSimulatedWinners([]);
      }
    }
  }, [isResults, roundState?.roundId]);

  // Sound: Tick during countdown (every second)
  useEffect(() => {
    if (isBettingOpen && countdown > 0 && countdown !== lastCountdownRef.current) {
      if (countdown <= 5) {
        playSound("tick");
      }
      lastCountdownRef.current = countdown;
    }
  }, [countdown, isBettingOpen, playSound]);

  // Sound: Spin when spinning starts
  useEffect(() => {
    if (isSpinning && roundState?.roundId && spinSoundPlayedRef.current !== roundState.roundId) {
      spinSoundPlayedRef.current = roundState.roundId;
      playSound("spin");
    }
  }, [isSpinning, roundState?.roundId, playSound]);

  // Sound: Result ding when results show
  useEffect(() => {
    if (isResults && roundState?.roundId) {
      playSound("result");
    }
  }, [isResults, roundState?.roundId, playSound]);

  const placeBetMutation = useMutation({
    mutationFn: async (bet: { betType: string; amount: number; straightNumber?: number }) => {
      const res = await apiRequest("POST", "/api/games/roulette/live/bet", bet);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || "Bet rejected");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (error: any, variables) => {
      // Rollback pending bet on failure
      setPendingBets(prev => {
        const updated = prev.map(b => {
          if (b.type === variables.betType && 
              (b.type !== "straight" || b.number === variables.straightNumber)) {
            const newAmount = b.amount - variables.amount;
            return newAmount > 0 ? { ...b, amount: newAmount } : null;
          }
          return b;
        }).filter((b): b is PlacedBet => b !== null);
        return updated;
      });
      
      toast({
        title: "Bet Failed",
        description: error.message || "Could not place bet",
        variant: "destructive",
      });
    },
  });

  const placeBet = (type: BetType, number?: number) => {
    if (!isBettingOpen || !user) return;
    if (totalPendingBet + selectedChip > user.balance) {
      toast({ title: "Insufficient balance", variant: "destructive" });
      return;
    }

    playSound("bet");

    // Optimistically add to pending bets
    setPendingBets(prev => {
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

    // Submit bet to server
    placeBetMutation.mutate({
      betType: type,
      amount: selectedChip,
      straightNumber: type === "straight" ? number : undefined,
    });
  };

  const getBetAmount = (type: BetType, number?: number): number => {
    const bet = pendingBets.find(b => b.type === type && b.number === number);
    return bet?.amount || 0;
  };

  const handleRepeat = () => {
    if (lastBets.length === 0 || !isBettingOpen) return;
    const repeatTotal = lastBets.reduce((sum, b) => sum + b.amount, 0);
    if (repeatTotal > (user?.balance || 0)) {
      toast({ title: "Insufficient balance to repeat", variant: "destructive" });
      return;
    }
    
    // Submit all previous bets to server
    lastBets.forEach(bet => {
      placeBetMutation.mutate({
        betType: bet.type,
        amount: bet.amount,
        straightNumber: bet.type === "straight" ? bet.number : undefined,
      });
    });
    
    // Optimistically update pending bets display
    setPendingBets(prev => {
      const merged = [...prev];
      lastBets.forEach(lastBet => {
        const existing = merged.find(b => b.type === lastBet.type && b.number === lastBet.number);
        if (existing) {
          existing.amount += lastBet.amount;
        } else {
          merged.push({ ...lastBet });
        }
      });
      return merged;
    });
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
          
          {/* Header with timer and recent numbers */}
          <div className="flex items-center justify-between p-4 border-b border-[#1a2530]">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1a2530] rounded-full border border-[#2a3a4a]">
                <Shield className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] font-medium text-emerald-400">Provably Fair</span>
              </div>
              
              {/* Sound Toggle */}
              <button
                onClick={toggleSound}
                className={cn(
                  "p-2 rounded-full transition-all",
                  soundEnabled 
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" 
                    : "bg-[#1a2530] text-slate-500 border border-[#2a3a4a]"
                )}
                data-testid="button-sound-toggle"
                title={soundEnabled ? "Mute sounds" : "Enable sounds"}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              
              {/* Countdown / Status */}
              <div className={cn(
                "px-4 py-2 rounded-lg font-bold text-sm",
                isBettingOpen ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" :
                isSpinning ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" :
                "bg-red-500/20 text-red-400 border border-red-500/40"
              )}>
                {isBettingOpen ? (
                  <>Bets close in: <span className="font-mono">{countdown}s</span></>
                ) : isSpinning ? (
                  "Spinning..."
                ) : isResults ? (
                  "BETS CLOSED"
                ) : (
                  "Waiting..."
                )}
              </div>

              {!connected && (
                <span className="text-xs text-slate-500">Connecting...</span>
              )}
            </div>
            
            {/* Recent Numbers */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide mr-2">Last:</span>
              {(roundState?.recentNumbers || []).slice(0, 12).map((item, i) => (
                <div 
                  key={i}
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm",
                    i === 0 && isResults ? "ring-2 ring-white scale-110" : "",
                    item.color === "green" ? "bg-emerald-600 text-white" :
                    item.color === "red" ? "bg-red-600 text-white" : "bg-slate-800 text-white"
                  )}
                >
                  {item.number}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col lg:flex-row">
            
            {/* Left: Wheel Display */}
            <div className="lg:w-72 shrink-0 bg-[#0a0f13] border-b lg:border-b-0 lg:border-r border-[#1a2530] p-6 flex flex-col items-center justify-center">
              
              {/* Roulette Wheel */}
              <div className="relative mb-4">
                <div 
                  className="w-48 h-48 rounded-full border-4 border-amber-600 bg-gradient-to-br from-amber-900 to-amber-950 shadow-2xl relative overflow-hidden"
                  style={{
                    transform: `rotate(${wheelRotation}deg)`,
                    transition: isSpinning ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
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
              {(isSpinning || isResults) && lastWinningNumber !== null && (
                <div className="text-center animate-pulse mb-4">
                  <div className={cn(
                    "inline-flex items-center gap-2 px-4 py-2 rounded-xl",
                    getNumberColor(lastWinningNumber) === "red" ? "bg-red-500/20 border border-red-500/40" :
                    getNumberColor(lastWinningNumber) === "black" ? "bg-slate-700/40 border border-slate-600" :
                    "bg-emerald-500/20 border border-emerald-500/40"
                  )}>
                    <div className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-lg",
                      getNumberColor(lastWinningNumber) === "red" ? "bg-red-500" :
                      getNumberColor(lastWinningNumber) === "black" ? "bg-slate-800" :
                      "bg-emerald-500"
                    )}>
                      {lastWinningNumber}
                    </div>
                  </div>
                </div>
              )}

              {/* Total Bet Display */}
              <div className="w-full space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Your Bets:</span>
                  <span className="text-white font-mono font-semibold">${totalPendingBet.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Balance:</span>
                  <span className="text-white font-mono font-semibold">${user?.balance?.toFixed(2) || '0.00'}</span>
                </div>
              </div>

              {/* Simulated Winners Panel - Results phase only */}
              <div 
                className={cn(
                  "w-full mt-4 p-3 bg-[#1a2530]/80 rounded-lg border border-[#2a3a4a] transition-all duration-500",
                  isResults && simulatedWinners.length > 0 
                    ? "opacity-100 translate-y-0" 
                    : "opacity-0 translate-y-2 pointer-events-none"
                )}
                data-testid="panel-simulated-winners"
              >
                <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-2 text-center">
                  Simulated wins (demo)
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {simulatedWinners.map((winner, i) => (
                    <div 
                      key={i} 
                      className="flex justify-between text-xs text-slate-400"
                      style={{ 
                        animationDelay: `${i * 50}ms`,
                        animation: isResults ? 'fadeIn 0.3s ease-out forwards' : 'none',
                        opacity: 0,
                      }}
                    >
                      <span className="text-slate-300 capitalize">{winner.name}</span>
                      <span className="text-emerald-400 font-mono">+${winner.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Betting Table */}
            <div className="flex-1 p-4 lg:p-6">
              
              {/* Betting Grid */}
              <div className={cn(
                "bg-[#0f4c3a] rounded-xl p-3 border-4 border-[#1a6b4f] shadow-inner transition-opacity",
                !isBettingOpen && "opacity-60 pointer-events-none"
              )}>
                
                {/* Zero */}
                <div className="flex mb-1">
                  <button
                    onClick={() => placeBet("straight", 0)}
                    disabled={!isBettingOpen}
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
                              disabled={!isBettingOpen}
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
                        disabled={!isBettingOpen}
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
                      disabled={!isBettingOpen}
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
                      disabled={!isBettingOpen}
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
              <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
                
                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRepeat}
                    disabled={lastBets.length === 0 || !isBettingOpen}
                    className="border-[#2a3a4a] text-slate-400 hover:text-white"
                    data-testid="button-repeat"
                  >
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Repeat Last
                  </Button>
                </div>

                {/* Chips */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wide mr-2">Chip:</span>
                  {CHIP_DENOMINATIONS.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => setSelectedChip(chip)}
                      disabled={!isBettingOpen}
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
              <div className="flex justify-center gap-8 mt-4 text-center flex-wrap">
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Straight
                  </span>
                  <span className="font-mono font-semibold text-white">35:1</span>
                </div>
                <div className="w-px bg-[#1a2530]" />
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Color/Even/Odd
                  </span>
                  <span className="font-mono font-semibold text-white">1:1</span>
                </div>
                <div className="w-px bg-[#1a2530]" />
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Dozen/Column
                  </span>
                  <span className="font-mono font-semibold text-white">2:1</span>
                </div>
                <div className="w-px bg-[#1a2530]" />
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                    Round
                  </span>
                  <span className="font-mono font-semibold text-white">#{roundState?.roundId || '-'}</span>
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
