# 内容脚本

> Level 3 文档 - 内容脚本详细说明

---

## 模块信息

| 属性 | 值 |
|------|-----|
| **文件** | [browser-extension/content.js](../../browser-extension/content.js) |
| **注入时机** | `document_end` |
| **匹配规则** | `<all_urls>` |

---

## 功能说明

内容脚本注入到所有网页中，负责：
- 检测登录表单
- 提供自动填充功能
- 与后台脚本通信

---

## 表单检测

### 登录表单识别

```javascript
// 检测登录表单
function detectLoginForm(form) {
  const inputs = form.querySelectorAll('input');
  let hasPassword = false;
  let hasUsername = false;

  inputs.forEach(input => {
    if (input.type === 'password') {
      hasPassword = true;
    }
    if (input.type === 'text' || input.type === 'email') {
      const name = (input.name || input.id || '').toLowerCase();
      if (name.includes('user') || name.includes('email') || 
          name.includes('login') || name.includes('account')) {
        hasUsername = true;
      }
    }
  });

  return hasPassword && hasUsername;
}

// 扫描页面表单
function scanForms() {
  const forms = document.querySelectorAll('form');
  const loginForms = [];

  forms.forEach((form, index) => {
    if (detectLoginForm(form)) {
      loginForms.push({
        index,
        form,
        inputs: getFormInputs(form)
      });
    }
  });

  return loginForms;
}
```

### 获取表单输入字段

```javascript
function getFormInputs(form) {
  const inputs = {
    username: null,
    password: null,
    submit: null
  };

  form.querySelectorAll('input').forEach(input => {
    if (input.type === 'password') {
      inputs.password = input;
    } else if (['text', 'email'].includes(input.type)) {
      const name = (input.name || input.id || '').toLowerCase();
      if (name.includes('user') || name.includes('email') || 
          name.includes('login') || name.includes('account')) {
        inputs.username = input;
      }
    } else if (input.type === 'submit') {
      inputs.submit = input;
    }
  });

  return inputs;
}
```

---

## 自动填充功能

### 注入自动填充按钮

```javascript
function injectAutoFillButton(form, inputs) {
  // 创建按钮容器
  const container = document.createElement('div');
  container.className = 'bookmark-sync-autofill';
  container.style.cssText = `
    position: absolute;
    top: 5px;
    right: 5px;
    z-index: 9999;
  `;

  // 创建填充按钮
  const fillBtn = document.createElement('button');
  fillBtn.textContent = '🔑';
  fillBtn.title = '自动填充密码';
  fillBtn.style.cssText = `
    background: #1890ff;
    border: none;
    border-radius: 4px;
    padding: 5px 10px;
    cursor: pointer;
    font-size: 14px;
  `;

  fillBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await handleAutoFill(inputs);
  });

  container.appendChild(fillBtn);

  // 定位到密码输入框旁边
  if (inputs.password) {
    const parent = inputs.password.parentElement;
    parent.style.position = 'relative';
    parent.appendChild(container);
  }
}
```

### 处理自动填充

```javascript
async function handleAutoFill(inputs) {
  // 向后台请求密码
  const response = await chrome.runtime.sendMessage({
    type: 'GET_PASSWORDS',
    url: window.location.href
  });

  if (response.passwords && response.passwords.length > 0) {
    if (response.passwords.length === 1) {
      // 只有一个匹配，直接填充
      fillCredentials(inputs, response.passwords[0]);
    } else {
      // 多个匹配，显示选择列表
      showPasswordSelector(inputs, response.passwords);
    }
  } else {
    showNotification('未找到匹配的密码', 'warning');
  }
}
```

### 填充凭据

```javascript
function fillCredentials(inputs, credential) {
  // 填充用户名
  if (inputs.username && credential.username) {
    inputs.username.value = credential.username;
    // 触发输入事件
    inputs.username.dispatchEvent(new Event('input', { bubbles: true }));
    inputs.username.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 填充密码
  if (inputs.password && credential.password) {
    inputs.password.value = credential.password;
    inputs.password.dispatchEvent(new Event('input', { bubbles: true }));
    inputs.password.dispatchEvent(new Event('change', { bubbles: true }));
  }

  showNotification('自动填充成功', 'success');
}
```

---

## 密码选择器

```javascript
function showPasswordSelector(inputs, passwords) {
  // 创建选择器弹窗
  const modal = document.createElement('div');
  modal.className = 'bookmark-sync-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h3>选择要填充的账号</h3>
      <ul class="password-list">
        ${passwords.map((p, i) => `
          <li data-index="${i}">
            <strong>${p.site_name}</strong>
            <span>${p.username}</span>
          </li>
        `).join('')}
      </ul>
      <button class="close-btn">取消</button>
    </div>
  `;

  // 添加样式
  const style = document.createElement('style');
  style.textContent = `
    .bookmark-sync-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
    }
    .modal-content {
      background: white;
      padding: 20px;
      border-radius: 8px;
      min-width: 300px;
    }
    .password-list li {
      padding: 10px;
      cursor: pointer;
      border-bottom: 1px solid #eee;
    }
    .password-list li:hover {
      background: #f5f5f5;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(modal);

  // 绑定事件
  modal.querySelectorAll('.password-list li').forEach((li, i) => {
    li.addEventListener('click', () => {
      fillCredentials(inputs, passwords[i]);
      modal.remove();
    });
  });

  modal.querySelector('.close-btn').addEventListener('click', () => {
    modal.remove();
  });
}
```

---

## 页面信息提取

```javascript
// 获取当前页面信息
function getPageInfo() {
  return {
    title: document.title,
    url: window.location.href,
    description: getMetaDescription(),
    favicon: getFavicon()
  };
}

// 获取 meta 描述
function getMetaDescription() {
  const meta = document.querySelector('meta[name="description"]');
  return meta ? meta.content : '';
}

// 获取网站图标
function getFavicon() {
  const link = document.querySelector('link[rel*="icon"]');
  return link ? link.href : '/favicon.ico';
}
```

---

## 与后台通信

### 发送消息

```javascript
// 保存书签
async function saveBookmark() {
  const pageInfo = getPageInfo();
  
  const response = await chrome.runtime.sendMessage({
    type: 'SAVE_BOOKMARK',
    data: {
      title: pageInfo.title,
      url: pageInfo.url,
      description: pageInfo.description
    }
  });

  if (response.success) {
    showNotification('书签保存成功', 'success');
  } else {
    showNotification('保存失败: ' + response.error, 'error');
  }
}
```

### 接收消息

```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'FILL_PASSWORD':
      fillCredentials(request.inputs, request.credential);
      sendResponse({ success: true });
      break;

    case 'GET_PAGE_INFO':
      sendResponse(getPageInfo());
      break;

    case 'SCAN_FORMS':
      const forms = scanForms();
      sendResponse({ forms: forms.length });
      break;
  }
});
```

---

## 通知显示

```javascript
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `bookmark-sync-notification ${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 4px;
    color: white;
    font-size: 14px;
    z-index: 99999;
    animation: slideIn 0.3s ease;
  `;

  // 根据类型设置背景色
  const colors = {
    success: '#52c41a',
    error: '#f5222d',
    warning: '#faad14',
    info: '#1890ff'
  };
  notification.style.backgroundColor = colors[type] || colors.info;

  document.body.appendChild(notification);

  // 3秒后自动消失
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
```

---

## 初始化

```javascript
// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  // 扫描登录表单
  const loginForms = scanForms();
  
  // 为每个登录表单注入自动填充按钮
  loginForms.forEach(({ form, inputs }) => {
    injectAutoFillButton(form, inputs);
  });

  // 通知后台脚本
  chrome.runtime.sendMessage({
    type: 'CONTENT_LOADED',
    url: window.location.href,
    hasLoginForm: loginForms.length > 0
  });
});
```

---

## 安全考虑

### 密码显示保护

```javascript
// 不要在 DOM 中存储明文密码
// 使用后立即清除
function secureFill(input, value) {
  input.value = value;
  // 触发事件后清除引用
  value = null;
}
```

### XSS 防护

```javascript
// 对用户输入进行转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 使用转义后的内容
element.innerHTML = escapeHtml(userContent);
```

### HTTPS 限制

```javascript
// 仅在 HTTPS 页面提供完整功能
if (window.location.protocol !== 'https:' && 
    window.location.hostname !== 'localhost') {
  console.warn('非安全连接，部分功能受限');
  return;
}
```
