import { GameResult } from "@/hooks/use-game-history";
import { cn } from "@/lib/utils";
import { Dices, Coins, Bomb, Trash2, Spade, CircleDot, Triangle } from "lucide-react";

interface RecentResultsProps {
  results: GameResult[];
  onClear?: () => void;
  filterGame?: "dice" | "coinflip" | "mines" | "blackjack" | "roulette" | "plinko";
}

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

function getGameIcon(game: string) {
  switch (game) {
    case "dice": return <Dices className="w-3.5 h-3.5" />;
    case "coinflip": return <Coins className="w-3.5 h-3.5" />;
    case "mines": return <Bomb className="w-3.5 h-3.5" />;
    case "blackjack": return <Spade className="w-3.5 h-3.5" />;
    case "roulette": return <CircleDot className="w-3.5 h-3.5" />;
    case "plinko": return <Triangle className="w-3.5 h-3.5" />;
    default: return null;
  }
}

function getGameLabel(game: string) {
  switch (game) {
    case "dice": return "Dice";
    case "coinflip": return "Coinflip";
    case "mines": return "Mines";
    case "blackjack": return "Blackjack";
    case "roulette": return "Roulette";
    case "plinko": return "Plinko";
    default: return game;
  }
}

export function RecentResults({ results, onClear, filterGame }: RecentResultsProps) {
  const filteredResults = filterGame 
    ? results.filter(r => r.game === filterGame)
    : results;

  if (filteredResults.length === 0) {
    return (
      <div className="bg-[#0d1419] border border-[#1a2530] rounded-xl p-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Recent Results
          </h3>
        </div>
        <p className="text-center text-slate-500 text-sm py-4">
          No results yet. Place a bet to see your history.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#0d1419] border border-[#1a2530] rounded-xl p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Recent Results
        </h3>
        {onClear && (
          <button 
            onClick={onClear}
            className="text-slate-500 hover:text-slate-300 transition-colors"
            title="Clear history"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      
      <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
        {filteredResults.map((result) => (
          <div 
            key={result.id}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm",
              result.won ? "bg-emerald-500/5 border border-emerald-500/20" : "bg-red-500/5 border border-red-500/20"
            )}
          >
            <div className={cn(
              "shrink-0",
              result.won ? "text-emerald-400" : "text-red-400"
            )}>
              {getGameIcon(result.game)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-white font-medium text-xs">
                  {getGameLabel(result.game)}
                </span>
                <span className="text-slate-500 text-[10px]">
                  {formatTime(result.timestamp)}
                </span>
              </div>
              <div className="text-slate-400 text-[11px] truncate">
                {result.detail}
              </div>
            </div>
            
            <div className="text-right shrink-0">
              <div className={cn(
                "font-mono font-semibold text-xs",
                result.won ? "text-emerald-400" : "text-red-400"
              )}>
                {result.won ? "+" : ""}{result.profit.toFixed(2)}
              </div>
              <div className="text-slate-500 text-[10px]">
                ${result.betAmount.toFixed(2)} bet
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
