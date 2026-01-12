import { Link } from "wouter";
import { Flame } from "lucide-react";
import { useLivePlayerCount } from "@/hooks/useLivePlayerCount";

import diceImg from "@assets/ChatGPT_Image_Jan_11,_2026,_02_04_41_AM_1768097091093.png";
import coinflipImg from "@assets/image_1768122646654.png";
import blackjackImg from "@assets/ChatGPT_Image_Jan_11,_2026,_04_29_05_AM_1768106559757.png";
import spinImg from "@assets/Daily_Spin_game_card_design_1768106559757.png";
import plinkoImg from "@assets/ChatGPT_Image_Jan_11,_2026,_04_32_20_AM_1768106559758.png";
import rouletteImg from "@assets/Glowing_roulette_card_with_blue_liquid_1768106559758.png";
import minesImg from "@assets/Glowing_mines_with_vibrant_splash_1768096070720.png";
import splitstealImg from "@assets/Split_or_steal_showdown_1768107711468.png";
import pressureValveImg from "@assets/ChatGPT_Image_Jan_11,_2026,_07_03_55_AM_1768122318400.png";

export interface GameInfo {
  id: string;
  name: string;
  href: string;
  icon: "dice" | "coinflip" | "mines" | "roulette" | "plinko" | "blackjack" | "spin" | "splitsteal" | "pressure";
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
  pressure: pressureValveImg,
};

const gameGradients: Record<string, string> = {
  dice: "from-orange-500 via-orange-400 to-amber-300",
  coinflip: "from-purple-600 via-purple-500 to-violet-400",
  roulette: "from-purple-700 via-violet-600 to-purple-500",
  plinko: "from-blue-600 via-cyan-500 to-blue-400",
  blackjack: "from-teal-600 via-teal-500 to-cyan-400",
  spin: "from-purple-600 via-pink-500 to-purple-400",
  mines: "from-blue-600 via-cyan-500 to-blue-400",
  splitsteal: "from-emerald-600 via-green-500 to-teal-400",
  pressure: "from-red-600 via-orange-500 to-yellow-400",
};

export function GameCard({ game }: { game: GameInfo }) {
  const imageUrl = gameImages[game.icon];
  const playerCount = useLivePlayerCount(game.icon);
  const gradient = gameGradients[game.icon] || "from-slate-600 via-slate-500 to-slate-400";
  
  return (
    <Link href={game.href}>
      <div 
        className={`group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-2 min-w-[140px] w-[140px] h-[180px] flex-shrink-0 bg-gradient-to-b ${gradient}`}
        data-testid={`card-game-${game.id}`}
      >
        {game.isHot && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/40 backdrop-blur-sm">
            <Flame className="w-3 h-3 text-orange-400" />
            <span className="text-[10px] font-bold text-white">HOT</span>
          </div>
        )}
        {game.isNew && !game.isHot && (
          <div className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded-md bg-black/40 backdrop-blur-sm">
            <span className="text-[10px] font-bold text-emerald-300">NEW</span>
          </div>
        )}
        
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="flex-1 flex items-center justify-center pt-4">
            <img 
              src={imageUrl} 
              alt={game.name}
              className="w-20 h-20 object-contain drop-shadow-lg transition-transform duration-300 group-hover:scale-110"
            />
          </div>
          
          <div className="w-full text-center pb-3 px-2">
            <h3 className="text-sm font-bold text-white uppercase tracking-wide drop-shadow-md">
              {game.name}
            </h3>
            <div className="flex items-center justify-center gap-1 mt-1">
              <div className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[9px] text-white/70 font-medium uppercase tracking-wider">
                {playerCount} playing
              </span>
            </div>
          </div>
        </div>
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />
      </div>
    </Link>
  );
}
