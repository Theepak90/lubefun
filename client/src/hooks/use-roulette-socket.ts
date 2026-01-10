import { useState, useEffect, useRef, useCallback } from "react";

export interface RoundState {
  roundId: number;
  status: "betting" | "spinning" | "results";
  countdown: number;
  bettingEndsAt: number;
  winningNumber?: number;
  winningColor?: string;
  recentNumbers: { number: number; color: string }[];
}

interface SocketMessage {
  type: string;
  round?: RoundState;
  countdown?: number;
  roundId?: number;
  winningNumber?: number;
  winningColor?: string;
  recentNumbers?: { number: number; color: string }[];
}

export function useRouletteSocket() {
  const [roundState, setRoundState] = useState<RoundState | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/roulette`;
    
    console.log("[RouletteSocket] Connecting to", wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[RouletteSocket] Connected");
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message: SocketMessage = JSON.parse(event.data);
        
        switch (message.type) {
          case "round_state":
          case "round_start":
            if (message.round) {
              setRoundState(message.round);
            }
            break;
            
          case "countdown":
            setRoundState((prev) => {
              if (!prev || prev.roundId !== message.roundId) return prev;
              return { ...prev, countdown: message.countdown || 0 };
            });
            break;
            
          case "spinning":
            setRoundState((prev) => {
              if (!prev || prev.roundId !== message.roundId) return prev;
              return {
                ...prev,
                status: "spinning",
                countdown: 0,
                winningNumber: message.winningNumber,
                winningColor: message.winningColor,
              };
            });
            break;
            
          case "results":
            setRoundState((prev) => {
              if (!prev || prev.roundId !== message.roundId) return prev;
              return {
                ...prev,
                status: "results",
                winningNumber: message.winningNumber,
                winningColor: message.winningColor,
                recentNumbers: message.recentNumbers || prev.recentNumbers,
              };
            });
            break;
        }
      } catch (err) {
        console.error("[RouletteSocket] Parse error:", err);
      }
    };

    ws.onclose = () => {
      console.log("[RouletteSocket] Disconnected");
      setConnected(false);
      wsRef.current = null;
      
      // Reconnect after delay
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 2000);
    };

    ws.onerror = (err) => {
      console.error("[RouletteSocket] Error:", err);
    };
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { roundState, connected };
}
