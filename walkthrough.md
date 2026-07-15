# Database Setup & Configuration Walkthrough

Customer Pulse features a flexible, dynamic database adapter layer that lets you hot-swap database engines. By default, it supports:
- **Microsoft SQL Server** (local / remote instances)
- **MySQL / Percona Server** (local / containerized instances)
- **In-Memory Mock Database** (no installation required; ideal for development and quick demos)

If your backend logs a connection warning and falls back to the in-memory mock database, you can set up a persistent database by following the instructions below.

---

## 🔌 Option 1: Microsoft SQL Server Configuration

To configure local SQL Server connectivity, follow these configuration steps:

### 1. Enable TCP/IP Protocol
1. Press `Win + R`, type `compmgmt.msc` (Computer Management) or open **SQL Server Configuration Manager** directly.
2. Navigate to **SQL Server Network Configuration** -> **Protocols for MSSQLSERVER** (or your named instance like `SQLEXPRESS`).
3. Right-click **TCP/IP** and select **Enable**.

### 2. Configure TCP Port to 1433
1. Right-click **TCP/IP** again and select **Properties**.
2. Go to the **IP Addresses** tab.
3. Scroll down to the **IPAll** section at the bottom.
4. Clear the **TCP Dynamic Ports** value (leave it empty) and set **TCP Port** to `1433`.
5. Click **Apply** and then **OK**.

### 3. Restart SQL Server Service
1. In SQL Server Configuration Manager, select **SQL Server Services** in the left panel.
2. Right-click **SQL Server (MSSQLSERVER)** (or your instance name) and select **Restart**.

### 4. Enable Mixed Mode Authentication
1. Open **SQL Server Management Studio (SSMS)** and connect to your database instance.
2. Right-click the server instance name in the Object Explorer and select **Properties**.
3. Go to the **Security** page.
4. **Client Log Progress Stepper Update**: Renamed the widget to **Client Engagement Pulse** and redesigned the horizontal pipeline with custom Lucide status icons (`Send`, `Eye`, `MessageSquare`, `CheckCheck`), active HSL/emerald-gradient connection lines, hover scale animations, and soft box-shadow glowing nodes. It is positioned at the top of the Dashboard, directly below the greeting welcome header.
- **Removed Activity Feed Card**: Completely removed the redundant **Recent System Activity Feed** card from the Dashboard per user feedback to keep the interface focused.
- **Navbar Tab Rename**: Renamed the **Org Hierarchy** navigation link in [Navbar.jsx](file:///c:/Users/amina.rashad/Downloads/customer_pulse/frontend/src/components/Navbar.jsx) to **Client History** per user request.

### Client Accounts Page Actions & Add Account Permissions

- **[Accounts.jsx](file:///c:/Users/amina.rashad/Downloads/customer_pulse/frontend/src/pages/Accounts.jsx)**:
  - We added clean, standardized top-level page padding (`p-6 md:p-8`) to maintain consistent alignment.

---

## 12. Fix Choose Files Button Hover Readability
We resolved an issue on the Attachments card where hovering over the "Choose Files" button made the text and upload icon completely invisible (white text on a white background).
- Replaced `hover:text-white` with `hover:bg-dark-700` in `LogActivity.jsx`, `AccountDetails.jsx`, and `Accounts.jsx`.
- The button now transitions to a nice light gray background when hovered, keeping the text and icon fully black and legible.

  - Updated role guards on the "Add Account" button to allow `Executive`.
  - Updated role guards in the "Actions" column to allow `Executive` for both the Edit and Delete button views.
  - Allowed `Executive` to assign/update the Account Owner.
  - Allowed `Executive` to delete Key Contacts and select/update the Stakeholder Owner dropdown.
- **[Risks.jsx](file:///c:/Users/amina.rashad/Downloads/customer_pulse/frontend/src/pages/Risks.jsx)**:
  - Updated role guards on the "Resolve Alarm" button to allow `Executive`.
- **[account.routes.js](file:///c:/Users/amina.rashad/Downloads/customer_pulse/backend/src/routes/account.routes.js)**:
  - Updated the backend validation on `POST /api/accounts` and `PUT /api/accounts/:id` to accept `Executive` role requests in `requireRole`.
  - Updated `DELETE /api/accounts/:id` to allow both `Admin` and `Executive` roles.
- **[contact.routes.js](file:///c:/Users/amina.rashad/Downloads/customer_pulse/backend/src/routes/contact.routes.js)**:
  - Updated the contact management endpoints (`POST`, `PUT`, `DELETE` contacts) to allow `Executive` users in `requireRole` checks.
- **[risk.routes.js](file:///c:/Users/amina.rashad/Downloads/customer_pulse/backend/src/routes/risk.routes.js)**:
  - Updated `PUT /api/risks/:id` (mitigate/resolve risk status) to authorize `Executive` role requests in `requireRole` check.

---

## Verification & Manual Testing Results

You can manually verify the changes with the following steps:
1. Open the Customer Pulse CRM dashboard (`http://localhost:5173`).
2. Log in with the **ITG Head** credentials preset from the dropdown (or use `itghead@gmail.com` / `itghead123`).
3. Click the **Accounts** page in the top navigation.
4. Verify that:
   - The **Add Account** button is visible in the top right of the Client Portfolio panel.
   - The individual row **Actions** column displays both the **Edit (pencil)** and **Delete (trash bin)** buttons for `Acme Corporation` and `XYZ` accounts.
   - Clicking **Edit** opens the edit page successfully.
   - Clicking an account row opens the drawer panel where the **Account Owner** dropdown and key contact **Stakeholder Owner** dropdown are fully interactive.
5. Navigate to the **Risks** page in the navigation.
6. Verify that the **Resolve Alarm** button is visible and interactive for open alarms.
7. Log in as an Administrator (`admin@pulse.com` / `admin123`) or CEO (`nj@gmail.com` / `nj123`) and verify that under the **All Assigned Tasks** tab in **Activity Log**, all tasks from all users are visible.
8. Verify role-based task filtering for ITG Head (non-Admin/non-CEO): under **All Assigned Tasks**, they see only their created tasks, and under **Tasks Assigned to Me**, they see tasks assigned to them.
9. Verify files uploads and attachments in **Log Activity** page and details views.

---

## 🧪 Verification & Results:
```ini
DB_TYPE=mssql
DB_SERVER=localhost
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=YourStrongPasswordHere
DB_DATABASE=CustomerPulse
```

---

## 🐬 Option 2: MySQL / Percona Server Configuration

If you prefer using MySQL/Percona, configure it as follows:

### 1. Start MySQL Server
Ensure a local MySQL instance is running on your system, or start one using a Docker container if Docker is installed. A `docker-compose.yml` config is included in the project root:
```bash
docker-compose up -d
```

### 2. Update backend `.env`
Open [backend/.env](file:///c:/Users/amina.rashad/Downloads/customer_pulse/backend/.env) and configure the following variables:
```ini
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YourStrongRootPasswordHere
DB_DATABASE=customer_pulse
```

---

## 🧪 Verifying Database Connectivity

You can verify your database adapter setup using the built-in diagnostic and integration verification scripts.

Navigate to the `backend` directory and run:

### For SQL Server (MSSQL)
```bash
node test-db.js
```

### For MySQL / Percona
```bash
node test-db-mysql.js
```

If the tests pass, start the main application servers:
- **Backend**: `npm start` (runs on `http://localhost:5000`)
- **Frontend**: `npm run dev` (runs on `http://localhost:5173`)
