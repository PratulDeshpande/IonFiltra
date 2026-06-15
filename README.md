# Ion Filtra — Industrial IoT Predictive Maintenance Platform 🏭⚡

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Hardware](https://img.shields.io/badge/Hardware-STM32%20%7C%20ESP32-green)](#hardware-layer)
[![Stack](https://img.shields.io/badge/Stack-React%20%7C%20Node.js%20%7C%20PostgreSQL-orange)](#backend-architecture)
[![AI](https://img.shields.io/badge/AI-Gemini%202.5%20Flash-purple)](#ai--predictive-maintenance)

**Ion Filtra** is a full-stack, end-to-end **Industrial IoT (IIoT)** platform engineered for remote monitoring, real-time telemetry, and predictive maintenance of **Pulse Jet Bag Filter Controllers**. 

This system integrates bare-metal MCU firmware, wireless mesh networking (LoRa), cellular backhaul (GSM/4G), a high-throughput Node.js ingestion engine, and an AI-powered React dashboard to bring modern observability to heavy manufacturing environments (cement, steel, pharmaceuticals).

---

## 🏗️ System Architecture

The system operates across 4 distinct OSI-like layers, transporting physical sensor readings from the factory floor to a cloud-hosted predictive AI.

```mermaid
graph LR
    subgraph "Factory Floor (Edge)"
        A["STM32 Slave Nodes<br/>(Modbus + LoRa)"] -->|LoRa 433MHz| B["ESP32 Master Gateway<br/>(LoRa + GSM)"]
    end
    
    subgraph "Cloud Infrastructure"
        B -->|HTTPS POST<br/>JSON Array| C["Node.js / Express<br/>(Render)"]
        C -->|pg-pool| D[("PostgreSQL<br/>(Supabase)")]
        C -->|REST/RPC| E["Gemini 2.5 AI<br/>(Predictive Engine)"]
    end
    
    subgraph "Client Layer"
        F["React Dashboard<br/>(Vite + Vercel)"] -.->|SSE Stream| C
        F -.->|REST API| C
    end
```

---

## 🛠️ 1. Hardware Layer (Firmware)

### Slave Nodes (STM32)
- **Role**: Interfaces directly with the Bag Filter Controller via **Modbus RTU** (RS485).
- **MCU**: STM32 (bare-metal C, HAL drivers).
- **Communication**: LoRa SX1278 transceiver @ 433MHz.
- **Workflow**:
  1. Polls the bag filter controller every `1.5s` for critical operational data (Differential Pressure, Temperatures, Particulate Matter).
  2. Polls for configuration states (Timer limits, Interlock bypasses).
  3. Packs the telemetry into a highly optimized 37-byte binary `SensorPayload` struct.
  4. Waits for the Master ESP32 to poll its assigned Node ID over the LoRa mesh network, then transmits the binary payload.

### Master Gateway (ESP32 + SIM7600)
- **Role**: Acts as the LoRa mesh coordinator and Cellular Backhaul.
- **MCU**: ESP32-WROOM-32 (Arduino Framework).
- **Workflow**:
  1. Issues Node IDs to unregistered STM32 slaves using their 96-bit unique UUIDs.
  2. Sequentially polls up to 100 registered nodes via LoRa.
  3. Deserializes the binary structs into JSON objects.
  4. **Offline Resilience Buffer**: Buffers up to 50 readings in a circular buffer if GSM connectivity drops.
  5. Batches telemetry (arrays of 10) and transmits them via **HTTPS POST** using AT commands over the SIM7600 GSM/LTE module.

---

## 🌐 2. Backend Architecture

The backend is a high-throughput **Express.js** API engineered to ingest cellular telemetry and stream it to frontend clients in real-time.

- **Data Ingestion**: The `/api/ingest` endpoint accepts batched JSON payloads. It utilizes hardware-time delta reconstruction (`currentHardwareTime - reading.timestamp`) to accurately calculate the absolute `created_at` timestamp of buffered offline readings.
- **Real-Time Streaming**: Uses **Server-Sent Events (SSE)** via the `/api/stream` endpoint to push live telemetry to connected React clients, completely bypassing the need for heavy WebSocket wrappers like Socket.io.
- **Multi-Tenancy**: Implements strict Role-Based Access Control (RBAC). All data, users, facilities, and knowledge files are scoped by `organization_id`.
- **Database Auto-Migration**: The `database.js` connection pool automatically handles `CREATE TABLE IF NOT EXISTS` table migrations on server startup.

### Database Schema (Supabase / PostgreSQL)

```mermaid
erDiagram
    organizations ||--o{ users : "has"
    organizations ||--o{ sensor_readings : "owns"
    organizations ||--o{ facilities : "operates"
    organizations ||--o{ knowledge_files : "owns"

    sensor_readings {
        BIGINT id PK
        INTEGER node_id
        NUMERIC differential_pressure
        NUMERIC temp_in
        NUMERIC temp_out
        NUMERIC particulate_matter
        BOOLEAN sys_ok
        BOOLEAN plc_interlock_stat
        TIMESTAMPTZ created_at
    }
```

---

## 🧠 3. AI & Predictive Maintenance

The platform leverages **Google Gemini 2.5 Flash** for two distinct AI integrations:

### 1. Daily Predictive Analytics (Cron-Triggered)
- A secured endpoint (`/api/cron/predict`) is triggered daily by an external cron service.
- The engine fetches the last 24 hours of telemetry (sub-sampled to 100 data points to fit token context windows).
- Gemini analyzes the data for trends (e.g., *Is the differential pressure rising asymptotically? Are cleaning cycles failing to clear the filters?*).
- If anomalies are detected, the system triggers a **Google Apps Script Webhook** to dispatch a high-priority email alert to plant engineers.

### 2. IonAssist (RAG Chatbot)
- The React frontend features a floating AI assistant.
- **Retrieval-Augmented Generation (RAG)**: Users can upload PDF manuals, P&ID diagrams, and datasheets. The backend uploads these to Gemini's File API.
- When an operator asks a question, the backend retrieves the real-time telemetry of the requested node and injects it into the prompt alongside the uploaded knowledge files, allowing the AI to answer contextually (e.g., *"Why is Node 2's DP Interlock tripping?"*).

---

## 💻 4. Frontend Dashboard

- **Tech Stack**: React 18, Vite, TailwindCSS 3.
- **State Management**: React Context API (`AppContext.jsx`).
- **Features**:
  - Dark/Light mode toggle.
  - Dynamic `LocationSelector` rendering active factory facilities.
  - Live `NodeCard` grid updating instantly via SSE.
  - Sub-views for: Live Activity Timeline (Recharts), 48-Channel Electrical Fault Matrix, Configuration limits, and LoRa SNR/RSSI signal degradation.

---

## 🚀 Setup & Deployment Guide

### Prerequisites
- Node.js (v18+)
- PostgreSQL Database (e.g., Supabase)
- Google Gemini API Key

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   npm install
   ```
2. Create a `.env` file based on `.env.example`:
   ```env
   PORT=5000
   DATABASE_URL=postgres://user:pass@host:5432/dbname
   JWT_SECRET=your_super_secret_jwt_key
   HARDWARE_TOKEN=your_secure_static_hardware_token
   GEMINI_API_KEY=your_google_ai_key
   CRON_SECRET=secure_password_for_cron
   GOOGLE_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
   ```
3. Run the Database Setup script (wipes existing data and seeds the schema):
   ```bash
   npm run setup
   ```
4. Start the server:
   ```bash
   npm run dev
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   npm install
   ```
2. Create a `.env` file:
   ```env
   VITE_API_BASE_URL=http://localhost:5000
   ```
3. Start the Vite dev server:
   ```bash
   npm run dev
   ```

### Hardware Deployment
- Flash `master_final.ino` to your ESP32 using the Arduino IDE. Ensure the `serverURL` and `Authorization` bearer token (matching `HARDWARE_TOKEN`) are correctly set in the code.
- Flash `slave_final.c` to your STM32 using STM32CubeIDE.

---

## 🔮 Roadmap / Future Enhancements
- **Dynamic LBS (Location Based Services)**: Implementing AT+CPSI commands on the SIM7600 to dynamically fetch Cell ID, passing it via `X-Cell-Info` headers, and geocoding it to Lat/Lng on the backend to track gateway movement.
- **Over-The-Air (OTA) Updates**: Allow the ESP32 to fetch firmware `.bin` files via HTTPS from the Node.js backend.
- **WebSockets Fallback**: For clients where SSE connections are dropped by aggressive corporate firewalls.

---
*Built by the IONFILTRA Team.*
