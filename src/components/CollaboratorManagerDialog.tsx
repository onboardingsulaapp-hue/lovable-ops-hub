import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, UserRole } from "@/types/pendencia";
import { Users, Trash2, Edit2, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CollaboratorManagerDialogProps {
  users: User[];
  onAdd: (user: Omit<User, "id">) => void;
  onEdit: (id: string, updates: Partial<User>) => void;
  onDelete: (id: string) => void;
}

export function CollaboratorManagerDialog({ users, onAdd, onEdit, onDelete }: CollaboratorManagerDialogProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [newNome, setNewNome] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("colaborador");
  const [newStatus, setNewStatus] = useState<"ativo" | "inativo">("ativo");

  const [editNome, setEditNome] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("colaborador");
  const [editStatus, setEditStatus] = useState<"ativo" | "inativo">("ativo");

  const handleAdd = () => {
    if (!newNome.trim()) return;
    onAdd({ nome: newNome, role: newRole, status: newStatus });
    setNewNome("");
    setNewRole("colaborador");
    setNewStatus("ativo");
  };

  const startEdit = (u: User) => {
    setEditingId(u.id);
    setEditNome(u.nome);
    setEditRole(u.role);
    setEditStatus(u.status);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = (id: string) => {
    if (!editNome.trim()) return;
    onEdit(id, { nome: editNome, role: editRole, status: editStatus });
    setEditingId(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users className="h-4 w-4 mr-1" />
          Gerenciar Colaboradores
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gestão de Colaboradores</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 mt-4">
          <div className="bg-muted/30 p-4 rounded-lg flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium mb-1 block">Nome do colaborador</label>
              <Input value={newNome} onChange={(e) => setNewNome(e.target.value)} placeholder="Ex: Maria" />
            </div>
            <div className="w-32">
              <label className="text-xs font-medium mb-1 block">Role</label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as UserRole)}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="colaborador">Colaborador</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-32">
              <label className="text-xs font-medium mb-1 block">Status</label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as "ativo" | "inativo")}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAdd} disabled={!newNome.trim()}>Adicionar</Button>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="text-left font-medium p-3">Nome</th>
                  <th className="text-left font-medium p-3 w-32">Role</th>
                  <th className="text-center font-medium p-3 w-28">Status</th>
                  <th className="text-right font-medium p-3 w-24">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t">
                    {editingId === u.id ? (
                      <>
                        <td className="p-2"><Input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="h-8 text-sm" /></td>
                        <td className="p-2">
                          <Select value={editRole} onValueChange={(v) => setEditRole(v as UserRole)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue/></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="colaborador">Colaborador</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          <Select value={editStatus} onValueChange={(v) => setEditStatus(v as "ativo" | "inativo")}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue/></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ativo">Ativo</SelectItem>
                              <SelectItem value="inativo">Inativo</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700" onClick={() => saveEdit(u.id)}><Check className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={cancelEdit}><X className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-3 font-medium">{u.nome}</td>
                        <td className="p-3 capitalize">{u.role}</td>
                        <td className="p-3 text-center">
                          <Badge variant={u.status === "ativo" ? "default" : "secondary"} className="text-[10px] font-normal px-2 py-0 h-5">
                            {u.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(u)}><Edit2 className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(u.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
