import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { useRef } from "react";

interface DiceBetRequest {
  betAmount: number;
  target: number;
  condition: "above" | "below";
}

interface CoinflipBetRequest {
  betAmount: number;
  side: "heads" | "tails";
}

interface MinesBetRequest {
  betAmount: number;
  minesCount: number;
}

interface MinesNextRequest {
  betId: number;
  tileIndex: number;
}

export function useGameHistory() {
  return useQuery({
    queryKey: [api.games.history.path],
    queryFn: async () => {
      const res = await fetch(api.games.history.path);
      if (!res.ok) throw new Error("Failed to fetch history");
      return await res.json();
    },
  });
}

export function useDiceGame() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const lastBetRef = useRef<number>(0);

  return useMutation({
    mutationFn: async (data: DiceBetRequest) => {
      const now = Date.now();
      if (now - lastBetRef.current < 500) {
        return null;
      }
      lastBetRef.current = now;
      
      const idempotencyKey = `dice-${now}-${Math.random().toString(36).substr(2, 9)}`;
      
      const res = await fetch(api.games.dice.play.path, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to place bet");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      if (data === null) return;
      queryClient.invalidateQueries({ queryKey: [api.games.history.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useCoinflipGame() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const lastBetRef = useRef<number>(0);

  return useMutation({
    mutationFn: async (data: CoinflipBetRequest) => {
      const now = Date.now();
      if (now - lastBetRef.current < 500) {
        return null;
      }
      lastBetRef.current = now;
      
      const idempotencyKey = `coinflip-${now}-${Math.random().toString(36).substr(2, 9)}`;
      
      const res = await fetch(api.games.coinflip.play.path, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to place bet");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      if (data === null) return;
      queryClient.invalidateQueries({ queryKey: [api.games.history.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useMinesGame() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const lastActionRef = useRef<number>(0);

  const start = useMutation({
    mutationFn: async (data: MinesBetRequest) => {
      const now = Date.now();
      if (now - lastActionRef.current < 500) {
        return null;
      }
      lastActionRef.current = now;
      
      const idempotencyKey = `mines-start-${now}-${Math.random().toString(36).substr(2, 9)}`;
      
      const res = await fetch(api.games.mines.start.path, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to start game");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      if (data === null) return;
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const reveal = useMutation({
    mutationFn: async ({ betId, tileIndex }: { betId: number, tileIndex: number }) => {
      const now = Date.now();
      if (now - lastActionRef.current < 300) {
        return null;
      }
      lastActionRef.current = now;
      
      const res = await fetch(api.games.mines.reveal.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betId, tileIndex }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to reveal tile");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      if (data === null) return;
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const cashout = useMutation({
    mutationFn: async ({ betId }: { betId: number }) => {
      const now = Date.now();
      if (now - lastActionRef.current < 500) {
        return null;
      }
      lastActionRef.current = now;
      
      const res = await fetch(api.games.mines.cashout.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to cashout");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      if (data === null) return;
      queryClient.invalidateQueries({ queryKey: [api.games.history.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      
      toast({
        title: "Cashed Out!",
        description: `You won $${data.profit?.toFixed(2)}`,
        className: "bg-primary text-primary-foreground border-none",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return { start, reveal, cashout };
}
