# 修复密码管理模块 Bug

> 专门用于诊断和修复密码管理相关的 bug

---

## 使用场景

当遇到以下问题时使用此 skill：
- 密码无法创建、更新、删除
- 密码列表加载失败
- 密码详情查看失败
- 二次密码验证问题
- 密码加密/解密错误

---

## 相关文件

| 类型 | 文件路径 | 说明 |
|------|----------|------|
| 后端路由 | [backend/src/routes/passwords.js](../../../backend/src/routes/passwords.js) | 密码 API 路由 |
| 前端页面 | [web-client/src/pages/Passwords.jsx](../../../web-client/src/pages/Passwords.jsx) | 密码管理页面 |
| 数据库迁移 | [backend/migrations/003_create_passwords_table.js](../../../backend/migrations/003_create_passwords_table.js) | 密码表结构 |

---

## 常见 Bug 与修复

### 1. 密码详情查看失败 (二次验证)

**症状：**
```
错误: 密码验证失败
状态码: 401
```

**工作流程：**
```
1. 用户点击"查看密码"
2. 弹出密码验证框
3. 调用 POST /api/auth/verify-password
4. 验证成功后调用 GET /api/passwords/:id
5. 显示完整密码信息
```

**修复步骤：**
1. 检查二次验证接口是否正常工作
2. 确认验证成功后正确调用详情接口
3. 确保此接口的 401 错误不触发登录跳转

**相关代码：**
```javascript
// 前端: web-client/src/pages/Passwords.jsx
const viewPassword = async (id) => {
  // 1. 弹出验证框
  const password = await promptPasswordVerification();

  // 2. 验证用户密码
  await api.post('/auth/verify-password', { password });

  // 3. 获取完整密码
  const response = await api.get(`/passwords/${id}`);
  showPasswordModal(response.data.password);
};
```

**API 响应拦截器特殊处理：**
```javascript
// web-client/src/services/api.js
const isVerifyPasswordEndpoint = error.config?.url?.includes('/auth/verify-password');

if (error.response?.status === 401 && !isVerifyPasswordEndpoint) {
  // 其他 401 错误才跳转登录
  localStorage.removeItem('token');
  window.location.href = '/login';
}
```

---

### 2. 密码列表不显示实际密码

**这是正常的安全特性，不是 bug**

**设计说明：**
- 列表接口 `GET /api/passwords` 返回的密码字段为 `******`
- 详情接口 `GET /api/passwords/:id` 返回真实密码
- 前端需单独调用详情接口才能查看密码

**前端实现：**
```javascript
// 列表隐藏密码
const passwords = response.data.passwords.map(p => ({
  ...p,
  password: '******'  // 或使用 maskedPassword 字段
}));
```

---

### 3. 密码加密/解密失败

**症状：**
```
错误: Malformed UTF-8 data
错误: 数据解密失败
```

**修复步骤：**
1. 检查 `ENCRYPTION_KEY` 配置（与书签模块相同）
2. 检查加密数据格式

**相关代码：**
```javascript
// backend/src/routes/passwords.js
const encryptedData = encryptData({
  site_name: siteName,
  site_url: siteUrl,
  username: username,
  password: password,
  notes: notes || '',
  category: category || ''
});
```

---

### 4. 密码验证失败 (创建/更新时)

**症状：**
```
错误: 参数验证失败
```

**验证规则：**
```javascript
const passwordSchema = Joi.object({
  site_name: Joi.string().required(),
  site_url: Joi.string().uri().required(),
  username: Joi.string().required(),
  password: Joi.string().required(),
  notes: Joi.string().allow('').optional(),
  category: Joi.string().allow('').optional()
});
```

**修复步骤：**
1. 确保 `site_url` 是有效的 URI 格式
2. 确保 `site_name`、`username`、`password` 不为空
3. `notes` 和 `category` 可以为空字符串

---

### 5. URL 匹配自动填充失败

**症状：**
- 浏览器扩展无法根据当前 URL 自动填充密码

**修复逻辑：**
```javascript
// 浏览器扩展: background.js
async getPasswordsForUrl(url) {
  const token = await this.getToken();
  const response = await fetch(`${serverUrl}/api/passwords`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const data = await response.json();

  // 匹配当前 URL 的 hostname
  const currentHostname = new URL(url).hostname;
  return data.passwords.filter(p => {
    const siteHostname = new URL(p.site_url).hostname;
    return currentHostname.includes(siteHostname) ||
           siteHostname.includes(currentHostname);
  });
}
```

---

### 6. 复制密码功能异常

**症状：**
- 点击复制按钮后剪贴板没有内容

**修复代码：**
```javascript
// web-client/src/pages/Passwords.jsx
const copyPassword = async (password) => {
  try {
    await navigator.clipboard.writeText(password);
    message.success('密码已复制到剪贴板');
  } catch (error) {
    // 降级方案
    const textArea = document.createElement('textarea');
    textArea.value = password;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    message.success('密码已复制');
  }
};
```

---

### 7. WebSocket 密码变更通知

**症状：**
- 密码变更后其他设备未收到通知

**修复步骤：**
```javascript
// backend/src/routes/passwords.js
const webSocketService = require('../services/websocket');

// 创建/更新/删除密码后
webSocketService.broadcastToUser(req.user.id, 'password_change', {
  action: 'create' | 'update' | 'delete',
  password: passwordData
});
```

---

## 数据库检查

```sql
-- 检查密码表结构
\d passwords

-- 检查密码数据
SELECT id, user_id, substring(encrypted_data, 1, 50) as data_preview,
       created_at FROM passwords LIMIT 5;

-- 统计用户密码数量
SELECT user_id, COUNT(*) as count FROM passwords GROUP BY user_id;
```

---

## 安全检查清单

- [ ] 列表接口不返回实际密码
- [ ] 详情接口需要二次验证
- [ ] 所有密码数据 AES-256 加密存储
- [ ] 密码验证失败不记录日志
- [ ] 复制密码后自动清空剪贴板（可选）

---

## API 端点测试

```bash
# 获取密码列表（不含实际密码）
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/passwords

# 二次验证
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"password":"user_password"}' \
  http://localhost:3001/api/auth/verify-password

# 获取密码详情（含实际密码）
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/passwords/1

# 创建密码
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"site_name":"GitHub","site_url":"https://github.com","username":"user","password":"pass123"}' \
  http://localhost:3001/api/passwords
```
