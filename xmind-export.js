/**
 * .xmind 文件导出模块
 *
 * .xmind 文件格式 = ZIP 压缩包，包含:
 *   - content.json  (思维导图数据)
 *   - metadata.json (元信息)
 *
 * Xmind Zen / Xmind 2020+ 使用的 JSON 格式
 */

const XmindExport = (() => {

  /**
   * 生成唯一 ID (模拟 Xmind 的 ID 格式)
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
   * 支持 # ## ### ####
   */
  function parseMarkdownToTree(markdown) {
    const lines = markdown.split('\n').filter(line => line.trim().startsWith('#'));

    if (lines.length === 0) {
      return { title: 'Mindmap', children: [] };
    }

    // 构建树
    const root = { title: '', children: [] };
    const stack = [{ node: root, level: 0 }];

    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (!match) continue;

      const level = match[1].length;
      const title = match[2].trim();

      const newNode = { title, children: [] };

      // 找到合适的父节点
      while (stack.length > 1 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      stack[stack.length - 1].node.children.push(newNode);
      stack.push({ node: newNode, level });
    }

    // 如果只有一个顶级子节点，直接作为根
    if (root.children.length === 1) {
      return root.children[0];
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
      title: node.title,
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
   * 生成 content.json
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
   * 生成 metadata.json
   */
  function generateMetadataJson() {
    return {
      creator: {
        name: 'Vana',
        version: '13.0.0',
      },
    };
  }

  /**
   * 生成 manifest.json (Xmind 必需)
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
    const metadataJson = generateMetadataJson();
    const manifestJson = generateManifestJson();

    const zip = new JSZip();
    zip.file('content.json', JSON.stringify(contentJson));
    zip.file('metadata.json', JSON.stringify(metadataJson));
    zip.file('manifest.json', JSON.stringify(manifestJson));

    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/zip',
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
