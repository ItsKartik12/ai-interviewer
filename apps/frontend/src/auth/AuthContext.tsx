import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, isFirebaseClientConfigured } from "@/lib/firebase";
import { firebaseAuthMessage } from "@/lib/auth-errors";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseClientConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      configured,
      async login(email: string, password: string) {
        const auth = getFirebaseAuth();
        if (!auth) {
          throw new Error("Firebase is not configured. Add PUBLIC_FIREBASE_* values to your frontend .env.");
        }
        try {
          await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
          throw new Error(firebaseAuthMessage(error));
        }
      },
      async register(email: string, password: string) {
        const auth = getFirebaseAuth();
        if (!auth) {
          throw new Error("Firebase is not configured. Add PUBLIC_FIREBASE_* values to your frontend .env.");
        }
        try {
          await createUserWithEmailAndPassword(auth, email, password);
        } catch (error) {
          throw new Error(firebaseAuthMessage(error));
        }
      },
      async loginWithGoogle() {
        const auth = getFirebaseAuth();
        if (!auth) {
          throw new Error("Firebase is not configured. Add PUBLIC_FIREBASE_* values to your frontend .env.");
        }
        try {
          await signInWithPopup(auth, new GoogleAuthProvider());
        } catch (error) {
          throw new Error(firebaseAuthMessage(error));
        }
      },
      async logout() {
        const auth = getFirebaseAuth();
        if (!auth) {
          return;
        }
        await signOut(auth);
      },
    }),
    [configured, loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
