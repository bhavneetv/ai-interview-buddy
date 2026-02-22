import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence, useAnimationFrame } from 'framer-motion';
import { BrainCircuit, ArrowLeft, Loader2, Mic, MicOff, ChevronRight, RotateCcw, Download, LayoutDashboard, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '@/hooks/useSpeechSynthesis';
import MicButton from '@/components/MicButton';
import CountdownTimer from '@/components/CountdownTimer';
import SentimentBadge from '@/components/SentimentBadge';
import ScoreCircle from '@/components/ScoreCircle';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question { text: string; type: string; }

interface QuestionResult {
  score: number;
  confidence_level: string;
  clarity: string;
  technical_depth: string;
  communication_quality: string;
  sentiment: string;
  filler_words: string[];
  feedback: string;
  transcript: string;
}

type Phase = 'loading' | 'intro' | 'question' | 'evaluating' | 'result' | 'summary';
type SubmitOptions = { forceIfEmpty?: boolean };

// ─── Design Tokens ────────────────────────────────────────────────────────────

const tokens = {
  bg: '#05050f',
  surface: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.07)',
  borderHover: 'rgba(255,255,255,0.14)',
  violet: '#7c3aed',
  cyan: '#06b6d4',
  emerald: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
};

// ─── Helper Components ────────────────────────────────────────────────────────

function GlassCard({ children, className = '', glowColor = '' }: { children: React.ReactNode; className?: string; glowColor?: string }) {
  return (
    <div
      className={`relative rounded-2xl overflow-hidden ${className}`}
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: glowColor
          ? `0 0 60px -20px ${glowColor}, 0 20px 60px -30px rgba(0,0,0,0.6)`
          : '0 20px 60px -30px rgba(0,0,0,0.6)',
      }}
    >
      {children}
    </div>
  );
}

function ScoreBar({ label, value, color, delay = 0 }: { label: string; value: string; color: string; delay?: number }) {
  const numValue = value === 'high' || value === 'excellent' ? 90
    : value === 'good' || value === 'moderate' ? 65
    : value === 'average' || value === 'neutral' ? 50
    : value === 'low' || value === 'poor' ? 30 : 50;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs font-medium text-white/50 uppercase tracking-wider">{label}</span>
        <span className="text-xs font-semibold capitalize" style={{ color }}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${color}99, ${color})` }}
          initial={{ width: 0 }}
          animate={{ width: `${numValue}%` }}
          transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

function AnimatedTimer({ seconds, isActive, onComplete }: { seconds: number; isActive: boolean; onComplete: () => void }) {
  const [timeLeft, setTimeLeft] = useState(seconds);

  useEffect(() => {
    if (!isActive) return;
    setTimeLeft(seconds);
  }, [isActive, seconds]);

  useEffect(() => {
    if (!isActive || timeLeft <= 0) {
      if (timeLeft <= 0 && isActive) onComplete();
      return;
    }
    const t = setTimeout(() => setTimeLeft(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, isActive, onComplete]);

  const pct = timeLeft / seconds;
  const radius = 40;
  const circ = 2 * Math.PI * radius;
  const dash = circ * pct;

  const color = timeLeft > 40 ? tokens.emerald : timeLeft > 15 ? tokens.amber : tokens.red;
  const ringColor = timeLeft > 40 ? 'rgba(16,185,129,0.2)' : timeLeft > 15 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)';

  return (
    <div className="relative flex items-center justify-center" style={{ width: 100, height: 100 }}>
      <div className="absolute inset-0 rounded-full transition-all duration-1000" style={{ background: ringColor }} />
      <svg width={100} height={100} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={50} cy={50} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4} />
        <motion.circle
          cx={50} cy={50} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circ}
          animate={{ strokeDashoffset: circ - dash }}
          transition={{ duration: 0.5 }}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-2xl font-bold font-mono"
          style={{ color }}
          animate={{ scale: timeLeft <= 5 && isActive ? [1, 1.15, 1] : 1 }}
          transition={{ duration: 0.5, repeat: timeLeft <= 5 ? Infinity : 0 }}
        >
          {timeLeft}
        </motion.span>
        <span className="text-[9px] text-white/30 uppercase tracking-widest">sec</span>
      </div>
    </div>
  );
}

function WaveformBars({ active, color = '#7c3aed' }: { active: boolean; color?: string }) {
  const bars = 12;
  return (
    <div className="flex items-center justify-center gap-[3px]" style={{ height: 32 }}>
      {Array.from({ length: bars }).map((_, i) => (
        <motion.div
          key={i}
          className="rounded-full"
          style={{ width: 3, background: color }}
          animate={active ? {
            height: [6, Math.random() * 24 + 8, 6],
            opacity: [0.4, 1, 0.4],
          } : { height: 4, opacity: 0.2 }}
          transition={{
            duration: active ? 0.5 + Math.random() * 0.3 : 0.2,
            repeat: active ? Infinity : 0,
            delay: i * 0.06,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

function AIAvatar({ isSpeaking, phase }: { isSpeaking: boolean; phase: Phase }) {
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Outer glow rings */}
      <div className="relative">
        {isSpeaking && (
          <>
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ background: `radial-gradient(circle, ${tokens.violet}30, transparent 70%)` }}
              animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute inset-0 rounded-full border-2"
              style={{ borderColor: `${tokens.violet}40` }}
              animate={{ scale: [1, 1.3, 1], opacity: [0.8, 0, 0.8] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
            />
          </>
        )}

        {/* Avatar circle */}
        <motion.div
          className="relative w-20 h-20 rounded-full flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${tokens.violet}, ${tokens.cyan})`,
            boxShadow: isSpeaking
              ? `0 0 40px ${tokens.violet}60, 0 0 80px ${tokens.violet}30`
              : `0 0 20px ${tokens.violet}30`,
          }}
          animate={isSpeaking ? { scale: [1, 1.04, 1] } : { scale: 1 }}
          transition={{ duration: 1.5, repeat: isSpeaking ? Infinity : 0, ease: 'easeInOut' }}
        >
          <BrainCircuit className="w-9 h-9 text-white" />
        </motion.div>
      </div>

      {/* AI status */}
      <div className="flex flex-col items-center gap-1.5">
        <AnimatePresence mode="wait">
          {isSpeaking ? (
            <motion.div
              key="speaking"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-2"
            >
              <Volume2 className="w-3.5 h-3.5" style={{ color: tokens.violet }} />
              <span className="text-xs font-semibold tracking-wider" style={{ color: tokens.violet }}>
                AI Speaking
              </span>
              <motion.span
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: tokens.violet }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs text-white/30 tracking-wider"
            >
              AI Coach
            </motion.div>
          )}
        </AnimatePresence>
        <WaveformBars active={isSpeaking} color={tokens.violet} />
      </div>
    </div>
  );
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          className="rounded-full"
          style={{
            background: i < current ? tokens.violet : i === current ? tokens.cyan : 'rgba(255,255,255,0.1)',
            boxShadow: i === current ? `0 0 8px ${tokens.cyan}` : 'none',
          }}
          animate={{ width: i === current ? 20 : 8, height: 8 }}
          transition={{ duration: 0.3 }}
        />
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: tokens.bg }}>
      <motion.div
        className="flex flex-col items-center gap-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <motion.div
          className="w-20 h-20 rounded-full"
          style={{ background: `linear-gradient(135deg, ${tokens.violet}, ${tokens.cyan})` }}
          animate={{ scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="w-full h-full rounded-full flex items-center justify-center">
            <BrainCircuit className="w-9 h-9 text-white" />
          </div>
        </motion.div>
        <div className="space-y-2 text-center">
          <motion.p
            className="text-white/80 font-semibold"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            Preparing your interview...
          </motion.p>
          <p className="text-white/30 text-sm">Analyzing your resume & crafting questions</p>
        </div>
        <div className="flex gap-2">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full"
              style={{ background: tokens.violet }}
              animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Panel Components ─────────────────────────────────────────────────────────

function RightPanel({ phase, currentResult, questions, currentQ, timerActive, onTimerComplete, isListening, isAiSpeaking }:
  { phase: Phase; currentResult?: QuestionResult; questions: Question[]; currentQ: number; timerActive: boolean; onTimerComplete: () => void; isListening: boolean; isAiSpeaking: boolean }) {

  if (phase === 'result' && currentResult) {
    return (
      <GlassCard className="p-5 space-y-5 h-fit" glowColor={`${tokens.violet}30`}>
        <div className="text-center">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-3">Answer Score</p>
          <motion.div
            className="relative inline-flex items-center justify-center w-24 h-24 rounded-full mx-auto"
            style={{ background: 'rgba(124,58,237,0.1)', border: '2px solid rgba(124,58,237,0.3)' }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
          >
            <motion.span
              className="text-3xl font-bold"
              style={{ color: currentResult.score >= 7 ? tokens.emerald : currentResult.score >= 5 ? tokens.amber : tokens.red }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {currentResult.score}
            </motion.span>
            <span className="text-white/30 text-sm absolute bottom-3 right-4">/10</span>
          </motion.div>
        </div>

        <div className="space-y-3">
          <ScoreBar label="Confidence" value={currentResult.confidence_level} color={tokens.cyan} delay={0.1} />
          <ScoreBar label="Technical" value={currentResult.technical_depth} color={tokens.violet} delay={0.2} />
          <ScoreBar label="Communication" value={currentResult.communication_quality} color={tokens.emerald} delay={0.3} />
          <ScoreBar label="Clarity" value={currentResult.clarity} color={tokens.amber} delay={0.4} />
        </div>

        {/* Sentiment badge */}
        <div className="flex items-center justify-center">
          <span className="px-3 py-1.5 rounded-full text-xs font-semibold capitalize"
            style={{
              background: currentResult.sentiment === 'positive' ? 'rgba(16,185,129,0.15)' : currentResult.sentiment === 'negative' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
              color: currentResult.sentiment === 'positive' ? tokens.emerald : currentResult.sentiment === 'negative' ? tokens.red : tokens.amber,
              border: `1px solid ${currentResult.sentiment === 'positive' ? tokens.emerald : currentResult.sentiment === 'negative' ? tokens.red : tokens.amber}30`,
            }}>
            {currentResult.sentiment === 'positive' ? '😌 Confident' : currentResult.sentiment === 'negative' ? '😟 Nervous' : '😐 Neutral'}
          </span>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-5 space-y-6 h-fit">
      {/* Timer */}
      <div className="flex flex-col items-center gap-3">
        <p className="text-xs text-white/40 uppercase tracking-widest">Time Remaining</p>
        <AnimatedTimer seconds={60} isActive={timerActive && !isAiSpeaking} onComplete={onTimerComplete} />
      </div>

      {/* Question progress */}
      {questions.length > 0 && (
        <div className="space-y-2 text-center">
          <p className="text-xs text-white/40 uppercase tracking-widest">Progress</p>
          <p className="text-2xl font-bold text-white">
            <span style={{ color: tokens.cyan }}>{currentQ + 1}</span>
            <span className="text-white/30 text-lg"> / {questions.length}</span>
          </p>
          <ProgressDots current={currentQ} total={questions.length} />
        </div>
      )}

      {/* Recording status */}
      <div className="flex flex-col items-center gap-2">
        <AnimatePresence mode="wait">
          {isListening ? (
            <motion.div key="rec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
              <motion.div
                className="w-2 h-2 rounded-full"
                style={{ background: tokens.red }}
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
              <span className="text-xs font-semibold" style={{ color: tokens.red }}>Recording</span>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span className="text-xs text-white/30">Mic idle</span>
            </motion.div>
          )}
        </AnimatePresence>
        <WaveformBars active={isListening} color={tokens.red} />
      </div>
    </GlassCard>
  );
}

// ─── Summary Radar Chart ──────────────────────────────────────────────────────

function RadarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = 70;

  const points = data.map((d, i) => {
    const angle = (i / data.length) * Math.PI * 2 - Math.PI / 2;
    const v = (d.value / 100) * r;
    return { x: cx + v * Math.cos(angle), y: cy + v * Math.sin(angle), lx: cx + (r + 22) * Math.cos(angle), ly: cy + (r + 22) * Math.sin(angle) };
  });

  const gridPoints = Array.from({ length: 5 }, (_, g) => {
    const gr = ((g + 1) / 5) * r;
    return data.map((_, i) => {
      const angle = (i / data.length) * Math.PI * 2 - Math.PI / 2;
      return `${cx + gr * Math.cos(angle)},${cy + gr * Math.sin(angle)}`;
    }).join(' ');
  });

  const polyPoints = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
      {gridPoints.map((pts, i) => (
        <polygon key={i} points={pts} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
      ))}
      {data.map((_, i) => {
        const angle = (i / data.length) * Math.PI * 2 - Math.PI / 2;
        return <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(angle)} y2={cy + r * Math.sin(angle)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />;
      })}
      <motion.polygon
        points={polyPoints}
        fill="rgba(124,58,237,0.15)"
        stroke={tokens.violet}
        strokeWidth={2}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />
      {points.map((p, i) => (
        <motion.circle key={i} cx={p.x} cy={p.y} r={4} fill={data[i].color}
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5 + i * 0.1 }}
          style={{ filter: `drop-shadow(0 0 4px ${data[i].color})` }} />
      ))}
      {points.map((p, i) => (
        <text key={i} x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="middle"
          fontSize="9" fill="rgba(255,255,255,0.45)" fontWeight="600" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
          {data[i].label}
        </text>
      ))}
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Interview() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { transcript, isListening, audioLevel, startListening, stopListening, resetTranscript, getTranscript, getCapturedAudio, isSupported } = useSpeechRecognition();
  const { speak, stop: stopSpeech } = useSpeechSynthesis();

  const [phase, setPhase] = useState<Phase>('loading');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [timerActive, setTimerActive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  const analysisId = location.state?.analysisId;
  const resumeText = location.state?.resumeText;

  // Wrap speak to track AI speaking state
  const speakWithState = useCallback((text: string, onEnd?: () => void) => {
    setIsAiSpeaking(true);
    speak(text, () => {
      setIsAiSpeaking(false);
      onEnd?.();
    });
  }, [speak]);

  useEffect(() => {
    if (!user || !analysisId || !resumeText) return;

    const init = async () => {
      try {
        const { data: session, error: sessionErr } = await supabase.from('interview_sessions').insert({
          user_id: user.id,
          resume_analysis_id: analysisId,
          status: 'in_progress',
        }).select().single();

        if (sessionErr) throw sessionErr;
        setSessionId(session.id);

        const { data, error } = await supabase.functions.invoke('ai-analyze', {
          body: { type: 'generate_questions', skills: resumeText.substring(0, 2000), name: user.user_metadata?.full_name || 'Candidate' },
        });

        if (error || data.error) throw new Error(data?.error || error?.message);
        setQuestions(data.questions || []);
        setPhase('intro');

        const name = user.user_metadata?.full_name || 'there';
        speakWithState(`Hello ${name}, based on your resume, let's begin your interview. I'll ask you ${data.questions?.length || 5} questions. You'll have 60 seconds to answer each. Let's start!`, () => {
          setPhase('question');
          setTimerActive(false);

          const firstQuestion = data.questions?.[0]?.text;
          if (firstQuestion) {
            window.setTimeout(() => {
              speakWithState(firstQuestion, () => {
                startListening();
                setTimerActive(true);
              });
            }, 250);
          }
        });
      } catch (err: any) {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
        navigate('/dashboard');
      }
    };

    init();

    return () => {
      void stopListening();
      stopSpeech();
    };
  }, []);

  const submitAnswer = useCallback(async (options?: SubmitOptions) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const shouldForceIfEmpty = Boolean(options?.forceIfEmpty);
    const wasTimerRunning = timerActive;

    await stopListening();
    await new Promise(resolve => window.setTimeout(resolve, 300));

    let latestTranscript = getTranscript().trim();
    if (!latestTranscript) {
      await new Promise(resolve => window.setTimeout(resolve, 350));
      latestTranscript = getTranscript().trim();
    }

    const browserWordCount = latestTranscript ? latestTranscript.split(/\s+/).filter(Boolean).length : 0;
    const capturedAudio = getCapturedAudio();
    const shouldTryFallbackTranscription = Boolean(capturedAudio?.base64) && (browserWordCount <= 8 || latestTranscript.length < 40);

    if (shouldTryFallbackTranscription) {
      try {
        const { data: transcribeData, error: transcribeError } = await supabase.functions.invoke('ai-analyze', {
          body: { type: 'transcribe_audio', audioBase64: capturedAudio!.base64, mimeType: capturedAudio!.mimeType },
        });
        if (!transcribeError && !transcribeData?.error) {
          const sttText = String(transcribeData?.transcript ?? '').trim();
          const sttWordCount = sttText ? sttText.split(/\s+/).filter(Boolean).length : 0;
          if (sttWordCount > browserWordCount + 1 || (!latestTranscript && sttWordCount > 0)) {
            latestTranscript = sttText;
          }
        }
      } catch (error) { console.error('Fallback transcription exception:', error); }
    }

    if (!latestTranscript && !shouldForceIfEmpty) {
      toast({ title: 'No voice detected', description: 'No answer captured. Keep speaking and submit again.', variant: 'destructive' });
      if (wasTimerRunning) setTimerActive(true);
      setIsSubmitting(false);
      return;
    }

    setTimerActive(false);
    const answer = latestTranscript || 'No answer provided';
    setPhase('evaluating');

    try {
      const { data, error } = await supabase.functions.invoke('ai-analyze', {
        body: { type: 'evaluate_answer', transcript: answer, questionContext: questions[currentQ]?.text },
      });

      if (error || data.error) throw new Error(data?.error || error?.message);

      const result: QuestionResult = { ...data, transcript: answer };
      setResults(prev => [...prev, result]);

      if (sessionId) {
        await supabase.from('interview_questions').insert({
          session_id: sessionId, user_id: user!.id, question_number: currentQ + 1,
          question_text: questions[currentQ].text, question_type: questions[currentQ].type,
          transcript: answer, score: data.score || 0, confidence_level: data.confidence_level,
          clarity: data.clarity, technical_depth: data.technical_depth,
          communication_quality: data.communication_quality, sentiment: data.sentiment,
          filler_words: data.filler_words || [], feedback: data.feedback,
        });
      }

      setPhase('result');
      speakWithState(data.score >= 7 ? `Great answer! ${data.feedback}` : data.feedback);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setPhase('question');
      if (wasTimerRunning) setTimerActive(true);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, timerActive, stopListening, getTranscript, getCapturedAudio, questions, currentQ, sessionId, user, toast, speakWithState]);

  const handleTimerComplete = useCallback(() => {
    void submitAnswer({ forceIfEmpty: true });
  }, [submitAnswer]);

  const generateSummary = useCallback(async () => {
    setPhase('loading');
    try {
      const transcriptSummary = results.map((r, i) =>
        `Q${i + 1}: ${questions[i]?.text}\nAnswer: ${r.transcript}\nScore: ${r.score}/10\nSentiment: ${r.sentiment}`
      ).join('\n\n');

      const { data, error } = await supabase.functions.invoke('ai-analyze', {
        body: { type: 'final_summary', transcript: transcriptSummary },
      });

      if (error || data.error) throw new Error(data?.error || error?.message);
      setSummary(data);
      setPhase('summary');

      if (sessionId) {
        await supabase.from('interview_sessions').update({
          overall_score: data.overall_score || 0, confidence_score: data.confidence_score || 0,
          communication_score: data.communication_score || 0, technical_score: data.technical_score || 0,
          resume_match_score: data.resume_match_score || 0, improvement_tips: data.improvement_tips || [],
          final_feedback: data.final_feedback || '', status: 'completed',
          completed_at: new Date().toISOString(),
        }).eq('id', sessionId);
      }

      speakWithState(data.final_feedback || 'Great job completing the interview!');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }, [results, questions, sessionId, speakWithState]);

  const nextQuestion = useCallback(() => {
    stopSpeech();
    resetTranscript();
    if (currentQ + 1 >= questions.length) {
      generateSummary();
    } else {
      setCurrentQ(c => c + 1);
      setPhase('question');
      setTimerActive(false);
      speakWithState(questions[currentQ + 1].text, () => {
        startListening();
        setTimerActive(true);
      });
    }
  }, [currentQ, questions, generateSummary, resetTranscript, speakWithState, startListening, stopSpeech]);

  if (!user) return <Navigate to="/auth" replace />;
  if (!analysisId || !resumeText) return <Navigate to="/resume" replace />;

  const currentResult = results[results.length - 1];

  // ─── Loading / Preparing ──────────────────────────────────────────────────

  if (phase === 'loading') return <LoadingSkeleton />;

  // ─── Summary Page ─────────────────────────────────────────────────────────

  if (phase === 'summary' && summary) {
    const radarData = [
      { label: 'Overall', value: summary.overall_score, color: tokens.violet },
      { label: 'Confidence', value: summary.confidence_score, color: tokens.cyan },
      { label: 'Comms', value: summary.communication_score, color: tokens.emerald },
      { label: 'Technical', value: summary.technical_score, color: tokens.amber },
      { label: 'Resume', value: summary.resume_match_score, color: tokens.red },
    ];

    return (
      <div className="min-h-screen overflow-y-auto" style={{ background: tokens.bg, fontFamily: "'DM Mono', monospace" }}>
        {/* Ambient bg */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-[-15%] left-[-10%] w-96 h-96 rounded-full blur-[120px]" style={{ background: `${tokens.violet}12` }} />
          <div className="absolute bottom-[-15%] right-[-10%] w-96 h-96 rounded-full blur-[120px]" style={{ background: `${tokens.cyan}12` }} />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 py-10 space-y-8">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-2"
              style={{ background: 'rgba(16,185,129,0.1)', color: tokens.emerald, border: `1px solid ${tokens.emerald}30` }}>
              ✓ Interview Complete
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white">Your Results</h1>
            <p className="text-white/40 text-sm">AI-powered analysis of your interview performance</p>
          </motion.div>

          {/* Score + Radar */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="grid md:grid-cols-2 gap-6">
            {/* Overall score */}
            <GlassCard className="p-8 flex flex-col items-center justify-center gap-4" glowColor={`${tokens.violet}40`}>
              <p className="text-xs text-white/40 uppercase tracking-widest">Overall Score</p>
              <div className="relative">
                <svg width={160} height={160} style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx={80} cy={80} r={68} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={8} />
                  <motion.circle
                    cx={80} cy={80} r={68}
                    fill="none" stroke={`url(#scoreGrad)`} strokeWidth={8} strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 68}
                    initial={{ strokeDashoffset: 2 * Math.PI * 68 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 68 * (1 - summary.overall_score / 100) }}
                    transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
                    style={{ filter: `drop-shadow(0 0 12px ${tokens.violet})` }}
                  />
                  <defs>
                    <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor={tokens.violet} />
                      <stop offset="100%" stopColor={tokens.cyan} />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <motion.span
                    className="text-5xl font-bold text-white"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    {summary.overall_score}
                  </motion.span>
                  <span className="text-white/30 text-sm">/ 100</span>
                </div>
              </div>
              <p className="text-white/50 text-sm text-center">
                {summary.overall_score >= 80 ? "Outstanding performance! 🎉" : summary.overall_score >= 65 ? "Good effort, keep improving!" : "Keep practicing, you'll get there!"}
              </p>
            </GlassCard>

            {/* Radar */}
            <GlassCard className="p-8 flex flex-col items-center justify-center gap-2">
              <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Skill Breakdown</p>
              <RadarChart data={radarData} />
            </GlassCard>
          </motion.div>

          {/* Improvement tips */}
          {summary.improvement_tips?.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <p className="text-xs text-white/40 uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] font-bold" style={{ background: tokens.amber, color: '#000' }}>!</span>
                Improvement Roadmap
              </p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {summary.improvement_tips.map((tip: string, i: number) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.08 }}
                  >
                    <GlassCard className="p-4 h-full hover:border-white/15 transition-all duration-300" glowColor="">
                      <div className="flex gap-3">
                        <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ background: `${tokens.violet}20`, color: tokens.violet }}>
                          {i + 1}
                        </span>
                        <p className="text-sm text-white/60 leading-relaxed">{tip}</p>
                      </div>
                    </GlassCard>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Final feedback */}
          {summary.final_feedback && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <GlassCard className="p-6" glowColor={`${tokens.cyan}20`}>
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `linear-gradient(135deg, ${tokens.violet}, ${tokens.cyan})` }}>
                    <BrainCircuit className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-white/40 uppercase tracking-widest mb-2">AI Coach Message</p>
                    <p className="text-sm text-white/70 leading-relaxed italic">"{summary.final_feedback}"</p>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* CTAs */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            className="flex flex-wrap justify-center gap-3 pb-6">
            <button
              onClick={() => navigate('/resume')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
            >
              <RotateCcw className="w-4 h-4" /> Retake Interview
            </button>
            <button
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
            >
              <Download className="w-4 h-4" /> Download Report
            </button>
            <Link to="/dashboard">
              <button
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95"
                style={{ background: `linear-gradient(135deg, ${tokens.violet}, ${tokens.cyan})`, color: '#fff', boxShadow: `0 8px 30px ${tokens.violet}40` }}
              >
                <LayoutDashboard className="w-4 h-4" /> Back to Dashboard
              </button>
            </Link>
          </motion.div>
        </div>

        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;600&display=swap');`}</style>
      </div>
    );
  }

  // ─── Main Interview Layout ────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col" style={{ background: tokens.bg, fontFamily: "'DM Mono', monospace" }}>
      {/* Ambient bg */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full blur-[130px]" style={{ background: `${tokens.violet}10` }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full blur-[130px]" style={{ background: `${tokens.cyan}10` }} />
      </div>

      {/* Header */}
      <header className="relative z-20 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', background: 'rgba(5,5,15,0.8)' }}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <button className="flex items-center gap-2 text-sm text-white/50 hover:text-white/90 transition-colors hover:scale-105 active:scale-95 duration-200 px-3 py-1.5 rounded-xl hover:bg-white/5">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            </Link>
            <div className="w-px h-5" style={{ background: 'rgba(255,255,255,0.1)' }} />
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${tokens.violet}, ${tokens.cyan})` }}>
                <BrainCircuit className="w-4.5 h-4.5 text-white" />
              </div>
              <span className="text-sm font-bold text-white/90">Voice Interview</span>
            </div>
          </div>
          {questions.length > 0 && phase !== 'summary' && (
            <div className="flex items-center gap-3">
              <ProgressDots current={currentQ} total={questions.length} />
              <span className="text-xs text-white/40 hidden sm:block">
                {currentQ + 1} of {questions.length}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 max-w-7xl mx-auto w-full px-4 md:px-6 py-6 md:py-10">
        <AnimatePresence mode="wait">

          {/* ── Intro ── */}
          {phase === 'intro' && (
            <motion.div key="intro"
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              className="flex items-center justify-center min-h-[60vh]"
            >
              <div className="text-center space-y-8 max-w-sm">
                <AIAvatar isSpeaking={isAiSpeaking} phase={phase} />
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-white">AI Interview Coach</h2>
                  <p className="text-white/40 text-sm">Preparing your personalized interview session...</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Evaluating ── */}
          {phase === 'evaluating' && (
            <motion.div key="eval"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center justify-center min-h-[60vh]"
            >
              <div className="text-center space-y-6">
                <motion.div
                  className="w-16 h-16 rounded-full mx-auto flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${tokens.violet}30, ${tokens.cyan}30)`, border: `2px solid ${tokens.violet}40` }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                >
                  <Loader2 className="w-7 h-7 text-violet-400" />
                </motion.div>
                <div className="space-y-1">
                  <p className="text-white/80 font-semibold">Evaluating your answer...</p>
                  <p className="text-white/30 text-sm">AI is analyzing confidence, clarity & technical depth</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Question Phase ── */}
          {phase === 'question' && questions[currentQ] && (
            <motion.div key={`q-${currentQ}`}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="grid lg:grid-cols-[200px_1fr_180px] gap-5 items-start"
            >
              {/* Left: AI Avatar */}
              <div className="hidden lg:flex justify-center">
                <GlassCard className="p-6 flex flex-col items-center justify-center h-fit">
                  <AIAvatar isSpeaking={isAiSpeaking} phase={phase} />
                </GlassCard>
              </div>

              {/* Center: Question + Transcript */}
              <div className="space-y-4">
                {/* Mobile avatar bar */}
                <div className="lg:hidden">
                  <GlassCard className="px-4 py-3">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: `linear-gradient(135deg, ${tokens.violet}, ${tokens.cyan})` }}>
                        <BrainCircuit className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <AnimatePresence mode="wait">
                          {isAiSpeaking ? (
                            <motion.div key="speaking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                              className="flex items-center gap-2">
                              <span className="text-xs font-semibold" style={{ color: tokens.violet }}>AI Speaking</span>
                              <WaveformBars active color={tokens.violet} />
                            </motion.div>
                          ) : (
                            <motion.p key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                              className="text-xs text-white/30">AI Coach</motion.p>
                          )}
                        </AnimatePresence>
                      </div>
                      {/* Mobile timer */}
                      <AnimatedTimer seconds={60} isActive={timerActive && !isAiSpeaking} onComplete={handleTimerComplete} />
                    </div>
                  </GlassCard>
                </div>

                {/* Question card */}
                <GlassCard className="p-6 md:p-8" glowColor={`${tokens.violet}20`}>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold capitalize"
                        style={{ background: 'rgba(124,58,237,0.15)', color: tokens.violet, border: `1px solid ${tokens.violet}30` }}>
                        {questions[currentQ].type} Question
                      </span>
                      <span className="text-xs text-white/30">Question {currentQ + 1} of {questions.length}</span>
                    </div>
                    <motion.h2
                      key={`q-text-${currentQ}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="text-lg md:text-xl font-semibold text-white/90 leading-relaxed"
                    >
                      {questions[currentQ].text}
                    </motion.h2>
                  </div>
                </GlassCard>

                {/* Transcript */}
                <GlassCard className="p-5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-white/40 uppercase tracking-widest flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: isListening ? `${tokens.red}30` : 'rgba(255,255,255,0.05)' }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: isListening ? tokens.red : 'rgba(255,255,255,0.2)' }} />
                        </span>
                        Live Transcript
                      </p>
                      {isListening && <WaveformBars active={isListening} color={tokens.red} />}
                    </div>
                    <div className="min-h-[72px]">
                      {transcript ? (
                        <motion.p
                          className="text-sm text-white/75 leading-relaxed"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                        >
                          {transcript}
                          {isListening && (
                            <motion.span
                              className="inline-block w-0.5 h-4 ml-1 rounded-full align-middle"
                              style={{ background: tokens.cyan }}
                              animate={{ opacity: [1, 0, 1] }}
                              transition={{ duration: 0.8, repeat: Infinity }}
                            />
                          )}
                        </motion.p>
                      ) : (
                        <p className="text-sm text-white/25 italic">
                          {isAiSpeaking ? "AI is speaking, please wait..." : "Start speaking to see your transcript here..."}
                        </p>
                      )}
                    </div>
                  </div>
                </GlassCard>

                {/* Submit + Mic */}
                <div className="flex items-center justify-center gap-4">
                  {/* Mic button */}
                  <motion.button
                    aria-label={isListening ? "Stop recording" : "Start recording"}
                    disabled={!isSupported || isSubmitting || isAiSpeaking}
                    onClick={() => { if (isListening) { void stopListening(); } else { startListening(); } }}
                    className="relative flex items-center justify-center w-14 h-14 rounded-full transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: isListening
                        ? `radial-gradient(circle, ${tokens.red}30, ${tokens.red}10)`
                        : 'rgba(255,255,255,0.05)',
                      border: isListening ? `2px solid ${tokens.red}60` : '2px solid rgba(255,255,255,0.1)',
                      boxShadow: isListening ? `0 0 30px ${tokens.red}40` : 'none',
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    animate={isListening ? { scale: [1, 1.04, 1] } : { scale: 1 }}
                    transition={isListening ? { duration: 1.5, repeat: Infinity } : {}}
                  >
                    {isListening
                      ? <MicOff className="w-5 h-5" style={{ color: tokens.red }} />
                      : <Mic className="w-5 h-5 text-white/70" />}
                  </motion.button>

                  <motion.button
                    onClick={() => void submitAnswer()}
                    disabled={isSubmitting || isAiSpeaking}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: `linear-gradient(135deg, ${tokens.violet}, ${tokens.cyan})`,
                      color: '#fff',
                      boxShadow: `0 8px 30px ${tokens.violet}30`,
                    }}
                    whileHover={{ scale: 1.03, y: -1 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    {isSubmitting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
                    ) : (
                      <>Submit Answer <ChevronRight className="w-4 h-4" /></>
                    )}
                  </motion.button>
                </div>

                {!isSupported && (
                  <p className="text-center text-xs" style={{ color: tokens.red }}>Speech recognition not supported in this browser.</p>
                )}
              </div>

              {/* Right panel */}
              <div className="hidden lg:block">
                <RightPanel
                  phase={phase} currentResult={currentResult} questions={questions}
                  currentQ={currentQ} timerActive={timerActive} onTimerComplete={handleTimerComplete}
                  isListening={isListening} isAiSpeaking={isAiSpeaking}
                />
              </div>
            </motion.div>
          )}

          {/* ── Result Phase ── */}
          {phase === 'result' && currentResult && (
            <motion.div key="result"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="grid lg:grid-cols-[200px_1fr_180px] gap-5 items-start"
            >
              {/* Left: AI Avatar */}
              <div className="hidden lg:flex justify-center">
                <GlassCard className="p-6 flex flex-col items-center justify-center h-fit">
                  <AIAvatar isSpeaking={isAiSpeaking} phase={phase} />
                </GlassCard>
              </div>

              {/* Center */}
              <div className="space-y-4">
                {/* Feedback card */}
                <GlassCard className="p-6" glowColor={
                  currentResult.score >= 7 ? `${tokens.emerald}30`
                  : currentResult.score >= 5 ? `${tokens.amber}30`
                  : `${tokens.red}30`
                }>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <span className="text-xs text-white/40 uppercase tracking-widest">AI Feedback</span>
                      <span className="px-3 py-1 rounded-full text-xs font-semibold capitalize"
                        style={{
                          background: currentResult.sentiment === 'positive' ? 'rgba(16,185,129,0.15)' : currentResult.sentiment === 'negative' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                          color: currentResult.sentiment === 'positive' ? tokens.emerald : currentResult.sentiment === 'negative' ? tokens.red : tokens.amber,
                        }}>
                        {currentResult.sentiment === 'positive' ? '😌 Confident' : currentResult.sentiment === 'negative' ? '😟 Nervous' : '😐 Neutral'}
                      </span>
                    </div>
                    <p className="text-sm text-white/70 leading-relaxed">{currentResult.feedback}</p>
                  </div>
                </GlassCard>

                {/* Score bars */}
                <GlassCard className="p-6">
                  <p className="text-xs text-white/40 uppercase tracking-widest mb-4">Performance Analysis</p>
                  <div className="space-y-4">
                    <ScoreBar label="Confidence" value={currentResult.confidence_level} color={tokens.cyan} delay={0.1} />
                    <ScoreBar label="Technical Depth" value={currentResult.technical_depth} color={tokens.violet} delay={0.2} />
                    <ScoreBar label="Communication" value={currentResult.communication_quality} color={tokens.emerald} delay={0.3} />
                    <ScoreBar label="Clarity" value={currentResult.clarity} color={tokens.amber} delay={0.4} />
                  </div>
                </GlassCard>

                {/* Filler words */}
                {currentResult.filler_words?.length > 0 && (
                  <GlassCard className="p-5">
                    <p className="text-xs text-white/40 uppercase tracking-widest mb-3">Filler Words Detected</p>
                    <div className="flex flex-wrap gap-2">
                      {currentResult.filler_words.map((w, i) => (
                        <motion.span key={i}
                          initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.05 }}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium"
                          style={{ background: 'rgba(245,158,11,0.15)', color: tokens.amber, border: `1px solid ${tokens.amber}25` }}>
                          "{w}"
                        </motion.span>
                      ))}
                    </div>
                  </GlassCard>
                )}

                {/* Next button */}
                <div className="flex justify-center">
                  <motion.button
                    onClick={nextQuestion}
                    className="flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-semibold transition-all duration-200"
                    style={{
                      background: `linear-gradient(135deg, ${tokens.violet}, ${tokens.cyan})`,
                      color: '#fff',
                      boxShadow: `0 8px 30px ${tokens.violet}30`,
                    }}
                    whileHover={{ scale: 1.03, y: -1 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    {currentQ + 1 >= questions.length ? 'View Final Summary →' : 'Next Question →'}
                  </motion.button>
                </div>
              </div>

              {/* Right panel */}
              <div className="hidden lg:block">
                <RightPanel
                  phase={phase} currentResult={currentResult} questions={questions}
                  currentQ={currentQ} timerActive={timerActive} onTimerComplete={handleTimerComplete}
                  isListening={isListening} isAiSpeaking={isAiSpeaking}
                />
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Mobile sticky bottom bar (mic) */}
      {(phase === 'question') && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 p-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', background: 'rgba(5,5,15,0.9)' }}>
          <div className="flex items-center justify-between gap-4 max-w-lg mx-auto">
            <AnimatedTimer seconds={60} isActive={timerActive && !isAiSpeaking} onComplete={handleTimerComplete} />
            <motion.button
              aria-label={isListening ? "Stop recording" : "Start recording"}
              disabled={!isSupported || isSubmitting || isAiSpeaking}
              onClick={() => { if (isListening) { void stopListening(); } else { startListening(); } }}
              className="relative flex items-center justify-center w-16 h-16 rounded-full transition-all duration-300 disabled:opacity-40"
              style={{
                background: isListening ? `radial-gradient(circle, ${tokens.red}30, ${tokens.red}10)` : 'rgba(255,255,255,0.07)',
                border: isListening ? `2px solid ${tokens.red}60` : '2px solid rgba(255,255,255,0.12)',
                boxShadow: isListening ? `0 0 30px ${tokens.red}40` : 'none',
              }}
              whileTap={{ scale: 0.93 }}
              animate={isListening ? { scale: [1, 1.04, 1] } : { scale: 1 }}
              transition={isListening ? { duration: 1.5, repeat: Infinity } : {}}
            >
              {isListening ? <MicOff className="w-6 h-6" style={{ color: tokens.red }} /> : <Mic className="w-6 h-6 text-white/70" />}
            </motion.button>
            <motion.button
              onClick={() => void submitAnswer()}
              disabled={isSubmitting || isAiSpeaking}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
              style={{
                background: `linear-gradient(135deg, ${tokens.violet}, ${tokens.cyan})`,
                color: '#fff',
                boxShadow: `0 8px 20px ${tokens.violet}30`,
              }}
              whileTap={{ scale: 0.95 }}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Submit <ChevronRight className="w-4 h-4" /></>}
            </motion.button>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
      `}</style>
    </div>
  );
}