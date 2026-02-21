import { motion } from 'framer-motion';

interface ScoreBarProps {
  label: string;
  score: number;
  maxScore?: number;
  delay?: number;
}

export default function ScoreBar({ label, score, maxScore = 100, delay = 0 }: ScoreBarProps) {
  const percentage = Math.min((score / maxScore) * 100, 100);
  const getColor = () => {
    if (percentage >= 80) return 'bg-success';
    if (percentage >= 60) return 'bg-primary';
    if (percentage >= 40) return 'bg-warning';
    return 'bg-destructive';
  };

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-display font-semibold">{score}/{maxScore}</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${getColor()}`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: delay + 0.3 }}
        />
      </div>
    </div>
  );
}
