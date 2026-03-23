# 导出体积优化计划：参数优化 + 自适应缩放

## 改动范围
- `js/download.js` — BITMAP_EXPORT_OPTIONS 参数调整
- `png-export.js` — 新增 resolveRequestedScale() 自适应逻辑

## Step 1: download.js 参数调整
- `scale: 8` → `scale: 4`（默认值，自适应关闭时使用）
- `quality: 1` → `quality: 0.86`
- 新增 `adaptiveScale: true`
- 新增 `targetPixels: 30_000_000` (30MP)
- 新增 `adaptiveMinScale: 3.0` / `adaptiveMaxScale: 4.5`

## Step 2: png-export.js 新增 resolveRequestedScale()
位置：getSafeScale() 之后

```javascript
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resolveRequestedScale(exportBox, options = {}) {
  const {
    scale = 4,
    adaptiveScale = false,
    targetPixels = 30_000_000,
    adaptiveMinScale = 3.0,
    adaptiveMaxScale = 4.5,
  } = options;

  if (!adaptiveScale) return scale;

  const svgArea = exportBox.width * exportBox.height;
  if (!Number.isFinite(svgArea) || svgArea <= 0) return scale;

  return clamp(Math.sqrt(targetPixels / svgArea), adaptiveMinScale, adaptiveMaxScale);
}
```

## Step 3: svgToImageBlob() 集成自适应
- 用 resolveRequestedScale(exportBox, options) 替代直接读取 options.scale
- 返回结果增加 adaptiveScaleApplied 和 svgArea 信息

## 预期效果
- 小图(< 500px²): scale ≈ 4.5 → 极清晰
- 中图(~2000px²): scale ≈ 4 → 标准高清
- 大图(> 5000px²): scale ≈ 3.25 → 防 OOM，仍超 300dpi
- 体积：相比原始 scale=8+quality=1，减少 75-85%
