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

const NAME_PARTS = [
  "brad", "luna", "max", "kai", "nova", "zane", "milo", "aria", "leo", "jade",
  "rex", "sky", "ace", "neo", "ivy", "cruz", "ash", "finn", "sage", "jax",
  "mason", "xKairo", "tyler", "crypto", "lucky", "diamond", "gold", "shadow"
];

const SUFFIXES = ["22", "88", "_7", "_dev", "99", "X", "_pro", "777", "001", ""];

const GAMES = ["Dice", "Coinflip", "Mines"];

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

function generateAmount(): number {
  const roll = Math.random();
  if (roll < 0.85) {
    return 0.10 + Math.random() * 7.90;
  } else if (roll < 0.97) {
    return 8 + Math.random() * 52;
  } else if (roll < 0.995) {
    return 60 + Math.random() * 140;
  } else {
    return 200 + Math.random() * 300;
  }
}

function formatAmount(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}k`;
  }
  return `$${amount.toFixed(2)}`;
}

function generateWin(): LiveWin {
  const amount = generateAmount();
  return {
    id: crypto.randomUUID(),
    username: generateUsername(),
    amount: formatAmount(amount),
    game: GAMES[Math.floor(Math.random() * GAMES.length)],
    timestamp: Date.now()
  };
}

export function LiveWins() {
  const [wins, setWins] = useState<LiveWin[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const burstCountRef = useRef(0);

  useEffect(() => {
    const initial: LiveWin[] = [];
    for (let i = 0; i < 8; i++) {
      initial.push(generateWin());
    }
    setWins(initial);

    const scheduleNext = () => {
      let delay: number;
      
      if (burstCountRef.current > 0) {
        delay = 150 + Math.random() * 300;
        burstCountRef.current--;
      } else if (Math.random() < 0.15) {
        burstCountRef.current = 2 + Math.floor(Math.random() * 3);
        delay = 150 + Math.random() * 200;
      } else {
        delay = 800 + Math.random() * 1700;
      }

      timeoutRef.current = setTimeout(() => {
        setWins(prev => [generateWin(), ...prev].slice(0, 12));
        scheduleNext();
      }, delay);
    };

    scheduleNext();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
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
