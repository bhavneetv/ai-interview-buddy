import { motion } from 'framer-motion';

interface ScoreCircleProps {
  score: number;
  maxScore?: number;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

export default function ScoreCircle({ score, maxScore = 100, label, size = 'md', color }: ScoreCircleProps) {
  const sizes = { sm: 80, md: 120, lg: 160 };
  const s = sizes[size];
  const strokeWidth = size === 'sm' ? 6 : 8;
  const radius = (s - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = Math.min(score / maxScore, 1);

  const getColor = () => {
    if (color) return color;
    if (percentage >= 0.8) return 'hsl(var(--success))';
    if (percentage >= 0.6) return 'hsl(var(--primary))';
    if (percentage >= 0.4) return 'hsl(var(--warning))';
    return 'hsl(var(--destructive))';
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: s, height: s }}>
        <svg width={s} height={s} className="-rotate-90">
          <circle cx={s / 2} cy={s / 2} r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth={strokeWidth} />
          <motion.circle
            cx={s / 2} cy={s / 2} r={radius} fill="none"
            stroke={getColor()}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - percentage) }}
            transition={{ duration: 1.5, ease: 'easeOut', delay: 0.3 }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span
            className="font-display font-bold"
            style={{ fontSize: size === 'sm' ? '1rem' : size === 'md' ? '1.5rem' : '2rem' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {score}
          </motion.span>
        </div>
      </div>
      <span className="text-sm text-muted-foreground font-medium">{label}</span>
    </div>
  );
}
