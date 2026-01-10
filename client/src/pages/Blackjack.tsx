import { useState, useEffect, useCallback, useRef } from "react";
import { Layout } from "@/components/ui/Layout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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

function Chip({ chip, selected, onClick, size = "md" }: { 
  chip: ChipValue; 
  selected?: boolean; 
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "w-8 h-8 text-[8px]",
    md: "w-12 h-12 text-xs",
    lg: "w-16 h-16 text-sm",
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full flex items-center justify-center font-bold border-4 shadow-lg transition-all",
        sizeClasses[size],
        chip.color,
        chip.textColor,
        chip.borderColor,
        selected && "ring-2 ring-white ring-offset-2 ring-offset-transparent scale-110",
        onClick && "hover:scale-105 active:scale-95 cursor-pointer"
      )}
      data-testid={`chip-${chip.value}`}
    >
      {chip.value >= 1 ? chip.value : chip.value.toFixed(1)}
    </button>
  );
}

function ChipStack({ total, onClick, animate = false }: { total: number; onClick?: () => void; animate?: boolean }) {
  if (total <= 0) return null;
  
  const chips: ChipValue[] = [];
  let remaining = total;
  
  for (let i = CHIP_VALUES.length - 1; i >= 0; i--) {
    const chip = CHIP_VALUES[i];
    while (remaining >= chip.value - 0.001) {
      chips.push(chip);
      remaining -= chip.value;
      remaining = Math.round(remaining * 100) / 100;
    }
  }
  
  const displayChips = chips.slice(0, 5);
  
  return (
    <motion.div 
      className={cn("relative flex flex-col-reverse items-center", onClick && "cursor-pointer")}
      onClick={onClick}
      initial={animate ? { y: -20, opacity: 0 } : false}
      animate={animate ? { y: 0, opacity: 1 } : false}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
    >
      {displayChips.map((chip, i) => (
        <motion.div
          key={i}
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-[8px] font-bold border-2 shadow-md",
            chip.color,
            chip.textColor,
            chip.borderColor,
            i > 0 && "-mt-5"
          )}
          initial={animate ? { scale: 0.8 } : false}
          animate={animate ? { scale: 1 } : false}
          transition={{ delay: i * 0.05, type: "spring", stiffness: 500 }}
        >
          {i === displayChips.length - 1 && (
            <span className="drop-shadow-md">${total.toFixed(2)}</span>
          )}
        </motion.div>
      ))}
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
  className = ""
}: { 
  cardIndex: number; 
  hidden?: boolean;
  delay?: number;
  className?: string;
}) {
  const cardVariants = {
    initial: { 
      x: 200, 
      y: -100, 
      rotateY: 180,
      opacity: 0 
    },
    animate: { 
      x: 0, 
      y: 0, 
      rotateY: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 200,
        damping: 20,
        delay
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

function Seat({ 
  index, 
  isOccupied, 
  isPlayer, 
  username,
  onClick,
  cards,
  total,
  isActive,
  outcome,
}: {
  index: number;
  isOccupied: boolean;
  isPlayer: boolean;
  username?: string;
  onClick?: () => void;
  cards?: number[];
  total?: number;
  isActive?: boolean;
  outcome?: string;
}) {
  const angle = (index - 3) * 22;
  const radius = 85;
  const x = Math.sin(angle * Math.PI / 180) * radius;
  const y = Math.cos(angle * Math.PI / 180) * 20;

  return (
    <div
      className="absolute flex flex-col items-center"
      style={{
        left: `calc(50% + ${x}%)`,
        bottom: `${10 + y}%`,
        transform: 'translateX(-50%)'
      }}
    >
      {cards && cards.length > 0 && (
        <motion.div 
          className={cn(
            "relative flex gap-1 mb-2 -ml-4 rounded-lg p-1",
            outcome === "blackjack" && "shadow-[0_0_20px_rgba(251,191,36,0.6)]",
            outcome === "win" && "shadow-[0_0_20px_rgba(34,197,94,0.5)]",
            outcome === "lose" && total && total > 21 && "shadow-[0_0_15px_rgba(239,68,68,0.5)]"
          )}
          animate={outcome ? { 
            scale: [1, 1.02, 1],
          } : {}}
          transition={{ duration: 0.3 }}
        >
          {cards.map((card, i) => (
            <PlayingCard 
              key={i} 
              cardIndex={card} 
              delay={i * 0.15}
              className={cn(i > 0 && "-ml-6")}
            />
          ))}
          {total !== undefined && (
            <div className={cn(
              "absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-xs font-bold",
              total > 21 ? "bg-red-500 text-white" :
              total === 21 ? "bg-emerald-500 text-white" :
              "bg-slate-800 text-white"
            )}>
              {total}
            </div>
          )}
        </motion.div>
      )}
      
      <button
        onClick={onClick}
        disabled={isOccupied && !isPlayer}
        className={cn(
          "w-16 h-16 rounded-full border-2 flex items-center justify-center transition-all",
          isPlayer 
            ? "border-emerald-400 bg-emerald-500/20 ring-2 ring-emerald-400/50" 
            : isOccupied 
              ? "border-slate-500 bg-slate-600/30 cursor-not-allowed"
              : "border-amber-400/50 bg-transparent hover:border-amber-400 hover:bg-amber-500/10 cursor-pointer",
          isActive && "ring-4 ring-amber-400 animate-pulse"
        )}
        data-testid={`seat-${index}`}
      >
        {isPlayer && <Users className="w-6 h-6 text-emerald-400" />}
        {isOccupied && !isPlayer && <Users className="w-5 h-5 text-slate-500" />}
      </button>
      
      <span className={cn(
        "text-[10px] mt-1 font-medium",
        isPlayer ? "text-emerald-400" : isOccupied ? "text-slate-500" : "text-amber-400/70"
      )}>
        {isPlayer ? "You" : isOccupied ? username || "Player" : "Empty"}
      </span>

      {outcome && (
        <div className={cn(
          "mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase",
          outcome === "blackjack" ? "bg-amber-500 text-black" :
          outcome === "win" ? "bg-emerald-500 text-white" :
          outcome === "push" ? "bg-slate-500 text-white" :
          "bg-red-500 text-white"
        )}>
          {outcome === "blackjack" ? "BJ!" : outcome}
        </div>
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
  
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [selectedChip, setSelectedChip] = useState<ChipValue>(CHIP_VALUES[2]);
  const [multiHand, setMultiHand] = useState(false);
  const [activeHandCount, setActiveHandCount] = useState(1);
  const [sideBetsEnabled, setSideBetsEnabled] = useState({ perfectPairs: false, twentyOnePlus3: false });
  const [handBets, setHandBets] = useState<HandBet[]>([
    { main: 0, perfectPairs: 0, twentyOnePlus3: 0 },
    { main: 0, perfectPairs: 0, twentyOnePlus3: 0 },
    { main: 0, perfectPairs: 0, twentyOnePlus3: 0 },
  ]);
  const [lastBets, setLastBets] = useState<HandBet[]>([]);
  const [gameState, setGameState] = useState<BlackjackState | null>(null);
  const [activeHandIndex, setActiveHandIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const totalBet = handBets.slice(0, activeHandCount).reduce((sum, h) => 
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
    if (!isPlaying && selectedSeat !== null) {
      const seatCount = isMobile ? 5 : 7;
      if (selectedSeat >= seatCount) {
        setSelectedSeat(Math.floor(seatCount / 2));
      }
    }
  }, [isMobile, isPlaying, selectedSeat]);

  const seatCount = isMobile ? 5 : 7;
  const seatPositions = isMobile 
    ? [0, 1.5, 3, 4.5, 6] 
    : [0, 1, 2, 3, 4, 5, 6];

  const { data: activeHand, isLoading } = useQuery<BlackjackState | null>({
    queryKey: ["/api/games/blackjack/active"],
    enabled: !!user,
  });

  useEffect(() => {
    if (activeHand && activeHand.bet) {
      setGameState(activeHand);
      setSelectedSeat(3);
    }
  }, [activeHand]);

  const addChipToBet = (handIndex: number, betType: keyof HandBet) => {
    if (isPlaying) return;
    
    const newBets = [...handBets];
    const newTotal = totalBet + selectedChip.value;
    
    if (newTotal > (user?.balance || 0)) {
      setError("Insufficient balance");
      setTimeout(() => setError(null), 2000);
      return;
    }
    
    playSound("chipDrop");
    
    newBets[handIndex] = {
      ...newBets[handIndex],
      [betType]: Math.round((newBets[handIndex][betType] + selectedChip.value) * 100) / 100
    };
    setHandBets(newBets);
    setError(null);
  };

  const undoLastBet = () => {
    const newBets = [...handBets];
    for (let i = activeHandCount - 1; i >= 0; i--) {
      if (newBets[i].twentyOnePlus3 > 0) {
        newBets[i].twentyOnePlus3 = 0;
        setHandBets(newBets);
        return;
      }
      if (newBets[i].perfectPairs > 0) {
        newBets[i].perfectPairs = 0;
        setHandBets(newBets);
        return;
      }
      if (newBets[i].main > 0) {
        newBets[i].main = 0;
        setHandBets(newBets);
        return;
      }
    }
  };

  const clearBets = () => {
    setHandBets([
      { main: 0, perfectPairs: 0, twentyOnePlus3: 0 },
      { main: 0, perfectPairs: 0, twentyOnePlus3: 0 },
      { main: 0, perfectPairs: 0, twentyOnePlus3: 0 },
    ]);
    setError(null);
  };

  const repeatBet = () => {
    if (lastBets.length === 0) return;
    const repeatTotal = lastBets.slice(0, activeHandCount).reduce((sum, h) => 
      sum + h.main + h.perfectPairs + h.twentyOnePlus3, 0
    );
    if (repeatTotal > (user?.balance || 0)) {
      setError("Insufficient balance for repeat bet");
      setTimeout(() => setError(null), 2000);
      return;
    }
    setHandBets([...lastBets]);
  };

  const doubleBet = () => {
    const doubled = handBets.map(h => ({
      main: h.main * 2,
      perfectPairs: h.perfectPairs * 2,
      twentyOnePlus3: h.twentyOnePlus3 * 2,
    }));
    const doubleTotal = doubled.slice(0, activeHandCount).reduce((sum, h) => 
      sum + h.main + h.perfectPairs + h.twentyOnePlus3, 0
    );
    if (doubleTotal > (user?.balance || 0)) {
      setError("Insufficient balance to double");
      setTimeout(() => setError(null), 2000);
      return;
    }
    setHandBets(doubled);
  };

  const dealMutation = useMutation({
    mutationFn: async (betAmount: number) => {
      const res = await apiRequest("POST", "/api/games/blackjack/deal", { betAmount });
      return res.json() as Promise<BlackjackState>;
    },
    onSuccess: (data) => {
      setLastBets([...handBets]);
      setGameState(data);
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
    
    const betAmount = data.bet?.betAmount || handBets[0].main;
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
    const mainBet = handBets[0].main;
    if (mainBet < 0.1 || mainBet > (user?.balance || 0)) return;
    dealMutation.mutate(mainBet);
  };

  const handleHit = () => {
    if (!gameState?.bet?.id) return;
    hitMutation.mutate(gameState.bet.id);
  };

  const handleStand = () => {
    if (!gameState?.bet?.id) return;
    standMutation.mutate(gameState.bet.id);
  };

  const handleDouble = () => {
    if (!gameState?.bet?.id) return;
    doubleMutation.mutate(gameState.bet.id);
  };

  const handleNewHand = () => {
    setGameState(null);
    clearBets();
    queryClient.invalidateQueries({ queryKey: ["/api/games/blackjack/active"] });
  };

  const handleSitDown = (seatIndex: number) => {
    if (selectedSeat === seatIndex) return;
    setSelectedSeat(seatIndex);
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
                background: "radial-gradient(ellipse 120% 100% at 50% 0%, #1a3a5c 0%, #0f2a42 50%, #0a1929 100%)"
              }}
            >
              <div 
                className="absolute inset-x-0 bottom-0 h-[85%]"
                style={{
                  background: "linear-gradient(to top, #1a4a2e 0%, #1a5533 50%, #1a6038 100%)",
                  clipPath: "ellipse(85% 100% at 50% 100%)",
                  border: "8px solid #8b7355",
                  borderBottom: "none",
                }}
              />
              
              <div 
                className="absolute inset-x-[8px] bottom-0 h-[calc(85%-8px)]"
                style={{
                  background: "linear-gradient(180deg, #1a5533 0%, #145229 100%)",
                  clipPath: "ellipse(85% 100% at 50% 100%)",
                }}
              >
                <div className="absolute inset-0 opacity-20"
                  style={{
                    backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
                  }}
                />
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
                {seatPositions.map((pos, idx) => (
                  <Seat
                    key={idx}
                    index={pos}
                    isOccupied={selectedSeat === idx}
                    isPlayer={selectedSeat === idx}
                    onClick={() => !isPlaying && handleSitDown(idx)}
                    cards={selectedSeat === idx && gameState?.playerCards ? gameState.playerCards : undefined}
                    total={selectedSeat === idx && gameState?.playerCards ? playerTotal : undefined}
                    isActive={selectedSeat === idx && isPlaying}
                    outcome={selectedSeat === idx && isCompleted ? gameState?.outcome : undefined}
                  />
                ))}
              </div>

              {selectedSeat !== null && !isPlaying && !isCompleted && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-8 items-end">
                  {Array.from({ length: activeHandCount }).map((_, handIdx) => (
                    <div key={handIdx} className="flex flex-col items-center gap-2">
                      {multiHand && (
                        <span className="text-[10px] text-amber-400/80 font-medium bg-slate-900/60 px-2 py-0.5 rounded">
                          Hand {handIdx + 1}
                        </span>
                      )}
                      <div className="flex gap-2 items-end">
                        {sideBetsEnabled.perfectPairs && (
                          <BetSpot
                            bet={handBets[handIdx].perfectPairs}
                            label="PP"
                            onClick={() => addChipToBet(handIdx, 'perfectPairs')}
                            small
                          />
                        )}
                        <BetSpot
                          bet={handBets[handIdx].main}
                          label={multiHand ? `H${handIdx + 1}` : "BET"}
                          onClick={() => addChipToBet(handIdx, 'main')}
                        />
                        {sideBetsEnabled.twentyOnePlus3 && (
                          <BetSpot
                            bet={handBets[handIdx].twentyOnePlus3}
                            label="21+3"
                            onClick={() => addChipToBet(handIdx, 'twentyOnePlus3')}
                            small
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                  <div className="px-4 py-2 bg-red-500/90 rounded-lg text-white text-sm font-medium animate-pulse">
                    {error}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-900/95 border-t border-slate-700 p-4">
              <div className="flex items-center justify-between gap-4">
                
                {!isPlaying && !isCompleted && (
                  <>
                    <div className="flex items-center gap-2">
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
                        disabled={lastBets.length === 0}
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

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="multihand"
                          checked={multiHand}
                          onCheckedChange={(v) => {
                            setMultiHand(v);
                            setActiveHandCount(v ? 3 : 1);
                            if (!v) {
                              setHandBets(prev => [prev[0], { main: 0, perfectPairs: 0, twentyOnePlus3: 0 }, { main: 0, perfectPairs: 0, twentyOnePlus3: 0 }]);
                            }
                          }}
                        />
                        <Label htmlFor="multihand" className="text-xs text-slate-400">Multi</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          id="pp"
                          checked={sideBetsEnabled.perfectPairs}
                          onCheckedChange={(v) => {
                            setSideBetsEnabled(s => ({ ...s, perfectPairs: v }));
                            if (!v) {
                              setHandBets(prev => prev.map(h => ({ ...h, perfectPairs: 0 })));
                            }
                          }}
                        />
                        <Label htmlFor="pp" className="text-xs text-slate-400">PP</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          id="21p3"
                          checked={sideBetsEnabled.twentyOnePlus3}
                          onCheckedChange={(v) => {
                            setSideBetsEnabled(s => ({ ...s, twentyOnePlus3: v }));
                            if (!v) {
                              setHandBets(prev => prev.map(h => ({ ...h, twentyOnePlus3: 0 })));
                            }
                          }}
                        />
                        <Label htmlFor="21p3" className="text-xs text-slate-400">21+3</Label>
                      </div>
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
                        disabled={!user || selectedSeat === null || handBets.slice(0, activeHandCount).every(h => h.main < 0.1) || totalBet > (user?.balance || 0) || isBusy}
                        data-testid="button-deal"
                      >
                        {isBusy ? "Dealing..." : selectedSeat === null ? "Sit Down First" : totalBet === 0 ? "Place Bet" : "Deal"}
                      </Button>
                    </div>
                  </>
                )}

                {isPlaying && (
                  <div className="flex items-center justify-center gap-4 w-full">
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
                        disabled={isBusy || (user?.balance || 0) < handBets[0].main}
                        data-testid="button-double"
                      >
                        Double
                      </Button>
                    )}
                  </div>
                )}

                {isCompleted && (
                  <div className="flex items-center justify-center gap-4 w-full">
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
                  </div>
                )}
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
