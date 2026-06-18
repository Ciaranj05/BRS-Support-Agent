(() => {
  const MIN_VISIBLE_MS = 700;
  const LONG_RUNNING_MS = 2000;

  let shownAt = 0;
  let longRunningTimer = null;
  const originalReadJsonResponse = readJsonResponse;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  showTyping = function showAssistantProcessing() {
    removeTyping();
    const chat = document.getElementById("chat");
    shownAt = performance.now();
    typingRow = document.createElement("div");
    typingRow.className = "msg-row bot-row";
    typingRow.innerHTML = '<div class="msg-wrap"><div class="msg bot typing" aria-label="Assistant response pending"><span class="work-icon" aria-hidden="true"></span><span class="processing-dots" aria-hidden="true"><i></i><i></i><i></i></span></div></div>';
    chat.appendChild(typingRow);
    chat.scrollTop = chat.scrollHeight;

    longRunningTimer = setTimeout(() => {
      typingRow?.querySelector(".typing")?.classList.add("long-running");
    }, LONG_RUNNING_MS);
  };

  removeTyping = function removeAssistantProcessing() {
    if (longRunningTimer) {
      clearTimeout(longRunningTimer);
      longRunningTimer = null;
    }

    if (typingRow) {
      typingRow.remove();
      typingRow = null;
    }
  };

  readJsonResponse = async function readJsonResponseWithMinimumIndicator(response) {
    const data = await originalReadJsonResponse(response);
    const elapsed = performance.now() - shownAt;
    if (shownAt && elapsed < MIN_VISIBLE_MS) {
      await wait(MIN_VISIBLE_MS - elapsed);
    }
    return data;
  };
})();
