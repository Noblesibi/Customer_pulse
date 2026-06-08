# Customer Pulse - Enterprise CRM & Relationship Intelligence

Customer Pulse is a relationship intelligence and customer health dashboard designed to monitor accounts, analyze customer communications via AI, flag relationship risks, and provide actionable analytics.

---

## 🛠️ Tech Stack

- **Frontend**: React (Vite) + Tailwind CSS (v4) + Recharts + Zustand
- **Backend**: Node.js + Express.js
- **Database**: Google Firebase Firestore (support for real-time listeners & polling fallback)
- **Authentication**: Firebase Auth & Microsoft SSO ready architecture
- **AI Integration**: Gemini API (`gemini-1.5-flash` model integration)

---

## 📂 Project Structure

```text
customer-pulse/
 ├─ firestore.rules          # Firebase firestore security rules
 ├─ backend/
 │   ├─ src/
 │   │   ├─ config/          # Firebase Admin SDK & local mock database init
 │   │   ├─ controllers/     # Webhook ingestion handlers
 │   │   ├─ middleware/      # JWT auth role-based guard middleware
 │   │   ├─ routes/          # REST CRUD endpoints
 │   │   ├─ services/        # Health Score Engine & Gemini AI services
 │   │   └─ server.js        # Express startup entry point
 │   └─ .env.example
 └─ frontend/
     ├─ index.html           # SEO-optimized viewport
     ├─ postcss.config.js    # PostCSS Tailwind adapter config
     ├─ tailwind.config.js   # Tailwind theme customizations
     └─ src/
         ├─ components/      # Sidebar, Navbar, and slide-in Toast alerts
         ├─ layouts/         # Guarded routing wrappers
         ├─ pages/           # Dashboard visualizer, Accounts list, Contact Matrix, Risk Center, Webhook Sandbox
         ├─ store/           # Zustand state dispatcher store
         ├─ App.jsx          # React Router entry map
         ├─ index.css        # Global CSS classes (glassmorphism details)
         └─ main.jsx         # App bootstrap mount
```

---

## 🚀 Running Locally

### 1. Start the Backend
1. Open a terminal and navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Copy the environment variables:
   ```bash
   cp .env.example .env
   ```
3. Set your `GEMINI_API_KEY` in `.env` to connect to real Gemini API.
4. Set your `FIREBASE_SERVICE_ACCOUNT_KEY` absolute path in `.env` to connect to Firebase.
   > **Note**: If environment credentials are left blank, the backend automatically falls back to an **in-memory mock database & local NLP keyword analyzer**! It runs out-of-the-box with seed data!
5. Install packages and boot the backend server:
   ```bash
   npm install
   npm start
   ```
   *Server will start on port `5000` (`http://localhost:5000/api`).*

### 2. Start the Frontend
1. Open a new terminal and navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Install packages and boot the Vite development server:
   ```bash
   npm install
   npm run dev
   ```
   *Frontend will run on port `5173` (`http://localhost:5173`).*

---

## 🧩 Key Architecture Highlights

### 1. AI Analysis & Keyword Fallback
Whenever communications are logged (or webhook posts are ingested), the text is evaluated. If `GEMINI_API_KEY` is present, it uses `gemini-1.5-flash` to extract structured JSON containing Sentiment, Risk Level, Risk Category, Summary, and Severity. If absent, a rule-based NLP matcher maps keywords like "downtime", "alternative", "late", and "cancel" to appropriate risk parameters, ensuring correct visual output during locally run demos.

### 2. Weighted Health Score Formula
The account Health Score is dynamically calculated as:
$$\text{Health Score} = 25\% \text{ Engagement} + 25\% \text{ Relationship Depth} + 25\% \text{ Sentiment Trend} + 25\% \text{ Risk Signals}$$
- **Engagement**: Counts frequency of communication in the last 30 days.
- **Relationship Depth**: Checks contact coverage (highest if CXO decision makers are present).
- **Sentiment Trend**: Rolling average of the last 5 logs.
- **Risk Signals**: Deteriorated by active, unresolved high-severity risk alarms.

---

## 🔒 Evaluation Roles Credentials
Four pre-seeded mock credentials are provided for testing role permissions:
- **Admin** (`admin@pulse.com` / `admin123`): Full CRM modification access, write accounts, CRUD contacts, delete accounts, resolve risks.
- **Executive** (`executive@pulse.com` / `exec123`): Read-only access to portfolio charts, risk center alerts, and AI executive summaries. Cannot modify account records.
- **Sales Manager** (`manager@pulse.com` / `manager123`): Modify accounts, CRUD contacts, and resolve risks.
- **Employee** (`employee@pulse.com` / `employee123`): Log interactions, CRUD contacts, read-only accounts list. No permission to edit/delete accounts or resolve risk alerts.
