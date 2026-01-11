import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { GameCard, GameInfo } from "./GameCard";
import { cn } from "@/lib/utils";

interface GameRowProps {
  title: string;
  games: GameInfo[];
  icon?: React.ReactNode;
}

export function GameRow({ title, games, icon }: GameRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const scrollAmount = 300;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth"
    });
  };

  return (
    <section className="relative" data-testid={`section-gamerow-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-lg font-bold text-white">{title}</h2>
        </div>
        
        <div className="flex gap-1">
          <button
            onClick={() => scroll("left")}
            className="w-8 h-8 rounded-lg bg-[#1a2633] border border-[#1e2a36] flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#243140] transition-colors"
            data-testid={`button-scroll-left-${title.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="w-8 h-8 rounded-lg bg-[#1a2633] border border-[#1e2a36] flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#243140] transition-colors"
            data-testid={`button-scroll-right-${title.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {games.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
    </section>
  );
}
