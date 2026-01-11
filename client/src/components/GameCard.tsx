import { Link } from "wouter";
import { Flame } from "lucide-react";
import gameIconsSprite from "@assets/ChatGPT_Image_Jan_11,_2026,_01_22_32_AM_1768094563596.png";

export interface GameInfo {
  id: string;
  name: string;
  href: string;
  icon: "dice" | "coinflip" | "mines" | "roulette" | "plinko" | "blackjack" | "spin";
  players?: number;
  isHot?: boolean;
  isNew?: boolean;
}

const iconPositions: Record<string, { x: number; y: number }> = {
  dice: { x: 0, y: 0 },
  coinflip: { x: 33.333, y: 0 },
  roulette: { x: 66.666, y: 0 },
  plinko: { x: 100, y: 0 },
  mines: { x: 0, y: 100 },
  blackjack: { x: 33.333, y: 100 },
  spin: { x: 66.666, y: 100 },
};

export function GameCard({ game }: { game: GameInfo }) {
  const position = iconPositions[game.icon] || { x: 0, y: 0 };
  
  return (
    <Link href={game.href}>
      <div 
        className="group relative bg-[#0f1923] rounded-xl border border-[#1e2a36] overflow-hidden cursor-pointer transition-all duration-300 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/10 hover:-translate-y-1 min-w-[140px] w-[140px] flex-shrink-0"
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
        
        <div className="p-3 flex flex-col items-center">
          <div 
            className="w-20 h-20 rounded-xl mb-2 transition-transform group-hover:scale-110 bg-no-repeat"
            style={{
              backgroundImage: `url(${gameIconsSprite})`,
              backgroundSize: "400% 200%",
              backgroundPosition: `${position.x}% ${position.y}%`,
            }}
          />
          
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
