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
import { GenerateReportButton } from "@/components/admin/GenerateReportButton";
import { AlertasPanel } from "@/components/admin/AlertasPanel";

const emptyFilters: Filters = { colaborador_id: "", status: "", prioridade: "", origem: "", data_inicio: "", data_fim: "", tipo_implantacao: "" };

const Index = () => {
  const { profile: user, loading, logout } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [preUsers, setPreUsers] = useState<User[]>([]);
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [listenerError, setListenerError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [alertCount, setAlertCount] = useState(0);

  // Monitorar Alertas ativos (Realtime)
  useEffect(() => {
    if (user?.role !== "admin") return;
    const q = query(collection(db, "alertas"), where("resolved", "==", false));
    const unsubscribeAlerts = onSnapshot(q, (snapshot) => {
      setAlertCount(snapshot.size);
    });
    return () => unsubscribeAlerts();
  }, [user]);

  // 1. Escutar usuários em tempo real (Apenas Admin)
  useEffect(() => {
    if (!user || (user.role !== "admin" && user.role !== "socio")) return;

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
      (error) => console.error("onSnapshot Erro Usuarios:", error)
    );

    const unsubscribePre = onSnapshot(
      collection(db, "pre_cadastros"),
      (snapshot) => {
        const preData = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id, // O ID aqui é o e-mail
            nome: data.nome,
            email: data.email,
            role: data.role as UserRole,
            status: data.status as "ativo" | "inativo",
            criado_em: data.criado_em,
            atualizado_em: data.atualizado_em
          };
        }) as User[];
        setPreUsers(preData);
      },
      (error) => console.error("onSnapshot Erro PreCadastros:", error)
    );

    const qLogs = query(collection(db, "admin_logs"), orderBy("dataHora", "desc"));
    const unsubscribeLogs = onSnapshot(
      qLogs,
      (snapshot) => {
        const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AdminLog[];
        setAdminLogs(logsData.slice(0, 50));
      },
      (error) => console.error("onSnapshot Erro Logs:", error)
    );

    return () => { unsubscribeUsers(); unsubscribePre(); unsubscribeLogs(); };
  }, [user]);

  // Merge de Usuários (Pre-cadastro + Ativos)
  const allUsers = useMemo(() => {
    const map = new Map<string, User>();
    
    // Adicionar pré-cadastros primeiro
    preUsers.forEach(u => {
      const email = u.email?.toLowerCase().trim();
      if (email) {
        map.set(email, { ...u, id: email }); // Garantir que id inicial é o email
      }
    });

    // Sobrescrever/Mesclar com dados de usuários ativos
    users.forEach(u => {
      const email = u.email?.toLowerCase().trim();
      if (email) {
        const existing = map.get(email);
        // Ao mesclar, o ID final preferencial é o UID (u.id), mas mantemos o email para referência
        map.set(email, { ...existing, ...u, uid: u.uid || u.id });
      } else {
        // Se não tem email, usa o ID do doc (UID) como chave
        map.set(u.id, { ...u, uid: u.id });
      }
    });

    return Array.from(map.values());
  }, [users, preUsers]);

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
          const prioriVal = data.prioridade || "Média";
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
            itens_em_tratativa: data.itens_em_tratativa || [],
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
    // Incluir todos os colaboradores (ativos ou pré-cadastrados)
    allUsers.filter(u => u.role === "colaborador").forEach(u => {
      // Usamos u.id (que pode ser email ou UID) para garantir que possamos filtrar
      map.set(u.id, { id: u.id, nome: u.nome });
    });
    return Array.from(map.values());
  }, [allUsers]);

  const activePendencias = useMemo(() => pendencias.filter(p => !p.isDeleted), [pendencias]);

  const filteredPendencias = useMemo(() => {
    let result = activePendencias;
    if (filters.colaborador_id) {
      const selectedUser = allUsers.find(u => u.id === filters.colaborador_id);
      const normalizeName = (name: string) => name ? name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim() : "";
      const selectedNameNorm = selectedUser ? normalizeName(selectedUser.nome) : normalizeName(filters.colaborador_id);
      
      result = result.filter((p) => {
        const pColabId = p.colaborador_id;
        const pColabNomeNorm = normalizeName(p.colaborador_nome);
        
        // Match por ID direto (UID ou Email)
        if (pColabId === filters.colaborador_id) return true;
        
        if (selectedUser) {
          // Se selecionamos um usuário, tentamos match com as propriedades dele
          if (pColabId === selectedUser.uid) return true;
          if (pColabId?.toLowerCase() === selectedUser.email?.toLowerCase()) return true;
          if (pColabNomeNorm === normalizeName(selectedUser.nome)) return true;
          if (pColabNomeNorm === normalizeName(selectedUser.email)) return true;
        }
        
        // Fallback para o valor bruto do filtro (caso não tenha achado selectedUser)
        if (pColabNomeNorm === selectedNameNorm) return true;

        return false;
      });
    }
    if (filters.status) result = result.filter((p) => p.status === filters.status);
    
    // Filtros com normalização para evitar problemas de acento/case
    if (filters.prioridade) {
      result = result.filter((p) => {
        const p1 = (p.prioridade || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const f1 = (filters.prioridade).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return p1 === f1;
      });
    }
    if (filters.origem) {
      result = result.filter((p) => {
        const p1 = (p.origem || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const f1 = (filters.origem).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return p1 === f1;
      });
    }
    if (filters.tipo_implantacao) {
      result = result.filter((p) => {
        const pNorm = (p.tipo_implantacao || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const fNorm = filters.tipo_implantacao.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return pNorm.includes(fNorm);
      });
    }
    if (filters.data_inicio || filters.data_fim) {
      result = result.filter((p) => {
        if (!p.data_vigencia) return false;

        let dateVal: string;
        const val = p.data_vigencia as any;

        // 1. Caso Timestamp do Firebase
        if (val && typeof val === 'object' && 'seconds' in val) {
          dateVal = new Date(val.seconds * 1000).toISOString().split('T')[0];
        } else {
          const str = p.data_vigencia.toString().trim();
          // 2. Caso formato DD/MM/YYYY
          if (str.includes('/')) {
            const parts = str.split('/');
            if (parts.length === 3) {
              const [d, m, y] = parts;
              // Normalizar para YYYY-MM-DD para comparação de string correta
              dateVal = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            } else {
              dateVal = str;
            }
          } else {
            // 3. Tentar parse genérico (ISO ou outros)
            const d = new Date(str);
            if (!isNaN(d.getTime())) {
              dateVal = d.toISOString().split('T')[0];
            } else {
              dateVal = str;
            }
          }
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

  /**
   * Disparo Dinâmico de E-mails via EmailJS
   * Instrução de Configuração do Template:
   * No painel do EmailJS, o campo "To Email" deve ser {{to_email}}
   * O corpo do e-mail deve conter {{{my_html_content}}} (chaves triplas para HTML)
   */
  const handleSendEmailToBackend = async (prazo: number) => {
    // Chaves de acesso (Favor preencher no .env ou aqui se for teste rápido)
    const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || "";
    const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || "";
    const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || "";

    if (!user || (user.role !== "admin" && user.role !== "socio")) {
      toast.error("Você não tem permissão para disparar e-mails de cobrança.");
      return;
    }

    if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
      toast.error("Erro de configuração: Chaves do EmailJS não encontradas no ambiente.");
      return;
    }

    try {
      // 1. Agrupar apenas as pendências que estão visíveis e com status 'Pendente'
      const activePending = activePendencias.filter(p => p.status === "Pendente" && !p.isDeleted);
      const pendsByColab: Record<string, Pendencia[]> = {};
      
      activePending.forEach(p => {
        const key = p.colaborador_id || p.colaborador_nome || "sem_identificacao";
        if (!pendsByColab[key]) pendsByColab[key] = [];
        pendsByColab[key].push(p);
      });

      const colabGroups = Object.entries(pendsByColab);
      const totalColab = colabGroups.length;

      if (totalColab === 0) {
        toast.info("Não há pendências em aberto para notificar nos filtros atuais.");
        return;
      }

      let metricas = { enviados: 0, falharam: 0, sem_email: 0 };
      toast.loading(`Iniciando disparos para ${totalColab} colaboradores...`, { id: "email-batch" });

      for (let i = 0; i < totalColab; i++) {
        const [colabKey, pends] = colabGroups[i];
        
        // Localizar colaborador nos dados carregados
        const target = users.find(u => u.id === colabKey || u.uid === colabKey || u.nome === colabKey);
        
        if (!target || !target.email) {
          metricas.sem_email++;
          console.warn(`[EmailJS] Pulando ${colabKey}: E-mail não encontrado.`);
          continue;
        }

        // Atualizar feedback visual de progresso
        toast.loading(`Enviando ${i + 1} de ${totalColab}: ${target.nome}...`, { id: "email-batch" });

        // Gerar Tabela HTML para o colaborador atual
        let rowsHtml = "";
        pends.forEach(p => {
          const itens = Array.isArray(p.pendencias) ? p.pendencias.join(", ") : (p.texto_pendencia || "Verificar no sistema");
          rowsHtml += `
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; font-size: 13px;">${p.razao_social}</td>
              <td style="padding: 8px; border: 1px solid #ddd; font-size: 13px; text-align: center;">${p.tipo_implantacao || "Saúde"}</td>
              <td style="padding: 8px; border: 1px solid #ddd; font-size: 13px; text-align: center;">${p.data_vigencia}</td>
              <td style="padding: 8px; border: 1px solid #ddd; font-size: 13px; color: #d9534f;">${itens}</td>
            </tr>
          `;
        });

        const my_html_content = `
          <div style="font-family: Arial, sans-serif; color: #333;">
            <p>Olá <strong>${target.nome}</strong>,</p>
            <p>Você possui as seguintes pendências aguardando regularização:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
              <thead>
                <tr style="background-color: #f2f2f2;">
                  <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Empresa</th>
                  <th style="padding: 10px; border: 1px solid #ddd;">Produto</th>
                  <th style="padding: 10px; border: 1px solid #ddd;">Vigência</th>
                  <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Pendências</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
            <p>Por favor, acesse o sistema para regularizar: <a href="${window.location.origin}">${window.location.origin}</a></p>
            <p style="font-size: 12px; color: #777; margin-top: 20px;">Esta é uma mensagem automática do Sistema Onboarding Control Plan.</p>
          </div>
        `;

        try {
          await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
            to_name: target.nome,
            to_email: target.email,
            my_html_content: my_html_content,
            total_cases: pends.length
          }, PUBLIC_KEY);
          
          metricas.enviados++;
        } catch (err) {
          console.error(`[EmailJS] Falha ao enviar para ${target.nome}:`, err);
          metricas.falharam++;
        }

        // Delay de 500ms entre disparos conforme regra de UX
        if (i < totalColab - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      toast.success(`Processo concluído: ${metricas.enviados} enviados, ${metricas.falharam} falhas.`, { id: "email-batch" });
      addAdminLog("Disparo de E-mails", `${metricas.enviados} envios bem-sucedidos via EmailJS.`);
    } catch (error) {
      console.error("[EmailJS Lote] Erro fatal:", error);
      toast.error("Erro ao processar lote de e-mails.", { id: "email-batch" });
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
      const target = allUsers.find(u => u.id === id || u.email === id);
      if (!target) return;

      const emailId = target.email.toLowerCase().trim();
      
      // 1. Atualiza em pre_cadastros (sempre existe por e-mail)
      try {
        await updateDoc(doc(db, "pre_cadastros", emailId), {
          ...updates,
          atualizado_em: serverTimestamp()
        });
      } catch (err) {
        console.warn("[Firestore] pre_cadastros doc not found for", emailId);
      }

      // 2. Se o usuário já ativou a conta, atualizar usuários/{uid}
      if (target.uid) {
        await updateDoc(doc(db, "usuarios", target.uid), {
          ...updates,
          atualizado_em: serverTimestamp()
        });
      }

      addAdminLog("Edição de Colaborador", `O colaborador ${target.nome} foi alterado.`);
      toast.success("Dados do colaborador atualizados.");
    } catch (e) {
      console.error("Erro ao editar colaborador:", e);
      toast.error("Erro ao editar colaborador.");
    }
  };

  const handleDeleteUser = async (id: string) => {
    const userToDelete = allUsers.find(u => u.id === id || u.email === id);
    if (!userToDelete) return;

    if (!window.confirm(`Tem certeza que deseja excluir permanentemente o colaborador ${userToDelete.nome}? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      const emailId = userToDelete.email.toLowerCase().trim();

      // 1. Excluir de pre_cadastros
      try {
        await deleteDoc(doc(db, "pre_cadastros", emailId));
      } catch (err) {
        console.warn("[Firestore] pre_cadastros doc not found for delete", emailId);
      }

      // 2. Excluir de usuarios se houver UID
      if (userToDelete.uid) {
        await deleteDoc(doc(db, "usuarios", userToDelete.uid));
      }

      addAdminLog("Exclusão de Colaborador", `${userToDelete.nome} foi removido permanentemente.`);
      toast.success("Colaborador excluído com sucesso.");
    } catch (e) {
      console.error("Erro na exclusão:", e);
      toast.error("Erro ao excluir colaborador do banco de dados.");
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
                  users={allUsers}
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
                  <GenerateReportButton />
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

        <FilterBar 
          filters={filters} 
          onFiltersChange={setFilters} 
          colaboradores={colaboradores} 
          userRole={user.role} 
        />

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
              {user.role === "admin" && (
                <TabsTrigger value="alertas" className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-amber-600 data-[state=active]:text-amber-700">
                  ⚠️ Alertas
                  {alertCount > 0 && (
                    <span className="ml-2 bg-amber-100 text-amber-700 py-0.5 px-2 rounded-full text-xs animate-pulse">
                      {alertCount}
                    </span>
                  )}
                </TabsTrigger>
              )}
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
            {user.role === "admin" && (
              <TabsContent value="alertas" className="m-0 mt-4 border-none p-0 outline-none animate-in fade-in slide-in-from-bottom-2">
                <AlertasPanel />
              </TabsContent>
            )}
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
