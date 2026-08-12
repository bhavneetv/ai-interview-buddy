import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, SettingsIcon, Camera, Mic, Volume2, ScanFace, RotateCcw, Clock } from 'lucide-react';
import { useSettings, AppSettings } from '@/lib/settings';
import FaceScanPanel from '@/components/FaceScanPanel';

const tokens = { bg: '#050510', violet: '#7c3aed', cyan: '#06b6d4' };

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative w-11 h-6 rounded-full transition-colors shrink-0"
      style={{ background: checked ? tokens.violet : 'rgba(255,255,255,0.12)' }}
    >
      <motion.span
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white"
        animate={{ left: checked ? 22 : 2 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      />
    </button>
  );
}

function Row({
  icon: Icon, title, description, children,
}: { icon: any; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'rgba(124,58,237,0.15)' }}>
        <Icon className="w-4 h-4" style={{ color: tokens.violet }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white/90">{title}</p>
        <p className="text-xs text-white/40 mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const { settings, update, reset } = useSettings();
  const set = <K extends keyof AppSettings>(k: K) => (v: AppSettings[K]) => update(k, v);

  return (
    <div className="min-h-screen" style={{ background: tokens.bg, fontFamily: "'DM Mono', monospace" }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full blur-[130px]" style={{ background: `${tokens.violet}10` }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full blur-[130px]" style={{ background: `${tokens.cyan}10` }} />
      </div>

      <header className="relative z-20" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(5,5,15,0.8)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/dashboard">
            <button className="flex items-center gap-2 text-sm text-white/50 hover:text-white/90 px-3 py-1.5 rounded-xl hover:bg-white/5 transition">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          </Link>
          <div className="w-px h-5" style={{ background: 'rgba(255,255,255,0.1)' }} />
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-white/70" />
            <h1 className="text-sm font-bold text-white/90">Settings</h1>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-3xl mx-auto px-4 py-8 space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <h2 className="text-xs uppercase tracking-widest text-white/40 mb-2">Camera & Face Scan</h2>

          <Row icon={Camera} title="Enable camera" description="Use your webcam during interviews for live proctoring.">
            <Toggle checked={settings.cameraEnabled} onChange={set('cameraEnabled')} />
          </Row>
          <Row icon={ScanFace} title="Face attendance" description="Track that you stay in frame for the whole session.">
            <Toggle checked={settings.faceAttendance} onChange={set('faceAttendance')} />
          </Row>
          <Row icon={ScanFace} title="Nervousness alerts" description="Warn you when restlessness or lost eye contact is detected.">
            <Toggle checked={settings.nervousnessAlerts} onChange={set('nervousnessAlerts')} />
          </Row>
          <Row icon={Camera} title="Mirror preview" description="Flip the camera preview like a mirror.">
            <Toggle checked={settings.mirrorCamera} onChange={set('mirrorCamera')} />
          </Row>

          {settings.cameraEnabled && (
            <div className="pt-5">
              <p className="text-xs text-white/40 mb-2">Live preview & calibration</p>
              <div className="max-w-xs">
                <FaceScanPanel enabled mirror={settings.mirrorCamera} />
              </div>
            </div>
          )}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="rounded-2xl p-5"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <h2 className="text-xs uppercase tracking-widest text-white/40 mb-2">Voice & Interview</h2>

          <Row icon={Volume2} title="AI voice" description="Let the AI coach read questions and feedback aloud.">
            <Toggle checked={settings.voiceEnabled} onChange={set('voiceEnabled')} />
          </Row>
          <Row icon={Mic} title="Auto-start microphone" description="Start recording automatically after each question.">
            <Toggle checked={settings.autoStartMic} onChange={set('autoStartMic')} />
          </Row>
          <Row icon={Clock} title="Answer time" description="Seconds allowed per answer.">
            <select
              value={settings.answerSeconds}
              onChange={(e) => update('answerSeconds', Number(e.target.value))}
              className="bg-white/5 text-white/80 text-sm rounded-lg px-3 py-1.5 outline-none"
              style={{ border: '1px solid rgba(255,255,255,0.1)' }}
            >
              {[30, 45, 60, 90, 120].map(s => <option key={s} value={s} style={{ background: '#12121f' }}>{s}s</option>)}
            </select>
          </Row>
        </motion.section>

        <button
          onClick={reset}
          className="flex items-center gap-2 text-xs text-white/50 hover:text-white/90 px-4 py-2 rounded-xl hover:bg-white/5 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
        </button>
      </main>
    </div>
  );
}
