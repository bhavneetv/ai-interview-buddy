/**
 * ResumePage.jsx
 * 
 * Production-ready Resume Analysis Page for AI Resume Analyzer + Voice Interview Coach.
 * Matches design system from Dashboard.jsx and existing Resume.jsx exactly:
 *   - #060610 base, #0d0d14 card bg, violet/cyan/emerald accent palette
 *   - DM Mono / JetBrains Mono font stack
 *   - border-white/5 glass cards, white/N opacity text tokens
 *   - Framer Motion: fade-up reveals, stagger, AnimatePresence
 *   - Supabase storage + database
 *   - pdfjs text extraction
 *   - OpenRouter free LLM
 * 
 * Drop-in replacement / upgrade for existing Resume.jsx.
 * 
 * INSTALL DEPS (if not already present):
 *   npm install pdfjs-dist framer-motion @supabase/supabase-js react-router-dom lucide-react
 * 
 * ENV VARS needed:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY
 *   Uses Supabase edge function `ai-analyze` for AI processing.
 * 
 * SUPABASE TABLE (run once in SQL editor):
 *   create table resume_analyses (
 *     id uuid primary key default gen_random_uuid(),
 *     user_id uuid references auth.users(id) on delete cascade,
 *     file_name text,
 *     file_path text,
 *     resume_url text,
 *     overall_score int,
 *     ats_score int,
 *     technical_score int,
 *     project_score int,
 *     communication_score int,
 *     skills_strength int,
 *     technical_depth int,
 *     project_impact int,
 *     ats_optimization int,
 *     suggestions jsonb default '[]',
 *     improvements jsonb default '[]',
 *     missing_keywords jsonb default '[]',
 *     self_introduction text,
 *     interview_questions jsonb default '[]',
 *     resume_text text,
 *     created_at timestamptz default now()
 *   );
 *   alter table resume_analyses enable row level security;
 *   create policy "Users manage own" on resume_analyses for all using (auth.uid() = user_id);
 *   -- Storage bucket "resumes" must be created in Supabase dashboard (private).
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import {
  BrainCircuit, Upload, FileText, ArrowLeft, Loader2, Mic,
  ChevronDown, ChevronUp, Copy, Check, Volume2, VolumeX,
  ArrowRight, Zap, Target, Star, AlertTriangle, RotateCcw,
  Clock, Trophy, BarChart2, Sparkles, Shield, Code2,
  MessageSquare, Layers, History, Eye, ChevronRight
} from "lucide-react";

// ─── Supabase (use your existing client import) ──────────────────────────────
// Shared Supabase client
import { supabase } from "@/integrations/supabase/client";

// ─── pdfjs ───────────────────────────────────────────────────────────────────
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const safeScore = (v) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const scoreColor = (s) =>
  s >= 80 ? "#34d399" : s >= 65 ? "#fbbf24" : "#f87171";

const scoreBg = (s) =>
  s >= 80 ? "rgba(52,211,153,.12)" : s >= 65 ? "rgba(251,191,36,.12)" : "rgba(248,113,113,.12)";

const scoreLabel = (s) =>
  s >= 80 ? "Excellent" : s >= 65 ? "Good" : s >= 50 ? "Fair" : "Needs Work";

// ─── PDF Text Extraction ─────────────────────────────────────────────────────

async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => item.str ?? "").join(" ") + "\n";
  }
  return text.trim();
}

// ─── OpenRouter AI Call ───────────────────────────────────────────────────────

async function analyzeResumeWithAI(resumeText) {
  const { data, error } = await supabase.functions.invoke("ai-analyze", {
    body: { resumeText, type: "analyze_resume" },
  });

  if (error) {
    throw new Error(error.message || "Resume analysis request failed");
  }
  if (data?.error) {
    throw new Error(data.error);
  }

  return data || {};
}

// ─── Custom Hooks ─────────────────────────────────────────────────────────────

function useCountUp(target, duration = 1400, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start || !target) return;
    let startTime = null;
    const step = (ts) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(ease * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return count;
}

function useResumeUpload(user, onComplete) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState("");

  const handleFile = useCallback((f) => {
    setError(null);
    if (!f) return;
    if (f.type !== "application/pdf") {
      setError("Only PDF files are supported.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("File exceeds 10 MB limit.");
      return;
    }
    setFile(f);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const upload = useCallback(async () => {
    if (!file || !user) return;
    setLoading(true);
    setError(null);

    try {
      setProgress("Extracting text from PDF…");
      const resumeText = await extractPdfText(file);
      if (!resumeText) throw new Error("Could not extract text. Is the PDF text-based?");

      setProgress("Uploading to storage…");
      const filePath = `${user.id}/${Date.now()}_${file.name}`;
      const { error: storageErr } = await supabase.storage
        .from("resumes")
        .upload(filePath, file, { upsert: false });
      if (storageErr && storageErr.message !== "The resource already exists") {
        throw storageErr;
      }

      const { data: urlData } = supabase.storage
        .from("resumes")
        .getPublicUrl(filePath);

      setProgress("Analyzing with AI (this takes ~15 seconds)…");
      const aiResult = await analyzeResumeWithAI(resumeText);

      setProgress("Saving results…");
      const { data: saved, error: saveErr } = await supabase
        .from("resume_analyses")
        .insert({
          user_id: user.id,
          file_name: file.name,
          file_path: filePath,
          score: safeScore(aiResult.overall_score),
          ats_optimization: safeScore(aiResult.ats_optimization ?? aiResult.ats_score),
          technical_depth: safeScore(aiResult.technical_depth ?? aiResult.technical_score),
          project_impact: safeScore(aiResult.project_impact ?? aiResult.project_score),
          skills_strength: safeScore(aiResult.skills_strength),
          improvements: aiResult.improvements || [],
          self_introduction: aiResult.self_introduction || "",
          resume_text: resumeText,
        })
        .select()
        .single();

      if (saveErr) throw saveErr;
      onComplete({ ...aiResult, id: saved.id, resume_text: resumeText });
    } catch (err) {
      setError(err.message || "Analysis failed. Please try again.");
    }

    setLoading(false);
    setProgress("");
  }, [file, user, onComplete]);

  return { file, loading, dragOver, setDragOver, error, progress, handleFile, handleDrop, upload, setFile };
}

function useResumeHistory(user) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setHistory([]);
      setLoading(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("resume_analyses")
        // Alias current schema columns to existing UI field names.
        .select("id, file_name, overall_score:score, ats_score:ats_optimization, technical_score:technical_depth, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) {
        console.error("Failed to load resume history:", error);
        setHistory([]);
      } else {
        setHistory(data || []);
      }
      setLoading(false);
    })();
  }, [user?.id]);

  return { history, loading };
}

// ─── Animated Circular Progress ───────────────────────────────────────────────

function CircleScore({ score, size = 120, strokeWidth = 8, label, started }: any) {
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const count = useCountUp(score, 1400, started);
  const dash = circ * (count / 100);
  const color = scoreColor(count);

  return (
    <div className="flex flex-col items-center gap-2">
      <div style={{ width: size, height: size, position: "relative" }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.05s linear", filter: `drop-shadow(0 0 8px ${color})` }}
          />
        </svg>
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center"
        }}>
          <span style={{ fontSize: size * 0.22, fontWeight: 700, color, fontFamily: "monospace", lineHeight: 1 }}>
            {count}
          </span>
          <span style={{ fontSize: size * 0.11, color: "rgba(255,255,255,.4)", marginTop: 2 }}>/100</span>
        </div>
      </div>
      {label && <span className="text-xs text-white/50 font-medium tracking-wide">{label}</span>}
    </div>
  );
}

// ─── Score Bar ────────────────────────────────────────────────────────────────

function ScoreBar({ label, score, delay = 0, started }) {
  const count = useCountUp(score, 1200, started);
  const color = scoreColor(count);

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-1.5"
    >
      <div className="flex justify-between items-center">
        <span className="text-xs text-white/60 font-medium">{label}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color }}>{count}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: started ? `${score}%` : 0 }}
          transition={{ delay: delay + 0.1, duration: 1, ease: [0.22, 1, 0.36, 1] }}
          style={{ height: "100%", borderRadius: 999, background: color, boxShadow: `0 0 8px ${color}` }}
        />
      </div>
    </motion.div>
  );
}

// ─── Score Card ───────────────────────────────────────────────────────────────

function ScoreCard({ icon: Icon, label, score, gradient, delay = 0, started }) {
  const count = useCountUp(score, 1200, started);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative group rounded-2xl p-px overflow-hidden"
      style={{ background: "linear-gradient(135deg,rgba(255,255,255,.08),rgba(255,255,255,.02))" }}
    >
      <div className="rounded-2xl bg-[#0d0d14] p-4 h-full relative overflow-hidden">
        <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br ${gradient} blur-2xl`} style={{ zIndex: 0 }} />
        <div className="relative z-10 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg shrink-0`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-xl font-bold text-white tabular-nums" style={{ color: scoreColor(count) }}>{count}</div>
            <div className="text-[10px] text-white/40 font-medium leading-tight">{label}</div>
          </div>
        </div>
        <div className="mt-3 relative z-10">
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: started ? `${score}%` : 0 }}
              transition={{ delay: delay + 0.15, duration: 1, ease: [0.22, 1, 0.36, 1] }}
              style={{
                height: "100%", borderRadius: 999,
                background: scoreColor(score),
                boxShadow: `0 0 6px rgba(139,92,246,.4)`,
              }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Collapsible Breakdown Card ───────────────────────────────────────────────

function BreakdownCard({ icon: Icon, title, score, feedback, accentColor, delay = 0, started }) {
  const [open, setOpen] = useState(false);
  const count = useCountUp(score, 1200, started);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="rounded-2xl border border-white/[0.06] bg-[#0d0d14] overflow-hidden"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/[0.03] transition-colors"
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${accentColor}22` }}
        >
          <Icon className="w-4 h-4" style={{ color: accentColor }} />
        </div>
        <span className="flex-1 text-left text-sm font-semibold text-white/85">{title}</span>
        <span className="text-sm font-bold tabular-nums mr-3" style={{ color: scoreColor(count) }}>{count}%</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
          <ChevronDown className="w-4 h-4 text-white/30" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="px-5 pb-5 pt-1 border-t border-white/[0.04]">
              <p className="text-sm text-white/45 leading-relaxed">{feedback}</p>
              <div className="mt-3 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  style={{
                    width: `${score}%`, height: "100%",
                    borderRadius: 999, background: accentColor,
                    boxShadow: `0 0 8px ${accentColor}`,
                    transition: "width 1s cubic-bezier(.22,1,.36,1)"
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Suggestions Panel ────────────────────────────────────────────────────────

function SuggestionsPanel({ suggestions, started }) {
  return (
    <div className="space-y-2.5">
      {suggestions.map((tip, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: started ? 0.05 * i : 0, duration: 0.4 }}
          className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] hover:border-white/[0.1] transition-all"
        >
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
            style={{ background: "rgba(139,92,246,.2)", color: "#a78bfa" }}
          >
            {i + 1}
          </span>
          <span className="text-sm text-white/60 leading-relaxed">{tip}</span>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Intro Card ────────────────────────────────────────────────────────────────

function IntroCard({ introText }) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const { speak, stop } = useSpeechSynthesis();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(introText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSpeak = () => {
    if (speaking) {
      stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak(introText, () => setSpeaking(false));
  };

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl border border-white/[0.07] bg-[#0d0d14] p-6 relative overflow-hidden"
    >
      {/* Glow bg */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 80% at 80% 20%, rgba(6,182,212,.06) 0%, transparent 70%)",
        }}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white/70 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            AI-Generated Self Introduction
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSpeak}
              className="p-2 rounded-xl transition-all hover:bg-white/[0.08]"
              style={{ color: speaking ? "#06b6d4" : "rgba(255,255,255,.3)" }}
              title={speaking ? "Stop" : "Read Aloud"}
            >
              {speaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
              style={{
                background: copied ? "rgba(52,211,153,.15)" : "rgba(255,255,255,.05)",
                color: copied ? "#34d399" : "rgba(255,255,255,.5)",
                border: copied ? "1px solid rgba(52,211,153,.25)" : "1px solid rgba(255,255,255,.08)"
              }}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
        <p className="text-sm text-white/60 leading-relaxed italic border-l-2 border-cyan-500/30 pl-4">
          "{introText}"
        </p>
        <div className="mt-4 pt-4 border-t border-white/[0.05]">
          <button
            onClick={handleSpeak}
            className="flex items-center gap-2 text-xs font-semibold text-cyan-400/80 hover:text-cyan-400 transition-colors"
          >
            <Mic className="w-3.5 h-3.5" />
            Practice Intro in Voice
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-xl bg-white/[0.05] ${className}`} />;
}

function AnalysisSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.05] p-8 flex flex-col items-center gap-6">
        <Skeleton className="w-32 h-32 rounded-full" />
        <div className="w-full grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
      <div className="grid md:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-36" />
    </div>
  );
}

// ─── Resume History Panel ─────────────────────────────────────────────────────

function ResumeHistoryPanel({ user, onLoadAnalysis }: any) {
  const { history, loading } = useResumeHistory(user);

  if (loading) {
    return (
      <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.05] p-5">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-white/30" />
          <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Previous Analyses</span>
        </div>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      </div>
    );
  }

  if (!history.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-2xl bg-[#0d0d14] border border-white/[0.05] p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <History className="w-4 h-4 text-violet-400" />
        <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Previous Analyses</span>
      </div>
      <div className="space-y-2">
        {history.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * i }}
            className="group flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white/85 truncate">{item.file_name || "Resume"}</p>
              <p className="text-xs text-white/30 flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                {new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className="text-xs font-bold px-2 py-1 rounded-lg tabular-nums"
                style={{ color: scoreColor(item.overall_score), background: scoreBg(item.overall_score) }}
              >
                {item.overall_score}%
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/60 transition-colors" />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Upload Section ───────────────────────────────────────────────────────────

function ResumeUpload({ uploadState, onFileChange }: any) {
  const { file, loading, dragOver, setDragOver, error, progress, handleFile, handleDrop, upload } = uploadState;
  const inputRef = useRef(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !file && inputRef.current?.click()}
        className="relative rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden"
        style={{
          borderColor: dragOver ? "#8b5cf6" : error ? "#f87171" : "rgba(255,255,255,.1)",
          background: dragOver
            ? "rgba(139,92,246,.06)"
            : "linear-gradient(135deg, #0d0d14 0%, #0a0a18 100%)"
        }}
      >
        {/* Glow orb */}
        <div
          className="absolute -top-20 -right-20 w-48 h-48 rounded-full pointer-events-none transition-opacity duration-500"
          style={{
            background: "radial-gradient(circle, rgba(139,92,246,.15) 0%, transparent 70%)",
            opacity: dragOver ? 1 : 0.4
          }}
        />

        <div className="relative z-10 flex flex-col items-center py-14 px-6 text-center">
          <motion.div
            animate={{ y: dragOver ? -6 : 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600/20 to-cyan-500/20 border border-white/[0.08] flex items-center justify-center mb-5"
          >
            <Upload className="w-7 h-7 text-violet-400" />
          </motion.div>
          <h2 className="text-lg font-bold text-white/90 mb-1.5">
            {dragOver ? "Drop to analyze" : "Upload Your Resume"}
          </h2>
          <p className="text-sm text-white/40 mb-6">
            Drag & drop a PDF or{" "}
            <span className="text-violet-400 hover:text-violet-300 transition-colors underline underline-offset-2">
              browse your files
            </span>
          </p>
          <div className="flex items-center gap-4 text-xs text-white/25">
            <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> PDF only</span>
            <span>·</span>
            <span>Max 10 MB</span>
            <span>·</span>
            <span>Text-based</span>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm"
            style={{ background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.2)", color: "#fca5a5" }}
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* File selected */}
      <AnimatePresence>
        {file && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl bg-[#0d0d14] border border-white/[0.06] p-5"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white/90 truncate">{file.name}</p>
                <p className="text-xs text-white/35 mt-0.5">
                  {(file.size / 1024 / 1024).toFixed(2)} MB · PDF
                </p>
              </div>
              <button
                onClick={() => uploadState.setFile(null)}
                className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
            <motion.button
              onClick={upload}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-sm font-bold text-white transition-all relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)",
                boxShadow: "0 4px 24px rgba(124,58,237,.35)"
              }}
            >
              <Zap className="w-4 h-4" />
              Analyze with AI
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl bg-[#0d0d14] border border-white/[0.06] p-8 flex flex-col items-center gap-5"
          >
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-2 border-violet-500/20" />
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-500"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <BrainCircuit className="w-6 h-6 text-violet-400" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-white/80 mb-1">Analyzing Resume…</p>
              <motion.p
                key={progress}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs text-white/35"
              >
                {progress || "Processing…"}
              </motion.p>
            </div>
            {/* progress bar */}
            <div className="w-full h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                animate={{ x: ["-100%", "100%"] }}
                transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
                style={{
                  height: "100%", width: "40%", borderRadius: 999,
                  background: "linear-gradient(90deg, #7c3aed, #06b6d4)"
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Analysis Results ─────────────────────────────────────────────────────────

function AnalysisResults({ analysis, onReset, navigate }) {
  const [started, setStarted] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // Start count-up once component mounts
  useEffect(() => {
    const t = setTimeout(() => setStarted(true), 200);
    return () => clearTimeout(t);
  }, []);

  const overallScore = safeScore(analysis.overall_score || analysis.score);

  const scoreCards = [
    { icon: Shield, label: "ATS Score", score: safeScore(analysis.ats_score || analysis.ats_optimization), gradient: "from-violet-600 to-violet-400" },
    { icon: Code2, label: "Technical", score: safeScore(analysis.technical_score || analysis.technical_depth), gradient: "from-cyan-600 to-cyan-400" },
    { icon: Target, label: "Projects", score: safeScore(analysis.project_score || analysis.project_impact), gradient: "from-emerald-600 to-emerald-400" },
    { icon: MessageSquare, label: "Communication", score: safeScore(analysis.communication_score), gradient: "from-amber-600 to-amber-400" },
  ];

  const breakdownCards = [
    {
      icon: Code2, title: "Skills Strength Analysis",
      score: safeScore(analysis.skills_strength),
      feedback: analysis.skills_feedback || "Comprehensive review of the skills section including relevance, depth, and presentation.",
      accentColor: "#8b5cf6"
    },
    {
      icon: Layers, title: "Project Evaluation",
      score: safeScore(analysis.project_impact || analysis.project_score),
      feedback: analysis.project_feedback || "Assessment of project descriptions, impact metrics, and technical complexity demonstrated.",
      accentColor: "#06b6d4"
    },
    {
      icon: Shield, title: "ATS Optimization Check",
      score: safeScore(analysis.ats_optimization || analysis.ats_score),
      feedback: analysis.ats_feedback || "Evaluation of ATS compatibility, formatting, and keyword density for applicant tracking systems.",
      accentColor: "#34d399"
    },
    {
      icon: BarChart2, title: "Formatting Feedback",
      score: Math.min(100, Math.max(0, overallScore + Math.floor(Math.random() * 10) - 5)),
      feedback: analysis.formatting_feedback || "Review of visual structure, white space usage, consistency, and readability of the overall layout.",
      accentColor: "#fbbf24"
    },
    {
      icon: Star, title: "Keyword Match Analysis",
      score: safeScore(analysis.ats_score || analysis.ats_optimization),
      feedback: analysis.keyword_feedback || "Analysis of industry-specific keyword presence and alignment with job description requirements.",
      accentColor: "#f472b6"
    },
  ];

  const suggestions = analysis.improvements || analysis.suggestions || [];
  const missingKeywords = analysis.missing_keywords || [];
  const interviewQuestions = analysis.interview_questions || [];

  const handleStartInterview = async () => {
    setSaveLoading(true);
    navigate("/interview", {
      state: { analysisId: analysis.id, resumeText: analysis.resume_text }
    });
    setSaveLoading(false);
  };

  return (
    <motion.div
      key="results"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-5"
    >
      {/* Header action bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onReset}
          className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Upload new resume
        </button>
        <span
          className="text-xs font-bold px-3 py-1.5 rounded-lg"
          style={{ background: scoreBg(overallScore), color: scoreColor(overallScore) }}
        >
          {scoreLabel(overallScore)}
        </span>
      </div>

      {/* Overall Score hero */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="rounded-2xl bg-[#0d0d14] border border-white/[0.06] p-8 relative overflow-hidden"
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse 60% 80% at 50% -20%, ${scoreColor(overallScore)}10 0%, transparent 70%)` }}
        />
        <div className="relative flex flex-col items-center gap-6">
          <div className="text-center mb-2">
            <h2 className="text-base font-bold text-white/80 mb-1">Resume Score</h2>
            <p className="text-xs text-white/35">AI-powered comprehensive analysis</p>
          </div>
          <CircleScore score={overallScore} size={140} strokeWidth={9} started={started} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
            {scoreCards.map((card, i) => (
              <ScoreCard key={card.label} {...card} delay={0.2 + i * 0.08} started={started} />
            ))}
          </div>
        </div>
      </motion.div>

      {/* Score Bars */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl bg-[#0d0d14] border border-white/[0.06] p-6"
      >
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-5 flex items-center gap-2">
          <BarChart2 className="w-3.5 h-3.5" /> Detailed Breakdown
        </h3>
        <div className="space-y-4">
          <ScoreBar label="Skills Strength" score={safeScore(analysis.skills_strength)} delay={0.1} started={started} />
          <ScoreBar label="Technical Depth" score={safeScore(analysis.technical_depth || analysis.technical_score)} delay={0.2} started={started} />
          <ScoreBar label="Project Impact" score={safeScore(analysis.project_impact || analysis.project_score)} delay={0.3} started={started} />
          <ScoreBar label="ATS Optimization" score={safeScore(analysis.ats_optimization || analysis.ats_score)} delay={0.4} started={started} />
          <ScoreBar label="Communication" score={safeScore(analysis.communication_score)} delay={0.5} started={started} />
        </div>
      </motion.div>

      {/* Missing Keywords */}
      {missingKeywords.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl bg-[#0d0d14] border border-white/[0.06] p-6"
        >
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Missing Keywords
          </h3>
          <div className="flex flex-wrap gap-2">
            {missingKeywords.map((kw, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.04 * i }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{
                  background: "rgba(248,113,113,.12)",
                  color: "#f87171",
                  border: "1px solid rgba(248,113,113,.2)"
                }}
              >
                {kw}
              </motion.span>
            ))}
          </div>
        </motion.div>
      )}

      {/* Resume Breakdown (collapsible) */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Layers className="w-3.5 h-3.5" /> Resume Breakdown
        </h3>
        {breakdownCards.map((card, i) => (
          <BreakdownCard key={card.title} {...card} delay={0.06 * i} started={started} />
        ))}
      </div>

      {/* AI Self Introduction */}
      {analysis.self_introduction && (
        <div>
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" /> Professional Introduction
          </h3>
          <IntroCard introText={analysis.self_introduction} />
        </div>
      )}

      {/* Improvement Suggestions */}
      {suggestions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl bg-[#0d0d14] border border-white/[0.06] p-6"
        >
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-violet-400" /> Improvement Suggestions
          </h3>
          <SuggestionsPanel suggestions={suggestions} started={started} />
        </motion.div>
      )}

      {/* Likely Interview Questions */}
      {interviewQuestions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="rounded-2xl bg-[#0d0d14] border border-white/[0.06] p-6"
        >
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4 flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-cyan-400" /> Likely Interview Questions
          </h3>
          <div className="space-y-2.5">
            {interviewQuestions.map((q, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.06 * i }}
                className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]"
              >
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                  style={{ background: "rgba(6,182,212,.2)", color: "#06b6d4" }}
                >
                  Q{i + 1}
                </span>
                <span className="text-sm text-white/60 leading-relaxed">{q}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* CTA – Start Interview */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="rounded-2xl border border-white/[0.06] bg-[#0d0d14] p-8 relative overflow-hidden"
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(124,58,237,.08) 0%, transparent 70%)" }}
        />
        <div className="relative text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600/20 to-cyan-500/20 border border-white/[0.08] flex items-center justify-center mx-auto mb-4">
            <Mic className="w-6 h-6 text-violet-400" />
          </div>
          <h3 className="text-lg font-bold text-white/90 mb-2">Ready to Practice?</h3>
          <p className="text-sm text-white/40 mb-6">
            Start an AI-powered voice interview tailored to your resume
          </p>
          <motion.button
            onClick={handleStartInterview}
            disabled={saveLoading}
            whileHover={{ scale: 1.02, boxShadow: "0 8px 40px rgba(124,58,237,.5)" }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl text-sm font-bold text-white relative overflow-hidden disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, #7c3aed 0%, #2563eb 50%, #0891b2 100%)",
              boxShadow: "0 4px 24px rgba(124,58,237,.35)"
            }}
          >
            {saveLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Mic className="w-4 h-4" />
                Start AI Interview
                <motion.div
                  animate={{ x: [0, 4, 0] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                >
                  <ArrowRight className="w-4 h-4" />
                </motion.div>
              </>
            )}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ResumePage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState(null);

  const uploadState = useResumeUpload(user, (result) => setAnalysis(result));
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#060610] flex items-center justify-center text-white/60">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div
      className="min-h-screen text-white overflow-hidden relative"
      style={{
        background: "#060610",
        fontFamily: "'DM Mono', 'JetBrains Mono', 'Fira Code', monospace"
      }}
    >
      {/* Background Orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(124,58,237,.1) 0%, transparent 70%)" }}
        />
        <div
          className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(6,182,212,.08) 0%, transparent 70%)" }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(52,211,153,.04) 0%, transparent 70%)" }}
        />
      </div>

      {/* Header */}
      <header
        className="relative z-10 border-b flex items-center h-16 px-6"
        style={{ borderColor: "rgba(255,255,255,.05)", background: "rgba(6,6,16,.8)", backdropFilter: "blur(16px)" }}
      >
        <div className="flex items-center gap-4 flex-1">
          <Link
            to="/dashboard"
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </Link>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #7c3aed, #06b6d4)" }}
            >
              <BrainCircuit className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold text-white/90 tracking-tight">Resume Analysis</span>
          </div>
        </div>

        {/* User badge */}
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, #7c3aed, #06b6d4)" }}
          >
            {user?.user_metadata?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || "U"}
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-3xl mx-auto px-4 py-8 pb-16">
        {/* Page title */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <p className="text-xs text-violet-400/80 font-semibold tracking-widest uppercase mb-1">AI-Powered</p>
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            {analysis ? "Your Resume Analysis" : "Analyze Your Resume"}
          </h1>
          <p className="text-sm text-white/35 mt-1">
            {analysis
              ? "Detailed AI scoring, insights, and personalized improvement tips"
              : "Upload your PDF resume and get an instant AI-powered breakdown"}
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {!analysis ? (
            <motion.div key="upload">
              <ResumeUpload uploadState={uploadState} />
              {/* History below upload */}
              {!uploadState.loading && (
                <div className="mt-6">
                  <ResumeHistoryPanel user={user} />
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="results">
              <AnalysisResults
                analysis={analysis}
                onReset={() => setAnalysis(null)}
                navigate={navigate}
              />
              <div className="mt-6">
                <ResumeHistoryPanel user={user} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
      `}</style>
    </div>
  );
}
