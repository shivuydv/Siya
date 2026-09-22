import { useState, useEffect, useCallback, useMemo, FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Activity,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  LogIn,
  Maximize2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";

interface AuthLog {
  id: number;
  user_id: number;
  name: string;
  email: string;
  event: "signup" | "login";
  ip: string;
  created_at: string;
}

interface Stats {
  totalUsers: number;
  activeSessions: number;
  totalSignups: number;
  totalLogins: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isDeveloperSession: boolean;
  currentEmail?: string;
  onOpenFullscreenConsole?: () => void;
}

function timeAgo(dateString: string): string {
  const date = new Date(dateString.endsWith("Z") ? dateString : dateString + "Z");
  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (isNaN(diffSeconds)) return dateString;
  if (diffSeconds < 5) return "Just now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

function formatDateTime(dateString: string): string {
  try {
    const d = new Date(dateString.endsWith("Z") ? dateString : dateString + "Z");
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return dateString;
  }
}

export default function AdminLogsModal({
  isOpen,
  onClose,
  isDeveloperSession,
  currentEmail = "",
  onOpenFullscreenConsole,
}: Props) {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(isDeveloperSession);
  const [emailInput, setEmailInput] = useState<string>(currentEmail || "shivu12745114@gmail.com");
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [verifyBusy, setVerifyBusy] = useState<boolean>(false);
  const [verifyError, setVerifyError] = useState<string>("");

  const [tab, setTab] = useState<"activity" | "users">("activity");
  const [logs, setLogs] = useState<AuthLog[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    activeSessions: 0,
    totalSignups: 0,
    totalLogins: 0,
  });
  const [filterType, setFilterType] = useState<"all" | "signup" | "login">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // If the parent already knows user is developer, auto-unlock
  useEffect(() => {
    if (isDeveloperSession) {
      setIsUnlocked(true);
    }
  }, [isDeveloperSession]);

  const loadData = useCallback(async (manual = false) => {
    if (!isUnlocked && !isDeveloperSession) return;
    if (manual) setIsRefreshing(true);
    try {
      const savedToken = localStorage.getItem("siya_token") || "";
      const headers: HeadersInit = savedToken ? { "x-siya-session": savedToken } : {};

      const [logsRes, usersRes] = await Promise.all([
        fetch("/api/developer/logs?limit=50", { credentials: "include", headers }),
        fetch("/api/developer/users", { credentials: "include", headers }),
      ]);

      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data.logs || []);
        if (data.stats) setStats(data.stats);
      }
      if (usersRes.ok) {
        const udata = await usersRes.json();
        setUsers(udata.users || []);
      }
      setLastRefreshed(new Date());
    } catch (e) {
      console.error("Failed to load logs in modal", e);
    } finally {
      if (manual) setIsRefreshing(false);
    }
  }, [isUnlocked, isDeveloperSession]);

  useEffect(() => {
    if (isOpen && (isUnlocked || isDeveloperSession)) {
      loadData();
      const interval = setInterval(() => {
        loadData();
      }, 3500);
      return () => clearInterval(interval);
    }
  }, [isOpen, isUnlocked, isDeveloperSession, loadData]);

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    setVerifyBusy(true);
    setVerifyError("");
    try {
      const res = await fetch("/api/developer/verify-access", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailInput,
          password: passwordInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Verification failed");
      }

      if (data.token) {
        localStorage.setItem("siya_token", data.token);
      }

      setIsUnlocked(true);
      if (data.logs) setLogs(data.logs);
      if (data.users) setUsers(data.users);
      if (data.stats) setStats(data.stats);
      setLastRefreshed(new Date());
      setPasswordInput("");
    } catch (err: any) {
      setVerifyError(err.message || "Invalid Developer ID or Password");
    } finally {
      setVerifyBusy(false);
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesFilter = filterType === "all" || log.event === filterType;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        log.name.toLowerCase().includes(q) ||
        log.email.toLowerCase().includes(q) ||
        (log.ip && log.ip.toLowerCase().includes(q));
      return matchesFilter && matchesSearch;
    });
  }, [logs, filterType, searchQuery]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      id="admin-logs-modal-overlay"
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain flex min-h-full items-start sm:items-center justify-center p-2 sm:p-4 md:p-6 bg-black/80 backdrop-blur-md touch-pan-y"
      style={{ WebkitOverflowScrolling: "touch" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        id="admin-logs-modal-content"
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.25 }}
        className="relative w-full max-w-4xl max-h-[92dvh] my-2 sm:my-auto flex flex-col rounded-2xl sm:rounded-3xl bg-[#09090f] border border-white/15 text-white shadow-2xl overflow-hidden"
      >
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[.02] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 grid place-items-center text-white shadow-lg">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">Siya In-App Activity & User Logs</h2>
                {isUnlocked && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE
                  </span>
                )}
              </div>
              <p className="text-xs text-white/40">
                Inspect who is signing up and logging into Siya in real time
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isUnlocked && onOpenFullscreenConsole && (
              <button
                id="modal-open-fullscreen-btn"
                onClick={() => {
                  onClose();
                  onOpenFullscreenConsole();
                }}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium text-white/80 transition-colors cursor-pointer"
                title="Open standalone fullscreen console"
              >
                <Maximize2 size={13} />
                <span>Fullscreen</span>
              </button>
            )}
            <button
              id="admin-modal-close-btn"
              onClick={onClose}
              className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition-colors cursor-pointer"
              title="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        {!isUnlocked ? (
          /* Password / ID Verification View */
          <div id="admin-auth-view" className="p-6 md:p-10 flex flex-col items-center justify-center text-center overflow-y-auto">
            <div className="w-14 h-14 rounded-3xl bg-violet-500/10 border border-violet-500/20 text-violet-400 grid place-items-center mb-4">
              <KeyRound size={26} />
            </div>
            <h3 className="text-2xl font-bold">Developer ID & Password Required</h3>
            <p className="text-sm text-white/50 max-w-md mt-2 mb-6">
              Enter your Developer ID (Email) and Password below to view all user logins, signups, and registration records directly inside Siya.
            </p>

            <form onSubmit={handleVerify} className="w-full max-w-sm space-y-4 text-left">
              <div>
                <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-1.5">
                  Developer ID / Email
                </label>
                <input
                  id="admin-verify-email"
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="e.g. shivu12745114@gmail.com"
                  className="w-full h-11 px-3.5 rounded-xl bg-black/40 border border-white/15 text-sm outline-none focus:border-violet-400/80 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-1.5">
                  Developer Password
                </label>
                <div className="relative">
                  <input
                    id="admin-verify-password"
                    type={showPassword ? "text" : "password"}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Enter developer password"
                    className="w-full h-11 pl-3.5 pr-10 rounded-xl bg-black/40 border border-white/15 text-sm outline-none focus:border-violet-400/80 transition-colors"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {verifyError && (
                <div id="admin-verify-error" className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3.5 py-2.5">
                  {verifyError}
                </div>
              )}

              <button
                id="admin-verify-submit-btn"
                type="submit"
                disabled={verifyBusy}
                className="w-full h-11 rounded-xl bg-white text-black font-semibold text-sm hover:bg-white/90 disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                {verifyBusy ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    <span>Verifying…</span>
                  </>
                ) : (
                  <span>Unlock & View Logs</span>
                )}
              </button>

              <div className="pt-2 text-center">
                <span className="text-[11px] text-white/30">
                  Authorized IDs: shivu12745114@gmail.com, shivamt2phone@gmail.com, areels491@gmail.com
                </span>
              </div>
            </form>
          </div>
        ) : (
          /* Unlocked Logs & Users View */
          <div id="admin-unlocked-view" className="flex-1 flex flex-col overflow-hidden">
            {/* Top Toolbar: Stats + Tabs + Search */}
            <div className="p-4 md:p-5 border-b border-white/10 bg-white/[.01] space-y-4 shrink-0">
              {/* Quick KPI stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-2xl bg-white/[.03] border border-white/10">
                  <div className="text-[10px] uppercase font-semibold text-white/40">Total Signups</div>
                  <div className="text-xl font-bold text-emerald-400 mt-0.5">{stats.totalSignups}</div>
                </div>
                <div className="p-3 rounded-2xl bg-white/[.03] border border-white/10">
                  <div className="text-[10px] uppercase font-semibold text-white/40">Total Logins</div>
                  <div className="text-xl font-bold text-sky-400 mt-0.5">{stats.totalLogins}</div>
                </div>
                <div className="p-3 rounded-2xl bg-white/[.03] border border-white/10">
                  <div className="text-[10px] uppercase font-semibold text-white/40">Total Users</div>
                  <div className="text-xl font-bold text-violet-400 mt-0.5">{stats.totalUsers}</div>
                </div>
                <div className="p-3 rounded-2xl bg-white/[.03] border border-white/10">
                  <div className="text-[10px] uppercase font-semibold text-white/40">Active Sessions</div>
                  <div className="text-xl font-bold text-amber-400 mt-0.5">{stats.activeSessions}</div>
                </div>
              </div>

              {/* Tabs and Search */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[.05] border border-white/10 w-fit">
                  <button
                    id="modal-tab-activity"
                    onClick={() => setTab("activity")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      tab === "activity"
                        ? "bg-white text-black shadow"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    Activity Stream ({logs.length})
                  </button>
                  <button
                    id="modal-tab-users"
                    onClick={() => setTab("users")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      tab === "users"
                        ? "bg-white text-black shadow"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    All Users ({users.length})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-60">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                    <input
                      id="modal-search-input"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search name, email..."
                      className="w-full h-8 pl-8 pr-3 rounded-xl bg-black/40 border border-white/10 text-xs outline-none focus:border-violet-400/60"
                    />
                  </div>
                  <button
                    id="modal-refresh-data-btn"
                    onClick={() => loadData(true)}
                    disabled={isRefreshing}
                    className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 transition-colors cursor-pointer"
                    title={`Refresh feed (last: ${lastRefreshed.toLocaleTimeString()})`}
                  >
                    <RefreshCw size={14} className={isRefreshing ? "animate-spin text-emerald-400" : ""} />
                  </button>
                </div>
              </div>

              {tab === "activity" && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Filter:</span>
                  <button
                    id="modal-filter-all"
                    onClick={() => setFilterType("all")}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                      filterType === "all"
                        ? "bg-white/20 text-white border border-white/30"
                        : "bg-white/5 text-white/40 hover:text-white border border-transparent"
                    }`}
                  >
                    All
                  </button>
                  <button
                    id="modal-filter-signup"
                    onClick={() => setFilterType("signup")}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                      filterType === "signup"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-white/5 text-white/40 hover:text-white border border-transparent"
                    }`}
                  >
                    Signups
                  </button>
                  <button
                    id="modal-filter-login"
                    onClick={() => setFilterType("login")}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                      filterType === "login"
                        ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                        : "bg-white/5 text-white/40 hover:text-white border border-transparent"
                    }`}
                  >
                    Logins
                  </button>
                </div>
              )}
            </div>

            {/* Scrollable Content List */}
            <div className="flex-1 overflow-y-auto divide-y divide-white/5 p-2 md:p-4">
              {tab === "activity" ? (
                filteredLogs.length === 0 ? (
                  <div className="p-8 text-center text-white/40 text-xs">
                    No activity logs match your search.
                  </div>
                ) : (
                  filteredLogs.map((log) => {
                    const isSignup = log.event === "signup";
                    return (
                      <div
                        id={`modal-log-item-${log.id}`}
                        key={log.id}
                        className="p-3 md:p-3.5 flex items-center justify-between gap-3 hover:bg-white/[.02] rounded-2xl transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${
                              isSignup
                                ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                                : "bg-sky-500/15 border border-sky-500/30 text-sky-400"
                            }`}
                          >
                            {isSignup ? <UserPlus size={16} /> : <LogIn size={16} />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-white">{log.name}</span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                  isSignup
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                    : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                                }`}
                              >
                                {isSignup ? "Signup" : "Login"}
                              </span>
                            </div>
                            <div className="text-xs text-white/50 flex items-center gap-2.5 mt-0.5">
                              <span>{log.email}</span>
                              {log.ip && (
                                <span className="flex items-center gap-1 text-[11px] text-white/35">
                                  <Globe size={10} /> {log.ip}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs text-white/70 font-medium block">
                            {timeAgo(log.created_at)}
                          </span>
                          <span className="text-[10px] text-white/30 flex items-center justify-end gap-1 mt-0.5">
                            <Clock size={10} />
                            {formatDateTime(log.created_at)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                /* Users Tab */
                filteredUsers.length === 0 ? (
                  <div className="p-8 text-center text-white/40 text-xs">
                    No users found matching query.
                  </div>
                ) : (
                  filteredUsers.map((u) => (
                    <div
                      key={u.id}
                      className="p-3.5 flex items-center justify-between gap-3 hover:bg-white/[.02] rounded-2xl transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/25 text-violet-300 grid place-items-center font-bold text-xs">
                          {u.name?.slice(0, 1).toUpperCase() || "U"}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-white">{u.name}</div>
                          <div className="text-xs text-white/50">{u.email}</div>
                        </div>
                      </div>

                      <div className="text-right text-xs text-white/40">
                        <div>Joined: {formatDateTime(u.created_at)}</div>
                        <div className="text-[11px] text-emerald-400/80 mt-0.5">
                          {u.last_login_at ? `Active: ${timeAgo(u.last_login_at)}` : "No logins yet"}
                        </div>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
