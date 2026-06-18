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
4. Under **Server authentication**, select **SQL Server and Windows Authentication mode** (Mixed Mode).
5. Click **OK**.
6. Expand **Security** -> **Logins**, right-click the `sa` user, select **Properties**, set a strong password, and ensure the login status is set to **Enabled** under the **Status** page.

### 5. Update backend `.env`
Open [backend/.env](file:///c:/Users/amina.rashad/Downloads/customer_pulse/backend/.env) and update your configuration:
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
