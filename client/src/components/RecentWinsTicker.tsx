import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Zap, Trophy, Dice1, Target, Layers, Spade, CircleDot } from "lucide-react";

interface WinEvent {
  id: string;
  username: string;
  amount: number;
  formattedAmount: string;
  game: GameConfig;
  badge?: "WIN" | "HOT" | "MEGA";
  timestamp: number;
}

interface GameConfig {
  id: string;
  name: string;
  icon: typeof Dice1;
  color: string;
  minWin: number;
  maxWin: number;
  bigWinThreshold: number;
}

interface RecentWinsTickerProps {
  speed?: number;
  intervalMin?: number;
  intervalMax?: number;
  maxItems?: number;
}

const GAMES: GameConfig[] = [
  { id: "dice", name: "Dice", icon: Dice1, color: "#3b82f6", minWin: 0.5, maxWin: 25, bigWinThreshold: 15 },
  { id: "mines", name: "Mines", icon: Target, color: "#f59e0b", minWin: 1, maxWin: 100, bigWinThreshold: 50 },
  { id: "coinflip", name: "Cock or Balls", icon: CircleDot, color: "#10b981", minWin: 1, maxWin: 50, bigWinThreshold: 30 },
  { id: "roulette", name: "Roulette", icon: CircleDot, color: "#ef4444", minWin: 2, maxWin: 150, bigWinThreshold: 75 },
  { id: "plinko", name: "Plinko", icon: Layers, color: "#8b5cf6", minWin: 0.1, maxWin: 500, bigWinThreshold: 100 },
  { id: "blackjack", name: "Blackjack", icon: Spade, color: "#06b6d4", minWin: 5, maxWin: 200, bigWinThreshold: 100 },
];

const NAME_PARTS = [
  "brad", "luna", "max", "kai", "nova", "zane", "milo", "aria", "leo", "jade",
  "rex", "sky", "ace", "neo", "ivy", "cruz", "ash", "finn", "sage", "jax",
  "mason", "xKairo", "tyler", "crypto", "lucky", "diamond", "gold", "shadow",
  "wolf", "eagle", "phoenix", "storm", "blaze", "frost", "viper", "hawk"
];

const SUFFIXES = ["22", "88", "_7", "_dev", "99", "X", "_pro", "777", "001", "", "42", "_og"];

let lastUsername = "";

function generateUsername(): string {
  let username = "";
  do {
    const part = NAME_PARTS[Math.floor(Math.random() * NAME_PARTS.length)];
    const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
    const addNumber = Math.random() > 0.5 && !suffix;
    username = part + suffix + (addNumber ? Math.floor(Math.random() * 99) : "");
  } while (username === lastUsername);
  lastUsername = username;
  return username;
}

function generateWinAmount(game: GameConfig): number {
  const roll = Math.random();
  const range = game.maxWin - game.minWin;
  
  if (roll < 0.70) {
    return game.minWin + Math.random() * (range * 0.15);
  } else if (roll < 0.90) {
    return game.minWin + range * 0.15 + Math.random() * (range * 0.35);
  } else if (roll < 0.98) {
    return game.minWin + range * 0.50 + Math.random() * (range * 0.30);
  } else {
    return game.minWin + range * 0.80 + Math.random() * (range * 0.20);
  }
}

function formatAmount(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}k`;
  }
  return `$${amount.toFixed(2)}`;
}

function generateWin(): WinEvent {
  const game = GAMES[Math.floor(Math.random() * GAMES.length)];
  const amount = generateWinAmount(game);
  
  let badge: WinEvent["badge"] = undefined;
  if (amount >= game.bigWinThreshold * 2) {
    badge = "MEGA";
  } else if (amount >= game.bigWinThreshold) {
    badge = "HOT";
  } else if (Math.random() < 0.15) {
    badge = "WIN";
  }

  return {
    id: crypto.randomUUID(),
    username: generateUsername(),
    amount,
    formattedAmount: formatAmount(amount),
    game,
    badge,
    timestamp: Date.now()
  };
}

export function RecentWinsTicker({
  speed = 30,
  intervalMin = 2000,
  intervalMax = 6000,
  maxItems = 20
}: RecentWinsTickerProps) {
  const [wins, setWins] = useState<WinEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const offsetRef = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const prefersReducedMotion = typeof window !== 'undefined' 
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
    : false;

  useEffect(() => {
    const initial: WinEvent[] = [];
    for (let i = 0; i < 10; i++) {
      initial.push(generateWin());
    }
    setWins(initial);

    const scheduleNext = () => {
      const delay = intervalMin + Math.random() * (intervalMax - intervalMin);
      timeoutRef.current = setTimeout(() => {
        setWins(prev => {
          const newWins = [...prev, generateWin()];
          return newWins.slice(-maxItems);
        });
        scheduleNext();
      }, delay);
    };

    scheduleNext();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [intervalMin, intervalMax, maxItems]);

  const animate = useCallback(() => {
    if (isPaused || prefersReducedMotion) {
      animationRef.current = requestAnimationFrame(animate);
      return;
    }

    offsetRef.current += speed / 60;
    
    if (scrollRef.current) {
      scrollRef.current.style.transform = `translateX(-${offsetRef.current}px)`;
      
      const firstChild = scrollRef.current.firstElementChild as HTMLElement;
      if (firstChild && offsetRef.current > firstChild.offsetWidth + 16) {
        offsetRef.current -= firstChild.offsetWidth + 16;
        setWins(prev => prev.slice(1));
      }
    }

    animationRef.current = requestAnimationFrame(animate);
  }, [isPaused, speed, prefersReducedMotion]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animate]);

  const getBadgeStyles = (badge: WinEvent["badge"]) => {
    switch (badge) {
      case "MEGA":
        return "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30";
      case "HOT":
        return "bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-lg shadow-red-500/30";
      case "WIN":
        return "bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-lg shadow-emerald-500/30";
      default:
        return "";
    }
  };

  const getBadgeIcon = (badge: WinEvent["badge"]) => {
    switch (badge) {
      case "MEGA":
        return <Trophy className="w-2.5 h-2.5" />;
      case "HOT":
        return <Flame className="w-2.5 h-2.5" />;
      case "WIN":
        return <Zap className="w-2.5 h-2.5" />;
      default:
        return null;
    }
  };

  return (
    <div 
      className="w-full overflow-hidden bg-gradient-to-r from-[#0a1015] via-[#0d1419] to-[#0a1015] border-y border-[#1a2530] py-3"
      data-testid="container-recent-wins"
    >
      <div className="flex items-center gap-3 px-4 mb-2">
        <div className="flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Recent Wins</span>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-[#1a2530] via-[#2a3a4a] to-[#1a2530]" />
        <span className="text-[10px] text-slate-600 italic">Demo</span>
      </div>

      <div 
        ref={containerRef}
        className="relative"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#0a1015] to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#0a1015] to-transparent z-10 pointer-events-none" />
        
        <div 
          ref={scrollRef}
          className="flex gap-4 px-4"
          style={{ willChange: 'transform' }}
        >
          <AnimatePresence initial={false}>
            {wins.map((win) => {
              const GameIcon = win.game.icon;
              return (
                <motion.div
                  key={win.id}
                  initial={{ opacity: 0, scale: 0.8, x: 50 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.3 }}
                  className="flex-shrink-0 group"
                  data-testid={`card-win-${win.id}`}
                >
                  <div 
                    className="relative flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#0f1923]/90 backdrop-blur-sm border border-[#1e2a36] transition-all duration-200 hover:border-[#3a4a5a] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30"
                    style={{ 
                      boxShadow: win.badge === "MEGA" ? `0 0 20px ${win.game.color}30` : undefined 
                    }}
                  >
                    {win.badge && (
                      <div className={`absolute -top-1.5 -right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold ${getBadgeStyles(win.badge)}`}>
                        {getBadgeIcon(win.badge)}
                        <span>{win.badge}</span>
                      </div>
                    )}

                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105"
                      style={{ backgroundColor: `${win.game.color}20` }}
                    >
                      <GameIcon className="w-5 h-5" style={{ color: win.game.color }} />
                    </div>

                    <div className="flex flex-col min-w-[80px]">
                      <span className="text-[10px] text-slate-500 truncate max-w-[80px]">{win.game.name}</span>
                      <span className="text-xs font-medium text-slate-300 truncate max-w-[80px]">{win.username}</span>
                    </div>

                    <div className="flex flex-col items-end">
                      <span className="text-sm font-bold text-emerald-400">{win.formattedAmount}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
