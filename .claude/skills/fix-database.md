# 修复数据库模块 Bug

> 专门用于诊断和修复数据库相关的 bug

---

## 使用场景

当遇到以下问题时使用此 skill：
- 数据库连接失败
- 查询返回错误结果
- 迁移执行失败
- 外键约束错误
- 数据加密/解密问题

---

## 相关文件

| 类型 | 文件路径 | 说明 |
|------|----------|------|
| 数据库配置 | [backend/src/config/database.js](../../../backend/src/config/database.js) | Knex 配置 |
| Knex 配置 | [backend/knexfile.js](../../../backend/knexfile.js) | 迁移配置 |
| 迁移目录 | [backend/migrations/](../../../backend/migrations/) | 数据库迁移 |
| 数据模型 | [docs/database/schema.md](../../../docs/database/schema.md) | 数据库文档 |

---

## 常见 Bug 与修复

### 1. 数据库连接失败

**症状：**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
Error: password authentication failed for user "postgres"
```

**修复步骤：**
1. 检查 PostgreSQL 是否运行
2. 检查 `.env` 配置是否正确
3. 检查数据库是否已创建

**环境变量检查：**
```bash
# backend/.env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bookmark_sync
DB_USER=postgres
DB_PASSWORD=123456
```

**验证连接：**
```bash
# 测试 PostgreSQL 连接
psql -h localhost -U postgres -d bookmark_sync

# 或使用 Docker
docker exec -it postgres psql -U postgres -d bookmark_sync
```

---

### 2. 迁移执行失败

**症状：**
```
Error: The migration directory is corrupt
Error: Migration "xxx" is already present
```

**修复步骤：**

```bash
# 查看迁移状态
cd backend
npx knex migrate:status

# 回滚最后一个迁移
npx knex migrate:rollback

# 强制设置迁移版本（谨慎使用）
npx knex migrate:latest --force

# 重新运行所有迁移
npx knex migrate:rollback:all
npx knex migrate:latest
```

---

### 3. 外键约束错误

**症状：**
```
Error: insert or update on table violates foreign key constraint
```

**可能原因：**
- user_id 不存在
- 删除用户时未处理级联

**修复代码：**
```javascript
// migrations/002_create_bookmarks_table.js
exports.up = function(knex) {
  return knex.schema.createTable('bookmarks', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned()
      .references('id').inTable('users')
      .onDelete('CASCADE');  // 确保级联删除
    table.text('encrypted_data').notNullable();
    table.timestamps(true, true);
  });
};
```

---

### 4. 唯一约束冲突

**症状：**
```
Error: duplicate key value violates unique constraint "users_email_unique"
错误: 数据已存在
```

**修复代码：**
```javascript
// 检查邮箱是否已存在
const existingUser = await db('users')
  .where({ email: email })
  .first();

if (existingUser) {
  return res.status(409).json({ error: '邮箱已被注册' });
}
```

---

### 5. 字段类型错误

**症状：**
- 查询结果类型不正确
- 数据插入失败

**修复代码：**
```javascript
// 确保 ID 比较时类型一致
const bookmark = await db('bookmarks')
  .where({
    id: parseInt(req.params.id),  // 转换为整数
    user_id: req.user.id
  })
  .first();
```

---

### 6. 加密数据解析失败

**症状：**
```
SyntaxError: Unexpected token...
Malformed UTF-8 data
```

**可能原因：**
- ENCRYPTION_KEY 配置不一致
- 数据格式错误

**修复代码：**
```javascript
const decryptData = (encryptedData) => {
  try {
    const bytes = CryptoJS.AES.decrypt(
      encryptedData,
      process.env.ENCRYPTION_KEY
    );
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);

    if (!decrypted) {
      throw new Error('解密失败');
    }

    return JSON.parse(decrypted);
  } catch (error) {
    console.error('数据解密错误:', error);
    return null;  // 或抛出错误
  }
};
```

---

### 7. 查询性能问题

**症状：**
- 大量数据时查询缓慢
- 页面加载缓慢

**优化方案：**

```javascript
// 添加索引
// migrations/xxx_add_indexes.js
exports.up = function(knex) {
  return knex.schema.table('bookmarks', function(table) {
    table.index('user_id');
    table.index('created_at');
  });
};

// 分页查询
const bookmarks = await db('bookmarks')
  .where({ user_id: userId })
  .limit(20)
  .offset((page - 1) * 20)
  .orderBy('created_at', 'desc');

// 只选择需要的字段
const bookmarks = await db('bookmarks')
  .where({ user_id: userId })
  .select('id', 'encrypted_data', 'position', 'created_at');
```

---

### 8. 时区问题

**症状：**
- 时间显示不正确
- 时间比较错误

**修复代码：**
```javascript
// 存储时使用 UTC
const now = new Date().toISOString();

// 查询时使用 UTC
const today = new Date();
today.setHours(0, 0, 0, 0);
const bookmarks = await db('bookmarks')
  .where('created_at', '>=', today.toISOString())
  .where({ user_id: userId });
```

---

## 数据库维护命令

```bash
# 备份数据库
pg_dump -U postgres bookmark_sync > backup.sql

# 恢复数据库
psql -U postgres bookmark_sync < backup.sql

# 查看数据库大小
psql -U postgres -d bookmark_sync -c "SELECT pg_size_pretty(pg_database_size('bookmark_sync'));"

# 查看表大小
psql -U postgres -d bookmark_sync -c "SELECT schemaname,tablename,pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size FROM pg_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"

# 清理过期数据
psql -U postgres -d bookmark_sync -c "VACUUM ANALYZE;"
```

---

## 常用查询

```sql
-- 检查用户表
SELECT id, email, name, created_at FROM users ORDER BY created_at DESC LIMIT 10;

-- 检查书签数量
SELECT user_id, COUNT(*) as count FROM bookmarks GROUP BY user_id;

-- 检查密码数量
SELECT user_id, COUNT(*) as count FROM passwords GROUP BY user_id;

-- 检查重复数据
SELECT email, COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1;

-- 检查外键约束
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM
    information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY';
```

---

## 数据库初始化

```bash
# 创建数据库
createdb -U postgres bookmark_sync

# 运行迁移
cd backend
npm run migrate

# 填充测试数据（可选）
npm run seed
```

---

## 环境变量完整配置

```bash
# backend/.env
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bookmark_sync
DB_USER=postgres
DB_PASSWORD=123456

# JWT 配置
JWT_SECRET=your-jwt-secret-key-here
JWT_EXPIRES_IN=7d

# 加密密钥（32字节）
ENCRYPTION_KEY=your-32-byte-encryption-key-here

# 服务器配置
PORT=3001
NODE_ENV=development

# CORS 配置
ALLOWED_ORIGINS=http://localhost:3002,http://localhost:19006,chrome-extension://*
```

---

## 数据完整性检查

```sql
-- 检查孤立记录（没有对应用户的书签）
SELECT b.id, b.user_id FROM bookmarks b
LEFT JOIN users u ON b.user_id = u.id
WHERE u.id IS NULL;

-- 检查孤立记录（没有对应用户的密码）
SELECT p.id, p.user_id FROM passwords p
LEFT JOIN users u ON p.user_id = u.id
WHERE u.id IS NULL;

-- 清理孤立记录
DELETE FROM bookmarks WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM passwords WHERE user_id NOT IN (SELECT id FROM users);
```
