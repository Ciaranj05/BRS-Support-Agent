(() => {
  const MIN_VISIBLE_MS = 700;

  let shownAt = 0;
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
    typingRow.innerHTML = '<div class="msg-wrap"><div class="msg bot typing" aria-label="Checking approved guidance"><span class="work-icon" aria-hidden="true"></span><span class="processing-label">Checking approved guidance...</span></div></div>';
    chat.appendChild(typingRow);
    chat.scrollTop = chat.scrollHeight;
  };

  removeTyping = function removeAssistantProcessing() {
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
