# Xmind 导出格式对齐计划

## 目标
匹配 Xmind 官方 Vana/Yogurt 26.x 导出格式，添加 Dawn 主题样式和正确的缩略图。

## 修改清单 (xmind-export.js)

1. THUMBNAIL_PATH → 'Thumbnails/thumbnail.png'
2. 新增 DEFAULT_THEME 常量 (Dawn 主题)
3. 新增 getThemeWithIds() 动态注入 UUID
4. treeToXmindTopic() 添加 class: "topic" + structureClass
5. generateContentJson() 注入主题、动态 sheet/root ID
6. generateManifestJson() 精简为 3 项
7. ZIP 保留 content.xml 但 manifest 不列它
8. ZIP 压缩保持 STORE

## 验收标准
- 导出 .xmind 在 Xmind 应用中显示多彩分支线
- 缩略图正常显示
- content.json 结构匹配参考文件
