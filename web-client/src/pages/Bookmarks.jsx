import { useState, useEffect } from 'react'
import { 
  Card, 
  Table, 
  Button, 
  Modal, 
  Form, 
  Input, 
  Select, 
  Tag, 
  Space, 
  message,
  Popconfirm,
  Typography
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  LinkOutlined,
  SearchOutlined,
  DownloadOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import api from '../services/api'
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts'

const { Title } = Typography

const Bookmarks = () => {
  const [bookmarks, setBookmarks] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingBookmark, setEditingBookmark] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [form] = Form.useForm()

  useEffect(() => {
    fetchBookmarks()
  }, [])

  const fetchBookmarks = async () => {
    setLoading(true)
    try {
      const response = await api.get('/bookmarks')
      setBookmarks(response.data.bookmarks || [])
    } catch (error) {
      message.error('获取书签失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingBookmark(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (bookmark) => {
    setEditingBookmark(bookmark)
    form.setFieldsValue({
      ...bookmark,
      tags: bookmark.tags || []
    })
    setModalVisible(true)
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/bookmarks/${id}`)
      message.success('删除成功')
      fetchBookmarks()
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleSubmit = async (values) => {
    try {
      if (editingBookmark) {
        await api.put(`/bookmarks/${editingBookmark.id}`, values)
        message.success('更新成功')
      } else {
        await api.post('/bookmarks', values)
        message.success('添加成功')
      }
      setModalVisible(false)
      fetchBookmarks()
    } catch (error) {
      message.error(editingBookmark ? '更新失败' : '添加失败')
    }
  }

  const handleSearch = async () => {
    if (!searchText.trim()) {
      fetchBookmarks()
      return
    }

    setLoading(true)
    try {
      const response = await api.get(`/bookmarks/search?q=${encodeURIComponent(searchText)}`)
      setBookmarks(response.data.bookmarks || [])
    } catch (error) {
      message.error('搜索失败')
    } finally {
      setLoading(false)
    }
  }

  // 导出为JSON
  const handleExportJSON = async () => {
    try {
      message.loading({ content: '正在导出...', key: 'export' })
      const response = await api.get('/import-export/bookmarks/export', {
        responseType: 'blob'
      })

      // 创建下载链接
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `bookmarks_${new Date().toISOString().split('T')[0]}.json`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      message.success({ content: '导出成功！', key: 'export', duration: 2 })
    } catch (error) {
      message.error({ content: '导出失败', key: 'export' })
    }
  }

  // 导出为HTML（浏览器导入格式）
  const handleExportHTML = async () => {
    try {
      message.loading({ content: '正在导出...', key: 'export' })
      const response = await api.get('/import-export/bookmarks/export/html', {
        responseType: 'blob'
      })

      // 创建下载链接
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/html' }))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `bookmarks_${new Date().toISOString().split('T')[0]}.html`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      message.success({ content: '导出成功！可在浏览器中导入此文件', key: 'export', duration: 3 })
    } catch (error) {
      message.error({ content: '导出失败', key: 'export' })
    }
  }

  // 快捷键回调 - 现在所有函数都已定义
  const keyboardCallbacks = {
    onNewBookmark: handleAdd,
    onSearch: () => document.getElementById('bookmark-search')?.focus(),
    onSave: () => form.submit(),
    onCancel: () => setModalVisible(false),
  }

  useKeyboardShortcuts(keyboardCallbacks)

  const columns = [
    {
      title: '排序号',
      dataIndex: 'position',
      key: 'position',
      width: 80,
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      render: (text, record) => (
        <Space>
          <LinkOutlined />
          <a href={record.url} target="_blank" rel="noopener noreferrer">
            {text}
          </a>
        </Space>
      ),
    },
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
      ellipsis: true,
    },
    {
      title: '文件夹',
      dataIndex: 'folder',
      key: 'folder',
      render: (folder) => folder || '-',
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      render: (tags) => (
        <>
          {tags?.map(tag => (
            <Tag key={tag} color="blue">{tag}</Tag>
          ))}
        </>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button 
            type="link" 
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个书签吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Title level={2}>书签管理</Title>
      
      <Card style={{ marginBottom: 16 }}>
        <Space style={{ marginBottom: 16 }}>
          <Input.Search
            id="bookmark-search"
            placeholder="搜索书签... (Ctrl+F)"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onSearch={handleSearch}
            style={{ width: 300 }}
            enterButton={<SearchOutlined />}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加书签 (Ctrl+N)
          </Button>
          <Button icon={<FileTextOutlined />} onClick={handleExportJSON}>
            导出JSON
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExportHTML}>
            导出HTML（浏览器格式）
          </Button>
        </Space>

        <Table
          columns={columns}
          dataSource={bookmarks}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
        />
      </Card>

      <Modal
        title={editingBookmark ? '编辑书签' : '添加书签'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入书签标题' }]}
          >
            <Input placeholder="请输入书签标题" />
          </Form.Item>

          <Form.Item
            name="url"
            label="URL"
            rules={[
              { required: true, message: '请输入URL' },
              { type: 'url', message: '请输入有效的URL' }
            ]}
          >
            <Input placeholder="https://example.com" />
          </Form.Item>

          <Form.Item
            name="folder"
            label="文件夹"
          >
            <Input placeholder="请输入文件夹名称（可选）" />
          </Form.Item>

          <Form.Item
            name="tags"
            label="标签"
          >
            <Select
              mode="tags"
              placeholder="请输入标签（可选）"
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            name="description"
            label="描述"
          >
            <Input.TextArea 
              rows={3} 
              placeholder="请输入描述（可选）" 
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Bookmarks