import { createHash } from "crypto";

export const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
export const MAX_IMAGE_ATTACHMENTS = Number(process.env.BRS_MAX_IMAGE_ATTACHMENTS || 3);
export const MAX_IMAGE_BYTES = Number(process.env.BRS_MAX_IMAGE_BYTES || 1_500_000);
export const MAX_TOTAL_IMAGE_BYTES = Number(process.env.BRS_MAX_TOTAL_IMAGE_BYTES || 3_000_000);

const DATA_URL_PATTERN = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([a-z0-9+/=\s]+)$/i;

function normaliseMimeType(value = "") {
  const mimeType = String(value || "").toLowerCase().trim();
  return mimeType === "image/jpg" ? "image/jpeg" : mimeType;
}

function compactText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function imageHash(dataUrl = "") {
  return createHash("sha256").update(dataUrl).digest("hex");
}

export function redactVisionSummary(summary = "") {
  return String(summary || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, "[redacted-phone]")
    .replace(/\b[A-Z]{2,5}-?\d{4,}\b/gi, "[redacted-reference]")
    .replace(/\b\d{12,}\b/g, "[redacted-number]")
    .replace(/\s+/g, " ")
    .trim();
}

export function normaliseImageAttachments(attachments = []) {
  if (attachments === undefined || attachments === null) return [];
  if (!Array.isArray(attachments)) {
    const error = new Error("attachments must be an array.");
    error.status = 400;
    throw error;
  }
  if (attachments.length > MAX_IMAGE_ATTACHMENTS) {
    const error = new Error(`Maximum ${MAX_IMAGE_ATTACHMENTS} image attachments are allowed.`);
    error.status = 400;
    throw error;
  }

  let totalBytes = 0;
  return attachments.map((attachment, index) => {
    if (!attachment || typeof attachment !== "object") {
      const error = new Error(`Attachment ${index + 1} must be an object.`);
      error.status = 400;
      throw error;
    }

    const dataUrl = String(attachment.dataUrl || "");
    const match = dataUrl.match(DATA_URL_PATTERN);
    if (!match) {
      const error = new Error(`Attachment ${index + 1} must be a base64 image data URL.`);
      error.status = 400;
      throw error;
    }

    const mimeType = normaliseMimeType(attachment.mimeType || match[1]);
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      const error = new Error(`Attachment ${index + 1} must be PNG, JPG, WEBP, or GIF.`);
      error.status = 400;
      throw error;
    }

    const base64 = match[2].replace(/\s+/g, "");
    const sizeBytes = Buffer.byteLength(base64, "base64");
    if (sizeBytes > MAX_IMAGE_BYTES) {
      const error = new Error(`Attachment ${index + 1} is too large. Maximum ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024 * 10) / 10}MB.`);
      error.status = 400;
      throw error;
    }
    totalBytes += sizeBytes;
    if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
      const error = new Error(`Image attachments are too large in total. Maximum ${Math.round(MAX_TOTAL_IMAGE_BYTES / 1024 / 1024 * 10) / 10}MB.`);
      error.status = 400;
      throw error;
    }

    return {
      type: "image",
      mimeType,
      dataUrl: `data:${mimeType};base64,${base64}`,
      filename: compactText(attachment.filename || attachment.name || `screenshot-${index + 1}.${mimeType.split("/")[1]}`).slice(0, 120),
      sizeBytes,
      hash: imageHash(dataUrl),
    };
  });
}

export function attachmentMetadata(attachments = []) {
  return (Array.isArray(attachments) ? attachments : []).map((attachment) => ({
    type: "image",
    mimeType: attachment.mimeType,
    filename: attachment.filename,
    sizeBytes: attachment.sizeBytes,
    hash: attachment.hash,
  }));
}

export async function buildVisionContextFromAttachments(client, attachments = [], message = "") {
  const images = Array.isArray(attachments) ? attachments : [];
  if (!images.length) return { attachmentCount: 0, filenames: [], summary: "", model: null, error: null };
  const filenames = images.map((attachment) => attachment.filename).filter(Boolean);
  if (!client?.chat?.completions?.create) {
    return { attachmentCount: images.length, filenames, summary: "", model: null, error: "vision-client-unavailable" };
  }

  const model = process.env.BRS_VISION_MODEL || "gpt-4.1-mini";
  try {
    const content = [
      {
        type: "text",
        text: [
          "You are reading user-uploaded BRS Golf support screenshots.",
          "Summarise only what is visible and useful for routing a support answer: page title, menu area, visible labels/buttons, error text, and what the user appears to be stuck on.",
          "Do not identify real people. Redact emails, phone numbers, member names, booking references, and long numeric IDs.",
          "Do not give workflow instructions. Do not treat the screenshot as verified product knowledge.",
          `User message: ${message || "No text supplied."}`,
        ].join("\n"),
      },
      ...images.map((attachment) => ({
        type: "image_url",
        image_url: { url: attachment.dataUrl, detail: "low" },
      })),
    ];

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content }],
      max_completion_tokens: 350,
    });
    const summary = redactVisionSummary(response.choices?.[0]?.message?.content || "");
    return { attachmentCount: images.length, filenames, summary, model, error: null };
  } catch (error) {
    console.error("Vision context extraction failed:", error);
    return { attachmentCount: images.length, filenames, summary: "", model, error: error.message || "vision-context-failed" };
  }
}

export function messageWithVisionContext(message = "", visionContext = {}) {
  const base = String(message || "").trim() || "Please help with the attached screenshot.";
  if (!visionContext?.summary) return base;
  return [
    base,
    "",
    "Uploaded screenshot context for routing only. Use this to identify the page or visible error, but answer only from verified BRS knowledge:",
    visionContext.summary,
  ].join("\n");
}
