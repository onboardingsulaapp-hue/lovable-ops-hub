import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Filter, X } from "lucide-react";
import { Status, Prioridade, Origem } from "@/types/pendencia";

export interface Filters {
  colaborador: string;
  status: string;
  prioridade: string;
  origem: string;
  dataInicio: string;
  dataFim: string;
}

interface FilterBarProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  colaboradores: string[];
}

const emptyFilters: Filters = {
  colaborador: "",
  status: "",
  prioridade: "",
  origem: "",
  dataInicio: "",
  dataFim: "",
};

export function FilterBar({ filters, onFiltersChange, colaboradores }: FilterBarProps) {
  const hasFilters = Object.values(filters).some((v) => v !== "");

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Filter className="h-4 w-4 text-primary" />
          Filtros
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => onFiltersChange(emptyFilters)}>
            <X className="h-3 w-3 mr-1" />
            Limpar
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Data início</label>
          <Input
            type="date"
            value={filters.dataInicio}
            onChange={(e) => onFiltersChange({ ...filters, dataInicio: e.target.value })}
            className="h-9 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Data fim</label>
          <Input
            type="date"
            value={filters.dataFim}
            onChange={(e) => onFiltersChange({ ...filters, dataFim: e.target.value })}
            className="h-9 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Colaborador</label>
          <Select value={filters.colaborador} onValueChange={(v) => onFiltersChange({ ...filters, colaborador: v === "all" ? "" : v })}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {colaboradores.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Status</label>
          <Select value={filters.status} onValueChange={(v) => onFiltersChange({ ...filters, status: v === "all" ? "" : v })}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="Pendente">Pendente</SelectItem>
              <SelectItem value="Corrigida">Corrigida</SelectItem>
              <SelectItem value="OK">OK</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Prioridade</label>
          <Select value={filters.prioridade} onValueChange={(v) => onFiltersChange({ ...filters, prioridade: v === "all" ? "" : v })}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="Alta">Alta</SelectItem>
              <SelectItem value="Média">Média</SelectItem>
              <SelectItem value="Baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Origem</label>
          <Select value={filters.origem} onValueChange={(v) => onFiltersChange({ ...filters, origem: v === "all" ? "" : v })}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="Automático">Automático</SelectItem>
              <SelectItem value="Manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
