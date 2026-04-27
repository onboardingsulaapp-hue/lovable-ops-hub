import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, updateDoc, doc, orderBy } from "firebase/firestore";
import { Alerta } from "@/types/alerta";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function AlertasPanel() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "alertas"),
      where("resolved", "==", false),
      orderBy("updated_at", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Alerta[];
      setAlertas(docs);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao buscar alertas:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleResolve = async (id: string) => {
    try {
      await updateDoc(doc(db, "alertas", id), {
        resolved: true,
      });
      toast.success("Alerta marcado como resolvido!");
    } catch (error) {
      console.error("Erro ao resolver alerta:", error);
      toast.error("Falha ao resolver alerta.");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (alertas.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-10 text-center text-muted-foreground">
        Nenhum alerta pendente no momento.
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-brand-light border-b border-borderLight h-12">
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">Tipo</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">Razão Social</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">Responsável</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">Data/Hora</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">Status</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alertas.map((alerta) => (
              <TableRow key={alerta.id} className="hover:bg-brand-light/80 transition-colors">
                <TableCell className="text-xs">
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Aditivo em Tratativa
                  </Badge>
                </TableCell>
                <TableCell className="text-sm font-medium">{alerta.razao_social}</TableCell>
                <TableCell className="text-sm">{alerta.colaborador_nome}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {alerta.updated_at?.seconds 
                    ? new Date(alerta.updated_at.seconds * 1000).toLocaleString("pt-BR")
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-[10px] font-bold uppercase">
                    {alerta.aditivo_status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => handleResolve(alerta.id)}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Resolver
                    </Button>
                    {/* Link para a pendência (fingerprint) */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Ver Pendência Relacionada"
                      onClick={() => {
                        // Idealmente abriríamos a aba de pendências e expandiríamos a pendência.
                        // Por enquanto, apenas copiamos o fingerprint ou mostramos um aviso.
                        toast.info(`Fingerprint: ${alerta.fingerprint}`);
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
