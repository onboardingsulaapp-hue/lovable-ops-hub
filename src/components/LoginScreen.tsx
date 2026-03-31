import { useState } from "react";
import { User, UserRole } from "@/types/pendencia";
import { mockUsers } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn, Shield, UserCheck } from "lucide-react";

interface LoginScreenProps {
  onLogin: (user: User) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [selectedUser, setSelectedUser] = useState<string>("");

  const user = mockUsers.find((u) => u.nome === selectedUser);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm border-border shadow-lg animate-fade-in">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 h-14 w-14 rounded-xl bg-primary flex items-center justify-center">
            <Shield className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl font-bold text-foreground">Controle de Pendências</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Sistema interno de gestão operacional</p>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Selecione o usuário</label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha um usuário..." />
              </SelectTrigger>
              <SelectContent>
                {mockUsers.map((u) => (
                  <SelectItem key={u.nome} value={u.nome}>
                    <span className="flex items-center gap-2">
                      {u.role === "admin" ? <Shield className="h-3 w-3 text-primary" /> : <UserCheck className="h-3 w-3 text-accent" />}
                      {u.nome}
                      <span className="text-xs text-muted-foreground">({u.role})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full"
            disabled={!user}
            onClick={() => user && onLogin(user)}
          >
            <LogIn className="h-4 w-4 mr-2" />
            Entrar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
