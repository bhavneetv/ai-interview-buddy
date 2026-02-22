import { motion } from 'framer-motion';
import { Mic, MicOff } from 'lucide-react';

interface MicButtonProps {
  isListening: boolean;
  audioLevel?: number;
  onClick: () => void;
  disabled?: boolean;
}

export default function MicButton({ isListening, audioLevel = 0, onClick, disabled }: MicButtonProps) {
  const waveBars = [0.5, 0.8, 1, 0.8, 0.5];

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      disabled={disabled}
      className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-colors overflow-visible
        ${isListening
          ? 'bg-destructive text-destructive-foreground mic-pulse'
          : 'gradient-bg text-primary-foreground glow-primary'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
      {isListening && (
        <>
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-destructive"
            animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-destructive"
            animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
          />
          <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 flex items-end gap-1 pointer-events-none">
            {waveBars.map((factor, i) => (
              <motion.span
                key={i}
                className="w-1 rounded-full bg-destructive"
                animate={{
                  height: `${Math.max(6, 6 + audioLevel * 24 * factor)}px`,
                  opacity: 0.45 + audioLevel * 0.55,
                }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
              />
            ))}
          </div>
        </>
      )}
    </motion.button>
  );
}
