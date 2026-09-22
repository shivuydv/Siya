import { motion } from "motion/react";

type VisualizerState = "idle" | "listening" | "processing" | "speaking";

interface VisualizerProps {
  state: VisualizerState;
  expression?: string;
  userName?: string;
}

export default function Visualizer({ state, userName = "User" }: VisualizerProps) {
  const getRingAnimation = (index: number, reverse: boolean = false) => {
    const baseSpeed = state === "listening" ? 4 : state === "processing" ? 2 : state === "speaking" ? 2.5 : 18;
    return {
      rotate: reverse ? [-360, 0] : [0, 360],
      transition: { duration: baseSpeed + index * 3, repeat: Infinity, ease: "linear" }
    };
  };

  const getPulseAnimation = () => {
    if (state === "speaking") {
      return {
        scale: [1, 1.06, 0.97, 1.04, 1],
        opacity: [0.85, 1, 0.85, 1, 0.85],
        transition: { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
      };
    }
    if (state === "listening") {
      return {
        scale: [1, 1.03, 1],
        opacity: [0.75, 1, 0.75],
        transition: { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
      };
    }
    if (state === "processing") {
      return {
        scale: [0.97, 1.03, 0.97],
        opacity: [0.65, 0.95, 0.65],
        transition: { duration: 0.9, repeat: Infinity, ease: "linear" }
      };
    }
    return {
      scale: [1, 1.015, 1],
      opacity: [0.5, 0.75, 0.5],
      transition: { duration: 5, repeat: Infinity, ease: "easeInOut" }
    };
  };

  // Purple / Teal theme matching Siya AI palette
  const getTheme = () => {
    switch (state) {
      case "listening":
        return {
          color: "rgba(168, 85, 247, 1)",
          ambient: "from-violet-600/30 via-teal-500/25 to-transparent",
          glow: "shadow-[0_0_80px_rgba(168,85,247,0.5)]",
          border: "border-violet-400/60",
          coreBorder: "border-violet-400/40",
          tag: "LISTENING TO YOU",
          tagColor: "text-violet-300 bg-violet-500/20 border-violet-400/40",
        };
      case "processing":
        return {
          color: "rgba(45, 212, 191, 1)",
          ambient: "from-teal-600/30 via-cyan-500/25 to-transparent",
          glow: "shadow-[0_0_80px_rgba(45,212,191,0.5)]",
          border: "border-teal-400/60",
          coreBorder: "border-teal-400/40",
          tag: "SIYA IS THINKING",
          tagColor: "text-teal-300 bg-teal-500/20 border-teal-400/40",
        };
      case "speaking":
        return {
          color: "rgba(236, 72, 153, 1)",
          ambient: "from-pink-600/30 via-violet-500/25 to-transparent",
          glow: "shadow-[0_0_90px_rgba(236,72,153,0.55)]",
          border: "border-pink-400/60",
          coreBorder: "border-pink-400/40",
          tag: "SIYA SPEAKING",
          tagColor: "text-pink-300 bg-pink-500/20 border-pink-400/40",
        };
      default:
        return {
          color: "rgba(45, 212, 191, 0.9)",
          ambient: "from-violet-900/25 via-teal-900/25 to-transparent",
          glow: "shadow-[0_0_60px_rgba(139,92,246,0.35)]",
          border: "border-teal-400/30",
          coreBorder: "border-violet-500/30",
          tag: "VOICE SYSTEM READY",
          tagColor: "text-teal-300/80 bg-teal-500/10 border-teal-400/20",
        };
    }
  };

  const theme = getTheme();

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none select-none">
      {/* Dynamic Ambient Background Glow in Purple & Teal */}
      <motion.div
        animate={getPulseAnimation()}
        className={`absolute w-[75vw] h-[75vw] max-w-[650px] max-h-[650px] rounded-full blur-[110px] bg-gradient-to-tr ${theme.ambient} pointer-events-none transition-all duration-700`}
      />

      {/* Orbit 1: Subtle Outer Geometric Ring */}
      <motion.div
        animate={getRingAnimation(3, false)}
        className={`absolute w-[88vw] h-[88vw] max-w-[560px] max-h-[560px] rounded-full border border-violet-500/15 border-t-teal-400/30 opacity-40`}
      />

      {/* Orbit 2: Segmented Hologram Ring */}
      <motion.div
        animate={getRingAnimation(2, true)}
        className={`absolute w-[74vw] h-[74vw] max-w-[470px] max-h-[470px] rounded-full border border-teal-400/20 border-b-violet-400/40 border-l-transparent opacity-60`}
      />

      {/* Orbit 3: Inner Orbital Ring with Glowing Accent Node */}
      <motion.div
        animate={getRingAnimation(1, false)}
        className={`absolute w-[60vw] h-[60vw] max-w-[380px] max-h-[380px] rounded-full border border-white/15 opacity-70`}
      >
        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-gradient-to-r from-teal-300 to-violet-400 shadow-[0_0_12px_rgba(45,212,191,1)]" />
      </motion.div>

      {/* ========================================================================= */}
      {/* PROMINENT USER NAME & VOICE AI CORE                                       */}
      {/* In place of the removed video avatar element, displays the user's name     */}
      {/* prominently with large, modern bold typography & purple/teal ambient glow. */}
      {/* ========================================================================= */}
      <motion.div
        animate={getPulseAnimation()}
        className={`relative z-20 flex flex-col items-center justify-center rounded-full p-6 sm:p-8 text-center backdrop-blur-2xl bg-gradient-to-br from-violet-950/40 via-black/75 to-teal-950/40 border ${theme.coreBorder} ${theme.glow} transition-all duration-500`}
        style={{
          width: "min(68vw, 360px, 44vh)",
          height: "min(68vw, 360px, 44vh)",
          minWidth: "220px",
          minHeight: "220px",
        }}
      >
        {/* Subtle Radial Mesh inside Core */}
        <div className="absolute inset-0 rounded-full bg-radial from-violet-500/15 via-teal-500/10 to-transparent pointer-events-none" />

        {/* Assistant Initial Avatar Pill */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-violet-600 via-purple-500 to-teal-400 p-[2px] shadow-[0_0_25px_rgba(139,92,246,0.6)] mb-2 shrink-0 grid place-items-center"
        >
          <div className="w-full h-full rounded-[14px] bg-[#0c0a17] flex items-center justify-center text-white font-black text-lg sm:text-xl tracking-wider">
            S
          </div>
        </motion.div>

        {/* PROMINENT SIYA ASSISTANT NAME DISPLAY (Large, Bold Modern Typography + Purple/Teal Theme) */}
        <div className="relative px-2 max-w-full">
          <h2
            id="prominent-assistant-name"
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-violet-200 via-teal-100 to-cyan-300 drop-shadow-[0_4px_24px_rgba(139,92,246,0.6)] truncate max-w-[280px]"
            title="Siya"
          >
            Siya
          </h2>
        </div>

        {/* Status Tag Pill */}
        <div className="mt-2.5">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold tracking-wider uppercase border shadow-sm ${theme.tagColor} transition-all duration-300`}>
            <span className={`w-1.5 h-1.5 rounded-full ${state === "speaking" ? "bg-pink-400 animate-ping" : state === "listening" ? "bg-violet-400 animate-ping" : state === "processing" ? "bg-teal-400 animate-spin" : "bg-teal-400 animate-pulse"}`} />
            <span>{theme.tag}</span>
          </span>
        </div>

        {/* Dynamic Voice Frequency Audio Waves Bar (Purple & Teal) */}
        <div className="flex items-center gap-1 mt-3 sm:mt-4 h-4 px-3 py-1 rounded-full bg-black/40 border border-white/10">
          {[40, 75, 100, 60, 90, 50, 80].map((height, i) => (
            <motion.div
              key={i}
              animate={{
                height:
                  state === "speaking"
                    ? [`${height * 0.3}%`, `${height}%`, `${height * 0.2}%`]
                    : state === "listening"
                    ? [`${height * 0.4}%`, `${height * 0.8}%`, `${height * 0.3}%`]
                    : state === "processing"
                    ? ["20%", "70%", "20%"]
                    : "25%",
              }}
              transition={{
                duration: state === "speaking" ? 0.35 + (i % 3) * 0.1 : 0.8,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.08,
              }}
              className="w-1 sm:w-1.5 rounded-full bg-gradient-to-t from-violet-500 to-teal-300"
              style={{ minHeight: "4px" }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
