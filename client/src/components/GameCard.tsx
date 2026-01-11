import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { Dice5, Coins, Bomb, CircleDot, Triangle, Spade, Gift, Flame } from "lucide-react";

export interface GameInfo {
  id: string;
  name: string;
  href: string;
  icon: "dice" | "coinflip" | "mines" | "roulette" | "plinko" | "blackjack" | "spin";
  players?: number;
  isHot?: boolean;
  isNew?: boolean;
}

const iconMap = {
  dice: { icon: Dice5, color: "text-blue-400", bg: "bg-blue-500/20" },
  coinflip: { icon: Coins, color: "text-yellow-400", bg: "bg-yellow-500/20" },
  mines: { icon: Bomb, color: "text-green-400", bg: "bg-green-500/20" },
  roulette: { icon: CircleDot, color: "text-red-400", bg: "bg-red-500/20" },
  plinko: { icon: Triangle, color: "text-purple-400", bg: "bg-purple-500/20" },
  blackjack: { icon: Spade, color: "text-cyan-400", bg: "bg-cyan-500/20" },
  spin: { icon: Gift, color: "text-amber-400", bg: "bg-amber-500/20" },
};

export function GameCard({ game }: { game: GameInfo }) {
  const { icon: Icon, color, bg } = iconMap[game.icon];
  
  return (
    <Link href={game.href}>
      <div 
        className="group relative bg-[#0f1923] rounded-xl border border-[#1e2a36] overflow-hidden cursor-pointer transition-all duration-300 hover:border-[#2a3a4a] hover:shadow-lg hover:shadow-black/20 hover:-translate-y-1 min-w-[140px] w-[140px] flex-shrink-0"
        data-testid={`card-game-${game.id}`}
      >
        {game.isHot && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-orange-500/20 border border-orange-500/30">
            <Flame className="w-3 h-3 text-orange-400" />
            <span className="text-[10px] font-bold text-orange-400">HOT</span>
          </div>
        )}
        {game.isNew && !game.isHot && (
          <div className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/30">
            <span className="text-[10px] font-bold text-emerald-400">NEW</span>
          </div>
        )}
        
        <div className="p-4 flex flex-col items-center">
          <div className={cn(
            "w-16 h-16 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110",
            bg
          )}>
            <Icon className={cn("w-8 h-8", color)} />
          </div>
          
          <h3 className="text-sm font-semibold text-white text-center mb-1">{game.name}</h3>
          
          {game.players !== undefined && (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-slate-500">{game.players.toLocaleString()} playing</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
