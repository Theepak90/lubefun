import { Link } from "wouter";
import { Flame } from "lucide-react";
import { useLivePlayerCount } from "@/hooks/useLivePlayerCount";

import diceImg from "@assets/ChatGPT_Image_Jan_11,_2026,_02_04_41_AM_1768097091093.png";
import coinflipImg from "@assets/ChatGPT_Image_Jan_11,_2026,_04_18_24_AM_1768106559756.png";
import blackjackImg from "@assets/ChatGPT_Image_Jan_11,_2026,_04_29_05_AM_1768106559757.png";
import spinImg from "@assets/Daily_Spin_game_card_design_1768106559757.png";
import plinkoImg from "@assets/ChatGPT_Image_Jan_11,_2026,_04_32_20_AM_1768106559758.png";
import rouletteImg from "@assets/Glowing_roulette_card_with_blue_liquid_1768106559758.png";
import minesImg from "@assets/Glowing_mines_with_vibrant_splash_1768096070720.png";
import splitstealImg from "@assets/Split_or_steal__the_challenge_begins_1768107077724.png";

export interface GameInfo {
  id: string;
  name: string;
  href: string;
  icon: "dice" | "coinflip" | "mines" | "roulette" | "plinko" | "blackjack" | "spin" | "splitsteal";
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
  splitsteal: splitstealImg,
};

export function GameCard({ game }: { game: GameInfo }) {
  const imageUrl = gameImages[game.icon];
  const playerCount = useLivePlayerCount(game.icon);
  
  return (
    <Link href={game.href}>
      <div 
        className="group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/20 hover:-translate-y-1 min-w-[160px] w-[160px] h-[200px] flex-shrink-0"
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
        
        <img 
          src={imageUrl} 
          alt={game.name}
          className="w-full h-full object-cover scale-[1.6] transition-transform group-hover:scale-[1.7]"
        />
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-black/60 px-2 py-1 rounded-full">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] text-slate-300">{playerCount} playing</span>
        </div>
      </div>
    </Link>
  );
}
