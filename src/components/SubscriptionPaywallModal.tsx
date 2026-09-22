import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Check,
  Crown,
  Sparkles,
  Heart,
  Flame,
  X,
  MessageCircle,
  Copy,
  CheckCheck,
  ArrowRight,
  ShieldCheck,
  QrCode,
  Clock,
  ExternalLink,
} from "lucide-react";
import {
  PersonalityMode,
  SubscriptionTier,
  SUBSCRIPTION_PLANS,
  PlanConfig,
} from "../services/personalityService";
import { AuthUser } from "./AuthGate";

interface SubscriptionPaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: AuthUser | null;
  user?: AuthUser | null;
  currentTier?: SubscriptionTier;
  initialPlan?: SubscriptionTier;
  onPlanUnlocked?: (tier: SubscriptionTier, newMode: PersonalityMode) => void;
  onPlanApproved?: (tier: SubscriptionTier, newMode: PersonalityMode) => void;
}

export default function SubscriptionPaywallModal({
  isOpen,
  onClose,
  currentUser,
  user,
  currentTier = "free",
  initialPlan,
  onPlanUnlocked,
  onPlanApproved,
}: SubscriptionPaywallModalProps) {
  const activeUser = currentUser || user || null;
  const [selectedPlan, setSelectedPlan] = useState<PlanConfig | null>(() => {
    if (initialPlan && SUBSCRIPTION_PLANS[initialPlan]) {
      return SUBSCRIPTION_PLANS[initialPlan];
    }
    return null;
  });
  const [step, setStep] = useState<"plans" | "checkout" | "submitted">(() => {
    return initialPlan && SUBSCRIPTION_PLANS[initialPlan] ? "checkout" : "plans";
  });
  const [utrInput, setUtrInput] = useState("");
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const [paymentSettings, setPaymentSettings] = useState({
    whatsapp: "+919876543210",
    upiId: "shivu12745114@okaxis",
  });
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && initialPlan && SUBSCRIPTION_PLANS[initialPlan]) {
      setSelectedPlan(SUBSCRIPTION_PLANS[initialPlan]);
      setStep("checkout");
    }
  }, [isOpen, initialPlan]);

  // Fetch developer payment settings and current user requests
  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/subscription/plans")
      .then((res) => res.json())
      .then((data) => {
        if (data?.developer) {
          setPaymentSettings({
            whatsapp: data.developer.whatsapp || "+919876543210",
            upiId: data.developer.upiId || "shivu12745114@okaxis",
          });
        }
      })
      .catch(() => {});

    fetch("/api/subscription/status")
      .then((res) => res.json())
      .then((data) => {
        if (data?.requests) {
          setPendingRequests(data.requests);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  const handleSelectPlan = (plan: PlanConfig) => {
    setSelectedPlan(plan);
    setStep("checkout");
    setError("");
  };

  const handleInitiateWhatsAppCheckout = async () => {
    if (!selectedPlan) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/subscription/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planTier: selectedPlan.id,
          utrTransactionId: utrInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to initiate subscription request");
      }

      setWhatsappUrl(data.whatsappUrl);
      if (data.whatsappUrl) {
        window.open(data.whatsappUrl, "_blank", "noopener,noreferrer");
      }
      setStep("submitted");
    } catch (err: any) {
      setError(err.message || "Something went wrong while creating request.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(paymentSettings.upiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handleDismiss = () => {
    sessionStorage.setItem("siya_paywall_dismissed", "true");
    onClose();
  };

  if (!isOpen) return null;

  // Paid plans to display
  const paidPlans = [
    SUBSCRIPTION_PLANS.pro,
    SUBSCRIPTION_PLANS.pro_max,
    SUBSCRIPTION_PLANS.ultra,
  ];

  // UPI intent link for QR/App
  const upiIntent = selectedPlan
    ? `upi://pay?pa=${encodeURIComponent(paymentSettings.upiId)}&pn=Siya%20AI%20Shivam&am=${selectedPlan.amount}&cu=INR&tn=Siya_${selectedPlan.id}_User${activeUser?.id || "X"}`
    : "";

  const qrImageUrl = selectedPlan
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(upiIntent)}`
    : "";

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/85 backdrop-blur-md p-2 sm:p-4 md:p-6 flex min-h-full items-start sm:items-center justify-center touch-pan-y"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          className="relative w-full max-w-4xl bg-gradient-to-b from-[#131122] via-[#0d0a18] to-[#07050e] border border-violet-500/30 rounded-2xl sm:rounded-3xl shadow-[0_0_80px_rgba(139,92,246,0.3)] my-2 sm:my-auto text-white max-h-[92dvh] sm:max-h-[88vh] flex flex-col overflow-hidden"
        >
          {/* Header Gradient Glow */}
          <div className="h-1 bg-gradient-to-r from-violet-500 via-pink-500 to-teal-400 shrink-0" />

          {/* Sticky Modal Top Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/10 bg-[#161226]/95 backdrop-blur-md shrink-0 z-20">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-violet-500/20 text-amber-400 grid place-items-center border border-violet-500/30 shrink-0">
                <Crown className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                  <span>{step === "plans" ? "Select Subscription Plan" : step === "checkout" ? "Complete Micro-Payment" : "Order Dispatched"}</span>
                  <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                    From ₹5
                  </span>
                </div>
                <div className="text-[10px] text-zinc-400">
                  {step === "plans" ? "Swipe or scroll up/down to view all plans" : "UPI QR & WhatsApp verification"}
                </div>
              </div>
            </div>

            {/* Close / Dismiss Button with 44px touch target */}
            <button
              id="btn-close-paywall"
              onClick={handleDismiss}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer border border-white/10"
              title="Close / Continue with Free"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Modal Body */}
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 md:p-8 space-y-6 touch-pan-y"
            style={{
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
            }}
          >
            {step === "plans" && (
              <div>
                {/* Header Title */}
                <div className="text-center max-w-2xl mx-auto mb-4 sm:mb-8">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-300 text-xs font-semibold tracking-wider uppercase mb-2 sm:mb-3">
                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                    Micro-Subscription Personas
                  </div>
                  <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-white">
                    Unlock Siya's Full Potential
                  </h2>
                  <p className="mt-2 text-xs sm:text-sm md:text-base text-zinc-300">
                    Choose the persona that matches your vibe. Micro-payments starting at just ₹5, verified directly by developer Shivam!
                  </p>
                </div>

                {/* Mobile Quick Plan Switcher & Jump Bar */}
                <div className="flex sm:hidden items-center justify-between gap-1.5 p-1.5 bg-white/[0.06] rounded-2xl border border-white/10 mb-5 sticky top-0 z-10 backdrop-blur-md shadow-lg">
                  {paidPlans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => {
                        const el = document.getElementById(`plan-card-${plan.id}`);
                        el?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                      className="flex-1 py-1.5 px-1 rounded-xl text-center text-white/80 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                    >
                      <div className="text-[11px] font-bold truncate">{plan.name.replace(" Plan", "")}</div>
                      <div className="text-[10px] text-teal-300 font-extrabold">{plan.priceFormatted}</div>
                    </button>
                  ))}
                </div>

                {/* Mobile scroll hint */}
                <div className="sm:hidden text-center text-[11px] text-zinc-400 mb-3 flex items-center justify-center gap-1">
                  <span>↕ Scroll up and down to browse plans</span>
                </div>

                {/* Pending Request Alert if any */}
                {pendingRequests.length > 0 && pendingRequests[0].status === "pending" && (
                  <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                    <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs sm:text-sm text-amber-200">
                      <span className="font-semibold">Pending Request for {pendingRequests[0].plan_name}:</span> Your verification is currently queued with Shivam. Once verified on WhatsApp/Command Center, your mode unlocks automatically!
                    </div>
                  </div>
                )}

                {/* 3 Tier Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {paidPlans.map((plan) => {
                    const isUltra = plan.id === "ultra";
                    const isProMax = plan.id === "pro_max";
                    return (
                      <motion.div
                        key={plan.id}
                        id={`plan-card-${plan.id}`}
                        whileHover={{ y: -4 }}
                        className={`scroll-mt-4 relative flex flex-col justify-between p-5 sm:p-6 rounded-2xl bg-[#161226]/80 border transition-all duration-300 ${
                          isUltra
                            ? "border-rose-500/60 shadow-[0_0_30px_rgba(244,63,94,0.25)] ring-1 ring-rose-500/30"
                            : isProMax
                            ? "border-pink-500/50 shadow-[0_0_25px_rgba(236,72,153,0.15)]"
                            : "border-violet-500/40 hover:border-violet-500/70"
                        }`}
                      >
                        {/* Badge */}
                        <div className="flex items-center justify-between gap-2 mb-4">
                          <span
                            className={`px-3 py-1 rounded-full text-[11px] font-extrabold tracking-wide uppercase ${
                              isUltra
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                : isProMax
                                ? "bg-pink-500/20 text-pink-300 border border-pink-500/30"
                                : "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                            }`}
                          >
                            {plan.badge}
                          </span>
                          {isUltra && <Heart className="w-4 h-4 text-rose-400 fill-rose-400 animate-pulse" />}
                          {isProMax && <Sparkles className="w-4 h-4 text-pink-400" />}
                          {!isUltra && !isProMax && <Flame className="w-4 h-4 text-amber-400" />}
                        </div>

                        <div>
                          {/* Plan Name & Mode */}
                          <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                          <p className={`text-xs font-semibold mt-0.5 ${plan.accentColor}`}>
                            {plan.modeLabel}
                          </p>

                          {/* Price */}
                          <div className="mt-4 mb-4 flex items-baseline gap-1.5">
                            <span className="text-3xl sm:text-4xl font-black text-white">
                              {plan.priceFormatted}
                            </span>
                            <span className="text-xs text-zinc-400 font-medium">one-time / access</span>
                          </div>

                          <p className="text-xs text-zinc-300 mb-5 leading-relaxed">
                            {plan.tagline}
                          </p>

                          {/* Features */}
                          <ul className="space-y-2.5 mb-6 text-xs text-zinc-300">
                            {plan.features.map((feat, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <Check className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
                                <span>{feat}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Upgrade Button */}
                        <button
                          id={`btn-select-plan-${plan.id}`}
                          onClick={() => handleSelectPlan(plan)}
                          className={`w-full py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 shadow-lg ${
                            isUltra
                              ? "bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white shadow-rose-600/30"
                              : isProMax
                              ? "bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-pink-600/30"
                              : "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-violet-600/30"
                          }`}
                        >
                          <span>Get {plan.name}</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Bottom Dismiss / Continue Free Bar */}
                <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Verified manually via WhatsApp & UPI by Developer Shivam</span>
                  </div>

                  <button
                    id="btn-continue-free"
                    onClick={handleDismiss}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-xs font-semibold tracking-wide transition-all"
                  >
                    Continue with Free / Remind Me Later
                  </button>
                </div>
              </div>
            )}

            {step === "checkout" && selectedPlan && (
              <div>
                {/* Back Link */}
                <button
                  onClick={() => setStep("plans")}
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors mb-5"
                >
                  ← Back to Plans
                </button>

                <div className="text-center max-w-xl mx-auto mb-6">
                  <h3 className="text-2xl sm:text-3xl font-black text-white">
                    Upgrade to {selectedPlan.name}
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-300 mt-1">
                    Send order details to developer Shivam on WhatsApp & complete the ₹{selectedPlan.amount} micro-payment.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
                  {/* Left Column: Order Summary & WhatsApp */}
                  <div className="flex flex-col justify-between p-6 rounded-2xl bg-[#17122a] border border-violet-500/30">
                    <div>
                      <div className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-2">
                        1. Verification Dispatch
                      </div>
                      <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 text-xs space-y-1.5 mb-4">
                        <div className="flex justify-between">
                          <span className="text-zinc-400">User Name:</span>
                          <span className="font-semibold text-white">{currentUser?.name || "User"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">User ID:</span>
                          <span className="font-mono text-white">#{currentUser?.id || "1"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Email:</span>
                          <span className="text-white truncate max-w-[150px]">{currentUser?.email}</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-white/10">
                          <span className="text-zinc-400">Plan & Price:</span>
                          <span className="font-black text-teal-300">{selectedPlan.name} ({selectedPlan.priceFormatted})</span>
                        </div>
                      </div>

                      <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                        Clicking below registers your order and opens WhatsApp with pre-filled details to send directly to Shivam.
                      </p>
                    </div>

                    <button
                      id="btn-dispatch-whatsapp"
                      onClick={handleInitiateWhatsAppCheckout}
                      disabled={loading}
                      className="w-full py-3.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-black font-extrabold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
                    >
                      <MessageCircle className="w-5 h-5 fill-current" />
                      <span>{loading ? "Registering..." : "Send Details via WhatsApp"}</span>
                    </button>
                  </div>

                  {/* Right Column: Dedicated UPI QR Code */}
                  <div className="flex flex-col items-center justify-between p-6 rounded-2xl bg-[#17122a] border border-teal-500/30 text-center">
                    <div className="w-full">
                      <div className="text-xs font-bold text-teal-400 uppercase tracking-wider mb-2">
                        2. UPI Micro-Payment (₹{selectedPlan.amount})
                      </div>

                      {/* QR Code image */}
                      <div className="w-44 h-44 mx-auto p-2 bg-white rounded-2xl shadow-md mb-3 flex items-center justify-center">
                        <img
                          src={qrImageUrl}
                          alt={`UPI QR code for ₹${selectedPlan.amount}`}
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      {/* UPI ID with copy button */}
                      <div className="flex items-center justify-center gap-2 p-2 rounded-xl bg-black/40 border border-white/10 text-xs mb-3">
                        <span className="text-zinc-400">UPI ID:</span>
                        <span className="font-mono text-teal-300 font-semibold">{paymentSettings.upiId}</span>
                        <button
                          onClick={handleCopyUpi}
                          className="p-1 text-zinc-400 hover:text-white transition-colors"
                          title="Copy UPI ID"
                        >
                          {copiedUpi ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* UTR input for direct submission */}
                    <div className="w-full">
                      <input
                        type="text"
                        value={utrInput}
                        onChange={(e) => setUtrInput(e.target.value)}
                        placeholder="Optional: Enter UTR / Txn Ref ID"
                        className="w-full px-3 py-2 text-xs bg-black/50 border border-white/15 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-teal-400 mb-2"
                      />
                      <p className="text-[11px] text-zinc-400">
                        Scan with GPay, PhonePe, Paytm, or BHIM.
                      </p>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-xs text-rose-200 text-center max-w-xl mx-auto">
                    {error}
                  </div>
                )}
              </div>
            )}

            {step === "submitted" && selectedPlan && (
              <div className="text-center max-w-md mx-auto py-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 grid place-items-center mx-auto mb-4 text-emerald-400">
                  <CheckCheck className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-black text-white mb-2">
                  Order Dispatched to Shivam!
                </h3>
                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed mb-6">
                  Your request for <span className="font-bold text-white">{selectedPlan.name} (₹{selectedPlan.amount})</span> has been sent to developer Shivam on WhatsApp and logged into the Command Center.
                </p>

                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 text-xs text-left space-y-2 mb-6">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Next Steps:</span>
                  </div>
                  <p className="text-zinc-400">
                    1. If WhatsApp didn't open automatically,{" "}
                    {whatsappUrl && (
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-400 underline font-semibold"
                      >
                        Click here to open WhatsApp chat
                      </a>
                    )}.
                  </p>
                  <p className="text-zinc-400">
                    2. Share your payment screenshot or 12-digit UPI UTR ID in the chat.
                  </p>
                  <p className="text-zinc-400">
                    3. Shivam will approve the request in the Developer Command Center, and your mode toggle will unlock immediately!
                  </p>
                </div>

                <button
                  id="btn-done-paywall"
                  onClick={handleDismiss}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-teal-500 hover:from-violet-500 hover:to-teal-400 text-white font-bold text-sm transition-all"
                >
                  Got It! Continue to Siya
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
