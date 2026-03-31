import { useState, useMemo } from "react";
import { Pendencia, User, TipoImplantacao, AdminLog } from "@/types/pendencia";
import { mockPendencias, mockUsers } from "@/data/mockData";
import { LoginScreen } from "@/components/LoginScreen";
import { StatsCards } from "@/components/StatsCards";
import { FilterBar, Filters } from "@/components/FilterBar";
import { PendenciaTable } from "@/components/PendenciaTable";
import { CreatePendenciaDialog } from "@/components/CreatePendenciaDialog";
import { CollaboratorManagerDialog } from "@/components/CollaboratorManagerDialog";
import { AdminLogsPanel } from "@/components/AdminLogsPanel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, Shield, UserCheck, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";

const emptyFilters: Filters = { colaborador: "", status: "", prioridade: "", origem: "", dataInicio: "", dataFim: "" };

const Index = () => {
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [user, setUser] = useState<User | null>(null);
  const [pendencias, setPendencias] = useState<Pendencia[]>(mockPendencias);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);

  // Agora colaboradores vêm do nosso state de Users (apenas os ativos e tipo 'colaborador')
  const colaboradores = useMemo(() =>
    users.filter(u => u.role === "colaborador" && u.status === "ativo").map((u) => u.nome),
    [users]);

  // Filtramos as pendências que não foram excluídas (soft delete)
  const activePendencias = useMemo(() => pendencias.filter(p => !p.isDeleted), [pendencias]);

  const filteredPendencias = useMemo(() => {
    let result = activePendencias;

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
  }, [activePendencias, filters, user]);

  const addAdminLog = (acao: string, detalhes?: string) => {
    if (!user || user.role !== "admin") return;
    const newLog: AdminLog = {
      id: `log-${Date.now()}`,
      acao,
      usuarioAdmin: user.nome,
      dataHora: new Date().toISOString(),
      detalhes
    };
    setAdminLogs(prev => [newLog, ...prev]);
  };

  const handleUpdatePendencia = (id: string, updates: Partial<Pendencia>) => {
    setPendencias((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    if (updates.status || updates.erros || updates.prioridade || updates.texto_pendencia) {
      addAdminLog("Edição/Atualização de Pendência", `A pendência ${id} recebeu uma atualização de conteúdo/status.`);
    }
  };

  const handleDeletePendencia = (id: string, motivo: string) => {
    handleUpdatePendencia(id, { isDeleted: true });
    addAdminLog("Exclusão de Pendência", `Pendência ${id} foi excluída. Motivo: ${motivo}`);
  };

  const generateFingerprint = (razaoSocial: string, linha: number, tipo: TipoImplantacao): string => {
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
    addAdminLog("Criação de Pendência Manual", `Pendência ${newPendencia.id} criada para o colaborador ${data.colaborador}.`);
  };

  const handleRefreshData = async () => {
    setIsRefreshing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      toast.success("Dados atualizados com sucesso! O backend reprocessou a planilha.");
    } catch {
      toast.error("Erro ao atualizar dados. Tente novamente.");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Gestão de Colaboradores (Admin)
  const handleAddUser = (newUserProps: Omit<User, "id">) => {
    const newId = `u-${Date.now()}`;
    const newUser: User = { ...newUserProps, id: newId };
    setUsers(prev => [...prev, newUser]);
    addAdminLog("Colaborador Adicionado", `O colaborador ${newUser.nome} (${newUser.role}) foi criado.`);
    toast.success("Colaborador registrado com sucesso.");
  };

  const handleEditUser = (id: string, updates: Partial<User>) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
    addAdminLog("Edição de Colaborador", `O colaborador ID ${id} sofreu edições cadastrais.`);
    toast.success("Colaborador atualizado.");
  };

  const handleDeleteUser = (id: string) => {
    const userToDelete = users.find(u => u.id === id);
    if (!userToDelete) return;

    // Validar se tem pendências ativas
    const hasActivePendencias = activePendencias.some(p => p.colaborador === userToDelete.nome && p.status === "Pendente");
    if (hasActivePendencias) {
      toast.error("Não é possível excluir. Este colaborador tem pendências ativas.");
      return;
    }

    setUsers(prev => prev.filter(u => u.id !== id));
    addAdminLog("Exclusão de Colaborador", `O colaborador ${userToDelete.nome} foi excluído do sistema.`);
    toast.success("Colaborador removido com sucesso.");
  };

  if (!user) {
    // Modify login to check our updated `users` payload
    const handleLoginCheck = (userLoggingIn: User) => {
      const u = users.find(existing => existing.nome === userLoggingIn.nome); // Simplification since full login is mock
      if (u && u.status === "inativo") {
        toast.error("Este usuário está inativo e não pode acessar o sistema.");
        return;
      }
      setUser(u || userLoggingIn);
    }
    return <LoginScreen onLogin={handleLoginCheck} />;
  }

  // Divisão visual
  const pendenciasEmAndamento = filteredPendencias.filter(p => p.status !== "OK");
  const pendenciasFinalizadas = filteredPendencias.filter(p => p.status === "OK");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">Ops Hub <span className="text-muted-foreground font-normal">| Controle de Pendências</span></h1>
          </div>
          <div className="flex items-center gap-4">
            {user.role === "admin" && (
              <div className="flex items-center gap-2">
                <AdminLogsPanel logs={adminLogs} />
                <CollaboratorManagerDialog
                  users={users}
                  onAdd={handleAddUser}
                  onEdit={handleEditUser}
                  onDelete={handleDeleteUser}
                />
              </div>
            )}
            <div className="h-4 w-px bg-border mx-1"></div>
            <div className="flex items-center gap-2 text-sm">
              {user.role === "admin" ? (
                <Shield className="h-4 w-4 text-primary" />
              ) : (
                <UserCheck className="h-4 w-4 text-accent" />
              )}
              <span className="font-medium text-foreground">{user.nome}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setUser(null); setFilters(emptyFilters); }} className="text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">
              {user.role === "admin" ? "Dashboard Geral" : "Minhas Pendências"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {user.role === "admin"
                ? "Visão completa de todas as pendências operacionais"
                : "Acompanhe e corrija as pendências designadas a você."}
            </p>
          </div>
          {user.role === "admin" && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshData}
                disabled={isRefreshing}
                className="bg-card"
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`} />
                {isRefreshing ? "Atualizando..." : "Atualizar Dados (ERP)"}
              </Button>
              <CreatePendenciaDialog colaboradores={colaboradores} onSubmit={handleCreatePendencia} />
            </div>
          )}
        </div>

        {/* Stats */}
        <StatsCards pendencias={user.role === "admin" ? activePendencias : activePendencias.filter((p) => p.colaborador === user.nome)} />

        {/* Filters */}
        {user.role === "admin" && (
          <FilterBar filters={filters} onFiltersChange={setFilters} colaboradores={colaboradores} />
        )}

        {/* Views de Tabela */}
        {user.role === "admin" ? (
          <Tabs defaultValue="em-andamento" className="w-full">
            <TabsList className="mb-4 bg-muted/50 border">
              <TabsTrigger value="em-andamento" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Em Andamento
                <span className="ml-2 bg-primary/10 text-primary py-0.5 px-2 rounded-full text-xs">{pendenciasEmAndamento.length}</span>
              </TabsTrigger>
              <TabsTrigger value="finalizadas" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Finalizadas
                <span className="ml-2 bg-muted-foreground/10 text-muted-foreground py-0.5 px-2 rounded-full text-xs">{pendenciasFinalizadas.length}</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="em-andamento" className="m-0 mt-4 border-none p-0 outline-none">
              <PendenciaTable
                pendencias={pendenciasEmAndamento}
                userRole={user.role}
                userName={user.nome}
                onUpdatePendencia={handleUpdatePendencia}
                onDeletePendencia={handleDeletePendencia}
              />
            </TabsContent>
            <TabsContent value="finalizadas" className="m-0 mt-4 border-none p-0 outline-none">
              <PendenciaTable
                pendencias={pendenciasFinalizadas}
                userRole={user.role}
                userName={user.nome}
                onUpdatePendencia={handleUpdatePendencia}
                onDeletePendencia={handleDeletePendencia}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-12">
            <div>
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  Pendências Abertas
                </h3>
                <p className="text-sm text-muted-foreground">Requerem sua atenção imediata para correção.</p>
              </div>
              <div className="ring-1 ring-primary/20 rounded-lg shadow-sm">
                <PendenciaTable
                  pendencias={filteredPendencias.filter(p => p.status === "Pendente")}
                  userRole={user.role}
                  userName={user.nome}
                  onUpdatePendencia={handleUpdatePendencia}
                />
              </div>
            </div>

            <div className="opacity-80 transition-opacity hover:opacity-100 relative">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-muted-foreground flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Pendências Concluídas
                </h3>
                <p className="text-sm text-muted-foreground">Documentos já corrigidos ou finalizados com sucesso.</p>
              </div>
              <div className="grayscale-[0.3]">
                <PendenciaTable
                  pendencias={filteredPendencias.filter(p => p.status !== "Pendente")}
                  userRole={user.role}
                  userName={user.nome}
                  onUpdatePendencia={handleUpdatePendencia}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
