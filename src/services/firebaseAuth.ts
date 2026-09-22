import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  UserCredential,
} from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase App singleton
export const firebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(firebaseApp);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account",
});

export interface GoogleAuthResult {
  email: string;
  name: string;
  avatarUrl: string;
  googleId: string;
  idToken?: string;
}

/**
 * Sign in with Google using Firebase Authentication Popup.
 * Automatically opens the Google account chooser so the user's real email, name, and photo are retrieved.
 */
export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  try {
    const result: UserCredential = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    if (!user.email) {
      throw new Error("No verified email returned by your Google account.");
    }

    const idToken = await user.getIdToken().catch(() => undefined);

    return {
      email: user.email.toLowerCase().trim(),
      name: user.displayName || user.email.split("@")[0] || "Google User",
      avatarUrl: user.photoURL || "",
      googleId: user.uid,
      idToken,
    };
  } catch (error: any) {
    console.error("[Firebase Google Auth Error]:", error);
    // Propagate meaningful error message
    if (error.code === "auth/popup-blocked") {
      throw new Error("Popup blocked by your browser. Please allow popups or use direct email sign-in.");
    } else if (error.code === "auth/popup-closed-by-user") {
      throw new Error("Google sign-in window was closed.");
    } else if (error.code === "auth/cancelled-popup-request") {
      throw new Error("Google sign-in request was cancelled.");
    } else if (error.code === "auth/unauthorized-domain") {
      throw new Error("Domain not authorized in Firebase Auth. Switching to alternative Google login mode.");
    }
    throw error;
  }
}

/**
 * Check if a redirect result exists (if redirect flow was used).
 */
export async function checkGoogleRedirectResult(): Promise<GoogleAuthResult | null> {
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user && result.user.email) {
      const user = result.user;
      const idToken = await user.getIdToken().catch(() => undefined);
      return {
        email: user.email.toLowerCase().trim(),
        name: user.displayName || user.email.split("@")[0] || "Google User",
        avatarUrl: user.photoURL || "",
        googleId: user.uid,
        idToken,
      };
    }
  } catch (e) {
    console.warn("No redirect auth result:", e);
  }
  return null;
}
