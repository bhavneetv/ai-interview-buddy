import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface CountdownTimerProps {
  seconds: number;
  isActive: boolean;
  onComplete: () => void;
}

export default function CountdownTimer({ seconds, isActive, onComplete }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(seconds);

  useEffect(() => {
    setTimeLeft(seconds);
  }, [seconds, isActive]);

  useEffect(() => {
    if (!isActive || timeLeft <= 0) {
      if (isActive && timeLeft <= 0) onComplete();
      return;
    }
    const timer = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => clearInterval(timer);
  }, [isActive, timeLeft, onComplete]);

  const percentage = (timeLeft / seconds) * 100;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  const getColor = () => {
    if (percentage > 50) return 'hsl(var(--success))';
    if (percentage > 25) return 'hsl(var(--warning))';
    return 'hsl(var(--destructive))';
  };

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;

  return (
    <div className="relative w-24 h-24">
      <svg width={96} height={96} className="-rotate-90">
        <circle cx={48} cy={48} r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth={4} />
        <motion.circle
          cx={48} cy={48} r={radius} fill="none"
          stroke={getColor()}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset: circumference * (1 - percentage / 100) }}
          transition={{ duration: 0.5 }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display font-bold text-lg">
          {mins}:{secs.toString().padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}
