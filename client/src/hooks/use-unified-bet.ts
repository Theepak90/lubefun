import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { useState, useCallback, useRef } from "react";

type GameType = "dice" | "coinflip" | "mines" | "plinko" | "roulette" | "blackjack" | "splitsteal" | "pressurevalve";

interface UnifiedBetRequest {
  gameType: GameType;
  betAmount: number;
  gameData?: Record<string, any>;
}

interface UnifiedBetResponse {
  success: boolean;
  bet?: any;
  outcome?: any;
  newBalance?: number;
  error?: string;
}

export function useUnifiedBet() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const lastBetTimeRef = useRef<number>(0);
  const pendingRequestRef = useRef<AbortController | null>(null);
  
  const mutation = useMutation({
    mutationFn: async (data: UnifiedBetRequest): Promise<UnifiedBetResponse> => {
      const now = Date.now();
      if (now - lastBetTimeRef.current < 500) {
        throw new Error("Please wait before placing another bet");
      }
      
      if (pendingRequestRef.current) {
        pendingRequestRef.current.abort();
      }
      
      const controller = new AbortController();
      pendingRequestRef.current = controller;
      lastBetTimeRef.current = now;
      
      const idempotencyKey = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      try {
        const res = await fetch(api.bet.place.path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(data),
          signal: controller.signal,
        });
        
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || err.error || "Bet failed");
        }
        
        return await res.json();
      } finally {
        pendingRequestRef.current = null;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.games.history.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: [api.bet.recent.path] });
    },
    onError: (err: Error) => {
      if (err.name !== "AbortError") {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    },
  });
  
  const placeBet = useCallback(
    async (request: UnifiedBetRequest) => {
      if (isProcessing) {
        return null;
      }
      
      setIsProcessing(true);
      try {
        const result = await mutation.mutateAsync(request);
        return result;
      } finally {
        setTimeout(() => setIsProcessing(false), 300);
      }
    },
    [mutation, isProcessing]
  );
  
  return {
    placeBet,
    isProcessing: isProcessing || mutation.isPending,
    data: mutation.data,
    error: mutation.error,
    reset: mutation.reset,
  };
}

export function useRecentBets(limit: number = 50) {
  const queryClient = useQueryClient();
  
  return {
    data: queryClient.getQueryData<any[]>([api.bet.recent.path]) || [],
    refetch: () => queryClient.invalidateQueries({ queryKey: [api.bet.recent.path] }),
  };
}

export function useWithdrawal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: { amount: number; address: string }) => {
      const idempotencyKey = `withdraw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const res = await fetch(api.withdraw.request.path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || err.error || "Withdrawal failed");
      }
      
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: [api.withdraw.history.path] });
      toast({ title: "Success", description: "Withdrawal request submitted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useProvablyFair() {
  const queryClient = useQueryClient();
  
  return {
    data: queryClient.getQueryData<any>([api.provablyFair.info.path]),
    refetch: async () => {
      const res = await fetch(api.provablyFair.info.path);
      if (res.ok) {
        const data = await res.json();
        queryClient.setQueryData([api.provablyFair.info.path], data);
        return data;
      }
      return null;
    },
  };
}
