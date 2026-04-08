import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn, Shield, UserPlus, Loader2, KeyRound, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

type AuthState = "LOGIN" | "REGISTER" | "FORGOT";

export function LoginScreen() {
  const { login, register, resetPassword } = useAuth();
  const [authState, setAuthState] = useState<AuthState>("LOGIN");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast.error("Por favor, informe seu e-mail.");
      return;
    }

    if (authState !== "FORGOT" && !password) {
      toast.error("Por favor, informe a senha.");
      return;
    }

    setLoading(true);

    try {
      if (authState === "LOGIN") {
        await login(email, password);
        toast.success("Login realizado com sucesso!");
      } else if (authState === "REGISTER") {
        if (password !== confirmPassword) {
          toast.error("As senhas não coincidem. Verifique e tente novamente.");
          setLoading(false);
          return;
        }
        await register(email, password);
        toast.success("Conta ativada com sucesso! Bem-vindo.");
      } else if (authState === "FORGOT") {
        await resetPassword(email);
        toast.success("Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha.");
        setAuthState("LOGIN");
      }
    } catch (error: any) {
      console.error("Erro na autenticação:", error);
      
      let msg = "Ocorreu um erro inesperado.";
      
      if (error.message === "USUARIO_NAO_AUTORIZADO") {
        msg = "Usuário não autorizado. Solicite cadastro ao administrador.";
      } else if (error.message === "USUARIO_INATIVO") {
        msg = "Usuário inativo. Contate o administrador.";
      } else if (error.code === "auth/invalid-credential") {
        msg = "Credenciais inválidas. Verifique e tente novamente.";
      } else if (error.code === "auth/user-not-found") {
        msg = "E-mail não encontrado.";
      } else if (error.code === "auth/wrong-password") {
        msg = "Senha incorreta.";
      } else if (error.code === "auth/email-already-in-use") {
        msg = "Este e-mail já possui uma conta ativa. Faça login.";
      } else if (error.code === "auth/weak-password") {
        msg = "A senha deve ter pelo menos 6 caracteres.";
      }
      
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const toggleAuthState = (state: AuthState) => {
    setAuthState(state);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background">
      <Card className="w-full max-w-sm border-border shadow-2xl animate-in fade-in zoom-in duration-300">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-primary shadow-lg shadow-primary/20 flex items-center justify-center transform transition-transform hover:scale-105 duration-300">
            <Shield className="h-8 w-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground tracking-tight">
            SulAmérica <span className="font-light text-muted-foreground">| Pendências</span>
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            {authState === "LOGIN" && "Acesse o painel de governança"}
            {authState === "REGISTER" && "Defina sua senha de primeiro acesso"}
            {authState === "FORGOT" && "Recuperação de acesso"}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Email corporativo</label>
              <Input
                type="email"
                placeholder="nome@sulamerica.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="bg-muted/30 focus-visible:ring-primary/30 h-10"
              />
            </div>

            {authState !== "FORGOT" && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">
                  {authState === "REGISTER" ? "Digite sua nova senha" : "Senha"}
                </label>
                <div className="relative group">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="******"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={authState === "REGISTER" ? "new-password" : "current-password"}
                    className="bg-muted/30 focus-visible:ring-primary/30 h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {authState === "REGISTER" && (
              <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Confirme sua senha</label>
                <div className="relative group">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="******"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className="bg-muted/30 focus-visible:ring-primary/30 h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/10 transition-all active:scale-95"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  {authState === "LOGIN" && <LogIn className="h-4 w-4 mr-2" />}
                  {authState === "REGISTER" && <UserPlus className="h-4 w-4 mr-2" />}
                  {authState === "FORGOT" && <KeyRound className="h-4 w-4 mr-2" />}
                  {authState === "LOGIN" && "Entrar Sistema"}
                  {authState === "REGISTER" && "Ativar Conta"}
                  {authState === "FORGOT" && "Enviar Link de Reset"}
                </>
              )}
            </Button>
          </form>

          <div className="flex flex-col gap-3 mt-6 pt-4 border-t border-border/50">
            {authState === "LOGIN" ? (
              <>
                <button
                  type="button"
                  className="text-xs text-primary hover:text-primary/80 font-semibold transition-colors flex items-center justify-center gap-1"
                  onClick={() => toggleAuthState("REGISTER")}
                >
                  <UserPlus className="h-3 w-3" />
                  Primeiro acesso / Definir senha
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-primary font-medium transition-colors"
                  onClick={() => toggleAuthState("FORGOT")}
                >
                  Esqueci minha senha
                </button>
              </>
            ) : (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-primary font-semibold transition-colors flex items-center justify-center gap-1 group"
                onClick={() => toggleAuthState("LOGIN")}
              >
                <ArrowLeft className="h-3 w-3 group-hover:-translate-x-0.5 transition-transform" />
                Voltar para o Login
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
