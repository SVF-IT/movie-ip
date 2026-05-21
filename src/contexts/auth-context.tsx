"use client";

import { getUserProfile } from "@/lib/api/auth";
import { createClient } from "@/lib/supabase/client";
import { UserProfile, UserRole } from "@/lib/types/database";
import { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  mustChangePassword: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const supabase = createClient();

  const fetchInFlightRef = useRef<string | null>(null);
  const profileLoadedIdRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    // Skip if already fetching or if profile already exists for this user
    if (fetchInFlightRef.current === userId || profileLoadedIdRef.current === userId) return true;
    fetchInFlightRef.current = userId;

    try {
      const userProfile = await getUserProfile(userId);
      setProfile(userProfile);

      if (userProfile) {
        profileLoadedIdRef.current = userProfile.id;
      } else {
        profileLoadedIdRef.current = null;
      }

      // Check if user must change password
      if (userProfile) {
        setMustChangePassword(userProfile.must_change_password ?? false);
      } else {
        // If no profile found, reset the password change flag
        setMustChangePassword(false);
      }
      return true;
    } catch (error) {
      console.error("Error fetching profile:", error);
      setProfile(null);
      setMustChangePassword(false);
      // Don't block the app if profile fetch fails - user is still authenticated
      return false;
    } finally {
      fetchInFlightRef.current = null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  }, [user, fetchProfile]);

  useEffect(() => {
    let mounted = true;
    let isInitializing = true;

    // Get initial session
    const initializeAuth = async () => {
      try {
        // Get the session from storage
        const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("Error getting session:", sessionError);
        }

        if (!mounted) return;

        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        if (initialSession?.user) {
          // Fetch profile but don't block on it - handle errors gracefully
          try {
            await fetchProfile(initialSession.user.id);
          } catch (error) {
            console.error("Error fetching profile during init:", error);
            // Continue anyway - user is authenticated even if profile fetch fails
          }
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
      } finally {
        // Always set loading to false and mark initialization as complete
        isInitializing = false;
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, currentSession: Session | null) => {
        if (!mounted) return;

        // Skip handling during initial auth setup to avoid race conditions
        if (isInitializing && event === "SIGNED_IN") {
          return;
        }

        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          // Only fetch profile if it's not already loaded for this user
          // or if it's a significant event like SIGNED_IN or USER_UPDATED
          const shouldFetch =
            profileLoadedIdRef.current !== currentSession.user.id ||
            ["SIGNED_IN", "USER_UPDATED"].includes(event);

          if (shouldFetch) {
            try {
              await fetchProfile(currentSession.user.id);
            } catch (error) {
              console.error("Error fetching profile on auth change:", error);
            }
          }
        } else {
          setProfile(null);
          profileLoadedIdRef.current = null;
          setMustChangePassword(false);
        }

        if (event === "SIGNED_OUT") {
          setProfile(null);
          setMustChangePassword(false);
        }

        // Make sure loading is false after auth state changes
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
    setUser(null);
    setProfile(null);
    profileLoadedIdRef.current = null;
    setSession(null);
    setMustChangePassword(false);
  };

  const isAdmin = profile?.role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        isAdmin,
        mustChangePassword,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Hook to check if user has specific role
export function useHasRole(allowedRoles: UserRole[]) {
  const { profile, loading } = useAuth();

  if (loading || !profile) {
    return { hasRole: false, loading };
  }

  return {
    hasRole: allowedRoles.includes(profile.role),
    loading,
  };
}

// Hook to check if user can perform admin actions
export function useIsAdmin() {
  const { isAdmin, loading } = useAuth();
  return { isAdmin, loading };
}
