# The Ultimate Beginner's Guide: Decoupled Deployment

Since your IoT project requires continuous data streaming (Server-Sent Events) and physical file storage for the AI, a specific architecture is required. By putting the **Frontend on Vercel** and the **Backend on Render.com**, you get the best of both worlds.

This completely bypasses the strict 15-second "Serverless disconnect" limits Vercel has, while keeping your website blazingly fast.

> **⚠️ WARNING REGARDING THE FREE TIER (RENDER)**
> The Render.com free tier spins down (goes to sleep) after 15 minutes of inactivity. When it wakes up, it reboots the server and completely wipes its local hard drive. Because I programmed the AI to save uploaded PDFs to an `/uploads/` folder, those physical files will be wiped when the server sleeps. The database will "remember" they exist, but the physical file will be gone. You will have to re-upload your manuals if you do not upgrade to a $7/mo standard Render tier (which gives an external permanent disk).

Here is the exact step-by-step master plan to perform this split deployment.

---

## Phase 1: Set Up the Database (Supabase)
You cannot use `localhost` (your personal computer) for the database once the app is in the cloud.

1. Go to [Supabase.com](https://supabase.com) and create a free account.
2. Click **New Project**, name it `ionfiltra-db`, and set a strong database password.
3. Once the database is built, click **Settings** -> **Database**.
4. Scroll down to **Connection String** -> URI.
5. It will look like this: `postgresql://postgres.[YOUR_PROJECT_ID]:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
6. Keep this URL safe—you will need it for the Backend deployment!

---

## Phase 2: Deploy Backend to Render.com

Render needs to know it should only run the `backend/` folder, not the frontend.

1. Go to [Render.com](https://render.com) and sign up with your GitHub account.
2. Click **New +** and select **Web Service**.
3. Under *Connect a Repository*, select your **IonFiltra** repository.
4. Fill in the following exact configuration:
   - **Name:** `ionfiltra-api`
   - **Root Directory:** `backend` *(Crucial: This tells Render to ignore the frontend folder).*
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node app.js`
   - **Instance Type:** `Free`
5. Click **Advanced** and add these Environment Variables:
   - `GEMINI_API_KEY` : (Your Google API Key)
   - `DB_HOST` : `aws-0-...pooler.supabase.com`
   - `DB_PORT` : `6543`
   - `DB_USER` : `postgres.[YOUR_PROJECT_ID]`
   - `DB_PASSWORD` : `(Your Supabase DB Password)`
   - `JWT_SECRET` : `super_secret_ionfiltra_key`
   - `HARDWARE_TOKEN` : `ion_sensor_hw_token_2026_never_expires`
6. Click **Create Web Service**. 
7. Wait ~2 minutes for it to build. Once it is live, **Copy the URL at the top left** (e.g., `https://ionfiltra-api.onrender.com`). You will need this for the Frontend and your hardware sensors!

---

## Phase 3: Update Context for the Frontend

Before we can deploy the UI to Vercel, the frontend code needs to know where the backend went. Currently, it defaults to looking for your local computer (`http://localhost:3000`).

Wait, the code in `AppContext.jsx` currently defaults to reading from `.env`. We need to define `VITE_API_BASE_URL` inside Vercel. No code changes are required locally! The application is already coded safely to accept dynamic cloud URLs.

---

## Phase 4: Deploy Frontend to Vercel

1. Go to [Vercel.com](https://vercel.com) and log in.
2. Click **Add New...** -> **Project**.
3. Select your **IonFiltra** GitHub repository.
4. **Configuration Screen (Crucial Step):**
   - Under **Root Directory**, click **Edit** and select the `frontend` folder. *(This tells Vercel to completely ignore the backend code).*
   - Under **Framework Preset**, ensure it says **Vite**.
   - Expand **Environment Variables** and add:
     - Name: `VITE_API_BASE_URL` 
     - Value: `https://ionfiltra-api.onrender.com` *(The URL you copied from Render).*
5. Click **Deploy**. Vercel will build your static Dashboard.

---

## Phase 5: Link Your Custom Domain & Hardware

1. **Dashboard UI (Vercel):** Go to your Vercel project Settings -> Domains. Type in your custom domain `ionfiltra.com`. Copy the DNS records Vercel generates and paste them into your Domain Registrar (GoDaddy, etc).
2. **IoT Hardware Update:** Update your C++/Python hardware sensor scripts! Instead of POSTing data to `http://localhost:3000/api/ingest`, they must now POST their payloads directly to the new Render URL: `https://ionfiltra-api.onrender.com/api/ingest`.
