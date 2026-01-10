import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  api, 
  type DiceBetRequest, 
  type CoinflipBetRequest, 
  type MinesBetRequest, 
  type MinesNextRequest 
} from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

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

  return useMutation({
    mutationFn: async (data: DiceBetRequest) => {
      const res = await fetch(api.games.dice.play.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to place bet");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.games.history.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] }); // Update balance
      
      if (data.won) {
        toast({
          title: "You Won!",
          description: `Payout: $${data.profit?.toFixed(2)}`,
          className: "bg-primary text-primary-foreground border-none",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useCoinflipGame() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CoinflipBetRequest) => {
      const res = await fetch(api.games.coinflip.play.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to place bet");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.games.history.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      
      if (data.won) {
        toast({
          title: "You Won!",
          description: `Payout: $${data.profit?.toFixed(2)}`,
          className: "bg-primary text-primary-foreground border-none",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useMinesGame() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const start = useMutation({
    mutationFn: async (data: MinesBetRequest) => {
      const res = await fetch(api.games.mines.start.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to start game");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const reveal = useMutation({
    mutationFn: async ({ betId, tileIndex }: { betId: number, tileIndex: number }) => {
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
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const cashout = useMutation({
    mutationFn: async ({ betId }: { betId: number }) => {
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
