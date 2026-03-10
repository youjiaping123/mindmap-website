/**
 * .xmind 文件导出模块
 *
 * 基于 Xmind 官方 SDK (xmindltd/xmind-sdk-js) 源码逆向的格式规范。
 *
 * .xmind 文件 = ZIP 压缩包（STORE 模式，不压缩），包含:
 *   - content.json   (思维导图 JSON 数据 — Xmind Zen/2020+ 使用)
 *   - content.xml    (兼容性 XML — 旧版 Xmind 8 使用，必须存在)
 *   - metadata.json  (元信息 — 空对象 {})
 *   - manifest.json  (清单文件 — 根目录，非 META-INF/)
 *
 * 关键发现（来自官方 SDK zipper.ts）：
 *   - manifest.json 在根目录: `this.zip.file(PACKAGE_MAP.MANIFEST.NAME, ...)`
 *   - metadata.json 内容为空: `this.zip.file(PACKAGE_MAP.METADATA.NAME, '{}')`
 *   - 必须包含 content.xml: `addXMLContent()` 写入兼容性 XML
 *   - ZIP 压缩模式为 STORE: `compression: 'STORE'`
 */

const XmindExport = (() => {

  /**
   * 生成唯一 ID (模拟 Xmind 的 ID 格式: 26位十六进制字符)
   */
  function generateId() {
    const chars = '0123456789abcdef';
    let id = '';
    for (let i = 0; i < 26; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }

  /**
   * 解析 Markdown 标题为树形结构
   * 支持 # ~ ###### 标题格式，以及混合列表格式 (- 开头)
   */
  function parseMarkdownToTree(markdown) {
    const lines = markdown.split('\n');

    if (lines.length === 0) {
      return { title: 'Mindmap', children: [] };
    }

    const root = { title: '', children: [] };
    const stack = [{ node: root, level: 0 }];

    // 记录上一个标题的级别，用于处理列表项
    let lastHeadingLevel = 0;

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line.trim()) continue;

      // 匹配 Markdown 标题 (# ~ ######)
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();
        lastHeadingLevel = level;

        const newNode = { title, children: [] };

        // 找到合适的父节点
        while (stack.length > 1 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }

        stack[stack.length - 1].node.children.push(newNode);
        stack.push({ node: newNode, level });
        continue;
      }

      // 匹配列表项 (- 或 * 开头，可带缩进)
      const listMatch = line.match(/^(\s*)[*\-+]\s+(.+)$/);
      if (listMatch) {
        const indent = listMatch[1].length;
        const title = listMatch[2].trim();

        // 列表项的级别 = 上一个标题级别 + 1 + 缩进级别
        const indentLevel = Math.floor(indent / 2);
        const level = lastHeadingLevel + 1 + indentLevel;

        const newNode = { title, children: [] };

        while (stack.length > 1 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }

        stack[stack.length - 1].node.children.push(newNode);
        stack.push({ node: newNode, level });
        continue;
      }
    }

    // 如果只有一个顶级子节点，直接作为根
    if (root.children.length === 1) {
      return root.children[0];
    }

    if (root.children.length === 0) {
      return { title: 'Mindmap', children: [] };
    }

    root.title = 'Mindmap';
    return root;
  }

  /**
   * 将树形结构转换为 Xmind content.json 的 topic 格式
   */
  function treeToXmindTopic(node, isRoot) {
    const topic = {
      id: generateId(),
      class: 'topic',
      title: node.title || '',
    };

    if (isRoot) {
      topic.structureClass = 'org.xmind.ui.map.unbalanced';
    }

    if (node.children && node.children.length > 0) {
      topic.children = {
        attached: node.children.map(child => treeToXmindTopic(child, false)),
      };
    }

    return topic;
  }

  /**
   * 生成 content.json — Xmind Zen/2020+ 使用的 JSON 格式
   * 格式: 数组，每个元素是一个 sheet
   */
  function generateContentJson(tree) {
    const rootTopic = treeToXmindTopic(tree, true);

    return [{
      id: generateId(),
      class: 'sheet',
      title: tree.title || 'Sheet 1',
      rootTopic: rootTopic,
    }];
  }

  /**
   * 生成 content.xml — 兼容旧版 Xmind 8 的 XML 格式
   * 这是一个固定的警告内容，告知用户需要升级软件
   * 来源: 官方 SDK dumper.ts 中的 XMLContents 常量
   */
  function generateContentXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>'
      + '<xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0"'
      + ' xmlns:fo="http://www.w3.org/1999/XSL/Format"'
      + ' xmlns:svg="http://www.w3.org/2000/svg"'
      + ' xmlns:xhtml="http://www.w3.org/1999/xhtml"'
      + ' xmlns:xlink="http://www.w3.org/1999/xlink"'
      + ' modified-by="bruce" timestamp="1503058545540" version="2.0">'
      + '<sheet id="' + generateId() + '" modified-by="bruce"'
      + ' theme="0kdeemiijde6nuk97e4t0vpp54" timestamp="1503058545540">'
      + '<topic id="' + generateId() + '" modified-by="bruce"'
      + ' structure-class="org.xmind.ui.logic.right" timestamp="1503058545417">'
      + '<title>Warning</title>'
      + '<children><topics type="attached">'
      + '<topic id="' + generateId() + '" modified-by="bruce" timestamp="1503058545423">'
      + '<title svg:width="500">This file can not be opened normally, please do not modify and save, '
      + 'otherwise the contents will be permanently lost!</title>'
      + '<children><topics type="attached">'
      + '<topic id="' + generateId() + '" modified-by="bruce" timestamp="1503058545427">'
      + '<title>You can try using XMind 8 Update 3 or later version to open</title>'
      + '</topic></topics></children></topic>'
      + '<topic id="' + generateId() + '" modified-by="bruce" timestamp="1503058545434">'
      + '<title svg:width="500">'
      + '\u8BE5\u6587\u4EF6\u65E0\u6CD5\u6B63\u5E38\u6253\u5F00\uFF0C\u8BF7\u52FF\u4FEE\u6539\u5E76\u4FDD\u5B58\uFF0C'
      + '\u5426\u5219\u6587\u4EF6\u5185\u5BB9\u5C06\u4F1A\u6C38\u4E45\u6027\u4E22\u5931\uFF01</title>'
      + '<children><topics type="attached">'
      + '<topic id="' + generateId() + '" modified-by="bruce" timestamp="1503058545438">'
      + '<title>\u8BF7\u5C1D\u8BD5\u4F7F\u7528 XMind 8 Update 3 \u6216\u66F4\u65B0\u7248\u672C\u6253\u5F00</title>'
      + '</topic></topics></children></topic>'
      + '</topics></children></topic></sheet></xmap-content>';
  }

  /**
   * 生成 manifest.json — 根目录（非 META-INF/）
   * 来源: 官方 SDK zipper.ts 构造函数中初始化的 manifest 对象
   */
  function generateManifestJson() {
    return {
      'file-entries': {
        'content.json': {},
        'metadata.json': {},
      },
    };
  }

  /**
   * 主方法：Markdown → .xmind Blob
   * @param {string} markdown - Markdown 内容
   * @returns {Promise<Blob>} .xmind 文件的 Blob
   */
  async function markdownToXmindBlob(markdown) {
    const tree = parseMarkdownToTree(markdown);
    const contentJson = generateContentJson(tree);
    const manifestJson = generateManifestJson();

    const zip = new JSZip();

    // 按照官方 SDK zipper.ts save() 方法的顺序写入文件:
    // 1. content.json (JSON 格式的思维导图数据)
    zip.file('content.json', JSON.stringify(contentJson));
    // 2. metadata.json (空对象 — 官方 SDK: addMetadataContents 写入 '{}')
    zip.file('metadata.json', '{}');
    // 3. content.xml (兼容性 XML — 官方 SDK: addXMLContent)
    zip.file('content.xml', generateContentXml());
    // 4. manifest.json (根目录清单 — 官方 SDK: addManifestContents)
    zip.file('manifest.json', JSON.stringify(manifestJson));

    // 官方 SDK 使用 STORE 压缩模式
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'STORE',
    });

    return blob;
  }

  /**
   * 触发下载 .xmind 文件
   * @param {string} markdown - Markdown 内容
   * @param {string} filename - 文件名（不含扩展名）
   */
  async function download(markdown, filename) {
    const blob = await markdownToXmindBlob(markdown);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.xmind`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { download, markdownToXmindBlob, parseMarkdownToTree };
})();
