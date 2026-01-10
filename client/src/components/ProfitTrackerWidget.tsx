import { useState, useEffect } from "react";
import { X, Pin, RotateCcw, TrendingUp, TrendingDown, ChartBar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProfitTracker, GameId, formatCurrency, formatProfit } from "@/hooks/use-profit-tracker";
import { cn } from "@/lib/utils";

interface ProfitTrackerWidgetProps {
  gameId: GameId;
  className?: string;
}

const PINNED_KEY_PREFIX = "profitTracker:pinned:";

export function ProfitTrackerWidget({ gameId, className }: ProfitTrackerWidgetProps) {
  const { getStats, getRTP, resetSession } = useProfitTracker();
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  useEffect(() => {
    const savedPinned = localStorage.getItem(`${PINNED_KEY_PREFIX}${gameId}`);
    if (savedPinned === "true") {
      setIsPinned(true);
      setIsOpen(true);
    }
  }, [gameId]);

  const handlePin = () => {
    const newPinned = !isPinned;
    setIsPinned(newPinned);
    localStorage.setItem(`${PINNED_KEY_PREFIX}${gameId}`, String(newPinned));
    if (newPinned) {
      setIsOpen(true);
    }
  };

  const handleClose = () => {
    if (!isPinned) {
      setIsOpen(false);
    }
  };

  const handleReset = () => {
    resetSession(gameId);
  };

  const stats = getStats(gameId);
  const rtp = getRTP(gameId);
  const isProfit = stats.profit >= 0;

  return (
    <div className={cn("relative", className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "gap-1.5 text-xs font-medium",
          isOpen && "bg-[#1a2530]"
        )}
        data-testid="button-profit-tracker"
      >
        <ChartBar className="w-3.5 h-3.5" />
        <span>Profit</span>
        {stats.profit !== 0 && (
          <span className={cn(
            "text-xs font-bold",
            isProfit ? "text-emerald-400" : "text-red-400"
          )}>
            {formatProfit(stats.profit)}
          </span>
        )}
      </Button>

      {isOpen && (
        <div 
          className="absolute top-full right-0 mt-2 z-50 w-64 bg-[#111921] border border-[#1a2530] rounded-xl shadow-xl shadow-black/50 overflow-hidden"
          data-testid="panel-profit-tracker"
        >
          <div className="flex items-center justify-between px-3 py-2 bg-[#0d1419] border-b border-[#1a2530]">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
              Session Stats
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-6 w-6",
                  isPinned && "text-amber-400"
                )}
                onClick={handlePin}
                title={isPinned ? "Unpin" : "Pin open"}
                data-testid="button-pin-tracker"
              >
                <Pin className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleReset}
                title="Reset session"
                data-testid="button-reset-session"
              >
                <RotateCcw className="w-3 h-3" />
              </Button>
              {!isPinned && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleClose}
                  title="Close"
                  data-testid="button-close-tracker"
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>

          <div className="p-3 space-y-3">
            <div className={cn(
              "flex items-center justify-between p-2.5 rounded-lg",
              isProfit ? "bg-emerald-500/10" : "bg-red-500/10"
            )}>
              <div className="flex items-center gap-2">
                {isProfit ? (
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-400" />
                )}
                <span className="text-xs text-slate-400">Session Profit</span>
              </div>
              <span className={cn(
                "text-sm font-bold",
                isProfit ? "text-emerald-400" : "text-red-400"
              )}>
                {formatProfit(stats.profit)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#0d1419] rounded-lg p-2.5">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Wagered</div>
                <div className="text-sm font-semibold text-slate-200">{formatCurrency(stats.wagered)}</div>
              </div>
              <div className="bg-[#0d1419] rounded-lg p-2.5">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">RTP</div>
                <div className="text-sm font-semibold text-slate-200">
                  {rtp !== null ? `${rtp.toFixed(1)}%` : "—"}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="text-emerald-400 font-bold">{stats.wins}</span>
                  <span className="text-slate-500">wins</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-red-400 font-bold">{stats.losses}</span>
                  <span className="text-slate-500">losses</span>
                </div>
              </div>
              {stats.wins + stats.losses > 0 && (
                <span className="text-slate-500">
                  {((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(0)}% win
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
