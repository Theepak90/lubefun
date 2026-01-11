import { motion, useAnimation } from "framer-motion";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function getCardRank(cardIndex: number): string {
  return RANKS[cardIndex % 13];
}

function getCardSuit(cardIndex: number): string {
  return SUITS[Math.floor(cardIndex / 13)];
}

interface AnimatedCardProps {
  cardIndex: number;
  hidden?: boolean;
  delay?: number;
  onAnimationComplete?: () => void;
  isRevealing?: boolean;
  className?: string;
}

export function AnimatedCard({
  cardIndex,
  hidden = false,
  delay = 0,
  onAnimationComplete,
  isRevealing = false,
  className = "",
}: AnimatedCardProps) {
  const controls = useAnimation();
  const [isFlipped, setIsFlipped] = useState(hidden);
  const [showFront, setShowFront] = useState(!hidden);

  useEffect(() => {
    const animate = async () => {
      await controls.start({
        x: 0,
        y: 0,
        rotate: 0,
        scale: 1,
        opacity: 1,
        transition: {
          type: "spring",
          stiffness: 120,
          damping: 14,
          delay,
          duration: 0.6,
        },
      });
      onAnimationComplete?.();
    };
    animate();
  }, [controls, delay, onAnimationComplete]);

  useEffect(() => {
    if (isRevealing && isFlipped) {
      const flipCard = async () => {
        await controls.start({
          rotateY: 90,
          transition: { duration: 0.15, ease: "easeIn" },
        });
        setShowFront(true);
        setIsFlipped(false);
        await controls.start({
          rotateY: 0,
          transition: { duration: 0.2, ease: "easeOut" },
        });
      };
      flipCard();
    }
  }, [isRevealing, isFlipped, controls]);

  const rank = getCardRank(cardIndex);
  const suit = getCardSuit(cardIndex);
  const isRed = suit === 'hearts' || suit === 'diamonds';
  
  const suitSymbol = {
    spades: '♠',
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣'
  }[suit];

  return (
    <motion.div
      className={cn("relative perspective-1000", className)}
      initial={{
        x: 280,
        y: -180,
        rotate: -12 + Math.random() * 8,
        scale: 0.7,
        opacity: 0,
      }}
      animate={controls}
      style={{ perspective: 1000 }}
    >
      <motion.div
        className="w-16 h-22 md:w-18 md:h-24 relative preserve-3d"
        style={{ transformStyle: "preserve-3d" }}
      >
        {showFront ? (
          <div className={cn(
            "absolute inset-0 w-16 h-22 md:w-18 md:h-24 rounded-xl bg-white",
            "border-2 border-slate-200 flex flex-col items-center justify-center",
            "shadow-[0_4px_12px_rgba(0,0,0,0.3),0_2px_4px_rgba(0,0,0,0.2)]",
            "backface-hidden"
          )}>
            <div className="absolute top-1.5 left-2 flex flex-col items-center leading-none">
              <span className={cn("text-sm font-bold", isRed ? "text-red-600" : "text-slate-900")}>{rank}</span>
              <span className={cn("text-sm", isRed ? "text-red-600" : "text-slate-900")}>{suitSymbol}</span>
            </div>
            <span className={cn("text-2xl font-bold", isRed ? "text-red-600" : "text-slate-900")}>{rank}</span>
            <span className={cn("text-xl", isRed ? "text-red-600" : "text-slate-900")}>{suitSymbol}</span>
            <div className="absolute bottom-1.5 right-2 flex flex-col items-center leading-none rotate-180">
              <span className={cn("text-sm font-bold", isRed ? "text-red-600" : "text-slate-900")}>{rank}</span>
              <span className={cn("text-sm", isRed ? "text-red-600" : "text-slate-900")}>{suitSymbol}</span>
            </div>
          </div>
        ) : (
          <div className={cn(
            "absolute inset-0 w-16 h-22 md:w-18 md:h-24 rounded-xl",
            "bg-gradient-to-br from-blue-700 via-blue-800 to-blue-900",
            "border-2 border-blue-500",
            "shadow-[0_4px_12px_rgba(0,0,0,0.3),0_2px_4px_rgba(0,0,0,0.2)]",
            "flex items-center justify-center overflow-hidden"
          )}>
            <div className="absolute inset-2 rounded-lg border border-blue-400/40 bg-blue-700/30">
              <div className="w-full h-full grid grid-cols-4 grid-rows-5 gap-px p-1 opacity-40">
                {Array(20).fill(0).map((_, i) => (
                  <div key={i} className="bg-blue-400/50 rounded-sm" />
                ))}
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-blue-900/50 to-transparent" />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
