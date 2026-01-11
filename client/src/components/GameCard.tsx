import { Link } from "wouter";
import { Flame, Bomb } from "lucide-react";

import diceImg from "@assets/ChatGPT_Image_Jan_11,_2026,_01_29_29_AM_1768095699502.png";
import coinflipImg from "@assets/ChatGPT_Image_Jan_11,_2026,_01_33_56_AM_1768095699503.png";
import blackjackImg from "@assets/ChatGPT_Image_Jan_11,_2026,_01_41_15_AM_1768095699503.png";
import spinImg from "@assets/Colourful_daily_spin_with_water_splash_1768095699504.png";
import plinkoImg from "@assets/Glowing_Plinko_with_electric_water_splash_1768095699504.png";
import rouletteImg from "@assets/Roulette_wheel_with_glowing_blue_splash_1768095699504.png";

export interface GameInfo {
  id: string;
  name: string;
  href: string;
  icon: "dice" | "coinflip" | "mines" | "roulette" | "plinko" | "blackjack" | "spin";
  players?: number;
  isHot?: boolean;
  isNew?: boolean;
}

const gameImages: Record<string, string | null> = {
  dice: diceImg,
  coinflip: coinflipImg,
  roulette: rouletteImg,
  plinko: plinkoImg,
  blackjack: blackjackImg,
  spin: spinImg,
  mines: null,
};

export function GameCard({ game }: { game: GameInfo }) {
  const imageUrl = gameImages[game.icon];
  
  return (
    <Link href={game.href}>
      <div 
        className="group relative bg-[#0f1923] rounded-xl border border-[#1e2a36] overflow-hidden cursor-pointer transition-all duration-300 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/10 hover:-translate-y-1 min-w-[180px] w-[180px] flex-shrink-0"
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
          {imageUrl ? (
            <img 
              src={imageUrl} 
              alt={game.name}
              className="w-36 h-36 object-contain mb-2 transition-transform group-hover:scale-110"
            />
          ) : (
            <div className="w-36 h-36 rounded-xl bg-green-500/20 flex items-center justify-center mb-2 transition-transform group-hover:scale-110">
              <Bomb className="w-16 h-16 text-green-400" />
            </div>
          )}
          
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
