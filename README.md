# Hotel Herbo · Sistema de Gestão & Aplicativo Mobile

> *"A liberdade de acampar com a sofisticação de um serviço de hotel."*

Arquitetura Full-Stack para gestão de hospedagem glamping e atendimento em tempo real do **Hotel Herbo**, atendendo profissionais urbanos e casais que buscam conforto e experiências na natureza.

---

## 1. Visão Geral da Arquitetura

```
┌──────────────────────────────┐        WebSocket (/ws/admin/)        ┌──────────────────────────────┐
│  Painel Admin (React + Vite) │ ◄──────────────────────────────────► │                              │
│  PC Web · http://localhost:5173│       REST API + ETag (/api/)      │   Backend Django + DRF       │
│  • OcupaçãoCheck-in/Check-out│                                      │   + Django Channels (Daphne) │
│  • Consumo c/ Upload de Foto │                                      │   http://0.0.0.0:8000        │
│  • Pedidos c/ Alerta Sonoro  │                                      │                              │
└──────────────────────────────┘                                      └──────────────▲───────────────┘
                                                                                     │
┌──────────────────────────────┐        WebSocket (/ws/guest/)                       │
│  App Hóspede (React Native)  │ ◄───────────────────────────────────────────────────┘
│  Expo · iOS / Android        │       REST API + ETag (/api/me/*)
│  • Dashboard da Tenda        │                        │
│  • Espelho de Consumo/Status │                        ▼
│  • Central de Solicitações   │            ┌───────────────────────┐
└──────────────────────────────┘            │  PostgreSQL (Local)   │
                                            │  + Media Storage      │
                                            └───────────────────────┘
```

### Estrutura de Pastas
- [`backend/`](./backend): API REST (Django REST Framework), WebSockets (Django Channels + Daphne), modelagem do banco (`Guest`, `Room`, `Reservation`, `CatalogItem`, `Consumption`, `ServiceRequest`, `ActivityLog`), sinais de sincronização em tempo real e comando `seed_herbo`.
- [`admin-web/`](./admin-web): Painel Administrativo Web (React + Vite) com identidade visual verde-floresta e dourado, controle de check-in/check-out, lançamento/edição/cancelamento de consumo com upload de fotos e central Kanban de pedidos com **alerta sonoro HTML5** automático.
- [`mobile/`](./mobile): Aplicativo do Hóspede (React Native + Expo) com espelho em tempo real do painel admin (status do check-in, dias hospedado, tenda atual, lista transparente de consumo ativo/cancelado com fotos, linha do tempo de atividades) e central de solicitações (room service, fogueira, limpeza e experiências).

---

## 2. Passo a Passo de Execução Local

### Passo 1 — Configurar o Banco de Dados (PostgreSQL Local)

1. Abra o **pgAdmin** ou o terminal `psql` do PostgreSQL na sua máquina e crie o banco de dados:
   ```sql
   CREATE DATABASE hotel_herbo ENCODING 'UTF8';
   ```
2. Na pasta `backend/`, copie o arquivo `.env.example` para `.env` e ajuste o usuário/senha do seu PostgreSQL local:
   ```powershell
   cd backend
   Copy-Item .env.example .env
   ```
   Conteúdo padrão do `backend/.env`:
   ```env
   DJANGO_SECRET_KEY=hotel-herbo-chave-secreta-local
   DJANGO_DEBUG=1
   DJANGO_ALLOWED_HOSTS=*

   DB_ENGINE=postgres
   DB_NAME=hotel_herbo
   DB_USER=postgres
   DB_PASSWORD=sua_senha_do_postgres
   DB_HOST=localhost
   DB_PORT=5432
   ```
   *(Dica: caso queira testar imediatamente sem o PostgreSQL instalado, basta definir `DB_ENGINE=sqlite` no `.env`.)*

---

### Passo 2 — Rodar as Migrações do Django e Popular Dados Iniciais (`seed_herbo`)

No terminal PowerShell, dentro da pasta `backend/`:

```powershell
cd backend

# 1. Criar e ativar o ambiente virtual (caso ainda não esteja ativo)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 2. Instalar as dependências
pip install -r requirements.txt

# 3. Executar as migrações no banco de dados
python manage.py makemigrations
python manage.py migrate

# 4. Popular o banco com tendas, cardápio, admin e a hóspede Marcela
python manage.py seed_herbo

# 5. Iniciar o servidor ASGI (Daphne: HTTP + WebSockets) aberto na rede local
python manage.py runserver 0.0.0.0:8000
```

#### Credenciais criadas pelo `seed_herbo`:
| Perfil | Usuário | Senha | Descrição |
| :--- | :--- | :--- | :--- |
| **Administrador (PC Web)** | `admin` | `herbo123` | Acesso total ao Painel da Recepção |
| **Hóspede (App Mobile)** | `marcela` | `herbo123` | Hospedada na **T01 · Tenda Ipê** há 2 dias, com consumos ativos, 1 item cancelado e histórico |
| **Hóspede (App Mobile)** | `rafael` | `herbo123` | Reserva confirmada no **D01 · Domo Estrela** aguardando check-in |

---

### Passo 3 — Iniciar o Painel Admin (React Web no PC)

Abra um **segundo terminal** na pasta `admin-web/`:

```powershell
cd admin-web
npm install
npm run dev
```

- Acesse no navegador: **http://localhost:5173**
- Faça login com **`admin`** / **`herbo123`**.
- Clique em **🔊 Ativar alertas sonoros** na barra lateral (ou em **🔔 Testar som** na tela de Pedidos) para liberar o áudio HTML5 no navegador.

---

### Passo 4 — Iniciar o Aplicativo Mobile (React Native / Expo)

Abra um **terceiro terminal** na pasta `mobile/`:

```powershell
cd mobile
npm install
npx expo start
```

- **No celular físico (Android / iOS)**:
  1. Conecte o celular na **mesma rede Wi-Fi** do seu PC.
  2. Abra o aplicativo **Expo Go** e escaneie o QR Code exibido no terminal.
  3. O app detecta automaticamente o IP local do seu PC via Expo. Caso queira ajustar manualmente, toque em **`⚙️ Servidor`** na tela de login do app e informe `http://<IP_DO_SEU_PC>:8000` (descubra o IP rodando `ipconfig` no PowerShell).
- **No navegador ou emulador**:
  - Pressione `a` para Android Emulator ou `w` para abrir a versão web mobile.
- Faça login como **`marcela`** / **`herbo123`** (ou toque no botão rápido de demonstração da Marcela).
