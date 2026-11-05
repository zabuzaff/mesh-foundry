import { StudioSelect } from "./Select";
import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
export const ease = [0.16, 1, 0.3, 1] as const;
export function Selection({ id }: { id: string }) {
  return (
    <motion.span
      aria-hidden="true"
      className="selection-surface"
      layoutId={id}
      transition={{ type: "spring", stiffness: 420, damping: 38 }}
    />
  );
}
export function Disclosure({
  title,
  children,
  initialOpen = true,
  className = "",
}: {
  title: string;
  children: ReactNode;
  initialOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(initialOpen),
    id = useId();
  return (
    <section className={"disclosure " + className}>
      <h2>
        <button
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          {title}
          <motion.svg
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.22 }}
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="m7 4 6 6-6 6" />
          </motion.svg>
        </button>
      </h2>
      <motion.div
        id={id}
        className="disclosure-content"
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.28, ease }}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="disclosure-body">{children}</div>
      </motion.div>
    </section>
  );
}
export function Transport({
  playing,
  disabled,
  time,
  duration,
  speed,
  loop,
  clips,
  clip,
  onToggle,
  onSeek,
  onSpeed,
  onLoop,
  onClip,
}: {
  playing: boolean;
  disabled: boolean;
  time: number;
  duration: number;
  speed: number;
  loop: boolean;
  clips: { name: string }[];
  clip: string;
  onToggle: () => void;
  onSeek: (time: number) => void;
  onSpeed: (speed: number) => void;
  onLoop: () => void;
  onClip: (clip: string) => void;
}) {
  const reduced = useReducedMotion();
  const seek = (t: number) => onSeek(Math.max(0, Math.min(duration, t)));
  return (
    <div className="transport" role="group" aria-label="Animation transport">
      <div className="transport-top">
        <div className="transport-buttons">
          <button
            aria-label="Restart animation"
            title="Restart"
            disabled={disabled}
            onClick={() => seek(0)}
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d="M4 4v12M16 4l-9 6 9 6Z" />
            </svg>
          </button>
          <button
            aria-label="Previous frame"
            title="Previous frame"
            disabled={disabled}
            onClick={() => seek(time - 1 / 24)}
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d="M5 4v12M15 4l-7 6 7 6Z" />
            </svg>
          </button>
          <motion.button
            className="play-toggle"
            aria-label={playing ? "Pause" : "Play"}
            disabled={disabled}
            onClick={onToggle}
            whileTap={{ scale: reduced ? 1 : 0.92 }}
          >
            <AnimatePresence initial={false} mode="wait">
              <motion.svg
                key={playing ? "pause" : "play"}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.1 }}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                {playing ? (
                  <path d="M5 4h3v12H5zm7 0h3v12h-3z" />
                ) : (
                  <path d="m6 3 11 7-11 7z" />
                )}
              </motion.svg>
            </AnimatePresence>
          </motion.button>
          <button
            aria-label="Next frame"
            title="Next frame"
            disabled={disabled}
            onClick={() => seek(time + 1 / 24)}
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d="M15 4v12M5 4l7 6-7 6Z" />
            </svg>
          </button>
        </div>
        <StudioSelect
          label="Animation clip"
          value={clip}
          disabled={disabled}
          onChange={onClip}
          placeholder="Static model"
          options={clips.map((c) => ({ value: c.name, label: c.name }))}
        />

        <div className="transport-options">
          <StudioSelect
            label="Playback speed"
            value={String(speed)}
            onChange={(v) => onSpeed(Number(v))}
            options={[0.25, 0.5, 1, 1.5, 2].map((s) => ({
              value: String(s),
              label: s + "×",
            }))}
          />

          <button
            aria-label="Loop playback"
            aria-pressed={loop}
            title="Loop playback"
            onClick={onLoop}
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M15 5H6a3 3 0 0 0-3 3v2m12-8 3 3-3 3M5 15h9a3 3 0 0 0 3-3v-2M5 12l-3 3 3 3" />
            </svg>
          </button>
        </div>
      </div>
      <div
        className="timeline"
        style={
          {
            "--progress": `${Math.min(100, (time / Math.max(duration, 0.01)) * 100)}%`,
          } as React.CSSProperties
        }
      >
        <div className="timeline-ticks" aria-hidden="true" />
        <input
          type="range"
          aria-label="Animation time"
          min="0"
          max={duration}
          step={1 / 24}
          disabled={disabled}
          value={time}
          onChange={(e) => seek(Number(e.target.value))}
        />
      </div>
      <div className="timeline-readout">
        <span>
          {String(Math.round(time * 24)).padStart(3, "0")}{" "}
          <small>frame · 24 fps preview</small>
        </span>
        <span>
          {time.toFixed(2)} <small>/ {duration.toFixed(2)}s</small>
        </span>
      </div>
    </div>
  );
}
