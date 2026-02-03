#!/bin/bash
# 切换到脚本所在目录
cd "$(dirname "$0")"
echo "切换到Firefox配置..."
cp manifest-firefox.json manifest.json
echo "Firefox配置已激活！"
echo "请在Firefox中重新加载扩展。"
read -p "按回车键继续..."