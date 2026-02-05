// 浏览器API兼容层 - 统一Chrome和Firefox的API差异
(function() {
  'use strict';
  
  // 检测浏览器类型
  const isFirefox = typeof browser !== 'undefined' && browser.runtime;
  const isChrome = typeof chrome !== 'undefined' && chrome.runtime;
  
  if (!isFirefox && !isChrome) {
    console.error('不支持的浏览器环境');
    return;
  }
  
  // 创建统一的API对象
  window.extensionAPI = {
    // 运行时API
    runtime: {
      onMessage: {
        addListener: (callback) => {
          if (isFirefox) {
            browser.runtime.onMessage.addListener(callback);
          } else {
            chrome.runtime.onMessage.addListener(callback);
          }
        }
      },
      
      sendMessage: (message) => {
        if (isFirefox) {
          return browser.runtime.sendMessage(message);
        } else {
          return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            });
          });
        }
      },
      
      onInstalled: {
        addListener: (callback) => {
          if (isFirefox) {
            browser.runtime.onInstalled.addListener(callback);
          } else {
            chrome.runtime.onInstalled.addListener(callback);
          }
        }
      },
      
      openOptionsPage: () => {
        if (isFirefox) {
          return browser.runtime.openOptionsPage();
        } else {
          return new Promise((resolve) => {
            chrome.runtime.openOptionsPage();
            resolve();
          });
        }
      }
    },
    
    // 存储API
    storage: {
      sync: {
        get: (keys) => {
          if (isFirefox) {
            return browser.storage.sync.get(keys);
          } else {
            return new Promise((resolve) => {
              chrome.storage.sync.get(keys, resolve);
            });
          }
        },
        
        set: (items) => {
          if (isFirefox) {
            return browser.storage.sync.set(items);
          } else {
            return new Promise((resolve) => {
              chrome.storage.sync.set(items, resolve);
            });
          }
        }
      }
    },
    
    // 标签页API
    tabs: {
      query: (queryInfo) => {
        if (isFirefox) {
          return browser.tabs.query(queryInfo);
        } else {
          return new Promise((resolve) => {
            chrome.tabs.query(queryInfo, resolve);
          });
        }
      },
      
      create: (createProperties) => {
        if (isFirefox) {
          return browser.tabs.create(createProperties);
        } else {
          return new Promise((resolve) => {
            chrome.tabs.create(createProperties, resolve);
          });
        }
      },
      
      sendMessage: (tabId, message) => {
        if (isFirefox) {
          return browser.tabs.sendMessage(tabId, message);
        } else {
          return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, message, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            });
          });
        }
      },
      
      onUpdated: {
        addListener: (callback) => {
          if (isFirefox) {
            browser.tabs.onUpdated.addListener(callback);
          } else {
            chrome.tabs.onUpdated.addListener(callback);
          }
        }
      }
    },
    
    // 右键菜单API
    contextMenus: {
      create: (createProperties) => {
        if (isFirefox) {
          return browser.contextMenus.create(createProperties);
        } else {
          return chrome.contextMenus.create(createProperties);
        }
      },
      
      onClicked: {
        addListener: (callback) => {
          if (isFirefox) {
            browser.contextMenus.onClicked.addListener(callback);
          } else {
            chrome.contextMenus.onClicked.addListener(callback);
          }
        }
      }
    },
    
    // 通知API
    notifications: {
      create: (notificationId, options) => {
        if (isFirefox) {
          return browser.notifications.create(notificationId, options);
        } else {
          return new Promise((resolve) => {
            chrome.notifications.create(notificationId, options, resolve);
          });
        }
      }
    },
    
    // 书签API
    bookmarks: (() => {
      if (isChrome && chrome.bookmarks) {
        return {
          create: (bookmark) => {
            return new Promise((resolve, reject) => {
              chrome.bookmarks.create(bookmark, (result) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(result);
                }
              });
            });
          },
          
          search: (query) => {
            return new Promise((resolve, reject) => {
              chrome.bookmarks.search(query, (results) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(results);
                }
              });
            });
          },

          get: (id) => {
            return new Promise((resolve, reject) => {
              chrome.bookmarks.get(id, (results) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(results);
                }
              });
            });
          },
          
          remove: (id) => {
            return new Promise((resolve, reject) => {
              chrome.bookmarks.remove(id, () => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve();
                }
              });
            });
          },
          
          getTree: () => {
            return new Promise((resolve, reject) => {
              chrome.bookmarks.getTree((results) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(results);
                }
              });
            });
          },

          getChildren: (id) => {
            return new Promise((resolve, reject) => {
              chrome.bookmarks.getChildren(id, (results) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(results);
                }
              });
            });
          },

          // 事件监听器
          onCreated: {
            addListener: (callback) => {
              chrome.bookmarks.onCreated.addListener(callback);
            }
          },

          onRemoved: {
            addListener: (callback) => {
              chrome.bookmarks.onRemoved.addListener(callback);
            }
          },

          onChanged: {
            addListener: (callback) => {
              chrome.bookmarks.onChanged.addListener(callback);
            }
          },

          onMoved: {
            addListener: (callback) => {
              chrome.bookmarks.onMoved.addListener(callback);
            }
          }
        };
      } else if (isFirefox && browser.bookmarks) {
        return {
          create: browser.bookmarks.create,
          search: browser.bookmarks.search,
          get: browser.bookmarks.get,
          remove: browser.bookmarks.remove,
          getTree: browser.bookmarks.getTree,
          getChildren: browser.bookmarks.getChildren,
          
          // 事件监听器
          onCreated: {
            addListener: (callback) => {
              browser.bookmarks.onCreated.addListener(callback);
            }
          },

          onRemoved: {
            addListener: (callback) => {
              browser.bookmarks.onRemoved.addListener(callback);
            }
          },

          onChanged: {
            addListener: (callback) => {
              browser.bookmarks.onChanged.addListener(callback);
            }
          },

          onMoved: {
            addListener: (callback) => {
              browser.bookmarks.onMoved.addListener(callback);
            }
          }
        };
      } else {
        return null; // 浏览器不支持书签API
      }
    })(),
  };
  
  // 浏览器信息
  window.extensionAPI.browserInfo = {
    isFirefox: isFirefox,
    isChrome: isChrome,
    name: isFirefox ? 'Firefox' : 'Chrome'
  };
  
  console.log(`浏览器兼容层已加载 - ${window.extensionAPI.browserInfo.name}`);
})();