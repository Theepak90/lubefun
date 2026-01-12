import { useCallback, useEffect, useState } from "react";
import diceWinSound from "@assets/dive22_1768191472537.mp3";
import minesClickSound from "@assets/mines_1768192528589.mp3";

const SOUND_STORAGE_KEY = "sound_enabled";

type SoundType = "bet" | "win" | "lose" | "tick" | "flip" | "land" | "spin" | "result" | "chipDrop" | "ballTick" | "ballLand" | "plinkoDrop" | "cardDeal" | "diceWin" | "minesClick";

const audioCache: { [key: string]: HTMLAudioElement } = {};

function playAudioFile(src: string, volume: number = 0.5) {
  if (!audioCache[src]) {
    audioCache[src] = new Audio(src);
  }
  const audio = audioCache[src];
  audio.volume = volume;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

const audioContextRef: { current: AudioContext | null } = { current: null };

function getAudioContext(): AudioContext {
  if (!audioContextRef.current) {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContextRef.current;
}

function playTone(frequency: number, duration: number, type: OscillatorType = "sine", volume: number = 0.15) {
  const ctx = getAudioContext();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  oscillator.frequency.value = frequency;
  oscillator.type = type;
  
  gainNode.gain.setValueAtTime(volume, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + duration);
}

function playBetSound() {
  const ctx = getAudioContext();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  oscillator.frequency.setValueAtTime(800, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);
  oscillator.type = "sine";
  
  gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
  
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.1);
}

function playWinSound() {
  const ctx = getAudioContext();
  
  const notes = [523.25, 659.25, 783.99];
  notes.forEach((freq, i) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.value = freq;
    oscillator.type = "sine";
    
    const startTime = ctx.currentTime + i * 0.08;
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.12, startTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);
    
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.2);
  });
}

function playLoseSound() {
  const ctx = getAudioContext();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  oscillator.frequency.setValueAtTime(200, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.15);
  oscillator.type = "triangle";
  
  gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.15);
}

function playTickSound() {
  const ctx = getAudioContext();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  oscillator.frequency.value = 1200;
  oscillator.type = "sine";
  
  gainNode.gain.setValueAtTime(0.06, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
  
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.05);
}

function playFlipSound() {
  const ctx = getAudioContext();
  
  for (let i = 0; i < 12; i++) {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    const startTime = ctx.currentTime + i * 0.08;
    oscillator.frequency.value = 300 + Math.random() * 150 + (i * 20);
    oscillator.type = "sine";
    
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.03, startTime + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.06);
    
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.06);
  }
}

function playLandSound() {
  const ctx = getAudioContext();
  
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  oscillator.frequency.setValueAtTime(200, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.15);
  oscillator.type = "sine";
  
  gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
  
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.2);
}

function playSpinSound() {
  const ctx = getAudioContext();
  
  // Create a whooshing spin sound that slows down
  for (let i = 0; i < 20; i++) {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // Increasing delay between ticks to simulate slowing
    const delay = i * (0.05 + i * 0.015);
    const startTime = ctx.currentTime + delay;
    
    oscillator.frequency.value = 400 + Math.random() * 200;
    oscillator.type = "sine";
    
    const volume = 0.08 * (1 - i / 25);
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.04);
    
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.04);
  }
}

function playResultSound() {
  const ctx = getAudioContext();
  
  // A distinctive "ding" for the result
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  oscillator.frequency.value = 880;
  oscillator.type = "sine";
  
  gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.3);
}

function playChipDropSound() {
  const ctx = getAudioContext();
  
  // Soft chip click - low volume, quick attack, simulates chip on felt
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  
  oscillator.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  // Low-mid frequency thud with quick decay
  oscillator.frequency.setValueAtTime(180, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.08);
  oscillator.type = "sine";
  
  // Low-pass filter to soften the sound
  filter.type = "lowpass";
  filter.frequency.value = 400;
  filter.Q.value = 1;
  
  // Very low volume, quick attack and decay
  gainNode.gain.setValueAtTime(0.06, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
  
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.1);
  
  // Add a subtle high click on top
  const clickOsc = ctx.createOscillator();
  const clickGain = ctx.createGain();
  
  clickOsc.connect(clickGain);
  clickGain.connect(ctx.destination);
  
  clickOsc.frequency.value = 2000;
  clickOsc.type = "sine";
  
  clickGain.gain.setValueAtTime(0.02, ctx.currentTime);
  clickGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);
  
  clickOsc.start(ctx.currentTime);
  clickOsc.stop(ctx.currentTime + 0.02);
}

function playBallTickSound() {
  const ctx = getAudioContext();
  
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  oscillator.frequency.value = 2800 + Math.random() * 400;
  oscillator.type = "sine";
  
  gainNode.gain.setValueAtTime(0.04, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025);
  
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.025);
}

function playBallLandSound() {
  const ctx = getAudioContext();
  
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  oscillator.frequency.setValueAtTime(600, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.15);
  oscillator.type = "triangle";
  
  gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
  
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.2);
  
  const clickOsc = ctx.createOscillator();
  const clickGain = ctx.createGain();
  
  clickOsc.connect(clickGain);
  clickGain.connect(ctx.destination);
  
  clickOsc.frequency.value = 1200;
  clickOsc.type = "sine";
  
  clickGain.gain.setValueAtTime(0.08, ctx.currentTime);
  clickGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
  
  clickOsc.start(ctx.currentTime);
  clickOsc.stop(ctx.currentTime + 0.05);
}

function playPlinkoDropSound() {
  const ctx = getAudioContext();
  
  // Subtle whoosh sound - white noise filtered with quick fade
  const bufferSize = ctx.sampleRate * 0.12;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  
  // Generate noise
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.3;
  }
  
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = buffer;
  
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 800;
  filter.Q.value = 0.5;
  
  const gainNode = ctx.createGain();
  
  noiseSource.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  // Quick fade in and out for whoosh effect
  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
  
  noiseSource.start(ctx.currentTime);
  noiseSource.stop(ctx.currentTime + 0.12);
}

function playCardDealSound() {
  const ctx = getAudioContext();
  
  // Paper flick sound - short noise burst with high-pass filter
  const bufferSize = ctx.sampleRate * 0.08;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.5;
  }
  
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = buffer;
  
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 2000;
  filter.Q.value = 0.5;
  
  const gainNode = ctx.createGain();
  
  noiseSource.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
  
  noiseSource.start(ctx.currentTime);
  noiseSource.stop(ctx.currentTime + 0.08);
}

export function useSound() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(SOUND_STORAGE_KEY);
    return stored === "true";
  });

  useEffect(() => {
    localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
  }, [enabled]);

  const play = useCallback((type: SoundType) => {
    if (!enabled) return;
    
    try {
      switch (type) {
        case "bet":
          playBetSound();
          break;
        case "win":
          playWinSound();
          break;
        case "lose":
          playLoseSound();
          break;
        case "tick":
          playTickSound();
          break;
        case "flip":
          playFlipSound();
          break;
        case "land":
          playLandSound();
          break;
        case "spin":
          playSpinSound();
          break;
        case "result":
          playResultSound();
          break;
        case "chipDrop":
          playChipDropSound();
          break;
        case "ballTick":
          playBallTickSound();
          break;
        case "ballLand":
          playBallLandSound();
          break;
        case "plinkoDrop":
          playPlinkoDropSound();
          break;
        case "cardDeal":
          playCardDealSound();
          break;
        case "diceWin":
          playAudioFile(diceWinSound, 0.5);
          break;
        case "minesClick":
          playAudioFile(minesClickSound, 0.5);
          break;
      }
    } catch (e) {
      console.warn("Sound playback failed:", e);
    }
  }, [enabled]);

  const toggle = useCallback(() => {
    setEnabled(prev => !prev);
  }, []);

  return { enabled, toggle, play };
}

export function useSoundContext() {
  return useSound();
}
