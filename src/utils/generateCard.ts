// ─── Result Card Generator ────────────────────────────────────────
// Composites archetype background image + player name + story tags
// onto a Canvas and exports as PNG data URL.

export interface CardData {
  playerName: string;
  archetypeId: string;
  archetypeTitle: string;
  archetypeDescription: string;
  storyTags: string[];
}

// Panel starts at 72% from top — matches the dark area in all 6 background images
const PANEL_RATIO = 0.72;
const PAD = 50;

export async function generateResultCard(data: CardData): Promise<string> {
  const img = await loadImage(`/cards/bg_${data.archetypeId}.png`);

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;   // 941
  canvas.height = img.naturalHeight; // 1672
  const ctx = canvas.getContext("2d")!;

  // ── Background ──
  ctx.drawImage(img, 0, 0);

  const W = canvas.width;
  const H = canvas.height;
  const PANEL_Y = Math.round(H * PANEL_RATIO); // ≈ 1204

  const FONT = `"Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`;

  // ── Player name ──
  ctx.font = `32px ${FONT}`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.60)";
  ctx.fillText(`${data.playerName} の4年間`, PAD, PANEL_Y + 52);

  // ── Archetype title ──
  ctx.font = `bold 58px ${FONT}`;
  ctx.fillStyle = "#ffffff";
  // Scale down if title is long
  const titleWidth = ctx.measureText(data.archetypeTitle).width;
  if (titleWidth > W - PAD * 2) {
    const scale = (W - PAD * 2) / titleWidth;
    ctx.font = `bold ${Math.floor(58 * scale)}px ${FONT}`;
  }
  ctx.fillText(data.archetypeTitle, PAD, PANEL_Y + 128);

  // ── Description (auto-wrap) ──
  ctx.font = `26px ${FONT}`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
  const descLines = wrapText(ctx, data.archetypeDescription, W - PAD * 2);
  const DESC_LINE_H = 36;
  descLines.slice(0, 3).forEach((line, i) => {
    ctx.fillText(line, PAD, PANEL_Y + 190 + i * DESC_LINE_H);
  });

  // ── Story tags ──
  const tags = data.storyTags.slice(0, 6);
  if (tags.length > 0) {
    const tagBaseY = PANEL_Y + 190 + Math.min(descLines.length, 3) * DESC_LINE_H + 36;
    ctx.font = `26px ${FONT}`;
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";

    // Split into rows of 3
    const row1 = tags.slice(0, 3).map((t) => `#${t}`).join("   ");
    const row2 = tags.slice(3, 6).map((t) => `#${t}`).join("   ");
    ctx.fillText(row1, PAD, tagBaseY);
    if (row2) ctx.fillText(row2, PAD, tagBaseY + 38);
  }

  return canvas.toDataURL("image/png");
}

// ── Helpers ──────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

/** Wraps Japanese text by character to fit maxWidth */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let current = "";
  for (const char of text) {
    const candidate = current + char;
    if (ctx.measureText(candidate).width > maxWidth) {
      if (current) lines.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}
