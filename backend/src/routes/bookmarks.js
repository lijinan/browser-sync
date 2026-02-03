const express = require('express');
const Joi = require('joi');
const CryptoJS = require('crypto-js');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const webSocketService = require('../services/websocket');

const router = express.Router();

// 所有路由都需要认证
router.use(authenticateToken);

// 书签验证schema
const bookmarkSchema = Joi.object({
  title: Joi.string().required(),
  // 放宽URL验证，允许各种浏览器支持的URL格式（javascript:, data:, about:等）
  url: Joi.string().min(1).required(),
  folder: Joi.string().allow('').optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  description: Joi.string().allow('').optional()
});

// 加密数据
const encryptData = (data) => {
  return CryptoJS.AES.encrypt(JSON.stringify(data), process.env.ENCRYPTION_KEY).toString();
};

// 解密数据
const decryptData = (encryptedData) => {
  if (!encryptedData) {
    throw new Error('加密数据为空');
  }
  const bytes = CryptoJS.AES.decrypt(encryptedData, process.env.ENCRYPTION_KEY);
  const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
  if (!decryptedString) {
    throw new Error('解密失败：数据可能已损坏');
  }
  return JSON.parse(decryptedString);
};

// 获取所有书签
router.get('/', async (req, res, next) => {
  try {
    console.log('[DEBUG] req.user.id:', req.user.id);
    console.log('[DEBUG] Query params:', { user_id: req.user.id });

    const bookmarks = await db('bookmarks')
      .where({ user_id: req.user.id })
      .orderBy('created_at', 'desc');

    console.log('[DEBUG] Found bookmarks count:', bookmarks.length);

    // 解密书签数据，跳过解密失败的书签
    const decryptedBookmarks = [];
    const skippedBookmarks = [];

    for (const bookmark of bookmarks) {
      try {
        decryptedBookmarks.push({
          id: bookmark.id,
          ...decryptData(bookmark.encrypted_data),
          created_at: bookmark.created_at,
          updated_at: bookmark.updated_at
        });
      } catch (decryptError) {
        console.error(`书签 ID ${bookmark.id} 解密失败:`, decryptError.message);
        skippedBookmarks.push(bookmark.id);
      }
    }

    if (skippedBookmarks.length > 0) {
      console.warn(`跳过 ${skippedBookmarks.length} 个无法解密的书签，ID: ${skippedBookmarks.join(', ')}`);
    }

    res.json({ bookmarks: decryptedBookmarks });
  } catch (error) {
    next(error);
  }
});

// 创建书签
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = bookmarkSchema.validate(req.body);
    if (error) throw error;

    // 加密书签数据
    const encryptedData = encryptData(value);

    const [bookmark] = await db('bookmarks').insert({
      user_id: req.user.id,
      encrypted_data: encryptedData,
      created_at: new Date(),
      updated_at: new Date()
    }).returning('*');

    const bookmarkData = {
      id: bookmark.id,
      ...value,
      created_at: bookmark.created_at,
      updated_at: bookmark.updated_at
    };

    // 发送WebSocket通知
    webSocketService.notifyBookmarkChange(req.user.id, 'created', bookmarkData);

    res.status(201).json({
      message: '书签创建成功',
      bookmark: bookmarkData
    });
  } catch (error) {
    next(error);
  }
});

// 更新书签
router.put('/:id', async (req, res, next) => {
  try {
    const { error, value } = bookmarkSchema.validate(req.body);
    if (error) throw error;

    const bookmarkId = req.params.id;

    // 检查书签是否存在且属于当前用户
    const existingBookmark = await db('bookmarks')
      .where({ id: bookmarkId, user_id: req.user.id })
      .first();

    if (!existingBookmark) {
      return res.status(404).json({ error: '书签不存在' });
    }

    // 加密更新的数据
    const encryptedData = encryptData(value);

    await db('bookmarks')
      .where({ id: bookmarkId })
      .update({
        encrypted_data: encryptedData,
        updated_at: new Date()
      });

    const bookmarkData = {
      id: bookmarkId,
      ...value,
      updated_at: new Date()
    };

    // 发送WebSocket通知
    webSocketService.notifyBookmarkChange(req.user.id, 'updated', bookmarkData);

    res.json({
      message: '书签更新成功',
      bookmark: bookmarkData
    });
  } catch (error) {
    next(error);
  }
});

// 搜索书签
router.get('/search', async (req, res, next) => {
  try {
    const { q, url } = req.query;

    if (!q && !url) {
      return res.status(400).json({ error: '搜索关键词或URL不能为空' });
    }

    const bookmarks = await db('bookmarks')
      .where({ user_id: req.user.id });

    // 解密并搜索，跳过解密失败的书签
    let searchResults = [];

    for (const bookmark of bookmarks) {
      try {
        searchResults.push({
          id: bookmark.id,
          ...decryptData(bookmark.encrypted_data),
          created_at: bookmark.created_at,
          updated_at: bookmark.updated_at
        });
      } catch (decryptError) {
        console.error(`书签 ID ${bookmark.id} 解密失败 (搜索):`, decryptError.message);
      }
    }

    if (url) {
      // 按URL精确搜索
      searchResults = searchResults.filter(bookmark => bookmark.url === url);
    } else if (q) {
      // 按关键词模糊搜索
      searchResults = searchResults.filter(bookmark =>
        bookmark.title.toLowerCase().includes(q.toLowerCase()) ||
        bookmark.url.toLowerCase().includes(q.toLowerCase()) ||
        (bookmark.description && bookmark.description.toLowerCase().includes(q.toLowerCase()))
      );
    }

    res.json({ bookmarks: searchResults });
  } catch (error) {
    next(error);
  }
});

// 清空用户所有书签 - 必须在 /:id 路由之前
router.delete('/clear', async (req, res, next) => {
  try {
    const deletedCount = await db('bookmarks')
      .where({ user_id: req.user.id })
      .del();

    console.log(`用户 ${req.user.id} 清空了 ${deletedCount} 个书签`);
    
    res.json({ 
      success: true, 
      message: `已清空 ${deletedCount} 个书签`,
      deletedCount 
    });
  } catch (error) {
    console.error('清空书签失败:', error);
    next(error);
  }
});

// 删除书签
router.delete('/:id', async (req, res, next) => {
  try {
    const bookmarkId = req.params.id;

    // 先获取要删除的书签数据
    const existingBookmark = await db('bookmarks')
      .where({ id: bookmarkId, user_id: req.user.id })
      .first();

    if (!existingBookmark) {
      return res.status(404).json({ error: '书签不存在' });
    }

    let bookmarkData;
    try {
      // 解密书签数据用于通知
      bookmarkData = {
        id: existingBookmark.id,
        ...decryptData(existingBookmark.encrypted_data),
        created_at: existingBookmark.created_at,
        updated_at: existingBookmark.updated_at
      };
    } catch (decryptError) {
      console.error(`书签 ID ${bookmarkId} 解密失败 (删除):`, decryptError.message);
      // 即使解密失败也允许删除，使用基本信息
      bookmarkData = {
        id: existingBookmark.id,
        title: '(无法解密)',
        url: ''
      };
    }

    // 删除书签
    await db('bookmarks')
      .where({ id: bookmarkId, user_id: req.user.id })
      .del();

    // 发送WebSocket通知
    webSocketService.notifyBookmarkChange(req.user.id, 'deleted', bookmarkData);

    res.json({ message: '书签删除成功' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;