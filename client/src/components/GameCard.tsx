import { Link } from "wouter";
import { Flame } from "lucide-react";

import diceImg from "@assets/ChatGPT_Image_Jan_11,_2026,_02_04_41_AM_1768097091093.png";
import coinflipImg from "@assets/ChatGPT_Image_Jan_11,_2026,_01_33_56_AM_1768095699503.png";
import blackjackImg from "@assets/ChatGPT_Image_Jan_11,_2026,_01_41_15_AM_1768095699503.png";
import spinImg from "@assets/Colourful_daily_spin_with_water_splash_1768095699504.png";
import plinkoImg from "@assets/Glowing_Plinko_with_electric_water_splash_1768095699504.png";
import rouletteImg from "@assets/Roulette_wheel_with_glowing_blue_splash_1768095699504.png";
import minesImg from "@assets/Glowing_mines_with_vibrant_splash_1768096070720.png";

export interface GameInfo {
  id: string;
  name: string;
  href: string;
  icon: "dice" | "coinflip" | "mines" | "roulette" | "plinko" | "blackjack" | "spin";
  players?: number;
  isHot?: boolean;
  isNew?: boolean;
}

const gameImages: Record<string, string> = {
  dice: diceImg,
  coinflip: coinflipImg,
  roulette: rouletteImg,
  plinko: plinkoImg,
  blackjack: blackjackImg,
  spin: spinImg,
  mines: minesImg,
};

function getDailyRandomPlayers(gameId: string): number {
  const today = new Date();
  const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
  const seed = gameId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + dayOfYear;
  const random = Math.sin(seed * 9999) * 10000;
  return Math.floor(8 + (Math.abs(random) % 209));
}

export function GameCard({ game }: { game: GameInfo }) {
  const imageUrl = gameImages[game.icon];
  const playerCount = getDailyRandomPlayers(game.id);
  const isFullCard = game.icon === "dice";
  
  return (
    <Link href={game.href}>
      <div 
        className="group relative bg-[#0f1923] rounded-xl border border-[#1e2a36] overflow-hidden cursor-pointer transition-all duration-300 hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/10 hover:-translate-y-1 min-w-[160px] w-[160px] h-[200px] flex-shrink-0"
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
        
        {isFullCard ? (
          <>
            <img 
              src={imageUrl} 
              alt={game.name}
              className="absolute inset-0 w-full h-full object-cover scale-125 transition-transform group-hover:scale-[1.3]"
            />
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-black/60 px-2 py-1 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-slate-300">{playerCount} playing</span>
            </div>
          </>
        ) : (
          <div className="p-2 flex flex-col items-center justify-center h-full">
            <img 
              src={imageUrl} 
              alt={game.name}
              className="w-[150px] h-[150px] object-contain transition-transform group-hover:scale-110"
              style={{ maxWidth: 'none', maxHeight: 'none' }}
            />
            
            <div className="flex items-center gap-1 mt-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-slate-500">{playerCount} playing</span>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
