# 数据模型

> Level 2-3 文档 - 数据库模型详细说明

---

## 数据库信息

| 属性 | 值 |
|------|-----|
| **类型** | PostgreSQL |
| **端口** | 5432 |
| **数据库名** | bookmark_sync |
| **ORM** | Knex.js |
| **迁移目录** | [backend/migrations/](../../backend/migrations/) |

---

## 表关系图

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   users     │       │  bookmarks  │       │  passwords  │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ id (PK)     │◄──┐   │ id (PK)     │       │ id (PK)     │
│ email       │   │   │ user_id(FK) │───┐   │ user_id(FK) │───┐
│ password    │   │   │ encrypted_  │   │   │ encrypted_  │   │
│ name        │   │   │   data      │   │   │   data      │   │
│ created_at  │   │   │ position    │   │   │ created_at  │   │
│ updated_at  │   │   │ created_at  │   │   │ updated_at  │   │
└─────────────┘   │   │ updated_at  │   │   └─────────────┘   │
                  │   └─────────────┘   │                     │
                  │                     │                     │
                  └─────────────────────┴─────────────────────┘
                           一对多关系
```

---

## 用户表 (users)

### 表结构

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | SERIAL | PRIMARY KEY | 用户 ID |
| email | VARCHAR(255) | UNIQUE, NOT NULL | 邮箱 |
| password | VARCHAR(255) | NOT NULL | 密码哈希 (bcrypt) |
| name | VARCHAR(50) | NOT NULL | 用户名 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新时间 |

### 迁移文件

```javascript
// migrations/001_create_users_table.js
exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.increments('id').primary();
    table.string('email').unique().notNullable();
    table.string('password').notNullable();
    table.string('name').notNullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('users');
};
```

### 数据示例

```json
{
  "id": 1,
  "email": "user@example.com",
  "password": "$2a$12$...",  // bcrypt 哈希
  "name": "张三",
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

---

## 书签表 (bookmarks)

### 表结构

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | SERIAL | PRIMARY KEY | 书签 ID |
| user_id | INTEGER | FOREIGN KEY, NOT NULL | 用户 ID |
| encrypted_data | TEXT | NOT NULL | 加密数据 (AES) |
| position | INTEGER | DEFAULT 0 | 排序位置 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新时间 |

### 索引

- `user_id` 索引 (用于快速查询用户书签)

### 迁移文件

```javascript
// migrations/002_create_bookmarks_table.js
exports.up = function(knex) {
  return knex.schema.createTable('bookmarks', function(table) {
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
  return knex.schema.dropTable('bookmarks');
};
```

### 加密数据结构

```javascript
// encrypted_data 解密后的 JSON 结构
{
  "title": "Example Site",
  "url": "https://example.com",
  "folder": "技术文章",
  "tags": ["前端", "React"],
  "description": "一个示例网站"
}
```

### 数据示例

```json
{
  "id": 1,
  "user_id": 1,
  "encrypted_data": "U2FsdGVkX1...",  // AES 加密
  "position": 0,
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

---

## 密码表 (passwords)

### 表结构

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | SERIAL | PRIMARY KEY | 密码 ID |
| user_id | INTEGER | FOREIGN KEY, NOT NULL | 用户 ID |
| encrypted_data | TEXT | NOT NULL | 加密数据 (AES) |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新时间 |

### 索引

- `user_id` 索引 (用于快速查询用户密码)

### 迁移文件

```javascript
// migrations/003_create_passwords_table.js
exports.up = function(knex) {
  return knex.schema.createTable('passwords', function(table) {
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
  return knex.schema.dropTable('passwords');
};
```

### 加密数据结构

```javascript
// encrypted_data 解密后的 JSON 结构
{
  "site_name": "GitHub",
  "site_url": "https://github.com",
  "username": "developer",
  "password": "my_secret_password",
  "notes": "工作账号",
  "category": "开发工具"
}
```

### 数据示例

```json
{
  "id": 1,
  "user_id": 1,
  "encrypted_data": "U2FsdGVkX1...",  // AES 加密
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

---

## 数据加密

### 加密算法

- **算法**: AES-256
- **库**: crypto-js
- **密钥来源**: 环境变量 `ENCRYPTION_KEY`

### 加密实现

```javascript
const CryptoJS = require('crypto-js');

// 加密
const encryptData = (data) => {
  return CryptoJS.AES.encrypt(
    JSON.stringify(data),
    process.env.ENCRYPTION_KEY
  ).toString();
};

// 解密
const decryptData = (encryptedData) => {
  const bytes = CryptoJS.AES.decrypt(
    encryptedData,
    process.env.ENCRYPTION_KEY
  );
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
};
```

### 安全注意事项

1. **密钥管理**: `ENCRYPTION_KEY` 必须妥善保管
2. **密钥长度**: 建议使用 32 字节 (256 位) 密钥
3. **密钥轮换**: 定期更换密钥需要重新加密所有数据
4. **备份**: 加密数据无法在没有密钥的情况下恢复

---

## 数据库配置

### Knex 配置

```javascript
// src/config/database.js
const knex = require('knex');

const config = {
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'bookmark_sync',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
  },
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    tableName: 'knex_migrations',
    directory: '../migrations'
  }
};

module.exports = knex(config);
```

### 环境变量

```bash
# .env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bookmark_sync
DB_USER=postgres
DB_PASSWORD=your_password
ENCRYPTION_KEY=your_32_byte_encryption_key_here
```

---

## 数据库操作

### 迁移命令

```bash
# 运行迁移
cd backend
npm run migrate

# 回滚迁移
npx knex migrate:rollback

# 创建新迁移
npx knex migrate:make migration_name
```

### 常用查询

```javascript
// 查询用户所有书签
const bookmarks = await db('bookmarks')
  .where({ user_id: userId })
  .orderBy('position', 'asc')
  .orderBy('created_at', 'desc');

// 创建书签
const [bookmark] = await db('bookmarks')
  .insert({
    user_id: userId,
    encrypted_data: encryptedData,
    position: 0
  })
  .returning(['id', 'encrypted_data']);

// 更新书签
await db('bookmarks')
  .where({ id: bookmarkId, user_id: userId })
  .update({
    encrypted_data: newEncryptedData,
    updated_at: new Date()
  });

// 删除书签
await db('bookmarks')
  .where({ id: bookmarkId, user_id: userId })
  .delete();
```

---

## 数据完整性

### 外键约束

```javascript
// 用户删除时级联删除相关数据
table.integer('user_id').unsigned()
  .references('id').inTable('users')
  .onDelete('CASCADE');
```

### 唯一约束

```javascript
// 邮箱唯一
table.string('email').unique().notNullable();
```

---

## 性能优化

### 索引策略

- `user_id` 索引: 加速用户数据查询
- 复合索引: 可根据查询模式添加

### 查询优化

```javascript
// 使用索引查询
const bookmarks = await db('bookmarks')
  .where({ user_id: userId })  // 使用索引
  .select('id', 'encrypted_data', 'position');  // 只选择需要的字段

// 分页查询
const bookmarks = await db('bookmarks')
  .where({ user_id: userId })
  .limit(20)
  .offset(0);
```
