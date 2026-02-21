import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Navigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BrainCircuit, ArrowLeft, Calendar, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ScoreCircle from '@/components/ScoreCircle';

interface Session {
  id: string;
  overall_score: number;
  confidence_score: number;
  communication_score: number;
  technical_score: number;
  resume_match_score: number;
  status: string;
  created_at: string;
  final_feedback: string | null;
  improvement_tips: string[];
}

export default function History() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Session | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchHistory = async () => {
      const { data } = await supabase
        .from('interview_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setSessions((data as any[]) || []);
      setLoading(false);
    };
    fetchHistory();
  }, [user]);

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-success/5 rounded-full blur-3xl" />

      <header className="relative z-10 border-b border-border/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/dashboard"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button></Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center">
              <BrainCircuit className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-display font-bold">Interview History</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 container mx-auto px-4 py-8 max-w-4xl">
        {loading ? (
          <div className="text-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : sessions.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
            <TrendingUp className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-display font-semibold mb-2">No interviews yet</h2>
            <p className="text-muted-foreground mb-6">Complete an interview to see your history here.</p>
            <Link to="/resume"><Button className="gradient-bg text-primary-foreground font-semibold">Start First Interview</Button></Link>
          </motion.div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h2 className="text-lg font-display font-semibold mb-4">Past Sessions</h2>
              {sessions.map((s, i) => (
                <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  onClick={() => setSelected(s)}
                  className={`glass-card-hover p-4 cursor-pointer ${selected?.id === s.id ? 'border-primary/50' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded capitalize ${s.status === 'completed' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>{s.status}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-display font-bold">{s.overall_score}</span>
                      <span className="text-xs text-muted-foreground">/100</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            <div>
              {selected ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-6 space-y-6 sticky top-8">
                  <h3 className="text-lg font-display font-semibold">Session Details</h3>
                  <div className="flex flex-wrap justify-center gap-4">
                    <ScoreCircle score={selected.overall_score} label="Overall" size="sm" />
                    <ScoreCircle score={selected.confidence_score} label="Confidence" size="sm" />
                    <ScoreCircle score={selected.communication_score} label="Comm." size="sm" />
                    <ScoreCircle score={selected.technical_score} label="Technical" size="sm" />
                    <ScoreCircle score={selected.resume_match_score} label="Match" size="sm" />
                  </div>
                  {selected.final_feedback && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Feedback</h4>
                      <p className="text-sm text-muted-foreground italic">"{selected.final_feedback}"</p>
                    </div>
                  )}
                  {selected.improvement_tips && (selected.improvement_tips as string[]).length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Tips</h4>
                      <ul className="space-y-2">
                        {(selected.improvement_tips as string[]).map((t, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-primary font-bold">{i + 1}.</span> {t}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.div>
              ) : (
                <div className="glass-card p-6 text-center text-muted-foreground">Select a session to view details</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
