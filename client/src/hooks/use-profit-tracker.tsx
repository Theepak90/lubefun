import { createContext, useContext, useReducer, useCallback, ReactNode } from "react";

export type GameId = "dice" | "coinflip" | "mines" | "plinko" | "blackjack" | "roulette" | "splitsteal" | "pressure-valve";

export interface GameStats {
  wagered: number;
  profit: number;
  wins: number;
  losses: number;
  totalPayout: number;
  profitHistory: number[];
}

interface ProfitTrackerState {
  stats: Record<GameId, GameStats>;
}

type Action =
  | { type: "RECORD_RESULT"; game: GameId; wager: number; payout: number; won: boolean }
  | { type: "RESET_SESSION"; game: GameId }
  | { type: "RESET_ALL" };

const MAX_HISTORY_POINTS = 150;

const initialGameStats: GameStats = {
  wagered: 0,
  profit: 0,
  wins: 0,
  losses: 0,
  totalPayout: 0,
  profitHistory: [],
};

const initialState: ProfitTrackerState = {
  stats: {
    dice: { ...initialGameStats },
    coinflip: { ...initialGameStats },
    mines: { ...initialGameStats },
    plinko: { ...initialGameStats },
    blackjack: { ...initialGameStats },
    roulette: { ...initialGameStats },
    splitsteal: { ...initialGameStats },
    "pressure-valve": { ...initialGameStats },
  },
};

function profitTrackerReducer(state: ProfitTrackerState, action: Action): ProfitTrackerState {
  switch (action.type) {
    case "RECORD_RESULT": {
      const { game, wager, payout, won } = action;
      const profit = payout - wager;
      const currentStats = state.stats[game];
      const newCumulativeProfit = currentStats.profit + profit;
      
      const newHistory = [...currentStats.profitHistory, newCumulativeProfit];
      if (newHistory.length > MAX_HISTORY_POINTS) {
        newHistory.shift();
      }
      
      return {
        ...state,
        stats: {
          ...state.stats,
          [game]: {
            wagered: currentStats.wagered + wager,
            profit: newCumulativeProfit,
            wins: currentStats.wins + (won ? 1 : 0),
            losses: currentStats.losses + (won ? 0 : 1),
            totalPayout: currentStats.totalPayout + payout,
            profitHistory: newHistory,
          },
        },
      };
    }
    case "RESET_SESSION": {
      return {
        ...state,
        stats: {
          ...state.stats,
          [action.game]: { ...initialGameStats },
        },
      };
    }
    case "RESET_ALL": {
      return initialState;
    }
    default:
      return state;
  }
}

interface ProfitTrackerContextValue {
  stats: Record<GameId, GameStats>;
  recordResult: (game: GameId, wager: number, payout: number, won: boolean) => void;
  resetSession: (game: GameId) => void;
  resetAll: () => void;
  getStats: (game: GameId) => GameStats;
  getHistory: (game: GameId) => number[];
}

const ProfitTrackerContext = createContext<ProfitTrackerContextValue | null>(null);

export function ProfitTrackerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(profitTrackerReducer, initialState);

  const recordResult = useCallback((game: GameId, wager: number, payout: number, won: boolean) => {
    dispatch({ type: "RECORD_RESULT", game, wager, payout, won });
  }, []);

  const resetSession = useCallback((game: GameId) => {
    dispatch({ type: "RESET_SESSION", game });
  }, []);

  const resetAll = useCallback(() => {
    dispatch({ type: "RESET_ALL" });
  }, []);

  const getStats = useCallback((game: GameId) => {
    return state.stats[game] || initialGameStats;
  }, [state.stats]);

  const getHistory = useCallback((game: GameId) => {
    return state.stats[game]?.profitHistory || [];
  }, [state.stats]);

  return (
    <ProfitTrackerContext.Provider value={{ stats: state.stats, recordResult, resetSession, resetAll, getStats, getHistory }}>
      {children}
    </ProfitTrackerContext.Provider>
  );
}

export function useProfitTracker() {
  const context = useContext(ProfitTrackerContext);
  if (!context) {
    throw new Error("useProfitTracker must be used within a ProfitTrackerProvider");
  }
  return context;
}

export function formatCurrency(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  
  if (absValue >= 1000000) {
    return `${sign}$${(absValue / 1000000).toFixed(1)}M`;
  }
  if (absValue >= 1000) {
    return `${sign}$${(absValue / 1000).toFixed(1)}k`;
  }
  return `${sign}$${absValue.toFixed(2)}`;
}

export function formatProfit(value: number): string {
  const formatted = formatCurrency(Math.abs(value));
  if (value >= 0) {
    return `+${formatted}`;
  }
  return `-${formatted.replace("-", "")}`;
}
