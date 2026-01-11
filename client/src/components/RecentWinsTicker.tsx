import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Zap, Trophy } from "lucide-react";

import diceImg from "@assets/ChatGPT_Image_Jan_11,_2026,_02_04_41_AM_1768097091093.png";
import coinflipImg from "@assets/ChatGPT_Image_Jan_11,_2026,_04_18_24_AM_1768106559756.png";
import blackjackImg from "@assets/ChatGPT_Image_Jan_11,_2026,_04_29_05_AM_1768106559757.png";
import plinkoImg from "@assets/ChatGPT_Image_Jan_11,_2026,_04_32_20_AM_1768106559758.png";
import rouletteImg from "@assets/Glowing_roulette_card_with_blue_liquid_1768106559758.png";
import minesImg from "@assets/Glowing_mines_with_vibrant_splash_1768096070720.png";

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
  image: string;
  color: string;
  minWin: number;
  maxWin: number;
  bigWinThreshold: number;
}

interface RecentWinsTickerProps {
  intervalMin?: number;
  intervalMax?: number;
  maxItems?: number;
}

const GAMES: GameConfig[] = [
  { id: "dice", name: "Dice", image: diceImg, color: "#3b82f6", minWin: 0.5, maxWin: 25, bigWinThreshold: 15 },
  { id: "mines", name: "Mines", image: minesImg, color: "#f59e0b", minWin: 1, maxWin: 100, bigWinThreshold: 50 },
  { id: "coinflip", name: "Cock or Balls", image: coinflipImg, color: "#10b981", minWin: 1, maxWin: 50, bigWinThreshold: 30 },
  { id: "roulette", name: "Roulette", image: rouletteImg, color: "#ef4444", minWin: 2, maxWin: 150, bigWinThreshold: 75 },
  { id: "plinko", name: "Plinko", image: plinkoImg, color: "#8b5cf6", minWin: 0.1, maxWin: 500, bigWinThreshold: 100 },
  { id: "blackjack", name: "Blackjack", image: blackjackImg, color: "#06b6d4", minWin: 5, maxWin: 200, bigWinThreshold: 100 },
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
  intervalMin = 2000,
  intervalMax = 6000,
  maxItems = 15
}: RecentWinsTickerProps) {
  const [wins, setWins] = useState<WinEvent[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const initial: WinEvent[] = [];
    for (let i = 0; i < 8; i++) {
      initial.push(generateWin());
    }
    setWins(initial);

    const scheduleNext = () => {
      const delay = intervalMin + Math.random() * (intervalMax - intervalMin);
      timeoutRef.current = setTimeout(() => {
        setWins(prev => {
          const newWins = [generateWin(), ...prev];
          return newWins.slice(0, maxItems);
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
      <div className="flex items-center gap-3 px-4 mb-3">
        <div className="flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Recent Wins</span>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-[#1a2530] via-[#2a3a4a] to-[#1a2530]" />
        <span className="text-[10px] text-slate-600 italic">Demo</span>
      </div>

      <div className="relative px-4">
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#0a1015] to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#0a1015] to-transparent z-10 pointer-events-none" />
        
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <AnimatePresence initial={false}>
            {wins.map((win) => (
              <motion.div
                key={win.id}
                initial={{ opacity: 0, scale: 0.8, x: -20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.3 }}
                className="flex-shrink-0 group"
                data-testid={`card-win-${win.id}`}
              >
                <div 
                  className="relative flex items-center gap-3 px-3 py-2 rounded-xl bg-[#0f1923]/90 backdrop-blur-sm border border-[#1e2a36] transition-all duration-200 hover:border-[#3a4a5a] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30"
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

                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                    <img 
                      src={win.game.image} 
                      alt={win.game.name}
                      className="w-full h-full object-cover scale-150"
                    />
                  </div>

                  <div className="flex flex-col min-w-[70px]">
                    <span className="text-[10px] text-slate-500 truncate">{win.game.name}</span>
                    <span className="text-xs font-medium text-slate-300 truncate">{win.username}</span>
                  </div>

                  <div className="flex flex-col items-end pl-2">
                    <span className="text-sm font-bold text-emerald-400">{win.formattedAmount}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
