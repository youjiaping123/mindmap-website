/**
 * .xmind 文件导出模块
 *
 * 基于 Xmind 新版（Yogurt 26.x）真实导出文件逆向的格式规范。
 *
 * .xmind 文件 = ZIP 压缩包（STORE 模式，不压缩），包含:
 *   - content.json   (思维导图 JSON 数据 — 新版 Xmind 使用)
 *   - content.xml    (兼容性 XML — 旧版 Xmind 8 使用，多语言警告)
 *   - metadata.json  (元信息 — 包含版本和创建者信息)
 *   - manifest.json  (清单文件 — 列出核心文件条目)
 *   - Thumbnails/thumbnail.png (预览缩略图)
 */

const XmindExport = (() => {
  const XMIND_MIME_TYPE = 'application/vnd.xmind.workbook';
  const THUMBNAIL_PATH = 'Thumbnails/thumbnail.png';
  const THUMBNAIL_EXPORT_OPTIONS = {
    width: 1024,
    height: 634,
    maxSizeBytes: 200 * 1024, // 200KB
    padding: 24,
    backgroundColor: '#ffffff',
  };

  /** Dawn 主题模板（基于 Xmind Yogurt 26.x 官方导出逆向, 完整属性） */
  const DEFAULT_THEME = {
    map: {
      properties: {
        'svg:fill': '#ffffff',
        'multi-line-colors': '#FF6B6B #FF9F69 #97D3B6 #88E2D7 #6FD0F9 #E18BEE',
        'color-list': '#FF6B6B #FF9F69 #97D3B6 #88E2D7 #6FD0F9 #E18BEE',
        'line-tapered': 'tapered',
      },
    },
    centralTopic: {
      properties: {
        'fo:font-family': 'Roboto',
        'fo:font-size': '30pt',
        'fo:font-weight': '700',
        'fo:font-style': 'normal',
        'fo:color': 'inherited',
        'fo:text-transform': 'manual',
        'fo:text-decoration': 'none',
        'fo:text-align': 'center',
        'svg:fill': '#000000',
        'fill-pattern': 'none',
        'line-width': '3pt',
        'line-color': '#ADADAD',
        'line-pattern': 'solid',
        'border-line-color': '#000000',
        'border-line-width': '3',
        'border-line-pattern': 'solid',
        'shape-class': 'org.xmind.topicShape.roundedRect',
        'line-class': 'org.xmind.branchConnection.roundedfold',
        'arrow-end-class': 'org.xmind.arrowShape.none',
        'alignment-by-level': 'inherited',
      },
    },
    mainTopic: {
      properties: {
        'fo:font-family': 'Roboto',
        'fo:font-size': '18pt',
        'fo:font-weight': '500',
        'fo:font-style': 'normal',
        'fo:color': 'inherited',
        'fo:text-transform': 'manual',
        'fo:text-decoration': 'none',
        'fo:text-align': 'left',
        'svg:fill': 'inherited',
        'fill-pattern': 'none',
        'line-width': '2pt',
        'line-color': 'inherited',
        'line-pattern': 'inherited',
        'border-line-color': 'inherited',
        'border-line-width': '3',
        'border-line-pattern': 'inherited',
        'shape-class': 'org.xmind.topicShape.underline',
        'line-class': 'org.xmind.branchConnection.bight',
        'arrow-end-class': 'inherited',
        'alignment-by-level': 'inherited',
      },
    },
    subTopic: {
      properties: {
        'fo:font-family': 'Roboto',
        'fo:font-size': '14pt',
        'fo:font-weight': '400',
        'fo:font-style': 'normal',
        'fo:color': 'inherited',
        'fo:text-transform': 'manual',
        'fo:text-decoration': 'none',
        'fo:text-align': 'left',
        'svg:fill': 'inherited',
        'fill-pattern': 'none',
        'line-width': 'inherited',
        'line-color': 'inherited',
        'line-pattern': 'inherited',
        'border-line-color': 'inherited',
        'border-line-width': 'inherited',
        'border-line-pattern': 'inherited',
        'shape-class': 'org.xmind.topicShape.underline',
        'line-class': 'org.xmind.branchConnection.bight',
        'arrow-end-class': 'inherited',
        'alignment-by-level': 'inherited',
      },
    },
    floatingTopic: {
      properties: {
        'fo:font-family': 'Roboto',
        'fo:font-size': '14pt',
        'fo:font-weight': '500',
        'fo:font-style': 'normal',
        'fo:color': 'inherited',
        'fo:text-transform': 'manual',
        'fo:text-decoration': 'none',
        'fo:text-align': 'left',
        'svg:fill': '#EEEBEE',
        'fill-pattern': 'none',
        'line-width': '3pt',
        'line-color': 'inherited',
        'line-pattern': 'solid',
        'border-line-color': '#EEEBEE',
        'border-line-width': 'inherited',
        'border-line-pattern': 'solid',
        'shape-class': 'org.xmind.topicShape.roundedRect',
        'line-class': 'org.xmind.branchConnection.bight',
        'arrow-end-class': 'org.xmind.arrowShape.none',
        'alignment-by-level': 'inherited',
      },
    },
    summaryTopic: {
      properties: {
        'fo:font-family': 'Roboto',
        'fo:font-size': '14pt',
        'fo:font-weight': '500',
        'fo:font-style': 'normal',
        'fo:color': 'inherited',
        'fo:text-transform': 'manual',
        'fo:text-decoration': 'none',
        'fo:text-align': 'left',
        'svg:fill': '#000000',
        'fill-pattern': 'solid',
        'line-width': 'inherited',
        'line-color': 'inherited',
        'line-pattern': 'inherited',
        'border-line-color': '#000000',
        'border-line-width': '0pt',
        'border-line-pattern': 'inherited',
        'shape-class': 'org.xmind.topicShape.roundedRect',
        'line-class': 'org.xmind.branchConnection.bight',
        'arrow-end-class': 'inherited',
        'alignment-by-level': 'inherited',
      },
    },
    calloutTopic: {
      properties: {
        'fo:font-family': 'Roboto',
        'fo:font-size': '14pt',
        'fo:font-weight': '500',
        'fo:font-style': 'normal',
        'fo:color': 'inherited',
        'fo:text-transform': 'manual',
        'fo:text-decoration': 'none',
        'fo:text-align': 'left',
        'svg:fill': '#000000',
        'fill-pattern': 'solid',
        'line-width': 'inherited',
        'line-color': 'inherited',
        'line-pattern': 'inherited',
        'border-line-color': '#000000',
        'border-line-width': 'inherited',
        'border-line-pattern': 'inherited',
        'shape-class': 'org.xmind.topicShape.ellipse',
        'line-class': 'org.xmind.branchConnection.roundedElbow',
        'arrow-end-class': 'inherited',
        'alignment-by-level': 'inherited',
      },
    },
    importantTopic: {
      properties: {
        'fo:font-weight': 'bold',
        'svg:fill': '#7F00AC',
        'fill-pattern': 'solid',
        'border-line-color': '#7F00AC',
        'border-line-width': '0',
      },
    },
    minorTopic: {
      properties: {
        'fo:font-weight': 'bold',
        'svg:fill': '#82004A',
        'fill-pattern': 'solid',
        'border-line-color': '#82004A',
        'border-line-width': '0',
      },
    },
    boundary: {
      properties: {
        'fo:font-family': 'Roboto',
        'fo:font-size': '14pt',
        'fo:font-weight': '500',
        'fo:font-style': 'normal',
        'fo:color': 'inherited',
        'fo:text-transform': 'manual',
        'fo:text-decoration': 'none',
        'fo:text-align': 'center',
        'svg:fill': '#9B9B9B',
        'fill-pattern': 'solid',
        'line-width': '2',
        'line-color': '#00000066',
        'line-pattern': 'dash',
        'shape-class': 'org.xmind.boundaryShape.roundedRect',
      },
    },
    zone: {
      properties: {
        'fo:font-family': 'NeverMind, sans-serif, Microsoft YaHei, PingFang SC, Microsoft JhengHei, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji',
        'fo:font-size': '12',
        'fo:font-weight': '400',
        'fo:font-style': 'normal',
        'fo:color': 'inherited',
        'fo:text-transform': 'manual',
        'fo:text-decoration': 'none',
        'fo:text-align': 'left',
        'svg:fill': '#9b9b9b33',
        'fill-pattern': 'none',
        'border-line-color': '#00000066',
        'border-line-width': '2pt',
        'border-line-pattern': 'solid',
      },
    },
    summary: {
      properties: {
        'line-width': '2pt',
        'line-color': '#000000',
        'line-pattern': 'solid',
        'shape-class': 'org.xmind.summaryShape.round',
      },
    },
    relationship: {
      properties: {
        'fo:font-family': 'Roboto',
        'fo:font-size': '13pt',
        'fo:font-weight': '500',
        'fo:font-style': 'normal',
        'fo:color': 'inherited',
        'fo:text-transform': 'manual',
        'fo:text-decoration': 'none',
        'fo:text-align': 'center',
        'line-width': '2',
        'line-color': '#00000066',
        'line-pattern': 'dash',
        'shape-class': 'org.xmind.relationshipShape.curved',
        'arrow-begin-class': 'org.xmind.arrowShape.none',
        'arrow-end-class': 'org.xmind.arrowShape.triangle',
      },
    },
    expiredTopic: {
      properties: {
        'fo:text-decoration': 'line-through',
        'fill-pattern': 'none',
      },
    },
    level3: {
      properties: {
        'alignment-by-level': 'inherited',
      },
    },
    skeletonThemeId: '6e8a0060db4a430f98c8d89f66',
    colorThemeId: 'Dawn-#ffffff-MULTI_LINE_COLORS',
  };

  /** 克隆主题模板并为每个样式组件注入动态 UUID */
  function buildTheme() {
    const theme = JSON.parse(JSON.stringify(DEFAULT_THEME));
    for (const key of Object.keys(theme)) {
      const val = theme[key];
      if (val && typeof val === 'object' && !Array.isArray(val) && val.properties) {
        val.id = generateUUID();
      }
    }
    return theme;
  }

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
   * 生成 UUID v4 格式字符串 (用于 sheet 的 revisionId)
   */
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
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
   *
   * 新版格式特征（参考 Yogurt 26.x 真实 .xmind 文件）：
   *   - 每个 topic 带 id, class: "topic", title
   *   - root topic 额外带 structureClass: "org.xmind.ui.map.unbalanced"
   *   - children 使用 { attached: [...] } 结构
   */
  function treeToXmindTopic(node, isRoot) {
    const topic = {
      id: generateId(),
      class: 'topic',
      title: node.title || '',
    };

    if (isRoot) {
      topic.structureClass = 'org.xmind.ui.map.clockwise';
    }

    if (node.children && node.children.length > 0) {
      topic.children = {
        attached: node.children.map(child => treeToXmindTopic(child, false)),
      };
    }

    return topic;
  }

  /**
   * 生成 content.json — 新版 Xmind 使用的 JSON 格式
   *
   * 格式: 数组，每个元素是一个 sheet，包含:
   *   - id: 26位十六进制
   *   - revisionId: UUID v4 字符串
   *   - class: "sheet"
   *   - rootTopic: 根主题（带 class/structureClass）
   *   - title: sheet 标题
   *   - arrangeableLayerOrder: [rootTopicId]
   *   - zones: []
   *   - theme: Dawn 主题模板（含 colorThemeId）
   */
  function generateContentJson(tree) {
    const rootTopic = treeToXmindTopic(tree, true);

    return [{
      id: generateId(),
      revisionId: generateUUID(),
      class: 'sheet',
      rootTopic,
      title: tree.title || 'Sheet 1',
      arrangeableLayerOrder: [rootTopic.id],
      zones: [],
      extensions: [{
        provider: 'org.xmind.ui.skeleton.structure.style',
        content: {
          centralTopic: 'org.xmind.ui.map.clockwise',
          mainTopic: 'org.xmind.ui.logic.right',
          floatingTopic: 'org.xmind.ui.logic.right',
        },
      }],
      theme: buildTheme(),
    }];
  }

  /**
   * 生成 content.xml — 兼容旧版 Xmind 8 的 XML 格式
   *
   * 完整复现真实 .xmind 文件中的多语言警告内容:
   * 英文、简体中文、繁体中文、日文、德文、法文、韩文
   */
  function generateContentXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>'
      + '<xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0"'
      + ' xmlns:fo="http://www.w3.org/1999/XSL/Format"'
      + ' xmlns:svg="http://www.w3.org/2000/svg"'
      + ' xmlns:xhtml="http://www.w3.org/1999/xhtml"'
      + ' xmlns:xlink="http://www.w3.org/1999/xlink"'
      + ' modified-by="bruce" timestamp="1503058545540" version="2.0">'
      + '<sheet id="7abtd0ssc7n4pi1nu6i7b6lsdh" modified-by="bruce"'
      + ' theme="0kdeemiijde6nuk97e4t0vpp54" timestamp="1503058545540">'
      + '<topic id="1vr0lcte2og4t2sopiogvdmifc" modified-by="bruce"'
      + ' structure-class="org.xmind.ui.logic.right" timestamp="1503058545417">'
      + '<title>Warning\n\u8B66\u544A\nAttention\nWarnung\n\uACBD\uACE0</title>'
      + '<children><topics type="attached">'
      // English
      + '<topic id="71h1aip2t1o8vvm0a41nausaar" modified-by="bruce" timestamp="1503058545423">'
      + '<title svg:width="500">This file can not be opened normally, please do not modify and save, '
      + 'otherwise the contents will be permanently lost\uFF01</title>'
      + '<children><topics type="attached">'
      + '<topic id="428akmkh9a0tog6c91qj995qdl" modified-by="bruce" timestamp="1503058545427">'
      + '<title>You can try using XMind 8 Update 3 or later version to open</title>'
      + '</topic></topics></children></topic>'
      // Simplified Chinese
      + '<topic id="2kb87f8m38b3hnfhp450c7q35e" modified-by="bruce" timestamp="1503058545434">'
      + '<title svg:width="500">'
      + '\u8BE5\u6587\u4EF6\u65E0\u6CD5\u6B63\u5E38\u6253\u5F00\uFF0C\u8BF7\u52FF\u4FEE\u6539\u5E76\u4FDD\u5B58\uFF0C'
      + '\u5426\u5219\u6587\u4EF6\u5185\u5BB9\u5C06\u4F1A\u6C38\u4E45\u6027\u4E22\u5931\uFF01</title>'
      + '<children><topics type="attached">'
      + '<topic id="3m9hoo4a09n53ofl6fohdun99f" modified-by="bruce" timestamp="1503058545438">'
      + '<title>\u4F60\u53EF\u4EE5\u5C1D\u8BD5\u4F7F\u7528 XMind 8 Update 3 \u6216\u66F4\u65B0\u7248\u672C\u6253\u5F00</title>'
      + '</topic></topics></children></topic>'
      // Traditional Chinese
      + '<topic id="7r3r4617hvh931ot9obi595r8f" modified-by="bruce" timestamp="1503058545444">'
      + '<title svg:width="500">'
      + '\u8A72\u6587\u4EF6\u7121\u6CD5\u6B63\u5E38\u6253\u958B\uFF0C\u8ACB\u52FF\u4FEE\u6539\u4E26\u4FDD\u5B58\uFF0C'
      + '\u5426\u5247\u6587\u4EF6\u5167\u5BB9\u5C07\u6703\u6C38\u4E45\u6027\u4E1F\u5931\uFF01</title>'
      + '<children><topics type="attached">'
      + '<topic id="691pgka6gmgpgkacaa0h3f1hjb" modified-by="bruce" timestamp="1503058545448">'
      + '<title>\u4F60\u53EF\u4EE5\u5617\u8A66\u4F7F\u7528 XMind 8 Update 3 \u6216\u66F4\u65B0\u7248\u672C\u6253\u958B</title>'
      + '</topic></topics></children></topic>'
      // Japanese
      + '<topic id="0f2e3rpkfahg4spg4nda946r0b" modified-by="bruce" timestamp="1503058545453">'
      + '<title svg:width="500">'
      + '\u3053\u306E\u6587\u66F8\u306F\u6B63\u5E38\u306B\u958B\u304B\u306A\u3044\u306E\u3067\u3001\u4FEE\u6B63\u3057\u3066\u4FDD\u5B58\u3057\u306A\u3044\u3088\u3046\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002'
      + '\u305D\u3046\u3067\u306A\u3044\u3068\u3001\u66F8\u985E\u306E\u5185\u5BB9\u304C\u6C38\u4E45\u306B\u5931\u308F\u308C\u307E\u3059\u3002\uFF01</title>'
      + '<children><topics type="attached">'
      + '<topic id="4vuubta53ksc1falk46mevge0t" modified-by="bruce" timestamp="1503058545457">'
      + '<title>XMind 8 Update 3 \u3084\u66F4\u65B0\u7248\u3092\u4F7F\u3063\u3066\u958B\u304F\u3053\u3068\u3082\u3067\u304D\u307E\u3059</title>'
      + '</topic></topics></children></topic>'
      // German
      + '<topic id="70n9i4u3lb89sq9l1m1bs255j5" modified-by="bruce" timestamp="1503058545463">'
      + '<title svg:width="500">Datei kann nicht richtig ge\u00F6ffnet werden. '
      + 'Bitte \u00E4ndern Sie diese Datei nicht und speichern Sie sie, '
      + 'sonst wird die Datei endg\u00FCltig gel\u00F6scht werden.</title>'
      + '<children><topics type="attached">'
      + '<topic id="1qpc5ee298p2sqeqbinpca46b7" modified-by="bruce" timestamp="1503058545466">'
      + '<title svg:width="500">Bitte versuchen Sie, diese Datei mit XMind 8 Update 3 oder sp\u00E4ter zu \u00F6ffnen.</title>'
      + '</topic></topics></children></topic>'
      // French
      + '<topic id="4dmes10uc19pq7enu8sc4bmvif" modified-by="bruce" timestamp="1503058545473">'
      + '<title svg:width="500">Ce fichier ne peut pas ouvert normalement, '
      + 'veuillez le r\u00E9diger et sauvegarder, sinon le fichier sera perdu en permanence. </title>'
      + '<children><topics type="attached">'
      + '<topic id="5f0rivgubii2launodiln7sdkt" modified-by="bruce" timestamp="1503058545476">'
      + '<title svg:width="500">Vous pouvez essayer d\'ouvrir avec XMind 8 Update 3 ou avec une version plus r\u00E9cente.</title>'
      + '</topic></topics></children></topic>'
      // Korean
      + '<topic id="10pn1os1sgfsnqa8akabom5pej" modified-by="bruce" timestamp="1503058545481">'
      + '<title svg:width="500">'
      + '\uD30C\uC77C\uC744 \uC815\uC0C1\uC801\uC73C\uB85C \uC5F4 \uC218 \uC5C6\uC73C\uBA70, '
      + '\uC218\uC815 \uBC0F \uC800\uC7A5\uD558\uC9C0 \uB9C8\uC2ED\uC2DC\uC624. '
      + '\uADF8\uB807\uC9C0 \uC54A\uC73C\uBA74 \uD30C\uC77C\uC758 \uB0B4\uC6A9\uC774 \uC601\uAD6C\uC801\uC73C\uB85C \uC190\uC2E4\uB429\uB2C8\uB2E4!</title>'
      + '<children><topics type="attached">'
      + '<topic id="0l2nr0fq3em22rctapkj46ue58" modified-by="bruce" timestamp="1503058545484">'
      + '<title svg:width="500">XMind 8 Update 3 \uB610\uB294 \uC774\uD6C4 \uBC84\uC804\uC744 \uC0AC\uC6A9\uD558\uC5EC</title>'
      + '</topic></topics></children></topic>'
      + '</topics></children>'
      + '<extensions><extension provider="org.xmind.ui.map.unbalanced">'
      + '<content><right-number>-1</right-number></content>'
      + '</extension></extensions>'
      + '</topic><title>Sheet 1</title></sheet></xmap-content>';
  }

  /**
   * 生成 manifest.json — 文件清单
   * 仅列出核心文件条目（匹配 Yogurt 26.x 官方格式）
   */
  function generateManifestJson(hasThumbnail = false) {
    const fileEntries = {
      'content.json': {},
      'metadata.json': {},
    };

    if (hasThumbnail) {
      fileEntries[THUMBNAIL_PATH] = {};
    }

    return {
      'file-entries': fileEntries,
    };
  }

  /**
   * 生成 metadata.json — 元信息
   * 包含数据结构版本、创建者信息、布局引擎版本
   */
  function generateMetadataJson() {
    return {
      dataStructureVersion: '3',
      creator: {
        name: 'ZevenAI',
        version: '2.0.0',
      },
      layoutEngineVersion: '5',
    };
  }

  /**
   * 基于当前预览 SVG 生成固定尺寸缩略图 (1024×634)，用于 Xmind 压缩包内的
   * Thumbnails/thumbnail.png。
   *
   * 完全独立于 PngExport 模块，不会影响思维导图 PNG 的正常导出。
   *
   * 流程：克隆 SVG → 内联样式 → 渲染到 1024×634 Canvas → 输出 PNG
   * 若 PNG 超过 200KB 则自动降级为 JPEG 并逐步降低质量。
   *
   * @param {SVGSVGElement|null} svgElement - 当前思维导图 SVG
   * @returns {Promise<Blob|null>} 缩略图 Blob
   */
  async function generateThumbnailBlob(svgElement) {
    if (!svgElement) return null;

    const { width, height, maxSizeBytes, padding, backgroundColor } = THUMBNAIL_EXPORT_OPTIONS;

    // ── 1. 计算 SVG 内容边界 ──
    const bbox = svgElement.getBBox();
    if (!bbox || bbox.width <= 0 || bbox.height <= 0) return null;

    // 合并 foreignObject 文本层的边界
    const screenCTM = svgElement.getScreenCTM();
    let contentBounds = { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };

    if (screenCTM) {
      const inverse = screenCTM.inverse();
      svgElement.querySelectorAll('foreignObject').forEach(fo => {
        const labelEl = fo.querySelector('div div') || fo.querySelector('div');
        if (!labelEl) return;
        const rect = labelEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const corners = [
          new DOMPoint(rect.left, rect.top),
          new DOMPoint(rect.right, rect.bottom),
        ].map(p => p.matrixTransform(inverse));
        const lx = Math.min(corners[0].x, corners[1].x);
        const ly = Math.min(corners[0].y, corners[1].y);
        const lw = Math.abs(corners[1].x - corners[0].x);
        const lh = Math.abs(corners[1].y - corners[0].y);
        contentBounds = {
          x: Math.min(contentBounds.x, lx),
          y: Math.min(contentBounds.y, ly),
          width: Math.max(contentBounds.x + contentBounds.width, lx + lw) - Math.min(contentBounds.x, lx),
          height: Math.max(contentBounds.y + contentBounds.height, ly + lh) - Math.min(contentBounds.y, ly),
        };
      });
    }

    const exportBox = {
      x: contentBounds.x - padding,
      y: contentBounds.y - padding,
      width: contentBounds.width + padding * 2,
      height: contentBounds.height + padding * 2,
    };

    // ── 2. 克隆 SVG 并内联关键样式 ──
    const clonedSvg = svgElement.cloneNode(true);

    function inlineStyles(original, clone) {
      const origChildren = original.children;
      const cloneChildren = clone.children;
      for (let i = 0; i < origChildren.length && i < cloneChildren.length; i++) {
        if (!(origChildren[i] instanceof Element)) continue;
        const cs = window.getComputedStyle(origChildren[i]);
        const props = [
          'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity',
          'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
          'opacity', 'visibility', 'display',
          'font-family', 'font-size', 'font-weight', 'font-style',
          'text-anchor', 'dominant-baseline', 'text-decoration',
          'letter-spacing', 'word-spacing', 'color',
        ];
        for (const p of props) {
          const v = cs.getPropertyValue(p);
          if (v && v !== '' && v !== 'normal') {
            cloneChildren[i].style.setProperty(p, v);
          }
        }
        inlineStyles(origChildren[i], cloneChildren[i]);
      }
    }
    inlineStyles(svgElement, clonedSvg);

    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clonedSvg.setAttribute('viewBox', `${exportBox.x} ${exportBox.y} ${exportBox.width} ${exportBox.height}`);
    clonedSvg.setAttribute('width', String(width));
    clonedSvg.setAttribute('height', String(height));
    clonedSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // 插入白色背景矩形
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', String(exportBox.x));
    bgRect.setAttribute('y', String(exportBox.y));
    bgRect.setAttribute('width', String(exportBox.width));
    bgRect.setAttribute('height', String(exportBox.height));
    bgRect.setAttribute('fill', backgroundColor);
    clonedSvg.insertBefore(bgRect, clonedSvg.firstChild);

    const svgString = new XMLSerializer().serializeToString(clonedSvg);

    // ── 3. 渲染到固定 1024×634 Canvas ──
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('缩略图 SVG 渲染失败'));
      image.src = svgUrl;
    });
    URL.revokeObjectURL(svgUrl);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    // ── 4. 输出 PNG，若超过 200KB 则降级为 JPEG ──
    const pngBlob = await new Promise(resolve =>
      canvas.toBlob(resolve, 'image/png')
    );

    if (pngBlob && pngBlob.size <= maxSizeBytes) {
      return pngBlob;
    }

    // PNG 超限，逐步降低 JPEG 质量
    const qualities = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35];
    for (const q of qualities) {
      const jpegBlob = await new Promise(resolve =>
        canvas.toBlob(resolve, 'image/jpeg', q)
      );
      if (jpegBlob && jpegBlob.size <= maxSizeBytes) {
        return jpegBlob;
      }
    }

    // 最低质量兜底
    const finalBlob = await new Promise(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', 0.3)
    );
    return finalBlob || pngBlob;
  }

  /**
   * 主方法：Markdown → .xmind Blob
   * @param {string} markdown - Markdown 内容
   * @param {object} [options] - 导出选项
   * @param {SVGSVGElement|null} [options.svgElement] - 用于生成缩略图的 SVG
   * @returns {Promise<Blob>} .xmind 文件的 Blob
   */
  async function markdownToXmindBlob(markdown, options = {}) {
    const tree = parseMarkdownToTree(markdown);
    const contentJson = generateContentJson(tree);
    const metadataJson = generateMetadataJson();
    const thumbnailBlob = await generateThumbnailBlob(options.svgElement || null);
    const manifestJson = generateManifestJson(Boolean(thumbnailBlob));

    const zip = new JSZip();

    // 按照新版 Xmind 文件格式写入:
    zip.file('content.json', JSON.stringify(contentJson));
    zip.file('metadata.json', JSON.stringify(metadataJson));
    zip.file('content.xml', generateContentXml());
    zip.file('manifest.json', JSON.stringify(manifestJson));
    if (thumbnailBlob) {
      zip.file(THUMBNAIL_PATH, thumbnailBlob);
    }

    // STORE 压缩模式（不压缩）
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'STORE',
    });

    return new Blob([blob], { type: XMIND_MIME_TYPE });
  }

  /**
   * 触发下载 .xmind 文件
   * @param {string} markdown - Markdown 内容
   * @param {string} filename - 文件名（不含扩展名）
   * @param {object} [options] - 导出选项
   */
  async function exportFile(markdown, filename, options = {}) {
    const blob = await markdownToXmindBlob(markdown, options);
    return {
      blob,
      filename: `${filename}.xmind`,
      mimeType: XMIND_MIME_TYPE,
    };
  }

  return { exportFile, markdownToXmindBlob, parseMarkdownToTree };
})();
