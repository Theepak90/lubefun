import { useState, useCallback, useRef } from "react";

export function useDebouncedClick<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  delay: number = 500
): [(...args: Parameters<T>) => Promise<ReturnType<T> | undefined>, boolean] {
  const [isPending, setIsPending] = useState(false);
  const lastClickRef = useRef<number>(0);
  
  const debouncedFn = useCallback(
    async (...args: Parameters<T>): Promise<ReturnType<T> | undefined> => {
      const now = Date.now();
      
      if (now - lastClickRef.current < delay) {
        return undefined;
      }
      
      if (isPending) {
        return undefined;
      }
      
      lastClickRef.current = now;
      setIsPending(true);
      
      try {
        const result = await fn(...args);
        return result;
      } finally {
        setIsPending(false);
      }
    },
    [fn, delay, isPending]
  );
  
  return [debouncedFn, isPending];
}

export function usePreventDoubleClick() {
  const [isProcessing, setIsProcessing] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const withPreventDoubleClick = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T | null> => {
      if (isProcessing) {
        return null;
      }
      
      setIsProcessing(true);
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      try {
        const result = await action();
        return result;
      } finally {
        timeoutRef.current = setTimeout(() => {
          setIsProcessing(false);
        }, 300);
      }
    },
    [isProcessing]
  );
  
  return { isProcessing, withPreventDoubleClick };
}
