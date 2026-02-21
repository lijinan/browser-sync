---
name: "browser-sync-developer"
description: "Development assistant for adding new features to browser-sync. Invoke when implementing new functionality, creating API endpoints, or extending the extension."
---

# Browser Sync Developer

You are a development assistant for the **browser-sync** project. Your role is to help implement new features following project conventions.

## Project Conventions

### Backend Conventions

```javascript
// Route file structure
const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Validation schema
const schema = Joi.object({
  field: Joi.string().required()
});

// Route handler
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const { error, value } = schema.validate(req.body);
    if (error) throw error;
    
    // Business logic
    
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
```

### Frontend Conventions

```jsx
// Page component structure
import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input } from 'antd';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const PageName = () => {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/endpoint');
      setData(response.data.items);
    } catch (error) {
      // Error handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Component content */}
    </div>
  );
};

export default PageName;
```

### Extension Conventions

```javascript
// Background script pattern
class FeatureHandler {
  constructor(extensionAPI) {
    this.extensionAPI = extensionAPI;
  }

  async handleAction(data) {
    try {
      const response = await this.apiCall('/endpoint', data);
      this.notifyUser('操作成功', 'success');
      return response;
    } catch (error) {
      this.notifyUser('操作失败: ' + error.message, 'error');
      throw error;
    }
  }

  async apiCall(endpoint, data) {
    const { token, serverUrl } = await this.getSettings();
    const response = await fetch(`${serverUrl}/api${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    return response.json();
  }
}
```

## Adding New Features

### 1. New API Endpoint

**Files to modify:**
1. Create route: `backend/src/routes/new-feature.js`
2. Register route: `backend/src/app.js`
3. Add migration: `backend/migrations/xxx_create_table.js`
4. Update docs: `docs/api/new-feature.md`

**Template:**
```javascript
// backend/src/routes/new-feature.js
const express = require('express');
const Joi = require('joi');
const CryptoJS = require('crypto-js');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const webSocketService = require('../services/websocket');

const router = express.Router();
router.use(authenticateToken);

// GET /api/new-feature
router.get('/', async (req, res, next) => {
  try {
    const items = await db('new_table')
      .where({ user_id: req.user.id });
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

// POST /api/new-feature
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = Joi.object({
      name: Joi.string().required()
    }).validate(req.body);
    
    if (error) throw error;
    
    const encrypted = CryptoJS.AES.encrypt(
      JSON.stringify(value),
      process.env.ENCRYPTION_KEY
    ).toString();
    
    const [item] = await db('new_table')
      .insert({
        user_id: req.user.id,
        encrypted_data: encrypted
      })
      .returning(['id']);
    
    webSocketService.broadcastToUser(req.user.id, 'new_feature_change', {
      action: 'create',
      item
    });
    
    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
```

### 2. New Frontend Page

**Files to create/modify:**
1. Create page: `web-client/src/pages/NewFeature.jsx`
2. Add route: `web-client/src/App.jsx`
3. Add menu: `web-client/src/components/Layout/AppLayout.jsx`

**Template:**
```jsx
// web-client/src/pages/NewFeature.jsx
import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, message } from 'antd';
import api from '../services/api';

const NewFeature = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      const response = await api.get('/new-feature');
      setItems(response.data.items);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (values) => {
    try {
      await api.post('/new-feature', values);
      message.success('创建成功');
      setModalVisible(false);
      form.resetFields();
      loadItems();
    } catch (error) {
      message.error('创建失败');
    }
  };

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '操作', key: 'action', render: (_, record) => (
      <Button type="link" onClick={() => handleEdit(record)}>编辑</Button>
    )}
  ];

  return (
    <div>
      <Button type="primary" onClick={() => setModalVisible(true)}>
        新建
      </Button>
      <Table 
        dataSource={items} 
        columns={columns} 
        loading={loading}
        rowKey="id"
      />
      <Modal
        title="新建"
        open={modalVisible}
        onOk={() => form.submit()}
        onCancel={() => setModalVisible(false)}
      >
        <Form form={form} onFinish={handleCreate}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default NewFeature;
```

### 3. New Extension Feature

**Files to modify:**
1. Background: `browser-extension/background.js`
2. Content: `browser-extension/content.js` (if needed)
3. Popup: `browser-extension/popup.js` (if UI needed)
4. Manifest: `browser-extension/manifest.json` (if new permissions)

**Template:**
```javascript
// In background.js
class ExtensionBackground extends ExtensionBackgroundBase {
  // Add new method
  async handleNewFeature(data) {
    const response = await this.apiCall('/new-feature', data);
    
    // Broadcast to content scripts
    this.extensionAPI.runtime.sendMessage({
      type: 'NEW_FEATURE_UPDATE',
      data: response
    });
    
    return response;
  }
}

// Register message handler
handleMessage(request, sender, sendResponse) {
  switch (request.type) {
    case 'NEW_FEATURE_ACTION':
      this.handleNewFeature(request.data)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
  }
}
```

## Database Migration Template

```javascript
// backend/migrations/xxx_create_new_table.js
exports.up = function(knex) {
  return knex.schema.createTable('new_table', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned()
      .references('id').inTable('users')
      .onDelete('CASCADE');
    table.text('encrypted_data').notNullable();
    table.timestamps(true, true);
    table.index('user_id');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('new_table');
};
```

## Testing Checklist

### Backend
- [ ] Route registered in app.js
- [ ] Validation schema defined
- [ ] Authentication required
- [ ] Error handling with next(error)
- [ ] WebSocket notification (if needed)
- [ ] Migration created
- [ ] Documentation updated

### Frontend
- [ ] Route added to App.jsx
- [ ] Menu item added
- [ ] Loading states handled
- [ ] Error messages shown
- [ ] Form validation
- [ ] Responsive design

### Extension
- [ ] Message handler registered
- [ ] Permissions added (if needed)
- [ ] Error handling
- [ ] User notification
- [ ] Tested in Chrome and Firefox

## When to Use This Skill

Invoke this skill when:
- Adding new API endpoints
- Creating new frontend pages
- Extending extension functionality
- Adding database tables
- Implementing new features
- Following project conventions

## Response Format

When helping with development:

1. **Identify files** to create/modify
2. **Provide complete code** following conventions
3. **List dependencies** needed
4. **Include migration** if database change
5. **Update documentation** references
