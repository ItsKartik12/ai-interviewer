import axios, { type AxiosInstance } from "axios";
import { getAuth } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { BACKEND_URL } from "@/lib/config";

/**
 * Authenticated axios instance for the backend API.
 *
 * Every request carries the current Firebase ID token as a Bearer credential.
 * The token is fetched lazily on each request so it is always fresh —
 * Firebase SDK caches and auto-refreshes it, `getIdToken()` only awaits a
 * network refresh when the cached token is within its expiry window.
 */
export const api: AxiosInstance = axios.create({
  baseURL: BACKEND_URL,
});

api.interceptors.request.use(async (config) => {
  const auth = getFirebaseAuth();
  if (auth?.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch (err) {
      console.warn("[api] Failed to attach auth token:", err);
    }
  }
  return config;
});

// On 401, sign the user out so the router redirects to /login with a
// clean session instead of leaving them stuck on failing pages.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const auth = getFirebaseAuth();
      // Only force sign-out if we actually had a session (otherwise it is a
      // plain unauthenticated visitor being redirected by the route guard).
      if (auth?.currentUser) {
        void auth.signOut();
      }
    }
    return Promise.reject(error);
  },
);
