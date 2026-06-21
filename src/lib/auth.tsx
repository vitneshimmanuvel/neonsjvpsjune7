import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { User } from './api';
import { firebaseGetMe, ensureDefaultAdmin, subscribeToMe } from './firebaseAuth';

const TOKEN_KEY = 'recordbook_token';
const USER_KEY = 'recordbook_user';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Session-based auth: uses sessionStorage so closing the tab/browser logs the user out.
 * Also stores in localStorage for tab-duplication support, but clears on beforeunload.
 */
function loadSession(): { token: string | null; user: User | null } {
  // Scoped to sessionStorage only to prevent cross-tab session leakage and collisions
  const savedToken = sessionStorage.getItem(TOKEN_KEY);
  const savedUser = sessionStorage.getItem(USER_KEY);

  if (savedToken && savedUser) {
    try {
      const parsed = JSON.parse(savedUser);
      if (parsed && (parsed.email || parsed.name)) {
        return { token: savedToken, user: parsed };
      }
    } catch {
      // corrupted
    }
  }

  // Clean up sessionStorage only
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  return { token: null, user: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session] = useState(loadSession);
  const [token, setToken] = useState<string | null>(session.token);
  const [user, setUser] = useState<User | null>(session.user);
  const [isLoading, setIsLoading] = useState(!!session.token);

  const login = useCallback((newToken: string, newUser: User) => {
    // Store in sessionStorage only
    sessionStorage.setItem(TOKEN_KEY, newToken);
    sessionStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // Validate session with Firebase and subscribe to updates (permissions, status)
  useEffect(() => {
    ensureDefaultAdmin().catch(() => {});

    if (!token) {
      setIsLoading(false);
      return;
    }

    const unsubscribe = subscribeToMe(token, (serverUser) => {
      if (serverUser) {
        if (serverUser.status && serverUser.status !== 'active') {
          logout();
          return;
        }
        // Sync to sessionStorage only
        sessionStorage.setItem(USER_KEY, JSON.stringify(serverUser));
        setUser(serverUser as User);
        setIsLoading(false);
      }
    }, (err) => {
      console.error('User subscription error:', err);
      logout();
      setIsLoading(false);
    });

    return () => { unsubscribe(); };
  }, [token, logout]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
