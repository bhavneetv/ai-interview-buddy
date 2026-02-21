import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainCircuit, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '@/hooks/useSpeechSynthesis';
import MicButton from '@/components/MicButton';
import CountdownTimer from '@/components/CountdownTimer';
import SentimentBadge from '@/components/SentimentBadge';
import ScoreCircle from '@/components/ScoreCircle';

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

export default function Interview() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { transcript, isListening, startListening, stopListening, resetTranscript, isSupported } = useSpeechRecognition();
  const { speak, stop: stopSpeech } = useSpeechSynthesis();

  const [phase, setPhase] = useState<Phase>('loading');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [timerActive, setTimerActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);

  const analysisId = location.state?.analysisId;
  const resumeText = location.state?.resumeText;

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
        speak(`Hello ${name}, based on your resume, let's begin your interview. I'll ask you ${data.questions?.length || 5} questions. You'll have 60 seconds to answer each. Let's start!`, () => {
          setPhase('question');
          setTimerActive(true);
        });
      } catch (err: any) {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
        navigate('/dashboard');
      }
    };

    init();

    return () => { stopSpeech(); };
  }, []);

  const submitAnswer = useCallback(async () => {
    const answer = transcript || 'No answer provided';
    if (isListening) stopListening();
    setTimerActive(false);
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
          session_id: sessionId,
          user_id: user!.id,
          question_number: currentQ + 1,
          question_text: questions[currentQ].text,
          question_type: questions[currentQ].type,
          transcript: answer,
          score: data.score || 0,
          confidence_level: data.confidence_level,
          clarity: data.clarity,
          technical_depth: data.technical_depth,
          communication_quality: data.communication_quality,
          sentiment: data.sentiment,
          filler_words: data.filler_words || [],
          feedback: data.feedback,
        });
      }

      setPhase('result');
      speak(data.score >= 7 ? `Great answer! ${data.feedback}` : data.feedback);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setPhase('question');
    }
  }, [transcript, isListening, questions, currentQ, sessionId, user]);

  const handleTimerComplete = useCallback(() => {
    if (isListening) stopListening();
    setTimerActive(false);
    submitAnswer();
  }, [isListening, submitAnswer]);

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
          overall_score: data.overall_score || 0,
          confidence_score: data.confidence_score || 0,
          communication_score: data.communication_score || 0,
          technical_score: data.technical_score || 0,
          resume_match_score: data.resume_match_score || 0,
          improvement_tips: data.improvement_tips || [],
          final_feedback: data.final_feedback || '',
          status: 'completed',
          completed_at: new Date().toISOString(),
        }).eq('id', sessionId);
      }

      speak(data.final_feedback || 'Great job completing the interview!');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }, [results, questions, sessionId]);

  const nextQuestion = useCallback(() => {
    stopSpeech();
    resetTranscript();
    if (currentQ + 1 >= questions.length) {
      generateSummary();
    } else {
      setCurrentQ(c => c + 1);
      setPhase('question');
      setTimerActive(true);
      speak(questions[currentQ + 1].text);
    }
  }, [currentQ, questions, generateSummary]);

  if (!user) return <Navigate to="/auth" replace />;
  if (!analysisId || !resumeText) return <Navigate to="/resume" replace />;

  const currentResult = results[results.length - 1];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-3xl" />

      <header className="relative z-10 border-b border-border/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button></Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center">
                <BrainCircuit className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-display font-bold">Voice Interview</span>
            </div>
          </div>
          {questions.length > 0 && phase !== 'summary' && (
            <span className="text-sm text-muted-foreground">Q {Math.min(currentQ + 1, questions.length)}/{questions.length}</span>
          )}
        </div>
      </header>

      <main className="relative z-10 container mx-auto px-4 py-8 max-w-3xl">
        <AnimatePresence mode="wait">
          {phase === 'loading' && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-20">
              <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Preparing your interview...</p>
            </motion.div>
          )}

          {phase === 'intro' && (
            <motion.div key="intro" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center py-20">
              <div className="w-20 h-20 rounded-full gradient-bg flex items-center justify-center mx-auto mb-6 animate-float">
                <BrainCircuit className="w-10 h-10 text-primary-foreground" />
              </div>
              <h2 className="text-2xl font-display font-bold mb-2">AI Interview Coach</h2>
              <p className="text-muted-foreground">Listening... The interview will begin shortly.</p>
            </motion.div>
          )}

          {phase === 'question' && questions[currentQ] && (
            <motion.div key={`q-${currentQ}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="glass-card p-8 text-center">
                <span className="inline-block px-3 py-1 rounded-full bg-secondary text-xs text-muted-foreground mb-4 capitalize">{questions[currentQ].type} Question</span>
                <h2 className="text-xl font-display font-semibold mb-6">{questions[currentQ].text}</h2>
                <div className="flex items-center justify-center gap-8">
                  <CountdownTimer seconds={60} isActive={timerActive} onComplete={handleTimerComplete} />
                  <MicButton isListening={isListening} onClick={() => isListening ? stopListening() : startListening()} disabled={!isSupported} />
                </div>
                {!isSupported && <p className="text-destructive text-sm mt-4">Speech recognition not supported.</p>}
              </div>
              <div className="glass-card p-6">
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">Live Transcript</h3>
                <p className="text-sm min-h-[60px]">{transcript || <span className="text-muted-foreground italic">Start speaking...</span>}</p>
              </div>
              <div className="text-center">
                <Button onClick={submitAnswer} variant="outline">Submit Answer</Button>
              </div>
            </motion.div>
          )}

          {phase === 'evaluating' && (
            <motion.div key="eval" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-20">
              <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Evaluating your answer...</p>
            </motion.div>
          )}

          {phase === 'result' && currentResult && (
            <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="glass-card p-8 text-center">
                <ScoreCircle score={currentResult.score} maxScore={10} label="Answer Score" size="lg" />
                <div className="mt-4"><SentimentBadge sentiment={currentResult.sentiment} /></div>
              </div>
              <div className="glass-card p-6">
                <h3 className="text-sm font-semibold mb-3">Analysis</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Confidence</span><span className="capitalize">{currentResult.confidence_level}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Clarity</span><span className="capitalize">{currentResult.clarity}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Technical Depth</span><span className="capitalize">{currentResult.technical_depth}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Communication</span><span className="capitalize">{currentResult.communication_quality}</span></div>
                </div>
              </div>
              {currentResult.filler_words?.length > 0 && (
                <div className="glass-card p-6">
                  <h3 className="text-sm font-semibold mb-2">Filler Words</h3>
                  <div className="flex flex-wrap gap-2">
                    {currentResult.filler_words.map((w, i) => (
                      <span key={i} className="px-2 py-1 rounded bg-warning/20 text-warning text-xs">{w}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="glass-card p-6">
                <h3 className="text-sm font-semibold mb-2">Feedback</h3>
                <p className="text-sm text-muted-foreground">{currentResult.feedback}</p>
              </div>
              <div className="text-center">
                <Button onClick={nextQuestion} className="gradient-bg text-primary-foreground font-semibold">
                  {currentQ + 1 >= questions.length ? 'View Final Summary' : 'Next Question →'}
                </Button>
              </div>
            </motion.div>
          )}

          {phase === 'summary' && summary && (
            <motion.div key="summary" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="glass-card p-8 text-center">
                <h2 className="text-2xl font-display font-bold mb-6">Interview Summary</h2>
                <div className="flex flex-wrap justify-center gap-6">
                  <ScoreCircle score={summary.overall_score} label="Overall" />
                  <ScoreCircle score={summary.confidence_score} label="Confidence" />
                  <ScoreCircle score={summary.communication_score} label="Communication" />
                  <ScoreCircle score={summary.technical_score} label="Technical" />
                  <ScoreCircle score={summary.resume_match_score} label="Resume Match" />
                </div>
              </div>
              {summary.improvement_tips?.length > 0 && (
                <div className="glass-card p-8">
                  <h3 className="text-lg font-display font-semibold mb-4">Improvement Roadmap</h3>
                  <ul className="space-y-3">
                    {summary.improvement_tips.map((tip: string, i: number) => (
                      <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.1 }} className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-semibold shrink-0 mt-0.5">{i + 1}</span>
                        <span className="text-sm text-muted-foreground">{tip}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.final_feedback && (
                <div className="glass-card p-8">
                  <h3 className="text-lg font-display font-semibold mb-4">Final Feedback</h3>
                  <p className="text-muted-foreground italic">"{summary.final_feedback}"</p>
                </div>
              )}
              <div className="flex justify-center gap-4">
                <Link to="/history"><Button variant="outline">View History</Button></Link>
                <Link to="/dashboard"><Button className="gradient-bg text-primary-foreground font-semibold">Back to Dashboard</Button></Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
