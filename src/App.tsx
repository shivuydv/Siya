import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  MicOff,
  Loader2,
  Volume2,
  VolumeX,
  Keyboard,
  Send,
  Trash2,
  X,
  Settings2,
  ShieldCheck,
  Sparkles,
  Bell,
  Megaphone,
  KeyRound,
  Star,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Crown,
  Lock,
  Unlock,
  Check,
  Heart,
} from "lucide-react";
import { getSiaResponse, getSiaAudio, resetSiaSession as resetSiyaSession } from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { LiveSessionManager } from "./services/liveService";
import Visualizer from "./components/Visualizer";
import PermissionModal from "./components/PermissionModal";
import { playPCM } from "./utils/audioUtils";
import { motion, AnimatePresence } from "motion/react";
import {
  PersonalityMode,
  SubscriptionTier,
  getTierAllowedModes,
  SUBSCRIPTION_PLANS,
} from "./services/personalityService";
import AuthGate, { AuthUser } from "./components/AuthGate";
import DeveloperDashboard from "./components/DeveloperDashboard";
import AdminLogsModal from "./components/AdminLogsModal";
import DeveloperWelcomeOverlay from "./components/DeveloperWelcomeOverlay";
import SubscriptionPaywallModal from "./components/SubscriptionPaywallModal";

type AppState = "idle" | "listening" | "processing" | "speaking";

interface ChatMessage {
  id: string;
  sender: "user" | "siya";
  text: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

function SiyaApp({
  user,
  isDeveloper,
  onLogout,
  onDeveloper,
  onShowWelcome,
}: {
  user: AuthUser;
  isDeveloper: boolean;
  onLogout: () => void;
  onDeveloper: () => void;
  onShowWelcome?: () => void;
}) {
  const [appState, setAppState] = useState<AppState>("idle");
  const [expression, setExpression] = useState<string>("smile");
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);
  const [liveToast, setLiveToast] = useState<{
    id: number;
    name: string;
    email: string;
    event: "signup" | "login";
  } | null>(null);
  const lastLogIdRef = useRef<number>(0);
  const hasInitializedLogsRef = useRef<boolean>(false);

  useEffect(() => {
    const pollLogs = async () => {
      try {
        const savedToken = localStorage.getItem("siya_token") || "";
        const headers: HeadersInit = savedToken ? { "x-siya-session": savedToken } : {};
        const res = await fetch("/api/developer/logs?limit=3", { credentials: "include", headers });
        if (!res.ok) return;
        const data = await res.json();
        const logs = data.logs || [];
        if (logs.length > 0) {
          const newest = logs[0];
          if (!hasInitializedLogsRef.current) {
            lastLogIdRef.current = newest.id;
            hasInitializedLogsRef.current = true;
          } else if (newest.id > lastLogIdRef.current) {
            lastLogIdRef.current = newest.id;
            setLiveToast(newest);
            setTimeout(() => {
              setLiveToast((prev) => (prev?.id === newest.id ? null : prev));
            }, 7000);
          }
        }
      } catch {
        // ignore
      }
    };
    pollLogs();
    const timer = setInterval(pollLogs, 3500);
    return () => clearInterval(timer);
  }, [isDeveloper]);

  const userStorageKey = `siya_chat_history_${user.id || user.email}`;
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const key = `siya_chat_history_${user.id || user.email}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const filtered = parsed.filter(m => !m.text.includes('[Error:') && !m.text.includes('[System:'));
          if (filtered.length > 0) return filtered;
        }
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
    return [
      {
        id: "welcome-init",
        sender: "siya",
        text: `Haan ${user.name}, bolo kya kaam hai? Main sun rahi hoon!`,
      },
    ];
  });
  const messagesRef = useRef(messages);
  const [personalityMode, setPersonalityMode] = useState<PersonalityMode>(() => {
    return (localStorage.getItem("siya_personality_mode") as PersonalityMode) || "Sassy";
  });
  const personalityModeRef = useRef<PersonalityMode>(personalityMode);
  personalityModeRef.current = personalityMode;

  const [userTier, setUserTier] = useState<SubscriptionTier>(() => {
    return (user.tier as SubscriptionTier) || (user.is_pro ? "pro" : "free");
  });
  const userTierRef = useRef<SubscriptionTier>(userTier);

  const [allowedModes, setAllowedModes] = useState<PersonalityMode[]>(() => {
    return getTierAllowedModes(userTier, isDeveloper);
  });

  const [showPaywallModal, setShowPaywallModal] = useState<boolean>(() => {
    if (user.tier === "free" && !sessionStorage.getItem("siya_paywall_dismissed")) {
      return true;
    }
    return false;
  });

  const [paywallInitialPlan, setPaywallInitialPlan] = useState<SubscriptionTier | undefined>(undefined);
  const [unlockToast, setUnlockToast] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Live polling for subscription status / upgrades approved by developer
  useEffect(() => {
    const checkSubStatus = async () => {
      try {
        const savedToken = localStorage.getItem("siya_token") || "";
        const headers: HeadersInit = savedToken ? { "x-siya-session": savedToken } : {};
        const res = await fetch("/api/subscription/status", { credentials: "include", headers });
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.tier) {
          const prevTier = userTierRef.current;
          if (prevTier !== data.tier) {
            userTierRef.current = data.tier;
            setUserTier(data.tier);
            const modes = (data.allowedModes as PersonalityMode[]) || getTierAllowedModes(data.tier, isDeveloper);
            setAllowedModes(modes);

            if (data.tier !== "free" && prevTier === "free") {
              const targetPlan = SUBSCRIPTION_PLANS[data.tier as SubscriptionTier];
              setUnlockToast(`🎉 Upgrade Approved by Shivam! ${targetPlan?.name || data.tier.toUpperCase()} is active. ${data.activeMode || targetPlan?.modeLabel} mode is now unlocked!`);
              if (data.activeMode) {
                setPersonalityMode(data.activeMode);
                localStorage.setItem("siya_personality_mode", data.activeMode);
              }
              resetSiyaSession();
            }
          }
          if (data.allowedModes) {
            setAllowedModes(data.allowedModes);
          }
        }
      } catch {
        // ignore
      }
    };

    checkSubStatus();
    const interval = setInterval(checkSubStatus, 3000);
    return () => clearInterval(interval);
  }, [isDeveloper]);

  const handleSelectMode = async (mode: PersonalityMode) => {
    if (!allowedModes.includes(mode) && !isDeveloper) {
      const requiredPlanKey = (Object.keys(SUBSCRIPTION_PLANS) as SubscriptionTier[]).find(
        (key) => SUBSCRIPTION_PLANS[key].mode === mode
      );
      setPaywallInitialPlan(requiredPlanKey || "pro");
      setShowPaywallModal(true);
      setShowSettings(false);
      return;
    }

    setPersonalityMode(mode);
    localStorage.setItem("siya_personality_mode", mode);
    setShowSettings(false);

    try {
      const savedToken = localStorage.getItem("siya_token") || "";
      const headers: HeadersInit = savedToken ? { "x-siya-session": savedToken, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
      await fetch("/api/subscription/set-mode", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ mode }),
      });
    } catch {
      // ignore
    }

    resetSiyaSession();
  };

  // Sync ref
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Load user conversation history from backend if available
  useEffect(() => {
    const savedToken = localStorage.getItem("siya_token") || "";
    const headers: HeadersInit = savedToken ? { "x-siya-session": savedToken } : {};
    fetch("/api/chat/messages", { credentials: "include", headers })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data.messages && data.messages.length > 0) {
            setMessages(data.messages);
            localStorage.setItem(userStorageKey, JSON.stringify(data.messages));
          }
        }
      })
      .catch(() => {});
  }, [user.id, user.email, userStorageKey]);

  // Helper to persist message to both user-specific state/localStorage and backend
  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      localStorage.setItem(userStorageKey, JSON.stringify(next));
      return next;
    });

    if (!msg.text.startsWith("[Error:") && !msg.text.startsWith("[System:")) {
      const savedToken = localStorage.getItem("siya_token") || "";
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(savedToken ? { "x-siya-session": savedToken } : {}),
      };
      fetch("/api/chat/messages", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ sender: msg.sender, text: msg.text }),
      }).catch(() => {});
    }
  }, [userStorageKey]);

  useEffect(() => {
    localStorage.setItem("siya_personality_mode", personalityMode);
    resetSiyaSession();
  }, [personalityMode]);

  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.isMuted = isMuted;
    }
  }, [isMuted]);

  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);

  // User messages from developer
  const [devMessages, setDevMessages] = useState<any[]>([]);
  const [showDevMessagesModal, setShowDevMessagesModal] = useState(false);

  // Active promotions / ads
  const [promotions, setPromotions] = useState<any[]>([]);
  const [dismissedPromoIds, setDismissedPromoIds] = useState<number[]>([]);

  // User change password
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [changePasswordMsg, setChangePasswordMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [changePasswordBusy, setChangePasswordBusy] = useState(false);

  const fetchDevMessages = useCallback(async () => {
    try {
      const savedToken = localStorage.getItem("siya_token") || "";
      const headers: HeadersInit = savedToken ? { "x-siya-session": savedToken } : {};
      const res = await fetch("/api/user/messages", { credentials: "include", headers });
      if (res.ok) {
        const data = await res.json();
        setDevMessages(data.messages || []);
      }
    } catch {}
  }, []);

  const fetchPromotions = useCallback(async () => {
    try {
      const res = await fetch("/api/promotions");
      if (res.ok) {
        const data = await res.json();
        setPromotions(data.promotions || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchDevMessages();
    fetchPromotions();
    const interval = setInterval(() => {
      fetchDevMessages();
      fetchPromotions();
    }, 12000);
    return () => clearInterval(interval);
  }, [fetchDevMessages, fetchPromotions]);

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPasswordInput || newPasswordInput.length < 8) {
      setChangePasswordMsg({ text: "New password must be at least 8 characters", type: "error" });
      return;
    }
    setChangePasswordBusy(true);
    setChangePasswordMsg(null);
    try {
      const savedToken = localStorage.getItem("siya_token") || "";
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(savedToken ? { "x-siya-session": savedToken } : {}),
      };
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ oldPassword: currentPassword, newPassword: newPasswordInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update password");
      setChangePasswordMsg({ text: "Password changed successfully!", type: "success" });
      setCurrentPassword("");
      setNewPasswordInput("");
      setTimeout(() => {
        setShowChangePasswordModal(false);
        setChangePasswordMsg(null);
      }, 1500);
    } catch (err: any) {
      setChangePasswordMsg({ text: err.message, type: "error" });
    } finally {
      setChangePasswordBusy(false);
    }
  };

  const liveSessionRef = useRef<LiveSessionManager | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, appState]);

  const extractExpression = (text: string) => {
    const matches = text.match(/\[(.*?)\]/g);
    if (matches && matches.length > 0) {
      const lastTag = matches[matches.length - 1];
      return lastTag.replace('[', '').replace(']', '').trim();
    }
    return null;
  };

  const handleTextCommand = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) {
      setAppState("idle");
      return;
    }

    appendMessage({ id: Date.now().toString(), sender: "user", text: finalTranscript });
    
    // If live session is active, send text through it
    if (isSessionActive && liveSessionRef.current) {
      liveSessionRef.current.sendText(finalTranscript);
      return;
    }

    setAppState("processing");

    // Check if user is asking to view user activity or logins
    const lower = finalTranscript.toLowerCase();
    if (
      lower.includes("login") ||
      lower.includes("signup") ||
      lower.includes("kaun kaun") ||
      lower.includes("activity") ||
      lower.includes("admin") ||
      (lower.includes("user") && (lower.includes("dikhao") || lower.includes("list") || lower.includes("show") || lower.includes("batao")))
    ) {
      setShowAdminModal(true);
      const resp = `Maine aapke samne Siya ke andar hi Live Activity aur User Logs panel open kar diya hai ${user.name}! Yahan aap sabhi users ke logins aur signups dekh sakte hain.`;
      appendMessage({ id: Date.now().toString() + "-s", sender: "siya", text: resp });
      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getSiaAudio(resp);
        if (audioBase64) await playPCM(audioBase64);
      }
      setAppState("idle");
      return;
    }

    // 1. Check for browser commands
    const commandResult = processCommand(finalTranscript);

    let responseText = "";

    if (commandResult.isBrowserAction) {
      responseText = commandResult.action;
      appendMessage({ id: Date.now().toString() + "-s", sender: "siya", text: responseText });
      
      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getSiaAudio(responseText);
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }

      setAppState("idle");

      setTimeout(() => {
        if (commandResult.url) {
          window.open(commandResult.url, "_blank");
        }
      }, 1500);
    } else {
      // 2. General Chit-Chat via Gemini with User Identity & Name recognition
      try {
        responseText = await getSiaResponse(finalTranscript, messagesRef.current, personalityMode, user.name, user.email);
      } catch (err: any) {
        console.error("Gemini response error", err);
        responseText = `Haan ${user.name}, main sun rahi hoon! Kuch connectivity issue tha, ek baar phir se bolo na?`;
      }
      
      const newExpr = extractExpression(responseText);
      if (newExpr) setExpression(newExpr);

      appendMessage({ id: Date.now().toString() + "-s", sender: "siya", text: responseText });
      
      if (!isMuted) {
        setAppState("speaking");
        try {
          const audioBase64 = await getSiaAudio(responseText);
          if (audioBase64) {
            await playPCM(audioBase64);
          }
        } catch (e) {
          console.error("Audio playback error", e);
        }
      }
      setAppState("idle");
    }
  }, [isMuted, isSessionActive, personalityMode, user.name, user.email, appendMessage]);

  const speechRecognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
      }
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch (e) {}
      }
    };
  }, []);

  const startSpeechFallback = useCallback(() => {
    const SpeechRecClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecClass) {
      appendMessage({
        id: Date.now().toString() + "-fallback",
        sender: "siya",
        text: `Haan ${user.name}, voice listener activate nahi ho paya. Aap neeche keyboard icon daba kar mujhse chat kar sakte hain!`
      });
      setIsSessionActive(false);
      setAppState("idle");
      return;
    }

    try {
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch (e) {}
      }

      const recognition = new SpeechRecClass();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "hi-IN";

      recognition.onstart = () => {
        setAppState("listening");
        setIsSessionActive(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript || "";
        if (transcript.trim()) {
          handleTextCommand(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error:", event.error);
        setIsSessionActive(false);
        setAppState("idle");
      };

      recognition.onend = () => {
        setIsSessionActive(false);
        setAppState((prev) => (prev === "listening" ? "idle" : prev));
      };

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn("Speech recognition failed to start:", err);
      setIsSessionActive(false);
      setAppState("idle");
    }
  }, [user.name, handleTextCommand, appendMessage]);

  const toggleListening = async () => {
    if (isSessionActive) {
      setIsSessionActive(false);
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch (e) {}
        speechRecognitionRef.current = null;
      }
      setAppState("idle");
      resetSiyaSession();
    } else {
      try {
        setIsSessionActive(true);
        resetSiyaSession();
        
        const session = new LiveSessionManager(personalityMode, user.name, user.email);
        session.isMuted = isMuted;
        liveSessionRef.current = session;
        
        session.onStateChange = (state) => {
          setAppState(state);
          if (state === "idle") {
            setIsSessionActive(false);
          }
        };

        session.onError = (message) => {
          const lowerMsg = (message || "").toLowerCase();
          if (!lowerMsg.includes("websocket") && !lowerMsg.includes("closed without opened") && !lowerMsg.includes("connection lost")) {
            appendMessage({ id: Date.now().toString() + "-error", sender: "siya", text: `[Error: ${message}]` });
          }
        };

        session.onMessage = (sender, text) => {
          appendMessage({ id: Date.now().toString() + "-" + sender, sender, text });
          if (sender === "siya") {
            const expr = extractExpression(text);
            if (expr) setExpression(expr);
          }
        };
        
        session.onCommand = (url) => {
          setTimeout(() => {
            window.open(url, "_blank");
          }, 1000);
        };

        await session.start();
      } catch (e: any) {
        if (e?.message === "Permission denied" || e?.name === "NotAllowedError") {
          console.warn("Microphone permission denied by user.");
          setShowPermissionModal(true);
          setIsSessionActive(false);
          setAppState("idle");
        } else {
          console.warn("Live API direct connection unavailable, switching to browser speech recognition fallback:", e);
          if (liveSessionRef.current) {
            liveSessionRef.current.stop();
            liveSessionRef.current = null;
          }
          startSpeechFallback();
        }
      }
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    
    handleTextCommand(textInput);
    setTextInput("");
    setShowTextInput(false);
  };

  return (
    <div className="h-[100dvh] w-screen bg-[#050505] text-white flex flex-col items-center justify-between font-sans relative overflow-hidden m-0 p-0">
      {showPermissionModal && (
        <PermissionModal 
          onClose={() => setShowPermissionModal(false)} 
        />
      )}

      {/* Cinematic Background Gradients */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-violet-900/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-pink-900/20 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 w-full flex justify-between items-start z-20 shrink-0 px-3 py-3 sm:px-6 sm:py-4 md:px-12 md:py-6 gap-2">
        {/* Real-time auth event toast for developers */}
        <AnimatePresence>
          {isDeveloper && liveToast && (
            <motion.div
              id="dev-live-toast-alert"
              initial={{ opacity: 0, y: -25, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.96 }}
              onClick={() => setShowAdminModal(true)}
              className="fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 sm:gap-3 px-3.5 py-2 sm:px-5 sm:py-3 rounded-2xl bg-[#0e0e14]/95 border border-emerald-500/40 text-white shadow-2xl backdrop-blur-2xl cursor-pointer hover:border-emerald-400 transition-all max-w-[92vw]"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <div className="text-left text-xs min-w-0">
                <div className="font-semibold text-emerald-300 truncate">
                  {liveToast.event === "signup" ? "New User Registered!" : "User Just Signed In!"}
                </div>
                <div className="text-white/70 truncate max-w-[180px] sm:max-w-xs text-[11px]">
                  <span className="font-medium text-white">{liveToast.name}</span> ({liveToast.email})
                </div>
              </div>
              <span className="text-[10px] sm:text-[11px] bg-white/10 hover:bg-white/20 px-2 py-1 rounded-xl text-white/80 font-medium ml-1 shrink-0">
                View →
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2 sm:gap-3 mt-1 shrink-0">
          <div className="flex flex-col">
            <h1 className="text-xl sm:text-2xl font-serif font-bold tracking-widest opacity-90 leading-tight uppercase bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-pink-400">SIYA</h1>
            <button
              onClick={onShowWelcome}
              className="text-[9px] sm:text-[10px] text-white/50 hover:text-violet-300 tracking-wider uppercase font-medium text-left transition-colors flex items-center gap-1 sm:gap-1.5 cursor-pointer group max-w-[140px] sm:max-w-none truncate"
              title="Click to view Developer Welcome Card (Shivam Yadav)"
            >
              <span className="group-hover:underline decoration-violet-400/50 truncate">Shivam Yadav</span>
              <span className="text-white/20">·</span>
              <span className="text-violet-300/80 font-semibold truncate">{user.name}</span>
            </button>
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            {/* Developer Command Center Button for Shivam */}
            {isDeveloper && (
              <button
                id="header-dev-dashboard-btn"
                onClick={onDeveloper}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-violet-600/30 to-pink-600/30 hover:from-violet-600/50 hover:to-pink-600/50 border border-violet-400/40 text-xs font-semibold text-violet-200 hover:text-white transition-all shadow-[0_0_15px_rgba(168,85,247,0.25)] cursor-pointer"
                title="Open Shivam Yadav's Developer Command Center"
              >
                <Sparkles size={13} className="text-pink-300" />
                <span>Dev Command Center</span>
              </button>
            )}

            {/* Notification Bell for Developer Announcements & Messages */}
            <button
              id="header-notifications-bell-btn"
              onClick={() => setShowDevMessagesModal(true)}
              className="relative p-1.5 sm:p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-colors border border-white/10 cursor-pointer"
              title="Messages & Announcements from Developer"
            >
              <Bell size={16} />
              {devMessages.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-pink-500 px-1 text-[10px] font-bold text-white shadow-lg animate-pulse">
                  {devMessages.length}
                </span>
              )}
            </button>

            {/* Always accessible In-App Logs & Users Button */}
            <button
              id="header-activity-logs-btn"
              onClick={() => setShowAdminModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3.5 sm:py-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-[11px] sm:text-xs font-semibold text-emerald-300 hover:text-emerald-100 transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)] cursor-pointer"
              title="View User Logins & Signups inside Siya (ID/Password)"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <ShieldCheck size={14} />
              <span className="hidden sm:inline">Users & Logins</span>
            </button>

            <button
              id="header-settings-btn"
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 sm:p-2 rounded-full transition-colors border border-white/10 cursor-pointer ${showSettings ? 'bg-white/20 text-white' : 'bg-white/5 hover:bg-white/10'}`}
              title="Settings"
            >
              <Settings2 size={16} className="opacity-70" />
            </button>

            {messages.length > 0 && (
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to clear your chat history?")) {
                    setMessages([
                      {
                        id: "welcome-init",
                        sender: "siya",
                        text: `Haan ${user.name}, bolo kya kaam hai? Main sun rahi hoon!`,
                      },
                    ]);
                    localStorage.removeItem(userStorageKey);
                    const savedToken = localStorage.getItem("siya_token") || "";
                    fetch("/api/chat/messages", {
                      method: "DELETE",
                      credentials: "include",
                      headers: savedToken ? { "x-siya-session": savedToken } : {},
                    }).catch(() => {});
                    resetSiyaSession();
                  }
                }}
                className="hidden sm:flex p-2 rounded-full bg-white/5 hover:bg-red-500/20 hover:text-red-400 transition-colors border border-white/10 cursor-pointer"
                title="Clear Chat History"
              >
                <Trash2 size={16} className="opacity-70" />
              </button>
            )}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 sm:p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <VolumeX size={16} className="opacity-70" />
              ) : (
                <Volume2 size={16} className="opacity-70" />
              )}
            </button>

            {/* Subscription Upgrade / Status Pill */}
            <button
              id="upgrade-tier-top-btn"
              onClick={() => {
                setPaywallInitialPlan(undefined);
                setShowPaywallModal(true);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer shadow-lg ${
                userTier === "ultra"
                  ? "bg-gradient-to-r from-rose-600 to-fuchsia-600 text-white shadow-rose-600/20"
                  : userTier === "pro_max"
                  ? "bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-pink-600/20"
                  : userTier === "pro"
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-violet-600/20"
                  : "bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 border border-amber-400/30 hover:border-amber-400/50 shadow-amber-500/10"
              }`}
            >
              <Crown size={13} className={userTier === "free" ? "text-amber-400 animate-pulse" : "text-white"} />
              <span>
                {userTier === "ultra"
                  ? "Ultra (Girlfriend)"
                  : userTier === "pro_max"
                  ? "Pro Max (Waifu)"
                  : userTier === "pro"
                  ? "Pro (Sassy)"
                  : "Upgrade (₹5+)"}
              </span>
            </button>

            <button onClick={onLogout} className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-full bg-white/5 hover:bg-red-500/10 border border-white/10 text-[9px] sm:text-[10px] uppercase tracking-wider text-white/50 hover:text-white transition-colors cursor-pointer">Logout</button>
          </div>

          <AnimatePresence>
            {showSettings && (
              <motion.div 
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className="mt-2 bg-[#121212] border border-white/10 p-3 rounded-2xl shadow-2xl flex flex-col gap-2 w-72 max-w-[calc(100vw-1.5rem)] max-h-[82vh] overflow-y-auto overscroll-contain backdrop-blur-xl z-50 text-left touch-pan-y"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {/* User Tier & Info */}
                <div className="px-1 py-1 flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="truncate pr-2">
                    <p className="text-xs font-semibold text-white truncate">{user.name}</p>
                    <p className="text-[10px] text-white/50 truncate">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPaywallInitialPlan(undefined);
                      setShowSettings(false);
                      setShowPaywallModal(true);
                    }}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 cursor-pointer ${
                      userTier === "ultra"
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                        : userTier === "pro_max"
                        ? "bg-pink-500/20 text-pink-300 border-pink-500/40"
                        : userTier === "pro"
                        ? "bg-amber-400/20 text-amber-300 border-amber-400/40"
                        : "bg-white/10 text-white/60 border-white/10 hover:border-amber-400/40 hover:text-amber-300"
                    }`}
                  >
                    <Crown size={10} />
                    <span>{userTier.toUpperCase()}</span>
                  </button>
                </div>

                <div className="px-1 text-[11px] text-white/40 uppercase tracking-wider font-semibold flex items-center justify-between">
                  <span>Persona Mode</span>
                  {userTier !== "ultra" && (
                    <button
                      type="button"
                      onClick={() => {
                        setPaywallInitialPlan(undefined);
                        setShowSettings(false);
                        setShowPaywallModal(true);
                      }}
                      className="text-[10px] text-amber-400 hover:underline capitalize"
                    >
                      Unlock All
                    </button>
                  )}
                </div>

                {/* 4 Multi-Tier Personas */}
                <div className="space-y-1">
                  {[
                    {
                      mode: "Free" as PersonalityMode,
                      label: "Free (Default)",
                      tagline: "Standard polite & helpful AI assistant",
                      planKey: "free" as SubscriptionTier,
                      price: "₹0",
                    },
                    {
                      mode: "Sassy" as PersonalityMode,
                      label: "Pro Plan (₹5)",
                      tagline: "Sassy / Roaster · Bold, witty & fast banter",
                      planKey: "pro" as SubscriptionTier,
                      price: "₹5",
                    },
                    {
                      mode: "Waifu" as PersonalityMode,
                      label: "Pro Max Plan (₹10)",
                      tagline: "Waifu Mode · Caring, devoted wife companion",
                      planKey: "pro_max" as SubscriptionTier,
                      price: "₹10",
                    },
                    {
                      mode: "Girlfriend" as PersonalityMode,
                      label: "Ultra Plan (₹15)",
                      tagline: "Girlfriend Mode · Romantic, loving & intimate",
                      planKey: "ultra" as SubscriptionTier,
                      price: "₹15",
                    },
                  ].map((item) => {
                    const isUnlocked = allowedModes.includes(item.mode) || isDeveloper;
                    const isActive = personalityMode === item.mode;

                    return (
                      <button
                        key={item.mode}
                        type="button"
                        onClick={() => handleSelectMode(item.mode)}
                        className={`w-full text-left p-2 rounded-xl text-xs transition-all flex items-center justify-between gap-2 cursor-pointer ${
                          isActive
                            ? "bg-violet-600/30 text-violet-200 border border-violet-500/40 shadow-sm"
                            : isUnlocked
                            ? "text-white/80 hover:bg-white/10 hover:text-white border border-transparent"
                            : "text-white/40 hover:bg-white/[.04] border border-white/5 opacity-80"
                        }`}
                      >
                        <div className="min-w-0 pr-1">
                          <div className="flex items-center gap-1.5 font-semibold text-white">
                            <span>{item.label}</span>
                            {isActive && <Check size={12} className="text-violet-400 shrink-0" />}
                          </div>
                          <p className="text-[10px] text-white/50 truncate mt-0.5">{item.tagline}</p>
                        </div>

                        <div className="shrink-0">
                          {isUnlocked ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                              ACTIVE
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                              <Lock size={9} /> {item.price}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="border-t border-white/10 my-0.5 pt-2 flex flex-col gap-1">
                  <button
                    id="settings-change-password-btn"
                    onClick={() => {
                      setShowSettings(false);
                      setShowChangePasswordModal(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs text-white/80 hover:bg-white/10 hover:text-white flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <KeyRound size={14} className="text-blue-400" />
                    <span>Change Password</span>
                  </button>

                  <button
                    id="settings-developer-card-btn"
                    onClick={() => {
                      setShowSettings(false);
                      onShowWelcome?.();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs text-violet-300 hover:bg-violet-500/10 hover:text-violet-200 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Sparkles size={14} className="text-violet-400" />
                    <span>Developer Card (Shivam)</span>
                  </button>

                  {isDeveloper && (
                    <button
                      id="settings-full-dashboard-btn"
                      onClick={() => {
                        setShowSettings(false);
                        onDeveloper();
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs text-pink-300 hover:bg-pink-500/10 hover:text-pink-200 flex items-center gap-2 transition-colors cursor-pointer font-medium"
                    >
                      <Sparkles size={14} className="text-pink-400" />
                      <span>Developer Dashboard</span>
                    </button>
                  )}

                  <button
                    id="settings-activity-logs-btn"
                    onClick={() => {
                      setShowSettings(false);
                      setShowAdminModal(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs text-white/80 hover:bg-white/10 hover:text-white flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <ShieldCheck size={14} className="text-emerald-400" />
                    <span>View Logins & Users</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Active Promotion / Announcement Banner */}
      <AnimatePresence>
        {promotions.filter((p) => !dismissedPromoIds.includes(p.id)).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-30 w-11/12 max-w-2xl"
          >
            {promotions
              .filter((p) => !dismissedPromoIds.includes(p.id))
              .slice(0, 1)
              .map((promo) => (
                <div
                  key={promo.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-violet-900/90 via-purple-900/90 to-pink-900/90 border border-violet-500/40 text-white shadow-2xl backdrop-blur-xl"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/20 text-white shrink-0">
                      <Megaphone size={11} /> {promo.badge || "ANNOUNCEMENT"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate text-white">{promo.title}</p>
                      <p className="text-[11px] text-white/80 truncate">{promo.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {promo.promo_code && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(promo.promo_code);
                          alert(`Code copied: ${promo.promo_code}`);
                        }}
                        className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-black/40 border border-white/20 text-pink-300 hover:bg-black/60 transition-colors"
                        title="Click to copy promo code"
                      >
                        {promo.promo_code}
                      </button>
                    )}
                    {promo.cta_url && (
                      <a
                        href={promo.cta_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-semibold px-3 py-1 rounded-lg bg-white text-black hover:bg-white/90 transition-colors flex items-center gap-1"
                      >
                        <span>{promo.cta_text || "Learn More"}</span>
                        <ExternalLink size={11} />
                      </a>
                    )}
                    <button
                      onClick={() => setDismissedPromoIds((prev) => [...prev, promo.id])}
                      className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                      title="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content - Visualizer & Chat */}
      <main className="absolute inset-0 flex flex-row items-center justify-between w-full h-full z-10 overflow-hidden pt-20 pb-24 px-4 md:px-12 pointer-events-none">
        
        {/* Left Column: Siya Status */}
        <div className="flex w-[30%] lg:w-[25%] h-full flex-col justify-center gap-4 z-10">
          <div className="h-6">
            <AnimatePresence>
              {appState === "processing" && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center gap-2 text-cyan-300/80 text-sm md:text-base italic font-serif"
                >
                  <Loader2 size={16} className="animate-spin" />
                  Replying...
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Center Visualizer (Fixed Full Screen Background) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <Visualizer state={appState} expression={expression} userName={user?.name || "User"} />
        </div>

        {/* Right Column: User Status */}
        <div className="flex w-[30%] lg:w-[25%] h-full flex-col justify-center gap-4 z-10 pointer-events-auto">
          <div className="h-6 flex justify-end">
            <AnimatePresence>
              {appState === "listening" && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-2 text-violet-300/80 text-sm md:text-base italic"
                >
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                  Listening...
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Controls */}
      <footer className="absolute bottom-0 left-0 w-full flex flex-col items-center justify-center pb-6 md:pb-8 z-20 shrink-0 gap-3">
        {/* Dynamic Welcome Heading right above the session start controls */}
        {!isSessionActive && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-1 select-none pointer-events-none px-4"
          >
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-violet-200 via-teal-100 to-cyan-300 drop-shadow-md">
              Hello, {user?.name || "User"}!
            </h1>
            <p className="text-xs sm:text-sm text-teal-300/75 mt-0.5 font-medium flex items-center justify-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
              Siya Voice Assistant is ready for you
            </p>
          </motion.div>
        )}

        <AnimatePresence>
          {showTextInput && (
            <motion.form 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onSubmit={handleTextSubmit}
              className="w-full max-w-md flex items-center gap-2 bg-white/5 border border-white/10 rounded-full p-1 pl-4 backdrop-blur-md shadow-2xl"
            >
              <input 
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type a message to Siya..."
                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/30 text-sm"
                autoFocus
              />
              <button 
                type="submit"
                disabled={!textInput.trim()}
                className="p-2 rounded-full bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:hover:bg-violet-500 transition-colors"
              >
                <Send size={16} />
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2.5 sm:gap-4 max-w-[90vw]">
          <button
            onClick={toggleListening}
            className={`
              group relative flex items-center gap-2 sm:gap-3 px-5 py-3 sm:px-8 sm:py-4 rounded-full font-medium tracking-wide transition-all duration-300 shadow-2xl text-sm sm:text-base
              ${
                isSessionActive
                  ? "bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30"
                  : "bg-white/10 text-white border border-white/20 hover:bg-white/20 hover:scale-105"
              }
            `}
          >
            {isSessionActive ? (
              <>
                <MicOff size={18} className="sm:w-5 sm:h-5" />
                <span>End Session</span>
              </>
            ) : (
              <>
                <Mic size={18} className="sm:w-5 sm:h-5 group-hover:animate-bounce" />
                <span>Start Session</span>
              </>
            )}
          </button>
          
          {!isSessionActive && (
            <button
              onClick={() => setShowTextInput(!showTextInput)}
              className="p-3 sm:p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors shadow-2xl"
              title="Type instead"
            >
              <Keyboard size={18} className="sm:w-5 sm:h-5 opacity-70" />
            </button>
          )}
        </div>
      </footer>

      {/* In-App Admin & User Activity Logs Modal */}
      <AdminLogsModal
        isOpen={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        isDeveloperSession={isDeveloper}
        currentEmail={user.email}
        onOpenFullscreenConsole={onDeveloper}
      />

      {/* Developer Messages & Announcements Modal */}
      <AnimatePresence>
        {showDevMessagesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-lg rounded-3xl bg-[#0e0e14] border border-white/10 p-6 shadow-2xl text-left flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400">
                    <Bell size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">Developer Messages & Updates</h3>
                    <p className="text-xs text-white/50">Direct communications from Shivam Yadav</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDevMessagesModal(false)}
                  className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-4 space-y-3">
                {devMessages.length === 0 ? (
                  <div className="py-12 text-center text-white/40 text-sm">
                    <p>No messages or announcements right now.</p>
                    <p className="text-xs text-white/30 mt-1">You're all caught up!</p>
                  </div>
                ) : (
                  devMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white truncate">{msg.subject}</span>
                        <span
                          className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                            msg.priority === "urgent"
                              ? "bg-red-500/20 text-red-300 border-red-500/30"
                              : msg.priority === "important"
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                              : "bg-blue-500/20 text-blue-300 border-blue-500/30"
                          }`}
                        >
                          {msg.priority || "Normal"}
                        </span>
                      </div>
                      <p className="text-xs text-white/80 whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                      <div className="flex items-center justify-between pt-1 text-[10px] text-white/40">
                        <span>From: Shivam Yadav (Developer)</span>
                        <span>{new Date(msg.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-3 border-t border-white/10 flex justify-end shrink-0">
                <button
                  onClick={() => setShowDevMessagesModal(false)}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Change Password Modal */}
      <AnimatePresence>
        {showChangePasswordModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-md rounded-3xl bg-[#0e0e14] border border-white/10 p-6 shadow-2xl text-left"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <KeyRound size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">Change Your Password</h3>
                    <p className="text-xs text-white/50">Update credentials for {user.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowChangePasswordModal(false);
                    setChangePasswordMsg(null);
                  }}
                  className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleChangePasswordSubmit} className="py-4 space-y-3.5">
                {changePasswordMsg && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                      changePasswordMsg.type === "success"
                        ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
                        : "bg-red-500/15 border border-red-500/30 text-red-300"
                    }`}
                  >
                    {changePasswordMsg.type === "success" ? (
                      <CheckCircle2 size={14} className="shrink-0" />
                    ) : (
                      <AlertTriangle size={14} className="shrink-0" />
                    )}
                    <span>{changePasswordMsg.text}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs text-white/60 mb-1">Current Password</label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-blue-400 focus:outline-none text-sm text-white transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs text-white/60 mb-1">New Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-blue-400 focus:outline-none text-sm text-white transition-colors"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowChangePasswordModal(false);
                      setChangePasswordMsg(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={changePasswordBusy}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center gap-1.5"
                  >
                    {changePasswordBusy && <Loader2 size={14} className="animate-spin" />}
                    <span>Update Password</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Subscription Paywall & Plan Selector Modal */}
      <SubscriptionPaywallModal
        isOpen={showPaywallModal}
        onClose={() => {
          sessionStorage.setItem("siya_paywall_dismissed", "true");
          setShowPaywallModal(false);
        }}
        user={user}
        currentTier={userTier}
        initialPlan={paywallInitialPlan}
        onPlanApproved={(newTier, newMode) => {
          setUserTier(newTier);
          userTierRef.current = newTier;
          setPersonalityMode(newMode);
          localStorage.setItem("siya_personality_mode", newMode);
          setAllowedModes(getTierAllowedModes(newTier, isDeveloper));
          setShowPaywallModal(false);
          resetSiyaSession();
        }}
      />

      {/* Real-time Tier Unlock Toast Banner */}
      <AnimatePresence>
        {unlockToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-5 left-1/2 -translate-y-1/2 z-50 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white px-5 py-3 rounded-2xl shadow-2xl border border-emerald-400/40 flex items-center gap-3 text-xs font-semibold max-w-md text-left"
          >
            <Sparkles size={16} className="text-emerald-200 shrink-0 animate-spin" />
            <span className="flex-1">{unlockToast}</span>
            <button
              onClick={() => setUnlockToast(null)}
              className="p-1 rounded-full hover:bg-black/20 text-white/80 hover:text-white shrink-0 cursor-pointer"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [showWelcomeSplash, setShowWelcomeSplash] = useState(false);

  useEffect(() => {
    let active = true;
    const safetyTimer = setTimeout(() => {
      if (active) setChecking(false);
    }, 2000);

    const savedToken = localStorage.getItem("siya_token") || "";
    const headers: Record<string, string> = {};
    if (savedToken) {
      headers["Authorization"] = `Bearer ${savedToken}`;
      headers["x-siya-session"] = savedToken;
    }
    fetch("/api/auth/me", { credentials: "include", headers })
      .then(async (r) => {
        if (r.ok && active) {
          const data = await r.json();
          if (data.authenticated && data.user) {
            setUser(data.user);
            setIsDeveloper(Boolean(data.developer));
          }
        }
      })
      .catch((err) => {
        console.warn("Session restore failed:", err);
      })
      .finally(() => {
        if (active) {
          clearTimeout(safetyTimer);
          setChecking(false);
        }
      });

    return () => {
      active = false;
      clearTimeout(safetyTimer);
    };
  }, []);

  const handleAuth = useCallback((nextUser: AuthUser, developer: boolean) => {
    setUser(nextUser);
    setIsDeveloper(developer);
    setDeveloperOpen(false);
    setShowWelcomeSplash(true); // Automatically shows after login or signup
  }, []);

  const logout = useCallback(async () => {
    const savedToken = localStorage.getItem("siya_token") || "";
    localStorage.removeItem("siya_token");
    const headers: Record<string, string> = savedToken
      ? { Authorization: `Bearer ${savedToken}`, "x-siya-session": savedToken }
      : {};
    await fetch("/api/auth/logout", { method: "POST", credentials: "include", headers }).catch(() => {});
    setUser(null);
    setIsDeveloper(false);
    setDeveloperOpen(false);
    setShowWelcomeSplash(false);
  }, []);

  if (checking) return <div className="min-h-[100dvh] bg-[#030305] grid place-items-center text-white/50">Loading secure session…</div>;
  if (!user) return <AuthGate onAuthenticated={handleAuth} />;

  return (
    <>
      <AnimatePresence>
        {showWelcomeSplash && (
          <DeveloperWelcomeOverlay
            user={user}
            onDismiss={() => setShowWelcomeSplash(false)}
          />
        )}
      </AnimatePresence>

      {developerOpen && isDeveloper ? (
        <DeveloperDashboard user={user} onExit={() => setDeveloperOpen(false)} onLogout={logout} />
      ) : (
        <SiyaApp
          user={user}
          isDeveloper={isDeveloper}
          onLogout={logout}
          onDeveloper={() => setDeveloperOpen(true)}
          onShowWelcome={() => setShowWelcomeSplash(true)}
        />
      )}
    </>
  );
}
