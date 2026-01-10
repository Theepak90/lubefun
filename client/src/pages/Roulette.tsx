import { useState, useRef, useEffect, useCallback } from "react";
import { Layout } from "@/components/ui/Layout";
import { Button } from "@/components/ui/button";
import { RotateCcw, Volume2, VolumeX, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { getRouletteColor, ROULETTE_CONFIG } from "@shared/config";
import { useGameHistory } from "@/hooks/use-game-history";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/hooks/use-sound";

type BetType = "red" | "black" | "odd" | "even" | "1-18" | "19-36" | "straight" | "1st12" | "2nd12" | "3rd12" | "col1" | "col2" | "col3";

interface PlacedBet {
  type: BetType;
  number?: number;
  amount: number;
}

interface SpinResult {
  winningNumber: number;
  color: string;
  totalBet: number;
  totalPayout: number;
  profit: number;
}

const WHEEL_NUMBERS = ROULETTE_CONFIG.WHEEL_ORDER;
const CHIP_DENOMINATIONS = [0.20, 1, 2, 10, 50, 200, 1000, 4000];
const SPIN_DURATION = 4000;
const BALL_ORBIT_DURATION = 3200;
const BALL_DROP_DURATION = 600;

const TABLE_ROWS = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
];

export default function Roulette() {
  const { user } = useAuth();
  const { addResult } = useGameHistory();
  const { toast } = useToast();
  const { enabled: soundEnabled, toggle: toggleSound, play: playSound } = useSound();
  
  const [selectedChip, setSelectedChip] = useState<number>(1);
  const [pendingBets, setPendingBets] = useState<PlacedBet[]>([]);
  const [lastBets, setLastBets] = useState<PlacedBet[]>([]);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [winPopup, setWinPopup] = useState<{ amount: number; visible: boolean }>({ amount: 0, visible: false });
  const [chipBounce, setChipBounce] = useState<string | null>(null);
  const [sparkles, setSparkles] = useState<{ id: number; x: number; y: number; delay: number }[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [recentNumbers, setRecentNumbers] = useState<{ number: number; color: string }[]>([]);
  const [ballAngle, setBallAngle] = useState(0);
  const [ballRadius, setBallRadius] = useState(48);
  const [ballVisible, setBallVisible] = useState(false);
  const [showWinningNumber, setShowWinningNumber] = useState(false);
  const [currentWinningNumber, setCurrentWinningNumber] = useState<number | null>(null);
  
  const sparkleIdRef = useRef(0);
  const ballAnimationRef = useRef<number | null>(null);
  const tickSoundRef = useRef<number>(0);
  const ballAngleRef = useRef(0);
  const ballRadiusRef = useRef(48);

  const totalPendingBet = pendingBets.reduce((sum, b) => sum + b.amount, 0);
  const canSpin = pendingBets.length > 0 && !isSpinning && totalPendingBet <= (user?.balance || 0);

  const getNumberColor = (num: number): "red" | "black" | "green" => {
    return getRouletteColor(num);
  };

  const animateBall = useCallback((
    startTime: number,
    startAngle: number,
    targetAngle: number,
    onComplete: () => void
  ) => {
    ballAngleRef.current = startAngle;
    ballRadiusRef.current = 48;
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      
      if (elapsed < BALL_ORBIT_DURATION) {
        const progress = elapsed / BALL_ORBIT_DURATION;
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const totalRotations = 6 + (2 * (1 - easeOut));
        const currentAngle = startAngle - (totalRotations * 360 * progress);
        ballAngleRef.current = currentAngle;
        ballRadiusRef.current = 48;
        setBallAngle(currentAngle);
        setBallRadius(48);
        
        const tickInterval = 30 + (progress * 180);
        if (elapsed - tickSoundRef.current > tickInterval) {
          tickSoundRef.current = elapsed;
          playSound("ballTick");
        }
        
        ballAnimationRef.current = requestAnimationFrame(animate);
      } else if (elapsed < BALL_ORBIT_DURATION + BALL_DROP_DURATION) {
        const dropProgress = (elapsed - BALL_ORBIT_DURATION) / BALL_DROP_DURATION;
        const easeInOut = dropProgress < 0.5 
          ? 2 * dropProgress * dropProgress 
          : 1 - Math.pow(-2 * dropProgress + 2, 2) / 2;
        
        const startRadius = 48;
        const endRadius = 32;
        const newRadius = startRadius - (startRadius - endRadius) * easeInOut;
        ballRadiusRef.current = newRadius;
        setBallRadius(newRadius);
        
        const lastOrbitAngle = ballAngleRef.current;
        let angleDiff = targetAngle - (lastOrbitAngle % 360);
        if (angleDiff > 180) angleDiff -= 360;
        if (angleDiff < -180) angleDiff += 360;
        const newAngle = lastOrbitAngle + angleDiff * easeInOut;
        setBallAngle(newAngle);
        
        if (dropProgress >= 0.95 && dropProgress < 1) {
          ballAngleRef.current = targetAngle;
        }
        
        ballAnimationRef.current = requestAnimationFrame(animate);
      } else {
        setBallAngle(targetAngle);
        setBallRadius(32);
        ballAngleRef.current = targetAngle;
        ballRadiusRef.current = 32;
        playSound("ballLand");
        onComplete();
      }
    };
    
    ballAnimationRef.current = requestAnimationFrame(animate);
  }, [playSound]);

  useEffect(() => {
    return () => {
      if (ballAnimationRef.current) {
        cancelAnimationFrame(ballAnimationRef.current);
      }
    };
  }, []);

  const spinMutation = useMutation({
    mutationFn: async (bets: PlacedBet[]) => {
      const res = await apiRequest("POST", "/api/games/roulette/spin-multi", {
        bets: bets.map(b => ({
          betType: b.type,
          straightNumber: b.type === "straight" ? b.number : undefined,
          amount: b.amount,
        })),
      });
      return res.json();
    },
    onSuccess: (data: SpinResult) => {
      setCurrentWinningNumber(data.winningNumber);
      setShowWinningNumber(false);
      
      const numberIndex = WHEEL_NUMBERS.indexOf(data.winningNumber);
      const segmentAngle = 360 / WHEEL_NUMBERS.length;
      const targetPocketAngle = 360 - (numberIndex * segmentAngle) - (segmentAngle / 2);
      const totalRotation = wheelRotation + 1800 + targetPocketAngle;
      setWheelRotation(totalRotation);
      
      const initialBallAngle = Math.random() * 360;
      setBallVisible(true);
      setBallAngle(initialBallAngle);
      setBallRadius(48);
      tickSoundRef.current = 0;
      
      const ballTargetAngle = 0;
      
      setTimeout(() => {
        animateBall(
          performance.now(),
          initialBallAngle,
          ballTargetAngle,
          () => {
            setShowWinningNumber(true);
          }
        );
      }, 100);
      
      setTimeout(() => {
        setIsSpinning(false);
        setBallVisible(false);
        playSound("result");
        
        setRecentNumbers(prev => [
          { number: data.winningNumber, color: data.color },
          ...prev.slice(0, 7),
        ]);
        
        if (data.totalPayout > 0) {
          setWinPopup({ amount: data.totalPayout, visible: true });
          playSound("win");
          
          const newSparkles = Array.from({ length: 8 }, (_, i) => ({
            id: sparkleIdRef.current++,
            x: Math.random() * 100 - 50,
            y: Math.random() * 60 - 30,
            delay: i * 50,
          }));
          setSparkles(newSparkles);
          
          setTimeout(() => setWinPopup(prev => ({ ...prev, visible: false })), 2000);
          setTimeout(() => setSparkles([]), 1200);
        }
        
        addResult({
          game: "roulette",
          betAmount: data.totalBet,
          won: data.totalPayout > 0,
          profit: data.profit,
          detail: `${data.winningNumber} ${data.color}`,
        });
        
        setLastBets(pendingBets);
        setPendingBets([]);
        
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      }, SPIN_DURATION);
    },
    onError: (error: any) => {
      setIsSpinning(false);
      setBallVisible(false);
      toast({
        title: "Spin Failed",
        description: error.message || "Could not spin",
        variant: "destructive",
      });
    },
  });

  const handleSpin = () => {
    if (!canSpin) return;
    setIsSpinning(true);
    setShowWinningNumber(false);
    spinMutation.mutate(pendingBets);
  };

  const placeBet = (type: BetType, number?: number) => {
    if (isSpinning || !user) return;
    if (totalPendingBet + selectedChip > user.balance) {
      toast({ title: "Insufficient balance", variant: "destructive" });
      return;
    }

    playSound("chipDrop");
    
    const bounceKey = `${type}-${number ?? 'none'}`;
    setChipBounce(bounceKey);
    setTimeout(() => setChipBounce(null), 300);

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
  };

  const getBetAmount = (type: BetType, number?: number): number => {
    const bet = pendingBets.find(b => b.type === type && b.number === number);
    return bet?.amount || 0;
  };

  const handleRepeat = () => {
    if (lastBets.length === 0 || isSpinning) return;
    const repeatTotal = lastBets.reduce((sum, b) => sum + b.amount, 0);
    if (repeatTotal > (user?.balance || 0)) {
      toast({ title: "Insufficient balance to repeat", variant: "destructive" });
      return;
    }
    setPendingBets(lastBets);
    playSound("chipDrop");
  };

  const clearBets = () => {
    if (isSpinning) return;
    setPendingBets([]);
  };

  const VegasChip = ({ value, selected, disabled, onClick }: { value: number; selected: boolean; disabled: boolean; onClick: () => void }) => {
    const chipColors: Record<number, { bg: string; ring: string; text: string }> = {
      0.20: { bg: "bg-slate-200", ring: "ring-slate-400", text: "text-slate-700" },
      1: { bg: "bg-blue-500", ring: "ring-blue-300", text: "text-white" },
      2: { bg: "bg-emerald-500", ring: "ring-emerald-300", text: "text-white" },
      10: { bg: "bg-orange-500", ring: "ring-orange-300", text: "text-white" },
      50: { bg: "bg-red-500", ring: "ring-red-300", text: "text-white" },
      200: { bg: "bg-purple-600", ring: "ring-purple-400", text: "text-white" },
      1000: { bg: "bg-yellow-400", ring: "ring-yellow-200", text: "text-yellow-900" },
      4000: { bg: "bg-pink-400", ring: "ring-pink-200", text: "text-pink-900" },
    };
    const colors = chipColors[value] || chipColors[1];
    const label = value >= 1000 ? `$${value / 1000}k` : value < 1 ? `$.${Math.round(value * 100)}` : `$${value}`;

    return (
      <button
        onClick={onClick}
        disabled={disabled}
        data-testid={`chip-${value}`}
        className={cn(
          "relative w-10 h-10 rounded-full transition-all duration-150",
          colors.bg,
          "ring-2 ring-inset", colors.ring,
          "shadow-md",
          selected && "ring-4 ring-white scale-110 shadow-lg shadow-white/30",
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && !selected && "hover:scale-105"
        )}
      >
        <div className="absolute inset-1 rounded-full border-2 border-dashed border-white/40" />
        <span className={cn("text-[10px] font-bold", colors.text)}>{label}</span>
      </button>
    );
  };

  const ChipStack = ({ amount, small, bouncing }: { amount: number; small?: boolean; bouncing?: boolean }) => {
    if (amount <= 0) return null;
    const size = small ? "w-4 h-4 text-[6px]" : "w-6 h-6 text-[8px]";
    return (
      <div className={cn(
        "absolute inset-0 flex items-center justify-center pointer-events-none",
        bouncing && "animate-chip-drop"
      )}>
        <div className={cn(size, "rounded-full bg-yellow-400 border border-yellow-600 flex items-center justify-center font-bold text-yellow-900 shadow-md")}>
          {amount >= 1000 ? `${(amount/1000).toFixed(0)}k` : amount >= 1 ? amount.toFixed(0) : amount.toFixed(2)}
        </div>
      </div>
    );
  };

  const wheelSize = 288;
  const wheelCenter = wheelSize / 2;
  const ballX = wheelCenter + ballRadius * Math.cos((ballAngle - 90) * Math.PI / 180) * (wheelSize / 100);
  const ballY = wheelCenter + ballRadius * Math.sin((ballAngle - 90) * Math.PI / 180) * (wheelSize / 100);

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-[#0a0f14] to-[#0d1419] p-4 pb-24">
        
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {recentNumbers.slice(0, 8).map((r, i) => (
              <div
                key={i}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 border",
                  r.color === "red" ? "bg-red-600 border-red-400" :
                  r.color === "green" ? "bg-emerald-600 border-emerald-400" :
                  "bg-slate-800 border-slate-600"
                )}
              >
                {r.number}
              </div>
            ))}
            {recentNumbers.length === 0 && (
              <span className="text-slate-500 text-sm">No spins yet</span>
            )}
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSound}
            className="text-slate-400 hover:text-white"
            data-testid="button-toggle-sound"
          >
            {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </Button>
        </div>
        
        <div className="flex flex-col items-center">
          
          <div className="relative mb-6">
            {isSpinning && (
              <div className="absolute -inset-3 rounded-full animate-wheel-glow pointer-events-none" />
            )}
            
            <div 
              className={cn(
                "w-72 h-72 md:w-80 md:h-80 rounded-full border-4 border-amber-600 bg-gradient-to-br from-amber-900 to-amber-950 shadow-2xl relative overflow-hidden"
              )}
              style={{
                transform: `rotate(${wheelRotation}deg)`,
                transition: isSpinning ? `transform ${SPIN_DURATION}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)` : "none",
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
                    <div
                      className={cn(
                        "absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[45%] origin-bottom",
                        color === "red" ? "bg-red-600" :
                        color === "green" ? "bg-emerald-600" :
                        "bg-slate-900"
                      )}
                      style={{ clipPath: "polygon(30% 0%, 70% 0%, 100% 100%, 0% 100%)" }}
                    >
                      <span className="absolute top-2 left-1/2 -translate-x-1/2 text-white text-[10px] font-bold">
                        {num}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div className="absolute inset-[30%] rounded-full bg-gradient-to-br from-amber-700 to-amber-900 border-4 border-amber-600 shadow-inner" />
              <div className="absolute inset-[42%] rounded-full bg-gradient-to-br from-amber-600 to-amber-800 shadow-lg flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-amber-400" />
              </div>
            </div>
            
            {ballVisible && (
              <div 
                className="absolute w-4 h-4 rounded-full bg-gradient-to-br from-white via-gray-100 to-gray-300 shadow-lg z-20 pointer-events-none"
                style={{
                  left: `${ballX}px`,
                  top: `${ballY}px`,
                  transform: 'translate(-50%, -50%)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4), inset -2px -2px 4px rgba(0,0,0,0.2), inset 2px 2px 4px rgba(255,255,255,0.8)',
                }}
              />
            )}
            
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10">
              <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[16px] border-l-transparent border-r-transparent border-t-white drop-shadow-lg" />
            </div>
            
            {showWinningNumber && currentWinningNumber !== null && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                <div className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-2xl border-4 animate-scale-in",
                  getNumberColor(currentWinningNumber) === "red" ? "bg-red-600 border-red-400" :
                  getNumberColor(currentWinningNumber) === "green" ? "bg-emerald-600 border-emerald-400" :
                  "bg-slate-800 border-slate-600"
                )}>
                  {currentWinningNumber}
                </div>
              </div>
            )}
            
            {sparkles.map((sparkle) => (
              <div
                key={sparkle.id}
                className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full bg-gradient-to-br from-yellow-300 to-amber-400 animate-sparkle pointer-events-none z-30"
                style={{
                  marginLeft: `${sparkle.x}px`,
                  marginTop: `${sparkle.y}px`,
                  animationDelay: `${sparkle.delay}ms`,
                }}
              />
            ))}
            
            <div 
              className={cn(
                "absolute -bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none",
                "transition-all duration-300 motion-reduce:transition-none",
                winPopup.visible 
                  ? "opacity-100 translate-y-0 scale-100" 
                  : "opacity-0 translate-y-4 scale-90"
              )}
              data-testid="win-popup"
            >
              <div className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 shadow-xl shadow-amber-500/40 border-2 border-amber-300">
                <div className="text-center">
                  <div className="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-0.5">Winner!</div>
                  <span className="text-xl font-bold text-white drop-shadow-md">
                    +${winPopup.amount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 mb-4 text-sm">
            <div className="text-slate-400">
              Balance: <span className="text-white font-mono font-semibold">${user?.balance?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="text-slate-400">
              Bet: <span className="text-emerald-400 font-mono font-semibold">${totalPendingBet.toFixed(2)}</span>
            </div>
          </div>
        </div>
        
        <div className="bg-[#0d1419] border border-[#1a2530] rounded-2xl p-4 mt-2 max-w-2xl mx-auto">
          
          <div className={cn(
            "bg-[#0f4c3a] rounded-xl p-3 border-2 border-[#1a6b4f] shadow-inner transition-opacity",
            isSpinning && "opacity-60 pointer-events-none"
          )}>
            
            <div className="flex mb-1">
              <button
                onClick={() => placeBet("straight", 0)}
                disabled={isSpinning}
                data-testid="button-number-0"
                className="relative w-8 h-20 bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 rounded-l-lg flex items-center justify-center text-white font-bold text-sm transition-all"
              >
                0
                <ChipStack amount={getBetAmount("straight", 0)} small bouncing={chipBounce === "straight-0"} />
              </button>
              
              <div className="flex-1 grid grid-rows-3 gap-px">
                {TABLE_ROWS.map((row, rowIdx) => (
                  <div key={rowIdx} className="grid grid-cols-12 gap-px">
                    {row.map((num) => {
                      const color = getNumberColor(num);
                      return (
                        <button
                          key={num}
                          onClick={() => placeBet("straight", num)}
                          disabled={isSpinning}
                          data-testid={`button-number-${num}`}
                          className={cn(
                            "relative h-6 flex items-center justify-center text-white font-bold text-[10px] transition-all border border-opacity-30",
                            color === "red" 
                              ? "bg-red-600 hover:bg-red-500 border-red-400" 
                              : "bg-slate-800 hover:bg-slate-700 border-slate-600"
                          )}
                        >
                          {num}
                          <ChipStack amount={getBetAmount("straight", num)} small bouncing={chipBounce === `straight-${num}`} />
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-px ml-1">
                {["col1", "col2", "col3"].map((col) => (
                  <button
                    key={col}
                    onClick={() => placeBet(col as BetType)}
                    disabled={isSpinning}
                    data-testid={`button-${col}`}
                    className="relative w-8 h-6 bg-[#1a6b4f] hover:bg-[#228b5b] border border-[#2a8b6f] flex items-center justify-center text-white font-bold text-[9px] transition-all"
                  >
                    2:1
                    <ChipStack amount={getBetAmount(col as BetType)} small bouncing={chipBounce === `${col}-none`} />
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1 mt-1.5 mb-1.5">
              {[
                { type: "1st12" as BetType, label: "1-12" },
                { type: "2nd12" as BetType, label: "13-24" },
                { type: "3rd12" as BetType, label: "25-36" },
              ].map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => placeBet(type)}
                  disabled={isSpinning}
                  data-testid={`button-${type}`}
                  className="relative h-8 bg-[#1a6b4f] hover:bg-[#228b5b] border border-[#2a8b6f] rounded flex items-center justify-center text-white font-bold text-xs transition-all"
                >
                  {label}
                  <ChipStack amount={getBetAmount(type)} small bouncing={chipBounce === `${type}-none`} />
                </button>
              ))}
            </div>

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
                  disabled={isSpinning}
                  data-testid={`button-${type}`}
                  className={cn(
                    "relative h-8 border rounded flex items-center justify-center text-white font-bold text-[10px] transition-all",
                    isRed ? "bg-red-600 hover:bg-red-500 border-red-400" :
                    isBlack ? "bg-slate-800 hover:bg-slate-700 border-slate-600" :
                    "bg-[#1a6b4f] hover:bg-[#228b5b] border-[#2a8b6f]"
                  )}
                >
                  {isRed && <div className="w-4 h-4 bg-red-500 rotate-45 border border-red-300" />}
                  {isBlack && <div className="w-4 h-4 bg-slate-900 rotate-45 border border-slate-600" />}
                  {label}
                  <ChipStack amount={getBetAmount(type)} small bouncing={chipBounce === `${type}-none`} />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-4 flex-wrap">
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRepeat}
                disabled={lastBets.length === 0 || isSpinning}
                className="border-[#2a3a4a] text-slate-400 hover:text-white"
                data-testid="button-repeat"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Repeat
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={clearBets}
                disabled={pendingBets.length === 0 || isSpinning}
                className="border-[#2a3a4a] text-slate-400 hover:text-white"
                data-testid="button-clear"
              >
                Clear
              </Button>
            </div>

            <div className="flex items-center gap-1.5">
              {CHIP_DENOMINATIONS.map((chip) => (
                <VegasChip
                  key={chip}
                  value={chip}
                  selected={selectedChip === chip}
                  disabled={isSpinning}
                  onClick={() => setSelectedChip(chip)}
                />
              ))}
            </div>
          </div>
          
          <div className="mt-4">
            <Button
              onClick={handleSpin}
              disabled={!canSpin}
              className={cn(
                "w-full h-14 text-lg font-bold transition-all",
                canSpin 
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 shadow-lg shadow-emerald-500/30" 
                  : "bg-slate-700 cursor-not-allowed"
              )}
              data-testid="button-spin"
            >
              {isSpinning ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Spinning...
                </>
              ) : pendingBets.length === 0 ? (
                "Place a Bet"
              ) : (
                `Spin ($${totalPendingBet.toFixed(2)})`
              )}
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
