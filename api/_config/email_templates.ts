export const EMAIL_TEMPLATES = {
    "subject": "Pendências pendentes - Prazo: {prazo_dias} dias",
    "body": [
        "Olá, {nome}.",
        "",
        "Identificamos {qtd} pendência(s) em aberto.",
        "PRAZO DE REGULARIZAÇÃO: {prazo_dias} dias.",
        "",
        "{lista_pendencias}",
        "",
        "Por favor, realize as correções e marque como Corrigida no sistema.",
        "Atenciosamente,",
        "SulAmérica | Operações Corporativas"
    ]
};
