import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy } from "lucide-react";

interface LiveWin {
  id: string;
  username: string;
  amount: string;
  game: string;
  timestamp: number;
}

const USERNAMES = [
  "brad22", "lucky_mike", "diamondking", "crypto_ace", "winner99",
  "jackpot_joe", "goldstar", "ninja_bet", "high_roller", "fortune_x",
  "megawin", "blazer_77", "coolcat", "richie_r", "spinmaster",
  "ace_player", "betking", "lucky_charm", "goldmine", "big_bet_bob"
];

const GAMES = ["Dice", "Coinflip", "Mines"];

function formatAmount(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}k`;
  }
  return `$${amount.toFixed(0)}`;
}

function generateWin(): LiveWin {
  const username = USERNAMES[Math.floor(Math.random() * USERNAMES.length)];
  const amount = Math.random() < 0.3 
    ? Math.floor(Math.random() * 5000) + 1000
    : Math.floor(Math.random() * 500) + 10;
  const game = GAMES[Math.floor(Math.random() * GAMES.length)];
  
  return {
    id: crypto.randomUUID(),
    username,
    amount: formatAmount(amount),
    game,
    timestamp: Date.now()
  };
}

export function LiveWins() {
  const [wins, setWins] = useState<LiveWin[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    for (let i = 0; i < 5; i++) {
      setWins(prev => [generateWin(), ...prev].slice(0, 12));
    }

    const scheduleNext = () => {
      const delay = 3000 + Math.random() * 5000;
      intervalRef.current = setTimeout(() => {
        setWins(prev => [generateWin(), ...prev].slice(0, 12));
        scheduleNext();
      }, delay);
    };

    scheduleNext();

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
    };
  }, []);

  return (
    <div className="bg-[#0d1419] border border-[#1a2530] rounded-xl p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Live Wins
          </h3>
        </div>
        <span className="text-[9px] text-slate-600 italic">
          Simulated (demo)
        </span>
      </div>
      
      <div className="space-y-1 max-h-[200px] overflow-hidden">
        <AnimatePresence initial={false}>
          {wins.map((win) => (
            <motion.div
              key={win.id}
              initial={{ opacity: 0, x: -20, height: 0 }}
              animate={{ opacity: 1, x: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center justify-between py-1.5 px-2 rounded-md bg-[#111921]/50"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-white font-medium truncate">
                  {win.username}
                </span>
                <span className="text-[10px] text-slate-500">
                  {win.game}
                </span>
              </div>
              <span className="text-xs font-mono font-semibold text-emerald-400 shrink-0">
                +{win.amount}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
