import { motion } from 'framer-motion';
import { Camera, CameraOff, ScanFace, ShieldCheck, Activity } from 'lucide-react';
import { useFaceMonitor } from '@/hooks/useFaceMonitor';

const tokens = {
  violet: '#5b8cff',
  cyan: '#93a8cc',
  emerald: '#4fa87d',
  amber: '#c9a227',
  red: '#d96a6a',
};

interface Props {
  enabled: boolean;
  mirror?: boolean;
  compact?: boolean;
  alerts?: boolean;
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
        <span className="text-white/40">{label}</span>
        <span className="font-semibold" style={{ color }}>{value}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          animate={{ width: `${Math.max(2, value)}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>
    </div>
  );
}

export default function FaceScanPanel({ enabled, mirror = true, compact = false, alerts = true }: Props) {
  const { videoRef, metrics, active, error } = useFaceMonitor(enabled);

  if (!enabled) return null;

  const stateColor = !active || error
    ? tokens.red
    : metrics.facePresent ? tokens.emerald : tokens.amber;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)' }}
    >
      <div className="relative">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`w-full ${compact ? 'h-28' : 'h-36'} object-cover bg-black/60`}
          style={{ transform: mirror ? 'scaleX(-1)' : undefined }}
        />
        {/* Scan frame */}
        <div className="absolute inset-3 rounded-xl pointer-events-none" style={{ border: `1px dashed ${stateColor}55` }} />
        <motion.div
          className="absolute left-3 right-3 h-px pointer-events-none"
          style={{ background: `linear-gradient(90deg, transparent, ${stateColor}, transparent)` }}
          animate={{ top: ['12%', '86%', '12%'] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(0,0,0,0.55)', color: stateColor }}>
          {active && !error ? <Camera className="w-3 h-3" /> : <CameraOff className="w-3 h-3" />}
          {error ? error : metrics.facePresent ? 'Face detected' : active ? 'No face' : 'Starting…'}
        </div>
      </div>

      <div className="p-3 space-y-2.5">
        <div className="flex items-center gap-1.5 text-[11px] text-white/50">
          <ScanFace className="w-3.5 h-3.5" style={{ color: tokens.cyan }} />
          Live proctoring
        </div>
        <Meter label="Attendance" value={metrics.attendancePercent} color={tokens.cyan} />
        <Meter label="Confidence" value={metrics.confidence} color={tokens.emerald} />
        <Meter label="Nervousness" value={metrics.nervousness} color={metrics.nervousness > 55 ? tokens.red : tokens.amber} />
        <Meter label="Eye contact" value={metrics.eyeContact} color={tokens.violet} />
        {alerts && metrics.facePresent && metrics.nervousness > 60 && (
          <p className="text-[10px]" style={{ color: tokens.red }}>Take a breath — high restlessness detected.</p>
        )}
        {alerts && active && !metrics.facePresent && (
          <p className="text-[10px]" style={{ color: tokens.amber }}>Stay in frame for attendance tracking.</p>
        )}
        <div className="flex items-center justify-between text-[10px] text-white/30 pt-1">
          <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Motion {metrics.movement}</span>
          <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Away {metrics.awayEvents}x</span>
        </div>
      </div>
    </div>
  );
}
