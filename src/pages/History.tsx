import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Navigate, Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  BrainCircuit, FileText, Mic, History, LogOut, Settings,
  LayoutDashboard, ChevronLeft, Bell, Moon, Sun, TrendingUp,
  Award, Activity, Calendar, Eye, Upload, Filter,
  Zap, Target, MessageSquare, Code2, BarChart2, ChevronRight,
  Menu, X, Sparkles, ArrowUpRight, Clock, CheckCircle2,
  ChevronDown, ChevronUp, Search, AlertCircle, RefreshCw,
  ArrowUp, ArrowDown, Star, Layers
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface ResumeAnalysis {
  id: string;
  file_name: string;
  score: number;
  ats_score?: number;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const safeScore = (value: any): number => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
};

const shortDate = (isoDate: string) =>
  new Date(isoDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const monthLabel = (isoDate: string) =>
  new Date(isoDate).toLocaleDateString(undefined, { month: "short", year: "2-digit" });

const scoreColor = (s: number) =>
  s >= 80 ? "text-emerald-400" : s >= 65 ? "text-amber-400" : "text-red-400";
const scoreBg = (s: number) =>
  s >= 80 ? "bg-emerald-400/10 border-emerald-400/20" : s >= 65 ? "bg-amber-400/10 border-amber-400/20" : "bg-red-400/10 border-red-400/20";
const scoreGradient = (s: number) =>
  s >= 80 ? "from-emerald-500 to-emerald-400" : s >= 65 ? "from-amber-500 to-amber-400" : "from-red-500 to-red-400";

// ─── Count-Up Hook ────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1200, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start || !target) return;
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return count;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/[0.04] ${className}`} />;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, suffix = "", gradient, delay = 0,
}: {
  icon: any; label: string; value: number; suffix?: string; gradient: string; delay?: number;
}) {
  const [visible, setVisible] = useState(false);
  const count = useCountUp(value, 1200, visible);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      onViewportEnter={() => setVisible(true)}
      className="relative group"
    >
      <div className="relative overflow-hidden rounded-2xl p-px bg-gradient-to-br from-white/10 to-white/[0.03]">
        <div className="relative rounded-2xl bg-[#0d0d14]/90 backdrop-blur-xl p-5 h-full">
          <div
            className={`absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br ${gradient} blur-xl`}
            style={{ zIndex: -1 }}
          />
          <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} mb-4 shadow-lg`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="text-3xl font-bold text-white font-mono tabular-nums">
            {count}{suffix}
          </div>
          <div className="text-sm text-white/50 mt-1 font-medium">{label}</div>
          <div className={`absolute bottom-0 right-0 w-24 h-24 rounded-full bg-gradient-to-br ${gradient} opacity-10 blur-2xl`} />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#111120] border border-white/10 rounded-xl p-3 shadow-2xl text-xs">
      <p className="text-white/60 mb-2 font-medium">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }} className="font-semibold">
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

// ─── Performance Chart ────────────────────────────────────────────────────────

function PerformanceChart({ sessions }: { sessions: Session[] }) {
  const completed = sessions.filter((s) => s.status === "completed").slice(0, 8).reverse();

  if (!completed.length) return null;

  const trendData = completed.map((s) => ({
    date: new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    Overall: safeScore(s.overall_score),
    Confidence: safeScore(s.confidence_score),
    Technical: safeScore(s.technical_score),
    Communication: safeScore(s.communication_score),
  }));

  const skillData = [
    { skill: "Confidence", score: Math.round(completed.reduce((a, s) => a + safeScore(s.confidence_score), 0) / completed.length) },
    { skill: "Technical", score: Math.round(completed.reduce((a, s) => a + safeScore(s.technical_score), 0) / completed.length) },
    { skill: "Comm.", score: Math.round(completed.reduce((a, s) => a + safeScore(s.communication_score), 0) / completed.length) },
    { skill: "Match", score: Math.round(completed.reduce((a, s) => a + safeScore(s.resume_match_score), 0) / completed.length) },
  ];

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <motion.div
        initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
        className="rounded-2xl bg-[#0d0d14]/90 border border-white/5 p-5"
      >
        <h3 className="text-sm font-semibold text-white/70 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-violet-400" /> Score Trend
        </h3>
        <div className="overflow-x-auto">
          <div style={{ minWidth: 280 }}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                <XAxis dataKey="date" tick={{ fill: "#ffffff40", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#ffffff40", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: "11px", color: "#ffffff60" }} />
                <Line type="monotone" dataKey="Overall" stroke="#8b5cf6" strokeWidth={2.5} dot={{ fill: "#8b5cf6", r: 3 }} />
                <Line type="monotone" dataKey="Confidence" stroke="#06b6d4" strokeWidth={2} dot={{ fill: "#06b6d4", r: 3 }} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
        className="rounded-2xl bg-[#0d0d14]/90 border border-white/5 p-5"
      >
        <h3 className="text-sm font-semibold text-white/70 mb-4 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-cyan-400" /> Avg Skill Breakdown
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={skillData} barSize={32}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
            <XAxis dataKey="skill" tick={{ fill: "#ffffff40", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#ffffff40", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="score" name="Score" fill="url(#barGradHist)" radius={[6, 6, 0, 0]} />
            <defs>
              <linearGradient id="barGradHist" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const scores = [
    { label: "Overall", value: safeScore(session.overall_score), color: "from-violet-600 to-violet-400" },
    { label: "Confidence", value: safeScore(session.confidence_score), color: "from-cyan-600 to-cyan-400" },
    { label: "Communication", value: safeScore(session.communication_score), color: "from-emerald-600 to-emerald-400" },
    { label: "Technical", value: safeScore(session.technical_score), color: "from-amber-600 to-amber-400" },
    { label: "Resume Match", value: safeScore(session.resume_match_score), color: "from-rose-600 to-rose-400" },
  ];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-[#0d0d18] border border-white/10 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between p-6 bg-[#0d0d18]/95 backdrop-blur-xl border-b border-white/5">
            <div>
              <h3 className="text-lg font-bold text-white">Session Details</h3>
              <p className="text-xs text-white/40 mt-0.5 flex items-center gap-1.5">
                <Calendar className="w-3 h-3" />
                {shortDate(session.created_at)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors group"
            >
              <X className="w-4 h-4 text-white/50 group-hover:text-white transition-colors" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Score Grid */}
            <div>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Score Breakdown</p>
              <div className="grid grid-cols-5 gap-2">
                {scores.map((s) => (
                  <div key={s.label} className="text-center">
                    <div className="relative w-12 h-12 mx-auto mb-2">
                      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
                        <circle cx="24" cy="24" r="19" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                        <motion.circle
                          cx="24" cy="24" r="19" fill="none"
                          stroke="url(#scoreGrad)" strokeWidth="4"
                          strokeLinecap="round"
                          strokeDasharray={`${2 * Math.PI * 19}`}
                          initial={{ strokeDashoffset: 2 * Math.PI * 19 }}
                          animate={{ strokeDashoffset: 2 * Math.PI * 19 * (1 - s.value / 100) }}
                          transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                        />
                        <defs>
                          <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#8b5cf6" />
                            <stop offset="100%" stopColor="#06b6d4" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold text-white">{s.value}</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-white/40">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Progress Bars */}
            <div className="space-y-3">
              {scores.map((s, i) => (
                <div key={s.label}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-white/60">{s.label}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${scoreBg(s.value)} ${scoreColor(s.value)}`}>{s.value}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }} animate={{ width: `${s.value}%` }}
                      transition={{ duration: 0.8, delay: i * 0.1, ease: "easeOut" }}
                      className={`h-full rounded-full bg-gradient-to-r ${s.color}`}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Feedback */}
            {session.final_feedback && (
              <div className="rounded-xl bg-violet-500/8 border border-violet-500/15 p-4">
                <h4 className="text-xs font-semibold text-violet-400/80 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> AI Feedback
                </h4>
                <p className="text-sm text-white/65 leading-relaxed italic">"{session.final_feedback}"</p>
              </div>
            )}

            {/* Tips */}
            {session.improvement_tips?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-amber-400/80 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Target className="w-3 h-3" /> Improvement Tips
                </h4>
                <div className="space-y-2">
                  {session.improvement_tips.map((tip, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 * i + 0.3 }}
                      className="flex gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10"
                    >
                      <span className="w-5 h-5 shrink-0 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-sm text-white/60">{tip}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Interview Table (Desktop) ────────────────────────────────────────────────

function InterviewTable({ sessions, onSelect }: { sessions: Session[]; onSelect: (s: Session) => void }) {
  const completed = sessions.filter((s) => s.status === "completed");
  if (!completed.length) return null;

  return (
    <div className="hidden md:block overflow-hidden rounded-2xl border border-white/5">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white/[0.03] border-b border-white/5">
            {["Date", "Overall", "Confidence", "Technical", "Communication", ""].map((h) => (
              <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-white/30 uppercase tracking-widest">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {completed.map((s, i) => (
            <motion.tr
              key={s.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="group border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors"
            >
              <td className="px-5 py-4 text-white/60">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-white/25 shrink-0" />
                  {shortDate(s.created_at)}
                </div>
              </td>
              {[s.overall_score, s.confidence_score, s.technical_score, s.communication_score].map((score, j) => (
                <td key={j} className="px-5 py-4">
                  <span className={`text-sm font-bold px-2.5 py-1 rounded-lg border ${scoreColor(safeScore(score))} ${scoreBg(safeScore(score))}`}>
                    {safeScore(score)}%
                  </span>
                </td>
              ))}
              <td className="px-5 py-4">
                <button
                  onClick={() => onSelect(s)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white/30 hover:text-violet-400 transition-colors group/btn"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span className="opacity-0 group-hover/btn:opacity-100 transition-opacity">Details</span>
                </button>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Interview Cards (Mobile) ─────────────────────────────────────────────────

function InterviewCards({ sessions, onSelect }: { sessions: Session[]; onSelect: (s: Session) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const completed = sessions.filter((s) => s.status === "completed");
  if (!completed.length) return null;

  return (
    <div className="md:hidden space-y-3">
      {completed.map((s, i) => {
        const isExpanded = expanded === s.id;
        const score = safeScore(s.overall_score);
        return (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl bg-[#0d0d14]/90 border border-white/5 overflow-hidden"
          >
            <button
              className="w-full flex items-center justify-between p-4"
              onClick={() => setExpanded(isExpanded ? null : s.id)}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${scoreGradient(score)} flex items-center justify-center text-sm font-bold text-white shadow-lg`}>
                  {score}
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-white/90">AI Interview</p>
                  <p className="text-xs text-white/40 flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3 h-3" /> {shortDate(s.created_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${scoreBg(score)} ${scoreColor(score)}`}>{score}%</span>
                <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="w-4 h-4 text-white/30" />
                </motion.div>
              </div>
            </button>
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden border-t border-white/5"
                >
                  <div className="p-4 space-y-3">
                    {[
                      { label: "Confidence", value: s.confidence_score },
                      { label: "Technical", value: s.technical_score },
                      { label: "Communication", value: s.communication_score },
                    ].map((metric) => (
                      <div key={metric.label} className="flex items-center gap-3">
                        <span className="text-xs text-white/40 w-24 shrink-0">{metric.label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }} animate={{ width: `${safeScore(metric.value)}%` }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500"
                          />
                        </div>
                        <span className={`text-xs font-bold w-10 text-right ${scoreColor(safeScore(metric.value))}`}>{safeScore(metric.value)}%</span>
                      </div>
                    ))}
                    <button
                      onClick={() => onSelect(s)}
                      className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 text-sm font-semibold hover:bg-violet-500/15 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> View Full Details
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Resume History ───────────────────────────────────────────────────────────

function ResumeHistory({ resumes }: { resumes: ResumeAnalysis[] }) {
  if (!resumes.length) return null;

  return (
    <div className="space-y-3">
      {resumes.map((r, i) => {
        const score = safeScore(r.score);
        const atsScore = safeScore(r.ats_score ?? r.score * 0.9);
        const prev = resumes[i + 1];
        const improved = prev ? score > safeScore(prev.score) : null;

        return (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="group rounded-2xl bg-[#0d0d14]/90 border border-white/5 p-4 hover:border-white/10 transition-all"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 shrink-0 rounded-xl bg-cyan-500/15 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white/90 truncate">{r.file_name || "Resume Analysis"}</p>
                  <p className="text-xs text-white/40 flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3 h-3" /> {shortDate(r.created_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {improved !== null && (
                  <span className={`flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-lg ${improved ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                    {improved ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                    {improved ? "Improved" : "Dropped"}
                  </span>
                )}
                <span className={`text-sm font-bold px-2.5 py-1 rounded-xl border ${scoreBg(score)} ${scoreColor(score)}`}>{score}%</span>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-white/35">Overall Score</span>
                  <span className="text-xs text-white/50">{score}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }} animate={{ width: `${score}%` }}
                    transition={{ duration: 0.8, delay: i * 0.06 + 0.2, ease: "easeOut" }}
                    className={`h-full rounded-full bg-gradient-to-r ${scoreGradient(score)}`}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-white/35">ATS Score</span>
                  <span className="text-xs text-white/50">{atsScore}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }} animate={{ width: `${atsScore}%` }}
                    transition={{ duration: 0.8, delay: i * 0.06 + 0.3, ease: "easeOut" }}
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="relative mb-6">
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 rounded-full bg-violet-500/20 blur-2xl"
        />
        <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-600/20 to-cyan-500/20 border border-white/10 flex items-center justify-center">
          <History className="w-9 h-9 text-white/30" />
        </div>
      </div>
      <h3 className="text-xl font-bold text-white/80 mb-2">No interviews yet</h3>
      <p className="text-sm text-white/35 max-w-xs mb-6">
        Complete your first AI interview to start tracking your performance and improvement over time.
      </p>
      <Link to="/resume">
        <motion.button
          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 text-white text-sm font-semibold shadow-lg shadow-violet-500/20"
        >
          <Sparkles className="w-4 h-4" /> Start First Interview
        </motion.button>
      </Link>
    </motion.div>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({
  scoreRange, setScoreRange, dateFilter, setDateFilter, onClear, visible, setVisible,
}: {
  scoreRange: [number, number];
  setScoreRange: (r: [number, number]) => void;
  dateFilter: string;
  setDateFilter: (d: string) => void;
  onClear: () => void;
  visible: boolean;
  setVisible: (v: boolean) => void;
}) {
  const hasFilters = dateFilter || scoreRange[0] !== 0 || scoreRange[1] !== 100;
  const presets = [
    { label: "All Time", value: "" },
    { label: "This Month", value: "month" },
    { label: "Last 3 Months", value: "3months" },
    { label: "This Year", value: "year" },
  ];
  const scorePresets = [
    { label: "All", range: [0, 100] as [number, number] },
    { label: "80+", range: [80, 100] as [number, number] },
    { label: "60–79", range: [60, 79] as [number, number] },
    { label: "<60", range: [0, 59] as [number, number] },
  ];

  return (
    <div className="rounded-2xl bg-[#0d0d14]/90 border border-white/5 overflow-hidden">
      <button
        onClick={() => setVisible(!visible)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2.5 text-sm text-white/60">
          <Filter className="w-4 h-4" />
          <span className="font-medium">Filters</span>
          {hasFilters && <span className="w-2 h-2 rounded-full bg-violet-400" />}
        </div>
        <div className="flex items-center gap-3">
          {hasFilters && (
            <button
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Clear
            </button>
          )}
          <motion.div animate={{ rotate: visible ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-4 h-4 text-white/30" />
          </motion.div>
        </div>
      </button>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-white/5"
          >
            <div className="p-5 grid sm:grid-cols-2 gap-5">
              <div>
                <p className="text-xs font-semibold text-white/35 uppercase tracking-widest mb-3">Time Period</p>
                <div className="flex flex-wrap gap-2">
                  {presets.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setDateFilter(p.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        dateFilter === p.value
                          ? "bg-violet-500/20 border border-violet-500/30 text-violet-300"
                          : "bg-white/[0.04] border border-white/5 text-white/45 hover:text-white/70"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-white/35 uppercase tracking-widest mb-3">Score Range</p>
                <div className="flex flex-wrap gap-2">
                  {scorePresets.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setScoreRange(p.range)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        scoreRange[0] === p.range[0] && scoreRange[1] === p.range[1]
                          ? "bg-cyan-500/20 border border-cyan-500/30 text-cyan-300"
                          : "bg-white/[0.04] border border-white/5 text-white/45 hover:text-white/70"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ collapsed, setCollapsed, onSignOut }: { collapsed: boolean; setCollapsed: (c: boolean) => void; onSignOut: () => void }) {
  const location = useLocation();
  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: FileText, label: "Resume Analysis", href: "/resume" },
    { icon: Mic, label: "Interview Mode", href: "/interview" },
    { icon: History, label: "History", href: "/history" },
    { icon: Settings, label: "Settings", href: "/settings" },
  ];

  return (
    <motion.aside
      animate={{ width: collapsed ? 68 : 220 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="relative h-screen flex flex-col bg-[#080810] border-r border-white/5 overflow-hidden shrink-0 z-30"
    >
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/5 min-h-[64px]">
        <div className="w-8 h-8 shrink-0 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
          <BrainCircuit className="w-4 h-4 text-white" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
              className="text-sm font-bold text-white whitespace-nowrap font-mono tracking-tight">
              ResumeAI
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map(({ icon: Icon, label, href }) => {
          const active = location.pathname === href;
          return (
            <Link key={href} to={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200
                ${active ? "bg-gradient-to-r from-violet-600/20 to-cyan-500/10 border border-violet-500/20 text-white" : "text-white/40 hover:text-white/80 hover:bg-white/5"}`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? "text-violet-400" : ""}`} />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-sm font-medium whitespace-nowrap">{label}</motion.span>
                )}
              </AnimatePresence>
              {active && !collapsed && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400" />}
            </Link>
          );
        })}
      </nav>
      <div className="px-2 py-4 border-t border-white/5">
        <button onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200">
          <LogOut className="w-4 h-4 shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-sm font-medium whitespace-nowrap">Sign Out</motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#1a1a2e] border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors z-10"
      >
        <motion.div animate={{ rotate: collapsed ? 0 : 180 }}>
          <ChevronLeft className="w-3 h-3 text-white/60" />
        </motion.div>
      </button>
    </motion.aside>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar({ user, sidebarOpen, setSidebarOpen }: { user: any; sidebarOpen: boolean; setSidebarOpen: (v: boolean) => void }) {
  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-[#080810]/80 backdrop-blur-xl shrink-0">
      <div className="flex items-center gap-3">
        <button className="lg:hidden p-2 rounded-lg hover:bg-white/5 transition-colors" onClick={() => setSidebarOpen(!sidebarOpen)}>
          <Menu className="w-4 h-4 text-white/60" />
        </button>
        <div>
          <h2 className="text-sm font-semibold text-white/80">Performance History</h2>
          <p className="text-xs text-white/30">Track your improvement over time</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button className="relative p-2 rounded-xl hover:bg-white/5 transition-colors">
          <Bell className="w-4 h-4 text-white/50" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-violet-500 rounded-full" />
        </button>
        <div className="flex items-center gap-2 pl-2 border-l border-white/10">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-xs font-bold text-white">
            {user?.user_metadata?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-semibold text-white/80">{user?.user_metadata?.full_name || "User"}</p>
            <p className="text-[10px] text-white/35 truncate max-w-[120px]">{user?.email}</p>
          </div>
        </div>
      </div>
    </header>
  );
}

// ─── History Page ─────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const { user, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [resumes, setResumes] = useState<ResumeAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [filterVisible, setFilterVisible] = useState(false);
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);
  const [dateFilter, setDateFilter] = useState("");
  const [activeTab, setActiveTab] = useState<"interviews" | "resumes">("interviews");

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [sessionsRes, resumesRes] = await Promise.all([
        supabase.from("interview_sessions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("resume_analyses").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      ]);
      setSessions((sessionsRes.data as Session[]) || []);
      setResumes((resumesRes.data as ResumeAnalysis[]) || []);
      setLoading(false);
    };
    fetchData();
  }, [user]);

  if (!user) return <Navigate to="/auth" replace />;

  const filterByDate = (date: string) => {
    if (!dateFilter) return true;
    const d = new Date(date);
    const now = new Date();
    if (dateFilter === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (dateFilter === "3months") return d >= new Date(now.getFullYear(), now.getMonth() - 3, 1);
    if (dateFilter === "year") return d.getFullYear() === now.getFullYear();
    return true;
  };

  const completedSessions = sessions.filter((s) => s.status === "completed");
  const filteredSessions = completedSessions.filter(
    (s) => safeScore(s.overall_score) >= scoreRange[0] && safeScore(s.overall_score) <= scoreRange[1] && filterByDate(s.created_at)
  );
  const filteredResumes = resumes.filter((r) => filterByDate(r.created_at));

  const bestScore = completedSessions.length ? Math.max(...completedSessions.map((s) => safeScore(s.overall_score))) : 0;
  const avgScore = completedSessions.length
    ? Math.round(completedSessions.reduce((a, s) => a + safeScore(s.overall_score), 0) / completedSessions.length)
    : 0;

  const statCards = [
    { icon: Mic, label: "Total Interviews", value: completedSessions.length, suffix: "", gradient: "from-violet-600 to-violet-400", delay: 0.1 },
    { icon: Award, label: "Best Score", value: bestScore, suffix: "%", gradient: "from-amber-600 to-amber-400", delay: 0.2 },
    { icon: Activity, label: "Average Score", value: avgScore, suffix: "%", gradient: "from-cyan-600 to-cyan-400", delay: 0.3 },
    { icon: FileText, label: "Resume Uploads", value: resumes.length, suffix: "", gradient: "from-emerald-600 to-emerald-400", delay: 0.4 },
  ];

  return (
    <div className="flex h-screen bg-[#060610] text-white overflow-hidden" style={{ fontFamily: "'DM Mono', 'JetBrains Mono', monospace" }}>
      {/* Background Orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-violet-600/8 blur-[100px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-cyan-600/8 blur-[100px]" />
        <div className="absolute top-[40%] left-[40%] w-[300px] h-[300px] rounded-full bg-emerald-600/5 blur-[80px]" />
      </div>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)} />
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} onSignOut={signOut} />
      </div>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div initial={{ x: -220 }} animate={{ x: 0 }} exit={{ x: -220 }} transition={{ duration: 0.25 }}
            className="fixed left-0 top-0 h-full z-30 lg:hidden">
            <Sidebar collapsed={false} setCollapsed={() => {}} onSignOut={signOut} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar user={user} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        <main className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-violet-900/30 to-cyan-900/20 border border-white/8 p-6"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600/5 via-transparent to-cyan-600/5" />
            <div className="relative">
              <p className="text-xs text-violet-400/80 font-semibold tracking-widest uppercase mb-1">Analytics</p>
              <h1 className="text-2xl md:text-3xl font-bold text-white">Performance History</h1>
              <p className="text-sm text-white/45 mt-1">Track your improvement over time</p>
            </div>
            <div className="absolute right-6 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-2 text-xs text-white/30">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              AI Coach Active
            </div>
          </motion.div>

          {/* Stat Cards */}
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {statCards.map((card) => <StatCard key={card.label} {...card} />)}
            </div>
          )}

          {/* Charts */}
          {!loading && completedSessions.length >= 2 && (
            <div>
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" /> Performance Analytics
              </h3>
              <PerformanceChart sessions={sessions} />
            </div>
          )}

          {/* Filters */}
          {!loading && (completedSessions.length > 0 || resumes.length > 0) && (
            <FilterBar
              scoreRange={scoreRange} setScoreRange={setScoreRange}
              dateFilter={dateFilter} setDateFilter={setDateFilter}
              onClear={() => { setScoreRange([0, 100]); setDateFilter(""); }}
              visible={filterVisible} setVisible={setFilterVisible}
            />
          )}

          {/* Main Content */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : completedSessions.length === 0 && resumes.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-5">
              {/* Tabs */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/5 w-fit">
                {(["interviews", "resumes"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`relative px-4 py-2 rounded-lg text-xs font-semibold transition-all capitalize ${
                      activeTab === tab ? "text-white" : "text-white/35 hover:text-white/60"
                    }`}
                  >
                    {activeTab === tab && (
                      <motion.div layoutId="tabBg" className="absolute inset-0 rounded-lg bg-white/8 border border-white/10" />
                    )}
                    <span className="relative flex items-center gap-1.5">
                      {tab === "interviews" ? <Mic className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                      {tab} {tab === "interviews" ? `(${completedSessions.length})` : `(${resumes.length})`}
                    </span>
                  </button>
                ))}
              </div>

              {/* Interview History */}
              <AnimatePresence mode="wait">
                {activeTab === "interviews" && (
                  <motion.div key="interviews" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest flex items-center gap-2">
                        <Mic className="w-3.5 h-3.5" /> Interview Sessions
                        {filteredSessions.length !== completedSessions.length && (
                          <span className="text-violet-400">— {filteredSessions.length} shown</span>
                        )}
                      </h3>
                    </div>
                    {filteredSessions.length === 0 ? (
                      <div className="rounded-2xl bg-[#0d0d14]/90 border border-white/5 p-8 text-center text-white/30 text-sm">
                        No sessions match your filters.
                      </div>
                    ) : (
                      <>
                        <InterviewTable sessions={filteredSessions} onSelect={setSelectedSession} />
                        <InterviewCards sessions={filteredSessions} onSelect={setSelectedSession} />
                      </>
                    )}
                  </motion.div>
                )}

                {/* Resume History */}
                {activeTab === "resumes" && (
                  <motion.div key="resumes" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                    <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5" /> Resume Uploads
                    </h3>
                    {filteredResumes.length === 0 ? (
                      <div className="rounded-2xl bg-[#0d0d14]/90 border border-white/5 p-8 text-center text-white/30 text-sm">
                        No resumes match your filters.
                      </div>
                    ) : (
                      <ResumeHistory resumes={filteredResumes} />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </main>
      </div>

      {/* Detail Modal */}
      {selectedSession && (
        <DetailModal session={selectedSession} onClose={() => setSelectedSession(null)} />
      )}

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