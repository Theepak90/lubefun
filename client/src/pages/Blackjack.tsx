import { useState, useEffect, useCallback, useRef } from "react";
import { Layout } from "@/components/ui/Layout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Shield, RotateCcw, Trash2, Copy, Users, RefreshCw, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useGameHistory } from "@/hooks/use-game-history";
import { useProfitTracker, formatCurrency } from "@/hooks/use-profit-tracker";
import { ProfitTrackerWidget } from "@/components/ProfitTrackerWidget";
import { RecentResults } from "@/components/RecentResults";
import { LiveWins } from "@/components/LiveWins";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/hooks/use-sound";
import { motion, AnimatePresence } from "framer-motion";

interface BlackjackState {
  bet: any;
  playerCards: number[];
  dealerCards: number[];
  playerTotal: number;
  dealerTotal?: number;
  dealerShowing?: number;
  status: string;
  canDouble: boolean;
  outcome?: string;
  payout?: number;
}

interface HandBet {
  main: number;
  perfectPairs: number;
  twentyOnePlus3: number;
  mainChips: ChipValue[];
  ppChips: ChipValue[];
  plus3Chips: ChipValue[];
}

interface ChipValue {
  value: number;
  color: string;
  textColor: string;
  borderColor: string;
}

const CHIP_VALUES: ChipValue[] = [
  { value: 0.1, color: "bg-gray-400", textColor: "text-gray-800", borderColor: "border-gray-300" },
  { value: 0.5, color: "bg-red-500", textColor: "text-white", borderColor: "border-red-400" },
  { value: 1, color: "bg-blue-500", textColor: "text-white", borderColor: "border-blue-400" },
  { value: 5, color: "bg-green-500", textColor: "text-white", borderColor: "border-green-400" },
  { value: 10, color: "bg-purple-500", textColor: "text-white", borderColor: "border-purple-400" },
  { value: 25, color: "bg-amber-500", textColor: "text-black", borderColor: "border-amber-400" },
  { value: 100, color: "bg-slate-900", textColor: "text-white", borderColor: "border-slate-600" },
];

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function getCardRank(cardIndex: number): string {
  return RANKS[cardIndex % 13];
}

function getCardSuit(cardIndex: number): string {
  return SUITS[Math.floor(cardIndex / 13)];
}

function getCardValue(cardIndex: number): number {
  const rank = cardIndex % 13;
  if (rank === 0) return 11;
  if (rank >= 10) return 10;
  return rank + 1;
}

function calculateTotal(cards: number[]): number {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    const value = getCardValue(card);
    total += value;
    if (value === 11) aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

const CHIP_COLORS: Record<number, { bg: string; ring: string }> = {
  0.1: { bg: "#9ca3af", ring: "#6b7280" },
  0.5: { bg: "#ef4444", ring: "#b91c1c" },
  1: { bg: "#3b82f6", ring: "#1d4ed8" },
  5: { bg: "#22c55e", ring: "#15803d" },
  10: { bg: "#a855f7", ring: "#7c3aed" },
  25: { bg: "#f59e0b", ring: "#d97706" },
  100: { bg: "#1e293b", ring: "#475569" },
};

function Chip({ chip, selected, onClick, size = "md" }: { 
  chip: ChipValue; 
  selected?: boolean; 
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: { outer: 32, text: 8 },
    md: { outer: 48, text: 11 },
    lg: { outer: 64, text: 14 },
  };
  const s = sizes[size];
  const colors = CHIP_COLORS[chip.value] || { bg: "#6b7280", ring: "#4b5563" };

  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full flex items-center justify-center font-bold transition-all relative",
        selected && "ring-2 ring-white ring-offset-2 ring-offset-transparent scale-110",
        onClick && "hover:scale-105 active:scale-95 cursor-pointer"
      )}
      style={{
        width: s.outer,
        height: s.outer,
        background: `radial-gradient(circle at 30% 30%, ${colors.bg}dd, ${colors.bg})`,
        boxShadow: `0 2px 4px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.3), inset 0 0 0 3px ${colors.ring}`
      }}
      data-testid={`chip-${chip.value}`}
    >
      <div 
        className="absolute inset-1.5 rounded-full border-2 border-dashed opacity-30"
        style={{ borderColor: chip.textColor.includes('white') ? 'white' : 'black' }}
      />
      <span 
        className={cn("drop-shadow-md z-10 font-bold", chip.textColor)}
        style={{ fontSize: s.text }}
      >
        {chip.value >= 1 ? chip.value : `.${(chip.value * 10).toFixed(0)}`}
      </span>
    </button>
  );
}

// Horizontal chip fan layout - no vertical stacking
function ChipFan({ 
  chips, 
  total,
  maxChips = 6,
  chipSize = 24,
  onRemoveChip,
  showHoverTotal = false,
  isHovered = false,
}: { 
  chips: ChipValue[]; 
  total: number;
  maxChips?: number;
  chipSize?: number;
  onRemoveChip?: () => void;
  showHoverTotal?: boolean;
  isHovered?: boolean;
}) {
  if (chips.length === 0) return null;
  
  const displayChips = chips.slice(0, maxChips);
  const chipCount = displayChips.length;
  
  // Calculate horizontal fan offset - chips fan out horizontally
  const getChipOffset = (index: number) => {
    if (chipCount === 1) return 0;
    // Fan chips horizontally with slight offset
    const maxOffset = Math.min(chipCount - 1, 5) * 6; // Max spread
    const totalWidth = maxOffset;
    const step = chipCount > 1 ? totalWidth / (chipCount - 1) : 0;
    return -totalWidth / 2 + index * step;
  };
  
  return (
    <div 
      className="relative flex items-center justify-center"
      style={{ minHeight: chipSize + 4 }}
      onContextMenu={(e) => {
        e.preventDefault();
        onRemoveChip?.();
      }}
    >
      {displayChips.map((chip, i) => {
        const colors = CHIP_COLORS[chip.value] || { bg: "#6b7280", ring: "#4b5563" };
        const xOffset = getChipOffset(i);
        
        return (
          <motion.div
            key={`${chip.value}-${i}`}
            className="absolute rounded-full flex items-center justify-center font-bold shadow-md"
            style={{
              width: chipSize,
              height: chipSize,
              background: `radial-gradient(circle at 30% 30%, ${colors.bg}dd, ${colors.bg})`,
              boxShadow: `0 1px 3px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.25), inset 0 0 0 2px ${colors.ring}`,
              zIndex: i + 1,
              left: `calc(50% + ${xOffset}px - ${chipSize/2}px)`,
            }}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <div 
              className="absolute inset-0.5 rounded-full border border-dashed opacity-20"
              style={{ borderColor: chip.textColor.includes('white') ? 'white' : 'black' }}
            />
            <span 
              className={cn("drop-shadow-sm z-10 font-bold", chip.textColor)}
              style={{ fontSize: chipSize * 0.35 }}
            >
              {chip.value >= 1 ? chip.value : `.${(chip.value * 10).toFixed(0)}`}
            </span>
          </motion.div>
        );
      })}
      
      {/* Overflow indicator */}
      {chips.length > maxChips && (
        <div 
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-black text-[7px] font-bold flex items-center justify-center shadow-md z-20"
        >
          +{chips.length - maxChips}
        </div>
      )}
      
      {/* Hover total preview */}
      {showHoverTotal && isHovered && total > 0 && (
        <motion.div 
          className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap z-30"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.1 }}
        >
          <span className="text-[10px] font-mono font-bold text-white bg-slate-900/95 px-1.5 py-0.5 rounded shadow-lg border border-slate-700">
            ${total.toFixed(2)}
          </span>
        </motion.div>
      )}
    </div>
  );
}

// Simple chip display for backward compatibility - converts total to chip array
function ChipStack({ total, onClick, animate = false, showTotal = true }: { total: number; onClick?: () => void; animate?: boolean; showTotal?: boolean }) {
  if (total <= 0) return null;
  
  // Convert total to chip array
  const chips: ChipValue[] = [];
  let remaining = total;
  
  for (let i = CHIP_VALUES.length - 1; i >= 0; i--) {
    const chip = CHIP_VALUES[i];
    while (remaining >= chip.value - 0.001 && chips.length < 6) {
      chips.push(chip);
      remaining -= chip.value;
      remaining = Math.round(remaining * 100) / 100;
    }
  }
  
  if (chips.length === 0 && total > 0) {
    chips.push(CHIP_VALUES[0]);
  }
  
  return (
    <motion.div 
      className={cn("relative", onClick && "cursor-pointer")}
      onClick={onClick}
      initial={animate ? { y: -10, opacity: 0 } : false}
      animate={animate ? { y: 0, opacity: 1 } : false}
      transition={{ duration: 0.12, ease: "easeOut" }}
    >
      <ChipFan chips={chips} total={total} maxChips={4} chipSize={22} />
      {showTotal && (
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span className="text-[9px] font-mono font-bold text-white bg-slate-900/90 px-1.5 py-0.5 rounded shadow">
            ${total.toFixed(2)}
          </span>
        </div>
      )}
    </motion.div>
  );
}

function FairPlayModal({ user }: { user: any }) {
  const [newClientSeed, setNewClientSeed] = useState("");
  const [showServerSeed, setShowServerSeed] = useState(false);
  const { toast } = useToast();
  
  const serverSeedHash = user?.serverSeed 
    ? Array.from(new Uint8Array(32)).map(() => Math.floor(Math.random() * 16).toString(16)).join('').substring(0, 64)
    : "";
  
  const rotateSeedsMutation = useMutation({
    mutationFn: async (clientSeed: string) => {
      const res = await apiRequest("POST", "/api/seeds/rotate", { clientSeed });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({ title: "Seeds rotated", description: "Your new seeds are now active. Previous server seed is now visible for verification." });
      setNewClientSeed("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to rotate seeds", variant: "destructive" });
    },
  });

  const handleRotate = () => {
    if (!newClientSeed.trim()) {
      const randomSeed = Array.from(crypto.getRandomValues(new Uint8Array(12)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      rotateSeedsMutation.mutate(randomSeed);
    } else {
      rotateSeedsMutation.mutate(newClientSeed);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/20 rounded-full border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors">
          <Shield className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] font-medium text-emerald-400">Fair Play</span>
        </button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Shield className="w-5 h-5 text-emerald-400" />
            Provably Fair
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-slate-400">
            Every game outcome is determined by combining your client seed with our server seed and a unique nonce. 
            You can verify past results after rotating seeds.
          </p>
          
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-slate-500 uppercase">Server Seed Hash (Hidden)</Label>
              <div className="mt-1 p-2 bg-slate-800 rounded-md border border-slate-700">
                <code className="text-xs text-emerald-400 break-all font-mono">
                  {user?.serverSeed?.substring(0, 64) || "Login to view"}
                </code>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                The actual seed is hidden until you rotate. This hash lets you verify we don't change it.
              </p>
            </div>
            
            <div>
              <Label className="text-xs text-slate-500 uppercase">Your Client Seed</Label>
              <div className="mt-1 p-2 bg-slate-800 rounded-md border border-slate-700 flex items-center justify-between">
                <code className="text-xs text-amber-400 break-all font-mono">
                  {user?.clientSeed || "Login to view"}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() => {
                    navigator.clipboard.writeText(user?.clientSeed || "");
                    toast({ title: "Copied!", duration: 1000 });
                  }}
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>
            
            <div>
              <Label className="text-xs text-slate-500 uppercase">Current Nonce</Label>
              <div className="mt-1 p-2 bg-slate-800 rounded-md border border-slate-700">
                <code className="text-xs text-white font-mono">
                  {user?.nonce?.toLocaleString() || "0"}
                </code>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Increments with each bet. Used to ensure unique outcomes.
              </p>
            </div>
          </div>
          
          <div className="pt-2 border-t border-slate-700">
            <Label className="text-xs text-slate-500 uppercase">Rotate Seeds</Label>
            <p className="text-[10px] text-slate-400 mt-1 mb-2">
              Rotating reveals the old server seed for verification and generates a new one.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="New client seed (optional)"
                value={newClientSeed}
                onChange={(e) => setNewClientSeed(e.target.value)}
                className="bg-slate-800 border-slate-700 text-sm"
              />
              <Button
                onClick={handleRotate}
                disabled={rotateSeedsMutation.isPending}
                className="bg-emerald-500 hover:bg-emerald-400"
              >
                <RefreshCw className={cn("w-4 h-4", rotateSeedsMutation.isPending && "animate-spin")} />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlayingCard({ 
  cardIndex, 
  hidden = false,
  delay = 0,
  className = "",
  fromShoe = true
}: { 
  cardIndex: number; 
  hidden?: boolean;
  delay?: number;
  className?: string;
  fromShoe?: boolean;
}) {
  const cardVariants = {
    initial: fromShoe ? { 
      x: 300, 
      y: -200, 
      rotate: -15,
      scale: 0.8,
      opacity: 0 
    } : {
      opacity: 0,
      y: -20
    },
    animate: { 
      x: 0, 
      y: 0, 
      rotate: 0,
      scale: 1,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 150,
        damping: 18,
        delay,
        duration: 0.5
      }
    }
  };

  if (hidden) {
    return (
      <motion.div 
        className={cn("w-14 h-20 rounded-lg bg-gradient-to-br from-blue-700 to-blue-900 border-2 border-blue-500 flex items-center justify-center shadow-lg", className)}
        variants={cardVariants}
        initial="initial"
        animate="animate"
      >
        <div className="w-8 h-12 rounded border-2 border-blue-400/50 bg-blue-800/50 grid grid-cols-3 grid-rows-4 gap-px p-1">
          {Array(12).fill(0).map((_, i) => (
            <div key={i} className="bg-blue-400/30 rounded-sm" />
          ))}
        </div>
      </motion.div>
    );
  }

  const rank = getCardRank(cardIndex);
  const suit = getCardSuit(cardIndex);
  const isRed = suit === 'hearts' || suit === 'diamonds';
  
  const suitSymbol = {
    spades: '♠',
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣'
  }[suit];

  return (
    <motion.div 
      className={cn(
        "w-14 h-20 rounded-lg bg-white border border-slate-200 flex flex-col items-center justify-center shadow-lg relative",
        className
      )}
      variants={cardVariants}
      initial="initial"
      animate="animate"
    >
      <div className="absolute top-1 left-1.5 flex flex-col items-center leading-none">
        <span className={cn("text-[10px] font-bold", isRed ? "text-red-500" : "text-slate-800")}>{rank}</span>
        <span className={cn("text-[10px]", isRed ? "text-red-500" : "text-slate-800")}>{suitSymbol}</span>
      </div>
      <span className={cn("text-xl font-bold", isRed ? "text-red-500" : "text-slate-800")}>{rank}</span>
      <span className={cn("text-base", isRed ? "text-red-500" : "text-slate-800")}>{suitSymbol}</span>
    </motion.div>
  );
}

// Custom hook for long press detection (mobile chip removal)
function useLongPress(callback: () => void, delay = 500) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggeredRef = useRef(false);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  
  const start = useCallback(() => {
    longPressTriggeredRef.current = false;
    timeoutRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      callbackRef.current();
    }, delay);
  }, [delay]);
  
  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);
  
  const shouldPreventClick = useCallback(() => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return true;
    }
    return false;
  }, []);
  
  return {
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchMove: clear,
    shouldPreventClick,
  };
}

function SeatWithBets({ 
  seatIndex,
  position,
  isSelected,
  onSelect,
  cards,
  total,
  isActive,
  outcome,
  mainBet,
  ppBet,
  plus3Bet,
  mainChips,
  ppChips,
  plus3Chips,
  onPlaceMainBet,
  onPlacePPBet,
  onPlacePlus3Bet,
  onRemoveMainChip,
  onRemovePPChip,
  onRemovePlus3Chip,
  isPlaying,
}: {
  seatIndex: number;
  position: number;
  isSelected: boolean;
  onSelect: () => void;
  cards?: number[];
  total?: number;
  isActive?: boolean;
  outcome?: string;
  mainBet: number;
  ppBet: number;
  plus3Bet: number;
  mainChips: ChipValue[];
  ppChips: ChipValue[];
  plus3Chips: ChipValue[];
  onPlaceMainBet: () => void;
  onPlacePPBet: () => void;
  onPlacePlus3Bet: () => void;
  onRemoveMainChip: () => void;
  onRemovePPChip: () => void;
  onRemovePlus3Chip: () => void;
  isPlaying: boolean;
}) {
  const [hoveredZone, setHoveredZone] = useState<'main' | 'pp' | '21+3' | null>(null);
  
  // Long press handlers for mobile chip removal (with click prevention)
  const mainLongPress = useLongPress(() => {
    if (isSelected && mainChips.length > 0 && !isPlaying) onRemoveMainChip();
  });
  const ppLongPress = useLongPress(() => {
    if (ppChips.length > 0 && !isPlaying) onRemovePPChip();
  });
  const plus3LongPress = useLongPress(() => {
    if (plus3Chips.length > 0 && !isPlaying) onRemovePlus3Chip();
  });
  
  const handleMainClick = () => {
    if (mainLongPress.shouldPreventClick()) return;
    if (!isSelected) {
      onSelect();
    } else {
      // When seat is selected, always place a chip - no auto-deselect
      onPlaceMainBet();
    }
  };
  
  const handlePPClick = () => {
    if (ppLongPress.shouldPreventClick()) return;
    onPlacePPBet();
  };
  
  const handlePlus3Click = () => {
    if (plus3LongPress.shouldPreventClick()) return;
    onPlacePlus3Bet();
  };
  
  const centerPos = 4.5;
  const angle = (position - centerPos) * 16;
  const radius = 85;
  const x = Math.sin(angle * Math.PI / 180) * radius;
  const y = Math.cos(angle * Math.PI / 180) * 12;

  return (
    <div
      className="absolute flex flex-col items-center"
      style={{
        left: `calc(50% + ${x}%)`,
        bottom: `${5 + y}%`,
        transform: 'translateX(-50%)'
      }}
    >
      {cards && cards.length > 0 && (
        <motion.div 
          className={cn(
            "absolute -top-24 left-1/2 -translate-x-1/2 flex rounded-lg",
            outcome === "blackjack" && "shadow-[0_0_25px_rgba(251,191,36,0.7)]",
            outcome === "win" && "shadow-[0_0_25px_rgba(34,197,94,0.6)]",
            outcome === "lose" && "shadow-[0_0_20px_rgba(239,68,68,0.5)]"
          )}
          animate={outcome ? { scale: [1, 1.03, 1] } : {}}
          transition={{ duration: 0.4 }}
        >
          {cards.map((card, i) => (
            <PlayingCard 
              key={i} 
              cardIndex={card} 
              delay={i * 0.2}
              className={cn(i > 0 && "-ml-10")}
            />
          ))}
        </motion.div>
      )}
      
      {total !== undefined && cards && cards.length > 0 && (
        <div className={cn(
          "absolute -top-6 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full text-xs font-bold shadow-lg",
          total > 21 ? "bg-red-500 text-white" :
          total === 21 ? "bg-emerald-500 text-white" :
          "bg-slate-900/95 text-white border border-slate-700"
        )}>
          {total}
        </div>
      )}

      <div className="flex items-end gap-2 mb-2">
        {/* PP Side Bet - Always visible */}
        {isSelected && (
          <button
            onClick={handlePPClick}
            onContextMenu={(e) => {
              e.preventDefault();
              onRemovePPChip();
            }}
            onTouchStart={ppLongPress.onTouchStart}
            onTouchEnd={ppLongPress.onTouchEnd}
            onTouchMove={ppLongPress.onTouchMove}
            onMouseEnter={() => setHoveredZone('pp')}
            onMouseLeave={() => setHoveredZone(null)}
            disabled={isPlaying}
            className={cn(
              "w-12 h-12 rounded-full border-2 flex flex-col items-center justify-center transition-all relative",
              ppBet > 0 
                ? "border-purple-400 bg-purple-500/20 shadow-[0_0_12px_rgba(168,85,247,0.4)]" 
                : "border-white/25 bg-slate-900/30 hover:border-purple-400/60 hover:bg-purple-500/10",
              isPlaying && "opacity-50 cursor-not-allowed"
            )}
            data-testid={`seat-${seatIndex}-pp`}
          >
            {ppChips.length > 0 ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <ChipFan 
                  chips={ppChips} 
                  total={ppBet} 
                  maxChips={3} 
                  chipSize={18}
                  showHoverTotal
                  isHovered={hoveredZone === 'pp'}
                />
              </div>
            ) : (
              <span className="text-[9px] text-purple-300/70 font-bold tracking-wide">PP</span>
            )}
          </button>
        )}
        
        {/* Main Bet Zone */}
        <button
          onClick={handleMainClick}
          onContextMenu={(e) => {
            e.preventDefault();
            if (isSelected) onRemoveMainChip();
          }}
          onTouchStart={mainLongPress.onTouchStart}
          onTouchEnd={mainLongPress.onTouchEnd}
          onTouchMove={mainLongPress.onTouchMove}
          onMouseEnter={() => setHoveredZone('main')}
          onMouseLeave={() => setHoveredZone(null)}
          disabled={isPlaying && !isSelected}
          className={cn(
            "w-20 h-12 rounded-[50%] border-2 flex items-center justify-center transition-all relative",
            isSelected 
              ? mainBet > 0
                ? "border-amber-400 bg-amber-400/15 shadow-[0_0_18px_rgba(251,191,36,0.4)]"
                : "border-white/70 bg-white/10 shadow-[0_0_12px_rgba(255,255,255,0.2)]" 
              : "border-white/25 bg-transparent hover:border-white/50 hover:bg-white/5 cursor-pointer",
            isActive && "border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.5)] animate-pulse"
          )}
          data-testid={`seat-${seatIndex}`}
        >
          {mainChips.length > 0 ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <ChipFan 
                chips={mainChips} 
                total={mainBet} 
                maxChips={5} 
                chipSize={20}
                showHoverTotal
                isHovered={hoveredZone === 'main'}
              />
            </div>
          ) : (
            <span className="text-[9px] text-white/50 font-medium">
              {isSelected ? "BET" : "SIT"}
            </span>
          )}
        </button>
        
        {/* 21+3 Side Bet - Always visible */}
        {isSelected && (
          <button
            onClick={handlePlus3Click}
            onContextMenu={(e) => {
              e.preventDefault();
              onRemovePlus3Chip();
            }}
            onTouchStart={plus3LongPress.onTouchStart}
            onTouchEnd={plus3LongPress.onTouchEnd}
            onTouchMove={plus3LongPress.onTouchMove}
            onMouseEnter={() => setHoveredZone('21+3')}
            onMouseLeave={() => setHoveredZone(null)}
            disabled={isPlaying}
            className={cn(
              "w-12 h-12 rounded-full border-2 flex flex-col items-center justify-center transition-all relative",
              plus3Bet > 0 
                ? "border-cyan-400 bg-cyan-500/20 shadow-[0_0_12px_rgba(34,211,238,0.4)]" 
                : "border-white/25 bg-slate-900/30 hover:border-cyan-400/60 hover:bg-cyan-500/10",
              isPlaying && "opacity-50 cursor-not-allowed"
            )}
            data-testid={`seat-${seatIndex}-21plus3`}
          >
            {plus3Chips.length > 0 ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <ChipFan 
                  chips={plus3Chips} 
                  total={plus3Bet} 
                  maxChips={3} 
                  chipSize={18}
                  showHoverTotal
                  isHovered={hoveredZone === '21+3'}
                />
              </div>
            ) : (
              <span className="text-[8px] text-cyan-300/70 font-bold tracking-wide">21+3</span>
            )}
          </button>
        )}
      </div>
      
      <div className="flex items-center gap-1">
        <span className={cn(
          "text-[9px] font-medium",
          isSelected ? "text-white" : "text-white/30"
        )}>
          {isSelected ? "You" : ""}
        </span>
        {/* Leave seat button - only shows when seated but no chips */}
        {isSelected && mainChips.length === 0 && ppChips.length === 0 && plus3Chips.length === 0 && !isPlaying && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className="text-[8px] text-white/40 hover:text-white/80 transition-colors ml-1"
            title="Leave seat"
            data-testid={`seat-${seatIndex}-leave`}
          >
            (leave)
          </button>
        )}
      </div>

      {(mainBet > 0 || ppBet > 0 || plus3Bet > 0) && !isPlaying && (
        <span className="text-[10px] font-mono text-amber-400 mt-0.5">
          ${(mainBet + ppBet + plus3Bet).toFixed(2)}
        </span>
      )}

      {outcome && (
        <motion.div 
          className={cn(
            "mt-1 px-3 py-1 rounded text-xs font-bold uppercase shadow-lg",
            outcome === "blackjack" ? "bg-gradient-to-r from-amber-400 to-amber-500 text-black" :
            outcome === "win" ? "bg-gradient-to-r from-emerald-400 to-emerald-500 text-white" :
            outcome === "push" ? "bg-gradient-to-r from-slate-400 to-slate-500 text-white" :
            "bg-gradient-to-r from-red-400 to-red-500 text-white"
          )}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400 }}
        >
          {outcome === "blackjack" ? "BLACKJACK!" : outcome.toUpperCase()}
        </motion.div>
      )}
    </div>
  );
}

function BetSpot({
  bet,
  label,
  onClick,
  disabled,
  small = false,
}: {
  bet: number;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-1 transition-all",
        !disabled && "hover:scale-105 cursor-pointer",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      data-testid={`bet-spot-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className={cn(
        "rounded-full border-2 border-dashed flex items-center justify-center",
        small ? "w-10 h-10 border-slate-500/50" : "w-14 h-14 border-amber-400/50",
        bet > 0 ? "border-solid border-amber-400" : ""
      )}>
        {bet > 0 ? (
          <ChipStack total={bet} animate />
        ) : (
          <span className={cn(
            "text-[8px] font-medium text-center px-1",
            small ? "text-slate-500" : "text-amber-400/70"
          )}>
            {label}
          </span>
        )}
      </div>
      {!small && bet > 0 && (
        <span className="text-[10px] font-mono text-amber-400">${bet.toFixed(2)}</span>
      )}
    </button>
  );
}

export default function Blackjack() {
  const { user } = useAuth();
  const { results, addResult, clearHistory } = useGameHistory();
  const { recordResult } = useProfitTracker();
  const { toast } = useToast();
  const { play: playSound } = useSound();
  
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
  const [selectedChip, setSelectedChip] = useState<ChipValue>(CHIP_VALUES[2]);
  const [seatBets, setSeatBets] = useState<Record<number, HandBet>>({});
  const [lastSeatBets, setLastSeatBets] = useState<Record<number, HandBet>>({});
  
  const emptyBet = (): HandBet => ({ 
    main: 0, perfectPairs: 0, twentyOnePlus3: 0, 
    mainChips: [], ppChips: [], plus3Chips: [] 
  });
  const [gameState, setGameState] = useState<BlackjackState | null>(null);
  const [activeSeatIndex, setActiveSeatIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const totalBet = Object.values(seatBets).reduce((sum, h) => 
    sum + h.main + h.perfectPairs + h.twentyOnePlus3, 0
  );
  
  const isPlaying = gameState?.status === "playing";
  const isCompleted = gameState?.status === "completed";

  useEffect(() => {
    const checkMobile = () => {
      const newIsMobile = window.innerWidth < 768;
      setIsMobile(newIsMobile);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!isPlaying && selectedSeats.length > 0) {
      const maxSeat = isMobile ? 7 : 10;
      const validSeats = selectedSeats.filter(s => s < maxSeat);
      if (validSeats.length !== selectedSeats.length) {
        setSelectedSeats(validSeats);
      }
    }
  }, [isMobile, isPlaying, selectedSeats]);

  const seatCount = isMobile ? 7 : 10;
  const seatPositions = isMobile 
    ? [0, 1, 2, 3, 4, 5, 6] 
    : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  const { data: activeHand, isLoading } = useQuery<BlackjackState | null>({
    queryKey: ["/api/games/blackjack/active"],
    enabled: !!user,
  });

  useEffect(() => {
    if (activeHand && activeHand.bet) {
      setGameState(activeHand);
      if (selectedSeats.length === 0) {
        setSelectedSeats([4]);
      }
    }
  }, [activeHand]);

  const addChipToBet = (seatIndex: number, betType: 'main' | 'perfectPairs' | 'twentyOnePlus3') => {
    if (isPlaying) return;
    
    const currentBet = seatBets[seatIndex] || emptyBet();
    const newTotal = totalBet + selectedChip.value;
    
    if (newTotal > (user?.balance || 0)) {
      setError("Insufficient balance");
      setTimeout(() => setError(null), 2000);
      return;
    }
    
    playSound("chipDrop");
    
    const chipArrayKey = betType === 'main' ? 'mainChips' : betType === 'perfectPairs' ? 'ppChips' : 'plus3Chips';
    
    setSeatBets(prev => ({
      ...prev,
      [seatIndex]: {
        ...currentBet,
        [betType]: Math.round((currentBet[betType] + selectedChip.value) * 100) / 100,
        [chipArrayKey]: [...currentBet[chipArrayKey], selectedChip]
      }
    }));
    setError(null);
  };

  const removeChipFromBet = (seatIndex: number, betType: 'main' | 'perfectPairs' | 'twentyOnePlus3') => {
    if (isPlaying) return;
    
    const currentBet = seatBets[seatIndex];
    if (!currentBet) return;
    
    const chipArrayKey = betType === 'main' ? 'mainChips' : betType === 'perfectPairs' ? 'ppChips' : 'plus3Chips';
    const chips = currentBet[chipArrayKey];
    
    if (chips.length === 0) return;
    
    const removedChip = chips[chips.length - 1];
    const newChips = chips.slice(0, -1);
    const newTotal = Math.round((currentBet[betType] - removedChip.value) * 100) / 100;
    
    playSound("chipDrop");
    
    setSeatBets(prev => ({
      ...prev,
      [seatIndex]: {
        ...currentBet,
        [betType]: Math.max(0, newTotal),
        [chipArrayKey]: newChips
      }
    }));
  };

  const undoLastBet = () => {
    const seatKeys = Object.keys(seatBets).map(Number).reverse();
    for (const seatIdx of seatKeys) {
      const bet = seatBets[seatIdx];
      if (bet.plus3Chips.length > 0) {
        removeChipFromBet(seatIdx, 'twentyOnePlus3');
        return;
      }
      if (bet.ppChips.length > 0) {
        removeChipFromBet(seatIdx, 'perfectPairs');
        return;
      }
      if (bet.mainChips.length > 0) {
        removeChipFromBet(seatIdx, 'main');
        return;
      }
    }
  };

  const clearBets = () => {
    setSeatBets({});
    setError(null);
  };

  const repeatBet = () => {
    if (Object.keys(lastSeatBets).length === 0) return;
    const repeatTotal = Object.values(lastSeatBets).reduce((sum, h) => 
      sum + h.main + h.perfectPairs + h.twentyOnePlus3, 0
    );
    if (repeatTotal > (user?.balance || 0)) {
      setError("Insufficient balance for repeat bet");
      setTimeout(() => setError(null), 2000);
      return;
    }
    // Deep copy to avoid mutation issues
    const copiedBets: Record<number, HandBet> = {};
    for (const [key, bet] of Object.entries(lastSeatBets)) {
      copiedBets[Number(key)] = {
        main: bet.main,
        perfectPairs: bet.perfectPairs,
        twentyOnePlus3: bet.twentyOnePlus3,
        mainChips: [...bet.mainChips],
        ppChips: [...bet.ppChips],
        plus3Chips: [...bet.plus3Chips],
      };
    }
    setSeatBets(copiedBets);
    setSelectedSeats(Object.keys(lastSeatBets).map(Number));
  };

  const doubleBet = () => {
    const doubled: Record<number, HandBet> = {};
    for (const [key, h] of Object.entries(seatBets)) {
      doubled[Number(key)] = {
        main: h.main * 2,
        perfectPairs: h.perfectPairs * 2,
        twentyOnePlus3: h.twentyOnePlus3 * 2,
        mainChips: [...h.mainChips, ...h.mainChips],
        ppChips: [...h.ppChips, ...h.ppChips],
        plus3Chips: [...h.plus3Chips, ...h.plus3Chips],
      };
    }
    const doubleTotal = Object.values(doubled).reduce((sum, h) => 
      sum + h.main + h.perfectPairs + h.twentyOnePlus3, 0
    );
    if (doubleTotal > (user?.balance || 0)) {
      setError("Insufficient balance to double");
      setTimeout(() => setError(null), 2000);
      return;
    }
    setSeatBets(doubled);
  };

  const dealMutation = useMutation({
    mutationFn: async (betAmount: number) => {
      const res = await apiRequest("POST", "/api/games/blackjack/deal", { betAmount });
      return res.json() as Promise<BlackjackState>;
    },
    onSuccess: (data) => {
      // Deep copy seatBets for repeat functionality
      const copiedBets: Record<number, HandBet> = {};
      for (const [key, bet] of Object.entries(seatBets)) {
        copiedBets[Number(key)] = {
          main: bet.main,
          perfectPairs: bet.perfectPairs,
          twentyOnePlus3: bet.twentyOnePlus3,
          mainChips: [...bet.mainChips],
          ppChips: [...bet.ppChips],
          plus3Chips: [...bet.plus3Chips],
        };
      }
      setLastSeatBets(copiedBets);
      setGameState(data);
      setActiveSeatIndex(selectedSeats[0] ?? null);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      
      // Play card deal sounds with delays
      setTimeout(() => playSound("cardDeal"), 100);
      setTimeout(() => playSound("cardDeal"), 300);
      setTimeout(() => playSound("cardDeal"), 500);
      setTimeout(() => playSound("cardDeal"), 700);
      
      if (data.status === "completed" && data.outcome) {
        handleGameComplete(data);
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to deal", variant: "destructive" });
    },
  });

  const hitMutation = useMutation({
    mutationFn: async (betId: number) => {
      const res = await apiRequest("POST", "/api/games/blackjack/hit", { betId });
      return res.json() as Promise<BlackjackState>;
    },
    onSuccess: (data) => {
      playSound("cardDeal");
      setGameState(data);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      
      if (data.status === "completed" && data.outcome) {
        handleGameComplete(data);
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to hit", variant: "destructive" });
    },
  });

  const standMutation = useMutation({
    mutationFn: async (betId: number) => {
      const res = await apiRequest("POST", "/api/games/blackjack/stand", { betId });
      return res.json() as Promise<BlackjackState>;
    },
    onSuccess: (data) => {
      setGameState(data);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      handleGameComplete(data);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to stand", variant: "destructive" });
    },
  });

  const doubleMutation = useMutation({
    mutationFn: async (betId: number) => {
      const res = await apiRequest("POST", "/api/games/blackjack/double", { betId });
      return res.json() as Promise<BlackjackState>;
    },
    onSuccess: (data) => {
      setGameState(data);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      handleGameComplete(data);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to double", variant: "destructive" });
    },
  });

  const handleGameComplete = (data: BlackjackState) => {
    const outcomeLabel = data.outcome === "blackjack" ? "Blackjack!" :
                         data.outcome === "win" ? "Win" :
                         data.outcome === "push" ? "Push" : "Lose";
    
    const activeBet = activeSeatIndex !== null ? seatBets[activeSeatIndex] : null;
    const betAmount = data.bet?.betAmount || activeBet?.main || 0;
    const profit = data.bet?.profit || 0;
    const won = data.outcome === "win" || data.outcome === "blackjack";
    const isPush = data.outcome === "push";
    const payout = won ? betAmount + profit : (isPush ? betAmount : 0);
    
    // Play win/lose sound
    setTimeout(() => {
      if (won) {
        playSound("win");
      } else if (!isPush) {
        playSound("lose");
      }
    }, 500);
    
    if (!isPush) {
      recordResult("blackjack", betAmount, payout, won);
    }
    
    if (isPush) {
      toast({
        description: `Push - Bet returned ${formatCurrency(betAmount)}`,
        duration: 1000,
      });
    } else {
      toast({
        description: won 
          ? `You won ${formatCurrency(payout)} (profit ${formatCurrency(profit)})`
          : `You lost ${formatCurrency(betAmount)} (profit ${formatCurrency(-betAmount)})`,
        duration: 1000,
      });
    }
    
    addResult({
      game: "blackjack",
      betAmount,
      won,
      profit,
      detail: `${outcomeLabel} - Player ${data.playerTotal} vs Dealer ${data.dealerTotal}`,
    });
  };

  const handleDeal = () => {
    // Sum all main bets from selected seats
    const totalMainBet = Object.values(seatBets).reduce((sum, b) => sum + b.main, 0);
    if (totalMainBet < 0.1 || totalMainBet > (user?.balance || 0)) return;
    dealMutation.mutate(totalMainBet);
  };

  const handleHit = () => {
    if (!gameState?.bet?.id) {
      toast({ title: "Error", description: "No active hand found", variant: "destructive" });
      return;
    }
    hitMutation.mutate(gameState.bet.id);
  };

  const handleStand = () => {
    if (!gameState?.bet?.id) {
      toast({ title: "Error", description: "No active hand found", variant: "destructive" });
      return;
    }
    standMutation.mutate(gameState.bet.id);
  };

  const handleDouble = () => {
    if (!gameState?.bet?.id) {
      toast({ title: "Error", description: "No active hand found", variant: "destructive" });
      return;
    }
    doubleMutation.mutate(gameState.bet.id);
  };

  const handleNewHand = () => {
    setGameState(null);
    clearBets();
    queryClient.invalidateQueries({ queryKey: ["/api/games/blackjack/active"] });
  };

  const handleSitDown = (seatIndex: number) => {
    if (selectedSeats.includes(seatIndex)) {
      // Deselect if clicking on already selected seat (only if no chips placed)
      const seatBet = seatBets[seatIndex];
      const hasChips = seatBet && (
        seatBet.mainChips.length > 0 || 
        seatBet.ppChips.length > 0 || 
        seatBet.plus3Chips.length > 0
      );
      if (!hasChips) {
        setSelectedSeats(prev => prev.filter(s => s !== seatIndex));
        setSeatBets(prev => {
          const newBets = { ...prev };
          delete newBets[seatIndex];
          return newBets;
        });
      }
      return;
    }
    setSelectedSeats(prev => [...prev, seatIndex].sort((a, b) => a - b));
  };

  const isBusy = dealMutation.isPending || hitMutation.isPending || standMutation.isPending || doubleMutation.isPending;

  const playerTotal = gameState?.playerCards ? calculateTotal(gameState.playerCards) : 0;
  const dealerTotal = gameState?.dealerTotal || (gameState?.dealerCards ? calculateTotal(gameState.dealerCards) : 0);

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
        <div className="max-w-6xl mx-auto px-4 py-4">
          
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">Live Blackjack</h1>
              <FairPlayModal user={user} />
            </div>
            <ProfitTrackerWidget gameId="blackjack" />
          </div>

          <div className="relative rounded-3xl overflow-x-auto shadow-2xl">
            <div 
              className="relative h-[500px] min-w-[600px] md:min-w-0"
              style={{
                background: "radial-gradient(ellipse 120% 100% at 50% 0%, #1a2a3c 0%, #0f1a2a 50%, #0a1219 100%)"
              }}
            >
              <div 
                className="absolute inset-x-0 bottom-0 h-[85%]"
                style={{
                  background: "linear-gradient(to top, #0d2840 0%, #123352 50%, #1a4065 100%)",
                  clipPath: "ellipse(85% 100% at 50% 100%)",
                }}
              />
              
              <div 
                className="absolute inset-x-0 bottom-0 h-[85%] pointer-events-none"
                style={{
                  clipPath: "ellipse(85% 100% at 50% 100%)",
                  boxShadow: "inset 0 0 0 10px #b8963c, inset 0 0 0 14px #a0843a, inset 0 0 30px rgba(0,0,0,0.6)",
                }}
              />
              
              <div 
                className="absolute inset-x-[14px] bottom-0 h-[calc(85%-14px)]"
                style={{
                  background: "linear-gradient(180deg, #1a4065 0%, #123352 100%)",
                  clipPath: "ellipse(85% 100% at 50% 100%)",
                }}
              >
                <div className="absolute inset-0 opacity-10"
                  style={{
                    backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.5' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
                  }}
                />
              </div>
              
              <div className="absolute top-3 right-8 flex items-center gap-2 z-10">
                <div className="relative">
                  <div className="w-10 h-14 bg-gradient-to-b from-red-600 to-red-800 rounded-sm border-2 border-red-500 shadow-lg flex items-center justify-center">
                    <div className="absolute inset-1 rounded-sm bg-red-700/50 flex items-center justify-center">
                      <div className="w-6 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-sm border border-white/30" />
                    </div>
                  </div>
                  <span className="text-[8px] text-slate-400 text-center block mt-1">SHOE</span>
                </div>
              </div>

              <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center z-10">
                <div className="w-20 h-20 rounded-full bg-gradient-to-b from-slate-600 to-slate-800 border-4 border-slate-500 flex items-center justify-center mb-2 shadow-xl">
                  <Users className="w-8 h-8 text-slate-300" />
                </div>
                <span className="text-xs font-medium text-slate-300 uppercase tracking-wider">Dealer</span>
                
                {gameState && gameState.dealerCards && gameState.dealerCards.length > 0 && (
                  <div className="flex gap-1 mt-3">
                    {isCompleted ? (
                      gameState.dealerCards.map((card, i) => (
                        <PlayingCard key={i} cardIndex={card} delay={i * 0.1} />
                      ))
                    ) : (
                      <>
                        <PlayingCard cardIndex={0} hidden delay={0} />
                        {gameState.dealerCards.map((card, i) => (
                          <PlayingCard key={i} cardIndex={card} delay={(i + 1) * 0.1} />
                        ))}
                      </>
                    )}
                  </div>
                )}
                {gameState && gameState.dealerCards && gameState.dealerCards.length > 0 && (
                  <div className="mt-2 px-3 py-1 bg-slate-800/80 rounded-full">
                    <span className="text-sm font-mono font-bold text-white">
                      {isCompleted ? dealerTotal : `${gameState.dealerShowing || getCardValue(gameState.dealerCards[0])}`}
                    </span>
                  </div>
                )}
              </div>

              <div className="absolute inset-0">
                {seatPositions.map((pos, idx) => {
                  const isSelected = selectedSeats.includes(idx);
                  const bet = seatBets[idx] || emptyBet();
                  const isActiveSeat = activeSeatIndex === idx;
                  return (
                    <SeatWithBets
                      key={idx}
                      seatIndex={idx}
                      position={pos}
                      isSelected={isSelected}
                      onSelect={() => !isPlaying && handleSitDown(idx)}
                      cards={isActiveSeat && gameState?.playerCards ? gameState.playerCards : undefined}
                      total={isActiveSeat && gameState?.playerCards ? playerTotal : undefined}
                      isActive={isActiveSeat && isPlaying}
                      outcome={isActiveSeat && isCompleted ? gameState?.outcome : undefined}
                      mainBet={bet.main}
                      ppBet={bet.perfectPairs}
                      plus3Bet={bet.twentyOnePlus3}
                      mainChips={bet.mainChips}
                      ppChips={bet.ppChips}
                      plus3Chips={bet.plus3Chips}
                      onPlaceMainBet={() => addChipToBet(idx, 'main')}
                      onPlacePPBet={() => addChipToBet(idx, 'perfectPairs')}
                      onPlacePlus3Bet={() => addChipToBet(idx, 'twentyOnePlus3')}
                      onRemoveMainChip={() => removeChipFromBet(idx, 'main')}
                      onRemovePPChip={() => removeChipFromBet(idx, 'perfectPairs')}
                      onRemovePlus3Chip={() => removeChipFromBet(idx, 'twentyOnePlus3')}
                      isPlaying={isPlaying || isCompleted}
                    />
                  );
                })}
              </div>

              {error && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                  <div className="px-4 py-2 bg-red-500/90 rounded-lg text-white text-sm font-medium animate-pulse">
                    {error}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-900/95 border-t border-slate-700 p-4 min-h-[80px]">
              <div className="flex items-center justify-between gap-4 h-full">
                
                <AnimatePresence mode="wait">
                  {!isPlaying && !isCompleted && (
                    <motion.div 
                      key="betting"
                      className="flex items-center justify-between gap-4 w-full"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {CHIP_VALUES.map((chip) => (
                          <Chip
                            key={chip.value}
                            chip={chip}
                            selected={selectedChip.value === chip.value}
                            onClick={() => setSelectedChip(chip)}
                            size="sm"
                          />
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={undoLastBet}
                          disabled={totalBet === 0}
                          className="border-slate-600 text-slate-300"
                          data-testid="button-undo"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={clearBets}
                          disabled={totalBet === 0}
                          className="border-slate-600 text-slate-300"
                          data-testid="button-clear"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={repeatBet}
                          disabled={Object.keys(lastSeatBets).length === 0}
                          className="border-slate-600 text-slate-300"
                          data-testid="button-repeat"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={doubleBet}
                          disabled={totalBet === 0}
                          className="border-slate-600 text-slate-300"
                          data-testid="button-double-bet"
                        >
                          2x
                        </Button>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[10px] text-slate-500 uppercase">Total Bet</div>
                          <div className="text-lg font-mono font-bold text-amber-400">${totalBet.toFixed(2)}</div>
                        </div>
                        <Button
                          size="lg"
                          className="h-12 px-8 bg-emerald-500 hover:bg-emerald-400 font-bold"
                          onClick={handleDeal}
                          disabled={!user || selectedSeats.length === 0 || totalBet < 0.1 || totalBet > (user?.balance || 0) || isBusy}
                          data-testid="button-deal"
                        >
                          {isBusy ? "Dealing..." : selectedSeats.length === 0 ? "Sit Down First" : totalBet === 0 ? "Place Bet" : "Deal"}
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {isPlaying && (
                    <motion.div 
                      key="playing"
                      className="flex items-center justify-center gap-4 w-full"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Button
                        size="lg"
                        className="h-12 px-8 bg-amber-500 hover:bg-amber-400 font-bold"
                        onClick={handleHit}
                        disabled={isBusy}
                        data-testid="button-hit"
                      >
                        Hit
                      </Button>
                      <Button
                        size="lg"
                        className="h-12 px-8 bg-slate-600 hover:bg-slate-500 font-bold"
                        onClick={handleStand}
                        disabled={isBusy}
                        data-testid="button-stand"
                      >
                        Stand
                      </Button>
                      {gameState?.canDouble && (
                        <Button
                          size="lg"
                          variant="outline"
                          className="h-12 px-8 border-slate-500 text-white font-bold"
                          onClick={handleDouble}
                          disabled={isBusy || (user?.balance || 0) < (activeSeatIndex !== null ? (seatBets[activeSeatIndex]?.main || 0) : 0)}
                          data-testid="button-double"
                        >
                          Double
                        </Button>
                      )}
                    </motion.div>
                  )}

                  {isCompleted && (
                    <motion.div 
                      key="completed"
                      className="flex items-center justify-center gap-4 w-full"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className={cn(
                        "px-6 py-2 rounded-lg font-bold text-lg",
                        gameState?.outcome === "blackjack" ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" :
                        gameState?.outcome === "win" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" :
                        gameState?.outcome === "push" ? "bg-slate-500/20 text-slate-300 border border-slate-500/40" :
                        "bg-red-500/20 text-red-400 border border-red-500/40"
                      )}>
                        {gameState?.outcome === "blackjack" ? "BLACKJACK!" :
                         gameState?.outcome === "win" ? "YOU WIN!" :
                         gameState?.outcome === "push" ? "PUSH" : "DEALER WINS"}
                      </div>
                      <Button
                        size="lg"
                        className="h-12 px-8 bg-emerald-500 hover:bg-emerald-400 font-bold"
                        onClick={handleNewHand}
                        data-testid="button-new-hand"
                      >
                        New Hand
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <RecentResults 
              results={results} 
              onClear={clearHistory}
              filterGame="blackjack"
            />
            <LiveWins />
          </div>
        </div>
      </div>
    </Layout>
  );
}
