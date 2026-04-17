import { useState, useMemo, useEffect } from "react";
import emailjs from "@emailjs/browser";
import UploadCsvPanel from "@/components/jobs/UploadCsvPanel";
import { Pendencia, User, UserRole, TipoImplantacao, AdminLog } from "@/types/pendencia";
import { useAuth } from "@/contexts/AuthContext";
import { LoginScreen } from "@/components/LoginScreen";
import { StatsCards } from "@/components/StatsCards";
import { FilterBar, Filters } from "@/components/FilterBar";
import { PendenciaTable } from "@/components/PendenciaTable";
import { CreatePendenciaDialog } from "@/components/CreatePendenciaDialog";
import { CollaboratorManagerDialog } from "@/components/CollaboratorManagerDialog";
import { AdminLogsPanel } from "@/components/AdminLogsPanel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, Shield, UserCheck, RefreshCw, Check, LineChart, BriefcaseBusiness, Users as UsersIcon, Clock, AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { SocioCharts } from "@/components/socio/SocioCharts";
import { SendEmailDialog } from "@/components/socio/SendEmailDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth, db } from "@/lib/firebase";
import { collection, doc, onSnapshot, query, where, addDoc, updateDoc, setDoc, deleteDoc, serverTimestamp, Timestamp, orderBy } from "firebase/firestore";
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import logoImg from "@/assets/brand/sulamerica_logo.png";

const emptyFilters: Filters = { colaborador_id: "", status: "", prioridade: "", origem: "", data_inicio: "", data_fim: "", tipo_implantacao: "" };

const Index = () => {
  const { profile: user, loading, logout } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [listenerError, setListenerError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);

  // 1. Escutar usuários em tempo real (Apenas Admin)
  useEffect(() => {
    if (!user || user.role !== "admin") return;

    // Escutamos apenas se for admin, pois as Rules bloqueiam listagem de usuarios para não admins
    const unsubscribeUsers = onSnapshot(
      collection(db, "usuarios"),
      (snapshot) => {
        const usersData = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            nome: data.nome,
            email: data.email,
            role: data.role as UserRole,
            status: data.status as "ativo" | "inativo",
            uid: data.uid,
            criado_em: data.criado_em,
            atualizado_em: data.atualizado_em
          };
        }) as User[];
        setUsers(usersData);
      },
      (error) => {
        console.error("onSnapshot Erro permissão Usuarios:", error);
      }
    );

    const qLogs = query(collection(db, "admin_logs"), orderBy("dataHora", "desc"));
    const unsubscribeLogs = onSnapshot(
      qLogs,
      (snapshot) => {
        const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AdminLog[];
        setAdminLogs(logsData.slice(0, 50)); // manter só os ultimos 50 exibidos
      },
      (error) => {
        console.error("onSnapshot Erro Logs:", error);
      }
    );

    return () => { unsubscribeUsers(); unsubscribeLogs(); };
  }, [user]);

  // 2. Escutar pendencias em tempo real (Filtrado para colaborador)
  useEffect(() => {
    if (!user) return;
    let pendenciasQuery = collection(db, "pendencias") as any;

    if (user.role === "colaborador") {
      pendenciasQuery = query(collection(db, "pendencias"), where("colaborador_id", "==", user.id));
    }

    const unsubscribePend = onSnapshot(
      pendenciasQuery,
      (snapshot) => {
        setListenerError(null);
        const pendsData = snapshot.docs.map(doc => {
          const data = doc.data();

          // Compatibilidade In-memory (Fallback preventivo)
          const statusVal = data.status || "Pendente";
          const prioriVal = data.prioridade || "Media";
          const origemVal = data.origem || "Manual";
          const colabIdVal = data.colaborador_id || "sem_responsavel";
          const delVal = data.isDeleted === undefined ? false : data.isDeleted;

          return {
            id: doc.id,
            ...data,
            status: statusVal,
            prioridade: prioriVal,
            origem: origemVal,
            isDeleted: delVal,
            colaborador_id: colabIdVal,
            pendencias: data.itens_pendentes || data.erros || [],
            erros: data.erros || data.itens_pendentes || [],
          } as Pendencia;
        });
        setPendencias(pendsData);
      },
      (error) => {
        console.error("onSnapshot Erro de Permissão Pendencias:", error.message);
        setListenerError(`Erro de Acesso: O Firebase bloqueou a leitura de pendências. (${error.message})`);
        // Não jogamos array vazio para não fingir que apagou as coisas; mantemos o array e só alertamos.
      }
    );

    return () => unsubscribePend();
  }, [user]);


  const colaboradores = useMemo(() => {
    const map = new Map<string, { id: string; nome: string }>();
    users.filter(u => u.role === "colaborador" && u.status === "ativo").forEach(u => {
      map.set(u.id, { id: u.id, nome: u.nome });
    });
    return Array.from(map.values());
  }, [users]);

  const activePendencias = useMemo(() => pendencias.filter(p => !p.isDeleted), [pendencias]);

  const filteredPendencias = useMemo(() => {
    let result = activePendencias;
    if (filters.colaborador_id) result = result.filter((p) => p.colaborador_id === filters.colaborador_id);
    if (filters.status) result = result.filter((p) => p.status === filters.status);
    if (filters.prioridade) result = result.filter((p) => p.prioridade === filters.prioridade);
    if (filters.origem) result = result.filter((p) => p.origem === filters.origem);
    if (filters.tipo_implantacao) result = result.filter((p) => p.tipo_implantacao === filters.tipo_implantacao);
    if (filters.data_inicio || filters.data_fim) {
      result = result.filter((p) => {
        if (!p.data_vigencia) return false;

        let dateVal: string;
        const val = p.data_vigencia as any;

        if (val && typeof val === 'object' && 'seconds' in val) {
          dateVal = new Date(val.seconds * 1000).toISOString().split('T')[0];
        } else {
          dateVal = p.data_vigencia.toString();
        }

        if (filters.data_inicio && dateVal < filters.data_inicio) return false;
        if (filters.data_fim && dateVal > filters.data_fim) return false;
        return true;
      });
    }

    return result;
  }, [activePendencias, filters]);

  const addAdminLog = async (acao: string, detalhes?: string) => {
    if (!user || user.role !== "admin") return;
    try {
      await addDoc(collection(db, "admin_logs"), {
        acao,
        usuarioAdmin: user.nome,
        dataHora: new Date().toISOString(),
        detalhes: detalhes || null
      });
    } catch (e) {
      console.error("Erro ao salvar log de auditoria", e);
    }
  };

  const executeUpdateAndHistory = async (id: string, updates: Partial<Pendencia>, acao: string, detalhes?: string) => {
    const now = new Date().toISOString();

    // Mapeamento extra se passar colaborador antigo, converter
    const finalUpdates: any = { ...updates, atualizado_em: now };

    if ((updates as any).colaborador) {
      const nomeAlvo = (updates as any).colaborador.trim();
      const u = users.find(x => x.nome.trim() === nomeAlvo);
      finalUpdates.colaborador_nome = nomeAlvo;
      if (u) {
        finalUpdates.colaborador_id = u.id;
      } else {
        console.warn("Colaborador não encontrado para o nome:", nomeAlvo);
        toast.error(`Não foi possível encontrar o ID de ${nomeAlvo}. Verifique se ele está ativo.`);
      }
      delete finalUpdates.colaborador;
    }

    if (updates.erros || updates.pendencias) {
      finalUpdates.itens_pendentes = updates.erros || updates.pendencias;
      delete finalUpdates.erros;
      delete finalUpdates.pendencias;
    }

    // Não escrever no doc o array de history antigo
    delete finalUpdates.historico;

    try {
      // 1. Atualizar o Doc
      await updateDoc(doc(db, "pendencias", id), finalUpdates);

      // 2. Gravar o Histórico na subcollection
      await addDoc(collection(db, `pendencias/${id}/historico`), {
        acao,
        usuario_id: user?.id,
        usuario_nome: user?.nome,
        perfil: user?.role,
        timestamp: now,
        comentario: updates.comentario_colaborador || detalhes || null,
      });

      if (updates.status || detalhes) {
        addAdminLog(`Atualização Automática: ${acao}`, `ID: ${id}`);
      }
    } catch (e) {
      toast.error("Erro ao sincronizar com o banco de dados.");
      console.error(e);
    }
  };

  const handleUpdatePendencia = (id: string, updates: Partial<Pendencia>) => {
    let actionStr = "editada";
    if (updates.status === "Corrigida") actionStr = "corrigida";
    if (updates.status === "OK") actionStr = "validada";
    if (updates.status === "Pendente") actionStr = "reaberta";
    if (updates.prioridade && !updates.status) actionStr = "prioridade_alterada";

    executeUpdateAndHistory(id, updates, actionStr, updates.comentario_colaborador);
  };

  const handleDeletePendencia = (id: string, motivo: string) => {
    executeUpdateAndHistory(id, { isDeleted: true, status: "Ignorada" }, "excluida", motivo);
    addAdminLog("Exclusão de Pendência", `Pendência ${id} excluída. Motivo: ${motivo}`);
    toast.success("Pendência excluída do painel.");
  };

  const generateFingerprint = (razaoSocial: string, linha: number, tipo: TipoImplantacao): string => {
    return razaoSocial
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9 ]/g, "")
      .replace(/\s+/g, "_") + `_${linha}_${tipo.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`;
  };

  const handleCreatePendencia = async (data: any) => {
    const now = new Date().toISOString();
    const fingerprint = generateFingerprint(data.razao_social, data.linha_planilha, data.tipo_implantacao);

    const colabTarget = users.find(u => u.nome === data.colaborador);

    const newPendenciaData = {
      colaborador_id: colabTarget ? (colabTarget.uid || colabTarget.id) : "sem_id",
      colaborador_nome: data.colaborador,
      data_vigencia: data.data_vigencia,
      status: "Pendente",
      prioridade: data.prioridade,
      itens_pendentes: [],
      texto_pendencia: data.texto_pendencia,
      origem: "Manual",
      criado_em: now,
      atualizado_em: now,
      razao_social: data.razao_social,
      linha_planilha: data.linha_planilha,
      tipo_implantacao: data.tipo_implantacao,
      fingerprint,
      erros: data.erros || [],
      isDeleted: false,
    };

    try {
      const docRef = await addDoc(collection(db, "pendencias"), newPendenciaData);
      await addDoc(collection(db, `pendencias/${docRef.id}/historico`), {
        acao: "criada",
        usuario_id: user?.id,
        usuario_nome: user?.nome,
        perfil: user?.role,
        timestamp: now,
        comentario: "Pendência inserida manualmente"
      });
      addAdminLog("Criação de Pendência Manual", `Criada para ${data.colaborador}.`);
      toast.success("Pendência criada com sucesso.");
    } catch (e) {
      toast.error("Erro ao criar pendência.");
      console.error(e);
    }
  };


  const handleRefreshData = async () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success("Dados sincronizados com o servidor.");
    }, 1500);
  };

  const handleSendEmailToBackend = async (prazo: number) => {
    if (!user || (user.role !== "admin" && user.role !== "socio")) {
      toast.error("Você não tem permissão para disparar e-mails de cobrança.");
      return;
    }

    try {
      // 1. Agrupar pendências por colaborador
      // Filtramos apenas as que estão 'Pendente' e não deletadas
      const pendingItems = activePendencias.filter(p => p.status === "Pendente");
      const pendsByColab: Record<string, Pendencia[]> = {};
      
      pendingItems.forEach(p => {
        const key = p.colaborador_id || p.colaborador_nome || "sem_identificacao";
        if (!pendsByColab[key]) pendsByColab[key] = [];
        pendsByColab[key].push(p);
      });

      const colabGroups = Object.entries(pendsByColab);
      const totalColaboradores = colabGroups.length;

      if (totalColaboradores === 0) {
        toast.info("Não há pendências em aberto para notificar.");
        return;
      }

      const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
      const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
      const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

      if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
        console.error("Configurações do EmailJS ausentes (.env)");
        toast.error("Erro de configuração: Variáveis de ambiente do EmailJS não encontradas.");
        return;
      }

      let metricas = {
        enviados: 0,
        falharam: 0,
        sem_email: 0,
        sem_uid: 0
      };

      toast.loading(`Processando envio para ${totalColaboradores} colaboradores...`, { id: "email-batch" });

      const appUrl = window.location.origin;

      for (const [colabKey, pends] of colabGroups) {
        // Tentar encontrar o email do colaborador
        // Se a chave for o ID, buscamos na lista de users. Se for nome, tentamos por nome.
        const targetUser = users.find(u => u.id === colabKey || u.uid === colabKey || u.nome === colabKey);
        
        if (!targetUser) {
          metricas.sem_uid++;
          continue;
        }

        if (!targetUser.email) {
          metricas.sem_email++;
          continue;
        }

        toast.loading(`Enviando para ${targetUser.nome} (${metricas.enviados + metricas.falharam + 1}/${totalColaboradores})...`, { id: "email-batch" });

        // Gerar a tabela HTML com TODAS as pendências do colaborador
        let tableRowsHtml = "";
        pends.forEach(p => {
          const itensStr = Array.isArray(p.pendencias) ? p.pendencias.join(", ") : p.texto_pendencia;
          tableRowsHtml += `
            <tr>
              <td style="padding: 10px; border: 1px solid #D9CDCD; color: #1D2E5D; font-size: 14px;"><strong>${p.razao_social}</strong></td>
              <td style="padding: 10px; border: 1px solid #D9CDCD; color: #1D2E5D; font-size: 14px; text-align: center;">${p.tipo_implantacao || "N/A"}</td>
              <td style="padding: 10px; border: 1px solid #D9CDCD; color: #1D2E5D; font-size: 14px; text-align: center;">${p.data_vigencia || "N/A"}</td>
              <td style="padding: 10px; border: 1px solid #D9CDCD; color: #737D9A; font-size: 14px;">${itensStr}</td>
            </tr>
          `;
        });

        const htmlBody = `
          <p>Você possui pendências que exigem regularização imediata no sistema.</p>
          <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; margin-top: 15px; margin-bottom: 20px;">
            <thead style="background-color: #F7F8FA;">
              <tr>
                <th style="padding: 12px; border: 1px solid #D9CDCD; color: #1D2E5D; font-size: 12px; text-transform: uppercase; text-align: left;">Razão Social</th>
                <th style="padding: 12px; border: 1px solid #D9CDCD; color: #1D2E5D; font-size: 12px; text-transform: uppercase;">Produto</th>
                <th style="padding: 12px; border: 1px solid #D9CDCD; color: #1D2E5D; font-size: 12px; text-transform: uppercase;">Vigência</th>
                <th style="padding: 12px; border: 1px solid #D9CDCD; color: #1D2E5D; font-size: 12px; text-transform: uppercase; text-align: left;">Itens a Regularizar</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>
          <p><strong>Link de acesso:</strong> <a href="${appUrl}">${appUrl}</a></p>
          <p style="font-size: 12px; color: #666;">Por favor, acesse o link acima, realize as correções e marque os itens como Corrigidos no painel.</p>
        `;

        try {
          await emailjs.send(
            EMAILJS_SERVICE_ID,
            EMAILJS_TEMPLATE_ID,
            {
              to_name: targetUser.nome,
              to_email: targetUser.email,
              subject: `Pendências em aberto - ${pends.length}`,
              my_html_content: htmlBody,
              count: pends.length
            },
            EMAILJS_PUBLIC_KEY
          );
          metricas.enviados++;
          await new Promise(resolve => setTimeout(resolve, 500)); // Delay para evitar bloqueios
        } catch (error) {
          console.error(`Erro ao enviar EmailJS para ${targetUser.nome}:`, error);
          metricas.falharam++;
        }
      }

      toast.success(`Resumo do envio: ${metricas.enviados} enviados, ${metricas.falharam} falhas.`, { id: "email-batch" });
      if (metricas.sem_email > 0 || metricas.sem_uid > 0) {
        toast.warning(`${metricas.sem_email} sem e-mail e ${metricas.sem_uid} sem UID.`);
      }

      addAdminLog("Disparo de E-mails em Lote", `Resultado: ${metricas.enviados} enviados, ${metricas.falharam} falhas.`);
    } catch (e) {
      console.error("Erro no processo de disparo de emails:", e);
      toast.error("Erro interno ao processar e-mails.", { id: "email-batch" });
    }
  };

  // Gestão Auth Mapeada no Firestore
  const handleAddUser = async (newUser: Omit<User, "id">) => {
    try {
      const normalized = newUser.email.toLowerCase().trim();
      // Cadastro na nova coleção de pré-cadastros
      await setDoc(doc(db, "pre_cadastros", normalized), {
        nome: newUser.nome,
        email: normalized,
        role: newUser.role,
        status: "ativo",
        criado_em: serverTimestamp(),
        atualizado_em: serverTimestamp()
      });
      addAdminLog("Cadastro de Colaborador", `${newUser.nome} (${newUser.email}) foi pré-autorizado.`);
      toast.success("Colaborador pré-autorizado no sistema.");
    } catch (e) {
      console.error("Erro ao pré-autorizar colaborador:", e);
      toast.error("Erro ao pré-autorizar colaborador.");
    }
  };

  const handleEditUser = async (id: string, updates: Partial<User>) => {
    try {
      // Atualiza em pre_cadastros
      await updateDoc(doc(db, "pre_cadastros", id), {
        ...updates,
        atualizado_em: serverTimestamp()
      });

      // Se o usuário já ativou a conta, atualizar também o registro definitivo usuarios/{uid}
      const userDoc = users.find(u => u.id === id || u.email === id);
      if (userDoc?.uid) {
        await updateDoc(doc(db, "usuarios", userDoc.uid), {
          ...updates,
          atualizado_em: serverTimestamp()
        });
      }

      addAdminLog("Edição de Colaborador", `O colaborador ${id} foi alterado.`);
      toast.success("Dados do colaborador atualizados.");
    } catch (e) {
      console.error("Erro ao editar colaborador:", e);
      toast.error("Erro ao editar colaborador.");
    }
  };

  const handleDeleteUser = async (id: string) => {
    const userToDelete = users.find(u => u.id === id || u.email === id);
    if (!userToDelete) return;

    try {
      // Inativa em pre_cadastros
      await updateDoc(doc(db, "pre_cadastros", id), {
        status: "inativo",
        atualizado_em: serverTimestamp()
      });

      // Inativa em usuarios se existir
      if (userToDelete.uid) {
        await updateDoc(doc(db, "usuarios", userToDelete.uid), {
          status: "inativo",
          atualizado_em: serverTimestamp()
        });
      }

      addAdminLog("Inativação de Colaborador", `${userToDelete.nome} foi desativado.`);
      toast.success("Colaborador desativado.");
    } catch (e) {
      console.error("Erro na inativação:", e);
      toast.error("Erro na inativação.");
    }
  };

  if (!user && !loading) {
    return <LoginScreen />;
  }

  // Enquanto carrega o carregamento de perfil ou se o perfil está vazio mas autenticado (erro)
  if (loading || (!user && auth.currentUser)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-10 w-10 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground animate-pulse">Carregando perfil corporativo...</p>
        </div>
      </div>
    );
  }

  const pendenciasEmAndamento = filteredPendencias.filter(p => (p.status?.toLowerCase() || "") !== "ok" && (p.status?.toLowerCase() || "") !== "ignorada");
  const pendenciasFinalizadas = filteredPendencias.filter(p => (p.status?.toLowerCase() || "") === "ok" || (p.status?.toLowerCase() || "") === "ignorada");
  const colabsComPendenciasUnicos = new Set(filteredPendencias.filter(p => (p.status?.toLowerCase() || "") === "pendente").map(p => p.colaborador_nome)).size;

  return (
    <div className="min-h-screen bg-brand-light font-sans text-brand-blue">
      {/* Faixa superior institucional (Laranja SulAmérica) */}
      <div className="w-full h-1.5 bg-brand-orange z-20 relative"></div>

      <header className="bg-white sticky top-0 z-10 border-b border-borderLight shadow-sm transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[72px] flex items-center justify-between">
          <div className="flex items-center gap-4 sm:gap-6">
            <img src={logoImg} alt="SulAmérica" className="h-[38px] object-contain" />

            <div className="h-8 w-px bg-borderLight hidden sm:block"></div>

            <div className="hidden sm:flex flex-col">
              <h1 className="text-base font-bold text-brand-blue tracking-tight leading-none uppercase">Operações Corporativas</h1>
              <span className="text-[10px] text-brand-orange font-bold uppercase tracking-widest mt-1">Conformidade e Pendências</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {user.role === "admin" && (
              <div className="flex items-center gap-2 sm:gap-3">
                <AdminLogsPanel logs={adminLogs} />
                <CollaboratorManagerDialog
                  users={users}
                  onAdd={handleAddUser}
                  onEdit={handleEditUser}
                  onDelete={handleDeleteUser}
                />
              </div>
            )}
            <div className="h-6 w-px bg-borderLight mx-1 hidden sm:block"></div>
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end mr-1">
                <span className="font-semibold text-brand-blue text-sm">{user.nome}</span>
                <span className="text-[10px] text-brand-muted uppercase font-bold tracking-tighter">
                  {user.role === "admin" ? "Administrador" : user.role === "socio" ? "Sócio Gestor" : "Colaborador"}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => logout()}
                className="text-brand-muted hover:bg-brand-light hover:text-brand-orange h-[38px] w-[38px] rounded-full transition-colors"
                title="Sair do Sistema"
              >
                <LogOut className="h-[18px] w-[18px]" strokeWidth={2.5} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade-in">

        {listenerError && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md shadow-sm mb-4">
            <div className="flex items-center border-b border-red-200 pb-2 mb-2">
              <ShieldAlert className="h-5 w-5 text-red-500 mr-2" />
              <h3 className="text-red-800 font-bold">Falha Crítica de Regra de Segurança (Permission Denied)</h3>
            </div>
            <p className="text-red-700 text-sm">{listenerError}</p>
            <p className="text-red-600 text-xs mt-2 italic">Dica: Seus dados ainda existem no provedor, mas a interface foi barrada pela camada de segurança do Firestore. Rodar diagnóstico acima para mais detalhes.</p>
          </div>
        )}

        <div className="space-y-6">
          <div className="text-[12px] text-brand-muted flex items-center gap-2 uppercase font-semibold tracking-wider">
            <span className="hover:text-brand-orange cursor-pointer transition-colors">Início</span>
            <span className="text-border">/</span>
            <span className="text-brand-blue">Painel de Pendências</span>
          </div>

          <div className="bg-white p-8 rounded-[12px] border border-border/60 shadow-[0px_4px_16px_rgba(29,46,93,0.04)] flex items-center justify-between flex-wrap gap-6 overflow-hidden relative group">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-brand-orange" />
            <div className="relative z-10">
              <h2 className="text-2xl md:text-[28px] font-bold text-brand-blue tracking-tight">
                Controle Estratégico <span className="font-light text-brand-muted">de Acessos e Regras</span>
              </h2>
              <p className="text-[14px] text-brand-muted mt-2 max-w-2xl leading-relaxed">
                {user.role === "admin"
                  ? "Central corporativa para gestão, importação em lote (CSV) e auditoria."
                  : user.role === "socio"
                    ? "Painel executivo com visão macro de processos e KPIs operacionais da empresa."
                    : "Espaço dedicado para visualizar os relógios e regularizar pendências da sua alçada."}
              </p>
            </div>

            <div className="flex items-center gap-3 relative z-10">
              {user.role === "admin" && (
                <>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-white border-[#1D2E5D] text-[#1D2E5D] hover:bg-[#F7F8FA] font-bold py-5 px-6 shadow-none"
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 leading-none`} />
                        Sincronizar CSV
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-xl bg-[#0f172a] text-white overflow-y-auto max-h-[85vh] border-none shadow-xl">
                      <DialogHeader>
                        <DialogTitle className="text-white">Central de Sincronização CSV</DialogTitle>
                        <DialogDescription className="text-slate-400">
                          Escolha um arquivo Excel/CSV no formato padrão para atualizar a base de pendências.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="pt-4">
                        <UploadCsvPanel />
                      </div>
                    </DialogContent>
                  </Dialog>
                  <CreatePendenciaDialog
                    colaboradores={colaboradores}
                    onSubmit={handleCreatePendencia}
                  />
                  <SendEmailDialog 
                    pendencias={filteredPendencias} 
                    onConfirm={handleSendEmailToBackend} 
                  />
                </>
              )}
              {user.role === "socio" && (
                <SendEmailDialog 
                  pendencias={filteredPendencias} 
                  onConfirm={handleSendEmailToBackend} 
                />
              )}
            </div>
          </div>
        </div>

        {(user.role === "admin" || user.role === "socio") && (
          <FilterBar filters={filters} onFiltersChange={setFilters} colaboradores={colaboradores} />
        )}

        {user.role === "socio" ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="border border-[#D9CDCD] shadow-sm bg-white overflow-hidden group transition-all duration-300 hover:border-[#1D2E5D]/30 hover:translate-y-[-2px]">
              <CardContent className="p-5">
                <div className="flex flex-col gap-4">
                  <div className="p-2 rounded-lg w-fit bg-[#F7F8FA] transition-colors">
                    <Clock className="h-5 w-5 text-[#1D2E5D]" strokeWidth={2.5} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-black text-[#1D2E5D] tracking-tight">{filteredPendencias.length}</p>
                    <p className="text-[10px] font-bold text-[#737D9A] uppercase tracking-widest">Total (Mapeadas)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border border-[#D9CDCD] shadow-sm bg-white overflow-hidden group transition-all duration-300 hover:border-[#1D2E5D]/30 hover:translate-y-[-2px]">
              <CardContent className="p-5">
                <div className="flex flex-col gap-4">
                  <div className="p-2 rounded-lg w-fit bg-[#FEF2F2] transition-colors">
                    <AlertCircle className="h-5 w-5 text-[#EF482B]" strokeWidth={2.5} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-black text-[#EF482B] tracking-tight">{filteredPendencias.filter(p => p.status?.toLowerCase() === 'pendente').length}</p>
                    <p className="text-[10px] font-bold text-[#737D9A] uppercase tracking-widest">Em Aberto</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border border-[#D9CDCD] shadow-sm bg-white overflow-hidden group transition-all duration-300 hover:border-[#1D2E5D]/30 hover:translate-y-[-2px]">
              <CardContent className="p-5">
                <div className="flex flex-col gap-4">
                  <div className="p-2 rounded-lg w-fit bg-[#EFF6FF] transition-colors">
                    <CheckCircle2 className="h-5 w-5 text-[#1D2E5D]" strokeWidth={2.5} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-black text-[#1D2E5D] tracking-tight">{filteredPendencias.filter(p => p.status?.toLowerCase() === 'corrigida').length}</p>
                    <p className="text-[10px] font-bold text-[#737D9A] uppercase tracking-widest">Corrigidas</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border border-[#D9CDCD] shadow-sm bg-white overflow-hidden group transition-all duration-300 hover:border-[#1D2E5D]/30 hover:translate-y-[-2px]">
              <CardContent className="p-5">
                <div className="flex flex-col gap-4">
                  <div className="p-2 rounded-lg w-fit bg-[#F0FDF4] transition-colors">
                    <CheckCircle2 className="h-5 w-5 text-[#166534]" strokeWidth={2.5} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-black text-[#166534] tracking-tight">{filteredPendencias.filter(p => p.status?.toLowerCase() === 'ok').length}</p>
                    <p className="text-[10px] font-bold text-[#737D9A] uppercase tracking-widest">Validadas (OK)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border border-[#D9CDCD] shadow-sm bg-white overflow-hidden group transition-all duration-300 hover:border-[#1D2E5D]/30 hover:translate-y-[-2px]">
              <CardContent className="p-5">
                <div className="flex flex-col gap-4">
                  <div className="p-2 rounded-lg w-fit bg-[#F7F8FA] transition-colors">
                    <UsersIcon className="h-5 w-5 text-[#1D2E5D]" strokeWidth={2.5} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-black text-[#1D2E5D] tracking-tight">{colabsComPendenciasUnicos}</p>
                    <p className="text-[10px] font-bold text-[#737D9A] uppercase tracking-widest">Equipe P/ Atuar</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
            <div className="w-full">
              <StatsCards pendencias={user.role !== "colaborador" ? activePendencias : activePendencias.filter((p) => p.colaborador_id === user.id)} />
            </div>
          </div>
        )}

        {/* Gráficos para Sócio */}
        {user.role === "socio" && (
          <div className="mt-8 grid grid-cols-1 gap-8">
            <div className="w-full">
              <SocioCharts pendencias={filteredPendencias} />
            </div>
          </div>
        )}

        {(user.role === "admin" || user.role === "socio") ? (
          <Tabs defaultValue="em-andamento" className="w-full mt-6">
            <TabsList className="mb-4 bg-muted/50 border">
              <TabsTrigger value="em-andamento" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Em Andamento
                <span className="ml-2 bg-primary/10 text-primary py-0.5 px-2 rounded-full text-xs">{pendenciasEmAndamento.length}</span>
              </TabsTrigger>
              <TabsTrigger value="finalizadas" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Finalizadas
                <span className="ml-2 bg-muted-foreground/10 text-muted-foreground py-0.5 px-2 rounded-full text-xs">{pendenciasFinalizadas.length}</span>
              </TabsTrigger>
              {/* Removed Sincronizar CSV Tab */}
            </TabsList>
            <TabsContent value="em-andamento" className="m-0 mt-4 border-none p-0 outline-none">
              <PendenciaTable
                pendencias={pendenciasEmAndamento}
                userRole={user.role}
                userName={user.nome}
                onUpdatePendencia={handleUpdatePendencia}
                onDeletePendencia={handleDeletePendencia}
                colaboradores={colaboradores}
              />
            </TabsContent>
            <TabsContent value="finalizadas" className="m-0 mt-4 border-none p-0 outline-none">
              <PendenciaTable
                pendencias={pendenciasFinalizadas}
                userRole={user.role}
                userName={user.nome}
                onUpdatePendencia={handleUpdatePendencia}
                onDeletePendencia={handleDeletePendencia}
                colaboradores={colaboradores}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-12 mt-6">
            <div>
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  Pendências Abertas (Realtime DB)
                </h3>
                <p className="text-sm text-muted-foreground">Requerem sua atenção imediata para correção.</p>
              </div>
              <div className="ring-1 ring-primary/20 rounded-lg shadow-sm">
                <PendenciaTable
                  pendencias={filteredPendencias.filter(p => p.status === "Pendente")}
                  userRole={user.role}
                  userName={user.nome}
                  onUpdatePendencia={handleUpdatePendencia}
                  colaboradores={colaboradores}
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
                  colaboradores={colaboradores}
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
