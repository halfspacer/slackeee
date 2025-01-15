browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "SET_KEY") {
    browser.storage.sync
      .set({ slackeeeKey: request.key })
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.type === "GET_KEY") {
    browser.storage.sync
      .get("slackeeeKey")
      .then(({ slackeeeKey }) => {
        if (slackeeeKey) {
          sendResponse({ success: true, key: slackeeeKey });
        } else {
          sendResponse({ success: false, error: "No encryption key found." });
        }
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});
