import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LayoutDashboard, FileBarChart, CircleDollarSign, LogOut } from "lucide-react";
import logoImg from "@/assets/brand/sulamerica_logo.png";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile: user, logout, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const navItems = [
    {
      title: "Painel Operacional",
      href: "/",
      icon: LayoutDashboard,
      roles: ["admin", "socio", "colaborador"],
    },
    {
      title: "Volumetria",
      href: "/pipeline",
      icon: FileBarChart,
      roles: ["admin", "socio"],
    },
    {
      title: "Auditoria Financeira",
      href: "/financas",
      icon: CircleDollarSign,
      roles: ["admin"], // Restrito ao admin
    },
  ];

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">Carregando...</div>;
  }

  // Se não estiver logado, renderiza apenas o conteúdo (como a tela de login)
  if (!user) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-brand-light font-sans text-brand-blue flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-borderLight shadow-sm flex flex-col z-20">
        <div className="h-1.5 w-full bg-brand-orange"></div>
        <div className="p-6 flex flex-col items-center border-b border-borderLight">
          <img src={logoImg} alt="SulAmérica" className="h-8 object-contain mb-4" />
          <h1 className="text-sm font-bold text-brand-blue tracking-tight leading-none uppercase text-center">
            Operações Corporativas
          </h1>
          <span className="text-[10px] text-brand-orange font-bold uppercase tracking-widest mt-1 text-center">
            Conformidade e Pendências
          </span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            if (user && !item.roles.includes(user.role)) return null;

            const isActive = location.pathname === item.href;

            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-brand-blue/10 text-brand-blue font-bold"
                    : "text-muted-foreground hover:bg-gray-100 hover:text-brand-blue"
                )}
              >
                <item.icon className={cn("h-5 w-5", isActive ? "text-brand-orange" : "text-gray-400")} />
                {item.title}
              </Link>
            );
          })}
        </nav>

        {user && (
          <div className="p-4 border-t border-borderLight bg-gray-50 flex flex-col gap-3">
            <div className="flex flex-col">
              <span className="font-semibold text-brand-blue text-sm truncate">{user.nome}</span>
              <span className="text-[10px] text-brand-muted uppercase font-bold tracking-tighter">
                {user.role === "admin" ? "Administrador" : user.role === "socio" ? "Sócio Gestor" : "Colaborador"}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="w-full text-brand-blue border-brand-blue hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors justify-start gap-2"
            >
              <LogOut className="h-4 w-4" />
              Sair do Sistema
            </Button>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
};
