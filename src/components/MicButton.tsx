import { motion } from 'framer-motion';
import { Mic, MicOff } from 'lucide-react';

interface MicButtonProps {
  isListening: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export default function MicButton({ isListening, onClick, disabled }: MicButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      disabled={disabled}
      className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-colors
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
        </>
      )}
    </motion.button>
  );
}
