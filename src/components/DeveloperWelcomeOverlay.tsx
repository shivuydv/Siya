import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Code2,
  Heart,
  CheckCircle2,
  ShieldCheck,
  Briefcase,
  Layers,
  Mail,
  ExternalLink,
  ChevronRight,
  X,
  Cpu,
  Smartphone,
  Award
} from "lucide-react";
import { AuthUser } from "./AuthGate";

interface DeveloperWelcomeOverlayProps {
  user: AuthUser;
  onDismiss: () => void;
}

export default function DeveloperWelcomeOverlay({
  user,
  onDismiss,
}: DeveloperWelcomeOverlayProps) {
  const [viewMode, setViewMode] = useState<"welcome" | "portfolio">("welcome");
  const [photoUrl, setPhotoUrl] = useState<string>(() => {
    return localStorage.getItem("siya_developer_custom_photo") || "/assets/shivam.jpg";
  });

  // Dynamically fetch globally saved photo from database (ensures universal display across all devices/sessions)
  useEffect(() => {
    let isMounted = true;
    fetch("/api/developer/photo")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.photoUrl) {
          setPhotoUrl(data.photoUrl);
          localStorage.setItem("siya_developer_custom_photo", data.photoUrl);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Sync photo across tabs / components
  useEffect(() => {
    const handlePhotoUpdated = (e: CustomEvent<string>) => {
      if (e.detail) setPhotoUrl(e.detail);
    };
    window.addEventListener("developer-photo-updated" as any, handlePhotoUpdated);
    return () => window.removeEventListener("developer-photo-updated" as any, handlePhotoUpdated);
  }, []);

  // Listen for keyboard press (Escape, Space) to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss]);

  return (
    <motion.div
      id="developer-welcome-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.35, ease: "easeInOut" }}
      onClick={(e) => {
        // If clicking the dark backdrop, dismiss
        if (e.target === e.currentTarget) {
          onDismiss();
        }
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-2xl cursor-pointer select-none overflow-y-auto"
    >
      {/* Ambient background glows */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-gradient-to-tr from-violet-600/25 via-pink-500/20 to-cyan-500/20 rounded-full blur-[130px] pointer-events-none animate-pulse" />
      <div className="fixed bottom-10 right-10 w-80 h-80 bg-violet-800/20 rounded-full blur-[100px] pointer-events-none" />

      {/* Container - Stop propagation if interacting with interactive controls */}
      <div className="relative my-auto w-full max-w-lg cursor-default max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Floating Close Button */}
        <button
          onClick={onDismiss}
          className="absolute -top-2 -right-2 sm:-top-3 sm:-right-3 z-20 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white backdrop-blur-md border border-white/20 transition-all cursor-pointer shadow-lg"
          title="Close / Dismiss (or click anywhere)"
        >
          <X size={16} />
        </button>

        <AnimatePresence mode="wait">
          {viewMode === "welcome" ? (
            /* ========================================================
               MODE 1: WELCOME & DEVELOPER CREDITS CARD
               ======================================================== */
            <motion.div
              key="welcome-card"
              initial={{ opacity: 0, y: 25, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full rounded-[28px] sm:rounded-[32px] border border-white/15 bg-gradient-to-b from-white/[0.10] to-white/[0.03] backdrop-blur-2xl p-5 sm:p-8 shadow-[0_25px_80px_rgba(0,0,0,0.85)] text-center text-white"
            >
              {/* Top Tag */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-violet-500/20 border border-violet-400/30 text-xs font-semibold text-violet-300 mb-6">
                <Sparkles size={13} className="text-violet-300" />
                <span>OFFICIAL DEVELOPER CREDITS</span>
              </div>

              {/* Profile Image with Glowing Aura */}
              <div className="relative mx-auto w-32 h-32 sm:w-36 sm:h-36 mb-5 group">
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-violet-500 via-pink-500 to-cyan-400 blur-md opacity-75 animate-pulse" />
                <div className="relative w-full h-full rounded-full p-[3px] bg-gradient-to-tr from-violet-500 via-pink-500 to-cyan-400 shadow-2xl">
                  <img
                    src={photoUrl}
                    alt="Shivam Yadav"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover rounded-full bg-zinc-900 border border-black/40"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/assets/shivam.jpg";
                    }}
                  />
                </div>
                {/* Verified Developer Badge */}
                <div
                  className="absolute bottom-1 right-1 p-1.5 rounded-full bg-emerald-500 text-white shadow-xl border-2 border-[#09090b]"
                  title="Verified Creator & Developer"
                >
                  <ShieldCheck size={16} />
                </div>
              </div>

              {/* Developer Info */}
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-white/95 to-white/80">
                Shivam Yadav
              </h2>
              <p className="text-xs uppercase tracking-[0.25em] text-violet-300 font-semibold mt-1 mb-5 flex items-center justify-center gap-1.5">
                <Code2 size={13} />
                <span>Creator & Developer</span>
              </p>

              {/* Welcome Greeting to Current User */}
              <div className="rounded-2xl bg-white/[0.05] border border-white/10 p-4 mb-5 text-left">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300 mb-1">
                  <CheckCircle2 size={16} />
                  <span>Welcome, {user.name}!</span>
                </div>
                <p className="text-xs text-white/70 leading-relaxed">
                  Aapka account successfully login ho gaya hai. Siya AI voice assistant aapki commands lene aur personalized baatcheet karne ke liye active hai.
                </p>
              </div>

              {/* Buttons: View Portfolio vs Continue */}
              <div className="grid grid-cols-2 gap-2.5 mb-5">
                <button
                  id="open-full-portfolio-btn"
                  onClick={() => setViewMode("portfolio")}
                  className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-2xl bg-white/10 hover:bg-violet-600/30 border border-white/15 hover:border-violet-400/40 text-xs font-semibold text-white transition-all cursor-pointer shadow-md"
                >
                  <Briefcase size={14} className="text-violet-300" />
                  <span>View Full Portfolio</span>
                  <ChevronRight size={14} className="text-white/60" />
                </button>

                <button
                  id="dismiss-overlay-action-btn"
                  onClick={onDismiss}
                  className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-2xl bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-xs font-semibold text-white transition-all cursor-pointer shadow-lg shadow-violet-900/30"
                >
                  <span>Start with Siya</span>
                  <Sparkles size={14} />
                </button>
              </div>

              {/* Love & Craft Note */}
              <div className="flex items-center justify-center gap-1 text-[11px] text-white/40 mb-3">
                <span>Crafted with</span>
                <Heart size={12} className="text-pink-500 fill-pink-500" />
                <span>by Shivam Yadav</span>
              </div>

              {/* Click Anywhere Banner */}
              <div
                onClick={onDismiss}
                className="pt-3 border-t border-white/10 flex flex-col items-center justify-center gap-0.5 text-xs text-violet-200/90 cursor-pointer hover:text-violet-100 transition-colors"
              >
                <span className="font-medium tracking-wide animate-pulse">
                  👆 Kahi par bhi click karein aur aage badhein
                </span>
                <span className="text-[10px] text-white/40">
                  (Tap anywhere outside to close)
                </span>
              </div>
            </motion.div>
          ) : (
            /* ========================================================
               MODE 2: COMPLETE INTERACTIVE DEVELOPER PORTFOLIO VIEW
               ======================================================== */
            <motion.div
              key="portfolio-card"
              initial={{ opacity: 0, y: 25, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full rounded-[32px] border border-white/15 bg-gradient-to-b from-zinc-900/95 to-black/95 backdrop-blur-2xl p-6 sm:p-8 shadow-[0_25px_80px_rgba(0,0,0,0.95)] text-white max-h-[85vh] overflow-y-auto"
            >
              {/* Back to Quick View */}
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-white/10">
                <button
                  onClick={() => setViewMode("welcome")}
                  className="flex items-center gap-1.5 text-xs font-medium text-violet-300 hover:text-white transition-colors cursor-pointer"
                >
                  <span>← Back to Quick Card</span>
                </button>
                <span className="text-[11px] uppercase tracking-widest text-emerald-400 font-semibold flex items-center gap-1">
                  <Award size={13} />
                  <span>Developer Portfolio</span>
                </span>
              </div>

              {/* Top Hero: Full Image & Bio */}
              <div className="flex flex-col sm:flex-row items-center gap-5 mb-6">
                <div className="relative w-28 h-36 sm:w-32 sm:h-40 shrink-0 rounded-2xl overflow-hidden border-2 border-violet-500/40 shadow-xl bg-zinc-950">
                  <img
                    src={photoUrl}
                    alt="Shivam Yadav Portfolio"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/assets/shivam.jpg";
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                  <span className="absolute bottom-1.5 left-2 text-[10px] font-bold text-white/90">
                    Shivam
                  </span>
                </div>

                <div className="text-center sm:text-left flex-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-[10px] font-semibold mb-1.5 border border-violet-400/30">
                    <ShieldCheck size={12} />
                    <span>FULL STACK & AI ENGINEER</span>
                  </div>
                  <h3 className="text-2xl font-bold tracking-tight">Shivam Yadav</h3>
                  <p className="text-xs text-white/60 mt-1 leading-relaxed">
                    Passionate software engineer specialized in generative AI, real-time voice architectures, responsive frontend systems, and high-performance cloud applications.
                  </p>
                  
                  <div className="flex items-center justify-center sm:justify-start gap-2 mt-3 text-xs text-white/50">
                    <span className="flex items-center gap-1">
                      <Mail size={12} className="text-violet-400" />
                      <span>shivu12745114@gmail.com</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Skills Grid */}
              <div className="mb-6">
                <h4 className="text-xs uppercase tracking-wider text-white/40 font-semibold mb-2.5 flex items-center gap-1.5">
                  <Layers size={13} className="text-violet-400" />
                  <span>Technical Expertise</span>
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "React 18",
                    "TypeScript",
                    "Gemini Live API",
                    "WebSocket Voice Audio",
                    "Node.js & Express",
                    "Tailwind CSS",
                    "SQLite Database",
                    "State Machines",
                    "Speech Synthesis"
                  ].map((skill) => (
                    <span
                      key={skill}
                      className="px-2.5 py-1 rounded-xl bg-white/[0.06] border border-white/10 text-[11px] text-white/80 font-medium hover:bg-white/[0.12] transition-colors"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Key Project: Siya */}
              <div className="mb-6 rounded-2xl bg-gradient-to-br from-violet-950/40 to-pink-950/30 border border-violet-500/20 p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <Cpu size={16} className="text-violet-400" />
                    <h5 className="text-sm font-bold text-white">Siya AI Voice Assistant</h5>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                    Flagship Project
                  </span>
                </div>
                <p className="text-xs text-white/70 leading-relaxed mb-3">
                  A witty, sassy, intelligent Indian female voice assistant with full duplex realtime voice communication, memory persistence, dynamic expressions, and personalized user greetings.
                </p>
                <div className="flex items-center gap-3 text-[11px] text-violet-300/80 font-medium">
                  <span>⚡ Gemini Live API Audio</span>
                  <span>•</span>
                  <span>🔒 Secure SQLite Storage</span>
                  <span>•</span>
                  <span>🎙️ Hindi & Hinglish</span>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-3">
                <button
                  onClick={() => setViewMode("welcome")}
                  className="px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-medium text-white/80 transition-colors cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={onDismiss}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-xs font-semibold text-white transition-all cursor-pointer shadow-lg text-center"
                >
                  Enter Siya Assistant
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

