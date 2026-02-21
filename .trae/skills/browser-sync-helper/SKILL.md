---
name: "browser-sync-helper"
description: "Expert assistant for browser-sync project. Invoke when working on bookmark/password sync app, debugging extension issues, or navigating project documentation."
---

# Browser Sync Project Helper

You are an expert assistant for the **browser-sync** project - a bookmark and password synchronization application with end-to-end encryption.

## Project Overview

| Component | Tech Stack | Port | Path |
|-----------|------------|------|------|
| Backend API | Node.js + Express + PostgreSQL | 3001 | `backend/` |
| Web Client | React 18 + Vite + Ant Design | 3002 | `web-client/` |
| Browser Extension | Manifest V3 (Chrome/Firefox) | - | `browser-extension/` |

## Documentation Structure

```
docs/
├── INDEX.md              # Navigation index
├── manifest.json         # Project metadata
├── system/overview.md    # System architecture
├── backend/              # Backend module docs
├── frontend/             # Frontend module docs
├── extension/            # Extension module docs
├── database/schema.md    # Database models
└── api/                  # API reference
```

## Quick Reference

### Common Tasks

| Task | Key Files | Documentation |
|------|-----------|---------------|
| Debug API issues | `backend/src/routes/*.js` | `docs/backend/routes.md` |
| Fix extension bugs | `browser-extension/background.js` | `docs/extension/background.md` |
| Modify UI | `web-client/src/pages/*.jsx` | `docs/frontend/pages.md` |
| Database changes | `backend/migrations/*.js` | `docs/database/schema.md` |

### API Endpoints

| Module | Prefix | Docs |
|--------|--------|------|
| Auth | `/api/auth` | `docs/api/auth.md` |
| Bookmarks | `/api/bookmarks` | `docs/api/bookmarks.md` |
| Passwords | `/api/passwords` | `docs/api/passwords.md` |
| Import/Export | `/api/import-export` | `docs/api/import-export.md` |

### Database Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| users | User accounts | id, email, password (bcrypt), name |
| bookmarks | Encrypted bookmarks | id, user_id, encrypted_data, position |
| passwords | Encrypted passwords | id, user_id, encrypted_data |

## Debugging Guide

### Extension Issues

1. Check `docs/extension/overview.md` for architecture
2. Review `docs/extension/background.md` for service worker logic
3. Check `docs/extension/websocket.md` for sync issues

### API Issues

1. Check `docs/backend/routes.md` for route handlers
2. Review `docs/backend/middleware.md` for auth/validation
3. Check `docs/api/` for endpoint specifications

### Data Issues

1. Check `docs/database/schema.md` for table structure
2. Review migrations in `backend/migrations/`
3. Check encryption logic in route files

## Commands

```bash
# Backend development
cd backend && npm run dev

# Frontend development
cd web-client && npm run dev

# Database migration
cd backend && npm run migrate

# Run tests
cd backend && npm test
```

## Security Notes

- All sensitive data encrypted with AES-256
- Passwords hashed with bcrypt (12 rounds)
- JWT authentication with configurable expiry
- Rate limiting enabled (100 req/min production)

## When to Use This Skill

Invoke this skill when:
- User asks about project structure or architecture
- Debugging issues in backend, frontend, or extension
- Need to understand API endpoints or data models
- Working on new features that require context
- User references project documentation

## Response Guidelines

1. **Start with documentation** - Reference relevant docs/ files first
2. **Provide file paths** - Include clickable links to source files
3. **Explain the flow** - Show how components interact
4. **Suggest specific files** - Point to exact files to modify
