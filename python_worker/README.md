# SulAmérica — Python Worker para Sincronização de Pendências

## Visão Geral

Esse worker processa jobs do tipo `sync_pendencias_csv` que são criados pelo painel Admin do site.

Fluxo completo:
1. Admin seleciona e valida um CSV na aba "🔄 Sincronizar CSV" do site.
2. O CSV é enviado ao Firebase Storage em `uploads/sync/{jobId}/input.csv`.
3. Um documento `jobs/{jobId}` é criado com `status: "queued"`.
4. O worker detecta o job, baixa o arquivo, processa as regras e grava pendências no Firestore.
5. O job é atualizado para `success` com métricas, ou `failed` com detalhes do erro.

---

## Pré-requisitos

- Python 3.11+
- Conta de serviço (Service Account) do Firebase com permissão de Administrador do Firestore
- `pip` ou `venv`

---

## Configuração Inicial

### 1. Obter a Service Account

1. Acesse o [Console do Firebase](https://console.firebase.google.com/)
2. Selecione seu projeto
3. Vá em **Configurações do Projeto → Contas de Serviço**
4. Clique em **Gerar nova chave privada**
5. Salve o arquivo `.json` em um local seguro **fora do repositório** (ex: `C:\credentials\firebase-admin.json` ou `~/credentials/firebase-admin.json`)

> ⚠️ **NUNCA commite o arquivo de credenciais no Git.**

### 2. Criar o Ambiente Virtual

Execute no terminal dentro da pasta `python_worker/`:

```bash
cd python_worker
python -m venv venv
```

Ativar o venv:
- Windows: `venv\Scripts\activate`
- Linux/macOS: `source venv/bin/activate`

### 3. Instalar as Dependências

```bash
pip install -r requirements.txt
```

---

## Execução

Defina as variáveis de ambiente e execute o worker:

### Windows (PowerShell)
```powershell
$env:FIREBASE_CREDENTIALS_PATH = "C:\caminho\para\firebase-admin.json"
$env:FIREBASE_STORAGE_BUCKET   = "seu-projeto.appspot.com"
python worker.py
```

### Linux / macOS
```bash
export FIREBASE_CREDENTIALS_PATH="/caminho/para/firebase-admin.json"
export FIREBASE_STORAGE_BUCKET="seu-projeto.appspot.com"
python worker.py
```

O worker irá:
- Se conectar ao Firestore e ao Firebase Storage
- Verificar a cada 10 segundos se há jobs novos com `status: "queued"`
- Processar o CSV e gravar as pendências
- Atualizar o job com o resultado ou o erro detalhado

Para encerrar, pressione `Ctrl+C`.

---

## Mapeamento de Colaboradores

Edite o arquivo `config/colaboradores_map.json` para substituir `"PREENCHER_UID"` pelos UIDs reais dos colaboradores. O UID pode ser encontrado no Firebase Console → Authentication.

```json
{
  "BEATRIZ": "uid_real_da_beatriz",
  "VANESSA OLIVEIRA": "PREENCHER_UID"
}
```

---

## Estrutura de Arquivos

```
python_worker/
├── worker.py                  ← Script principal
├── requirements.txt
├── README.md
├── config/
│   ├── rules_validacao_v1.json
│   ├── colaboradores_map.json
│   ├── csv_layout.json
│   └── column_aliases.json
└── modules/
    ├── firestore_repo.py
    ├── storage_repo.py
    ├── csv_reader.py
    ├── rules_engine.py
    ├── fingerprint.py
    ├── collaborator_resolver.py
    ├── pendencias_service.py
    └── historico_service.py
```
