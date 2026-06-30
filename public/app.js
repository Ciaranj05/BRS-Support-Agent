let sessionId = localStorage.getItem("brsSupportSessionId") || crypto.randomUUID();
localStorage.setItem("brsSupportSessionId", sessionId);

let isSending = false;
let typingRow = null;
let activeOptionRow = null;
let activeResolutionRow = null;
let activeRatingRow = null;
let pendingFreeTextClarification = false;
let pendingRatingScore = null;
let pendingFollowUpHint = "";
let pendingTimesheetRequest = "";
let conversationHistory = [];
let pendingImageAttachments = [];

const MAX_IMAGE_ATTACHMENTS = 3;
const MAX_IMAGE_BYTES = 1500000;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function esc(t) {
  return String(t || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function openImagePicker() {
  document.getElementById("imageInput")?.click();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleImageFiles(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  for (const file of files) {
    if (pendingImageAttachments.length >= MAX_IMAGE_ATTACHMENTS) {
      addSystemDivider(`Only ${MAX_IMAGE_ATTACHMENTS} screenshots can be attached at once.`);
      break;
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      addSystemDivider(`${file.name} was not attached. Use PNG, JPG, WEBP, or GIF.`);
      continue;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      addSystemDivider(`${file.name} was not attached. Maximum image size is 1.5MB.`);
      continue;
    }
    const dataUrl = await fileToDataUrl(file);
    pendingImageAttachments.push({
      type: "image",
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      dataUrl,
    });
  }
  renderAttachmentPreview();
}

function removePendingAttachment(index) {
  pendingImageAttachments.splice(index, 1);
  renderAttachmentPreview();
}

function renderAttachmentPreview() {
  const preview = document.getElementById("attachmentPreview");
  if (!preview) return;
  if (!pendingImageAttachments.length) {
    preview.innerHTML = "";
    preview.hidden = true;
    return;
  }
  preview.hidden = false;
  preview.innerHTML = pendingImageAttachments.map((attachment, index) => `
    <div class="attachment-chip">
      <img src="${attachment.dataUrl}" alt="${esc(attachment.filename)} preview">
      <span>${esc(attachment.filename)}</span>
      <button type="button" onclick="removePendingAttachment(${index})" aria-label="Remove ${esc(attachment.filename)}">Remove</button>
    </div>
  `).join("");
}

function renderAttachmentThumbnails(attachments = []) {
  const safe = Array.isArray(attachments) ? attachments : [];
  if (!safe.length) return "";
  return `<div class="message-attachments">${safe.map((attachment) => `
    <a class="message-attachment" href="${attachment.dataUrl}" target="_blank" rel="noopener noreferrer">
      <img src="${attachment.dataUrl}" alt="${esc(attachment.filename || "Uploaded screenshot")}">
      <span>${esc(attachment.filename || "Screenshot")}</span>
    </a>
  `).join("")}</div>`;
}

function renderVisualAids(visualAids = []) {
  const aids = Array.isArray(visualAids) ? visualAids : [];
  if (!aids.length) return "";
  return `<div class="visual-aids">${aids.map((aid) => `
    <a class="visual-aid-card" href="${esc(aid.url)}" target="_blank" rel="noopener noreferrer">
      <div class="visual-aid-copy">
        <div class="visual-aid-title">${esc(aid.title || "Visual guide")}</div>
        <div class="visual-aid-source">${aid.source === "verified-screenshot" ? "Annotated screenshot" : "Annotated visual guide"}</div>
      </div>
      <img src="${esc(aid.url)}" alt="${esc(aid.alt || aid.title || "Annotated visual guide")}">
    </a>
  `).join("")}</div>`;
}

function renderInlineMarkdown(t) {
  let safe = esc(t);
  const links = [];
  const helpCenterTitle = (url) => {
    const match = String(url || "").match(/\/articles\/\d+-([^?#]+)/i);
    if (!match) return url;
    return decodeURIComponent(match[1])
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  };
  safe = safe.replace(/Source:\s*\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) => {
    const i = links.push(`<div class="source-link"><a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a></div>`) - 1;
    return `__BRS_LINK_${i}__`;
  });
  safe = safe.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) => {
    const i = links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`) - 1;
    return `__BRS_LINK_${i}__`;
  });
  safe = safe.replace(/\b(https?:\/\/[^\s<]+)\b/g, (url) => {
    const i = links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${helpCenterTitle(url)}</a>`) - 1;
    return `__BRS_LINK_${i}__`;
  });
  safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  return safe.replace(/__BRS_LINK_(\d+)__/g, (m, i) => links[Number(i)] || m);
}

function formatBotMessage(text) {
  const lines = String(text || "").split("\n");
  let html = "";
  let ol = false;
  let ul = false;
  let nestedUl = false;
  let openOlItem = false;

  function close() {
    if (nestedUl) {
      html += "</ul>";
      nestedUl = false;
    }
    if (openOlItem) {
      html += "</li>";
      openOlItem = false;
    }
    if (ol) {
      html += "</ol>";
      ol = false;
    }
    if (ul) {
      html += "</ul>";
      ul = false;
    }
  }

  for (const line of lines) {
    const x = line.trim();
    if (!x) continue;
    if (/^\d+\.\s+/.test(x)) {
      if (ul) {
        html += "</ul>";
        ul = false;
      }
      if (nestedUl) {
        html += "</ul>";
        nestedUl = false;
      }
      if (openOlItem) {
        html += "</li>";
        openOlItem = false;
      }
      if (!ol) {
        html += "<ol>";
        ol = true;
      }
      html += `<li>${renderInlineMarkdown(x.replace(/^\d+\.\s+/, ""))}`;
      openOlItem = true;
      continue;
    }
    if (/^[-•]\s+/.test(x)) {
      if (ol && openOlItem) {
        if (!nestedUl) {
          html += "<ul>";
          nestedUl = true;
        }
        html += `<li>${renderInlineMarkdown(x.replace(/^[-â€¢]\s+/, ""))}</li>`;
        continue;
      }
      if (ol) {
        html += "</ol>";
        ol = false;
      }
      if (!ul) {
        html += "<ul>";
        ul = true;
      }
      html += `<li>${renderInlineMarkdown(x.replace(/^[-•]\s+/, ""))}</li>`;
      continue;
    }
    close();
    html += `<p>${renderInlineMarkdown(x)}</p>`;
  }
  close();
  return html || `<p>${renderInlineMarkdown(text || "")}</p>`;
}

function formatBotMessageSafe(text) {
  const lines = String(text || "").split("\n");
  let html = "";
  let ol = false;
  let ul = false;
  let nestedUl = false;
  let openOlItem = false;
  const bulletPrefix = /^(?:[-*]|\u2022)\s+/;

  function close() {
    if (nestedUl) {
      html += "</ul>";
      nestedUl = false;
    }
    if (openOlItem) {
      html += "</li>";
      openOlItem = false;
    }
    if (ol) {
      html += "</ol>";
      ol = false;
    }
    if (ul) {
      html += "</ul>";
      ul = false;
    }
  }

  for (const line of lines) {
    const x = line.trim();
    if (!x) continue;

    if (/^\d+\.\s+/.test(x)) {
      if (ul) {
        html += "</ul>";
        ul = false;
      }
      if (nestedUl) {
        html += "</ul>";
        nestedUl = false;
      }
      if (openOlItem) {
        html += "</li>";
        openOlItem = false;
      }
      if (!ol) {
        html += "<ol>";
        ol = true;
      }
      html += `<li>${renderInlineMarkdown(x.replace(/^\d+\.\s+/, ""))}`;
      openOlItem = true;
      continue;
    }

    if (bulletPrefix.test(x)) {
      if (ol && openOlItem) {
        if (!nestedUl) {
          html += "<ul>";
          nestedUl = true;
        }
        html += `<li>${renderInlineMarkdown(x.replace(bulletPrefix, ""))}</li>`;
        continue;
      }
      if (!ul) {
        html += "<ul>";
        ul = true;
      }
      html += `<li>${renderInlineMarkdown(x.replace(bulletPrefix, ""))}</li>`;
      continue;
    }

    close();
    html += `<p>${renderInlineMarkdown(x)}</p>`;
  }
  close();
  return html || `<p>${renderInlineMarkdown(text || "")}</p>`;
}

function hasPriorUserMessage() {
  return Boolean(document.querySelector(".user-row"));
}

function looksLikeStandaloneQuestion(text) {
  const lower = String(text || "").trim().toLowerCase();
  if (!lower) return false;
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;
  return /^(how|what|why|where|when|can|could|do|does|is|are|i need|help|please)\b/.test(lower);
}

function wantsNewQuestion(text) {
  const lower = String(text || "").trim().toLowerCase();
  return /\b(another|new|next|different|separate)\s+(question|issue|query)\b/.test(lower)
    || /\b(ask|start)\s+(something\s+else|again|over)\b/.test(lower)
    || /\bnew issue\b/.test(lower);
}

function extractNewQuestion(text) {
  const raw = String(text || "").trim();
  const match = raw.match(/(?:another|new|next|different|separate)\s+(?:question|issue|query)\s*[:,-]?\s*(.+)$/i);
  const next = match?.[1]?.trim() || "";
  return next.split(/\s+/).filter(Boolean).length >= 3 ? next : "";
}

function startFreshSessionForRootQuestion() {
  disableRows();
  sessionId = crypto.randomUUID();
  localStorage.setItem("brsSupportSessionId", sessionId);
  conversationHistory = [];
  activeOptionRow = null;
  activeResolutionRow = null;
  activeRatingRow = null;
  pendingFreeTextClarification = false;
  pendingFollowUpHint = "";
  pendingTimesheetRequest = "";
  pendingImageAttachments = [];
  renderAttachmentPreview();
  addSystemDivider("Starting a fresh context for this question.");
}

function startFreshPromptForNextQuestion(text) {
  disableRows();
  addMessage(text, "user");
  sessionId = crypto.randomUUID();
  localStorage.setItem("brsSupportSessionId", sessionId);
  conversationHistory = [];
  activeOptionRow = null;
  activeResolutionRow = null;
  activeRatingRow = null;
  pendingFreeTextClarification = false;
  pendingFollowUpHint = "";
  pendingTimesheetRequest = "";
  pendingImageAttachments = [];
  renderAttachmentPreview();
  addSystemDivider("Starting a fresh context for the next question.");
  addWelcome();
}

function addWelcome() {
  addMessage("Thank you for using BRS Caddie, how can I help you today?", "bot", []);
}

function disableRows() {
  if (activeResolutionRow) activeResolutionRow.querySelectorAll("button").forEach((b) => { b.disabled = true; });
  if (activeOptionRow) activeOptionRow.querySelectorAll("button").forEach((b) => { b.disabled = true; });
  if (activeRatingRow) activeRatingRow.querySelectorAll("button").forEach((b) => { b.disabled = true; });
}

function clearResolutionPrompt() {
  if (!activeResolutionRow) return;
  activeResolutionRow.remove();
  activeResolutionRow = null;
}

function addSystemDivider(text) {
  const chat = document.getElementById("chat");
  const row = document.createElement("div");
  row.className = "msg-row system-row";
  row.innerHTML = `<div class="session-divider">${esc(text)}</div>`;
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
}

function addResolutionPrompt() {
  clearResolutionPrompt();
  const chat = document.getElementById("chat");
  const row = document.createElement("div");
  row.className = "msg-row bot-row";
  row.innerHTML = '<div class="msg-wrap"><div class="resolution-card"><div class="resolution-title">Did this resolve your issue?</div><div class="resolution-text">Choose Yes if this fixed it, or keep chatting if you need to refine it.</div><div class="resolution-actions"><button class="solved-btn" onclick="showRatingPrompt()">Yes, resolved</button><button class="continue-btn" onclick="continueIssue()">No, keep helping</button></div></div></div>';
  chat.appendChild(row);
  activeResolutionRow = row;
  chat.scrollTop = chat.scrollHeight;
}

function replyAsksForMoreInput(text) {
  const reply = String(text || "").trim();
  if (!reply) return false;
  const lower = reply.toLowerCase();
  if (/\?\s*$/.test(reply)) return true;
  return lower.includes("can you see")
    || lower.includes("which ")
    || lower.includes("what status")
    || lower.includes("please select")
    || lower.includes("please choose")
    || lower.includes("please enter")
    || lower.includes("add a bit more detail")
    || lower.includes("type what")
    || lower.includes("tell me what")
    || lower.includes("have you checked");
}

function replyIsUncertainOrEscalating(text) {
  const lower = String(text || "").toLowerCase();
  return lower.includes("i don't have enough confirmed information")
    || lower.includes("i do not have a complete")
    || lower.includes("needs workflow exploration")
    || lower.includes("should be escalated")
    || lower.includes("needs to be investigated")
    || lower.includes("i have prepared an escalation");
}

function shouldOfferResolutionCheck(data, optionCount) {
  if (!data || optionCount > 0 || data.escalationReady) return false;
  return !replyAsksForMoreInput(data.reply) && !replyIsUncertainOrEscalating(data.reply);
}

function maybeAddResolutionPrompt(data, optionCount) {
  if (shouldOfferResolutionCheck(data, optionCount)) addResolutionPrompt();
  else clearResolutionPrompt();
}

function continueIssue() {
  clearResolutionPrompt();
  const input = document.getElementById("input");
  input.disabled = false;
  input.focus();
}

function showRatingPrompt() {
  disableRows();
  pendingRatingScore = null;
  const chat = document.getElementById("chat");
  const row = document.createElement("div");
  row.className = "msg-row bot-row";
  const wrap = document.createElement("div");
  wrap.className = "msg-wrap";
  const card = document.createElement("div");
  card.className = "resolution-card";
  card.innerHTML = '<div class="resolution-title">How likely are you to recommend GolfNow?</div><div class="resolution-text">Select 0% for not at all likely and 100% for extremely likely.</div>';
  const rating = document.createElement("div");
  rating.className = "rating-row";
  for (let i = 0; i <= 100; i += 10) {
    const b = document.createElement("button");
    b.className = "rating-btn";
    b.type = "button";
    b.textContent = `${i}%`;
    b.onclick = () => selectRating(i, b);
    rating.appendChild(b);
  }
  const comment = document.createElement("textarea");
  comment.id = "feedbackComment";
  comment.className = "feedback-comment";
  comment.placeholder = "Add an optional comment...";
  const submit = document.createElement("button");
  submit.id = "feedbackSubmit";
  submit.className = "feedback-submit";
  submit.type = "button";
  submit.textContent = "Submit feedback";
  submit.disabled = true;
  submit.onclick = submitRating;
  card.appendChild(rating);
  card.appendChild(comment);
  card.appendChild(submit);
  wrap.appendChild(card);
  row.appendChild(wrap);
  chat.appendChild(row);
  activeRatingRow = row;
  chat.scrollTop = chat.scrollHeight;
}

function selectRating(score, button) {
  pendingRatingScore = score;
  if (activeRatingRow) activeRatingRow.querySelectorAll(".rating-btn").forEach((b) => b.classList.remove("selected"));
  button.classList.add("selected");
  const submit = document.getElementById("feedbackSubmit");
  if (submit) submit.disabled = false;
}

async function submitRating() {
  if (pendingRatingScore === null) return;
  const comment = document.getElementById("feedbackComment")?.value || "";
  disableRows();
  try {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": sessionId },
      body: JSON.stringify({ score: pendingRatingScore, type: "nps", comment, conversationHistory }),
    }).catch(() => {});
  } finally {
    await fetch("/api/reset", { method: "POST", headers: { "x-session-id": sessionId } }).catch(() => {});
    addSystemDivider("Thank you for your feedback. Starting fresh for the next issue.");
    setTimeout(() => resetChat(), 1600);
  }
}

function showUnresolvedPrompt() {
  disableRows();
  const chat = document.getElementById("chat");
  const row = document.createElement("div");
  row.className = "msg-row bot-row";
  const wrap = document.createElement("div");
  wrap.className = "msg-wrap";
  const card = document.createElement("div");
  card.className = "resolution-card";
  card.innerHTML = '<div class="resolution-title">What still needs help?</div><div class="resolution-text">Add an optional note for the escalation record.</div>';
  const comment = document.createElement("textarea");
  comment.id = "unresolvedComment";
  comment.className = "feedback-comment";
  comment.placeholder = "Add escalation details...";
  const submit = document.createElement("button");
  submit.className = "feedback-submit";
  submit.type = "button";
  submit.textContent = "Record escalation";
  submit.onclick = submitUnresolved;
  card.appendChild(comment);
  card.appendChild(submit);
  wrap.appendChild(card);
  row.appendChild(wrap);
  chat.appendChild(row);
  activeRatingRow = row;
  chat.scrollTop = chat.scrollHeight;
}

async function submitUnresolved() {
  const comment = document.getElementById("unresolvedComment")?.value || "";
  disableRows();
  try {
    await fetch("/api/resolved-interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": sessionId },
      body: JSON.stringify({ resolved: false, escalated: true, comment, conversationHistory }),
    }).catch(() => {});
  } finally {
    await fetch("/api/reset", { method: "POST", headers: { "x-session-id": sessionId } }).catch(() => {});
    addSystemDivider("Escalation recorded. Starting fresh for the next issue.");
    setTimeout(() => resetChat(), 1600);
  }
}

function escalateSession() {
  disableRows();
  addMessage("Please add any missing customer details, then continue with what needs escalating.", "bot", []);
  document.getElementById("input").focus();
}

function isFreeTextOption(label, value) {
  const text = `${String(label || "")} ${String(value || "")}`.toLowerCase();
  return text.includes("type details") || text.includes("not sure") || text.includes("type more details");
}

function startFreeTextClarification(label) {
  disableRows();
  pendingFreeTextClarification = true;
  addMessage(label, "user");
  addMessage("No problem. Type what the customer is trying to do. Helpful details: is it for a member, a staff/admin user, a booking, a payment, or a membership/billing task?", "bot", []);
  const input = document.getElementById("input");
  input.disabled = false;
  input.focus();
}

function buildClarificationPayload(message) {
  return `Clarification answer: ${message}`;
}

function inferClarificationOptions(text) {
  const lower = String(text || "").toLowerCase();
  const option = (label, value) => ({ label, value: value || `Clarification answer: ${label}` });
  if (lower.includes("full refund") && lower.includes("partial refund")) return [option("Full Refund", "This is a full refund"), option("Partial Refund", "This is a partial refund")];
  if (lower.includes("brs payments") && (lower.includes("yes") || lower.includes("taken through"))) return [option("Yes, BRS Payments", "The payment was taken through BRS Payments"), option("No, other payment method", "The payment was not taken through BRS Payments")];
  if (lower.includes("matching transaction") || lower.includes("transaction visible") || lower.includes("can you see a transaction")) return [option("Yes, transaction found", "Yes, I found the matching transaction in BRS Payments"), option("No, no transaction found", "No, I cannot find a matching transaction in BRS Payments")];
  if (lower.includes("payment symbol") || lower.includes("payment colour") || lower.includes("payment color")) return [option("Green - paid"), option("Blue - part paid"), option("Red - unpaid"), option("Yellow - overpaid")];
  if (lower.includes("member") && lower.includes("visitor") && lower.includes("competition") && (lower.includes("refund") || lower.includes("refunded"))) return [option("Member competition purse", "Clarification answer: Refund or adjust a member competition purse balance"), option("Visitor/open competition payment", "Clarification answer: Refund a visitor or guest open competition payment"), option("I'm not sure / type details", "Clarification answer: I need to type details instead")];
  if (lower.includes("who") && lower.includes("charging") && lower.includes("competition")) return [option("Members", "Clarification answer: Members competition charging through the competition purse"), option("Visitors", "Clarification answer: Visitors open competition charging through green fee or entry fee setup"), option("Both", "Clarification answer: Both members and visitors competition charging"), option("I'm not sure / type details", "Clarification answer: I need to type competition charging details")];
  if (lower.includes("members or visitors") || lower.includes("member or visitor")) return [option("Members", "Clarification answer: Members"), option("Visitors", "Clarification answer: Visitors"), option("Both", "Clarification answer: Both members and visitors"), option("I'm not sure / type details", "Clarification answer: I need to type details instead")];
  if (lower.includes("admin") && lower.includes("staff") && lower.includes("member profile")) return [option("Admin or staff user", "Clarification answer: Admin or staff user"), option("Member profile", "Clarification answer: Member profile"), option("I'm not sure / type details", "Clarification answer: I need to type details instead")];
  return [];
}

function addOptionButtons(div, options) {
  if (!options.length) return 0;
  const optionRow = document.createElement("div");
  optionRow.className = "option-row";
  let freeTextAdded = false;
  for (const o of options) {
    let label = o.label || String(o);
    let value = o.value || label;
    if (isFreeTextOption(label, value)) {
      if (freeTextAdded) continue;
      freeTextAdded = true;
      label = "I'm not sure / type details";
      value = "Clarification answer: I need to type details instead";
    }
    const b = document.createElement("button");
    b.className = "option-btn";
    b.type = "button";
    b.textContent = label;
    b.onclick = () => isFreeTextOption(label, value) ? startFreeTextClarification(label) : send(value, label);
    optionRow.appendChild(b);
  }
  div.appendChild(optionRow);
  activeOptionRow = optionRow;
  return options.length;
}

function getBotOptions(text, opts = []) {
  const provided = Array.isArray(opts) ? opts : [];
  return provided;
}

function getFollowUpHint(text) {
  const lower = String(text || "").toLowerCase();
  if (lower.includes("billing an individual member") && lower.includes("for a group")) return "The previous answer was about creating membership bills. The assistant asked whether the user wants steps for billing an individual member or for billing a group. Treat the next message as the answer to that choice, not as a new issue.";
  if (lower.includes("would you like") && lower.includes("individual") && lower.includes("group")) return "The assistant asked the user to choose between individual and group steps. Treat the next message as a follow-up choice.";
  if (lower.includes("which") && lower.includes("closest")) return "The assistant asked the user to choose the closest support route. Treat the next message as a clarification answer.";
  if ((lower.includes("which payment") || lower.includes("are you looking for a payment")) && lower.includes("booking")) return "The assistant asked which object the payment relates to. Treat the next message as a clarification answer, not as a new issue.";
  if (lower.includes("can you add a bit more detail")) return "The assistant asked for more detail about the current support issue. Treat the next message as a clarification, not a new issue.";
  return "";
}

function addMessage(text, sender = "bot", opts = [], variant = "", attachments = [], visualAids = []) {
  const chat = document.getElementById("chat");
  const row = document.createElement("div");
  row.className = `msg-row ${sender === "user" ? "user-row" : "bot-row"}`;
  const wrap = document.createElement("div");
  wrap.className = "msg-wrap";
  const div = document.createElement("div");
  div.className = `msg ${sender}${variant ? ` ${variant}` : ""}`;
  div.innerHTML = sender === "bot" ? formatBotMessageSafe(text) : esc(text);
  let optionCount = 0;
  if (sender === "bot") {
    optionCount = addOptionButtons(div, getBotOptions(text, opts));
    const hint = getFollowUpHint(text);
    if (hint) pendingFollowUpHint = hint;
  }
  wrap.appendChild(div);
  if (sender === "user") {
    const renderedAttachments = renderAttachmentThumbnails(attachments);
    if (renderedAttachments) wrap.insertAdjacentHTML("beforeend", renderedAttachments);
  } else {
    const renderedVisualAids = renderVisualAids(visualAids);
    if (renderedVisualAids) wrap.insertAdjacentHTML("beforeend", renderedVisualAids);
  }
  row.appendChild(wrap);
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
  return optionCount;
}

function formatActionDays(days = []) {
  const value = (Array.isArray(days) ? days : []).join(",");
  if (value === "mon,tue,wed,thu,fri") return "Monday to Friday";
  if (value === "sat,sun") return "Saturday and Sunday";
  if (value === "mon,tue,wed,thu,fri,sat,sun") return "Every day";
  const names = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
  return (Array.isArray(days) ? days : []).map((day) => names[day] || day).join(", ") || "Selected days";
}

function intervalText(action) {
  return action.operation === "add_tee_times_alternate_interval"
    ? `Alternative ${esc(action.firstIntervalMinutes)} and ${esc(action.secondIntervalMinutes)} minute intervals`
    : `${esc(action.intervalMinutes)} minute intervals`;
}

function detailItem(label, value) {
  return `<div class="detail-item"><div class="detail-label">${esc(label)}</div><div class="detail-value">${value}</div></div>`;
}

function addTimesheetSuccess(data) {
  const actions = Array.isArray(data?.plan?.actions) ? data.plan.actions : [];
  const chat = document.getElementById("chat");
  const row = document.createElement("div");
  row.className = "msg-row bot-row";
  const wrap = document.createElement("div");
  wrap.className = "msg-wrap";
  const div = document.createElement("div");
  div.className = "msg bot success";
  const count = actions.length || 1;
  let html = `<div class="success-panel"><div class="success-head"><div class="success-icon">✓</div><div><div class="success-title">Timesheet updated successfully</div><div class="success-subtitle">${count > 1 ? `${count} changes have` : "The change has"} been configured in BRS.</div></div></div>`;
  actions.forEach((action, index) => {
    html += `<div class="change-section"><div class="change-title"><span class="change-number">${index + 1}</span>Change ${index + 1}</div><div class="detail-grid">${detailItem("Dates", `${esc(action.startDay)} ${esc(action.startMonth)} ${esc(action.year)} to ${esc(action.endDay)} ${esc(action.endMonth)} ${esc(action.year)}`)}${detailItem("Days", esc(formatActionDays(action.days)))}${detailItem("Tee times", `${esc(action.firstHour)}:${esc(action.firstMinute)} to ${esc(action.lastHour)}:${esc(action.lastMinute)}`)}${detailItem("Intervals", intervalText(action))}</div></div>`;
  });
  html += '<div class="success-foot">The update is complete.</div></div>';
  div.innerHTML = html;
  wrap.appendChild(div);
  row.appendChild(wrap);
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function addMessageTyped(text, opts = [], visualAids = []) {
  const chat = document.getElementById("chat");
  const row = document.createElement("div");
  row.className = "msg-row bot-row";
  const wrap = document.createElement("div");
  wrap.className = "msg-wrap";
  const div = document.createElement("div");
  div.className = "msg bot typing-text";
  wrap.appendChild(div);
  row.appendChild(wrap);
  chat.appendChild(row);
  const message = String(text || "");
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    div.textContent = message;
  } else {
    for (let i = 0; i < message.length; i += 2) {
      div.textContent = message.slice(0, i + 2);
      chat.scrollTop = chat.scrollHeight;
      await sleep(message[i] === "\n" ? 90 : 12);
    }
  }
  div.classList.remove("typing-text");
  div.innerHTML = formatBotMessageSafe(message);
  const optionCount = addOptionButtons(div, getBotOptions(message, opts));
  const hint = getFollowUpHint(message);
  if (hint) pendingFollowUpHint = hint;
  const renderedVisualAids = renderVisualAids(visualAids);
  if (renderedVisualAids) wrap.insertAdjacentHTML("beforeend", renderedVisualAids);
  chat.scrollTop = chat.scrollHeight;
  return optionCount;
}

function showTyping() {
  removeTyping();
  const chat = document.getElementById("chat");
  typingRow = document.createElement("div");
  typingRow.className = "msg-row bot-row";
  typingRow.innerHTML = '<div class="msg-wrap"><div class="msg bot typing"><span class="work-icon" aria-hidden="true"></span><span>Working...</span></div></div>';
  chat.appendChild(typingRow);
  chat.scrollTop = chat.scrollHeight;
}

function removeTyping() {
  if (typingRow) {
    typingRow.remove();
    typingRow = null;
  }
}

function handleKey(e) {
  if (e.key === "Enter") send();
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The local server returned the app page instead of the API response. Restart npm start, then refresh http://localhost:3000.");
  }
}

async function send(m = null, d = null) {
  if (isSending) return;
  const input = document.getElementById("input");
  let typed = m || input.value.trim();
  const attachmentsToSend = m ? [] : pendingImageAttachments.slice();
  if (!typed && !attachmentsToSend.length) return;
  const hadPriorUserMessage = hasPriorUserMessage();
  if (!m && !pendingFreeTextClarification && pendingTimesheetRequest) {
    typed = `${pendingTimesheetRequest}. Additional details: ${typed}`;
    pendingTimesheetRequest = "";
  }
  const followUpHint = !m && !pendingFreeTextClarification ? pendingFollowUpHint : "";
  const newQuestionIntent = !m && !pendingFreeTextClarification && !followUpHint && !pendingTimesheetRequest && hadPriorUserMessage && wantsNewQuestion(typed);
  if (newQuestionIntent) {
    const nextQuestion = extractNewQuestion(typed);
    if (!nextQuestion) {
      input.value = "";
      startFreshPromptForNextQuestion(typed);
      input.focus();
      return;
    }
    typed = nextQuestion;
  }
  const shouldStartFresh = !m && !pendingFreeTextClarification && !followUpHint && !pendingTimesheetRequest && hadPriorUserMessage && (looksLikeStandaloneQuestion(typed) || newQuestionIntent);
  if (shouldStartFresh) startFreshSessionForRootQuestion();
  const outboundText = typed || "Please help with the attached screenshot.";
  const message = pendingFreeTextClarification && !m ? buildClarificationPayload(outboundText) : outboundText;
  pendingFreeTextClarification = false;
  disableRows();
  clearResolutionPrompt();
  addMessage(d || typed.replace(/^.*Additional details:\s*/, "") || typed || "Attached screenshot", "user", [], "", attachmentsToSend);
  input.value = "";
  pendingImageAttachments = [];
  renderAttachmentPreview();
  isSending = true;
  document.getElementById("sendBtn").disabled = true;
  document.getElementById("attachBtn").disabled = true;
  input.disabled = true;
  showTyping();

  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": sessionId },
      body: JSON.stringify({ message, contextHint: followUpHint, conversationHistory, attachments: attachmentsToSend }),
    });
    pendingFollowUpHint = "";
    const data = await readJsonResponse(r);
    if (Array.isArray(data.conversationHistory)) conversationHistory = data.conversationHistory;
    removeTyping();
    if (data.action === "timesheet.configure") {
      if (data.status === "needs_clarification") pendingTimesheetRequest = message;
      else pendingTimesheetRequest = "";
      if (data.status === "completed") addTimesheetSuccess(data);
      else addMessage(data.reply || data.error || "I could not run that timesheet request.", "bot", [], "", [], data.images || []);
      return;
    }
    pendingTimesheetRequest = "";
    const optionCount = await addMessageTyped(data.reply || "No response received.", data.options || [], data.images || []);
    maybeAddResolutionPrompt(data, optionCount);
  } catch (e) {
    removeTyping();
    addMessage("There was a problem sending your message. Please try again.", "bot");
  } finally {
    isSending = false;
    document.getElementById("sendBtn").disabled = false;
    document.getElementById("attachBtn").disabled = false;
    input.disabled = false;
    input.focus();
  }
}

function resetChat() {
  removeTyping();
  document.getElementById("chat").innerHTML = "";
  activeOptionRow = null;
  activeResolutionRow = null;
  activeRatingRow = null;
  pendingFreeTextClarification = false;
  pendingFollowUpHint = "";
  pendingTimesheetRequest = "";
  pendingImageAttachments = [];
  renderAttachmentPreview();
  sessionId = crypto.randomUUID();
  conversationHistory = [];
  localStorage.setItem("brsSupportSessionId", sessionId);
  addWelcome();
}

addWelcome();
