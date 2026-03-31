import { useState, useMemo } from "react";
import { Pendencia, User, TipoImplantacao } from "@/types/pendencia";
import { mockPendencias } from "@/data/mockData";
import { LoginScreen } from "@/components/LoginScreen";
import { StatsCards } from "@/components/StatsCards";
import { FilterBar, Filters } from "@/components/FilterBar";
import { PendenciaTable } from "@/components/PendenciaTable";
import { CreatePendenciaDialog } from "@/components/CreatePendenciaDialog";
import { Button } from "@/components/ui/button";
import { LogOut, Shield, UserCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const emptyFilters: Filters = { colaborador: "", status: "", prioridade: "", origem: "", dataInicio: "", dataFim: "" };

const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  const [pendencias, setPendencias] = useState<Pendencia[]>(mockPendencias);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const colaboradores = useMemo(() => [...new Set(pendencias.map((p) => p.colaborador))], [pendencias]);

  const filteredPendencias = useMemo(() => {
    let result = pendencias;

    if (user?.role === "colaborador") {
      result = result.filter((p) => p.colaborador === user.nome);
    }

    if (filters.colaborador) result = result.filter((p) => p.colaborador === filters.colaborador);
    if (filters.status) result = result.filter((p) => p.status === filters.status);
    if (filters.prioridade) result = result.filter((p) => p.prioridade === filters.prioridade);
    if (filters.origem) result = result.filter((p) => p.origem === filters.origem);
    if (filters.dataInicio) result = result.filter((p) => p.data_vigencia >= filters.dataInicio);
    if (filters.dataFim) result = result.filter((p) => p.data_vigencia <= filters.dataFim);

    return result;
  }, [pendencias, filters, user]);

  const handleUpdatePendencia = (id: string, updates: Partial<Pendencia>) => {
    setPendencias((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const generateFingerprint = (razaoSocial: string, linha: number, tipo: TipoImplantacao): string => {
    // Simula o fingerprint que seria gerado pelo backend
    return razaoSocial
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9 ]/g, "")
      .replace(/\s+/g, "_") + `_${linha}_${tipo.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`;
  };

  const handleCreatePendencia = (data: any) => {
    const now = new Date().toISOString();
    const fingerprint = generateFingerprint(data.razao_social, data.linha_planilha, data.tipo_implantacao);
    const newPendencia: Pendencia = {
      id: `PND-${String(pendencias.length + 1).padStart(3, "0")}`,
      colaborador: data.colaborador,
      data_vigencia: data.data_vigencia,
      status: "Pendente",
      prioridade: data.prioridade,
      pendencias: [],
      texto_pendencia: data.texto_pendencia,
      origem: "Manual",
      ultima_atualizacao: now,
      razao_social: data.razao_social,
      linha_planilha: data.linha_planilha,
      tipo_implantacao: data.tipo_implantacao,
      fingerprint,
      erros: data.erros || [],
      historico: [
        { id: `h-${Date.now()}`, acao: "Pendência criada manualmente", usuario: user!.nome, dataHora: now },
      ],
    };
    setPendencias((prev) => [newPendencia, ...prev]);
  };

  const handleRefreshData = async () => {
    setIsRefreshing(true);
    // Simula chamada ao backend para reprocessar dados
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      // Em produção, aqui faria fetch ao backend e atualizaria setPendencias
      toast.success("Dados atualizados com sucesso! O backend reprocessou a planilha.");
    } catch {
      toast.error("Erro ao atualizar dados. Tente novamente.");
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!user) return <LoginScreen onLogin={setUser} />;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Controle de Pendências</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              {user.role === "admin" ? (
                <Shield className="h-4 w-4 text-primary" />
              ) : (
                <UserCheck className="h-4 w-4 text-accent" />
              )}
              <span className="font-medium text-foreground">{user.nome}</span>
              <span className="text-xs text-muted-foreground capitalize">({user.role})</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setUser(null); setFilters(emptyFilters); }}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-fade-in">
        {/* Title + Actions */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {user.role === "admin" ? "Dashboard Geral" : "Minhas Pendências"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {user.role === "admin"
                ? "Visão completa de todas as pendências operacionais"
                : "Pendências atribuídas a você"}
            </p>
          </div>
          {user.role === "admin" && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshData}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`} />
                {isRefreshing ? "Atualizando..." : "Atualizar Dados"}
              </Button>
              <CreatePendenciaDialog colaboradores={colaboradores} onSubmit={handleCreatePendencia} />
            </div>
          )}
        </div>

        {/* Stats */}
        <StatsCards pendencias={user.role === "admin" ? pendencias : pendencias.filter((p) => p.colaborador === user.nome)} />

        {/* Filters */}
        {user.role === "admin" && (
          <FilterBar filters={filters} onFiltersChange={setFilters} colaboradores={colaboradores} />
        )}
        {user.role === "colaborador" && (
          <FilterBar filters={filters} onFiltersChange={setFilters} colaboradores={[]} />
        )}

        {/* Table */}
        <PendenciaTable
          pendencias={filteredPendencias}
          userRole={user.role}
          userName={user.nome}
          onUpdatePendencia={handleUpdatePendencia}
        />
      </main>
    </div>
  );
};

export default Index;
