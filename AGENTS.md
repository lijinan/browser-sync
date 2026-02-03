# AGENTS.md

This document provides guidance for agentic coding agents operating in this repository.

## Project Overview

Bookmark & Password Synchronization Application with end-to-end encryption. Supports private deployment with React web client, Node.js/Express backend, and browser extension.

## Build/Lint/Test Commands

### Backend (backend/)
```bash
cd backend
npm install                 # Install dependencies
npm run dev                 # Development with nodemon (auto-restart)
npm start                   # Production mode
npm test                    # Run all tests
npm test -- <test-file>     # Run single test file
npm test -- -t "<pattern>" # Run tests matching pattern
npm run migrate             # Run database migrations
npm run seed                # Seed database
```

### Frontend (web-client/)
```bash
cd web-client
npm install                 # Install dependencies
npm run dev                 # Development server (Vite)
npm run build               # Production build
npm run preview             # Preview production build
npm run lint                # Run ESLint on src
```

### All Services (root)
```bash
./start-all.sh              # Start both backend and frontend (dev mode)
./start-all.sh --dev        # Backend with nodemon
./stop-all.sh               # Stop all services
```

## Code Style Guidelines

### Imports (Backend - CommonJS)
```javascript
// Standard library
const fs = require('fs');
const path = require('path');

// External packages
const express = require('express');
const jwt = require('jsonwebtoken');

// Internal modules
const authRoutes = require('./routes/auth');
const { errorHandler } = require('./middleware/errorHandler');
```

### Imports (Frontend - ES Modules)
```javascript
import React from 'react';
import { useState, useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import axios from 'axios';
```

### Naming Conventions

| Pattern | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `websocket-service.js`, `auth-context.jsx` |
| Variables/Constants | camelCase | `userId`, `isAuthenticated` |
| Constants (env) | UPPER_SNAKE_CASE | `JWT_SECRET`, `DB_PORT` |
| Classes | PascalCase | `AuthController`, `WebSocketService` |
| Private methods | prefix with `_` | `_validateToken()`, `_encryptData()` |
| Database tables | snake_case | `user_bookmarks`, `password_entries` |

### Formatting

- **Indentation**: 2 spaces for JavaScript/JSX
- **Line length**: 100 characters max
- **Semicolons**: Required
- **Quotes**: Single quotes for strings
- **Trailing commas**: Allowed in multi-line objects/arrays

```javascript
const user = {
  id: 1,
  email: 'user@example.com',
  createdAt: new Date(),
};

async function getBookmarks(userId) {
  const bookmarks = await db.select().from('bookmarks').where({ userId });
  return bookmarks;
}
```

### Error Handling

**Backend - Use errorHandler middleware**:
```javascript
// In routes, wrap async handlers
router.get('/bookmarks', authenticate, async (req, res, next) => {
  try {
    const bookmarks = await bookmarkService.getByUser(req.user.id);
    res.json({ data: bookmarks });
  } catch (error) {
    next(error);
  }
});

// Always use errorHandler middleware in app.js
app.use(errorHandler);
```

**Response format**:
```javascript
// Success
res.json({ data: result, message: 'Operation successful' });

// Error
res.status(400).json({ error: 'Descriptive error message' });
res.status(401).json({ error: 'Unauthorized' });
res.status(404).json({ error: 'Resource not found' });
```

**Never log or expose sensitive data** (passwords, tokens, encryption keys, user credentials).

### Security Practices

- **Client-side encryption**: All bookmarks/passwords encrypted with AES-256 before storage
- **Server-side**: Never have access to unencrypted data
- **JWT tokens**: Store in HTTP-only cookies or localStorage
- **Password hashing**: Use bcrypt for user passwords
- **Input validation**: Use Joi schemas for all user input
- **Rate limiting**: Already configured via express-rate-limit
- **CORS**: Configure allowed origins per environment

### Database (Knex/PostgreSQL)

- Use knex query builder for all database operations
- Foreign key relationships with `ON DELETE CASCADE`
- Encrypted data stored as `JSONB` or encrypted strings
- All tables have `updated_at` timestamp

```javascript
await knex('bookmarks')
  .where({ userId })
  .andWhere('folderId', folderId)
  .orderBy('created_at', 'desc');
```

### React/Frontend Patterns

- Use functional components with hooks
- Context for global state (AuthContext, ThemeContext)
- Ant Design components for UI
- Axios with interceptors for JWT injection
- Vite for development and build

```javascript
const { user, logout } = useAuth();

useEffect(() => {
  const fetchData = async () => {
    try {
      const response = await axios.get('/api/bookmarks');
      setData(response.data);
    } catch (error) {
      message.error('Failed to load bookmarks');
    }
  };
  fetchData();
}, []);
```

### File Structure

```
backend/
  src/
    app.js           # Express entry point
    routes/          # API route definitions
    middleware/      # Auth, validation, error handling
    services/        # Business logic
    models/          # Database models
    utils/           # Helper functions

web-client/
  src/
    App.jsx          # Root component with routes
    contexts/        # React contexts
    pages/           # Page components
    components/      # Reusable components
    utils/           # Client-side utilities
```

### Testing

- Backend: Jest with supertest for API tests
- Place tests in `__tests__/` folders alongside source files
- Use descriptive test names: `should return bookmarks for authenticated user`

```javascript
describe('GET /api/bookmarks', () => {
  it('should return bookmarks for authenticated user', async () => {
    const response = await request(app)
      .get('/api/bookmarks')
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(200);
    expect(response.body.data).toBeInstanceOf(Array);
  });
});
```

### Environment Configuration

- Backend: `backend/.env` file with `DB_*`, `JWT_*`, `ENCRYPTION_KEY`, `PORT`
- Never commit `.env` files or secrets
- Required variables: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`
