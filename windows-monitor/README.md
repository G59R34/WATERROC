Windows Monitor (scaffold)

This folder contains a simple Electron scaffold and a Node monitor script (`monitor.js`) that demonstrates how to capture active window information and send it to Supabase.

Security & Privacy
- This tool collects active window/app data which can be sensitive. Only deploy with informed consent and in accordance with local laws and company policies.
- Never ship service-role Supabase keys inside client apps. Use a secure relay or server to accept logs from clients.

Quick start (developer machine):

1. Install dependencies (inside this folder):

```powershell
cd windows-monitor
npm install
```

2. Set environment variables (use a server key for local testing only):

```powershell
$env:SUPABASE_URL = 'https://xyz.supabase.co'
$env:SUPABASE_KEY = 'your-service-role-key'
```

3. Run the monitor node script (example):

```powershell
node monitor.js
```

Notes:
- For production, build a secure authenticated channel to accept logs (e.g., via server-side endpoint) rather than embedding service-role keys.
- The `active-win` package requires native modules and may need build tools on Windows.
