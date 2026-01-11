import { useState, useEffect, useRef } from "react";

interface GameConfig {
  baseMin: number;
  baseMax: number;
  spikeChance: number;
  spikeMultiplier: number;
}

const gameConfigs: Record<string, GameConfig> = {
  dice: { baseMin: 15, baseMax: 45, spikeChance: 0.08, spikeMultiplier: 3 },
  coinflip: { baseMin: 25, baseMax: 65, spikeChance: 0.1, spikeMultiplier: 2.5 },
  mines: { baseMin: 20, baseMax: 55, spikeChance: 0.07, spikeMultiplier: 2.8 },
  roulette: { baseMin: 40, baseMax: 90, spikeChance: 0.12, spikeMultiplier: 2 },
  plinko: { baseMin: 30, baseMax: 70, spikeChance: 0.09, spikeMultiplier: 2.5 },
  blackjack: { baseMin: 35, baseMax: 80, spikeChance: 0.1, spikeMultiplier: 2.2 },
  spin: { baseMin: 50, baseMax: 120, spikeChance: 0.15, spikeMultiplier: 1.8 },
};

const defaultConfig: GameConfig = { baseMin: 20, baseMax: 60, spikeChance: 0.1, spikeMultiplier: 2 };

function getInitialCount(gameId: string): number {
  const config = gameConfigs[gameId] || defaultConfig;
  return Math.floor(config.baseMin + Math.random() * (config.baseMax - config.baseMin));
}

function getNextCount(currentCount: number, gameId: string): number {
  const config = gameConfigs[gameId] || defaultConfig;
  
  const isSpike = Math.random() < config.spikeChance;
  
  if (isSpike) {
    const spikeDirection = Math.random() > 0.3 ? 1 : -1;
    const spikeAmount = Math.floor((config.baseMax - config.baseMin) * 0.5 * Math.random() * config.spikeMultiplier);
    const newCount = currentCount + (spikeDirection * spikeAmount);
    return Math.max(2, Math.min(newCount, config.baseMax * config.spikeMultiplier));
  }
  
  const maxStep = Math.floor((config.baseMax - config.baseMin) * 0.15);
  const step = Math.floor(Math.random() * maxStep * 2) - maxStep;
  
  let newCount = currentCount + step;
  
  const targetMid = (config.baseMin + config.baseMax) / 2;
  if (newCount < config.baseMin) {
    newCount = config.baseMin + Math.floor(Math.random() * 10);
  } else if (newCount > config.baseMax * 1.5) {
    newCount = currentCount - Math.abs(step) - Math.floor(Math.random() * 5);
  }
  
  if (Math.random() < 0.1) {
    newCount = Math.floor(newCount + (targetMid - newCount) * 0.3);
  }
  
  return Math.max(2, Math.floor(newCount));
}

function getRandomInterval(): number {
  return 10000 + Math.random() * 15000;
}

const playerCounts: Map<string, number> = new Map();
const listeners: Map<string, Set<(count: number) => void>> = new Map();
const intervals: Map<string, NodeJS.Timeout> = new Map();

function initGame(gameId: string) {
  if (!playerCounts.has(gameId)) {
    playerCounts.set(gameId, getInitialCount(gameId));
    listeners.set(gameId, new Set());
    
    const tick = () => {
      const current = playerCounts.get(gameId) || 0;
      const next = getNextCount(current, gameId);
      playerCounts.set(gameId, next);
      
      listeners.get(gameId)?.forEach(cb => cb(next));
      
      const existingInterval = intervals.get(gameId);
      if (existingInterval) clearTimeout(existingInterval);
      intervals.set(gameId, setTimeout(tick, getRandomInterval()));
    };
    
    intervals.set(gameId, setTimeout(tick, getRandomInterval()));
  }
}

export function useLivePlayerCount(gameId: string): number {
  const [count, setCount] = useState<number>(() => {
    initGame(gameId);
    return playerCounts.get(gameId) || getInitialCount(gameId);
  });
  
  useEffect(() => {
    initGame(gameId);
    
    const callback = (newCount: number) => setCount(newCount);
    listeners.get(gameId)?.add(callback);
    
    setCount(playerCounts.get(gameId) || getInitialCount(gameId));
    
    return () => {
      listeners.get(gameId)?.delete(callback);
    };
  }, [gameId]);
  
  return count;
}
