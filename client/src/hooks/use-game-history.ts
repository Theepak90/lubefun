import { useState, useEffect, useCallback } from "react";

export interface GameResult {
  id: string;
  timestamp: number;
  game: "dice" | "coinflip" | "mines" | "plinko" | "blackjack" | "roulette" | "splitsteal";
  betAmount: number;
  won: boolean;
  profit: number;
  detail: string;
}

const STORAGE_KEY = "game_history";
const MAX_RESULTS = 20;

export function useGameHistory() {
  const [results, setResults] = useState<GameResult[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setResults(JSON.parse(stored));
      } catch {
        setResults([]);
      }
    }
  }, []);

  const addResult = useCallback((result: Omit<GameResult, "id" | "timestamp">) => {
    const newResult: GameResult = {
      ...result,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    setResults(prev => {
      const updated = [newResult, ...prev].slice(0, MAX_RESULTS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setResults([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { results, addResult, clearHistory };
}
