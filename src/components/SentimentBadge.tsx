import { motion } from 'framer-motion';

interface SentimentBadgeProps {
  sentiment: string;
}

export default function SentimentBadge({ sentiment }: SentimentBadgeProps) {
  const config: Record<string, { emoji: string; bg: string; text: string }> = {
    confident: { emoji: '💪', bg: 'bg-success/20', text: 'text-success' },
    neutral: { emoji: '😐', bg: 'bg-primary/20', text: 'text-primary' },
    nervous: { emoji: '😰', bg: 'bg-warning/20', text: 'text-warning' },
    unsure: { emoji: '🤔', bg: 'bg-destructive/20', text: 'text-destructive' },
  };

  const c = config[sentiment.toLowerCase()] || config.neutral;

  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring' }}
      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${c.bg} ${c.text}`}
    >
      {c.emoji} {sentiment}
    </motion.span>
  );
}
