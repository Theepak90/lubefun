export type GamePhase = 
  | "IDLE" 
  | "DEALING" 
  | "INSURANCE" 
  | "PLAYER_TURN" 
  | "DEALER_TURN" 
  | "ROUND_END";

export interface Card {
  index: number;
  rank: string;
  suit: string;
  value: number;
}

export interface Hand {
  cards: Card[];
  bet: number;
  isDoubled: boolean;
  isSplit: boolean;
  isStood: boolean;
  isBusted: boolean;
  isBlackjack: boolean;
  insuranceBet: number;
}

export interface GameState {
  phase: GamePhase;
  shoe: number[];
  dealerHand: Card[];
  dealerHoleRevealed: boolean;
  playerHands: Hand[];
  activeHandIndex: number;
  balance: number;
  pendingBet: number;
  lastAction: string;
  message: string;
  roundResult: RoundResult | null;
  animationQueue: AnimationEvent[];
  isAnimating: boolean;
  isProcessing: boolean;
  dealerHitsSoft17: boolean;
  deckCount: number;
  reshuffleThreshold: number;
}

export interface RoundResult {
  outcomes: HandOutcome[];
  totalPayout: number;
  insurancePayout: number;
}

export interface HandOutcome {
  handIndex: number;
  result: "win" | "lose" | "push" | "blackjack";
  payout: number;
  dealerTotal: number;
  playerTotal: number;
}

export interface AnimationEvent {
  type: "deal_player" | "deal_dealer" | "reveal_hole" | "dealer_hit" | "result";
  card?: Card;
  handIndex?: number;
  delay: number;
}

const SUITS = ["spades", "hearts", "diamonds", "clubs"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function createCard(index: number): Card {
  const rankIndex = index % 13;
  const suitIndex = Math.floor(index / 13) % 4;
  let value = rankIndex + 1;
  if (rankIndex === 0) value = 11;
  else if (rankIndex >= 10) value = 10;
  
  return {
    index,
    rank: RANKS[rankIndex],
    suit: SUITS[suitIndex],
    value,
  };
}

export function createShoe(deckCount: number = 6): number[] {
  const shoe: number[] = [];
  for (let d = 0; d < deckCount; d++) {
    for (let i = 0; i < 52; i++) {
      shoe.push(i);
    }
  }
  return shuffleArray(shoe);
}

function shuffleArray(array: number[]): number[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function calculateHandTotal(cards: Card[]): { total: number; isSoft: boolean } {
  let total = 0;
  let aces = 0;
  
  for (const card of cards) {
    total += card.value;
    if (card.rank === "A") aces++;
  }
  
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  
  return { total, isSoft: aces > 0 && total <= 21 };
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && calculateHandTotal(cards).total === 21;
}

export function isBusted(cards: Card[]): boolean {
  return calculateHandTotal(cards).total > 21;
}

export function canSplit(hand: Hand, balance: number): boolean {
  if (hand.cards.length !== 2) return false;
  if (hand.isSplit) return false;
  if (balance < hand.bet) return false;
  const rank1 = hand.cards[0].rank;
  const rank2 = hand.cards[1].rank;
  const val1 = hand.cards[0].value;
  const val2 = hand.cards[1].value;
  return rank1 === rank2 || (val1 === 10 && val2 === 10);
}

export function canDouble(hand: Hand, balance: number): boolean {
  if (hand.cards.length !== 2) return false;
  if (hand.isDoubled) return false;
  if (balance < hand.bet) return false;
  return true;
}

export function canInsurance(dealerHand: Card[], phase: GamePhase): boolean {
  if (phase !== "INSURANCE") return false;
  if (dealerHand.length < 1) return false;
  return dealerHand[0].rank === "A";
}

export function shouldDealerHit(cards: Card[], hitsSoft17: boolean): boolean {
  const { total, isSoft } = calculateHandTotal(cards);
  if (total < 17) return true;
  if (total === 17 && isSoft && hitsSoft17) return true;
  return false;
}

export function createInitialState(balance: number = 1000): GameState {
  return {
    phase: "IDLE",
    shoe: createShoe(6),
    dealerHand: [],
    dealerHoleRevealed: false,
    playerHands: [],
    activeHandIndex: 0,
    balance,
    pendingBet: 0,
    lastAction: "init",
    message: "Place your bet",
    roundResult: null,
    animationQueue: [],
    isAnimating: false,
    isProcessing: false,
    dealerHitsSoft17: true,
    deckCount: 6,
    reshuffleThreshold: 52,
  };
}

export function drawCard(state: GameState): { card: Card; newShoe: number[] } {
  let shoe = [...state.shoe];
  
  if (shoe.length < state.reshuffleThreshold) {
    shoe = createShoe(state.deckCount);
  }
  
  const cardIndex = shoe.shift()!;
  return {
    card: createCard(cardIndex),
    newShoe: shoe,
  };
}

export function settleHands(state: GameState): RoundResult {
  const dealerTotal = calculateHandTotal(state.dealerHand).total;
  const dealerBusted = dealerTotal > 21;
  const dealerBlackjack = isBlackjack(state.dealerHand);
  const outcomes: HandOutcome[] = [];
  let totalPayout = 0;
  let insurancePayout = 0;

  if (dealerBlackjack) {
    for (const hand of state.playerHands) {
      if (hand.insuranceBet > 0) {
        insurancePayout += hand.insuranceBet * 3;
      }
    }
  }

  for (let i = 0; i < state.playerHands.length; i++) {
    const hand = state.playerHands[i];
    const playerTotal = calculateHandTotal(hand.cards).total;
    const playerBlackjack = isBlackjack(hand.cards) && !hand.isSplit;
    const playerBusted = playerTotal > 21;

    let result: "win" | "lose" | "push" | "blackjack";
    let payout = 0;

    if (playerBusted) {
      result = "lose";
      payout = 0;
    } else if (playerBlackjack && !dealerBlackjack) {
      result = "blackjack";
      payout = hand.bet + hand.bet * 1.5;
    } else if (dealerBlackjack && !playerBlackjack) {
      result = "lose";
      payout = 0;
    } else if (dealerBusted) {
      result = "win";
      payout = hand.bet * 2;
    } else if (playerTotal > dealerTotal) {
      result = "win";
      payout = hand.bet * 2;
    } else if (playerTotal < dealerTotal) {
      result = "lose";
      payout = 0;
    } else {
      result = "push";
      payout = hand.bet;
    }

    totalPayout += payout;
    outcomes.push({
      handIndex: i,
      result,
      payout,
      dealerTotal,
      playerTotal,
    });
  }

  return { outcomes, totalPayout: totalPayout + insurancePayout, insurancePayout };
}

export type GameAction =
  | { type: "SET_BET"; amount: number }
  | { type: "ADD_CHIP"; value: number }
  | { type: "UNDO_CHIP"; value: number }
  | { type: "CLEAR_BET" }
  | { type: "DEAL" }
  | { type: "DEAL_COMPLETE" }
  | { type: "HIT" }
  | { type: "STAND" }
  | { type: "DOUBLE" }
  | { type: "SPLIT" }
  | { type: "INSURANCE"; accept: boolean }
  | { type: "INSURANCE_COMPLETE" }
  | { type: "REVEAL_HOLE" }
  | { type: "DEALER_PLAY" }
  | { type: "DEALER_COMPLETE" }
  | { type: "FORCE_ROUND_END" }
  | { type: "ANIMATION_COMPLETE" }
  | { type: "NEW_ROUND" }
  | { type: "SET_BALANCE"; balance: number }
  | { type: "SET_PROCESSING"; value: boolean };

export function gameReducer(state: GameState, action: GameAction): GameState {
  const log = `[${state.phase}] ${action.type}`;
  
  switch (action.type) {
    case "SET_BALANCE": {
      return { ...state, balance: action.balance };
    }

    case "ADD_CHIP": {
      if (state.phase !== "IDLE") return state;
      if (action.value > state.balance - state.pendingBet) return state;
      return {
        ...state,
        pendingBet: Math.round((state.pendingBet + action.value) * 100) / 100,
        lastAction: log,
      };
    }

    case "UNDO_CHIP": {
      if (state.phase !== "IDLE") return state;
      const newBet = Math.max(0, Math.round((state.pendingBet - action.value) * 100) / 100);
      return {
        ...state,
        pendingBet: newBet,
        lastAction: log,
      };
    }

    case "CLEAR_BET": {
      if (state.phase !== "IDLE") return state;
      return {
        ...state,
        pendingBet: 0,
        lastAction: log,
      };
    }

    case "DEAL": {
      if (state.phase !== "IDLE") return state;
      if (state.pendingBet <= 0) return state;
      if (state.pendingBet > state.balance) return state;

      let shoe = [...state.shoe];
      if (shoe.length < state.reshuffleThreshold) {
        shoe = createShoe(state.deckCount);
      }

      const playerCard1 = createCard(shoe.shift()!);
      const dealerCard1 = createCard(shoe.shift()!);
      const playerCard2 = createCard(shoe.shift()!);
      const dealerCard2 = createCard(shoe.shift()!);

      const playerHand: Hand = {
        cards: [playerCard1, playerCard2],
        bet: state.pendingBet,
        isDoubled: false,
        isSplit: false,
        isStood: false,
        isBusted: false,
        isBlackjack: isBlackjack([playerCard1, playerCard2]),
        insuranceBet: 0,
      };

      const dealerShowsAce = dealerCard1.rank === "A";
      const playerHasBlackjack = playerHand.isBlackjack;
      const dealerHasBlackjack = isBlackjack([dealerCard1, dealerCard2]);

      let nextPhase: GamePhase = "PLAYER_TURN";
      let message = "Your turn";

      if (dealerShowsAce && !playerHasBlackjack) {
        nextPhase = "INSURANCE";
        message = "Insurance?";
      } else if (playerHasBlackjack || dealerHasBlackjack) {
        nextPhase = "ROUND_END";
        message = playerHasBlackjack ? "Blackjack!" : "Dealer Blackjack";
      }

      const newState: GameState = {
        ...state,
        phase: nextPhase,
        shoe,
        dealerHand: [dealerCard1, dealerCard2],
        dealerHoleRevealed: nextPhase === "ROUND_END",
        playerHands: [playerHand],
        activeHandIndex: 0,
        balance: state.balance - state.pendingBet,
        pendingBet: 0,
        message,
        lastAction: log,
        roundResult: null,
      };

      if (nextPhase === "ROUND_END") {
        const result = settleHands({
          ...newState,
          dealerHoleRevealed: true,
        });
        return {
          ...newState,
          dealerHoleRevealed: true,
          roundResult: result,
          balance: newState.balance + result.totalPayout,
          message: result.outcomes[0]?.result === "blackjack" 
            ? "Blackjack! You win!" 
            : result.outcomes[0]?.result === "push"
            ? "Push - Bet returned"
            : "Dealer wins",
        };
      }

      return newState;
    }

    case "INSURANCE": {
      if (state.phase !== "INSURANCE") return state;
      const hand = state.playerHands[0];
      
      if (action.accept) {
        const insuranceAmount = hand.bet / 2;
        if (insuranceAmount > state.balance) return state;
        
        const updatedHands = [...state.playerHands];
        updatedHands[0] = { ...hand, insuranceBet: insuranceAmount };
        
        return {
          ...state,
          playerHands: updatedHands,
          balance: state.balance - insuranceAmount,
          phase: "PLAYER_TURN",
          message: "Your turn",
          lastAction: log,
        };
      } else {
        return {
          ...state,
          phase: "PLAYER_TURN",
          message: "Your turn",
          lastAction: log,
        };
      }
    }

    case "HIT": {
      if (state.phase !== "PLAYER_TURN") return state;
      if (state.isAnimating) return state;
      
      const hand = state.playerHands[state.activeHandIndex];
      if (hand.isStood || hand.isBusted) return state;

      let shoe = [...state.shoe];
      if (shoe.length < 1) {
        shoe = createShoe(state.deckCount);
      }
      const newCard = createCard(shoe.shift()!);
      
      const updatedCards = [...hand.cards, newCard];
      const busted = isBusted(updatedCards);
      
      const updatedHand: Hand = {
        ...hand,
        cards: updatedCards,
        isBusted: busted,
        isStood: busted,
      };

      const updatedHands = [...state.playerHands];
      updatedHands[state.activeHandIndex] = updatedHand;

      let nextPhase: GamePhase = "PLAYER_TURN";
      let message = busted ? "Bust!" : "Your turn";
      let activeIndex = state.activeHandIndex;

      if (busted) {
        const nextHandIndex = findNextPlayableHand(updatedHands, state.activeHandIndex);
        if (nextHandIndex === -1) {
          nextPhase = "DEALER_TURN";
          message = "Dealer's turn";
        } else {
          activeIndex = nextHandIndex;
          message = `Playing hand ${nextHandIndex + 1}`;
        }
      }

      return {
        ...state,
        shoe,
        playerHands: updatedHands,
        activeHandIndex: activeIndex,
        phase: nextPhase,
        message,
        lastAction: log,
      };
    }

    case "STAND": {
      if (state.phase !== "PLAYER_TURN") return state;
      if (state.isAnimating) return state;
      
      const hand = state.playerHands[state.activeHandIndex];
      if (hand.isStood) return state;

      const updatedHand: Hand = { ...hand, isStood: true };
      const updatedHands = [...state.playerHands];
      updatedHands[state.activeHandIndex] = updatedHand;

      const nextHandIndex = findNextPlayableHand(updatedHands, state.activeHandIndex);
      
      if (nextHandIndex === -1) {
        return {
          ...state,
          playerHands: updatedHands,
          phase: "DEALER_TURN",
          message: "Dealer's turn",
          lastAction: log,
        };
      }

      return {
        ...state,
        playerHands: updatedHands,
        activeHandIndex: nextHandIndex,
        message: `Playing hand ${nextHandIndex + 1}`,
        lastAction: log,
      };
    }

    case "DOUBLE": {
      if (state.phase !== "PLAYER_TURN") return state;
      if (state.isAnimating) return state;
      
      const hand = state.playerHands[state.activeHandIndex];
      if (!canDouble(hand, state.balance)) return state;

      let shoe = [...state.shoe];
      if (shoe.length < 1) {
        shoe = createShoe(state.deckCount);
      }
      const newCard = createCard(shoe.shift()!);
      
      const updatedCards = [...hand.cards, newCard];
      const busted = isBusted(updatedCards);
      
      const updatedHand: Hand = {
        ...hand,
        cards: updatedCards,
        bet: hand.bet * 2,
        isDoubled: true,
        isBusted: busted,
        isStood: true,
      };

      const updatedHands = [...state.playerHands];
      updatedHands[state.activeHandIndex] = updatedHand;

      const nextHandIndex = findNextPlayableHand(updatedHands, state.activeHandIndex);
      
      let nextPhase: GamePhase = "PLAYER_TURN";
      let message = busted ? "Bust!" : "Doubled";
      let activeIndex = state.activeHandIndex;

      if (nextHandIndex === -1) {
        nextPhase = "DEALER_TURN";
        message = "Dealer's turn";
      } else {
        activeIndex = nextHandIndex;
        message = `Playing hand ${nextHandIndex + 1}`;
      }

      return {
        ...state,
        shoe,
        playerHands: updatedHands,
        activeHandIndex: activeIndex,
        balance: state.balance - hand.bet,
        phase: nextPhase,
        message,
        lastAction: log,
      };
    }

    case "SPLIT": {
      if (state.phase !== "PLAYER_TURN") return state;
      if (state.isAnimating) return state;
      
      const hand = state.playerHands[state.activeHandIndex];
      if (!canSplit(hand, state.balance)) return state;

      let shoe = [...state.shoe];
      if (shoe.length < 2) {
        shoe = createShoe(state.deckCount);
      }
      
      const card1 = createCard(shoe.shift()!);
      const card2 = createCard(shoe.shift()!);

      const hand1: Hand = {
        cards: [hand.cards[0], card1],
        bet: hand.bet,
        isDoubled: false,
        isSplit: true,
        isStood: false,
        isBusted: false,
        isBlackjack: false,
        insuranceBet: 0,
      };

      const hand2: Hand = {
        cards: [hand.cards[1], card2],
        bet: hand.bet,
        isDoubled: false,
        isSplit: true,
        isStood: false,
        isBusted: false,
        isBlackjack: false,
        insuranceBet: 0,
      };

      const updatedHands = [...state.playerHands];
      updatedHands.splice(state.activeHandIndex, 1, hand1, hand2);

      return {
        ...state,
        shoe,
        playerHands: updatedHands,
        balance: state.balance - hand.bet,
        message: "Playing hand 1",
        lastAction: log,
      };
    }

    case "REVEAL_HOLE": {
      if (state.dealerHoleRevealed) return state;
      console.log("[Engine] REVEAL_HOLE - revealing dealer hole card");
      return {
        ...state,
        dealerHoleRevealed: true,
        lastAction: log,
      };
    }

    case "DEALER_PLAY": {
      if (state.phase !== "DEALER_TURN") {
        console.log("[Engine] DEALER_PLAY ignored - not in DEALER_TURN phase, current:", state.phase);
        return state;
      }

      console.log("[Engine] DEALER_PLAY starting");
      const allBusted = state.playerHands.every(h => h.isBusted);
      
      if (allBusted) {
        console.log("[Engine] All players busted, skipping dealer draws");
        const result = settleHands({
          ...state,
          dealerHoleRevealed: true,
        });
        return {
          ...state,
          phase: "ROUND_END",
          dealerHoleRevealed: true,
          roundResult: result,
          balance: state.balance + result.totalPayout,
          message: "You bust - Dealer wins",
          lastAction: log,
        };
      }

      let dealerHand = [...state.dealerHand];
      let shoe = [...state.shoe];
      const MAX_DEALER_DRAWS = 10;
      let drawCount = 0;

      while (shouldDealerHit(dealerHand, state.dealerHitsSoft17) && drawCount < MAX_DEALER_DRAWS) {
        if (shoe.length < 1) {
          shoe = createShoe(state.deckCount);
        }
        const newCard = createCard(shoe.shift()!);
        dealerHand.push(newCard);
        drawCount++;
        const { total } = calculateHandTotal(dealerHand);
        console.log(`[Engine] Dealer draw #${drawCount}: ${newCard.rank}${newCard.suit}, total: ${total}`);
      }

      if (drawCount >= MAX_DEALER_DRAWS) {
        console.warn("[Engine] Dealer hit MAX_DEALER_DRAWS safety limit");
      }

      const { total: finalTotal } = calculateHandTotal(dealerHand);
      console.log(`[Engine] Dealer finished with ${dealerHand.length} cards, total: ${finalTotal}`);

      const updatedState: GameState = {
        ...state,
        shoe,
        dealerHand,
        dealerHoleRevealed: true,
        phase: "ROUND_END",
        lastAction: log,
      };

      const result = settleHands(updatedState);
      const mainOutcome = result.outcomes[0];
      let message = "Round complete";
      
      if (mainOutcome) {
        if (mainOutcome.result === "blackjack") message = "Blackjack! You win!";
        else if (mainOutcome.result === "win") message = "You win!";
        else if (mainOutcome.result === "push") message = "Push - Bet returned";
        else message = "Dealer wins";
      }

      console.log("[Engine] DEALER_PLAY complete, transitioning to ROUND_END");
      return {
        ...updatedState,
        roundResult: result,
        balance: updatedState.balance + result.totalPayout,
        message,
      };
    }

    case "FORCE_ROUND_END": {
      console.log("[Engine] FORCE_ROUND_END - emergency transition to ROUND_END");
      const result = settleHands({
        ...state,
        dealerHoleRevealed: true,
      });
      return {
        ...state,
        phase: "ROUND_END",
        dealerHoleRevealed: true,
        roundResult: result,
        balance: state.balance + result.totalPayout,
        message: "Round ended",
        lastAction: log,
        isProcessing: false,
      };
    }

    case "NEW_ROUND": {
      let shoe = [...state.shoe];
      if (shoe.length < state.reshuffleThreshold) {
        shoe = createShoe(state.deckCount);
      }

      return {
        ...state,
        phase: "IDLE",
        shoe,
        dealerHand: [],
        dealerHoleRevealed: false,
        playerHands: [],
        activeHandIndex: 0,
        pendingBet: 0,
        message: "Place your bet",
        roundResult: null,
        animationQueue: [],
        isAnimating: false,
        isProcessing: false,
        lastAction: log,
      };
    }

    case "SET_PROCESSING": {
      return { ...state, isProcessing: action.value };
    }

    case "ANIMATION_COMPLETE": {
      return { ...state, isAnimating: false };
    }

    default:
      return state;
  }
}

function findNextPlayableHand(hands: Hand[], currentIndex: number): number {
  for (let i = currentIndex + 1; i < hands.length; i++) {
    if (!hands[i].isStood && !hands[i].isBusted) {
      return i;
    }
  }
  return -1;
}

export function getAvailableActions(state: GameState): {
  canDeal: boolean;
  canHit: boolean;
  canStand: boolean;
  canDouble: boolean;
  canSplit: boolean;
  canInsurance: boolean;
  canNewRound: boolean;
} {
  const hand = state.playerHands[state.activeHandIndex];
  const locked = state.isProcessing || state.isAnimating;
  
  return {
    canDeal: state.phase === "IDLE" && state.pendingBet > 0 && state.pendingBet <= state.balance && !locked,
    canHit: state.phase === "PLAYER_TURN" && !locked && hand && !hand.isStood && !hand.isBusted,
    canStand: state.phase === "PLAYER_TURN" && !locked && hand && !hand.isStood,
    canDouble: state.phase === "PLAYER_TURN" && !locked && hand && canDouble(hand, state.balance),
    canSplit: state.phase === "PLAYER_TURN" && !locked && hand && canSplit(hand, state.balance),
    canInsurance: state.phase === "INSURANCE" && !locked,
    canNewRound: state.phase === "ROUND_END" && !locked,
  };
}
