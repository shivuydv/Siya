import { useEffect, useState, useCallback, useMemo, type ChangeEvent, type FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Award,
  Ban,
  Bell,
  Briefcase,
  Camera,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Cpu,
  Crown,
  ExternalLink,
  Eye,
  Globe,
  Heart,
  Image as ImageIcon,
  KeyRound,
  Link as LinkIcon,
  LogIn,
  LogOut,
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import type { AuthUser } from "./AuthGate";

type Props = { user: AuthUser; onExit: () => void; onLogout: () => void };

interface AuthLog {
  id: number;
  user_id: number;
  name: string;
  email: string;
  event: string;
  ip: string;
  created_at: string;
}

interface Stats {
  totalUsers: number;
  activeSessions: number;
  totalSignups: number;
  totalLogins: number;
  totalPro?: number;
  totalBanned?: number;
}

interface Promotion {
  id: number;
  title: string;
  description: string;
  badge: string;
  link_url?: string;
  promo_code?: string;
  cta_text: string;
  is_active: number;
  created_at: string;
}

interface PasswordResetRecord {
  id: number;
  user_id: number;
  email: string;
  reset_code: string;
  status: string;
  created_at: string;
  expires_at: number;
  ip: string;
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

export default function DeveloperDashboard({ user, onExit, onLogout }: Props) {
  const [tab, setTab] = useState<"users" | "subscriptions" | "activity" | "security" | "promotions" | "overview" | "portfolio" | "email_alerts">("users");
  const [logs, setLogs] = useState<AuthLog[]>([]);
  const [devMessages, setDevMessages] = useState<any[]>([]);
  const [copiedEmailMsgId, setCopiedEmailMsgId] = useState<number | null>(null);
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    activeSessions: 0,
    totalSignups: 0,
    totalLogins: 0,
    totalPro: 0,
    totalBanned: 0,
  });
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [resetRecords, setResetRecords] = useState<PasswordResetRecord[]>([]);
  const [securityEvents, setSecurityEvents] = useState<any[]>([]);

  // Subscriptions & Micro-payment Orders state
  const [subscriptionRequests, setSubscriptionRequests] = useState<any[]>([]);
  const [paymentSettings, setPaymentSettings] = useState({
    whatsapp: "+919876543210",
    upiId: "shivu12745114@okaxis",
  });
  const [subFilter, setSubFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [subSearch, setSubSearch] = useState("");
  const [subActionBusy, setSubActionBusy] = useState<number | null>(null);
  const [rejectModalReq, setRejectModalReq] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [error, setError] = useState("");
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const [devPhotoUrl, setDevPhotoUrl] = useState<string>(() => {
    return localStorage.getItem("siya_developer_custom_photo") || "/assets/shivam.jpg";
  });

  const [photoInputMode, setPhotoInputMode] = useState<"file" | "url">("file");
  const [customPhotoUrlInput, setCustomPhotoUrlInput] = useState("");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoLastSynced, setPhotoLastSynced] = useState<string | null>(null);

  // Dynamically fetch globally saved photo from database on mount
  useEffect(() => {
    fetch("/api/developer/photo")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.photoUrl) {
          setDevPhotoUrl(data.photoUrl);
          if (data.updatedAt) setPhotoLastSynced(new Date(data.updatedAt).toLocaleTimeString());
          localStorage.setItem("siya_developer_custom_photo", data.photoUrl);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handlePhotoUpdated = (e: CustomEvent<string>) => {
      if (e.detail) setDevPhotoUrl(e.detail);
    };
    window.addEventListener("developer-photo-updated" as any, handlePhotoUpdated);
    return () => window.removeEventListener("developer-photo-updated" as any, handlePhotoUpdated);
  }, []);

  const handlePhotoFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 15 * 1024 * 1024) {
        setToastMsg({ text: "Photo file size must be under 15MB", type: "error" });
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setPhotoPreview(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSavePhotoFile = async () => {
    if (!photoPreview) {
      setToastMsg({ text: "Please select an image file first", type: "error" });
      return;
    }
    setIsUploadingPhoto(true);
    try {
      const savedToken = localStorage.getItem("siya_token") || "";
      const res = await fetch("/api/developer/update-photo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(savedToken ? { "x-siya-session": savedToken } : {}),
        },
        body: JSON.stringify({ imageBase64: photoPreview }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update photo");

      setDevPhotoUrl(data.photoUrl);
      setPhotoPreview(null);
      setPhotoLastSynced(new Date().toLocaleTimeString());
      localStorage.setItem("siya_developer_custom_photo", data.photoUrl);
      window.dispatchEvent(new CustomEvent("developer-photo-updated", { detail: data.photoUrl }));
      setToastMsg({ text: "Developer photo saved globally in database! Universal display is now active.", type: "success" });
    } catch (err: any) {
      setToastMsg({ text: err.message || "Failed to upload photo", type: "error" });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSavePhotoUrl = async () => {
    if (!customPhotoUrlInput.trim()) {
      setToastMsg({ text: "Please enter a valid image URL", type: "error" });
      return;
    }
    setIsUploadingPhoto(true);
    try {
      const savedToken = localStorage.getItem("siya_token") || "";
      const res = await fetch("/api/developer/update-photo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(savedToken ? { "x-siya-session": savedToken } : {}),
        },
        body: JSON.stringify({ photoUrl: customPhotoUrlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update photo");

      setDevPhotoUrl(data.photoUrl);
      setCustomPhotoUrlInput("");
      setPhotoLastSynced(new Date().toLocaleTimeString());
      localStorage.setItem("siya_developer_custom_photo", data.photoUrl);
      window.dispatchEvent(new CustomEvent("developer-photo-updated", { detail: data.photoUrl }));
      setToastMsg({ text: "Developer photo URL saved globally in database! Universal display is now active.", type: "success" });
    } catch (err: any) {
      setToastMsg({ text: err.message || "Failed to save photo URL", type: "error" });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleResetDefaultPhoto = async () => {
    setIsUploadingPhoto(true);
    try {
      const savedToken = localStorage.getItem("siya_token") || "";
      const res = await fetch("/api/developer/update-photo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(savedToken ? { "x-siya-session": savedToken } : {}),
        },
        body: JSON.stringify({ photoUrl: "/assets/shivam.jpg" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset photo");

      setDevPhotoUrl("/assets/shivam.jpg");
      setPhotoPreview(null);
      setCustomPhotoUrlInput("");
      setPhotoLastSynced(new Date().toLocaleTimeString());
      localStorage.setItem("siya_developer_custom_photo", "/assets/shivam.jpg");
      window.dispatchEvent(new CustomEvent("developer-photo-updated", { detail: "/assets/shivam.jpg" }));
      setToastMsg({ text: "Photo reset to default Shivam portrait globally.", type: "success" });
    } catch (err: any) {
      setToastMsg({ text: err.message || "Failed to reset photo", type: "error" });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Modals state
  const [moderationModalUser, setModerationModalUser] = useState<any | null>(null);
  const [moderationAction, setModerationAction] = useState<"suspended" | "banned" | "active">("suspended");
  const [moderationReason, setModerationReason] = useState("");

  const [messageModalUser, setMessageModalUser] = useState<any | null>(null);
  const [messageSubject, setMessageSubject] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [messagePriority, setMessagePriority] = useState<"normal" | "important" | "urgent">("normal");

  const [passwordModalUser, setPasswordModalUser] = useState<any | null>(null);
  const [testPasswordInput, setTestPasswordInput] = useState("");
  const [testPasswordResult, setTestPasswordResult] = useState<string | null>(null);
  const [customPasswordInput, setCustomPasswordInput] = useState("");

  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [promoTitle, setPromoTitle] = useState("");
  const [promoDesc, setPromoDesc] = useState("");
  const [promoBadge, setPromoBadge] = useState("SPECIAL PROMO");
  const [promoCode, setPromoCode] = useState("");
  const [promoLink, setPromoLink] = useState("");
  const [promoCta, setPromoCta] = useState("Check it out");

  const [actionBusy, setActionBusy] = useState(false);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const getHeaders = (): HeadersInit => {
    const savedToken = localStorage.getItem("siya_token") || "";
    return savedToken ? { "x-siya-session": savedToken, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
  };

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const headers = getHeaders();
      const [logsRes, overviewRes] = await Promise.all([
        fetch("/api/developer/logs?limit=50", { credentials: "include", headers }),
        fetch("/api/developer/overview", { credentials: "include", headers }),
      ]);

      if (!logsRes.ok || !overviewRes.ok) {
        throw new Error("Developer authorization required");
      }

      const logsData = await logsRes.json();
      const overviewData = await overviewRes.json();

      setLogs(logsData.logs || []);
      setStats(
        overviewData.stats || {
          totalUsers: 0,
          activeSessions: 0,
          totalSignups: 0,
          totalLogins: 0,
          totalPro: 0,
          totalBanned: 0,
        }
      );
      setRecentUsers(overviewData.recentUsers || []);
      if (overviewData.allUsers) {
        setAllUsers(overviewData.allUsers);
      }
      setLastUpdated(new Date());
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to fetch developer data");
    } finally {
      setLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  }, []);

  const loadAllUsers = useCallback(async () => {
    try {
      const headers = getHeaders();
      const res = await fetch("/api/developer/users", { credentials: "include", headers });
      if (res.ok) {
        const data = await res.json();
        setAllUsers(data.users || []);
      }
    } catch (e) {
      console.error("Failed to load users", e);
    }
  }, []);

  const loadPromotions = useCallback(async () => {
    try {
      const headers = getHeaders();
      const res = await fetch("/api/developer/promotions", { credentials: "include", headers });
      if (res.ok) {
        const data = await res.json();
        setPromotions(data.promotions || []);
      }
    } catch (e) {
      console.error("Failed to load promotions", e);
    }
  }, []);

  const loadSecurityLogs = useCallback(async () => {
    try {
      const headers = getHeaders();
      const res = await fetch("/api/developer/security-logs", { credentials: "include", headers });
      if (res.ok) {
        const data = await res.json();
        setResetRecords(data.resets || []);
        setSecurityEvents(data.securityEvents || []);
      }
    } catch (e) {
      console.error("Failed to load security logs", e);
    }
  }, []);

  const loadSubscriptions = useCallback(async () => {
    try {
      const headers = getHeaders();
      const [subRes, payRes] = await Promise.all([
        fetch("/api/developer/subscriptions", { credentials: "include", headers }),
        fetch("/api/developer/payment-settings", { credentials: "include", headers }),
      ]);
      if (subRes.ok) {
        const data = await subRes.json();
        setSubscriptionRequests(data.requests || []);
      }
      if (payRes.ok) {
        const payData = await payRes.json();
        setPaymentSettings({
          whatsapp: payData.whatsapp || "+919876543210",
          upiId: payData.upiId || "shivu12745114@okaxis",
        });
      }
    } catch (e) {
      console.error("Failed to load subscriptions", e);
    }
  }, []);

  const loadDevMessages = useCallback(async () => {
    try {
      const headers = getHeaders();
      const res = await fetch("/api/developer/messages", { credentials: "include", headers });
      if (res.ok) {
        const data = await res.json();
        setDevMessages(data.messages || []);
      }
    } catch (e) {
      console.error("Failed to load developer messages", e);
    }
  }, []);

  const handleApproveSubscription = async (reqItem: any) => {
    setSubActionBusy(reqItem.id);
    try {
      const headers = getHeaders();
      const res = await fetch(`/api/developer/subscriptions/${reqItem.id}/approve`, {
        method: "POST",
        credentials: "include",
        headers,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to approve subscription");
      showToast(data.message || `Plan approved for ${reqItem.user_name}! Mode unlocked.`, "success");
      await Promise.all([loadSubscriptions(), loadAllUsers(), fetchData()]);
    } catch (err: any) {
      showToast(err.message || "Failed to approve", "error");
    } finally {
      setSubActionBusy(null);
    }
  };

  const handleRejectSubscription = async () => {
    if (!rejectModalReq) return;
    setSubActionBusy(rejectModalReq.id);
    try {
      const headers = getHeaders();
      const res = await fetch(`/api/developer/subscriptions/${rejectModalReq.id}/reject`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ reason: rejectReason.trim() || "Verification not completed" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reject subscription");
      showToast("Subscription request rejected.", "success");
      setRejectModalReq(null);
      setRejectReason("");
      await loadSubscriptions();
    } catch (err: any) {
      showToast(err.message || "Failed to reject", "error");
    } finally {
      setSubActionBusy(null);
    }
  };

  const handleSetUserTier = async (userId: number, newTier: string) => {
    try {
      const headers = getHeaders();
      const res = await fetch(`/api/developer/users/${userId}/tier`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ tier: newTier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update tier");
      showToast(`User tier updated to ${newTier.toUpperCase()}!`, "success");
      await Promise.all([loadAllUsers(), fetchData()]);
    } catch (err: any) {
      showToast(err.message || "Failed to update tier", "error");
    }
  };

  const handleSavePaymentSettings = async (e: FormEvent) => {
    e.preventDefault();
    setActionBusy(true);
    try {
      const headers = getHeaders();
      const res = await fetch("/api/developer/payment-settings", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(paymentSettings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update payment settings");
      showToast("Payment & WhatsApp settings updated globally!", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update settings", "error");
    } finally {
      setActionBusy(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchData();
    loadAllUsers();
    loadPromotions();
    loadSecurityLogs();
    loadSubscriptions();
  }, [fetchData, loadAllUsers, loadPromotions, loadSecurityLogs, loadSubscriptions]);

  // Tab change handlers
  useEffect(() => {
    if (tab === "users") loadAllUsers();
    if (tab === "subscriptions") loadSubscriptions();
    if (tab === "promotions") loadPromotions();
    if (tab === "security") loadSecurityLogs();
  }, [tab, loadAllUsers, loadSubscriptions, loadPromotions, loadSecurityLogs]);

  // Live auto-polling every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData();
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ACTION: Toggle Pro
  const handleTogglePro = async (targetUser: any) => {
    const nextProState = !targetUser.is_pro;
    try {
      const headers = getHeaders();
      const res = await fetch("/api/developer/users/pro", {
        method: "POST",
        headers,
        body: JSON.stringify({ userId: targetUser.id, isPro: nextProState }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update Pro status");
      showToast(`${targetUser.name} is now ${nextProState ? "PRO (Active)" : "Free Tier"}`);
      loadAllUsers();
      fetchData();
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  // ACTION: Moderation Submit (Suspend / Ban / Reactivate)
  const submitModeration = async () => {
    if (!moderationModalUser) return;
    setActionBusy(true);
    try {
      const headers = getHeaders();
      const res = await fetch("/api/developer/users/status", {
        method: "POST",
        headers,
        body: JSON.stringify({
          userId: moderationModalUser.id,
          status: moderationAction,
          reason: moderationReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update user status");
      showToast(`User status set to ${moderationAction.toUpperCase()}`);
      setModerationModalUser(null);
      setModerationReason("");
      loadAllUsers();
      fetchData();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setActionBusy(false);
    }
  };

  // ACTION: Send Message / Email to User
  const submitMessage = async () => {
    if (!messageSubject || !messageContent) {
      showToast("Subject and message are required", "error");
      return;
    }
    setActionBusy(true);
    try {
      const headers = getHeaders();
      const userId = messageModalUser ? messageModalUser.id : 0; // 0 for broadcast
      const res = await fetch("/api/developer/messages/send", {
        method: "POST",
        headers,
        body: JSON.stringify({
          userId,
          subject: messageSubject,
          message: messageContent,
          priority: messagePriority,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send message");
      showToast(userId === 0 ? "Broadcast alert dispatched to all users!" : `Direct message sent to ${messageModalUser.name}`);
      setMessageModalUser(null);
      setMessageSubject("");
      setMessageContent("");
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setActionBusy(false);
    }
  };

  // ACTION: Verify / Test Password
  const handleTestPassword = async () => {
    if (!passwordModalUser || !testPasswordInput) return;
    setActionBusy(true);
    try {
      const headers = getHeaders();
      const res = await fetch("/api/developer/users/verify-password", {
        method: "POST",
        headers,
        body: JSON.stringify({ userId: passwordModalUser.id, testPassword: testPasswordInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to test password");
      setTestPasswordResult(data.message);
    } catch (err: any) {
      setTestPasswordResult(`❌ Error: ${err.message}`);
    } finally {
      setActionBusy(false);
    }
  };

  // ACTION: Direct Reset Password
  const handleResetPassword = async () => {
    if (!passwordModalUser) return;
    setActionBusy(true);
    try {
      const headers = getHeaders();
      const res = await fetch("/api/developer/users/reset-password", {
        method: "POST",
        headers,
        body: JSON.stringify({ userId: passwordModalUser.id, newPassword: customPasswordInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset password");
      showToast(`Password updated! Temporary: ${data.temporaryPassword}`);
      setPasswordModalUser(null);
      setCustomPasswordInput("");
      setTestPasswordInput("");
      setTestPasswordResult(null);
      loadAllUsers();
      loadSecurityLogs();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setActionBusy(false);
    }
  };

  // ACTION: Create Promotion
  const submitCreatePromotion = async () => {
    if (!promoTitle || !promoDesc) {
      showToast("Title and description are required", "error");
      return;
    }
    setActionBusy(true);
    try {
      const headers = getHeaders();
      const res = await fetch("/api/developer/promotions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: promoTitle,
          description: promoDesc,
          badge: promoBadge,
          promo_code: promoCode,
          link_url: promoLink,
          cta_text: promoCta,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create promotion");
      showToast("New promotion and banner created!");
      setPromoModalOpen(false);
      setPromoTitle("");
      setPromoDesc("");
      setPromoCode("");
      setPromoLink("");
      loadPromotions();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setActionBusy(false);
    }
  };

  // ACTION: Toggle Promotion
  const handleTogglePromo = async (promoId: number) => {
    try {
      const headers = getHeaders();
      const res = await fetch(`/api/developer/promotions/${promoId}/toggle`, {
        method: "POST",
        headers,
      });
      if (res.ok) {
        showToast("Promotion status updated");
        loadPromotions();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ACTION: Delete Promotion
  const handleDeletePromo = async (promoId: number) => {
    if (!confirm("Are you sure you want to delete this promotion?")) return;
    try {
      const headers = getHeaders();
      const res = await fetch(`/api/developer/promotions/${promoId}`, {
        method: "DELETE",
        headers,
      });
      if (res.ok) {
        showToast("Promotion deleted");
        loadPromotions();
      }
    } catch (e) {
      console.error(e);
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
    if (!q) return allUsers;
    return allUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone_number && u.phone_number.toLowerCase().includes(q)) ||
        (u.google_id && u.google_id.toLowerCase().includes(q)) ||
        (u.status && u.status.toLowerCase().includes(q)) ||
        (u.auth_provider && u.auth_provider.toLowerCase().includes(q))
    );
  }, [allUsers, searchQuery]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    onLogout();
  };

  if (error) {
    return (
      <div id="dev-error-screen" className="min-h-[100dvh] bg-[#050507] text-white grid place-items-center p-6">
        <div className="text-center max-w-md">
          <ShieldCheck className="mx-auto mb-4 text-rose-400" size={48} />
          <h1 className="text-2xl font-semibold">Developer Access Denied</h1>
          <p className="text-white/45 mt-2">
            Your account ({user.email}) is not authorized for developer monitoring console.
          </p>
          <button
            id="dev-error-back-btn"
            onClick={onExit}
            className="mt-6 px-6 py-3 rounded-2xl bg-white text-black font-medium hover:bg-white/90 transition-colors cursor-pointer"
          >
            Back to Siya
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id="developer-dashboard" className="min-h-[100dvh] bg-[#050507] text-white relative overflow-x-hidden p-4 md:p-8">
      {/* Background Ambience */}
      <div className="absolute -top-48 right-0 w-[500px] h-[500px] bg-violet-600/10 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute top-1/2 left-[-150px] w-[400px] h-[400px] bg-emerald-600/10 blur-[130px] rounded-full pointer-events-none" />

      {/* Floating Toast Notification */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-2xl border shadow-2xl backdrop-blur-xl flex items-center gap-3 text-sm font-medium ${
              toastMsg.type === "success"
                ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-200"
                : "bg-red-950/90 border-red-500/40 text-red-200"
            }`}
          >
            {toastMsg.type === "success" ? <CheckCircle2 size={18} className="text-emerald-400" /> : <AlertTriangle size={18} className="text-red-400" />}
            <span>{toastMsg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL 1: Moderation (Ban / Suspend / Reactivate) */}
      <AnimatePresence>
        {moderationModalUser && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#0d0d14] p-6 md:p-8 shadow-2xl space-y-5 text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 grid place-items-center">
                    <Ban size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">User Moderation Control</h3>
                    <p className="text-xs text-white/40">
                      Target: {moderationModalUser.name} ({moderationModalUser.email})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModerationModalUser(null)}
                  className="p-1 rounded-xl text-white/40 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block">Select Moderation Action</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setModerationAction("suspended")}
                      className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all ${
                        moderationAction === "suspended"
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                          : "bg-white/5 text-white/50 border-white/10"
                      }`}
                    >
                      Suspend Account
                    </button>
                    <button
                      type="button"
                      onClick={() => setModerationAction("banned")}
                      className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all ${
                        moderationAction === "banned"
                          ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                          : "bg-white/5 text-white/50 border-white/10"
                      }`}
                    >
                      Permanent Ban
                    </button>
                    <button
                      type="button"
                      onClick={() => setModerationAction("active")}
                      className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all ${
                        moderationAction === "active"
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          : "bg-white/5 text-white/50 border-white/10"
                      }`}
                    >
                      Reactivate Active
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-white/50 mb-1.5 block">Reason (Visible to user upon login attempt)</label>
                  <textarea
                    rows={3}
                    value={moderationReason}
                    onChange={(e) => setModerationReason(e.target.value)}
                    placeholder="e.g. Inappropriate behavior, automated bot activity, or violating platform guidelines..."
                    className="w-full rounded-xl bg-black/40 border border-white/10 p-3 text-xs outline-none focus:border-violet-400/60"
                  />
                </div>

                <div className="text-[11px] text-white/40 bg-white/5 p-3 rounded-xl">
                  ⚠️ Note: Suspending or banning immediately revokes all active session tokens for this user.
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModerationModalUser(null)}
                  className="px-4 py-2 rounded-xl text-xs text-white/60 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={submitModeration}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  {actionBusy ? "Updating…" : "Apply Moderation Action"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: Direct Message / Email */}
      <AnimatePresence>
        {messageModalUser !== null && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#0d0d14] p-6 md:p-8 shadow-2xl space-y-5 text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-sky-500/20 text-sky-400 grid place-items-center">
                    <Mail size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">
                      {messageModalUser?.id ? `Direct Message: ${messageModalUser.name}` : "Broadcast to ALL Users"}
                    </h3>
                    <p className="text-xs text-white/40">
                      {messageModalUser?.email || "Global in-app announcement & notification"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMessageModalUser(null)}
                  className="p-1 rounded-xl text-white/40 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="text-xs text-white/50 mb-1 block">Priority Level</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["normal", "important", "urgent"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setMessagePriority(p)}
                        className={`py-2 rounded-xl text-xs font-semibold capitalize border transition-all ${
                          messagePriority === p
                            ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                            : "bg-white/5 text-white/50 border-white/10"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-white/50 mb-1 block">Subject Line</label>
                  <input
                    value={messageSubject}
                    onChange={(e) => setMessageSubject(e.target.value)}
                    placeholder="e.g. Important update regarding your Siya voice assistant account"
                    className="w-full h-11 rounded-xl bg-black/40 border border-white/10 px-3.5 text-xs outline-none focus:border-violet-400/60"
                  />
                </div>

                <div>
                  <label className="text-xs text-white/50 mb-1 block">Message Content</label>
                  <textarea
                    rows={4}
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    placeholder="Write message directly from developer Shivam Yadav to user..."
                    className="w-full rounded-xl bg-black/40 border border-white/10 p-3 text-xs outline-none focus:border-violet-400/60"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMessageModalUser(null)}
                  className="px-4 py-2 rounded-xl text-xs text-white/60 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={submitMessage}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 text-white font-semibold text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-sky-500/20"
                >
                  <Send size={14} />
                  <span>{actionBusy ? "Sending…" : "Dispatch Message"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: Password Tool (Verify & Reset) */}
      <AnimatePresence>
        {passwordModalUser && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#0d0d14] p-6 md:p-8 shadow-2xl space-y-5 text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-violet-500/20 text-violet-400 grid place-items-center">
                    <KeyRound size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Password Management Tool</h3>
                    <p className="text-xs text-white/40">
                      User: {passwordModalUser.name} ({passwordModalUser.email})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPasswordModalUser(null);
                    setTestPasswordResult(null);
                    setTestPasswordInput("");
                    setCustomPasswordInput("");
                  }}
                  className="p-1 rounded-xl text-white/40 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Section 1: Verify Password */}
              <div className="p-4 rounded-2xl bg-white/[.03] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white/80">Option 1: Test / Verify Password</span>
                  <span className="text-[10px] text-white/40">Check without altering</span>
                </div>
                <div className="flex gap-2">
                  <input
                    value={testPasswordInput}
                    onChange={(e) => setTestPasswordInput(e.target.value)}
                    placeholder="Enter password to test against user hash..."
                    className="flex-1 h-10 rounded-xl bg-black/40 border border-white/10 px-3 text-xs outline-none focus:border-violet-400/60"
                  />
                  <button
                    type="button"
                    disabled={actionBusy || !testPasswordInput}
                    onClick={handleTestPassword}
                    className="px-4 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold cursor-pointer disabled:opacity-40"
                  >
                    Test
                  </button>
                </div>
                {testPasswordResult && (
                  <div className="text-xs p-2.5 rounded-xl bg-white/5 border border-white/10 font-mono">
                    {testPasswordResult}
                  </div>
                )}
              </div>

              {/* Section 2: Reset Password */}
              <div className="p-4 rounded-2xl bg-white/[.03] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white/80">Option 2: Direct Reset Password</span>
                  <span className="text-[10px] text-violet-300">Generates instant credentials</span>
                </div>
                <div>
                  <input
                    value={customPasswordInput}
                    onChange={(e) => setCustomPasswordInput(e.target.value)}
                    placeholder="Leave empty to auto-generate (e.g. Siya@829140) or specify custom..."
                    className="w-full h-10 rounded-xl bg-black/40 border border-white/10 px-3 text-xs outline-none focus:border-violet-400/60"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={handleResetPassword}
                    className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold cursor-pointer"
                  >
                    Reset & Generate New Password
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setPasswordModalUser(null)}
                  className="px-4 py-2 rounded-xl text-xs text-white/50 hover:text-white"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 4: Create Promotion / Ad */}
      <AnimatePresence>
        {promoModalOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#0d0d14] p-6 md:p-8 shadow-2xl space-y-4 text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-pink-500/20 text-pink-400 grid place-items-center">
                    <Megaphone size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Broadcast Promotion / Sponsored Ad</h3>
                    <p className="text-xs text-white/40">Displayed in assistant banner for all users</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPromoModalOpen(false)}
                  className="p-1 rounded-xl text-white/40 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-white/50 mb-1 block">Badge Tag</label>
                    <input
                      value={promoBadge}
                      onChange={(e) => setPromoBadge(e.target.value)}
                      placeholder="e.g. SPECIAL OFFER"
                      className="w-full h-10 rounded-xl bg-black/40 border border-white/10 px-3 text-xs outline-none focus:border-violet-400/60"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 mb-1 block">Promo Code (Optional)</label>
                    <input
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      placeholder="e.g. SHIVAMPRO"
                      className="w-full h-10 rounded-xl bg-black/40 border border-white/10 px-3 text-xs outline-none focus:border-violet-400/60 font-mono uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-white/50 mb-1 block">Campaign Title</label>
                  <input
                    value={promoTitle}
                    onChange={(e) => setPromoTitle(e.target.value)}
                    placeholder="e.g. 🚀 Get Siya Pro with Shivam's VIP discount"
                    className="w-full h-10 rounded-xl bg-black/40 border border-white/10 px-3 text-xs outline-none focus:border-violet-400/60"
                  />
                </div>

                <div>
                  <label className="text-xs text-white/50 mb-1 block">Description</label>
                  <textarea
                    rows={3}
                    value={promoDesc}
                    onChange={(e) => setPromoDesc(e.target.value)}
                    placeholder="Short engaging description for user banner..."
                    className="w-full rounded-xl bg-black/40 border border-white/10 p-3 text-xs outline-none focus:border-violet-400/60"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-white/50 mb-1 block">Button Text</label>
                    <input
                      value={promoCta}
                      onChange={(e) => setPromoCta(e.target.value)}
                      placeholder="e.g. Upgrade Now"
                      className="w-full h-10 rounded-xl bg-black/40 border border-white/10 px-3 text-xs outline-none focus:border-violet-400/60"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 mb-1 block">Link URL (Optional)</label>
                    <input
                      value={promoLink}
                      onChange={(e) => setPromoLink(e.target.value)}
                      placeholder="https://..."
                      className="w-full h-10 rounded-xl bg-black/40 border border-white/10 px-3 text-xs outline-none focus:border-violet-400/60"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPromoModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-white/60 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={submitCreatePromotion}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-violet-500 text-white font-semibold text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-pink-500/20"
                >
                  <Megaphone size={14} />
                  <span>{actionBusy ? "Publishing…" : "Publish Promotion"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Modal: Reject Subscription Request */}
        {rejectModalReq && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#121218] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl relative"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-rose-500/20 text-rose-300 flex items-center justify-center">
                    <AlertTriangle size={16} />
                  </div>
                  <h3 className="text-base font-semibold text-white">Reject Upgrade Request</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setRejectModalReq(null)}
                  className="p-1 rounded-full text-white/40 hover:text-white hover:bg-white/10"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="py-4 space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <p className="text-white/80">User: <strong className="text-white">{rejectModalReq.user_name}</strong> ({rejectModalReq.user_email})</p>
                  <p className="text-white/80">Requested: <strong className="text-amber-300">{rejectModalReq.plan_name}</strong> (₹{rejectModalReq.amount})</p>
                  <p className="text-white/80">UTR: <span className="font-mono text-white/60">{rejectModalReq.utr_number || "Not provided"}</span></p>
                </div>

                <div>
                  <label className="text-white/60 block mb-1">Reason for Rejection</label>
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g., UTR reference not found in bank statement"
                    className="w-full h-10 px-3 rounded-xl bg-black/50 border border-white/10 text-xs text-white outline-none focus:border-rose-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectModalReq(null)}
                  className="px-4 py-2 rounded-xl text-xs text-white/60 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={subActionBusy === rejectModalReq.id}
                  onClick={handleRejectSubscription}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-600/30"
                >
                  <Ban size={14} />
                  <span>{subActionBusy === rejectModalReq.id ? "Rejecting..." : "Confirm Rejection"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Top Header */}
      <header id="dev-header" className="relative flex flex-col md:flex-row md:items-center justify-between max-w-7xl mx-auto mb-8 gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold tracking-wide">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              LEAD DEVELOPER CONSOLE
            </span>
            <span className="text-xs text-white/40">
              Auto-sync: {lastUpdated.toLocaleTimeString()}
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold mt-2 tracking-tight">
            Developer Command Center
          </h1>
          <p className="text-white/40 text-sm mt-1">
            Super-Admin control, user moderation, Pro version management & marketing · Architect:{" "}
            <span className="text-violet-300 font-semibold">{user.name} ({user.email})</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="dev-broadcast-header-btn"
            onClick={() => setMessageModalUser({ id: 0, name: "All Users", email: "broadcast" })}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-violet-500/40 bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 text-xs font-semibold transition-all cursor-pointer shadow-lg shadow-violet-500/15"
          >
            <Bell size={15} />
            <span>Broadcast Alert</span>
          </button>
          <button
            id="dev-refresh-btn"
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh feed"
          >
            <RefreshCw size={15} className={isRefreshing ? "animate-spin text-emerald-400" : "text-white/70"} />
            <span>Refresh</span>
          </button>
          <button
            id="dev-back-btn"
            onClick={onExit}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium transition-colors cursor-pointer"
          >
            <ArrowLeft size={15} />
            <span>Assistant</span>
          </button>
          <button
            id="dev-logout-btn"
            onClick={logout}
            className="p-2.5 rounded-2xl border border-white/10 bg-white/5 hover:bg-rose-500/15 hover:text-rose-400 transition-colors cursor-pointer"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="relative max-w-7xl mx-auto space-y-6">
        {/* Metric Cards Row */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3.5">
          <div className="rounded-3xl border border-white/10 bg-white/[.03] p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between text-white/40 text-[11px] font-medium uppercase tracking-wider">
              <span>Users</span>
              <Users size={16} className="text-violet-400" />
            </div>
            <div className="text-2xl font-bold mt-1 text-white">{stats.totalUsers}</div>
            <div className="text-[11px] text-violet-400/80 mt-0.5">Total registered</div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[.03] p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between text-white/40 text-[11px] font-medium uppercase tracking-wider">
              <span>Pro Users</span>
              <Star size={16} className="text-amber-400" />
            </div>
            <div className="text-2xl font-bold mt-1 text-amber-300">{stats.totalPro || 0}</div>
            <div className="text-[11px] text-amber-400/80 mt-0.5">VIP Tier</div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[.03] p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between text-white/40 text-[11px] font-medium uppercase tracking-wider">
              <span>Sessions</span>
              <Activity size={16} className="text-emerald-400" />
            </div>
            <div className="text-2xl font-bold mt-1 text-white">{stats.activeSessions}</div>
            <div className="text-[11px] text-emerald-400/80 mt-0.5">Live tokens</div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[.03] p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between text-white/40 text-[11px] font-medium uppercase tracking-wider">
              <span>Signups</span>
              <UserPlus size={16} className="text-emerald-400" />
            </div>
            <div className="text-2xl font-bold mt-1 text-white">{stats.totalSignups}</div>
            <div className="text-[11px] text-emerald-400/80 mt-0.5">Accounts created</div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[.03] p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between text-white/40 text-[11px] font-medium uppercase tracking-wider">
              <span>Logins</span>
              <LogIn size={16} className="text-sky-400" />
            </div>
            <div className="text-2xl font-bold mt-1 text-white">{stats.totalLogins}</div>
            <div className="text-[11px] text-sky-400/80 mt-0.5">Successful auth</div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[.03] p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between text-white/40 text-[11px] font-medium uppercase tracking-wider">
              <span>Moderated</span>
              <ShieldAlert size={16} className="text-rose-400" />
            </div>
            <div className="text-2xl font-bold mt-1 text-rose-300">{stats.totalBanned || 0}</div>
            <div className="text-[11px] text-rose-400/80 mt-0.5">Suspended accounts</div>
          </div>
        </div>

        {/* Tab Controls & Search Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div id="dev-tab-group" className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-white/[.06] border border-white/10 w-fit">
            <button
              id="dev-tab-users"
              onClick={() => setTab("users")}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                tab === "users" ? "bg-white text-black shadow-lg" : "text-white/60 hover:text-white"
              }`}
            >
              User Management ({allUsers.length})
            </button>
            <button
              id="dev-tab-subscriptions"
              onClick={() => {
                setTab("subscriptions");
                loadSubscriptions();
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                tab === "subscriptions" ? "bg-white text-black shadow-lg" : "text-white/60 hover:text-white"
              }`}
            >
              <Crown size={14} className={tab === "subscriptions" ? "text-amber-500" : "text-amber-400"} />
              <span>Upgrade Orders</span>
              {subscriptionRequests.filter((r) => r.status === "pending").length > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-extrabold animate-pulse">
                  {subscriptionRequests.filter((r) => r.status === "pending").length} PENDING
                </span>
              ) : (
                <span className="text-[10px] opacity-60">({subscriptionRequests.length})</span>
              )}
            </button>
            <button
              id="dev-tab-activity"
              onClick={() => setTab("activity")}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                tab === "activity" ? "bg-white text-black shadow-lg" : "text-white/60 hover:text-white"
              }`}
            >
              Activity Feed ({logs.length})
            </button>
            <button
              id="dev-tab-email-alerts"
              onClick={() => {
                setTab("email_alerts");
                loadDevMessages();
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                tab === "email_alerts" ? "bg-white text-black shadow-lg" : "text-white/60 hover:text-white"
              }`}
            >
              <Mail size={14} className={tab === "email_alerts" ? "text-violet-600" : "text-violet-400"} />
              <span>Google & Login Alerts</span>
              {devMessages.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-violet-500 text-white text-[10px] font-bold">
                  {devMessages.length}
                </span>
              )}
            </button>
            <button
              id="dev-tab-security"
              onClick={() => setTab("security")}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                tab === "security" ? "bg-white text-black shadow-lg" : "text-white/60 hover:text-white"
              }`}
            >
              Security & Passwords
            </button>
            <button
              id="dev-tab-promotions"
              onClick={() => setTab("promotions")}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                tab === "promotions" ? "bg-white text-black shadow-lg" : "text-white/60 hover:text-white"
              }`}
            >
              Ads & Promotions ({promotions.length})
            </button>
            <button
              id="dev-tab-overview"
              onClick={() => setTab("overview")}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                tab === "overview" ? "bg-white text-black shadow-lg" : "text-white/60 hover:text-white"
              }`}
            >
              Overview
            </button>
            <button
              id="dev-tab-portfolio"
              onClick={() => setTab("portfolio")}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                tab === "portfolio" ? "bg-white text-black shadow-lg" : "text-white/60 hover:text-white"
              }`}
            >
              Portfolio & Creator
            </button>
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-72">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              id="dev-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search user, email, status..."
              className="w-full h-10 pl-9 pr-4 rounded-xl bg-white/[.05] border border-white/10 text-xs outline-none focus:border-violet-400/60 placeholder:text-white/30"
            />
          </div>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: User Management & Moderation */}
        {/* ========================================================= */}
        {tab === "users" && (
          <section id="dev-users-panel" className="rounded-3xl border border-white/10 bg-white/[.03] overflow-hidden backdrop-blur-xl">
            <div className="p-5 md:p-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Users size={18} className="text-violet-400" />
                  Registered User Accounts & Full Control
                </h2>
                <p className="text-xs text-white/40 mt-0.5">
                  View full credentials, grant Pro privileges, moderate/ban accounts, test/reset passwords, and message users
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMessageModalUser({ id: 0, name: "All Users", email: "broadcast" })}
                  className="px-3.5 py-1.5 rounded-xl bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-semibold flex items-center gap-1.5 hover:bg-sky-500/30 cursor-pointer"
                >
                  <Send size={13} />
                  <span>Message All Users</span>
                </button>
                <span className="text-xs text-white/40 font-mono">
                  {filteredUsers.length} accounts
                </span>
              </div>
            </div>

            <div className="divide-y divide-white/5">
              {filteredUsers.length === 0 ? (
                <div className="p-12 text-center text-white/40 text-sm">
                  No users found matching query.
                </div>
              ) : (
                filteredUsers.map((u: any) => {
                  const isSuspended = u.status === "suspended" || u.status === "banned";
                  return (
                    <div
                      key={u.id}
                      className="p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4 hover:bg-white/[.02] transition-colors"
                    >
                      {/* User Info Column */}
                      <div className="flex items-start gap-3.5">
                        <div
                          className={`w-11 h-11 rounded-2xl grid place-items-center text-sm font-bold shrink-0 ${
                            u.is_pro
                              ? "bg-gradient-to-br from-amber-500 to-pink-500 text-black shadow-lg shadow-amber-500/20"
                              : isSuspended
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                              : "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                          }`}
                        >
                          {u.name.slice(0, 1).toUpperCase()}
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-white text-sm">{u.name}</span>
                            <span className="text-[10px] text-white/40 font-mono">#ID:{u.id}</span>

                            {/* Pro Badge */}
                            {u.is_pro ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold">
                                <Star size={10} className="fill-amber-400 text-amber-400" />
                                PRO VIP
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/40 text-[10px]">
                                Free Tier
                              </span>
                            )}

                            {/* Status Badge */}
                            {u.status === "active" ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-medium">
                                Active
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-bold">
                                {u.status?.toUpperCase() || "BLOCKED"}
                              </span>
                            )}

                            {/* Provider Badge */}
                            <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50 text-[10px] capitalize">
                              via {u.auth_provider || "email"}
                            </span>

                            {/* Phone Number Badge if present */}
                            {u.phone_number && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono flex items-center gap-1">
                                📞 {u.phone_number}
                              </span>
                            )}

                            {/* Google ID if present */}
                            {u.google_id && (
                              <span className="px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[10px] font-mono">
                                G-ID: {String(u.google_id).slice(0, 14)}
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-white/60 mt-1 flex items-center gap-3 flex-wrap">
                            <span className="text-white/80 font-mono">{u.email}</span>
                            {u.phone_number && (
                              <>
                                <span className="text-white/30">·</span>
                                <span className="text-emerald-400 font-mono">Mobile: {u.phone_number}</span>
                              </>
                            )}
                            <span className="text-white/30">·</span>
                            <span>Joined: {formatDateTime(u.created_at)}</span>
                            {u.last_login_at && (
                              <>
                                <span className="text-white/30">·</span>
                                <span className="text-emerald-400/80">Active: {timeAgo(u.last_login_at)}</span>
                              </>
                            )}
                          </div>

                          {isSuspended && u.suspend_reason && (
                            <div className="text-xs text-rose-300/90 bg-rose-500/10 px-2.5 py-1 rounded-lg mt-1.5 border border-rose-500/20">
                              Reason for moderation: {u.suspend_reason}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Developer Action Buttons */}
                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        {/* Tier Quick Switcher */}
                        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-2.5 py-1 text-xs">
                          <Crown size={13} className="text-amber-400 shrink-0" />
                          <select
                            value={u.tier || (u.is_pro ? "pro" : "free")}
                            onChange={(e) => handleSetUserTier(u.id, e.target.value)}
                            className="bg-transparent text-white text-xs font-medium outline-none cursor-pointer"
                            title="Instant Tier assignment"
                          >
                            <option value="free" className="bg-[#181824] text-zinc-300">Free (Assistant)</option>
                            <option value="pro" className="bg-[#181824] text-purple-300">Pro ₹5 (Sassy)</option>
                            <option value="pro_max" className="bg-[#181824] text-pink-300">Pro Max ₹10 (Waifu)</option>
                            <option value="ultra" className="bg-[#181824] text-rose-300">Ultra ₹15 (Girlfriend)</option>
                          </select>
                        </div>

                        {/* Pro Button */}
                        <button
                          type="button"
                          onClick={() => handleTogglePro(u)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                            u.is_pro
                              ? "bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25"
                              : "bg-white/5 text-white/70 border-white/10 hover:border-amber-500/30 hover:text-amber-300"
                          }`}
                          title={u.is_pro ? "Revoke Pro Version" : "Grant Pro Version"}
                        >
                          <Star size={13} className={u.is_pro ? "fill-amber-400 text-amber-400" : ""} />
                          <span>{u.is_pro ? "Pro Granted" : "Give Pro"}</span>
                        </button>

                        {/* Direct Message */}
                        <button
                          type="button"
                          onClick={() => setMessageModalUser(u)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/25 flex items-center gap-1.5 transition-all cursor-pointer"
                          title="Message this user"
                        >
                          <MessageSquare size={13} />
                          <span>Message</span>
                        </button>

                        {/* Password Management */}
                        <button
                          type="button"
                          onClick={() => setPasswordModalUser(u)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-500/25 flex items-center gap-1.5 transition-all cursor-pointer"
                          title="Verify or Reset Password"
                        >
                          <KeyRound size={13} />
                          <span>Password Tool</span>
                        </button>

                        {/* Moderate / Ban */}
                        <button
                          type="button"
                          onClick={() => {
                            setModerationModalUser(u);
                            setModerationAction(isSuspended ? "active" : "suspended");
                            setModerationReason(u.suspend_reason || "");
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all cursor-pointer ${
                            isSuspended
                              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
                              : "bg-rose-500/10 text-rose-300 border-rose-500/20 hover:bg-rose-500/20"
                          }`}
                        >
                          <Ban size={13} />
                          <span>{isSuspended ? "Reactivate" : "Ban / Suspend"}</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* ========================================================= */}
        {/* TAB: Upgrade Orders & Approvals */}
        {/* ========================================================= */}
        {tab === "subscriptions" && (
          <div id="dev-subscriptions-panel" className="space-y-6">
            {/* Top metrics & Payment setup */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-3xl border border-white/10 bg-white/[.03] p-4 backdrop-blur-xl">
                <div className="flex items-center justify-between text-white/40 text-[11px] font-medium uppercase tracking-wider">
                  <span>Total Revenue</span>
                  <Crown size={16} className="text-amber-400" />
                </div>
                <div className="text-2xl font-bold mt-1 text-emerald-400">
                  ₹{subscriptionRequests.filter((r) => r.status === "approved").reduce((acc, r) => acc + (Number(r.amount) || 0), 0)}
                </div>
                <div className="text-[11px] text-white/40 mt-0.5">Micro-payment earnings</div>
              </div>

              <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-4 backdrop-blur-xl">
                <div className="flex items-center justify-between text-amber-300/80 text-[11px] font-medium uppercase tracking-wider">
                  <span>Pending Orders</span>
                  <Clock size={16} className="text-amber-400" />
                </div>
                <div className="text-2xl font-bold mt-1 text-amber-300">
                  {subscriptionRequests.filter((r) => r.status === "pending").length}
                </div>
                <div className="text-[11px] text-amber-300/70 mt-0.5">Awaiting manual check</div>
              </div>

              <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-4 backdrop-blur-xl">
                <div className="flex items-center justify-between text-emerald-300/80 text-[11px] font-medium uppercase tracking-wider">
                  <span>Active Upgrades</span>
                  <CheckCircle2 size={16} className="text-emerald-400" />
                </div>
                <div className="text-2xl font-bold mt-1 text-emerald-300">
                  {subscriptionRequests.filter((r) => r.status === "approved").length}
                </div>
                <div className="text-[11px] text-emerald-300/70 mt-0.5">Unlocked user personas</div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[.03] p-4 backdrop-blur-xl">
                <div className="flex items-center justify-between text-white/40 text-[11px] font-medium uppercase tracking-wider">
                  <span>Active Plans</span>
                  <Sparkles size={16} className="text-violet-400" />
                </div>
                <div className="text-sm font-semibold mt-1 text-white">
                  Pro (₹5) · Max (₹10) · Ultra (₹15)
                </div>
                <div className="text-[11px] text-white/40 mt-0.5">Sassy · Waifu · Girlfriend</div>
              </div>
            </div>

            {/* Developer Payment Configuration Card */}
            <div className="rounded-3xl border border-white/10 bg-white/[.03] p-5 backdrop-blur-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <QrCode size={16} className="text-violet-400" />
                    Receiving Payment & WhatsApp Dispatch Details
                  </h3>
                  <p className="text-xs text-white/40 mt-0.5">
                    When users select a paid plan on login or click upgrade, payment instructions and their details are dispatched directly to your WhatsApp.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSavePaymentSettings} className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
                <div>
                  <label className="text-xs text-white/50 mb-1 block">Developer WhatsApp (with country code)</label>
                  <input
                    type="text"
                    value={paymentSettings.whatsapp}
                    onChange={(e) => setPaymentSettings({ ...paymentSettings, whatsapp: e.target.value })}
                    placeholder="+919876543210"
                    className="w-full h-10 rounded-xl bg-black/40 border border-white/10 px-3 text-xs text-white outline-none focus:border-violet-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1 block">Developer UPI ID (VPA)</label>
                  <input
                    type="text"
                    value={paymentSettings.upiId}
                    onChange={(e) => setPaymentSettings({ ...paymentSettings, upiId: e.target.value })}
                    placeholder="shivu12745114@okaxis"
                    className="w-full h-10 rounded-xl bg-black/40 border border-white/10 px-3 text-xs text-white outline-none focus:border-violet-400"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={actionBusy}
                    className="w-full h-10 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-violet-600/20"
                  >
                    <Check size={14} />
                    <span>{actionBusy ? "Saving..." : "Save Payment Details"}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Upgrade Requests Table */}
            <div className="rounded-3xl border border-white/10 bg-white/[.03] overflow-hidden backdrop-blur-xl">
              <div className="p-5 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-white/40 uppercase tracking-wider font-semibold mr-1">Status:</span>
                  {(["all", "pending", "approved", "rejected"] as const).map((filterVal) => {
                    const count =
                      filterVal === "all"
                        ? subscriptionRequests.length
                        : subscriptionRequests.filter((r) => r.status === filterVal).length;
                    return (
                      <button
                        key={filterVal}
                        type="button"
                        onClick={() => setSubFilter(filterVal)}
                        className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors cursor-pointer ${
                          subFilter === filterVal
                            ? "bg-white text-black font-semibold"
                            : "bg-white/5 text-white/60 hover:text-white"
                        }`}
                      >
                        {filterVal} ({count})
                      </button>
                    );
                  })}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    value={subSearch}
                    onChange={(e) => setSubSearch(e.target.value)}
                    placeholder="Search name, plan, UTR..."
                    className="w-full h-9 pl-9 pr-3 rounded-xl bg-white/[.05] border border-white/10 text-xs text-white outline-none focus:border-violet-400 placeholder:text-white/30"
                  />
                </div>
              </div>

              <div className="divide-y divide-white/5">
                {subscriptionRequests
                  .filter((req) => {
                    if (subFilter !== "all" && req.status !== subFilter) return false;
                    if (subSearch.trim()) {
                      const q = subSearch.toLowerCase();
                      const matchName = req.user_name?.toLowerCase().includes(q);
                      const matchEmail = req.user_email?.toLowerCase().includes(q);
                      const matchPlan = req.plan_name?.toLowerCase().includes(q);
                      const matchUtr = req.utr_number?.toLowerCase().includes(q);
                      return matchName || matchEmail || matchPlan || matchUtr;
                    }
                    return true;
                  })
                  .map((req) => {
                    const isPending = req.status === "pending";
                    const isApproved = req.status === "approved";
                    const isRejected = req.status === "rejected";

                    return (
                      <div key={req.id} className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[.02] transition-colors">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                            req.plan_id === "ultra"
                              ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                              : req.plan_id === "pro_max"
                              ? "bg-pink-500/10 border-pink-500/30 text-pink-300"
                              : "bg-violet-500/10 border-violet-500/30 text-violet-300"
                          }`}>
                            <Crown size={18} />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-white">{req.user_name}</span>
                              <span className="text-[11px] text-white/40">({req.user_email})</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase border ${
                                req.plan_id === "ultra"
                                  ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                                  : req.plan_id === "pro_max"
                                  ? "bg-pink-500/20 text-pink-300 border-pink-500/30"
                                  : "bg-violet-500/20 text-violet-300 border-violet-500/30"
                              }`}>
                                {req.plan_name} (₹{req.amount})
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-white/70 border border-white/10">
                                Mode: {req.mode_unlocked || "Unlocked"}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 mt-1.5 text-xs text-white/50 flex-wrap">
                              <span>UTR / Ref: <strong className="font-mono text-white/90">{req.utr_number || "Awaiting submission"}</strong></span>
                              {req.utr_number && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(req.utr_number);
                                    showToast("UTR copied to clipboard!", "success");
                                  }}
                                  className="text-white/40 hover:text-white transition-colors cursor-pointer"
                                  title="Copy UTR"
                                >
                                  <Copy size={12} />
                                </button>
                              )}
                              <span>•</span>
                              <span>{timeAgo(req.created_at)}</span>
                              <span>•</span>
                              <span className="text-white/30">{formatDateTime(req.created_at)}</span>
                            </div>

                            {req.rejection_reason && (
                              <div className="mt-1.5 text-xs text-rose-300/90 bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20">
                                Rejection note: {req.rejection_reason}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Status & Action Buttons */}
                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                          {isPending && (
                            <>
                              <button
                                type="button"
                                disabled={subActionBusy === req.id}
                                onClick={() => handleApproveSubscription(req)}
                                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-all shadow-lg shadow-emerald-600/20 cursor-pointer"
                              >
                                <Check size={14} />
                                <span>{subActionBusy === req.id ? "Approving..." : `Approve & Unlock ${req.mode_unlocked}`}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setRejectModalReq(req);
                                  setRejectReason("");
                                }}
                                className="px-3 py-2 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 flex items-center gap-1 transition-all cursor-pointer"
                              >
                                <X size={14} />
                                <span>Reject</span>
                              </button>
                            </>
                          )}

                          {isApproved && (
                            <div className="flex items-center gap-2">
                              <span className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                                <CheckCircle2 size={14} className="text-emerald-400" />
                                <span>Approved & Active</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleSetUserTier(req.user_id, "free")}
                                className="px-2.5 py-1.5 rounded-xl text-[11px] text-white/40 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all cursor-pointer"
                                title="Downgrade to Free"
                              >
                                Revoke
                              </button>
                            </div>
                          )}

                          {isRejected && (
                            <span className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/20 flex items-center gap-1.5">
                              <Ban size={14} />
                              <span>Rejected</span>
                            </span>
                          )}

                          {/* WhatsApp Chat link */}
                          <a
                            href={`https://wa.me/${(paymentSettings.whatsapp || "").replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Hi Shivam, regarding Siya AI subscription for user ${req.user_name} (${req.user_email}) plan ${req.plan_name} ₹${req.amount}, UTR: ${req.utr_number || "none"}`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-2 rounded-xl text-xs font-medium bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#25D366] border border-[#25D366]/30 flex items-center gap-1.5 transition-all cursor-pointer"
                            title="Open WhatsApp"
                          >
                            <MessageCircle size={14} />
                            <span>WhatsApp</span>
                          </a>
                        </div>
                      </div>
                    );
                  })}

                {subscriptionRequests.length === 0 && (
                  <div className="p-12 text-center text-white/40 text-xs">
                    <Crown size={32} className="mx-auto mb-2 opacity-30 text-amber-400" />
                    <p className="text-sm font-medium text-white/60">No upgrade orders submitted yet</p>
                    <p className="mt-1">When users choose Pro, Pro Max, or Ultra, their orders and UTR will appear here for one-click approval.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: Live Activity Feed */}
        {/* ========================================================= */}
        {tab === "activity" && (
          <div id="dev-activity-panel" className="space-y-4">
            {/* Filter pills */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40 uppercase tracking-wider font-semibold mr-1">Filter:</span>
              <button
                id="filter-all-btn"
                onClick={() => setFilterType("all")}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  filterType === "all"
                    ? "bg-white/20 text-white border border-white/30"
                    : "bg-white/5 text-white/50 border border-white/10 hover:text-white"
                }`}
              >
                All Events
              </button>
              <button
                id="filter-signup-btn"
                onClick={() => setFilterType("signup")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  filterType === "signup"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-white/5 text-white/50 border border-white/10 hover:text-white"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Signups only
              </button>
              <button
                id="filter-login-btn"
                onClick={() => setFilterType("login")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  filterType === "login"
                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                    : "bg-white/5 text-white/50 border border-white/10 hover:text-white"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                Logins only
              </button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[.03] backdrop-blur-xl overflow-hidden divide-y divide-white/5">
              <div className="p-5 flex items-center justify-between bg-white/[.02]">
                <div className="flex items-center gap-2">
                  <Activity size={18} className="text-violet-400" />
                  <h2 className="font-semibold text-base">Live Activity Log</h2>
                </div>
                <span className="text-xs text-white/40">Showing {filteredLogs.length} events</span>
              </div>

              {loading ? (
                <div className="p-12 text-center text-white/40 text-sm">Loading activity stream…</div>
              ) : filteredLogs.length === 0 ? (
                <div className="p-12 text-center text-white/40 text-sm">No activity found matching your criteria.</div>
              ) : (
                <AnimatePresence initial={false}>
                  {filteredLogs.map((log) => {
                    const isSignup = log.event === "signup";
                    return (
                      <motion.div
                        id={`auth-log-${log.id}`}
                        key={log.id}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-white/[.02] transition-colors"
                      >
                        <div className="flex items-start md:items-center gap-3.5">
                          <div
                            className={`w-10 h-10 rounded-2xl grid place-items-center shrink-0 ${
                              isSignup
                                ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                                : "bg-sky-500/15 border border-sky-500/30 text-sky-400"
                            }`}
                          >
                            {isSignup ? <UserPlus size={18} /> : <LogIn size={18} />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white text-sm">{log.name}</span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                                  isSignup
                                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                    : "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                                }`}
                              >
                                {log.event}
                              </span>
                            </div>
                            <div className="text-xs text-white/45 mt-0.5">{log.email}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-white/40">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] bg-white/5 px-2.5 py-1 rounded-lg">
                            <Globe size={13} className="text-white/30" />
                            <span>{log.ip || "Direct"}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock size={13} className="text-white/30" />
                            <span>{timeAgo(log.created_at)}</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: Security & Passwords */}
        {/* ========================================================= */}
        {tab === "security" && (
          <div className="space-y-6">
            {/* Password Reset Requests Section */}
            <section className="rounded-3xl border border-white/10 bg-white/[.03] overflow-hidden backdrop-blur-xl">
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <KeyRound size={18} className="text-violet-400" />
                    Password Reset History & 6-Digit OTP Logs
                  </h2>
                  <p className="text-xs text-white/40 mt-0.5">
                    View active and historical verification codes generated when users click &apos;Forgot Password&apos;
                  </p>
                </div>
                <span className="text-xs text-white/40 font-mono">{resetRecords.length} requests</span>
              </div>

              <div className="divide-y divide-white/5">
                {resetRecords.length === 0 ? (
                  <div className="p-8 text-center text-white/40 text-sm">
                    No password reset requests recorded yet.
                  </div>
                ) : (
                  resetRecords.map((r) => (
                    <div key={r.id} className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">{r.email}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              r.status === "used"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                : Date.now() > r.expires_at
                                ? "bg-white/5 text-white/30"
                                : "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                            }`}
                          >
                            {Date.now() > r.expires_at && r.status === "pending" ? "EXPIRED" : r.status}
                          </span>
                        </div>
                        <div className="text-xs text-white/40 mt-1 flex items-center gap-2">
                          <span>Requested {timeAgo(r.created_at)}</span>
                          <span>·</span>
                          <span>IP: {r.ip || "Direct"}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 font-mono text-sm tracking-widest text-violet-300 font-bold">
                          Code: {r.reset_code}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Security Events Audit Log */}
            <section className="rounded-3xl border border-white/10 bg-white/[.03] overflow-hidden backdrop-blur-xl">
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <ShieldCheck size={18} className="text-emerald-400" />
                    Security & Moderation Audit Trail
                  </h2>
                  <p className="text-xs text-white/40 mt-0.5">
                    Track password updates, failed logins, suspensions, and Pro tier upgrades
                  </p>
                </div>
                <span className="text-xs text-white/40 font-mono">{securityEvents.length} events</span>
              </div>

              <div className="divide-y divide-white/5">
                {securityEvents.length === 0 ? (
                  <div className="p-8 text-center text-white/40 text-sm">
                    No security events recorded.
                  </div>
                ) : (
                  securityEvents.map((ev) => (
                    <div key={ev.id} className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-white/5 grid place-items-center text-white/70">
                          <ShieldCheck size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-white">{ev.name}</span>
                            <span className="text-xs text-white/40">({ev.email})</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-white/5 border border-white/10 text-white/70">
                              {ev.event}
                            </span>
                          </div>
                          <div className="text-xs text-white/50 mt-0.5">{ev.ip}</div>
                        </div>
                      </div>
                      <div className="text-xs text-white/40 font-mono">{timeAgo(ev.created_at)}</div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: Ads & Promotions Hub */}
        {/* ========================================================= */}
        {tab === "promotions" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-6 rounded-3xl border border-white/10 bg-white/[.03] backdrop-blur-xl">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Megaphone size={18} className="text-pink-400" />
                  Ads, Sponsorships & Campaign Broadcast
                </h2>
                <p className="text-xs text-white/40 mt-0.5">
                  Launch interactive promotional banners directly inside the Siya voice workspace for all users
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPromoModalOpen(true)}
                className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-pink-500 to-violet-500 text-white font-semibold text-xs flex items-center gap-2 hover:opacity-95 cursor-pointer shadow-lg shadow-pink-500/20"
              >
                <Plus size={16} />
                <span>Create New Promotion / Ad</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {promotions.length === 0 ? (
                <div className="col-span-2 p-12 text-center text-white/40 text-sm rounded-3xl border border-white/10 bg-white/[.02]">
                  No active promotions. Click &apos;Create New Promotion&apos; to publish an announcement or advertisement.
                </div>
              ) : (
                promotions.map((p) => (
                  <div
                    key={p.id}
                    className={`p-6 rounded-3xl border transition-all ${
                      p.is_active
                        ? "border-pink-500/30 bg-gradient-to-br from-pink-950/20 to-violet-950/20 backdrop-blur-xl"
                        : "border-white/10 bg-white/[.02] opacity-60"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-pink-500/20 border border-pink-500/40 text-pink-300">
                        {p.badge}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleTogglePromo(p.id)}
                          className={`px-3 py-1 rounded-xl text-xs font-semibold cursor-pointer border ${
                            p.is_active
                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                              : "bg-white/10 text-white/50 border-white/10"
                          }`}
                        >
                          {p.is_active ? "Live / Active" : "Paused"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePromo(p.id)}
                          className="p-1.5 rounded-xl text-white/40 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <h3 className="font-bold text-white text-base">{p.title}</h3>
                    <p className="text-xs text-white/60 mt-1 leading-relaxed">{p.description}</p>

                    <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                      {p.promo_code ? (
                        <div className="text-xs font-mono bg-white/10 px-2.5 py-1 rounded-lg text-violet-300">
                          CODE: {p.promo_code}
                        </div>
                      ) : (
                        <div />
                      )}
                      <span className="text-xs font-semibold text-white/80 bg-white/10 px-3 py-1 rounded-xl">
                        {p.cta_text} →
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: Executive Overview */}
        {/* ========================================================= */}
        {tab === "overview" && (
          <div id="dev-overview-panel" className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-white/[.03] overflow-hidden backdrop-blur-xl">
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserRound size={18} className="text-violet-400" />
                  <h2 className="text-lg font-semibold">Recently Registered Accounts</h2>
                </div>
                <span className="text-xs text-white/40">Latest 15 users</span>
              </div>
              <div className="divide-y divide-white/5">
                {recentUsers.map((u: any) => (
                  <div
                    key={u.id}
                    className="px-6 py-4 flex items-center justify-between hover:bg-white/[.02] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-white/10 grid place-items-center text-violet-300 font-bold">
                        {u.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-white flex items-center gap-2">
                          <span>{u.name}</span>
                          {u.is_pro ? (
                            <span className="px-2 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                              PRO
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-white/40">{u.email}</div>
                      </div>
                    </div>
                    <div className="text-xs text-white/40 text-right">
                      <div>Joined {formatDateTime(u.created_at)}</div>
                      <div className="text-white/30 text-[11px] mt-0.5">
                        {u.last_login_at ? `Last active: ${timeAgo(u.last_login_at)}` : "Never logged in"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 6: Portfolio & Developer Credits */}
        {/* ========================================================= */}
        {tab === "portfolio" && (
          <section id="dev-portfolio-panel" className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-violet-900/20 via-black/40 to-pink-900/20 p-6 sm:p-8 backdrop-blur-2xl">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-3xl bg-gradient-to-br from-violet-500 via-pink-500 to-amber-500 p-1 shrink-0 shadow-2xl group">
                  <div className="w-full h-full rounded-[22px] overflow-hidden bg-black relative">
                    <img
                      src={devPhotoUrl}
                      alt="Shivam Yadav"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover rounded-[22px]"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/assets/shivam.jpg";
                      }}
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <Camera size={24} className="text-white drop-shadow" />
                    </div>
                  </div>
                  <div
                    className="absolute -bottom-2 -right-2 p-1.5 rounded-full bg-emerald-500 text-white shadow-lg border-2 border-black"
                    title="Globally Persisted in Backend Database"
                  >
                    <CheckCheck size={14} />
                  </div>
                </div>
                <div className="flex-1 text-center md:text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs font-semibold uppercase tracking-wider mb-2">
                    <Sparkles size={13} />
                    Solo Founder & Creator
                  </div>
                  <h2 className="text-3xl font-bold">Shivam Yadav</h2>
                  <p className="text-white/60 text-sm mt-1 max-w-2xl">
                    Architect behind Siya Voice AI Assistant. Specialist in Full-Stack Web Development, Voice Synthesizers, Real-time Gemini Integration, and High-Performance Secure Cloud Platforms.
                  </p>
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-4 text-xs text-white/50">
                    <span className="flex items-center gap-1"><Mail size={14} className="text-violet-400" /> shivu12745114@gmail.com</span>
                    <span>·</span>
                    <span className="flex items-center gap-1"><Globe size={14} className="text-pink-400" /> Lead Architect</span>
                    <span>·</span>
                    <span className="flex items-center gap-1 text-emerald-400 font-medium">
                      <CheckCircle2 size={13} /> Central Database Photo Active {photoLastSynced ? `(Synced at ${photoLastSynced})` : ""}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Centralized Global Developer Profile Picture Upload Panel */}
            <div className="rounded-3xl border border-violet-500/30 bg-white/[0.03] backdrop-blur-xl p-6 sm:p-7 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-white/10">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-violet-500/20 text-violet-300">
                      <Camera size={18} />
                    </div>
                    <h3 className="text-lg font-bold text-white">Centralized Global Developer Profile Picture</h3>
                  </div>
                  <p className="text-xs text-white/60 mt-1">
                    Upload or paste an image URL. Stored globally in the backend SQLite database so every user and device sees this photo in Developer Card (Shivam).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Global Database Sync
                  </span>
                </div>
              </div>

              {/* Mode Toggle: File Upload vs Direct URL */}
              <div className="flex items-center gap-2 mb-4 bg-black/40 p-1 rounded-2xl border border-white/10 max-w-sm">
                <button
                  type="button"
                  onClick={() => setPhotoInputMode("file")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                    photoInputMode === "file"
                      ? "bg-violet-600 text-white shadow-lg"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  <Upload size={14} />
                  Upload Image File
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoInputMode("url")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                    photoInputMode === "url"
                      ? "bg-violet-600 text-white shadow-lg"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  <LinkIcon size={14} />
                  Direct Image URL
                </button>
              </div>

              {/* File Upload Option */}
              {photoInputMode === "file" && (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-violet-500/30 hover:border-violet-400/60 rounded-2xl p-6 text-center transition-all bg-violet-950/10">
                    <input
                      type="file"
                      id="dev-photo-file-upload"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={handlePhotoFileChange}
                    />
                    <label
                      htmlFor="dev-photo-file-upload"
                      className="cursor-pointer flex flex-col items-center justify-center gap-2"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-violet-500/20 text-violet-300 grid place-items-center mb-1">
                        <Upload size={22} />
                      </div>
                      <span className="text-sm font-semibold text-white">Click or Drag Image Here to Select Photo</span>
                      <span className="text-xs text-white/40">Supports JPG, PNG, WebP (Max 15MB)</span>
                    </label>
                  </div>

                  {/* Preview & Confirmation */}
                  {photoPreview && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-2xl bg-white/[0.04] border border-violet-500/40 flex flex-col sm:flex-row items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl overflow-hidden border border-violet-400 shadow-lg bg-black">
                          <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">Ready to Save Globally</div>
                          <div className="text-xs text-white/50">This photo will be saved to the central database for all users.</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          disabled={isUploadingPhoto}
                          onClick={() => setPhotoPreview(null)}
                          className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs text-white/60 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isUploadingPhoto}
                          onClick={handleSavePhotoFile}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 shadow-lg transition-all disabled:opacity-50"
                        >
                          {isUploadingPhoto ? (
                            <>
                              <RefreshCw size={13} className="animate-spin" />
                              Saving Globally...
                            </>
                          ) : (
                            <>
                              <Check size={14} />
                              Save to Database (Universal)
                            </>
                          )}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              {/* Direct Image URL Option */}
              {photoInputMode === "url" && (
                <div className="space-y-3">
                  <label className="text-xs font-medium text-white/70 block">
                    Paste Image Link (Web / CDN / Google / Unsplash URL):
                  </label>
                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <div className="relative flex-1 w-full">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40">
                        <LinkIcon size={16} />
                      </div>
                      <input
                        type="url"
                        value={customPhotoUrlInput}
                        onChange={(e) => setCustomPhotoUrlInput(e.target.value)}
                        placeholder="https://example.com/shivam-profile.jpg"
                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-white/30 focus:border-violet-500 focus:outline-none transition-colors"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={isUploadingPhoto || !customPhotoUrlInput.trim()}
                      onClick={handleSavePhotoUrl}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 shadow-lg transition-all disabled:opacity-50 shrink-0"
                    >
                      {isUploadingPhoto ? (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check size={14} />
                          Save URL Globally
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Reset Button */}
              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-white/50">
                <span>Current source: <code className="text-violet-300 text-[11px] truncate max-w-[200px] inline-block align-bottom">{devPhotoUrl}</code></span>
                <button
                  type="button"
                  onClick={handleResetDefaultPhoto}
                  disabled={isUploadingPhoto}
                  className="text-white/50 hover:text-white underline decoration-dotted transition-colors"
                >
                  Reset to Default Shivam Portrait
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-6 rounded-3xl border border-white/10 bg-white/[.03] backdrop-blur-xl">
                <div className="w-10 h-10 rounded-2xl bg-violet-500/20 text-violet-400 grid place-items-center mb-4">
                  <Cpu size={20} />
                </div>
                <h3 className="font-bold text-base mb-1">Siya AI Voice Core</h3>
                <p className="text-xs text-white/50 leading-relaxed">
                  Real-time audio streaming and speech recognition engineered with the Google GenAI SDK and Gemini Live API.
                </p>
              </div>

              <div className="p-6 rounded-3xl border border-white/10 bg-white/[.03] backdrop-blur-xl">
                <div className="w-10 h-10 rounded-2xl bg-pink-500/20 text-pink-400 grid place-items-center mb-4">
                  <ShieldCheck size={20} />
                </div>
                <h3 className="font-bold text-base mb-1">Secure User & Access Engine</h3>
                <p className="text-xs text-white/50 leading-relaxed">
                  Cryptographically secured credentials with scrypt hashing, WAL-mode SQLite database persistence, and fine-grained role control.
                </p>
              </div>

              <div className="p-6 rounded-3xl border border-white/10 bg-white/[.03] backdrop-blur-xl">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 grid place-items-center mb-4">
                  <Award size={20} />
                </div>
                <h3 className="font-bold text-base mb-1">Pro Tier & Marketing Hub</h3>
                <p className="text-xs text-white/50 leading-relaxed">
                  Built-in dynamic sponsorship ads, promo broadcast, automated user notifications, and instant moderation tooling.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ========================================================= */}
        {/* TAB 8: Google & Login Email Alerts */}
        {/* ========================================================= */}
        {tab === "email_alerts" && (
          <section id="dev-email-alerts-panel" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl border border-white/10 bg-gradient-to-br from-violet-950/40 via-black/40 to-slate-900/40 backdrop-blur-xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-violet-500/20 text-violet-400 grid place-items-center shrink-0 border border-violet-500/30">
                  <Mail size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    Google Sign-In & Login Alerts
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                      {devMessages.length} Total
                    </span>
                  </h2>
                  <p className="text-xs text-white/50 mt-0.5">
                    Live notifications captured whenever any user signs up or logs into Siya with Google.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={loadDevMessages}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-all border border-white/10 cursor-pointer w-fit"
              >
                <RefreshCw size={13} />
                <span>Refresh Alerts</span>
              </button>
            </div>

            {devMessages.length === 0 ? (
              <div className="p-12 text-center rounded-3xl border border-white/10 bg-white/[.02] backdrop-blur-md">
                <Mail size={36} className="mx-auto text-white/20 mb-3" />
                <h3 className="text-sm font-semibold text-white/80">No login notifications yet</h3>
                <p className="text-xs text-white/40 max-w-md mx-auto mt-1">
                  Whenever any user logs in or registers using Google, a real-time notification with their full email and session details will appear here automatically.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {devMessages.map((msg: any) => {
                  // Extract email if present
                  const emailMatch = msg.body?.match(/[\w.-]+@[\w.-]+\.\w+/) || msg.subject?.match(/[\w.-]+@[\w.-]+\.\w+/);
                  const extractedEmail = emailMatch ? emailMatch[0] : null;

                  return (
                    <div
                      key={msg.id}
                      className="p-5 rounded-2xl border border-white/10 bg-white/[.03] hover:bg-white/[.05] transition-all backdrop-blur-md flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 text-[10px] font-bold tracking-wide uppercase">
                            Google Auth Event
                          </span>
                          {msg.user_id && (
                            <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-white/70 text-[10px] font-mono">
                              User ID #{msg.user_id}
                            </span>
                          )}
                          <span className="text-[11px] text-white/40 flex items-center gap-1 ml-auto sm:ml-0">
                            <Clock size={11} />
                            {new Date(msg.created_at || Date.now()).toLocaleString()}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-white/95">{msg.subject}</h4>
                        <p className="text-xs text-white/60 font-mono leading-relaxed break-words bg-black/30 p-2.5 rounded-xl border border-white/5">
                          {msg.body}
                        </p>
                      </div>

                      {extractedEmail && (
                        <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(extractedEmail);
                              setCopiedEmailMsgId(msg.id);
                              showToast(`Copied ${extractedEmail} to clipboard!`, "success");
                              setTimeout(() => setCopiedEmailMsgId(null), 2500);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/40 text-violet-200 text-xs font-medium transition-colors cursor-pointer"
                          >
                            {copiedEmailMsgId === msg.id ? (
                              <>
                                <Check size={13} className="text-emerald-400" />
                                <span className="text-emerald-300">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy size={13} />
                                <span>Copy Email</span>
                              </>
                            )}
                          </button>

                          <a
                            href={`mailto:${extractedEmail}?subject=Welcome%20to%20Siya%20AI`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white/80 text-xs font-medium transition-colors"
                          >
                            <ExternalLink size={12} />
                            <span>Send Email</span>
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
