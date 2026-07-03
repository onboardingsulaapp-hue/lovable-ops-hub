export const RULES_NOVA_V1 = {
    "version": 1,
    "gate": {
        "field": "Status da Empresa",
        "allowed": [
            "IMPLANTAÇÃO CONCLUÍDA COMPLETA",
            "IMPLANTAÇÃO CONCLUÍDA COM PENDÊNCIA"
        ],
        "required_for_processing": [
            "Razão Social do Cliente",
            "Produto",
            "Inicio da Vigência de Contrato",
            "CONSULTOR DE ONBOARDING"
        ]
    },
    "fingerprint": {
        "fields": [
            "Razão Social do Cliente",
            "Produto",
            "Inicio da Vigência de Contrato"
        ],
        "prefix": "nova_"
    },
    "defaults": {
        "prioridade": "Média",
        "origem": "Automático",
        "status_when_pending": "Pendente",
        "isDeleted": false
    },
    "in_progress_values": [
        "Em Tratativa",
        "Em tratativa",
        "EM TRATATIVA"
    ],
    "required_fields": [
        "Faturamento Emitido (R$ Mensal)",
        "Data da confecção do Book",
        "Identificação do Book no ProSula",
        "Data do Envio do Book para o time de relacionamento",
        "Data da reunião de passagem de bastão para o relacionamento",
        "Saúde Online/Sae-Net",
        "Data do envio do e-mail de Liberação",
        "Reunião Realizada",
        "Atuação do Migrasas ?",
        "Houve pedido de Aditivo",
        "Pedido De Termo Méd/Odonto"
    ],
    "conditional_required": [
        {
            "if": {
                "field": "Reunião Realizada",
                "equals_any": ["SIM"]
            },
            "then_require": ["Data da Reunião"]
        },
        {
            "if": {
                "field": "Atuação do Migrasas ?",
                "equals_any": ["SIM"]
            },
            "then_require": [
                "Data da Reunião de Alinhamento",
                "Todos casos Finalizados ?"
            ]
        },
        {
            "if": {
                "field": "Houve pedido de Aditivo",
                "equals_any": ["SIM"]
            },
            "then_require": [
                "Data do pedido de Aditivo",
                "Data da Assinatura do Aditivo",
                "Adtivo Finalizado ?"
            ]
        },
        {
            "if": {
                "field": "Pedido De Termo Méd/Odonto",
                "equals_any": ["SIM"]
            },
            "then_require": [
                "Prosula - Coop. Médica",
                "Data - Coop. Médica"
            ]
        }
    ],
    "marketing": {
        "fields": [
            "Mecsas",
            "Palestra",
            "Plantão",
            "Suladay",
            "Passagem ao relacionamento (Ação de MKT)"
        ],
        "pendencia_name_if_any_empty": "Ações de marketing"
    },
    "no_pendencia_action": "ignore"
};
