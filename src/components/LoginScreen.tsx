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
    <div className="min-h-screen flex items-center justify-center p-4 bg-brand-light relative overflow-hidden font-sans">
      {/* Background SVG Brand Waves Placeholder */}
      <img
        src="/src/assets/brand/brand_waves.svg"
        alt=""
        className="absolute bottom-[-10%] right-[-5%] w-3/4 max-w-[1000px] opacity-70 pointer-events-none z-0"
      />

      {/* Selo 130 Anos opcional (topo) */}
      <div className="absolute top-8 left-8 z-0 hidden md:block">
        <img src="/src/assets/brand/sulamerica_130anos.png" alt="130 Anos" className="h-16 opacity-80" />
      </div>

      <Card className="w-full max-w-[420px] bg-white border-none shadow-[0px_8px_24px_rgba(29,46,93,0.08)] rounded-[12px] z-10 animate-in fade-in zoom-in duration-300">
        <CardHeader className="text-center pb-2 pt-8">
          <div className="mx-auto flex flex-col items-center justify-center mb-6">
            <img src="/src/assets/brand/sulamerica_logo.png" alt="SulAmérica Logo" className="h-14 object-contain" />
          </div>
          <CardTitle className="text-[22px] font-bold text-brand-blue tracking-normal">
            Operações Corporativas
          </CardTitle>
          <p className="text-[13px] text-brand-muted mt-2 font-medium">
            {authState === "LOGIN" && "Acesso exclusivo a colaboradores e parceiros."}
            {authState === "REGISTER" && "Defina sua senha de administrador ou parceiro."}
            {authState === "FORGOT" && "Recuperação do seu acesso corporativo."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-4 px-8 pb-8">
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

            {authState === "LOGIN" && (
              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-borderLight"></div>
                <div className="flex-grow border-t border-borderLight"></div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 bg-brand-primary hover:bg-brand-primary/90 text-white font-bold rounded-[8px] shadow-[0px_4px_16px_rgba(0,102,255,0.2)] transition-all active:scale-95 text-[14px] uppercase tracking-wide flex items-center justify-center"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  {authState === "LOGIN" && (
                    <>
                      <div className="flex items-center space-x-1 mr-2 opacity-80">
                        <div className="h-2 w-2 bg-brand-blue rounded-full"></div>
                        <div className="h-2 w-2 bg-brand-orange rounded-full"></div>
                      </div>
                      Entrar
                    </>
                  )}
                  {authState === "REGISTER" && "ATIVAR MEU ACESSO"}
                  {authState === "FORGOT" && "ENVIAR LINK DE REDEFINIÇÃO"}
                </>
              )}
            </Button>
          </form>

          <div className="flex flex-col gap-3 mt-6 pt-4 border-t border-borderLight">
            {authState === "LOGIN" ? (
              <>
                <button
                  type="button"
                  className="text-[13px] text-brand-blue hover:text-brand-primary font-semibold transition-colors flex items-center justify-center gap-1"
                  onClick={() => toggleAuthState("REGISTER")}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Primeiro acesso? Cadastre-se aqui
                </button>
                <button
                  type="button"
                  className="text-[13px] text-brand-muted hover:text-brand-primary font-medium transition-colors"
                  onClick={() => toggleAuthState("FORGOT")}
                >
                  Esqueci minha senha
                </button>
              </>
            ) : (
              <button
                type="button"
                className="text-[13px] text-brand-muted hover:text-brand-primary font-semibold transition-colors flex items-center justify-center gap-1 group"
                onClick={() => toggleAuthState("LOGIN")}
              >
                <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
                Voltar para Autenticação
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
