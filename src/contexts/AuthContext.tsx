import React, { createContext, useContext, useEffect, useState } from "react";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail,
  User as FirebaseUser 
} from "firebase/auth";
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { User, UserRole } from "@/types/pendencia";

interface AuthContextType {
  user: FirebaseUser | null;
  profile: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: (redirect?: boolean) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Normaliza o email para usar como ID no Firestore
  const normalizeEmail = (email: string) => email.toLowerCase().trim();

  const fetchProfile = async (firebaseUser: FirebaseUser) => {
    try {
      // 1. A ÚNICA fonte da verdade é usuarios/{auth.uid}
      const uidRef = doc(db, "usuarios", firebaseUser.uid);
      const uidSnap = await getDoc(uidRef);

      if (!uidSnap.exists()) {
        throw new Error("PERFIL_NAO_ENCONTRADO");
      }

      const data = uidSnap.data();
      
      // Auto-detecção de Schema
      let resolvedRole: UserRole | undefined;
      let resolvedStatus: "ativo" | "inativo" | undefined;

      // Schema 1: role / status (string)
      if (data.role && data.status !== undefined) {
        resolvedRole = data.role as UserRole;
        resolvedStatus = data.status as "ativo" | "inativo";
      } 
      // Schema 2: perfil / ativo (boolean)
      else if (data.perfil && data.ativo !== undefined) {
        resolvedRole = data.perfil as UserRole;
        resolvedStatus = data.ativo ? "ativo" : "inativo";
      }

      // Se não tem nem Schema 1 nem 2, o perfil é incompleto. Bloquear.
      if (!resolvedRole || !resolvedStatus) {
        throw new Error("PERFIL_NAO_ENCONTRADO");
      }

      // Check Inativo independente do schema que definiu
      if (resolvedStatus !== "ativo") {
        throw new Error("USUARIO_INATIVO");
      }

      setProfile({
        id: firebaseUser.uid,
        nome: data.nome || "Usuário", // Para não bugar a UI caso o nome falte
        email: data.email || firebaseUser.email || "",
        role: resolvedRole,
        status: resolvedStatus,
      });
    } catch (error: any) {
      console.error("Erro ao buscar perfil:", error.message);
      if (error.message === "USUARIO_INATIVO" || error.message === "PERFIL_NAO_ENCONTRADO") {
        // Bloquear sem fallbacks
        await logout(false);
        throw error;
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          await fetchProfile(firebaseUser);
        } catch (e) {
          setUser(null);
          setProfile(null);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    // Limpeza de cache preventiva
    localStorage.clear();
    sessionStorage.clear();
    
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await fetchProfile(credential.user);
  };

  const register = async (email: string, password: string) => {
    const normalized = normalizeEmail(email);
    // Validação na nova coleção de pré-cadastros
    const preDocRef = doc(db, "pre_cadastros", normalized);
    const preSnap = await getDoc(preDocRef);

    if (!preSnap.exists()) {
      throw new Error("USUARIO_NAO_AUTORIZADO");
    }

    const data = preSnap.data();
    if (data.status !== "ativo") {
      throw new Error("USUARIO_INATIVO");
    }

    let firebaseUser: FirebaseUser;

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      firebaseUser = credential.user;
    } catch (error: any) {
      if (error.code === "auth/email-already-in-use") {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        firebaseUser = credential.user;
      } else {
        throw error;
      }
    }

    const uid = firebaseUser.uid;

    // Criar perfil definitivo no Firestore usando UID como chave
    await setDoc(doc(db, "usuarios", uid), {
      nome: data.nome,
      email: data.email,
      role: data.role,
      status: "ativo",
      uid: uid,
      criado_em: serverTimestamp(),
      atualizado_em: serverTimestamp(),
    });

    await fetchProfile(firebaseUser);
  };

  const logout = async (redirect = true) => {
    await signOut(auth);
    localStorage.clear();
    sessionStorage.clear();
    setUser(null);
    setProfile(null);
  };

  const resetPassword = async (email: string) => {
    // Para segurança, o Firebase não diz se o email existe. 
    // Nós apenas chamamos a função.
    await sendPasswordResetEmail(auth, email);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, register, logout, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
