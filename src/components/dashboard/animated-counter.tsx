"use client";

import { useEffect, useRef, useState } from "react";

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function useAnimatedCounter(target: number, duration: number = 1200): number {
  const [displayValue, setDisplayValue] = useState(target);
  const frameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const startValueRef = useRef<number>(0);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip animation on first render — show value immediately
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (typeof window === "undefined" || !window.requestAnimationFrame) {
      setDisplayValue(target);
      return;
    }

    startValueRef.current = displayValue;
    startTimeRef.current = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);

      const current = startValueRef.current + (target - startValueRef.current) * easedProgress;
      setDisplayValue(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return displayValue;
}

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

export function AnimatedCounter({
  value,
  duration = 1200,
  prefix = "",
  suffix = "",
  decimals = 0,
}: AnimatedCounterProps) {
  const animatedValue = useAnimatedCounter(value, duration);

  const formatted = decimals > 0
    ? animatedValue.toFixed(decimals)
    : Math.round(animatedValue).toLocaleString();

  return (
    <span>
      {prefix}{formatted}{suffix}
    </span>
  );
}
