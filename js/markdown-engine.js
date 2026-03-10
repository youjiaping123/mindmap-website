/**
 * Markdown 局部操作引擎
 * 支持 5 种操作: expand, delete, rename, insert, replace
 */

/**
 * 解析 markdown 的每一行
 * @returns {{ level: number, text: string, raw: string }[]}
 */
function parseMarkdownLines(markdown) {
  return markdown.split('\n').map((raw) => {
    const match = raw.match(/^(#{1,6})\s+(.*)/);
    return match
      ? { level: match[1].length, text: match[2].trim(), raw }
      : { level: 0, text: raw.trim(), raw };
  });
}

/**
 * 找到目标节点的行索引（模糊匹配，忽略 emoji 和首尾空格）
 */
function findNodeIndex(lines, targetText) {
  const normalize = (s) =>
    s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, '').trim();
  const target = normalize(targetText);

  // 精确匹配
  let idx = lines.findIndex((l) => l.level > 0 && normalize(l.text) === target);
  if (idx !== -1) return idx;

  // 包含匹配
  idx = lines.findIndex((l) => l.level > 0 && normalize(l.text).includes(target));
  if (idx !== -1) return idx;

  // 反向包含
  idx = lines.findIndex((l) => l.level > 0 && target.includes(normalize(l.text)));
  return idx;
}

/**
 * 获取一个节点及其所有子节点的行范围 [start, end)
 */
function getNodeRange(lines, nodeIndex) {
  const nodeLevel = lines[nodeIndex].level;
  let end = nodeIndex + 1;
  while (end < lines.length) {
    if (lines[end].level > 0 && lines[end].level <= nodeLevel) break;
    end++;
  }
  return [nodeIndex, end];
}

/**
 * 调整 children 文本的层级：确保最小层级为 parentLevel + 1
 */
function adjustChildLevels(childrenStr, parentLevel) {
  const rawLines = childrenStr.split('\n').filter((l) => l.trim());

  let minLevel = Infinity;
  for (const line of rawLines) {
    const m = line.match(/^(#{1,6})\s/);
    if (m) minLevel = Math.min(minLevel, m[1].length);
  }

  if (minLevel === Infinity) {
    return rawLines.map((l) => '#'.repeat(parentLevel + 1) + ' ' + l.replace(/^#+\s*/, ''));
  }

  const offset = parentLevel + 1 - minLevel;
  return rawLines.map((line) => {
    const m = line.match(/^(#{1,6})\s+(.*)/);
    if (m) {
      const newLevel = Math.min(Math.max(m[1].length + offset, 1), 6);
      return '#'.repeat(newLevel) + ' ' + m[2];
    }
    return line;
  });
}

/** 解析一行文本为 parsed 对象 */
function parseLine(raw) {
  const m = raw.match(/^(#{1,6})\s+(.*)/);
  return m
    ? { level: m[1].length, text: m[2].trim(), raw }
    : { level: 0, text: raw.trim(), raw };
}

/**
 * 应用一组操作指令到 markdown，返回 { markdown, summary }
 */
function applyOperations(markdown, operations) {
  let lines = parseMarkdownLines(markdown);
  const appliedOps = [];

  for (const op of operations) {
    try {
      switch (op.op) {
        case 'expand': {
          const idx = findNodeIndex(lines, op.target);
          if (idx === -1) { appliedOps.push(`⚠️ 未找到节点「${op.target}」`); break; }
          const [, rangeEnd] = getNodeRange(lines, idx);
          const childLines = adjustChildLevels(op.children, lines[idx].level);
          lines.splice(rangeEnd, 0, ...childLines.map(parseLine));
          appliedOps.push(`✅ 展开了「${op.target}」`);
          break;
        }
        case 'delete': {
          const idx = findNodeIndex(lines, op.target);
          if (idx === -1) { appliedOps.push(`⚠️ 未找到节点「${op.target}」`); break; }
          const [start, end] = getNodeRange(lines, idx);
          lines.splice(start, end - start);
          appliedOps.push(`✅ 删除了「${op.target}」`);
          break;
        }
        case 'rename': {
          const idx = findNodeIndex(lines, op.target);
          if (idx === -1) { appliedOps.push(`⚠️ 未找到节点「${op.target}」`); break; }
          const prefix = '#'.repeat(lines[idx].level) + ' ';
          lines[idx] = { level: lines[idx].level, text: op.newName, raw: prefix + op.newName };
          appliedOps.push(`✅ 「${op.target}」→「${op.newName}」`);
          break;
        }
        case 'insert': {
          const idx = findNodeIndex(lines, op.target);
          if (idx === -1) { appliedOps.push(`⚠️ 未找到节点「${op.target}」`); break; }
          const [, rangeEnd] = getNodeRange(lines, idx);
          const newLines = op.content.split('\n').filter((l) => l.trim()).map(parseLine);
          lines.splice(rangeEnd, 0, ...newLines);
          appliedOps.push(`✅ 在「${op.target}」后插入了新节点`);
          break;
        }
        case 'replace': {
          const idx = findNodeIndex(lines, op.target);
          if (idx === -1) { appliedOps.push(`⚠️ 未找到节点「${op.target}」`); break; }
          const [start, end] = getNodeRange(lines, idx);
          const newLines = op.content.split('\n').filter((l) => l.trim()).map(parseLine);
          lines.splice(start, end - start, ...newLines);
          appliedOps.push(`✅ 替换了「${op.target}」`);
          break;
        }
        default:
          appliedOps.push(`⚠️ 未知操作: ${op.op}`);
      }
    } catch (e) {
      appliedOps.push(`❌ 操作失败: ${e.message}`);
    }
  }

  return {
    markdown: lines.map((l) => l.raw).join('\n'),
    summary: appliedOps,
  };
}
