# Customer Pulse - Enterprise CRM & Relationship Intelligence

**Customer Pulse** is an enterprise-grade relationship intelligence and customer health CRM dashboard designed to monitor accounts, analyze customer communications via AI, flag relationship risks, manage stakeholder matrices, and provide actionable account health analytics. Built for secure on-premises enterprise deployment on Windows Server behind corporate VPN.

---

## 🛠️ Technology Stack

- **Frontend**: React (Vite) + Tailwind CSS + Recharts + Zustand State Management + Lucide Icons
- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL (Primary) + High-Fidelity In-Memory Fallback DB (`db-mock.json`)
- **Authentication**: LDAP Active Directory (NeST Digital AD) + Local PostgreSQL DB Auth + JWT Bearer Tokens + `bcryptjs` Hashing
- **Security & Headers**: Express Helmet + `express-rate-limit` + Strict CORS + Brute-force Account Lockout (5 attempts = 15 min lock)
- **Deployment**: IIS Reverse Proxy on Windows Server (`web.config` rewrite engine)
- **AI Integration**: Google Gemini API (`gemini-1.5-flash`) + Local Rule-Based NLP Keyword Fallback Engine
- **Brand System**: NeST Digital Corporate Primary Blue (`#223670`)

---

## 📂 Project Structure

```text
customer-pulse/
 ├─ web.config                # IIS Reverse Proxy & Security Headers config for Windows Server
 ├─ backend/
 │   ├─ src/
 │   │   ├─ config/           # Database adapter (PostgreSQL + Mock DB fallback), RBAC rules & secrets
 │   │   ├─ controllers/      # Webhook ingestion handlers (Outlook & Teams)
 │   │   ├─ middleware/       # JWT auth token verifier & RBAC role-based permission guards
 │   │   ├─ routes/           # REST endpoints (auth, accounts, contacts, interactions, tasks, risks, users, employees)
 │   │   ├─ services/         # Health Score Engine, LDAP AD Authenticator, Gemini AI & HR Sync services
 │   │   └─ server.js         # Express startup entry point with Helmet & Rate Limiting
 │   └─ .env
 └─ frontend/
     ├─ index.html            # SEO-optimized viewport
     ├─ tailwind.config.js    # Tailwind theme customizations & NeST branding
     └─ src/
         ├─ components/       # Navigation Sidebar, Top Header, Toast alerts & Drawers
         ├─ pages/            # Dashboard Visualizer, Accounts List, Contact Matrix, Interaction Log, Risk Center, Users Directory
         ├─ store/            # Zustand global state dispatcher store
         ├─ App.jsx           # React Router entry map with Auth Guards
         ├─ index.css         # Custom utility classes & NeST Digital color variables
         └─ main.jsx          # React app bootstrap mount
```

---

## 🚀 Running Locally

### 1. Start the Backend Server
1. Open a terminal and navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Verify `.env` parameters:
   - `PORT=5000`
   - `DB_TYPE=postgres` (or `mock` for in-memory DB fallback without PostgreSQL server)
   - `LDAP_ENABLED=true` (for LDAP AD login)
   - `JWT_SECRET=your-enterprise-jwt-secret-key`
   - `GEMINI_API_KEY=your_gemini_api_key`
3. Install dependencies and start the backend server:
   ```bash
   npm install
   npm start
   ```
   *Server will start on port `5000` (`http://localhost:5000/api`).*

### 2. Start the Frontend Application
1. Open a second terminal and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install packages and start the Vite development server:
   ```bash
   npm install
   npm run dev
   ```
   *Frontend application will start on port `5173` (`http://localhost:5173`).*

---

## 🧩 Key Architecture & Security Highlights

### 1. Enterprise Authentication & Security Hardening
- **LDAP Active Directory**: Native authentication via LDAP (`amina.rashad@nestgroup.net` / `123@Atha#`) with local PostgreSQL user auto-provisioning.
- **`bcryptjs` Hashing**: All local credentials are stored as salted bcrypt hashes.
- **Account Lockout**: Triggers a 15-minute lockout window after 5 consecutive failed login attempts.
- **Security Headers & Rate Limiting**: Protection against DDoS, brute-force, clickjacking, and XSS using `helmet` and `express-rate-limit`.
- **MIME & Upload Sanitization**: Uploaded files (`.pdf`, `.docx`, `.xlsx`, `.png`, `.jpg`) are limited to 10MB, MIME-checked, and assigned randomized UUID filenames.

### 2. Role-Based Access Control (RBAC)
Backend permission guards strictly validate operations by user role:
- **Admin**: Full CRM management, view all team interactions, edit/delete accounts, manage users, and resolve risk alerts.
- **Executive / CEO**: Full organizational visibility across all portfolio accounts, interaction logs, risk center alerts, and executive health reports.
- **Sales Manager / BU Head**: Manage accounts under assigned business units, CRUD contacts, assign staff tasks, and resolve risks.
- **Employee**: Log client interactions, view assigned tasks, update stakeholder details, and manage client contacts.

### 3. AI Analysis & Keyword Fallback Engine
Whenever interaction logs or webhooks are ingested:
- If `GEMINI_API_KEY` is present, the app calls `gemini-1.5-flash` to extract structured JSON containing Sentiment, Risk Level, Category, and Action Mentions.
- If absent, a local NLP matcher evaluates keywords (e.g. "downtime", "alternative", "cancel", "delay") to populate risk scores seamlessly offline.

### 4. Dynamic Weighted Health Score Formula
The account Health Score is dynamically computed:
$$\text{Health Score} = 25\% \text{ Engagement} + 25\% \text{ Relationship Depth} + 25\% \text{ Sentiment Trend} + 25\% \text{ Risk Signals}$$
- **Engagement**: Communication volume in the last 30 days.
- **Relationship Depth**: Contact coverage across CXO/VP decision makers.
- **Sentiment Trend**: Rolling average of the last 5 logs.
- **Risk Signals**: Deducted for active unresolved risk alarms.

---

## 🔒 Evaluation Role Credentials

### LDAP Active Directory Credentials
- **LDAP Admin**: `amina.rashad@nestgroup.net` / `123@Atha#`

### Local Fallback Credentials
- **Admin**: `admin@pulse.com` / `admin123`
- **Executive**: `executive@pulse.com` / `exec123`
- **Sales Manager / BU Head**: `manager@pulse.com` / `manager123`
- **Employee**: `employee@pulse.com` / `employee123`

---

## 🌐 On-Premises Windows Server Deployment (IIS)

The repository includes a root `web.config` file pre-configured for IIS Reverse Proxy deployment:
1. Enable **URL Rewrite** and **Application Request Routing (ARR)** in IIS.
2. Route incoming `/api/*` and `/uploads/*` requests to Node.js backend (`http://127.0.0.1:5000`).
3. Set SPA rewrite fallback rules to `index.html`.
4. Bind SSL Certificate on Port 443 for company VPN / intranet access.
