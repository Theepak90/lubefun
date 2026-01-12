import { useState, useRef, useEffect, useCallback } from "react";
import { Layout } from "@/components/ui/Layout";
import { Button } from "@/components/ui/button";
import { RotateCcw, Volume2, VolumeX, Loader2, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { getRouletteColor, ROULETTE_CONFIG } from "@shared/config";

import chip50c from "@assets/ChatGPT_Image_Jan_11,_2026,_11_12_58_PM_1768174943548.png";
import chip1 from "@assets/Water-themed_$1_poker_chip_1768174943550.png";
import chip5 from "@assets/Water-themed_$5_poker_chip_1768174943550.png";
import chip10 from "@assets/Water-themed_$10_poker_chip_1768174943551.png";
import chip20 from "@assets/Water-themed_$20_casino_chip_1768174943551.png";
import chip100 from "@assets/Poker_chip_with_glowing_water_effects_1768174943552.png";
import { useGameHistory } from "@/hooks/use-game-history";
import { useProfitTracker, formatCurrency } from "@/hooks/use-profit-tracker";
import { ProfitTrackerWidget } from "@/components/ProfitTrackerWidget";
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

interface ChipConfig {
  value: number;
  image: string;
  label: string;
}

const CHIP_CONFIGS: ChipConfig[] = [
  { value: 0.5, image: chip50c, label: "50¢" },
  { value: 1, image: chip1, label: "$1" },
  { value: 5, image: chip5, label: "$5" },
  { value: 10, image: chip10, label: "$10" },
  { value: 20, image: chip20, label: "$20" },
  { value: 100, image: chip100, label: "$100" },
];
const SPIN_DURATION = 2000;
const BALL_ORBIT_DURATION = 1500;
const BALL_DROP_DURATION = 400;

const TABLE_ROWS = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
];

export default function Roulette() {
  const { user } = useAuth();
  const { addResult } = useGameHistory();
  const { recordResult } = useProfitTracker();
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
  const [devOverlay, setDevOverlay] = useState<{
    winningNumber: number;
    winningIndex: number;
    finalAngle: number;
  } | null>(null);
  const [showDevOverlay, setShowDevOverlay] = useState(true);
  
  const sparkleIdRef = useRef(0);
  const ballAnimationRef = useRef<number | null>(null);
  const tickSoundRef = useRef<number>(0);
  const ballAngleRef = useRef(0);
  const ballRadiusRef = useRef(48);
  const lastChipSoundRef = useRef<number>(0);

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
        const totalRotations = 3 + (1.5 * (1 - easeOut));
        const currentAngle = startAngle - (totalRotations * 360 * progress);
        ballAngleRef.current = currentAngle;
        ballRadiusRef.current = 48;
        setBallAngle(currentAngle);
        setBallRadius(48);
        
        const tickInterval = 25 + (progress * 120);
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
      
      // Calculate target rotation using canonical wheel order
      const EXTRA_SPINS = 3;
      const winningIndex = WHEEL_NUMBERS.indexOf(data.winningNumber);
      const segmentAngle = 360 / WHEEL_NUMBERS.length;
      
      // desiredOffset: the final wheel rotation (mod 360) that places pocket CENTER at 12 o'clock
      // Each pocket's center is at (i + 0.5) * segmentAngle, so we need to offset by half a slot
      const desiredOffset = ((360 - (winningIndex + 0.5) * segmentAngle) % 360 + 360) % 360;
      
      // Calculate final rotation to land at desiredOffset
      const baseRotation = wheelRotation + EXTRA_SPINS * 360;
      const currentModAngle = ((baseRotation % 360) + 360) % 360;
      const adjustmentAngle = ((desiredOffset - currentModAngle) % 360 + 360) % 360;
      const finalRotation = baseRotation + adjustmentAngle;
      
      setWheelRotation(finalRotation);
      
      // Dev overlay info
      setDevOverlay({
        winningNumber: data.winningNumber,
        winningIndex,
        finalAngle: finalRotation,
      });
      
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
        
        setRecentNumbers(prev => [
          { number: data.winningNumber, color: data.color },
          ...prev.slice(0, 7),
        ]);
        
        const won = data.totalPayout > 0;
        recordResult("roulette", data.totalBet, data.totalPayout, won);
        
        toast({
          title: won ? "You won!" : "You lost",
          description: won 
            ? `Won ${formatCurrency(data.totalPayout)} (profit ${formatCurrency(data.profit)})`
            : `Lost ${formatCurrency(data.totalBet)} (profit ${formatCurrency(-data.totalBet)})`,
          duration: 1500,
        });
        
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
          
          setTimeout(() => setWinPopup(prev => ({ ...prev, visible: false })), 1200);
          setTimeout(() => setSparkles([]), 1200);
        }
        
        addResult({
          game: "roulette",
          betAmount: data.totalBet,
          won,
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

    const now = Date.now();
    if (now - lastChipSoundRef.current >= 125) {
      playSound("chipDrop");
      lastChipSoundRef.current = now;
    }
    
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

  const handleRebet = () => {
    if (lastBets.length === 0 || isSpinning) return;
    const rebetTotal = lastBets.reduce((sum, b) => sum + b.amount, 0);
    if (rebetTotal > (user?.balance || 0)) {
      toast({ title: "Insufficient balance to rebet", variant: "destructive" });
      return;
    }
    setPendingBets(lastBets);
    playSound("chipDrop");
  };

  const handleDouble = () => {
    if (pendingBets.length === 0 || isSpinning) return;
    const doubledTotal = totalPendingBet * 2;
    if (doubledTotal > (user?.balance || 0)) {
      toast({ title: "Insufficient balance to double", variant: "destructive" });
      return;
    }
    setPendingBets(prev => prev.map(b => ({ ...b, amount: b.amount * 2 })));
    playSound("chipDrop");
  };

  const clearBets = () => {
    if (isSpinning) return;
    setPendingBets([]);
  };

  const VegasChip = ({ chip, selected, disabled, onClick }: { chip: ChipConfig; selected: boolean; disabled: boolean; onClick: () => void }) => {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        data-testid={`chip-${chip.value}`}
        className={cn(
          "relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-150",
          "shadow-lg",
          selected && "scale-110",
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && !selected && "hover:scale-105 hover:brightness-110"
        )}
      >
        <img 
          src={chip.image} 
          alt={chip.label} 
          className="w-full h-full object-contain"
          draggable={false}
        />
      </button>
    );
  };

  const ChipStack = ({ amount, small, bouncing }: { amount: number; small?: boolean; bouncing?: boolean }) => {
    if (amount <= 0) return null;
    const chipSize = small ? 44 : 56;
    
    // Break down amount into chips for stacking
    const getChipBreakdown = (amt: number): ChipConfig[] => {
      const chips: ChipConfig[] = [];
      let remaining = amt;
      const sortedChips = [...CHIP_CONFIGS].sort((a, b) => b.value - a.value);
      
      for (const chip of sortedChips) {
        while (remaining >= chip.value && chips.length < 5) {
          chips.push(chip);
          remaining = Math.round((remaining - chip.value) * 100) / 100;
        }
      }
      
      // If we couldn't break it down, just show one chip
      if (chips.length === 0 && amt > 0) {
        chips.push(CHIP_CONFIGS[0]);
      }
      
      return chips.slice(0, 5); // Max 5 chips in stack
    };
    
    const chipStack = getChipBreakdown(amount);
    
    return (
      <div className={cn(
        "absolute inset-0 flex items-center justify-center pointer-events-none z-10",
        bouncing && "animate-chip-drop"
      )}>
        <div className="relative" style={{ width: chipSize, height: chipSize + (chipStack.length - 1) * 6 }}>
          {chipStack.map((chip, i) => (
            <img 
              key={i}
              src={chip.image} 
              alt={chip.label}
              className="absolute drop-shadow-lg"
              style={{
                width: chipSize,
                height: chipSize,
                bottom: i * 6,
                left: 0,
                zIndex: i,
              }}
            />
          ))}
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
          
          <div className="flex items-center gap-2">
            <ProfitTrackerWidget gameId="roulette" />
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1a2530] rounded-full border border-[#2a3a4a]">
              <Shield className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] font-medium text-emerald-400">Fair Play</span>
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
        </div>
        
        <div className="flex flex-col items-center">
          
          <div className="relative mb-6">
            {isSpinning && (
              <div className="absolute -inset-3 rounded-full animate-wheel-glow pointer-events-none" />
            )}
            
            {/* Outer wooden rim */}
            <div 
              className="w-72 h-72 md:w-80 md:h-80 rounded-full relative"
              style={{
                background: "linear-gradient(135deg, #8B5A2B 0%, #D2691E 25%, #CD853F 50%, #A0522D 75%, #8B4513 100%)",
                boxShadow: "0 0 0 8px #654321, 0 0 0 12px #8B7355, inset 0 0 20px rgba(0,0,0,0.4), 0 10px 40px rgba(0,0,0,0.5)",
              }}
            >
              {/* Chrome ring accent */}
              <div 
                className="absolute inset-2 rounded-full"
                style={{
                  background: "linear-gradient(135deg, #C0C0C0 0%, #E8E8E8 30%, #A8A8A8 50%, #D8D8D8 70%, #B0B0B0 100%)",
                  boxShadow: "inset 0 2px 4px rgba(255,255,255,0.8), inset 0 -2px 4px rgba(0,0,0,0.3)",
                }}
              />
              
              {/* Spinning wheel section */}
              <div 
                className="absolute inset-3 rounded-full overflow-hidden"
                style={{
                  transform: `rotate(${wheelRotation}deg)`,
                  transition: isSpinning ? `transform ${SPIN_DURATION}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)` : "none",
                  background: "#1a1a1a",
                }}
              >
                {/* Number pockets */}
                {WHEEL_NUMBERS.map((num, i) => {
                  const angle = (i * 360) / WHEEL_NUMBERS.length;
                  const color = getNumberColor(num);
                  return (
                    <div
                      key={num}
                      className="absolute w-full h-full"
                      style={{ transform: `rotate(${angle}deg)` }}
                    >
                      {/* Pocket wedge */}
                      <div
                        className={cn(
                          "absolute top-0 left-1/2 -translate-x-1/2 w-7 h-[42%] origin-bottom"
                        )}
                        style={{ 
                          clipPath: "polygon(25% 0%, 75% 0%, 100% 100%, 0% 100%)",
                          background: color === "red" 
                            ? "linear-gradient(180deg, #DC2626 0%, #B91C1C 100%)" 
                            : color === "green" 
                              ? "linear-gradient(180deg, #059669 0%, #047857 100%)"
                              : "linear-gradient(180deg, #1F2937 0%, #111827 100%)",
                          boxShadow: "inset 0 0 2px rgba(0,0,0,0.5)",
                        }}
                      >
                        {/* Chrome divider */}
                        <div 
                          className="absolute top-0 left-0 w-[2px] h-full"
                          style={{
                            background: "linear-gradient(180deg, #D4AF37 0%, #B8860B 50%, #D4AF37 100%)",
                          }}
                        />
                        <span className="absolute top-3 left-1/2 -translate-x-1/2 text-white text-[9px] font-bold drop-shadow-sm">
                          {num}
                        </span>
                      </div>
                    </div>
                  );
                })}
                
                {/* Inner green felt ring */}
                <div 
                  className="absolute inset-[28%] rounded-full"
                  style={{
                    background: "linear-gradient(135deg, #166534 0%, #15803d 50%, #14532d 100%)",
                    boxShadow: "inset 0 2px 8px rgba(0,0,0,0.4), 0 0 0 3px #B8860B",
                  }}
                />
                
                {/* Center hub */}
                <div 
                  className="absolute inset-[38%] rounded-full flex items-center justify-center"
                  style={{
                    background: "linear-gradient(135deg, #D4AF37 0%, #FFD700 25%, #B8860B 50%, #DAA520 75%, #D4AF37 100%)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.4)",
                  }}
                >
                  {/* Decorative spokes */}
                  {[0, 72, 144, 216, 288].map((rot) => (
                    <div 
                      key={rot}
                      className="absolute w-1 h-[90%] rounded-full"
                      style={{
                        background: "linear-gradient(180deg, #8B7355 0%, #654321 50%, #8B7355 100%)",
                        transform: `rotate(${rot}deg)`,
                      }}
                    />
                  ))}
                  {/* Center jewel */}
                  <div 
                    className="w-6 h-6 rounded-full z-10"
                    style={{
                      background: "radial-gradient(circle at 30% 30%, #FFD700 0%, #B8860B 50%, #8B6914 100%)",
                      boxShadow: "inset 0 2px 4px rgba(255,255,255,0.6), 0 2px 8px rgba(0,0,0,0.4)",
                    }}
                  />
                </div>
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
            
            {winPopup.visible && (
              <div 
                className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none"
                data-testid="win-popup"
              >
                <div className="animate-scale-in">
                  <div className="relative px-10 py-6 rounded-2xl bg-gradient-to-br from-amber-500 via-yellow-400 to-amber-500 shadow-2xl border-4 border-amber-300"
                    style={{
                      boxShadow: "0 0 40px rgba(251, 191, 36, 0.7), 0 0 80px rgba(251, 191, 36, 0.4), 0 20px 60px rgba(0, 0, 0, 0.5)"
                    }}
                  >
                    <div className="text-center">
                      <div className="text-sm font-bold text-amber-900 uppercase tracking-widest mb-1">You Won!</div>
                      <div className="text-4xl font-black text-white drop-shadow-lg tracking-tight">
                        ${winPopup.amount.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Dev Overlay - Toggle to verify wheel alignment */}
          {showDevOverlay && devOverlay && (
            <div className="absolute -right-4 top-0 translate-x-full bg-slate-900/95 border border-slate-700 rounded-lg p-3 text-xs font-mono text-slate-300 z-50 min-w-[200px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-amber-400 font-bold">DEV OVERLAY</span>
                <button 
                  onClick={() => setShowDevOverlay(false)}
                  className="text-slate-500 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-1">
                <div>winningNumber: <span className="text-emerald-400">{devOverlay.winningNumber}</span></div>
                <div>winningIndex: <span className="text-emerald-400">{devOverlay.winningIndex}</span></div>
                <div>finalAngle: <span className="text-emerald-400">{devOverlay.finalAngle.toFixed(2)}°</span></div>
                <div>finalAngle % 360: <span className="text-emerald-400">{(devOverlay.finalAngle % 360).toFixed(2)}°</span></div>
                <div className="pt-1 border-t border-slate-700 mt-1">
                  <span className="text-slate-500">Pocket at pointer:</span>
                  <div className="text-lg text-amber-300 font-bold">
                    {/* Reverse the offset calculation to find which pocket is at 0° */}
                    {WHEEL_NUMBERS[Math.floor(((360 - ((devOverlay.finalAngle % 360) + 360) % 360) / (360 / WHEEL_NUMBERS.length) + 0.5) % WHEEL_NUMBERS.length)]}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {!showDevOverlay && devOverlay && (
            <button
              onClick={() => setShowDevOverlay(true)}
              className="absolute -right-2 top-2 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-400 hover:text-white z-50"
            >
              DEV
            </button>
          )}

          <div className="flex items-center gap-6 mb-4 text-sm">
            <div className="text-slate-400">
              Balance: <span className="text-white font-mono font-semibold">${user?.balance?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="text-slate-400">
              Bet: <span className="text-emerald-400 font-mono font-semibold">${totalPendingBet.toFixed(2)}</span>
            </div>
          </div>
        </div>
        
        <div className="bg-[#0d1419] border border-[#1a2530] rounded-2xl p-5 mt-2 max-w-3xl mx-auto">
          
          <div className={cn(
            "bg-[#0f4c3a] rounded-xl p-4 border-2 border-[#1a6b4f] shadow-inner transition-opacity",
            isSpinning && "opacity-60 pointer-events-none"
          )}>
            
            <div className="flex gap-1 mb-2">
              <button
                onClick={() => placeBet("straight", 0)}
                disabled={isSpinning}
                data-testid="button-number-0"
                className="relative w-10 min-h-[7.5rem] bg-emerald-600 hover:bg-emerald-500 border-2 border-emerald-400 rounded-lg flex items-center justify-center text-white font-bold text-base transition-all"
              >
                0
                <ChipStack amount={getBetAmount("straight", 0)} small bouncing={chipBounce === "straight-0"} />
              </button>
              
              <div className="flex-1 grid grid-rows-3 gap-1">
                {TABLE_ROWS.map((row, rowIdx) => (
                  <div key={rowIdx} className="grid grid-cols-12 gap-1">
                    {row.map((num) => {
                      const color = getNumberColor(num);
                      return (
                        <button
                          key={num}
                          onClick={() => placeBet("straight", num)}
                          disabled={isSpinning}
                          data-testid={`button-number-${num}`}
                          className={cn(
                            "relative h-9 flex items-center justify-center text-white font-bold text-xs transition-all border-2 rounded-sm",
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

              <div className="flex flex-col gap-1">
                {["col1", "col2", "col3"].map((col) => (
                  <button
                    key={col}
                    onClick={() => placeBet(col as BetType)}
                    disabled={isSpinning}
                    data-testid={`button-${col}`}
                    className="relative w-10 flex-1 bg-[#1a6b4f] hover:bg-[#228b5b] border-2 border-[#2a8b6f] rounded-sm flex items-center justify-center text-white font-bold text-[10px] transition-all"
                  >
                    2:1
                    <ChipStack amount={getBetAmount(col as BetType)} small bouncing={chipBounce === `${col}-none`} />
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-2">
              {[
                { type: "1st12" as BetType, label: "1st 12" },
                { type: "2nd12" as BetType, label: "2nd 12" },
                { type: "3rd12" as BetType, label: "3rd 12" },
              ].map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => placeBet(type)}
                  disabled={isSpinning}
                  data-testid={`button-${type}`}
                  className="relative h-10 bg-[#1a6b4f] hover:bg-[#228b5b] border-2 border-[#2a8b6f] rounded flex items-center justify-center text-white font-bold text-sm transition-all"
                >
                  {label}
                  <ChipStack amount={getBetAmount(type)} small bouncing={chipBounce === `${type}-none`} />
                </button>
              ))}
            </div>

            <div className="grid grid-cols-6 gap-2">
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
                    "relative h-10 border-2 rounded flex items-center justify-center text-white font-bold text-xs transition-all",
                    isRed ? "bg-red-600 hover:bg-red-500 border-red-400" :
                    isBlack ? "bg-slate-800 hover:bg-slate-700 border-slate-600" :
                    "bg-[#1a6b4f] hover:bg-[#228b5b] border-[#2a8b6f]"
                  )}
                >
                  {isRed && <div className="w-5 h-5 bg-red-500 rotate-45 border-2 border-red-300" />}
                  {isBlack && <div className="w-5 h-5 bg-slate-900 rotate-45 border-2 border-slate-600" />}
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
                onClick={handleRebet}
                disabled={lastBets.length === 0 || isSpinning}
                className="border-[#2a3a4a] text-slate-400 hover:text-white"
                data-testid="button-rebet"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Rebet
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleDouble}
                disabled={pendingBets.length === 0 || isSpinning}
                className="border-[#2a3a4a] text-slate-400 hover:text-white"
                data-testid="button-double"
              >
                2x
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
              {CHIP_CONFIGS.map((chip) => (
                <VegasChip
                  key={chip.value}
                  chip={chip}
                  selected={selectedChip === chip.value}
                  disabled={isSpinning}
                  onClick={() => setSelectedChip(chip.value)}
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
