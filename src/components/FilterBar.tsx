import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Filter, X } from "lucide-react";
import { Status, Prioridade, Origem } from "@/types/pendencia";

export interface Filters {
  colaborador_id: string;
  status: string;
  prioridade: string;
  origem: string;
  data_inicio: string;
  data_fim: string;
  tipo_implantacao: string;
}

interface FilterBarProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  colaboradores: { id: string; nome: string }[];
}

const emptyFilters: Filters = {
  colaborador_id: "",
  status: "",
  prioridade: "",
  origem: "",
  data_inicio: "",
  data_fim: "",
  tipo_implantacao: "",
};

export function FilterBar({ filters, onFiltersChange, colaboradores }: FilterBarProps) {
  const hasFilters = Object.values(filters).some((v) => v !== "");

  return (
    <div className="bg-white border border-[#D9CDCD] rounded-xl p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between border-b border-[#D9CDCD] pb-4 mb-2">
        <div className="flex items-center gap-3 text-[10px] font-bold text-[#1D2E5D] tracking-widest uppercase">
          <Filter className="h-4 w-4" />
          Configurações de Filtro
        </div>
        {hasFilters && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => onFiltersChange(emptyFilters)} 
            className="h-8 text-[10px] font-bold text-[#EF482B] hover:text-[#EF482B] hover:bg-[#FEF2F2] uppercase tracking-wider"
          >
            <X className="h-3 w-3 mr-2" />
            Limpar Filtros
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-[#737D9A] uppercase tracking-wider block">Data início</label>
          <Input
            type="date"
            value={filters.data_inicio}
            onChange={(e) => onFiltersChange({ ...filters, data_inicio: e.target.value })}
            className="h-10 text-sm border-[#D9CDCD] focus:ring-[#1D2E5D] focus:border-[#1D2E5D]"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-[#737D9A] uppercase tracking-wider block">Data fim</label>
          <Input
            type="date"
            value={filters.data_fim}
            onChange={(e) => onFiltersChange({ ...filters, data_fim: e.target.value })}
            className="h-10 text-sm border-[#D9CDCD] focus:ring-[#1D2E5D] focus:border-[#1D2E5D]"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-[#737D9A] uppercase tracking-wider block">Colaborador</label>
          <Select value={filters.colaborador_id} onValueChange={(v) => onFiltersChange({ ...filters, colaborador_id: v === "all" ? "" : v })}>
            <SelectTrigger className="h-10 text-sm border-[#D9CDCD] focus:ring-[#1D2E5D]">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Ver Todos</SelectItem>
              {colaboradores.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-[#737D9A] uppercase tracking-wider block">Status Atual</label>
          <Select value={filters.status} onValueChange={(v) => onFiltersChange({ ...filters, status: v === "all" ? "" : v })}>
            <SelectTrigger className="h-10 text-sm border-[#D9CDCD] focus:ring-[#1D2E5D]">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Ver Todos</SelectItem>
              <SelectItem value="Pendente">Pendente</SelectItem>
              <SelectItem value="Corrigida">Corrigida</SelectItem>
              <SelectItem value="OK">OK</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-[#737D9A] uppercase tracking-wider block">Prioridade</label>
          <Select value={filters.prioridade} onValueChange={(v) => onFiltersChange({ ...filters, prioridade: v === "all" ? "" : v })}>
            <SelectTrigger className="h-10 text-sm border-[#D9CDCD] focus:ring-[#1D2E5D]">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Ver Todas</SelectItem>
              <SelectItem value="Alta">Alta</SelectItem>
              <SelectItem value="Média">Média</SelectItem>
              <SelectItem value="Baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-[#737D9A] uppercase tracking-wider block">Origem Dado</label>
          <Select value={filters.origem} onValueChange={(v) => onFiltersChange({ ...filters, origem: v === "all" ? "" : v })}>
            <SelectTrigger className="h-10 text-sm border-[#D9CDCD] focus:ring-[#1D2E5D]">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Ver Todas</SelectItem>
              <SelectItem value="Automático">Automático</SelectItem>
              <SelectItem value="Manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-[#737D9A] uppercase tracking-wider block">Tipo Implantação</label>
          <Select value={filters.tipo_implantacao} onValueChange={(v) => onFiltersChange({ ...filters, tipo_implantacao: v === "all" ? "" : v })}>
            <SelectTrigger className="h-10 text-sm border-[#D9CDCD] focus:ring-[#1D2E5D]">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Ver Todas</SelectItem>
              <SelectItem value="Saúde">Saúde</SelectItem>
              <SelectItem value="Odonto">Odonto</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
