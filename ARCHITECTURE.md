# Employee Portal Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    EMPLOYEE PORTAL SYSTEM                    │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│              │         │              │         │              │
│   EMPLOYEE   │◄────────┤   WEB APP    │◄────────┤   SUPABASE   │
│   (Mobile)   │         │  (Frontend)  │         │   (Backend)  │
│              │         │              │         │              │
└──────────────┘         └──────────────┘         └──────────────┘
```

## Detailed Architecture

```
                    EMPLOYEE PORTAL ARCHITECTURE
                    ============================

┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌────────────────────┐        ┌────────────────────┐             │
│   │   Mobile Browser   │        │  Desktop Browser   │             │
│   │   (Primary)        │        │  (Secondary)       │             │
│   ├────────────────────┤        ├────────────────────┤             │
│   │ • iOS Safari       │        │ • Chrome           │             │
│   │ • Chrome Mobile    │        │ • Firefox          │             │
│   │ • Firefox Mobile   │        │ • Safari           │             │
│   │ • Samsung Internet │        │ • Edge             │             │
│   └────────────────────┘        └────────────────────┘             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          DNS LAYER                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   emp.waterroc.com  ──►  CNAME  ──►  [username].github.io          │
│                                        ▼                             │
│                                  GitHub Pages CDN                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       APPLICATION LAYER                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌────────────────────────────────────────────────────┐            │
│   │              emp-login.html (Entry Point)          │            │
│   ├────────────────────────────────────────────────────┤            │
│   │ • Username/Email input                             │            │
│   │ • Password authentication                          │            │
│   │ • Remember me checkbox                             │            │
│   │ • Employee role verification                       │            │
│   │ • Session management                               │            │
│   └────────────────────────────────────────────────────┘            │
│                              ▼                                       │
│   ┌────────────────────────────────────────────────────┐            │
│   │              emp-portal.html (Main App)            │            │
│   ├────────────────────────────────────────────────────┤            │
│   │ • Task display interface                           │            │
│   │ • Real-time updates                                │            │
│   │ • Pull-to-refresh                                  │            │
│   │ • Auto-refresh (2 min)                             │            │
│   │ • Bottom navigation                                │            │
│   │ • Employee info card                               │            │
│   └────────────────────────────────────────────────────┘            │
│                              ▼                                       │
│   ┌────────────────────────────────────────────────────┐            │
│   │          scripts/emp-portal.js (Logic)             │            │
│   ├────────────────────────────────────────────────────┤            │
│   │ • Task loading & categorization                    │            │
│   │ • Supabase API calls                               │            │
│   │ • Session management                               │            │
│   │ • UI updates & interactions                        │            │
│   │ • Auto-refresh logic                               │            │
│   │ • Pull-to-refresh handler                          │            │
│   └────────────────────────────────────────────────────┘            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND LAYER                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌────────────────────────────────────────────────────┐            │
│   │            Supabase Backend (Cloud)                │            │
│   ├────────────────────────────────────────────────────┤            │
│   │                                                    │            │
│   │  ┌──────────────────┐    ┌──────────────────┐    │            │
│   │  │  Authentication  │    │    PostgreSQL    │    │            │
│   │  ├──────────────────┤    ├──────────────────┤    │            │
│   │  │ • JWT tokens     │    │ • users          │    │            │
│   │  │ • Sessions       │    │ • employees      │    │            │
│   │  │ • User mgmt      │    │ • hourly_tasks   │    │            │
│   │  │ • Email auth     │    │ • tasks          │    │            │
│   │  └──────────────────┘    │ • employee_      │    │            │
│   │                          │   profiles       │    │            │
│   │                          └──────────────────┘    │            │
│   │                                                    │            │
│   │  ┌──────────────────┐    ┌──────────────────┐    │            │
│   │  │   Row Level      │    │   Real-time      │    │            │
│   │  │   Security (RLS) │    │   Subscriptions  │    │            │
│   │  ├──────────────────┤    ├──────────────────┤    │            │
│   │  │ • User isolation │    │ • Live updates   │    │            │
│   │  │ • Policy rules   │    │ • Push events    │    │            │
│   │  │ • Access control │    │ • WebSockets     │    │            │
│   │  └──────────────────┘    └──────────────────┘    │            │
│   │                                                    │            │
│   └────────────────────────────────────────────────────┘            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

### Login Flow

```
Employee                 emp-login.html             Supabase
   │                           │                       │
   │  1. Enter credentials    │                       │
   │─────────────────────────►│                       │
   │                           │  2. Auth request      │
   │                           │──────────────────────►│
   │                           │                       │
   │                           │  3. Verify user       │
   │                           │  4. Check role        │
   │                           │  5. Get profile       │
   │                           │◄──────────────────────│
   │                           │  6. Return JWT        │
   │  7. Redirect to portal   │                       │
   │◄─────────────────────────│                       │
   │                           │                       │
```

### Task Loading Flow

```
Employee              emp-portal.html          emp-portal.js         Supabase
   │                       │                        │                   │
   │  1. Load page        │                        │                   │
   │─────────────────────►│                        │                   │
   │                       │  2. Initialize app     │                   │
   │                       │───────────────────────►│                   │
   │                       │                        │  3. Get session   │
   │                       │                        │──────────────────►│
   │                       │                        │◄──────────────────│
   │                       │                        │  4. Fetch tasks   │
   │                       │                        │──────────────────►│
   │                       │                        │◄──────────────────│
   │                       │  5. Update UI          │  6. Return data   │
   │                       │◄───────────────────────│                   │
   │  7. Display tasks    │                        │                   │
   │◄─────────────────────│                        │                   │
   │                       │                        │                   │
```

### Refresh Flow

```
Employee              emp-portal.html          emp-portal.js         Supabase
   │                       │                        │                   │
   │  1. Pull down        │                        │                   │
   │─────────────────────►│                        │                   │
   │                       │  2. Trigger refresh    │                   │
   │                       │───────────────────────►│                   │
   │                       │                        │  3. Fetch updates │
   │                       │                        │──────────────────►│
   │                       │                        │◄──────────────────│
   │                       │  4. Update UI          │  5. New task data │
   │                       │◄───────────────────────│                   │
   │  6. Show updated     │                        │                   │
   │     tasks            │                        │                   │
   │◄─────────────────────│                        │                   │
   │                       │                        │                   │
```

## Database Schema

```
┌─────────────────────────────────────────────────────────────────┐
│                       DATABASE SCHEMA                           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────┐           ┌─────────────────┐
│     users       │           │   employees     │
├─────────────────┤           ├─────────────────┤
│ id (PK)         │◄──────────│ user_id (FK)    │
│ auth_id         │           │ id (PK)         │
│ username        │           │ name            │
│ email           │           │ role            │
│ full_name       │           └─────────────────┘
│ role            │                    │
└─────────────────┘                    │
                                       │
                      ┌────────────────┴────────────────┐
                      ▼                                 ▼
           ┌─────────────────┐             ┌─────────────────┐
           │  hourly_tasks   │             │     tasks       │
           ├─────────────────┤             ├─────────────────┤
           │ id (PK)         │             │ id (PK)         │
           │ employee_id (FK)│             │ employee_id (FK)│
           │ task_date       │             │ start_date      │
           │ start_time      │             │ end_date        │
           │ end_time        │             │ start_time      │
           │ name            │             │ end_time        │
           │ work_area       │             │ name            │
           │ status          │             │ status          │
           └─────────────────┘             └─────────────────┘

┌─────────────────┐
│employee_profiles│
├─────────────────┤
│ employee_id (FK)│
│ employment_     │
│   status        │
└─────────────────┘
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      SECURITY LAYERS                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Transport Security                                    │
├─────────────────────────────────────────────────────────────────┤
│  • HTTPS enforced (SSL/TLS)                                     │
│  • Certificate validation                                       │
│  • Secure WebSockets (WSS)                                      │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: Authentication                                        │
├─────────────────────────────────────────────────────────────────┤
│  • JWT tokens (signed & encrypted)                              │
│  • Session management                                           │
│  • Automatic token refresh                                      │
│  • Employee role verification                                   │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: Authorization                                         │
├─────────────────────────────────────────────────────────────────┤
│  • Row Level Security (RLS) policies                            │
│  • User can only access own data                                │
│  • Admin access blocked                                         │
│  • Query filtering at database level                            │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 4: Application Security                                  │
├─────────────────────────────────────────────────────────────────┤
│  • XSS protection (input sanitization)                          │
│  • CSRF protection (same-origin policy)                         │
│  • SQL injection prevention (prepared statements)               │
│  • Content Security Policy headers                              │
└─────────────────────────────────────────────────────────────────┘
```

## File Structure

```
waterroc/
├── emp-login.html                  # Login page (entry point)
├── emp-portal.html                 # Main portal interface
├── emp-CNAME                       # Subdomain DNS config
├── index.html                      # Main site (with redirect)
│
├── scripts/
│   ├── emp-portal.js              # Portal functionality
│   ├── subdomain-redirect.js     # Subdomain routing
│   ├── config.js                 # Supabase configuration
│   └── supabase.js               # Supabase client
│
├── styles/
│   └── (inline in HTML for mobile performance)
│
└── docs/
    ├── EMP_SUBDOMAIN_SETUP.md      # Setup guide
    ├── EMPLOYEE_PORTAL_README.md   # Complete documentation
    ├── EMPLOYEE_QUICK_START.md     # User guide
    ├── DEPLOYMENT_CHECKLIST.md     # Deployment steps
    ├── EMPLOYEE_PORTAL_SUMMARY.md  # Project summary
    └── ARCHITECTURE.md             # This file
```

## Deployment Topology

### Option A: Separate Repository (Recommended)

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub (Cloud)                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Repository: waterroc-employee-portal                       │
│  Branch: main                                               │
│  GitHub Pages: Enabled                                      │
│                                                              │
│  ┌──────────────────────────────────────────────────┐      │
│  │ Files:                                           │      │
│  │ • index.html (emp-login.html)                    │      │
│  │ • emp-portal.html                                │      │
│  │ • scripts/emp-portal.js                          │      │
│  │ • scripts/config.js                              │      │
│  │ • CNAME (emp.waterroc.com)                       │      │
│  └──────────────────────────────────────────────────┘      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   DNS Provider                              │
├─────────────────────────────────────────────────────────────┤
│  emp.waterroc.com  →  CNAME  →  [user].github.io           │
└─────────────────────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              GitHub Pages CDN (Global)                      │
├─────────────────────────────────────────────────────────────┤
│  • SSL/TLS Certificate (auto-provisioned)                   │
│  • Global CDN distribution                                  │
│  • HTTPS redirect                                           │
│  • Gzip compression                                         │
└─────────────────────────────────────────────────────────────┘
```

### Option B: Same Repository

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub (Cloud)                          │
├─────────────────────────────────────────────────────────────┤
│  Repository: waterroc                                       │
│  Branch: main                                               │
│  GitHub Pages: Enabled                                      │
│                                                              │
│  ┌──────────────────────────────────────────────────┐      │
│  │ Files:                                           │      │
│  │ • index.html (with subdomain redirect)           │      │
│  │ • emp-login.html                                 │      │
│  │ • emp-portal.html                                │      │
│  │ • scripts/emp-portal.js                          │      │
│  │ • scripts/subdomain-redirect.js                  │      │
│  │ • CNAME (www.waterroc.com)                       │      │
│  └──────────────────────────────────────────────────┘      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   DNS Provider                              │
├─────────────────────────────────────────────────────────────┤
│  www.waterroc.com  →  CNAME  →  [user].github.io           │
│  emp.waterroc.com  →  CNAME  →  www.waterroc.com           │
└─────────────────────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              GitHub Pages CDN (Global)                      │
├─────────────────────────────────────────────────────────────┤
│  • Serves all content                                       │
│  • JavaScript redirect for subdomain                        │
│  • Single SSL certificate                                   │
└─────────────────────────────────────────────────────────────┘
```

## Component Interaction Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                    COMPONENT INTERACTIONS                        │
└──────────────────────────────────────────────────────────────────┘

┌─────────────┐
│  Browser    │
└──────┬──────┘
       │
       ▼
┌─────────────┐     Includes      ┌──────────────────┐
│ emp-login   │◄──────────────────│ scripts/config.js│
│   .html     │                    └──────────────────┘
└──────┬──────┘
       │ On successful login
       ▼
┌─────────────┐     Includes      ┌──────────────────────┐
│ emp-portal  │◄──────────────────│ scripts/emp-portal.js│
│   .html     │                    └───────────┬──────────┘
└─────────────┘                                │
                                               │ Uses
                                               ▼
                                    ┌──────────────────┐
                                    │ Supabase Client  │
                                    │ (@supabase/      │
                                    │  supabase-js)    │
                                    └────────┬─────────┘
                                             │
                                             │ API Calls
                                             ▼
                                    ┌──────────────────┐
                                    │ Supabase Backend │
                                    │ • Auth           │
                                    │ • Database       │
                                    │ • RLS            │
                                    └──────────────────┘
```

## State Management

```
┌──────────────────────────────────────────────────────────────┐
│                   APPLICATION STATE                          │
└──────────────────────────────────────────────────────────────┘

Session Storage (Temporary)
├── userRole: 'employee'
├── username: 'john.doe'
├── fullName: 'John Doe'
├── userId: 'uuid-here'
└── employmentStatus: 'active'

Local Storage (Persistent - Optional)
└── rememberMe: 'true'

Application State (In-Memory)
├── currentUser: { id, username, full_name, role }
├── currentEmployee: { id, name, username }
├── tasks: [ {...}, {...}, ... ]
├── refreshInterval: intervalId
└── supabaseClient: SupabaseClient instance
```

## Performance Optimization

```
┌──────────────────────────────────────────────────────────────┐
│                  PERFORMANCE STRATEGIES                      │
└──────────────────────────────────────────────────────────────┘

Frontend
├── Inline critical CSS (reduce HTTP requests)
├── Minimal JavaScript (vanilla JS, no frameworks)
├── Lazy loading (load data on demand)
├── Efficient DOM updates (batch changes)
└── Debounced scroll events

Network
├── CDN delivery (GitHub Pages global CDN)
├── Gzip compression (automatic)
├── HTTP/2 (modern protocol)
├── Caching headers (browser cache)
└── Efficient API queries (specific fields only)

Backend (Supabase)
├── Database indexes (employee_id, task_date)
├── Query optimization (filter at database level)
├── Connection pooling (managed by Supabase)
├── RLS policies (secure & efficient)
└── Realtime subscriptions (WebSocket, planned)
```

---

**Document Version**: 1.0  
**Last Updated**: December 29, 2025  
**Status**: Production Ready
