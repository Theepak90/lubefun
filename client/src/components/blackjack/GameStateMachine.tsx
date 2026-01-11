import { useCallback, useRef } from "react";

export type BlackjackPhase = 
  | "BETTING"
  | "DEALING"
  | "PLAYER_TURN"
  | "DEALER_TURN"
  | "SETTLEMENT"
  | "ROUND_COMPLETE";

export interface GameStateContext {
  phase: BlackjackPhase;
  roundId: string;
  statusText: string;
  isInputBlocked: boolean;
}

export function useBlackjackStateMachine() {
  const stateRef = useRef<GameStateContext>({
    phase: "BETTING",
    roundId: generateRoundId(),
    statusText: "Place your bets",
    isInputBlocked: false,
  });

  const listeners = useRef<Set<() => void>>(new Set());

  const subscribe = useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);

  const notify = useCallback(() => {
    listeners.current.forEach(l => l());
  }, []);

  const getState = useCallback(() => stateRef.current, []);

  const transition = useCallback((
    newPhase: BlackjackPhase,
    options?: { statusText?: string; newRound?: boolean }
  ) => {
    const currentPhase = stateRef.current.phase;
    
    if (!isValidTransition(currentPhase, newPhase)) {
      console.warn(`Invalid state transition: ${currentPhase} -> ${newPhase}`);
      return false;
    }

    stateRef.current = {
      phase: newPhase,
      roundId: options?.newRound ? generateRoundId() : stateRef.current.roundId,
      statusText: options?.statusText || getDefaultStatusText(newPhase),
      isInputBlocked: shouldBlockInput(newPhase),
    };

    notify();
    return true;
  }, [notify]);

  const setStatusText = useCallback((text: string) => {
    stateRef.current = { ...stateRef.current, statusText: text };
    notify();
  }, [notify]);

  const canPerformAction = useCallback((action: string): boolean => {
    const { phase, isInputBlocked } = stateRef.current;
    if (isInputBlocked) return false;

    switch (action) {
      case "place_bet":
      case "clear_bet":
      case "rebet":
        return phase === "BETTING" || phase === "ROUND_COMPLETE";
      case "deal":
        return phase === "BETTING";
      case "hit":
      case "stand":
      case "double":
        return phase === "PLAYER_TURN";
      case "new_hand":
        return phase === "ROUND_COMPLETE";
      default:
        return false;
    }
  }, []);

  return {
    getState,
    subscribe,
    transition,
    setStatusText,
    canPerformAction,
  };
}

function generateRoundId(): string {
  return `round-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function isValidTransition(from: BlackjackPhase, to: BlackjackPhase): boolean {
  const validTransitions: Record<BlackjackPhase, BlackjackPhase[]> = {
    BETTING: ["DEALING"],
    DEALING: ["PLAYER_TURN", "SETTLEMENT"],
    PLAYER_TURN: ["DEALER_TURN", "SETTLEMENT"],
    DEALER_TURN: ["SETTLEMENT"],
    SETTLEMENT: ["ROUND_COMPLETE"],
    ROUND_COMPLETE: ["BETTING"],
  };

  return validTransitions[from]?.includes(to) ?? false;
}

function shouldBlockInput(phase: BlackjackPhase): boolean {
  return phase === "DEALING" || phase === "DEALER_TURN" || phase === "SETTLEMENT";
}

function getDefaultStatusText(phase: BlackjackPhase): string {
  switch (phase) {
    case "BETTING": return "Place your bets";
    case "DEALING": return "Dealing...";
    case "PLAYER_TURN": return "Your turn";
    case "DEALER_TURN": return "Dealer's turn";
    case "SETTLEMENT": return "Settling bets...";
    case "ROUND_COMPLETE": return "Round complete";
    default: return "";
  }
}
