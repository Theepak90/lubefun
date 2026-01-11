import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gem } from "lucide-react";

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
  timestamp: number;
}

interface GameConfig {
  id: string;
  name: string;
  image: string;
  minWin: number;
  maxWin: number;
}

interface RecentWinsTickerProps {
  intervalMin?: number;
  intervalMax?: number;
  maxItems?: number;
}

const GAMES: GameConfig[] = [
  { id: "dice", name: "DICE", image: diceImg, minWin: 0.5, maxWin: 25 },
  { id: "mines", name: "MINES", image: minesImg, minWin: 1, maxWin: 100 },
  { id: "coinflip", name: "COCK OR BALLS", image: coinflipImg, minWin: 1, maxWin: 50 },
  { id: "roulette", name: "ROULETTE", image: rouletteImg, minWin: 2, maxWin: 150 },
  { id: "plinko", name: "PLINKO", image: plinkoImg, minWin: 0.1, maxWin: 500 },
  { id: "blackjack", name: "BLACKJACK", image: blackjackImg, minWin: 5, maxWin: 200 },
];

const NAME_PARTS = [
  "Chee", "scat", "real", "bles", "Bkap", "Jera", "jm14", "Asap", "Salt", "finn",
  "brad", "luna", "max", "kai", "nova", "zane", "milo", "aria", "leo", "jade",
  "rex", "sky", "ace", "neo", "ivy", "cruz", "Base", "wolf", "hawk", "viper"
];

const SUFFIXES = ["...", "22", "88", "_7", "99", "X", "777", "", "42"];

let lastUsername = "";

function generateUsername(): string {
  let username = "";
  do {
    const part = NAME_PARTS[Math.floor(Math.random() * NAME_PARTS.length)];
    const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
    username = part + suffix;
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
    return `$${(amount / 1000).toFixed(2)}k`;
  }
  return `$${amount.toFixed(2)}`;
}

function generateWin(): WinEvent {
  const game = GAMES[Math.floor(Math.random() * GAMES.length)];
  const amount = generateWinAmount(game);

  return {
    id: crypto.randomUUID(),
    username: generateUsername(),
    amount,
    formattedAmount: formatAmount(amount),
    game,
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
    for (let i = 0; i < 12; i++) {
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

  return (
    <div 
      className="w-full py-5"
      data-testid="container-recent-wins"
    >
      <div className="flex items-center gap-2 px-5 mb-5">
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-base font-bold text-white">Recent Wins</span>
      </div>

      <div className="relative">
        <div className="flex gap-4 overflow-x-auto px-5 pb-3" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <style>{`.scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
          <AnimatePresence initial={false}>
            {wins.map((win) => (
              <motion.div
                key={win.id}
                initial={{ opacity: 0, scale: 0.8, x: -30 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.3 }}
                className="flex-shrink-0"
                data-testid={`card-win-${win.id}`}
              >
                <div className="flex flex-col items-center w-[100px]">
                  <div className="w-[100px] h-[130px] rounded-xl overflow-hidden mb-2 bg-[#1a2633] border border-[#2a3a4a] shadow-lg shadow-black/30">
                    <img 
                      src={win.game.image} 
                      alt={win.game.name}
                      className="w-full h-full object-cover scale-150"
                    />
                  </div>
                  
                  <span className="text-[10px] font-bold text-white text-center leading-tight truncate w-full">
                    {win.game.name}
                  </span>
                  
                  <div className="flex items-center gap-0.5 mt-1">
                    <Gem className="w-3 h-3 text-cyan-400" />
                    <span className="text-[10px] text-slate-400 truncate max-w-[70px]">
                      {win.username}
                    </span>
                  </div>
                  
                  <span className="text-sm font-bold text-amber-400 mt-1">
                    {win.formattedAmount}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
