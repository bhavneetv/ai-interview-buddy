import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Navigate, Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  BrainCircuit, FileText, Mic, History, LogOut, Settings,
  LayoutDashboard, ChevronLeft, Bell, Moon, Sun, TrendingUp,
  Award, Activity, Users, Download, Play, Eye, Upload,
  Zap, Target, MessageSquare, Code2, BarChart2, ChevronRight,
  Menu, X, Sparkles, ArrowUpRight, Clock, CheckCircle2
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";

interface DashboardUserData {
  resumeScore: number;
  interviewScore: number;
  confidenceScore: number;
  totalInterviews: number;
}

interface TimelinePoint {
  date: string;
  resume: number;
  interview: number;
}

interface SkillPoint {
  skill: string;
  score: number;
}

interface ActivityItem {
  id: string;
  type: "interview" | "resume";
  title: string;
  score: number;
  date: string;
  status: string;
  created_at: string;
}

interface PerformanceData {
  timeline: TimelinePoint[];
  skills: SkillPoint[];
}

const safeScore = (value) => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
};

const averageScore = (values) => {
  const normalized = values
    .map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null))
    .filter((value) => value !== null);

  if (!normalized.length) return 0;
  return safeScore(normalized.reduce((sum, value) => sum + value, 0) / normalized.length);
};

const monthKey = (isoDate) => {
  const d = new Date(isoDate);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const monthLabel = (isoDate) =>
  new Date(isoDate).toLocaleDateString(undefined, { month: "short" });

const shortDate = (isoDate) =>
  new Date(isoDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

// ─── Custom Hooks ────────────────────────────────────────────────────────────

function useUserData(user) {
  const [userData, setUserData] = useState<DashboardUserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setUserData(null);
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);

      const [resumeRes, sessionsRes] = await Promise.all([
        supabase
          .from("resume_analyses")
          .select("score, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("interview_sessions")
          .select("overall_score, confidence_score, status, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      if (resumeRes.error || sessionsRes.error) {
        setError(resumeRes.error?.message || sessionsRes.error?.message || "Failed to load dashboard stats");
        setUserData({
          resumeScore: 0,
          interviewScore: 0,
          confidenceScore: 0,
          totalInterviews: 0,
        });
        setLoading(false);
        return;
      }

      const latestResume = resumeRes.data?.[0];
      const completedSessions = (sessionsRes.data || []).filter((s) => s.status === "completed");
      const latestCompleted = completedSessions[0];

      setUserData({
        resumeScore: safeScore(latestResume?.score),
        interviewScore: safeScore(latestCompleted?.overall_score),
        confidenceScore: safeScore(
          latestCompleted?.confidence_score ?? averageScore(completedSessions.map((s) => s.confidence_score)),
        ),
        totalInterviews: completedSessions.length,
      });
      setLoading(false);
    };

    void load();
  }, [user]);

  return { userData, loading, error };
}

function usePerformanceData(user) {
  const [performanceData, setPerformanceData] = useState<PerformanceData>({
    timeline: [],
    skills: [],
  });
  const [activityData, setActivityData] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setPerformanceData({ timeline: [], skills: [] });
      setActivityData([]);
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);

      const [sessionsRes, resumesRes] = await Promise.all([
        supabase
          .from("interview_sessions")
          .select("id, overall_score, confidence_score, communication_score, technical_score, resume_match_score, status, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(40),
        supabase
          .from("resume_analyses")
          .select("id, file_name, score, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      if (sessionsRes.error || resumesRes.error) {
        setError(sessionsRes.error?.message || resumesRes.error?.message || "Failed to load performance data");
        setPerformanceData({ timeline: [], skills: [] });
        setActivityData([]);
        setLoading(false);
        return;
      }

      const sessions = sessionsRes.data || [];
      const completedSessions = sessions.filter((s) => s.status === "completed");
      const resumes = resumesRes.data || [];

      const grouped = new Map();

      resumes.forEach((resume) => {
        const key = monthKey(resume.created_at);
        const existing = grouped.get(key) || {
          dateSource: resume.created_at,
          resumeScores: [],
          interviewScores: [],
        };
        existing.resumeScores.push(safeScore(resume.score));
        grouped.set(key, existing);
      });

      completedSessions.forEach((session) => {
        const key = monthKey(session.created_at);
        const existing = grouped.get(key) || {
          dateSource: session.created_at,
          resumeScores: [],
          interviewScores: [],
        };
        existing.interviewScores.push(safeScore(session.overall_score));
        grouped.set(key, existing);
      });

      const timeline = Array.from(grouped.values())
        .sort((a, b) => +new Date(a.dateSource) - +new Date(b.dateSource))
        .slice(-6)
        .map((item) => ({
          date: monthLabel(item.dateSource),
          resume: averageScore(item.resumeScores),
          interview: averageScore(item.interviewScores),
        }));

      const skills = [
        { skill: "Communication", score: averageScore(completedSessions.map((s) => s.communication_score)) },
        { skill: "Technical", score: averageScore(completedSessions.map((s) => s.technical_score)) },
        { skill: "Confidence", score: averageScore(completedSessions.map((s) => s.confidence_score)) },
        { skill: "Resume Match", score: averageScore(completedSessions.map((s) => s.resume_match_score)) },
      ];

      const sessionActivity = completedSessions.slice(0, 5).map((session) => ({
        id: `interview-${session.id}`,
        type: "interview" as const,
        title: "AI Interview Session",
        score: safeScore(session.overall_score),
        date: shortDate(session.created_at),
        status: session.status,
        created_at: session.created_at,
      }));

      const resumeActivity = resumes.slice(0, 5).map((resume) => ({
        id: `resume-${resume.id}`,
        type: "resume" as const,
        title: resume.file_name || "Resume Analysis",
        score: safeScore(resume.score),
        date: shortDate(resume.created_at),
        status: "analyzed",
        created_at: resume.created_at,
      }));

      const recentActivity = [...sessionActivity, ...resumeActivity]
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
        .slice(0, 8);

      setPerformanceData({ timeline, skills });
      setActivityData(recentActivity);
      setLoading(false);
    };

    void load();
  }, [user]);

  return { performanceData, activityData, loading, error };
}

// ─── Count-Up Animation ──────────────────────────────────────────────────────

function useCountUp(target, duration = 1500, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start || !target) return;
    let startTime = null;
    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return count;
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, suffix = "", gradient, delay = 0 }) {
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
      <div className="relative overflow-hidden rounded-2xl p-px bg-gradient-to-br from-white/10 to-white/5">
        <div className="relative rounded-2xl bg-[#0d0d14]/90 backdrop-blur-xl p-5 h-full">
          <div className={`absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br ${gradient} blur-xl`} style={{ zIndex: -1 }} />
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

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }) {
  return (
    <div className={`animate-pulse rounded-xl bg-white/5 ${className}`} />
  );
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#111120] border border-white/10 rounded-xl p-3 shadow-2xl text-xs">
      <p className="text-white/60 mb-2 font-medium">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }} className="font-semibold">
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

// ─── Performance Charts ──────────────────────────────────────────────────────

function PerformanceChart({ data, loading }) {
  if (loading) return (
    <div className="grid md:grid-cols-2 gap-4">
      <Skeleton className="h-64" />
      <Skeleton className="h-64" />
    </div>
  );

  if (!data?.timeline?.length && !data?.skills?.length) {
    return (
      <div className="rounded-2xl bg-[#0d0d14]/90 border border-white/5 p-8 text-center text-white/40">
        No performance data yet. Complete an interview to see charts.
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
        className="rounded-2xl bg-[#0d0d14]/90 border border-white/5 p-5">
        <h3 className="text-sm font-semibold text-white/70 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-violet-400" /> Score Trend
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data.timeline}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
            <XAxis dataKey="date" tick={{ fill: "#ffffff40", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#ffffff40", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="resume" stroke="#8b5cf6" strokeWidth={2.5} dot={{ fill: "#8b5cf6", r: 4 }} name="Resume" />
            <Line type="monotone" dataKey="interview" stroke="#93a8cc" strokeWidth={2.5} dot={{ fill: "#93a8cc", r: 4 }} name="Interview" />
          </LineChart>
        </ResponsiveContainer>
      </motion.div>

      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
        className="rounded-2xl bg-[#0d0d14]/90 border border-white/5 p-5">
        <h3 className="text-sm font-semibold text-white/70 mb-4 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-cyan-400" /> Skill Breakdown
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data.skills} barSize={28}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
            <XAxis dataKey="skill" tick={{ fill: "#ffffff40", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#ffffff40", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="score" name="Score" fill="url(#barGrad)" radius={[6, 6, 0, 0]} />
            <defs>
              <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#93a8cc" />
              </linearGradient>
            </defs>
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
}

// ─── Activity Table ───────────────────────────────────────────────────────────

function ActivityTable({ data, loading }) {
  if (loading) return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14" />)}
    </div>
  );

  if (!data.length) return (
    <div className="text-center py-12 text-white/30">
      <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
      <p className="text-sm">No activity yet. Start your first interview!</p>
    </div>
  );

  const scoreColor = (s) => s >= 80 ? "text-emerald-400" : s >= 65 ? "text-amber-400" : "text-red-400";
  const scoreBg = (s) => s >= 80 ? "bg-emerald-400/10" : s >= 65 ? "bg-amber-400/10" : "bg-red-400/10";

  return (
    <div className="space-y-2">
      {data.map((item, i) => (
        <motion.div key={item.id}
          initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.05 * i }}
          className="group flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/5 px-4 py-3 hover:bg-white/[0.06] hover:border-white/10 transition-all duration-200"
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.type === "interview" ? "bg-violet-500/20" : "bg-cyan-500/20"}`}>
              {item.type === "interview"
                ? <Mic className="w-4 h-4 text-violet-400" />
                : <FileText className="w-4 h-4 text-cyan-400" />}
            </div>
            <div>
              <p className="text-sm font-medium text-white/90">{item.title}</p>
              <p className="text-xs text-white/35 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {item.date}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${scoreColor(item.score)} ${scoreBg(item.score)}`}>
              {item.score}%
            </span>
            <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-white/5 hover:bg-white/10">
              <Eye className="w-3.5 h-3.5 text-white/60" />
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Insights Panel ───────────────────────────────────────────────────────────

function InsightsPanel({ userData, loading }) {
  const strengths = [
    { icon: Code2, label: "Strong Technical Skills", desc: "Consistently scoring above 80% in technical rounds" },
    { icon: FileText, label: "Well-Structured Resume", desc: "Clear layout with quantified achievements" },
    { icon: Target, label: "Industry-Relevant Keywords", desc: "87% keyword match with job descriptions" },
  ];

  const improvements = [
    { icon: MessageSquare, label: "Communication Flow", desc: "Work on reducing filler words in responses" },
    { icon: Activity, label: "Confidence Under Pressure", desc: "Maintain composure during technical deep-dives" },
    { icon: Zap, label: "Response Conciseness", desc: "Keep answers under 2 minutes for behavioral questions" },
  ];

  if (loading) return (
    <div className="grid md:grid-cols-2 gap-4">
      {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20" />)}
    </div>
  );

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-emerald-400/80 uppercase tracking-widest mb-3 flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5" /> Strengths
        </h4>
        {strengths.map((item, i) => (
          <motion.div key={i}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * i }}
            className="flex gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 hover:border-emerald-500/25 transition-all"
          >
            <div className="w-8 h-8 shrink-0 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <item.icon className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white/85">{item.label}</p>
              <p className="text-xs text-white/40 mt-0.5">{item.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-amber-400/80 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Target className="w-3.5 h-3.5" /> Improve
        </h4>
        {improvements.map((item, i) => (
          <motion.div key={i}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * i + 0.15 }}
            className="flex gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 hover:border-amber-500/25 transition-all"
          >
            <div className="w-8 h-8 shrink-0 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <item.icon className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white/85">{item.label}</p>
              <p className="text-xs text-white/40 mt-0.5">{item.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({ collapsed, setCollapsed, onSignOut }) {
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
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/5 min-h-[64px]">
        <div className="w-8 h-8 shrink-0 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
          <BrainCircuit className="w-4.5 h-4.5 text-white" />
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

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map(({ icon: Icon, label, href }) => {
          const active = location.pathname === href;
          return (
            <Link key={href} to={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group
                ${active
                  ? "bg-gradient-to-r from-violet-600/20 to-cyan-500/10 border border-violet-500/20 text-white"
                  : "text-white/40 hover:text-white/80 hover:bg-white/5"
                }`}
            >
              <Icon className={`w-4.5 h-4.5 shrink-0 ${active ? "text-violet-400" : ""}`} />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-sm font-medium whitespace-nowrap">
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
              {active && !collapsed && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-2 py-4 border-t border-white/5">
        <button onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200">
          <LogOut className="w-4.5 h-4.5 shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-sm font-medium whitespace-nowrap">
                Sign Out
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Collapse toggle */}
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

// ─── Navbar ──────────────────────────────────────────────────────────────────

function Navbar({ user, darkMode, setDarkMode, sidebarOpen, setSidebarOpen }) {
  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-[#080810]/80 backdrop-blur-xl shrink-0">
      <div className="flex items-center gap-3">
        <button className="lg:hidden p-2 rounded-lg hover:bg-white/5 transition-colors"
          onClick={() => setSidebarOpen(!sidebarOpen)}>
          <Menu className="w-4 h-4 text-white/60" />
        </button>
        <div>
          <h2 className="text-sm font-semibold text-white/80">Dashboard</h2>
          <p className="text-xs text-white/30">Overview & Analytics</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button className="relative p-2 rounded-xl hover:bg-white/5 transition-colors">
          <Bell className="w-4 h-4 text-white/50" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-violet-500 rounded-full" />
        </button>
        <button onClick={() => setDarkMode(!darkMode)}
          className="p-2 rounded-xl hover:bg-white/5 transition-colors">
          {darkMode ? <Sun className="w-4 h-4 text-white/50" /> : <Moon className="w-4 h-4 text-white/50" />}
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

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { userData, loading: userLoading, error: userError } = useUserData(user);
  const { performanceData, activityData, loading: perfLoading, error: perfError } = usePerformanceData(user);

  if (!user) return <Navigate to="/auth" replace />;

  const statCards = [
    { icon: FileText, label: "Latest Resume Score", value: userData?.resumeScore ?? 0, suffix: "%", gradient: "from-violet-600 to-violet-400", delay: 0.1 },
    { icon: Mic, label: "Last Interview Score", value: userData?.interviewScore ?? 0, suffix: "%", gradient: "from-cyan-600 to-cyan-400", delay: 0.2 },
    { icon: Sparkles, label: "Confidence Score", value: userData?.confidenceScore ?? 0, suffix: "%", gradient: "from-emerald-600 to-emerald-400", delay: 0.3 },
    { icon: Award, label: "Total Interviews", value: userData?.totalInterviews ?? 0, suffix: "", gradient: "from-amber-600 to-amber-400", delay: 0.4 },
  ];

  const quickActions = [
    { icon: Upload, label: "Analyze New Resume", sub: "AI-powered scoring", href: "/resume", gradient: "from-violet-600 to-violet-500" },
    { icon: Play, label: "Start AI Interview", sub: "Voice-based practice", href: "/resume", gradient: "from-cyan-600 to-cyan-500" },
    { icon: History, label: "View Detailed History", sub: "Track progress", href: "/history", gradient: "from-emerald-600 to-emerald-500" },
    { icon: Download, label: "Download Last Report", sub: "PDF export", href: "#", gradient: "from-amber-600 to-amber-500" },
  ];

  return (
    <div className="flex h-screen bg-[#060610] text-white overflow-hidden" style={{ fontFamily: "'DM Mono', 'JetBrains Mono', monospace" }}>
      {/* Background Orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-violet-600/8 blur-[100px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-cyan-600/8 blur-[100px]" />
        <div className="absolute top-[40%] left-[40%] w-[300px] h-[300px] rounded-full bg-emerald-600/5 blur-[80px]" />
      </div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)} />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <div className={`hidden lg:block`}>
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} onSignOut={signOut} />
      </div>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div initial={{ x: -220 }} animate={{ x: 0 }} exit={{ x: -220 }}
            transition={{ duration: 0.25 }}
            className="fixed left-0 top-0 h-full z-30 lg:hidden">
            <Sidebar collapsed={false} setCollapsed={() => {}} onSignOut={signOut} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar user={user} darkMode={darkMode} setDarkMode={setDarkMode}
          sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        <main className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Welcome */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-violet-900/30 to-cyan-900/20 border border-white/8 p-6">
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600/5 via-transparent to-cyan-600/5" />
            <div className="relative">
              <p className="text-xs text-violet-400/80 font-semibold tracking-widest uppercase mb-1">Welcome back</p>
              <h1 className="text-2xl md:text-3xl font-bold text-white">
                {user?.user_metadata?.full_name || "there"}
              </h1>
              <p className="text-sm text-white/45 mt-1">
                {userData?.interviewScore >= 80
                  ? "Outstanding performance! You're in the top 10% of candidates."
                  : "Keep pushing. Your scores are trending upward this month."}
              </p>
            </div>
            <div className="absolute right-6 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-2 text-xs text-white/30">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              AI Coach Active
            </div>
          </motion.div>

          {(userError || perfError) && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {userError || perfError}
            </div>
          )}

          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {userLoading
              ? [...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)
              : statCards.map((card) => <StatCard key={card.label} {...card} />)
            }
          </div>

          {/* Charts */}
          <div>
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5" /> Performance Analytics
            </h3>
            <PerformanceChart data={performanceData} loading={perfLoading} />
          </div>

          {/* Quick Actions */}
          <div>
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5" /> Quick Actions
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {quickActions.map((action, i) => (
                <motion.div key={action.label}
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * i }}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Link to={action.href}
                    className="group relative flex flex-col gap-3 p-4 rounded-2xl bg-[#0d0d14] border border-white/5 hover:border-white/15 transition-all duration-300 overflow-hidden h-full"
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${action.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center shadow-lg`}>
                      <action.icon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white/90 leading-tight">{action.label}</p>
                      <p className="text-xs text-white/35 mt-0.5">{action.sub}</p>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/60 transition-colors absolute top-4 right-4" />
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Activity + Insights */}
          <div className="grid lg:grid-cols-2 gap-4 pb-4">
            <div className="rounded-2xl bg-[#0d0d14]/90 border border-white/5 p-5">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4 flex items-center gap-2">
                <History className="w-3.5 h-3.5" /> Recent Activity
              </h3>
              <ActivityTable data={activityData} loading={perfLoading} />
            </div>

            <div className="rounded-2xl bg-[#0d0d14]/90 border border-white/5 p-5">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" /> AI Insights
              </h3>
              <InsightsPanel userData={userData} loading={userLoading} />
            </div>
          </div>
        </main>
      </div>

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
