import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AdminLog } from "@/types/pendencia";
import { Activity, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface AdminLogsPanelProps {
  logs: AdminLog[];
}

export function AdminLogsPanel({ logs }: AdminLogsPanelProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredLogs = logs.filter((log) => 
    log.acao.toLowerCase().includes(search.toLowerCase()) ||
    log.usuarioAdmin.toLowerCase().includes(search.toLowerCase()) ||
    (log.detalhes && log.detalhes.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="hidden sm:flex">
          <Activity className="h-4 w-4 mr-1" />
          Logs de Auditoria
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Logs Administrativos</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden flex flex-col pt-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar histórico..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex-1 overflow-y-auto min-h-[300px] border rounded-lg bg-muted/10 p-1">
            {filteredLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                Nenhum log encontrado.
              </div>
            ) : (
              <ul className="space-y-1">
                {filteredLogs.map((log) => (
                  <li key={log.id} className="p-3 bg-card border rounded shadow-sm hover:shadow-md transition-shadow text-sm">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold text-foreground">{log.acao}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                        {new Date(log.dataHora).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <div className="text-muted-foreground flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center justify-center bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-medium">
                        Admin
                      </span>
                      <span>{log.usuarioAdmin}</span>
                    </div>
                    {log.detalhes && (
                      <div className="mt-2 text-xs bg-muted p-2 rounded text-foreground border border-border/50">
                        {log.detalhes}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
