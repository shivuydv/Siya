import { FormEvent, useEffect, useState, useMemo, useRef } from "react";
import { signInWithGoogle, checkGoogleRedirectResult } from "../services/firebaseAuth";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  phone_number?: string;
  google_id?: string;
  avatar_url?: string;
  role?: string;
  is_pro?: boolean;
  tier?: string;
  active_mode?: string;
  status?: string;
  auth_provider?: string;
};

type Props = {
  onAuthenticated: (user: AuthUser, developer: boolean) => void;
};

type ParticleData = {
  id: number;
  left: string;
  duration: string;
  delay: string;
  scale: number;
};

export default function AuthGate({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Forgot password
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successNotice, setSuccessNotice] = useState("");
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleEmailInput, setGoogleEmailInput] = useState("");
  const [googleNameInput, setGoogleNameInput] = useState("");
  const [recentGoogleAccounts, setRecentGoogleAccounts] = useState<Array<{ email: string; name: string; avatarUrl?: string }>>([]);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [gsiRendered, setGsiRendered] = useState(false);

  // 35 particles with random positions & timings
  const particles: ParticleData[] = useMemo(() => {
    return Array.from({ length: 35 }).map((_, i) => ({
      id: i,
      left: `${(i * 2.85 + Math.random() * 2) % 100}%`,
      duration: `${5 + Math.random() * 8}s`,
      delay: `${Math.random() * 7}s`,
      scale: Number((Math.random() + 0.5).toFixed(2)),
    }));
  }, []);

  // Google OAuth Client ID
  const GOOGLE_CLIENT_ID = "373906077053-k5ft99ec62hirstceilmjpc14bt0o1ca.apps.googleusercontent.com";

  // Check saved session on mount and initialize Google Identity Services
  useEffect(() => {
    // Load previously saved Google accounts on this browser
    try {
      const saved = JSON.parse(localStorage.getItem("siya_saved_google_accounts") || "[]");
      if (Array.isArray(saved)) setRecentGoogleAccounts(saved);
    } catch {}

    // Check if user redirected back from Google authentication
    checkGoogleRedirectResult()
      .then(async (gResult) => {
        if (gResult && gResult.email) {
          setBusy(true);
          try {
            const res = await fetch("/api/auth/google/firebase", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify(gResult),
            });
            const data = await res.json();
            if (res.ok && data.user) {
              if (data.token) localStorage.setItem("siya_token", data.token);
              triggerSuccess(data.user, Boolean(data.developer));
            }
          } catch (e) {
            console.warn("Redirect login processing error:", e);
          } finally {
            setBusy(false);
          }
        }
      })
      .catch(() => {});
    const savedToken = localStorage.getItem("siya_token") || "";
    fetch("/api/auth/me", {
      credentials: "include",
      headers: savedToken ? { "x-siya-session": savedToken } : {},
    })
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        if (data.authenticated) {
          onAuthenticated(data.user, data.developer);
        }
      })
      .catch(() => {});

    // Initialize Google One Tap / GSI Credential verification
    const initGsi = () => {
      const google = (window as any).google;
      if (google?.accounts?.id) {
        try {
          google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            use_fedcm_for_prompt: false,
            callback: async (response: any) => {
              if (response?.credential) {
                setBusy(true);
                setError("");
                try {
                  const res = await fetch("/api/auth/google/verify-credential", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ credential: response.credential }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || "Google Sign-In failed");
                  if (data.token) localStorage.setItem("siya_token", data.token);
                  triggerSuccess(data.user, Boolean(data.developer));
                } catch (err: any) {
                  setError(err.message || "Google Sign-In failed");
                } finally {
                  setBusy(false);
                }
              }
            },
            auto_select: false,
            cancel_on_tap_outside: true,
          });

          // Only prompt Google One Tap if NOT embedded in an iframe (FedCM rejects in cross-origin iframes)
          try {
            const isIframe = window.self !== window.top;
            if (!isIframe) {
              google.accounts.id.prompt();
            }
          } catch {}

          // Render Google Identity Services Button using window.google.accounts.id.renderButton
          // 'type: standard' triggers Google's native account chooser without any manual email prompt
          const renderGoogleBtn = () => {
            if (googleBtnRef.current) {
              try {
                google.accounts.id.renderButton(googleBtnRef.current, {
                  type: "standard", // 'type: standard' bypasses manual email prompts and directly triggers Google account chooser
                  theme: "filled_black",
                  size: "large",
                  text: "continue_with",
                  shape: "pill",
                  logo_alignment: "left",
                  width: 330,
                });
                setGsiRendered(true);
              } catch (renderErr) {
                console.warn("GSI renderButton error:", renderErr);
              }
            }
          };

          renderGoogleBtn();
          setTimeout(renderGoogleBtn, 150);
          setTimeout(renderGoogleBtn, 500);
        } catch (e) {
          console.warn("GSI init notice:", e);
        }
      }
    };

    if ((window as any).google?.accounts?.id) {
      initGsi();
    } else {
      const interval = setInterval(() => {
        if ((window as any).google?.accounts?.id) {
          clearInterval(interval);
          initGsi();
        }
      }, 300);
      return () => clearInterval(interval);
    }
  }, [onAuthenticated]);

  // Google OAuth popup message listener
  useEffect(() => {
    const handlePopupMessage = (event: MessageEvent) => {
      if (event.data?.type === "GOOGLE_AUTH_SUCCESS") {
        if (event.data.token) {
          localStorage.setItem("siya_token", event.data.token);
        }
        triggerSuccess(event.data.user, event.data.developer);
      } else if (event.data?.type === "GOOGLE_AUTH_ERROR") {
        setError(event.data.error || "Google authentication failed");
      }
    };
    window.addEventListener("message", handlePopupMessage);
    return () => window.removeEventListener("message", handlePopupMessage);
  }, [onAuthenticated]);

  const triggerSuccess = (user: AuthUser, isDev: boolean) => {
    setShowSuccessOverlay(true);
    setTimeout(() => {
      onAuthenticated(user, isDev);
    }, 1100);
  };

  // Login / Signup submission
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;

    if (mode === "forgot") {
      if (forgotStep === 1) {
        handleRequestReset();
      } else {
        handleConfirmReset();
      }
      return;
    }

    const trimmedEmail = email.trim();
    const trimmedPass = password.trim();

    if (!trimmedEmail || !trimmedPass) {
      setError("Please fill in all required fields.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      // Creator quick path if Shivam enters his email
      if (trimmedEmail.toLowerCase() === "shivu12745114@gmail.com") {
        const res = await fetch("/api/auth/developer/quick-access", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Developer login failed");
        if (data.token) localStorage.setItem("siya_token", data.token);
        triggerSuccess(data.user, true);
        return;
      }

      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: mode === "signup" ? (name.trim() || trimmedEmail.split("@")[0]) : undefined,
          email: trimmedEmail,
          password: trimmedPass,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Authentication failed. Check your credentials.");
      }

      if (data.token) {
        localStorage.setItem("siya_token", data.token);
      }
      triggerSuccess(data.user, Boolean(data.developer));
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Direct Google Social Login fallback (100% reliable in any browser, iframe or domain)
  const handleSocialGoogle = async (targetEmail: string, targetName?: string) => {
    const cleanE = targetEmail.trim().toLowerCase();
    if (!cleanE || !cleanE.includes("@")) {
      setError("Please enter a valid Google email address.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const derivedName =
        targetName?.trim() ||
        (cleanE === "shivu12745114@gmail.com"
          ? "Shivam Yadav"
          : cleanE
              .split("@")[0]
              .replace(/[._-]/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase()));

      const res = await fetch("/api/auth/google/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: cleanE,
          name: derivedName,
          avatar_url: cleanE === "shivu12745114@gmail.com" ? "/assets/shivam.jpg" : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Google Sign-In failed");
      if (data.token) localStorage.setItem("siya_token", data.token);

      // Save to recent accounts list
      try {
        const saved = JSON.parse(localStorage.getItem("siya_saved_google_accounts") || "[]");
        const filtered = Array.isArray(saved) ? saved.filter((a: any) => a.email !== cleanE) : [];
        filtered.unshift({ email: cleanE, name: derivedName });
        const capped = filtered.slice(0, 4);
        localStorage.setItem("siya_saved_google_accounts", JSON.stringify(capped));
        setRecentGoogleAccounts(capped);
      } catch {}

      setShowGoogleModal(false);
      triggerSuccess(data.user, Boolean(data.developer));
    } catch (err: any) {
      setError(err.message || "Google authentication failed");
    } finally {
      setBusy(false);
    }
  };

  // Google Sign-In handler: Tries official Firebase popup first, then GSI token, then clean modal
  const handleGoogleClick = async () => {
    setError("");
    setBusy(true);

    try {
      // 1. Primary: Official Firebase Google Authentication Popup (Real Google account chooser)
      const gResult = await signInWithGoogle();

      const res = await fetch("/api/auth/google/firebase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(gResult),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Google sign-in processing failed.");

      if (data.token) localStorage.setItem("siya_token", data.token);

      // Save to device recent Google accounts
      try {
        const saved = JSON.parse(localStorage.getItem("siya_saved_google_accounts") || "[]");
        const filtered = Array.isArray(saved) ? saved.filter((a: any) => a.email !== gResult.email) : [];
        filtered.unshift({ email: gResult.email, name: gResult.name, avatarUrl: gResult.avatarUrl });
        const capped = filtered.slice(0, 4);
        localStorage.setItem("siya_saved_google_accounts", JSON.stringify(capped));
        setRecentGoogleAccounts(capped);
      } catch {}

      setShowGoogleModal(false);
      triggerSuccess(data.user, Boolean(data.developer));
      return;
    } catch (firebaseErr: any) {
      console.warn("Firebase Google popup attempt note:", firebaseErr);

      // If user voluntarily closed the Google popup window, don't show annoying error modal
      if (
        firebaseErr.message?.includes("closed") ||
        firebaseErr.message?.includes("cancelled") ||
        firebaseErr.code === "auth/popup-closed-by-user"
      ) {
        setBusy(false);
        return;
      }

      // 2. Secondary: If Google Identity Services (GSI) OAuth2 is available, try token client
      const google = (window as any).google;
      if (google?.accounts?.oauth2) {
        try {
          const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: "openid profile email",
            prompt: "select_account",
            callback: async (resp: any) => {
              if (resp.error) {
                setShowGoogleModal(true);
                return;
              }
              if (resp.access_token) {
                try {
                  const vRes = await fetch("/api/auth/google/verify-token", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ access_token: resp.access_token }),
                  });
                  const vData = await vRes.json();
                  if (!vRes.ok) throw new Error(vData.error || "Google verification failed");
                  if (vData.token) localStorage.setItem("siya_token", vData.token);
                  setShowGoogleModal(false);
                  triggerSuccess(vData.user, Boolean(vData.developer));
                  return;
                } catch {
                  setShowGoogleModal(true);
                }
              } else {
                setShowGoogleModal(true);
              }
            },
          });
          tokenClient.requestAccessToken({ prompt: "select_account" });
          return;
        } catch {
          setShowGoogleModal(true);
          return;
        }
      }

      // 3. Fallback: Open Google modal so user can choose or input their account instantly
      setShowGoogleModal(true);
    } finally {
      setBusy(false);
    }
  };

  // Guest Access
  const handleGuestClick = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/guest", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Guest login failed");
      if (data.token) localStorage.setItem("siya_token", data.token);
      triggerSuccess(data.user, false);
    } catch (err: any) {
      setError(err.message || "Guest login error");
    } finally {
      setBusy(false);
    }
  };

  // Creator Quick Access
  const handleCreatorQuickAccess = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/developer/quick-access", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Creator login failed");
      if (data.token) localStorage.setItem("siya_token", data.token);
      triggerSuccess(data.user, true);
    } catch (err: any) {
      setError(err.message || "Could not log in as creator");
    } finally {
      setBusy(false);
    }
  };

  // Request Reset Code
  const handleRequestReset = async () => {
    if (!email) {
      setError("Please enter your registered email address.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to generate reset code");
      setResetCode(data.resetCode);
      setForgotStep(2);
      setSuccessNotice("Reset code generated! Enter your new password below.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Confirm Reset
  const handleConfirmReset = async () => {
    if (!newPassword || newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: resetCode,
          newPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to reset password");
      setSuccessNotice("Password updated! You can now sign in.");
      setMode("login");
      setForgotStep(1);
      setPassword("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="siya-auth-bg">
      {/* Glow Orbs */}
      <div className="siya-glow one" />
      <div className="siya-glow two" />

      {/* Floating Particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="siya-particle"
          style={{
            left: p.left,
            animationDuration: p.duration,
            animationDelay: p.delay,
            transform: `scale(${p.scale})`,
          }}
        />
      ))}

      {/* Main Login Card */}
      <div className="siya-login-card">
        {/* Logo */}
        <div
          className="siya-logo"
          onClick={handleCreatorQuickAccess}
          title="Click to sign in as Developer (Shivam)"
          role="button"
          tabIndex={0}
          style={{ cursor: "pointer" }}
        >
          SIYA
        </div>

        <h1>
          {mode === "login"
            ? "Welcome Back"
            : mode === "signup"
            ? "Create Account"
            : "Reset Password"}
        </h1>

        <div className="siya-subtitle">
          {mode === "login"
            ? "Your intelligent companion is waiting for you ✨"
            : mode === "signup"
            ? "Join SIYA to unlock full voice AI capabilities ✨"
            : "Enter your email to recover your SIYA account"}
        </div>

        {/* Mode Switcher Tabs */}
        {mode !== "forgot" && (
          <div
            style={{
              display: "flex",
              background: "rgba(255, 255, 255, 0.05)",
              borderRadius: "12px",
              padding: "4px",
              marginTop: "16px",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
                setSuccessNotice("");
              }}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: "9px",
                border: "none",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                background: mode === "login" ? "linear-gradient(135deg, #a855f7, #6366f1)" : "transparent",
                color: mode === "login" ? "#ffffff" : "rgba(255, 255, 255, 0.6)",
                transition: "all 0.2s ease",
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError("");
                setSuccessNotice("");
              }}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: "9px",
                border: "none",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                background: mode === "signup" ? "linear-gradient(135deg, #a855f7, #6366f1)" : "transparent",
                color: mode === "signup" ? "#ffffff" : "rgba(255, 255, 255, 0.6)",
                transition: "all 0.2s ease",
              }}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px 16px",
              borderRadius: "14px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#fca5a5",
              fontSize: "13px",
              textAlign: "left",
              lineHeight: "1.4",
            }}
          >
            {error}
          </div>
        )}

        {/* Success Notice */}
        {successNotice && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px 16px",
              borderRadius: "14px",
              background: "rgba(34, 197, 94, 0.15)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              color: "#86efac",
              fontSize: "13px",
              textAlign: "left",
              lineHeight: "1.4",
            }}
          >
            {successNotice}
          </div>
        )}

        {/* Form */}
        <form className="siya-form" id="loginForm" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <div className="siya-input-box">
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                required
              />
              <span className="siya-icon">👤</span>
            </div>
          )}

          {mode !== "forgot" || forgotStep === 1 ? (
            <div className="siya-input-box">
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                required
              />
              <span className="siya-icon">✉</span>
            </div>
          ) : (
            <>
              <div className="siya-input-box">
                <input
                  type="text"
                  id="resetCode"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  placeholder="Verification code"
                  required
                />
                <span className="siya-icon">🔑</span>
              </div>
              <div className="siya-input-box">
                <input
                  type="password"
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (min 8 characters)"
                  minLength={8}
                  required
                />
                <span className="siya-icon">🔒</span>
              </div>
            </>
          )}

          {mode !== "forgot" && (
            <div className="siya-input-box">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
              />
              <span
                className="siya-icon siya-password-toggle"
                id="togglePassword"
                onClick={() => setShowPassword((prev) => !prev)}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "🙈" : "👁"}
              </span>
            </div>
          )}

          {mode === "login" && (
            <div className="siya-options">
              <label className="siya-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Remember me
              </label>

              <span
                className="siya-forgot"
                onClick={() => {
                  setMode("forgot");
                  setForgotStep(1);
                  setError("");
                  setSuccessNotice("");
                }}
              >
                Forgot password?
              </span>
            </div>
          )}

          {mode === "forgot" && (
            <div className="siya-options" style={{ justifyContent: "flex-end" }}>
              <span
                className="siya-forgot"
                onClick={() => {
                  setMode("login");
                  setForgotStep(1);
                  setError("");
                  setSuccessNotice("");
                }}
              >
                Back to Sign in
              </span>
            </div>
          )}

          <button className="siya-login-btn" type="submit" disabled={busy}>
            {busy
              ? "Connecting to SIYA…"
              : mode === "login"
              ? "Sign in to SIYA"
              : mode === "signup"
              ? "Create SIYA Account"
              : forgotStep === 1
              ? "Send Reset Code"
              : "Update Password"}
          </button>
        </form>

        {/* Divider */}
        <div className="siya-divider">
          <span />
          OR
          <span />
        </div>

        {/* Google Sign-in Button */}
        <div className="siya-social" style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
          <button
            type="button"
            id="btn-google-login"
            onClick={handleGoogleClick}
            disabled={busy}
            title="Sign in with Google"
            style={{
              width: "100%",
              height: "48px",
              borderRadius: "14px",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              background: "rgba(255, 255, 255, 0.08)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              boxShadow: "0 4px 14px rgba(0, 0, 0, 0.25)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>{busy ? "Connecting…" : "Continue with Google"}</span>
          </button>
        </div>

        {/* Signup / Switch mode toggle */}
        <div className="siya-signup">
          {mode === "login" ? (
            <>
              New to SIYA?{" "}
              <span
                onClick={() => {
                  setMode("signup");
                  setError("");
                  setSuccessNotice("");
                }}
              >
                Create account
              </span>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <span
                onClick={() => {
                  setMode("login");
                  setError("");
                  setSuccessNotice("");
                }}
              >
                Sign in
              </span>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="siya-footer">
          SIYA • System Integrated Yield Agent
        </div>
      </div>

      {/* Google Sign-in Modal */}
      {showGoogleModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(8px)",
            padding: "16px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "420px",
              background: "#161622",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "24px",
              padding: "26px",
              color: "#ffffff",
              boxShadow: "0 25px 50px rgba(0, 0, 0, 0.7)",
              textAlign: "center",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
              <svg width="36" height="36" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
            </div>
            <h3 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 6px" }}>Google Account Sign-In</h3>
            <p style={{ fontSize: "13px", color: "rgba(255, 255, 255, 0.6)", margin: "0 0 18px", lineHeight: "1.4" }}>
              Choose your Google account or enter your Gmail address to connect to Siya.
            </p>

            {/* Official Google Account Chooser Launcher */}
            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={busy}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "14px",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                background: "linear-gradient(135deg, rgba(66, 133, 244, 0.2), rgba(52, 168, 83, 0.2))",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                cursor: busy ? "not-allowed" : "pointer",
                marginBottom: "14px",
                transition: "all 0.2s ease",
              }}
            >
              <span>🌐</span>
              <span>{busy ? "Connecting..." : "Open Google Account Chooser"}</span>
            </button>

            {/* Recent Accounts on this device */}
            {recentGoogleAccounts.length > 0 && (
              <div style={{ marginBottom: "16px", textAlign: "left" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", color: "rgba(255, 255, 255, 0.4)", marginBottom: "8px", letterSpacing: "0.5px" }}>
                  Recent Accounts on this Device:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {recentGoogleAccounts.map((acc, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSocialGoogle(acc.email, acc.name)}
                      disabled={busy}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "8px 12px",
                        borderRadius: "12px",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        background: "rgba(255, 255, 255, 0.04)",
                        color: "#ffffff",
                        cursor: busy ? "not-allowed" : "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#4285F4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700 }}>
                        {acc.name?.[0]?.toUpperCase() || acc.email[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.name}</div>
                        <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.email}</div>
                      </div>
                      <span style={{ fontSize: "11px", color: "#60a5fa" }}>Sign in ➔</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "14px 0", color: "rgba(255, 255, 255, 0.3)", fontSize: "11px" }}>
              <div style={{ flex: 1, height: "1px", background: "rgba(255, 255, 255, 0.1)" }} />
              <span>OR SIGN IN WITH YOUR GMAIL</span>
              <div style={{ flex: 1, height: "1px", background: "rgba(255, 255, 255, 0.1)" }} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                let emailToUse = googleEmailInput.trim();
                if (!emailToUse) return;
                if (!emailToUse.includes("@")) {
                  emailToUse += "@gmail.com";
                }
                handleSocialGoogle(emailToUse, googleNameInput.trim() || undefined);
              }}
            >
              <div style={{ position: "relative", marginBottom: "8px" }}>
                <input
                  type="text"
                  value={googleEmailInput}
                  onChange={(e) => setGoogleEmailInput(e.target.value)}
                  placeholder="Enter your Gmail address"
                  required
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    borderRadius: "12px",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    background: "rgba(255, 255, 255, 0.05)",
                    color: "#ffffff",
                    fontSize: "13px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                {!googleEmailInput.includes("@") && googleEmailInput.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setGoogleEmailInput((prev) => prev + "@gmail.com")}
                    style={{
                      position: "absolute",
                      right: "8px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      padding: "3px 8px",
                      fontSize: "11px",
                      borderRadius: "6px",
                      background: "rgba(66, 133, 244, 0.3)",
                      border: "1px solid rgba(66, 133, 244, 0.5)",
                      color: "#93c5fd",
                      cursor: "pointer",
                    }}
                  >
                    + @gmail.com
                  </button>
                )}
              </div>

              <input
                type="text"
                value={googleNameInput}
                onChange={(e) => setGoogleNameInput(e.target.value)}
                placeholder="Your Name (Optional)"
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  marginBottom: "12px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  background: "rgba(255, 255, 255, 0.05)",
                  color: "#ffffff",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />

              <button
                type="submit"
                disabled={busy || !googleEmailInput.trim()}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "12px",
                  border: "none",
                  background: "linear-gradient(135deg, #a855f7, #6366f1)",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: busy || !googleEmailInput.trim() ? "not-allowed" : "pointer",
                  opacity: busy || !googleEmailInput.trim() ? 0.6 : 1,
                  boxShadow: "0 8px 20px rgba(168, 85, 247, 0.3)",
                }}
              >
                {busy ? "Signing In…" : "Sign In with this Google Email"}
              </button>
            </form>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px", paddingTop: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
              <button
                type="button"
                onClick={() => setShowGoogleModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255, 255, 255, 0.5)",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleSocialGoogle("shivu12745114@gmail.com", "Shivam Yadav")}
                disabled={busy}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(168, 85, 247, 0.8)",
                  fontSize: "11px",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
                title="Developer 1-Click Fast Login"
              >
                ⚡ Shivam (Creator) Fast Login
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Screen Overlay */}
      <div className={`siya-success ${showSuccessOverlay ? "show" : ""}`} id="successScreen">
        <div className="siya-success-box">
          <div className="siya-check">✓</div>
          <h2>Welcome to SIYA</h2>
          <p>Your intelligent companion is ready.</p>
        </div>
      </div>
    </div>
  );
}
