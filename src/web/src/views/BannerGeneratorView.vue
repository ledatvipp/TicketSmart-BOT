<script setup>
import { ref, onMounted, watch } from 'vue';
import StButton from '../components/StButton.vue';
import Tabs from '../components/Tabs.vue';
import Switch from '../components/Switch.vue';
import { BannersAPI } from '../api/endpoints';
import { saveGeneratedBanner } from '../utils/generatedBannerCache';
import { isSupportedImageFile, normalizeImageUrl } from '../utils/safeContent';

const canvasRef = ref(null);
const rendering = ref(false);
const editTab = ref('template');
const customFontName = ref('');
const safeImage = (value) => normalizeImageUrl(value);

// Saved Banners state
const savedBanners = ref([]);
const showSaveModal = ref(false);
const saveName = ref('');
const savingBanner = ref(false);

const EDITOR_TABS = [
  { value: 'template', label: 'Mẫu & Nền', icon: 'image' },
  { value: 'title',    label: 'Chữ chính', icon: 'title' },
  { value: 'sub1',     label: 'Chữ phụ 1', icon: 'text_fields' },
  { value: 'sub2',     label: 'Chữ phụ 2', icon: 'text_fields' },
  { value: 'layout',    label: 'Bố cục & Hiệu ứng', icon: 'grid_view' },
];

const form = ref({
  bgSource: 'preset', // preset | upload
  customBgUrl: '',
  bgBlur: 0,
  bgBrightness: 100,
  bgContrast: 100,
  bgSaturation: 100,

  type: 'update', // update | bugfix | announcement
  version: 'v1.0.0',
  version2: '', // Second subtitle line
  offsetX: 0,
  offsetY: 0,
  verticalSpacing: 70, // Space between title and subtitle 1
  verticalSpacing2: 45, // Space between subtitle 1 and subtitle 2
  
  // Title Settings
  customTitle: '',
  titleFontSize: 64,
  titleFont: 'Rubik Mono One',
  titleColorMode: 'custom', // custom (solid) | gradient
  titleColor: '#8b5cf6',
  titleColor1: '#8b5cf6', // Gradient start
  titleColor2: '#d946ef', // Gradient end
  titleGradientAngle: 0,
  titleBold: true,
  titleItalic: false,
  titleUppercase: true,
  titleLetterSpacing: 0,
  titleAlign: 'center', // left | center | right
  titleScaleX: 1.0,
  titleSkewX: 0.0,
  titleRotate: 0,
  
  titleOutline: false,
  titleOutlineColor: '#000000',
  titleOutlineWidth: 6,
  
  titleGlow: true,
  titleGlowColor: '', // if empty, uses title color
  titleGlowBlur: 20,
  titleGlowOffsetX: 0,
  titleGlowOffsetY: 0,

  // Subtitle 1 Settings
  subFont: 'Montserrat',
  subFontSize: 24,
  subColorMode: 'solid', // solid | gradient
  subColor: '#ffffff',
  subColor1: '#ffffff',
  subColor2: '#94a3b8',
  subGradientAngle: 0,
  subBold: true,
  subItalic: false,
  subUppercase: false,
  subLetterSpacing: 2,
  subRotate: 0,
  subOutline: false,
  subOutlineColor: '#000000',
  subOutlineWidth: 4,
  subGlow: false,
  subGlowColor: '#ffffff',
  subGlowBlur: 10,

  // Subtitle 2 Settings
  sub2Font: 'Montserrat',
  sub2FontSize: 18,
  sub2ColorMode: 'solid', // solid | gradient
  sub2Color: '#94a3b8',
  sub2Color1: '#94a3b8',
  sub2Color2: '#64748b',
  sub2GradientAngle: 0,
  sub2Bold: false,
  sub2Italic: true,
  sub2Uppercase: false,
  sub2LetterSpacing: 1,
  sub2Rotate: 0,
  sub2Outline: false,
  sub2OutlineColor: '#000000',
  sub2OutlineWidth: 3,
  sub2Glow: false,
  sub2GlowColor: '#94a3b8',
  sub2GlowBlur: 8,

  // Overlays
  overlayVignette: false,
  overlayScanlines: false,
  overlayScanlinesOpacity: 0.15,
  overlayNoise: false,
  overlayNoiseOpacity: 0.08,
});

const backgrounds = {
  update: '/assets/ticket_template.png',
  bugfix: '/assets/ticket_template.png',
  announcement: '/assets/ticket_template.png',
};

const defaultColors = {
  update: '#8b5cf6', // Violet
  bugfix: '#ef4444', // Red
  announcement: '#38bdf8', // Sky Blue
};

const fontOptions = ref([
  { value: 'Rubik Mono One', label: 'Rubik Mono One (Chunky Block)' },
  { value: 'Silkscreen', label: 'Silkscreen (Pixel Bold)' },
  { value: 'Press Start 2P', label: 'Press Start 2P (NES Pixel)' },
  { value: 'VT323', label: 'VT323 (Retro Pixel Thin)' },
  { value: 'Anton', label: 'Anton (Impact Tall)' },
  { value: 'Teko', label: 'Teko (Esports Bold)' },
  { value: 'Syncopate', label: 'Syncopate (Futuristic Wide)' },
  { value: 'Orbitron', label: 'Orbitron (High-Tech Sci-Fi)' },
  { value: 'Oswald', label: 'Oswald (Clean Condensed)' },
  { value: 'Playfair Display', label: 'Playfair Display (Serif Elegance)' },
  { value: 'Outfit', label: 'Outfit (Modern Geometric)' },
  { value: 'Inter', label: 'Inter (Minimalist Sans)' },
  { value: 'Bangers', label: 'Bangers (Comic Book)' },
  { value: 'Permanent Marker', label: 'Permanent Marker (Brush)' },
  { value: 'Montserrat', label: 'Montserrat (Geometric Clean)' },
  { value: 'Cinzel', label: 'Cinzel (RPG Fantasy)' },
  { value: 'Cinzel Decorative', label: 'Cinzel Dec (Mystic)' },
  { value: 'Fascinate Inline', label: 'Fascinate (Inline)' },
  { value: 'Luckiest Guy', label: 'Luckiest Guy (Playful Bubble)' },
  { value: 'Lobster', label: 'Lobster (Retro Script)' },
  { value: 'Graduate', label: 'Graduate (College Block)' },
  { value: 'Creepster', label: 'Creepster (Spooky Monster)' },
]);

const colorPresets = [
  { hex: '#8b5cf6', label: 'Violet' },
  { hex: '#ef4444', label: 'Red' },
  { hex: '#38bdf8', label: 'Sky Blue' },
  { hex: '#10b981', label: 'Green' },
  { hex: '#eab308', label: 'Gold' },
  { hex: '#f43f5e', label: 'Rose' },
  { hex: '#ffffff', label: 'White' },
];

const gradientPresets = [
  { name: 'Sunset Neon', c1: '#f43f5e', c2: '#fb923c' },
  { name: 'Ocean Cyan', c1: '#06b6d4', c2: '#3b82f6' },
  { name: 'Cyber Purple', c1: '#a855f7', c2: '#ec4899' },
  { name: 'Aurora Emerald', c1: '#10b981', c2: '#3b82f6' },
  { name: 'Gold Sunset', c1: '#eab308', c2: '#f97316' },
];

function getActiveTitleColor() {
  return form.value.titleColor;
}

function getActiveTitleGlow() {
  if (form.value.titleGlowColor) {
    return form.value.titleGlowColor;
  }
  if (form.value.titleColorMode === 'gradient') {
    return form.value.titleColor1;
  }
  return getActiveTitleColor();
}

/**
 * Draws a stylized text layer onto the canvas with transforms (rotate, skew, scaleX) and custom linear gradient angles.
 */
function drawTextLayer(ctx, {
  text,
  font,
  fontSize,
  bold,
  italic,
  uppercase,
  letterSpacing,
  colorMode,
  color,
  color1,
  color2,
  gradientAngle,
  alignX,
  alignY,
  align,
  rotate,
  scaleX = 1.0,
  skewX = 0.0,
  outline,
  outlineColor,
  outlineWidth,
  glow,
  glowColor,
  glowBlur,
  glowOffsetX = 0,
  glowOffsetY = 0,
}) {
  if (!text) return;
  let renderText = text;
  if (uppercase) renderText = renderText.toUpperCase();

  ctx.save();
  
  // 1. Move origin to anchor point
  ctx.translate(alignX, alignY);

  // 2. Rotate
  if (rotate) {
    ctx.rotate((rotate * Math.PI) / 180);
  }

  // 3. Scale and Skew
  ctx.transform(scaleX, 0, skewX, 1, 0, 0);

  // 4. Alignments
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  // 5. Font setting
  let styleStr = '';
  if (italic) styleStr += 'italic ';
  if (bold) styleStr += 'bold ';
  ctx.font = `${styleStr}${fontSize}px "${font}", sans-serif`;
  ctx.letterSpacing = `${letterSpacing}px`;

  // Measure text width in local transformed space
  const textWidth = ctx.measureText(renderText).width;

  // 6. Fill gradient vs solid
  if (colorMode === 'gradient') {
    let startX = 0;
    let endX = 0;
    
    if (align === 'center') {
      startX = -textWidth / 2;
      endX = textWidth / 2;
    } else if (align === 'left') {
      startX = 0;
      endX = textWidth;
    } else if (align === 'right') {
      startX = -textWidth;
      endX = 0;
    }
    
    const angleRad = ((gradientAngle || 0) * Math.PI) / 180;
    const centerX = (startX + endX) / 2;
    const centerY = 0;
    const r = textWidth / 2;
    
    const gradStartX = centerX - r * Math.cos(angleRad);
    const gradStartY = centerY - (fontSize / 2) * Math.sin(angleRad);
    const gradEndX = centerX + r * Math.cos(angleRad);
    const gradEndY = centerY + (fontSize / 2) * Math.sin(angleRad);
    
    const grad = ctx.createLinearGradient(gradStartX, gradStartY, gradEndX, gradEndY);
    grad.addColorStop(0, color1 || '#ffffff');
    grad.addColorStop(1, color2 || '#94a3b8');
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = color;
  }

  // 7. Glow / Drop shadow
  if (glow) {
    ctx.shadowColor = glowColor || (colorMode === 'gradient' ? color1 : color);
    ctx.shadowBlur = glowBlur;
    ctx.shadowOffsetX = glowOffsetX;
    ctx.shadowOffsetY = glowOffsetY;
  } else {
    ctx.shadowBlur = 0;
  }

  // 8. Outline stroke (draw outline first so it goes behind the fill)
  if (outline) {
    ctx.save();
    ctx.shadowBlur = 0; // Don't glow the outline
    ctx.strokeStyle = outlineColor || '#000000';
    ctx.lineWidth = outlineWidth;
    ctx.lineJoin = 'round';
    ctx.strokeText(renderText, 0, 0);
    ctx.restore();
  }

  // 9. Fill text
  ctx.fillText(renderText, 0, 0);

  ctx.restore();
}

function render() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  rendering.value = true;

  const bg = new Image();
  bg.crossOrigin = 'anonymous';

  if (form.value.bgSource === 'upload' && safeImage(form.value.customBgUrl)) {
    bg.src = safeImage(form.value.customBgUrl);
  } else {
    bg.src = backgrounds[form.value.type];
  }

  bg.onload = () => {
    ctx.clearRect(0, 0, width, height);
    
    // Draw background template image with adjustment filters
    ctx.save();
    const filters = [];
    if (form.value.bgBlur) filters.push(`blur(${form.value.bgBlur}px)`);
    if (form.value.bgBrightness !== 100) filters.push(`brightness(${form.value.bgBrightness}%)`);
    if (form.value.bgContrast !== 100) filters.push(`contrast(${form.value.bgContrast}%)`);
    if (form.value.bgSaturation !== 100) filters.push(`saturate(${form.value.bgSaturation}%)`);
    
    if (filters.length > 0) {
      ctx.filter = filters.join(' ');
    }
    ctx.drawImage(bg, 0, 0, width, height);
    ctx.restore();

    // Draw Overlays (under the text for maximum text readability)
    
    // Vignette
    if (form.value.overlayVignette) {
      ctx.save();
      const grad = ctx.createRadialGradient(
        width / 2, height / 2, width / 4,
        width / 2, height / 2, width / 1.8
      );
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    // CRT Scanlines
    if (form.value.overlayScanlines) {
      ctx.save();
      ctx.strokeStyle = `rgba(0, 0, 0, ${form.value.overlayScanlinesOpacity})`;
      ctx.lineWidth = 1;
      for (let y = 0; y < height; y += 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Noise Grain
    if (form.value.overlayNoise) {
      ctx.save();
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;
      const opacity = form.value.overlayNoiseOpacity;
      for (let i = 0; i < data.length; i += 4) {
        const val = (Math.random() - 0.5) * 255 * opacity;
        data[i] = Math.min(255, Math.max(0, data[i] + val));
        data[i+1] = Math.min(255, Math.max(0, data[i+1] + val));
        data[i+2] = Math.min(255, Math.max(0, data[i+2] + val));
      }
      ctx.putImageData(imgData, 0, 0);
      ctx.restore();
    }

    // Calculate base alignment coordinates
    const baseX = 725 + (Number(form.value.offsetX) || 0);
    const baseY = 170.5 + (Number(form.value.offsetY) || 0);

    let alignX = baseX;
    if (form.value.titleAlign === 'left') {
      alignX = 470 + (Number(form.value.offsetX) || 0);
    } else if (form.value.titleAlign === 'right') {
      alignX = 980 + (Number(form.value.offsetX) || 0);
    }

    const titleColor = getActiveTitleColor();
    const titleGlow = getActiveTitleGlow();

    // Calculate vertical coordinates based on lines present
    let titleY = baseY;
    let sub1Y = baseY;
    let sub2Y = baseY;

    if (form.value.version && form.value.version2) {
      const totalSpan = Number(form.value.verticalSpacing) + Number(form.value.verticalSpacing2);
      titleY = baseY - (totalSpan / 2);
      sub1Y = titleY + Number(form.value.verticalSpacing);
      sub2Y = sub1Y + Number(form.value.verticalSpacing2);
    } else if (form.value.version) {
      titleY = baseY - (Number(form.value.verticalSpacing) / 2);
      sub1Y = baseY + (Number(form.value.verticalSpacing) / 2);
    }

    // 1. Draw Title
    let titleText = form.value.customTitle.trim() || 
      (form.value.type === 'update' ? 'UPDATE' : form.value.type === 'bugfix' ? 'BUG FIX' : 'THÔNG BÁO');

    drawTextLayer(ctx, {
      text: titleText,
      font: form.value.titleFont,
      fontSize: form.value.titleFontSize,
      bold: form.value.titleBold,
      italic: form.value.titleItalic,
      uppercase: form.value.titleUppercase,
      letterSpacing: form.value.titleLetterSpacing,
      colorMode: form.value.titleColorMode,
      color: form.value.titleColor,
      color1: form.value.titleColor1,
      color2: form.value.titleColor2,
      gradientAngle: form.value.titleGradientAngle,
      alignX: alignX,
      alignY: titleY,
      align: form.value.titleAlign,
      rotate: form.value.titleRotate,
      scaleX: form.value.titleScaleX,
      skewX: form.value.titleSkewX,
      outline: form.value.titleOutline,
      outlineColor: form.value.titleOutlineColor,
      outlineWidth: form.value.titleOutlineWidth,
      glow: form.value.titleGlow,
      glowColor: form.value.titleGlowColor,
      glowBlur: form.value.titleGlowBlur,
      glowOffsetX: form.value.titleGlowOffsetX,
      glowOffsetY: form.value.titleGlowOffsetY,
    });

    // 2. Draw Subtitle / Version 1
    if (form.value.version) {
      drawTextLayer(ctx, {
        text: form.value.version,
        font: form.value.subFont,
        fontSize: form.value.subFontSize,
        bold: form.value.subBold,
        italic: form.value.subItalic,
        uppercase: form.value.subUppercase,
        letterSpacing: form.value.subLetterSpacing,
        colorMode: form.value.subColorMode,
        color: form.value.subColor,
        color1: form.value.subColor1,
        color2: form.value.subColor2,
        gradientAngle: form.value.subGradientAngle,
        alignX: alignX,
        alignY: sub1Y,
        align: form.value.titleAlign,
        rotate: form.value.subRotate,
        outline: form.value.subOutline,
        outlineColor: form.value.subOutlineColor,
        outlineWidth: form.value.subOutlineWidth,
        glow: form.value.subGlow,
        glowColor: form.value.subGlowColor,
        glowBlur: form.value.subGlowBlur,
      });
    }

    // 3. Draw Subtitle 2 / Version 2
    if (form.value.version && form.value.version2) {
      drawTextLayer(ctx, {
        text: form.value.version2,
        font: form.value.sub2Font,
        fontSize: form.value.sub2FontSize,
        bold: form.value.sub2Bold,
        italic: form.value.sub2Italic,
        uppercase: form.value.sub2Uppercase,
        letterSpacing: form.value.sub2LetterSpacing,
        colorMode: form.value.sub2ColorMode,
        color: form.value.sub2Color,
        color1: form.value.sub2Color1,
        color2: form.value.sub2Color2,
        gradientAngle: form.value.sub2GradientAngle,
        alignX: alignX,
        alignY: sub2Y,
        align: form.value.titleAlign,
        rotate: form.value.sub2Rotate,
        outline: form.value.sub2Outline,
        outlineColor: form.value.sub2OutlineColor,
        outlineWidth: form.value.sub2OutlineWidth,
        glow: form.value.sub2Glow,
        glowColor: form.value.sub2GlowColor,
        glowBlur: form.value.sub2GlowBlur,
      });
    }

    rendering.value = false;
    saveGeneratedBanner(canvas.toDataURL('image/png')).catch((error) => {
      console.warn('Failed to cache generated banner:', error);
    });
  };

  bg.onerror = () => {
    rendering.value = false;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, width, height);
    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('Không thể nạp hình nền. Thử lại sau!', width / 2, height / 2);
  };
}

function download() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const type = form.value.type;
  const version = form.value.version || 'ticket';
  
  const a = document.createElement('a');
  a.download = `is7mc-${type}-${version}.png`.toLowerCase();
  a.href = canvas.toDataURL('image/png');
  a.click();
}

function resetOffsets() {
  form.value.offsetX = 0;
  form.value.offsetY = 0;
}

/**
 * Handles custom TTF/OTF font file uploads.
 */
function handleFontUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const arrayBuffer = e.target.result;
    const fontName = 'custom_' + Date.now();

    try {
      const fontFace = new FontFace(fontName, arrayBuffer);
      await fontFace.load();
      document.fonts.add(fontFace);

      customFontName.value = file.name;

      // Add to font list dynamically
      fontOptions.value.unshift({
        value: fontName,
        label: `📁 Font của bạn: ${file.name}`
      });

      // Apply to title font
      form.value.titleFont = fontName;

      render();
    } catch (err) {
      console.error(err);
      alert('Không thể nạp file font. Vui lòng sử dụng file định dạng .ttf hoặc .otf hợp lệ.');
    }
  };
  reader.readAsArrayBuffer(file);
}

/**
 * Handles custom background image upload
 */
function handleBgUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    form.value.customBgUrl = e.target.result;
    form.value.bgSource = 'upload';
    render();
  };
  reader.readAsDataURL(file);
}

// Reset custom title color to match the default of selected announcement type
function resetTitleColor() {
  form.value.titleColor = defaultColors[form.value.type];
}

// API: Save Banner to Database Gallery
async function handleSaveBanner() {
  if (!saveName.value.trim()) {
    alert('Vui lòng nhập tên cho mẫu thiết kế');
    return;
  }

  const canvas = canvasRef.value;
  if (!canvas) return;

  savingBanner.value = true;
  try {
    await BannersAPI.create({
      name: saveName.value.trim(),
      image: canvas.toDataURL('image/png'),
      config: form.value,
    });
    alert('Đã lưu thiết kế vào thư viện thành công!');
    showSaveModal.value = false;
    saveName.value = '';
    loadSavedBanners();
  } catch (err) {
    console.error(err);
    alert('Có lỗi xảy ra khi lưu mẫu thiết kế: ' + (err.response?.data?.message || err.message));
  } finally {
    savingBanner.value = false;
  }
}

// API: Load saved banners list
async function loadSavedBanners() {
  try {
    const data = await BannersAPI.list();
    savedBanners.value = data.map((banner) => ({ ...banner, safeImageUrl: normalizeImageUrl(banner.imageUrl, { allowData: false, allowBlob: false }) })).filter((banner) => banner.safeImageUrl);
  } catch (err) {
    console.error('Failed to load saved designs:', err);
  }
}

// API: Load config of saved banner back to editor
function loadSavedConfig(b) {
  try {
    const config = typeof b.config === 'string' ? JSON.parse(b.config) : b.config;
    // Restore form values
    form.value = { ...form.value, ...config };
    render();
    alert(`Đã mở lại mẫu thiết kế "${b.name}"`);
  } catch (err) {
    console.error('Failed to load config:', err);
    alert('Không thể mở lại mẫu thiết kế này.');
  }
}

// API: Delete banner
async function handleDeleteBanner(b) {
  if (!confirm(`Bạn có chắc chắn muốn xóa mẫu thiết kế "${b.name}"?`)) return;
  try {
    await BannersAPI.remove(b.id);
    loadSavedBanners();
  } catch (err) {
    console.error(err);
    alert('Không thể xóa mẫu thiết kế: ' + (err.response?.data?.message || err.message));
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert('Đã sao chép đường dẫn ảnh vào bộ nhớ tạm!');
  }).catch(() => {
    alert('Không thể tự động sao chép. Bạn hãy bôi đen và copy thủ công.');
  });
}

onMounted(() => {
  resetTitleColor();
  loadSavedBanners();
  
  if (typeof document !== 'undefined' && document.fonts) {
    // Make sure premium fonts are loaded before drawing
    Promise.all(fontOptions.value.map(opt => document.fonts.load(`16px "${opt.value}"`)))
      .then(() => render())
      .catch(() => render());
  } else {
    render();
  }
});

// Auto render when any form variable changes
watch(() => form.value, () => {
  render();
}, { deep: true });

// Sync colors if type changes
watch(() => form.value.type, () => {
  resetTitleColor();
});
</script>

<template>
  <div class="page-header">
    <div>
      <p class="eyebrow">Visual Generator</p>
      <h1 class="page-title">Tạo ảnh thông báo</h1>
      <p class="page-sub">Tùy chỉnh ảnh banner thông báo/update với thiết kế cá nóc và bộ công cụ chỉnh chữ cực hạn.</p>
    </div>
    <div class="flex gap-2">
      <StButton variant="ghost" @click="render">
        <span class="material-symbols-outlined symbol-sm">refresh</span> Làm mới
      </StButton>
      <StButton variant="secondary" @click="showSaveModal = true">
        <span class="material-symbols-outlined symbol-sm">bookmark</span> Lưu mẫu thiết kế
      </StButton>
      <StButton variant="primary" @click="download">
        <span class="material-symbols-outlined symbol-sm">download</span> Tải ảnh xuống
      </StButton>
    </div>
  </div>

  <div class="generator-grid">
    <!-- LEFT: EDITOR PANEL -->
    <section class="card editor-card">
      <Tabs v-model="editTab" :tabs="EDITOR_TABS" style="margin-bottom: 20px;" />

      <!-- TAB 1: TEMPLATE & BACKGROUND -->
      <div v-if="editTab === 'template'">
        <div class="form-row">
          <label>Nguồn ảnh nền (Background)</label>
          <div class="mode-tabs">
            <button 
              type="button" 
              :class="{ active: form.bgSource === 'preset' }" 
              @click="form.bgSource = 'preset'; render();"
              class="mode-tab-btn"
            >
              Cá nóc mặc định
            </button>
            <button 
              type="button" 
              :class="{ active: form.bgSource === 'upload' }" 
              @click="form.bgSource = 'upload'; render();"
              class="mode-tab-btn"
            >
              Ảnh tải lên của bạn
            </button>
          </div>
        </div>

        <!-- Preset Background Selector -->
        <div v-if="form.bgSource === 'preset'" class="form-row">
          <label>Loại thông báo (Định dạng màu chữ mẫu)</label>
          <select v-model="form.type">
            <option value="update">🚀 UPDATE (Màu Tím)</option>
            <option value="bugfix">🐛 BUG FIX (Màu Đỏ)</option>
            <option value="announcement">📢 ANNOUNCEMENT (Màu Xanh Sky)</option>
          </select>
        </div>

        <!-- Upload Custom Background Image Box -->
        <div v-else class="form-row">
          <label>Tải lên ảnh nền tùy chỉnh (Kích thước khuyên dùng: 1024x341)</label>
          <label class="custom-bg-upload-box" :class="{ 'has-bg': form.customBgUrl }">
            <span v-if="!form.customBgUrl" class="material-symbols-outlined upload-icon">add_photo_alternate</span>
            <span v-if="!form.customBgUrl" class="upload-text">Chọn ảnh từ máy tính</span>
            <img v-else :src="safeImage(form.customBgUrl)" class="bg-thumb-preview" />
            <div v-if="form.customBgUrl" class="bg-change-overlay">
              <span class="material-symbols-outlined">autorenew</span>
              <span>Thay đổi ảnh nền</span>
            </div>
            <input type="file" accept="image/*" @change="handleBgUpload" style="display: none;" />
          </label>
        </div>

        <!-- Background Image Adjustment Filters -->
        <h4 class="section-title">Bộ lọc ảnh nền (Filters)</h4>
        
        <div class="form-row">
          <label>Làm mờ nền (Blur): {{ form.bgBlur }}px</label>
          <input type="range" v-model.number="form.bgBlur" min="0" max="25" step="1" class="slider" />
        </div>

        <div class="grid-2">
          <div class="form-row">
            <label>Độ sáng (Brightness): {{ form.bgBrightness }}%</label>
            <input type="range" v-model.number="form.bgBrightness" min="20" max="180" step="5" class="slider" />
          </div>
          <div class="form-row">
            <label>Độ tương phản: {{ form.bgContrast }}%</label>
            <input type="range" v-model.number="form.bgContrast" min="40" max="160" step="5" class="slider" />
          </div>
        </div>

        <div class="form-row">
          <label>Độ bão hòa màu: {{ form.bgSaturation }}%</label>
          <input type="range" v-model.number="form.bgSaturation" min="0" max="200" step="5" class="slider" />
        </div>

        <!-- Overlays (Vignette, Scanlines, Noise) -->
        <h4 class="section-title">Hiệu ứng phủ (Canvas Overlays)</h4>
        <div class="form-row space-y-3">
          <div class="flex items-center justify-between">
            <Switch v-model="form.overlayVignette">Làm tối góc ảnh (Vignette)</Switch>
          </div>
          
          <div class="flex items-center justify-between">
            <Switch v-model="form.overlayScanlines">Đường quét tivi cổ (Scanlines)</Switch>
            <div v-if="form.overlayScanlines" class="flex items-center gap-2">
              <span class="text-xs muted">Độ rõ:</span>
              <input type="range" v-model.number="form.overlayScanlinesOpacity" min="0.05" max="0.6" step="0.05" style="width: 80px;" />
            </div>
          </div>

          <div class="flex items-center justify-between">
            <Switch v-model="form.overlayNoise">Hạt cát phim cổ (Film Grain/Noise)</Switch>
            <div v-if="form.overlayNoise" class="flex items-center gap-2">
              <span class="text-xs muted">Độ rõ:</span>
              <input type="range" v-model.number="form.overlayNoiseOpacity" min="0.02" max="0.3" step="0.02" style="width: 80px;" />
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 2: MAIN TITLE SETTINGS (COLOR SELECTOR IS FULLY VISIBLE HERE NOW) -->
      <div v-if="editTab === 'title'">
        <div class="form-row">
          <label>Nội dung tiêu đề chính</label>
          <input v-model="form.customTitle" :placeholder="form.type === 'update' ? 'UPDATE' : form.type === 'bugfix' ? 'BUG FIX' : 'THÔNG BÁO'" />
        </div>

        <div class="form-row">
          <label>Phông chữ (Font Family)</label>
          <div class="flex" style="gap: 8px;">
            <select v-model="form.titleFont" style="flex: 1;">
              <option v-for="font in fontOptions" :key="font.value" :value="font.value">
                {{ font.label }}
              </option>
            </select>
            <label class="upload-font-btn" title="Tải font chữ riêng lên (.ttf, .otf)">
              <span class="material-symbols-outlined">upload_file</span>
              <input type="file" accept=".ttf,.otf" @change="handleFontUpload" style="display: none;" />
            </label>
          </div>
          <div v-if="customFontName" class="muted text-xs font-upload-success">
            📁 Đang sử dụng phông chữ của bạn: {{ customFontName }}
          </div>
        </div>

        <!-- COLOR SELECTOR TAB INSIDE TITLE SETTINGS -->
        <div class="form-row">
          <label>Màu sắc chữ chính (Color & Fill)</label>
          <div class="color-picker-container">
            <div class="mode-tabs">
              <button 
                type="button" 
                :class="{ active: form.titleColorMode !== 'gradient' }" 
                @click="form.titleColorMode = 'custom'"
                class="mode-tab-btn"
              >
                Màu đơn (Solid)
              </button>
              <button 
                type="button" 
                :class="{ active: form.titleColorMode === 'gradient' }" 
                @click="form.titleColorMode = 'gradient'"
                class="mode-tab-btn"
              >
                Màu chuyển (Gradient)
              </button>
            </div>

            <!-- Solid controls -->
            <div v-if="form.titleColorMode !== 'gradient'" class="color-control-block">
              <input type="color" v-model="form.titleColor" class="color-picker-input" />
              <div class="color-presets">
                <button 
                  v-for="preset in colorPresets" 
                  :key="preset.hex"
                  type="button"
                  class="preset-bubble"
                  :style="{ backgroundColor: preset.hex }"
                  :class="{ active: form.titleColor === preset.hex }"
                  @click="form.titleColor = preset.hex; form.titleColorMode = 'custom';"
                  :title="preset.label"
                ></button>
              </div>
            </div>

            <!-- Gradient controls -->
            <div v-else class="gradient-control-block">
              <div class="flex gap-2 items-center">
                <input type="color" v-model="form.titleColor1" class="color-picker-input" title="Bắt đầu" />
                <span class="muted text-xs">→</span>
                <input type="color" v-model="form.titleColor2" class="color-picker-input" title="Kết thúc" />
                <div class="flex-1">
                  <div class="text-xs muted flex justify-between">Góc: <span>{{ form.titleGradientAngle }}°</span></div>
                  <input type="range" v-model.number="form.titleGradientAngle" min="0" max="360" class="slider" />
                </div>
              </div>
              <div class="gradient-presets">
                <button 
                  v-for="preset in gradientPresets" 
                  :key="preset.name"
                  type="button"
                  class="preset-gradient-bubble"
                  :style="{ background: `linear-gradient(135deg, ${preset.c1}, ${preset.c2})` }"
                  @click="form.titleColor1 = preset.c1; form.titleColor2 = preset.c2;"
                  :title="preset.name"
                ></button>
              </div>
            </div>
          </div>
        </div>

        <div class="grid-2">
          <div class="form-row">
            <label>Kích cỡ chữ: {{ form.titleFontSize }}px</label>
            <input type="range" v-model.number="form.titleFontSize" min="15" max="150" step="1" class="slider" />
          </div>
          <div class="form-row">
            <label>Khoảng cách chữ: {{ form.titleLetterSpacing }}px</label>
            <input type="range" v-model.number="form.titleLetterSpacing" min="-10" max="35" step="1" class="slider" />
          </div>
        </div>

        <div class="form-row">
          <label>Định dạng chữ chính</label>
          <div class="flex gap-4 style-toggles">
            <Switch v-model="form.titleBold">In đậm</Switch>
            <Switch v-model="form.titleItalic">In nghiêng</Switch>
            <Switch v-model="form.titleUppercase">Viết hoa</Switch>
          </div>
        </div>

        <!-- TRANSFORMS (TILT, SKEW, STRETCH) -->
        <h4 class="section-title">Biến dạng nâng cao (Transforms)</h4>
        <div class="grid-3">
          <div class="form-row">
            <label class="text-xs">Xoay chữ (Tilt): {{ form.titleRotate }}°</label>
            <input type="range" v-model.number="form.titleRotate" min="-30" max="30" step="1" class="slider" />
          </div>
          <div class="form-row">
            <label class="text-xs">Giãn chữ (Scale X): {{ form.titleScaleX }}x</label>
            <input type="range" v-model.number="form.titleScaleX" min="0.5" max="2.0" step="0.05" class="slider" />
          </div>
          <div class="form-row">
            <label class="text-xs">Nghiêng chữ (Skew X): {{ form.titleSkewX }}</label>
            <input type="range" v-model.number="form.titleSkewX" min="-0.8" max="0.8" step="0.05" class="slider" />
          </div>
        </div>

        <!-- GLOW & OUTLINE -->
        <h4 class="section-title">Hiệu ứng chữ (Glow & Outline)</h4>
        
        <!-- Glow -->
        <div class="form-row">
          <div class="flex items-center justify-between">
            <Switch v-model="form.titleGlow">Phát sáng (Neon Glow)</Switch>
            <input 
              v-if="form.titleGlow" 
              type="color" 
              v-model="form.titleGlowColor" 
              title="Màu sắc phát sáng (để trống = tự lấy màu chữ)"
              class="glow-color-pick"
            />
          </div>
          <div v-if="form.titleGlow" class="grid-3 glow-sub-grid" style="margin-top: 10px;">
            <div class="form-row">
              <label class="text-xs">Độ nhòe (Blur): {{ form.titleGlowBlur }}px</label>
              <input type="range" v-model.number="form.titleGlowBlur" min="2" max="60" class="slider" />
            </div>
            <div class="form-row">
              <label class="text-xs">Lệch X: {{ form.titleGlowOffsetX }}px</label>
              <input type="range" v-model.number="form.titleGlowOffsetX" min="-15" max="15" class="slider" />
            </div>
            <div class="form-row">
              <label class="text-xs">Lệch Y: {{ form.titleGlowOffsetY }}px</label>
              <input type="range" v-model.number="form.titleGlowOffsetY" min="-15" max="15" class="slider" />
            </div>
          </div>
        </div>

        <!-- Outline -->
        <div class="form-row" style="margin-top: 12px;">
          <div class="flex items-center justify-between">
            <Switch v-model="form.titleOutline">Nét viền chữ (Stroke Outline)</Switch>
            <input 
              v-if="form.titleOutline" 
              type="color" 
              v-model="form.titleOutlineColor" 
              class="glow-color-pick"
            />
          </div>
          <div v-if="form.titleOutline" class="form-row" style="margin-top: 10px;">
            <label class="text-xs">Độ dày nét viền: {{ form.titleOutlineWidth }}px</label>
            <input type="range" v-model.number="form.titleOutlineWidth" min="1" max="18" class="slider" />
          </div>
        </div>
      </div>

      <!-- TAB 3: SUBTITLE 1 SETTINGS -->
      <div v-if="editTab === 'sub1'">
        <div class="form-row">
          <label>Nội dung dòng chữ phụ 1 (Ví dụ: Version)</label>
          <input v-model="form.version" placeholder="v1.0.0 hoặc Cập nhật rất lớn" />
        </div>

        <div class="form-row">
          <label>Phông chữ</label>
          <select v-model="form.subFont">
            <option v-for="font in fontOptions" :key="font.value" :value="font.value">
              {{ font.label }}
            </option>
          </select>
        </div>

        <div class="form-row">
          <label>Màu sắc (Color & Fill)</label>
          <div class="color-picker-container">
            <div class="mode-tabs">
              <button 
                type="button" 
                :class="{ active: form.subColorMode !== 'gradient' }" 
                @click="form.subColorMode = 'solid'"
                class="mode-tab-btn"
              >
                Màu đơn (Solid)
              </button>
              <button 
                type="button" 
                :class="{ active: form.subColorMode === 'gradient' }" 
                @click="form.subColorMode = 'gradient'"
                class="mode-tab-btn"
              >
                Màu chuyển (Gradient)
              </button>
            </div>
            
            <div v-if="form.subColorMode !== 'gradient'" class="color-control-block">
              <input type="color" v-model="form.subColor" class="color-picker-input" />
              <div class="color-presets">
                <button 
                  v-for="preset in colorPresets" 
                  :key="preset.hex"
                  type="button"
                  class="preset-bubble"
                  :style="{ backgroundColor: preset.hex }"
                  :class="{ active: form.subColor === preset.hex }"
                  @click="form.subColor = preset.hex; form.subColorMode = 'solid';"
                ></button>
              </div>
            </div>

            <div v-else class="gradient-control-block">
              <div class="flex gap-2 items-center">
                <input type="color" v-model="form.subColor1" class="color-picker-input" />
                <span class="muted text-xs">→</span>
                <input type="color" v-model="form.subColor2" class="color-picker-input" />
                <div class="flex-1">
                  <div class="text-xs muted flex justify-between">Góc: <span>{{ form.subGradientAngle }}°</span></div>
                  <input type="range" v-model.number="form.subGradientAngle" min="0" max="360" class="slider" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="grid-3">
          <div class="form-row">
            <label class="text-xs">Kích cỡ: {{ form.subFontSize }}px</label>
            <input type="number" v-model.number="form.subFontSize" min="8" max="90" />
          </div>
          <div class="form-row">
            <label class="text-xs font-mono">Spacing (px)</label>
            <input type="number" v-model.number="form.subLetterSpacing" min="-5" max="25" />
          </div>
          <div class="form-row">
            <label class="text-xs">Xoay nghiêng: {{ form.subRotate }}°</label>
            <input type="range" v-model.number="form.subRotate" min="-30" max="30" class="slider" />
          </div>
        </div>

        <div class="form-row">
          <label>Định dạng</label>
          <div class="flex gap-4 style-toggles">
            <Switch v-model="form.subBold">In đậm</Switch>
            <Switch v-model="form.subItalic">In nghiêng</Switch>
            <Switch v-model="form.subUppercase">Viết hoa</Switch>
          </div>
        </div>

        <!-- Glow & Outline for Sub 1 -->
        <h4 class="section-title">Nâng cao cho chữ phụ 1</h4>
        <div class="form-row">
          <div class="flex items-center justify-between">
            <Switch v-model="form.subGlow">Phát sáng (Glow)</Switch>
            <input v-if="form.subGlow" type="color" v-model="form.subGlowColor" class="glow-color-pick" />
          </div>
        </div>
        <div class="form-row" style="margin-top: 10px;">
          <div class="flex items-center justify-between">
            <Switch v-model="form.subOutline">Nét viền (Outline)</Switch>
            <input v-if="form.subOutline" type="color" v-model="form.subOutlineColor" class="glow-color-pick" />
          </div>
          <div v-if="form.subOutline" style="margin-top: 6px;">
            <label class="text-xs">Độ dày viền: {{ form.subOutlineWidth }}px</label>
            <input type="range" v-model.number="form.subOutlineWidth" min="1" max="12" class="slider" />
          </div>
        </div>
      </div>

      <!-- TAB 4: SUBTITLE 2 SETTINGS -->
      <div v-if="editTab === 'sub2'">
        <div class="form-row">
          <label>Nội dung dòng chữ phụ 2 (Dòng mô tả bên dưới)</label>
          <input v-model="form.version2" placeholder="Ví dụ: Reset vương quốc Survival" />
        </div>

        <div class="form-row">
          <label>Phông chữ</label>
          <select v-model="form.sub2Font">
            <option v-for="font in fontOptions" :key="font.value" :value="font.value">
              {{ font.label }}
            </option>
          </select>
        </div>

        <div class="form-row">
          <label>Màu sắc (Color & Fill)</label>
          <div class="color-picker-container">
            <div class="mode-tabs">
              <button 
                type="button" 
                :class="{ active: form.sub2ColorMode !== 'gradient' }" 
                @click="form.sub2ColorMode = 'solid'"
                class="mode-tab-btn"
              >
                Màu đơn (Solid)
              </button>
              <button 
                type="button" 
                :class="{ active: form.sub2ColorMode === 'gradient' }" 
                @click="form.sub2ColorMode = 'gradient'"
                class="mode-tab-btn"
              >
                Màu chuyển (Gradient)
              </button>
            </div>
            
            <div v-if="form.sub2ColorMode !== 'gradient'" class="color-control-block">
              <input type="color" v-model="form.sub2Color" class="color-picker-input" />
              <div class="color-presets">
                <button 
                  v-for="preset in colorPresets" 
                  :key="preset.hex"
                  type="button"
                  class="preset-bubble"
                  :style="{ backgroundColor: preset.hex }"
                  :class="{ active: form.sub2Color === preset.hex }"
                  @click="form.sub2Color = preset.hex; form.sub2ColorMode = 'solid';"
                ></button>
              </div>
            </div>

            <div v-else class="gradient-control-block">
              <div class="flex gap-2 items-center">
                <input type="color" v-model="form.sub2Color1" class="color-picker-input" />
                <span class="muted text-xs">→</span>
                <input type="color" v-model="form.sub2Color2" class="color-picker-input" />
                <div class="flex-1">
                  <div class="text-xs muted flex justify-between">Góc: <span>{{ form.sub2GradientAngle }}°</span></div>
                  <input type="range" v-model.number="form.sub2GradientAngle" min="0" max="360" class="slider" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="grid-3">
          <div class="form-row">
            <label class="text-xs">Kích cỡ: {{ form.sub2FontSize }}px</label>
            <input type="number" v-model.number="form.sub2FontSize" min="8" max="90" />
          </div>
          <div class="form-row">
            <label class="text-xs font-mono">Spacing (px)</label>
            <input type="number" v-model.number="form.sub2LetterSpacing" min="-5" max="25" />
          </div>
          <div class="form-row">
            <label class="text-xs">Xoay nghiêng: {{ form.sub2Rotate }}°</label>
            <input type="range" v-model.number="form.sub2Rotate" min="-30" max="30" class="slider" />
          </div>
        </div>

        <div class="form-row">
          <label>Định dạng</label>
          <div class="flex gap-4 style-toggles">
            <Switch v-model="form.sub2Bold">In đậm</Switch>
            <Switch v-model="form.sub2Italic">In nghiêng</Switch>
            <Switch v-model="form.sub2Uppercase">Viết hoa</Switch>
          </div>
        </div>

        <!-- Glow & Outline for Sub 2 -->
        <h4 class="section-title">Nâng cao cho chữ phụ 2</h4>
        <div class="form-row">
          <div class="flex items-center justify-between">
            <Switch v-model="form.sub2Glow">Phát sáng (Glow)</Switch>
            <input v-if="form.sub2Glow" type="color" v-model="form.sub2GlowColor" class="glow-color-pick" />
          </div>
        </div>
        <div class="form-row" style="margin-top: 10px;">
          <div class="flex items-center justify-between">
            <Switch v-model="form.sub2Outline">Nét viền (Outline)</Switch>
            <input v-if="form.sub2Outline" type="color" v-model="form.sub2OutlineColor" class="glow-color-pick" />
          </div>
          <div v-if="form.sub2Outline" style="margin-top: 6px;">
            <label class="text-xs">Độ dày viền: {{ form.sub2OutlineWidth }}px</label>
            <input type="range" v-model.number="form.sub2OutlineWidth" min="1" max="12" class="slider" />
          </div>
        </div>
      </div>

      <!-- TAB 5: LAYOUT & GAPS -->
      <div v-if="editTab === 'layout'">
        <div class="form-row">
          <label>Căn lề chữ (Text Alignment)</label>
          <div class="align-selector">
            <button 
              type="button" 
              :class="{ active: form.titleAlign === 'left' }" 
              @click="form.titleAlign = 'left'"
              class="align-btn"
            >
              <span class="material-symbols-outlined symbol-sm">format_align_left</span> Trái (Vùng Đen)
            </button>
            <button 
              type="button" 
              :class="{ active: form.titleAlign === 'center' }" 
              @click="form.titleAlign = 'center'"
              class="align-btn"
            >
              <span class="material-symbols-outlined symbol-sm">format_align_center</span> Giữa (Mặc Định)
            </button>
            <button 
              type="button" 
              :class="{ active: form.titleAlign === 'right' }" 
              @click="form.titleAlign = 'right'"
              class="align-btn"
            >
              <span class="material-symbols-outlined symbol-sm">format_align_right</span> Phải (Vùng Trống)
            </button>
          </div>
        </div>

        <h4 class="section-title">Bố cục ngang dọc (Offsets)</h4>

        <div class="form-row">
          <label style="display: flex; justify-content: space-between;">
            <span>Dịch chuyển X: {{ form.offsetX }}px</span>
            <button type="button" @click="resetOffsets" class="reset-link">Đặt lại vị trí</button>
          </label>
          <input type="range" v-model.number="form.offsetX" min="-250" max="250" step="1" class="slider" />
        </div>

        <div class="form-row">
          <label>Dịch chuyển Y: {{ form.offsetY }}px</label>
          <input type="range" v-model.number="form.offsetY" min="-120" max="120" step="1" class="slider" />
        </div>

        <h4 class="section-title">Khoảng cách giữa các dòng</h4>

        <div class="form-row" v-if="form.version">
          <label>Dòng chính → Dòng phụ 1: {{ form.verticalSpacing }}px</label>
          <input type="range" v-model.number="form.verticalSpacing" min="10" max="180" step="1" class="slider" />
        </div>

        <div class="form-row" v-if="form.version && form.version2">
          <label>Dòng phụ 1 → Dòng phụ 2: {{ form.verticalSpacing2 }}px</label>
          <input type="range" v-model.number="form.verticalSpacing2" min="10" max="150" step="1" class="slider" />
        </div>
      </div>
    </section>

    <!-- RIGHT: LIVE PREVIEW & STATIC GALLERY -->
    <div class="right-column-container">
      <!-- Live Preview Canvas -->
      <aside class="card card-glass preview-card">
        <div class="preview-head">
          <h3 style="margin: 0; font-size: 15px;">Xem trước thời gian thực (Real-time Preview)</h3>
          <span class="badge badge-brand">1024 x 341</span>
        </div>

        <div class="canvas-container">
          <canvas ref="canvasRef" width="1024" height="341"></canvas>
        </div>

        <div class="tech-info muted">
          <span class="material-symbols-outlined symbol-sm">info</span>
          <span>Click chuột phải vào canvas chọn "Sao chép ảnh" để dán nhanh, hoặc dùng nút "Lưu mẫu thiết kế" ở trên để đưa vào thư viện dùng cho các Embed.</span>
        </div>
      </aside>

      <!-- Saved Designs Gallery -->
      <section class="card gallery-card-panel">
        <div class="gallery-head">
          <h3 style="margin: 0; font-size: 15px; display: flex; align-items: center; gap: 8px;">
            <span class="material-symbols-outlined" style="color: var(--primary)">collections</span>
            Thư viện thiết kế của bạn
          </h3>
          <span class="badge">{{ savedBanners.length }} ảnh</span>
        </div>

        <div v-if="savedBanners.length === 0" class="gallery-empty-state">
          <span class="material-symbols-outlined">broken_image</span>
          <p class="muted">Chưa có thiết kế nào được lưu. Bấm nút "Lưu mẫu thiết kế" ở trên để lưu trữ.</p>
        </div>

        <div v-else class="gallery-list">
          <div v-for="b in savedBanners" :key="b.id" class="gallery-row-card">
            <img :src="b.safeImageUrl" alt="" class="gallery-row-thumb" />
            <div class="gallery-row-info">
              <span class="gallery-row-name" :title="b.name">{{ b.name }}</span>
              <span class="gallery-row-url" :title="b.safeImageUrl">{{ b.safeImageUrl }}</span>
            </div>
            <div class="gallery-row-actions">
              <button 
                type="button" 
                class="btn-icon" 
                title="Mở lại thiết kế này trong bộ chỉnh sửa" 
                @click="loadSavedConfig(b)"
              >
                <span class="material-symbols-outlined">edit_square</span>
              </button>
              <button 
                type="button" 
                class="btn-icon" 
                title="Sao chép đường dẫn ảnh" 
                @click="copyToClipboard(b.safeImageUrl)"
              >
                <span class="material-symbols-outlined">link</span>
              </button>
              <button 
                type="button" 
                class="btn-icon delete" 
                title="Xóa thiết kế này" 
                @click="handleDeleteBanner(b)"
              >
                <span class="material-symbols-outlined">delete</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>

  <!-- POPUP SAVING DIALOG -->
  <div v-if="showSaveModal" class="modal-backdrop-custom">
    <div class="modal-panel-custom">
      <div class="modal-header-custom">
        <h3>Lưu mẫu thiết kế vào thư viện</h3>
        <button class="btn-close-custom" @click="showSaveModal = false"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="modal-body-custom">
        <p class="muted">Nhập tên dễ nhớ cho mẫu ảnh này để có thể chọn nhanh khi cấu hình Embeds.</p>
        <div class="form-row" style="margin-top: 12px;">
          <input 
            v-model="saveName" 
            placeholder="Ví dụ: Update Skyblock Season 2" 
            class="input-name-save"
            @keyup.enter="handleSaveBanner"
            autofocus 
          />
        </div>
      </div>
      <div class="modal-actions-custom">
        <StButton variant="ghost" @click="showSaveModal = false">Hủy</StButton>
        <StButton variant="primary" :loading="savingBanner" @click="handleSaveBanner">Xác nhận lưu</StButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Bangers&family=Cinzel+Decorative:wght@700;900&family=Cinzel:wght@700;900&family=Fascinate+Inline&family=Montserrat:ital,wght@0,700;0,900;1,900&family=Orbitron:wght@700;900&family=Permanent+Marker&family=Press+Start+2P&family=Rubik+Mono+One&family=Silkscreen:wght@400;700&family=Syncopate:wght@700&family=Teko:wght@700&family=VT323&family=Oswald:wght@700&family=Playfair+Display:ital,wght@0,700;0,900;1,900&family=Outfit:wght@700;900&family=Inter:wght@700;900&family=Luckiest+Guy&family=Lobster&family=Graduate&family=Creepster&display=swap');

.generator-grid {
  display: grid;
  grid-template-columns: 520px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.editor-card {
  padding: 24px;
  max-height: 80vh;
  overflow-y: auto;
}

.right-column-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Custom background upload box */
.custom-bg-upload-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 120px;
  border: 2px dashed var(--outline-variant);
  border-radius: 8px;
  background: var(--surface-container-low);
  cursor: pointer;
  overflow: hidden;
  position: relative;
  transition: all var(--t-fast) var(--ease-out);
}

.custom-bg-upload-box:hover {
  border-color: var(--primary);
  background: var(--surface-container-high);
}

.custom-bg-upload-box.has-bg {
  border-style: solid;
  border-color: var(--outline-variant);
}

.custom-bg-upload-box .upload-icon {
  font-size: 32px;
  color: var(--primary);
}

.custom-bg-upload-box .upload-text {
  font-size: 13px;
  color: var(--on-surface-variant);
}

.bg-thumb-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bg-change-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  opacity: 0;
  transition: opacity var(--t-fast);
}

.custom-bg-upload-box:hover .bg-change-overlay {
  opacity: 1;
}

/* Style formatting controls & switch layouts */
.style-toggles {
  background: var(--surface-container-low);
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--outline-variant);
}

.font-upload-success {
  margin-top: 4px; 
  color: var(--primary); 
  font-weight: 500;
}

.upload-font-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 6px;
  background: var(--surface-container-high);
  border: 1px solid var(--outline-variant);
  color: var(--on-surface-variant);
  cursor: pointer;
  transition: all var(--t-fast) var(--ease-out);
}
.upload-font-btn:hover {
  background: var(--surface-container-highest);
  border-color: var(--primary);
  color: var(--primary);
}

.color-picker-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--surface-container-low);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--outline-variant);
}

.color-control-block, .gradient-control-block {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.color-picker-input {
  width: 44px;
  height: 38px;
  padding: 0;
  border-radius: 6px;
  border: 1px solid var(--outline-variant);
  background: none;
  cursor: pointer;
}

.color-presets, .gradient-presets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.preset-bubble {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform var(--t-fast) var(--ease-out);
}

.preset-bubble:hover, .preset-gradient-bubble:hover {
  transform: scale(1.2);
}

.preset-bubble.active {
  border-color: #ffffff;
  box-shadow: 0 0 0 2px var(--primary);
}

.preset-gradient-bubble {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid var(--outline-variant);
  cursor: pointer;
  transition: transform var(--t-fast) var(--ease-out);
}

.glow-color-pick {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 4px;
  border: 1px solid var(--outline-variant);
  cursor: pointer;
  background: none;
}

.glow-sub-grid {
  background: rgba(255, 255, 255, 0.02);
  padding: 10px;
  border-radius: 6px;
  border: 1px solid var(--outline-variant);
}

.align-selector {
  display: flex;
  gap: 4px;
  background: var(--surface-container-low);
  padding: 4px;
  border-radius: 8px;
  border: 1px solid var(--outline-variant);
}

.align-btn {
  flex: 1;
  padding: 8px;
  font-size: 12px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--on-surface-variant);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all var(--t-fast) var(--ease-out);
}

.align-btn.active {
  background: var(--surface-container-high);
  color: var(--primary);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.mode-tabs {
  display: flex;
  gap: 4px;
  background: var(--surface-container-low);
  padding: 3px;
  border-radius: 6px;
  border: 1px solid var(--outline-variant);
}

.mode-tab-btn {
  flex: 1;
  padding: 6px;
  font-size: 11px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--on-surface-variant);
  cursor: pointer;
  transition: all var(--t-fast) var(--ease-out);
}

.mode-tab-btn.active {
  background: var(--surface-container-high);
  color: var(--primary);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.section-title {
  margin-top: 24px;
  margin-bottom: 12px;
  font-size: 11px;
  color: var(--primary);
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.08em;
  border-bottom: 1px solid var(--outline-variant);
  padding-bottom: 6px;
}

.reset-link {
  background: none;
  border: none;
  font-size: 11px;
  color: var(--primary);
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
}

/* Preview Card */
.preview-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preview-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.canvas-container {
  width: 100%;
  aspect-ratio: 1024 / 341;
  background: #000;
  border-radius: var(--r-sm);
  overflow: hidden;
  border: 1px solid #334155;
  position: relative;
  box-shadow: var(--shadow-lg);
}

.canvas-container canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.tech-info {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 12px;
  line-height: 1.5;
  color: var(--on-surface-variant);
  background: rgba(255, 255, 255, 0.01);
  padding: 12px 14px;
  border-radius: var(--r-sm);
  border: 1px dashed var(--outline-variant);
}

.tech-info span.material-symbols-outlined {
  margin-top: 2px;
  color: var(--primary);
  flex-shrink: 0;
}

.slider {
  -webkit-appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--outline-variant);
  outline: none;
  margin: 8px 0;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--primary);
  cursor: pointer;
  transition: transform 0.1s ease;
}

.slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

/* Saved Banners panel */
.gallery-card-panel {
  padding: 20px;
}

.gallery-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--outline-variant);
  padding-bottom: 10px;
}

.gallery-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px;
  text-align: center;
  color: var(--on-surface-variant);
}

.gallery-empty-state span {
  font-size: 36px;
  opacity: 0.4;
  margin-bottom: 10px;
}

.gallery-empty-state p {
  font-size: 12px;
}

.gallery-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 280px;
  overflow-y: auto;
  padding-right: 4px;
}

.gallery-row-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface-container-low);
  border: 1px solid var(--outline-variant);
  border-radius: 6px;
  padding: 8px 12px;
  transition: all var(--t-fast);
}

.gallery-row-card:hover {
  border-color: var(--primary);
  background: var(--surface-container-high);
}

.gallery-row-thumb {
  width: 72px;
  height: 24px;
  object-fit: cover;
  border-radius: 4px;
  background: #000;
  border: 1px solid var(--outline-variant);
}

.gallery-row-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.gallery-row-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gallery-row-url {
  font-size: 11px;
  color: var(--on-surface-variant);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.7;
}

.gallery-row-actions {
  display: flex;
  gap: 6px;
}

.btn-icon {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid var(--outline-variant);
  background: var(--surface-container-high);
  color: var(--on-surface-variant);
  cursor: pointer;
  transition: all var(--t-fast);
}

.btn-icon span {
  font-size: 16px;
}

.btn-icon:hover {
  background: var(--surface-container-highest);
  color: var(--primary);
  border-color: var(--primary);
}

.btn-icon.delete:hover {
  color: var(--error);
  border-color: var(--error);
}

/* Custom Save Modal Backdrop & Panel */
.modal-backdrop-custom {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-panel-custom {
  background: #0c1524;
  border: 1px solid var(--outline-variant);
  border-radius: 12px;
  width: 440px;
  max-width: 90%;
  padding: 20px;
  box-shadow: var(--shadow-xl);
}

.modal-header-custom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.modal-header-custom h3 {
  margin: 0;
  font-size: 16px;
  color: var(--on-surface);
}

.btn-close-custom {
  background: none;
  border: none;
  color: var(--on-surface-variant);
  cursor: pointer;
  padding: 4px;
}

.modal-body-custom p {
  font-size: 13px;
  line-height: 1.5;
}

.input-name-save {
  width: 100%;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--surface-container-low);
  border: 1px solid var(--outline-variant);
  color: var(--on-surface);
  outline: none;
  transition: border-color var(--t-fast);
}

.input-name-save:focus {
  border-color: var(--primary);
}

.modal-actions-custom {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

@media (max-width: 1100px) {
  .generator-grid {
    grid-template-columns: 1fr;
  }
}
</style>
