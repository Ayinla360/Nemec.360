NEMEC - Minimal Backend (local demo)

This repository includes a minimal Express backend to collect users and posts for the NEMEC front-end demo.

Quick start
1. Install Node.js (16+ recommended).
2. From the project root:

```powershell
cd 'C:\Users\USER\Documents\NEMEC - Copy (4)'
npm install
npm start
```

The server will run on port 3000 by default. API endpoints:
- GET /api/users - list users
- POST /api/users - create a user (JSON). Accepts base64 data URLs for profilePic and productPic (will be saved to /uploads)
- DELETE /api/users/:id - delete (by id or email)
- GET /api/posts - list posts
- POST /api/posts - create post (supports image/video/audio data URLs)
- DELETE /api/posts/:id
- GET /api/stats - quick counts

CORS is enabled so your front-end (served from another origin) can call the API during development.

Notes and next steps
- This is a simple file-based datastore (data.json). It's suited for demos and local testing. For production use a proper database (Postgres, MongoDB, Firebase, etc.).
- You will need to modify the front-end to call the API instead of only using localStorage/IndexedDB. I can help wire the `register.js` and `create.js` to POST to the server (including sending data URLs for images/videos) and to pull shared content.

Changes in this version
- Switched to SQLite for persistence (`nemec.db`).
- Admin token protection: the server will generate an `ADMIN_TOKEN` at startup (printed to console) unless you supply `ADMIN_TOKEN` in the environment.
- New admin endpoints: `/api/admin/export`, `/api/admin/import`, `/api/admin/backup` (protected).
- Dockerfile included for containerized deployment.

Environment
- To set a custom admin token, add `ADMIN_TOKEN=yourtoken` to an `.env` file or to the environment before starting the server.

Run locally
1. Install dependencies and start the server:

```powershell
npm install
npm start
```

2. On first run the server will print a generated `ADMIN_TOKEN` in the console. Save this securely — it's required to call admin endpoints.

Deploy
- A `Dockerfile` is included. Build and run with:

```powershell
docker build -t nemec-backend .
docker run -p 3000:3000 -e ADMIN_TOKEN="<paste-your-token>" nemec-backend
```

Security note
- This demo includes a simple admin token only. For production use add proper authentication and HTTPS.

Security
- This demo does not include authentication. If you need private admin access or user authentication, add JWT or session-based auth and HTTPS.
