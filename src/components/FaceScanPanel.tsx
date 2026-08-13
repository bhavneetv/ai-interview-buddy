import { motion } from 'framer-motion';
import { Camera, CameraOff, ScanFace, ShieldCheck, Activity } from 'lucide-react';
import { useFaceMonitor } from '@/hooks/useFaceMonitor';

const tokens = {
  accent: '#5b8cff',
  muted: '#93a8cc',
  good: '#4fa87d',
  warn: '#c9a227',
  bad: '#d96a6a',
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
        <span className="font-medium" style={{ color }}>{value}%</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
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

function FocusSquare({ box, color, mirror }: { box: { x: number; y: number; w: number; h: number }; color: string; mirror: boolean }) {
  const left = mirror ? 1 - box.x - box.w : box.x;
  const corner = 'absolute w-3.5 h-3.5';
  return (
    <motion.div
      className="absolute pointer-events-none"
      animate={{
        left: `${left * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.w * 100}%`,
        height: `${box.h * 100}%`,
      }}
      transition={{ duration: 0.25, ease: 'linear' }}
      style={{ border: `1px solid ${color}66`, borderRadius: 6 }}
    >
      <span className={`${corner} -top-px -left-px`} style={{ borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}`, borderTopLeftRadius: 6 }} />
      <span className={`${corner} -top-px -right-px`} style={{ borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}`, borderTopRightRadius: 6 }} />
      <span className={`${corner} -bottom-px -left-px`} style={{ borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}`, borderBottomLeftRadius: 6 }} />
      <span className={`${corner} -bottom-px -right-px`} style={{ borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}`, borderBottomRightRadius: 6 }} />
    </motion.div>
  );
}

export default function FaceScanPanel({ enabled, mirror = true, compact = false, alerts = true }: Props) {
  const { videoRef, metrics, active, error } = useFaceMonitor(enabled);

  if (!enabled) return null;

  const stateColor = !active || error
    ? tokens.bad
    : metrics.facePresent ? tokens.good : tokens.warn;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="relative">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`w-full ${compact ? 'h-28' : 'h-36'} object-cover bg-black/60`}
          style={{ transform: mirror ? 'scaleX(-1)' : undefined }}
        />
        {/* OpenCV face focus square */}
        {metrics.box && metrics.facePresent && (
          <FocusSquare box={metrics.box} color={stateColor} mirror={mirror} />
        )}
        <div
          className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium"
          style={{ background: 'rgba(0,0,0,0.6)', color: stateColor }}
        >
          {active && !error ? <Camera className="w-3 h-3" /> : <CameraOff className="w-3 h-3" />}
          {error ? error : metrics.facePresent ? 'Face locked' : active ? 'No face' : 'Starting…'}
        </div>
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider text-white/45"
          style={{ background: 'rgba(0,0,0,0.55)' }}>
          {metrics.engine}
        </div>
      </div>

      <div className="p-3 space-y-2.5">
        <div className="flex items-center gap-1.5 text-[11px] text-white/45">
          <ScanFace className="w-3.5 h-3.5" style={{ color: tokens.muted }} />
          Live proctoring
        </div>
        <Meter label="Attendance" value={metrics.attendancePercent} color={tokens.muted} />
        <Meter label="Confidence" value={metrics.confidence} color={tokens.good} />
        <Meter label="Nervousness" value={metrics.nervousness} color={metrics.nervousness > 55 ? tokens.bad : tokens.warn} />
        <Meter label="Eye contact" value={metrics.eyeContact} color={tokens.accent} />
        {alerts && metrics.facePresent && metrics.nervousness > 60 && (
          <p className="text-[10px]" style={{ color: tokens.bad }}>Take a breath — high restlessness detected.</p>
        )}
        {alerts && active && !metrics.facePresent && (
          <p className="text-[10px]" style={{ color: tokens.warn }}>Stay in frame for attendance tracking.</p>
        )}
        <div className="flex items-center justify-between text-[10px] text-white/30 pt-1">
          <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Motion {metrics.movement}</span>
          <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Away {metrics.awayEvents}x</span>
        </div>
      </div>
    </div>
  );
}

