import { useState, useEffect, useRef, useCallback } from "react";
import { X, Pin, RotateCcw, TrendingUp, TrendingDown, ChartLine, GripHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProfitTracker, GameId, formatCurrency, formatProfit } from "@/hooks/use-profit-tracker";
import { cn } from "@/lib/utils";

interface ProfitTrackerWidgetProps {
  gameId: GameId;
  className?: string;
}

interface WidgetPosition {
  x: number;
  y: number;
  pinned: boolean;
  isOpen: boolean;
}

const STORAGE_KEY_PREFIX = "profitTracker:widget:";
const WIDGET_WIDTH = 280;
const WIDGET_HEIGHT = 260;

function getStorageKey(gameId: GameId) {
  return `${STORAGE_KEY_PREFIX}${gameId}`;
}

function getDefaultPosition(): WidgetPosition {
  return {
    x: Math.max(16, window.innerWidth - WIDGET_WIDTH - 80),
    y: 80,
    pinned: false,
    isOpen: false,
  };
}

function clampPosition(x: number, y: number): { x: number; y: number } {
  const maxX = window.innerWidth - WIDGET_WIDTH - 16;
  const maxY = window.innerHeight - WIDGET_HEIGHT - 16;
  return {
    x: Math.max(16, Math.min(x, maxX)),
    y: Math.max(16, Math.min(y, maxY)),
  };
}

function MiniProfitChart({ data, isPositive }: { data: number[]; isPositive: boolean }) {
  if (data.length < 2) {
    return (
      <div className="h-16 flex items-center justify-center text-slate-500 text-xs">
        Place bets to see chart
      </div>
    );
  }

  const width = 240;
  const height = 56;
  const padding = 4;
  
  const minVal = Math.min(...data, 0);
  const maxVal = Math.max(...data, 0);
  const range = maxVal - minVal || 1;
  
  const points = data.map((val, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((val - minVal) / range) * (height - padding * 2);
    return { x, y };
  });
  
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  
  const fillD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;
  
  const zeroY = height - padding - ((0 - minVal) / range) * (height - padding * 2);
  
  const lastPoint = points[points.length - 1];
  const strokeColor = isPositive ? "#10b981" : "#ef4444";
  const fillColor = isPositive ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)";

  return (
    <div className="relative overflow-hidden rounded-lg">
      <div className="absolute inset-0 shimmer-bg opacity-30" />
      <svg width={width} height={height} className="block">
        <defs>
          <linearGradient id={`grad-${isPositive ? 'pos' : 'neg'}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        
        <line 
          x1={padding} 
          y1={zeroY} 
          x2={width - padding} 
          y2={zeroY} 
          stroke="rgba(100, 116, 139, 0.3)" 
          strokeWidth="1" 
          strokeDasharray="4 4"
        />
        
        <path d={fillD} fill={`url(#grad-${isPositive ? 'pos' : 'neg'})`} />
        
        <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        
        <circle cx={lastPoint.x} cy={lastPoint.y} r="4" fill={strokeColor} />
        <circle cx={lastPoint.x} cy={lastPoint.y} r="6" fill={strokeColor} opacity="0.3" />
      </svg>
    </div>
  );
}

export function ProfitTrackerWidget({ gameId, className }: ProfitTrackerWidgetProps) {
  const { getStats, getHistory, resetSession } = useProfitTracker();
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(getStorageKey(gameId));
    if (saved) {
      try {
        const parsed: WidgetPosition = JSON.parse(saved);
        const clamped = clampPosition(parsed.x, parsed.y);
        setPosition(clamped);
        setIsPinned(parsed.pinned);
        setIsOpen(parsed.isOpen);
      } catch {
        const def = getDefaultPosition();
        setPosition({ x: def.x, y: def.y });
      }
    } else {
      const def = getDefaultPosition();
      setPosition({ x: def.x, y: def.y });
    }
  }, [gameId]);

  const savePosition = useCallback((x: number, y: number, pinned: boolean, open: boolean) => {
    localStorage.setItem(getStorageKey(gameId), JSON.stringify({ x, y, pinned, isOpen: open }));
  }, [gameId]);

  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => clampPosition(prev.x, prev.y));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!panelRef.current) return;
    e.preventDefault();
    setIsDragging(true);
    const rect = panelRef.current.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragOffset.current.x;
      const newY = e.clientY - dragOffset.current.y;
      const clamped = clampPosition(newX, newY);
      setPosition(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setPosition(prev => {
        savePosition(prev.x, prev.y, isPinned, isOpen);
        return prev;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isPinned, isOpen, savePosition]);

  const handlePin = () => {
    const newPinned = !isPinned;
    setIsPinned(newPinned);
    if (newPinned) setIsOpen(true);
    savePosition(position.x, position.y, newPinned, newPinned ? true : isOpen);
  };

  const handleClose = () => {
    if (!isPinned) {
      setIsOpen(false);
      savePosition(position.x, position.y, isPinned, false);
    }
  };

  const handleReset = () => {
    resetSession(gameId);
  };

  const handleToggle = () => {
    const newOpen = !isOpen;
    setIsOpen(newOpen);
    savePosition(position.x, position.y, isPinned, newOpen);
  };

  const stats = getStats(gameId);
  const history = getHistory(gameId);
  const isProfit = stats.profit >= 0;

  return (
    <div className={cn("relative", className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggle}
        className={cn(
          "gap-1.5 text-xs font-medium",
          isOpen && "bg-[#1a2530]"
        )}
        data-testid="button-profit-tracker"
      >
        <ChartLine className="w-3.5 h-3.5" />
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
          ref={panelRef}
          style={{
            position: 'fixed',
            left: position.x,
            top: position.y,
            zIndex: 9999,
          }}
          className={cn(
            "w-[280px] bg-[#111921]/95 backdrop-blur-sm border border-[#1a2530] rounded-xl shadow-2xl shadow-black/60 overflow-hidden",
            isDragging && "cursor-grabbing select-none"
          )}
          data-testid="panel-profit-tracker"
        >
          <div 
            className="flex items-center justify-between px-3 py-2 bg-[#0d1419] border-b border-[#1a2530] cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
          >
            <div className="flex items-center gap-2">
              <GripHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                Today
              </span>
            </div>
            <div className="flex items-center gap-0.5">
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

            <MiniProfitChart data={history} isPositive={isProfit} />

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#0d1419] rounded-lg p-2">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Wagered</div>
                <div className="text-sm font-semibold text-slate-200">{formatCurrency(stats.wagered)}</div>
              </div>
              <div className="bg-[#0d1419] rounded-lg p-2">
                <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Win Rate</div>
                <div className="text-sm font-semibold text-slate-200">
                  {stats.wins + stats.losses > 0 
                    ? `${((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(0)}%`
                    : "—"}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1 border-t border-[#1a2530]">
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
              <span className="text-slate-500 text-[10px]">
                {stats.wins + stats.losses} bets
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
