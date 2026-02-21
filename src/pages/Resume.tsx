import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainCircuit, Upload, FileText, ArrowLeft, Loader2, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import ScoreCircle from '@/components/ScoreCircle';
import ScoreBar from '@/components/ScoreBar';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

interface ResumeAnalysis {
  id?: string;
  score: number;
  skills_strength: number;
  technical_depth: number;
  project_impact: number;
  ats_optimization: number;
  improvements: string[];
  self_introduction: string;
  resume_text?: string;
}

export default function Resume() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [dragOver, setDragOver] = useState(false);

  if (!user) return <Navigate to="/auth" replace />;

  const extractText = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(' ') + '\n';
    }
    return text;
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      // Extract text
      const resumeText = await extractText(file);
      if (!resumeText.trim()) {
        toast({ title: 'Error', description: 'Could not extract text from PDF.', variant: 'destructive' });
        setLoading(false);
        return;
      }

      // Upload file to storage
      const filePath = `${user.id}/${Date.now()}_${file.name}`;
      await supabase.storage.from('resumes').upload(filePath, file);

      // Call AI
      const { data, error } = await supabase.functions.invoke('ai-analyze', {
        body: { resumeText, type: 'analyze_resume' },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Save to database
      const { data: saved, error: saveError } = await supabase.from('resume_analyses').insert({
        user_id: user.id,
        file_name: file.name,
        file_path: filePath,
        score: data.score || 0,
        skills_strength: data.skills_strength || 0,
        technical_depth: data.technical_depth || 0,
        project_impact: data.project_impact || 0,
        ats_optimization: data.ats_optimization || 0,
        improvements: data.improvements || [],
        self_introduction: data.self_introduction || '',
        resume_text: resumeText,
      }).select().single();

      if (saveError) throw saveError;

      setAnalysis({ ...data, id: saved.id, resume_text: resumeText });
      toast({ title: 'Analysis complete!', description: `Your resume scored ${data.score}/100` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === 'application/pdf') setFile(dropped);
    else toast({ title: 'Invalid file', description: 'Please upload a PDF file.', variant: 'destructive' });
  }, [toast]);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-3xl" />

      {/* Header */}
      <header className="relative z-10 border-b border-border/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center">
                <BrainCircuit className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-display font-bold">Resume Analysis</span>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 container mx-auto px-4 py-8 max-w-4xl">
        <AnimatePresence mode="wait">
          {!analysis ? (
            <motion.div key="upload" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <div
                className={`glass-card p-12 text-center border-2 border-dashed transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h2 className="text-xl font-display font-semibold mb-2">Upload Your Resume</h2>
                <p className="text-muted-foreground mb-6">Drag & drop a PDF file or click to browse</p>

                <input
                  type="file"
                  accept=".pdf"
                  onChange={e => e.target.files?.[0] && setFile(e.target.files[0])}
                  className="hidden"
                  id="resume-upload"
                />
                <label htmlFor="resume-upload">
                  <Button variant="outline" asChild className="cursor-pointer">
                    <span><FileText className="w-4 h-4 mr-2" /> Choose PDF</span>
                  </Button>
                </label>

                {file && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6">
                    <div className="glass-card p-4 inline-flex items-center gap-3">
                      <FileText className="w-5 h-5 text-primary" />
                      <span className="text-sm">{file.name}</span>
                    </div>
                    <div className="mt-4">
                      <Button onClick={handleUpload} disabled={loading} className="gradient-bg text-primary-foreground font-semibold">
                        {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</> : 'Analyze Resume'}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              {/* Overall Score */}
              <div className="glass-card p-8 text-center">
                <h2 className="text-xl font-display font-semibold mb-6">Resume Score</h2>
                <ScoreCircle score={analysis.score} label="Overall" size="lg" />
              </div>

              {/* Breakdown */}
              <div className="glass-card p-8">
                <h3 className="text-lg font-display font-semibold mb-6">Detailed Breakdown</h3>
                <div className="space-y-4">
                  <ScoreBar label="Skills Strength" score={analysis.skills_strength} delay={0} />
                  <ScoreBar label="Technical Depth" score={analysis.technical_depth} delay={0.1} />
                  <ScoreBar label="Project Impact" score={analysis.project_impact} delay={0.2} />
                  <ScoreBar label="ATS Optimization" score={analysis.ats_optimization} delay={0.3} />
                </div>
              </div>

              {/* Self Introduction */}
              {analysis.self_introduction && (
                <div className="glass-card p-8">
                  <h3 className="text-lg font-display font-semibold mb-4">Generated Self-Introduction</h3>
                  <p className="text-muted-foreground leading-relaxed italic">"{analysis.self_introduction}"</p>
                </div>
              )}

              {/* Improvements */}
              {analysis.improvements?.length > 0 && (
                <div className="glass-card p-8">
                  <h3 className="text-lg font-display font-semibold mb-4">Improvement Tips</h3>
                  <ul className="space-y-3">
                    {analysis.improvements.map((tip, i) => (
                      <motion.li
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + i * 0.1 }}
                        className="flex items-start gap-3"
                      >
                        <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-semibold shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-sm text-muted-foreground">{tip}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Start Interview */}
              <div className="text-center">
                <Button
                  size="lg"
                  className="gradient-bg text-primary-foreground font-semibold glow-primary"
                  onClick={() => navigate('/interview', { state: { analysisId: analysis.id, resumeText: analysis.resume_text } })}
                >
                  <Mic className="w-5 h-5 mr-2" /> Start Voice Interview
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
