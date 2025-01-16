const encryptionKeyInput = document.getElementById("encryption-key");
const successMessage = document.getElementById("success-message");
const saveKeyButton = document.getElementById("save-key");
const generateKeyButton = document.getElementById("generate-key");
const copyButton = document.getElementById("copy-key");

if (typeof browser === "undefined") {
  var browser = chrome;
}

function parseConversationId(url) {
  // Example Slack URL: https://app.slack.com/client/TEAM_ID/CHANNEL_ID
  const parts = url.split("/");
  return parts[parts.length - 1] || null;
}

function loadEncryptionKey() {
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (tabs && tabs.length) {
      const conversationId = parseConversationId(tabs[0].url);

      // If title doesn't contain (DM) or (Channel), return
      const pageTitle = tabs[0].title;
      if (!pageTitle.includes("(DM)") && !pageTitle.includes("(Channel)")) {
        return;
      }

      if (conversationId) {
        getEncryptionKeyForConversationIfAvailable(conversationId).then((key) => {
          if (key) {
            encryptionKeyInput.value = key;
            toggleCopyButton();

            // The name of the person or channel is the first part of the title (before the (DM) part)
            const titleParts = pageTitle.split(" (DM)");
            const conversationName = titleParts[0];
            // Set the encryption-key-label to the conversation name
            document.getElementById("encryption-key-label").innerHTML = `Secure conversation with <b>${conversationName}</b>`;
          }
        });
      }
    }
  });
}

function saveEncryptionKeyForConversation() {
  const encryptionKey = encryptionKeyInput.value.trim();
  if (!encryptionKey) return;

  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (!tabs || !tabs.length) return;
    const conversationId = parseConversationId(tabs[0].url);
    if (!conversationId) return;

    // Retrieve existing conversation-based keys
    browser.storage.sync.get("slackeeeConversationKeys").then((result) => {
      const conversationKeys = result.slackeeeConversationKeys || {};
      conversationKeys[conversationId] = encryptionKey;
      // Store updated conversation keys
      browser.storage.sync.set({ slackeeeConversationKeys: conversationKeys }).then(() => {
        successMessage.style.display = "block";
      });
    });
  });
}

function getEncryptionKeyForConversationIfAvailable(conversationId) {
  return browser.storage.sync.get("slackeeeConversationKeys").then((result) => {
    const conversationKeys = result.slackeeeConversationKeys || {};
    return conversationKeys[conversationId] || null;
  });
}

/**
 * Generates a secure random key of specified length including special characters.
 * @param {number} length - The length of the key to generate.
 * @returns {string} The generated secure key.
 */
function generateSecureKey(length = 16) {
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_-+[]{}?";
  let key = "";
  const array = new Uint32Array(length);
  window.crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    key += charset[array[i] % charset.length];
  }
  return key;
}

function generateKey() {
  const secureKey = generateSecureKey(16);
  encryptionKeyInput.value = secureKey;
  toggleCopyButton();
}

function copyKeyToClipboard() {
  const encryptionKey = encryptionKeyInput.value.trim();
  if (encryptionKey) {
    navigator.clipboard
      .writeText(encryptionKey)
      .then(() => {
        const icon = copyButton.querySelector("i");
        icon.classList.remove("bi-clipboard");
        icon.classList.add("bi-clipboard-check");

        setTimeout(() => {
          icon.classList.remove("bi-clipboard-check");
          icon.classList.add("bi-clipboard");
        }, 2000);
        saveEncryptionKeyForConversation();
      })
      .catch((err) => {
        console.error("Failed to copy: ", err);
      });
  }
}

function toggleCopyButton() {
  // If title doesn't contain (DM) or (Channel), return
  const pageTitle = tabs[0].title;
  if (!pageTitle.includes("(DM)") && !pageTitle.includes("(Channel)")) {
    copyButton.style.display = "none";
    return;
  }

  if (encryptionKeyInput.value.trim()) {
    copyButton.style.display = "inline-block";
  } else {
    copyButton.style.display = "none";
  }
}

function toggleSlackOption() {
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (!tabs || !tabs.length) return;
    const slackUrlPattern = /^https:\/\/app\.slack\.com\/client\/[^/]+\/[^/]+/;
    const isSlackConversation = slackUrlPattern.test(tabs[0].url);

    if (isSlackConversation && pageTitle.includes("(DM)") || pageTitle.includes("(Channel)")) {
      // Enable elements
      encryptionKeyInput.disabled = false;
      saveKeyButton.disabled = false;
      generateKeyButton.disabled = false;
      copyButton.disabled = false;
      encryptionKeyInput.placeholder = "Enter your key";
    } else {
      // Disable elements
      encryptionKeyInput.disabled = true;
      saveKeyButton.disabled = true;
      generateKeyButton.disabled = true;
      copyButton.disabled = true;
      encryptionKeyInput.placeholder = "Visit a Slack conversation";
      encryptionKeyInput.value = ""; // Optional: Clear any existing value
      copyButton.style.display = "none"; // Hide copy button if not applicable
    }
  });
}

function initializeEventListeners() {
  if (saveKeyButton) {
    saveKeyButton.addEventListener("click", saveEncryptionKeyForConversation);
  }

  const saveConversationButton = document.getElementById("save-conversation-key");
  if (saveConversationButton) {
    saveConversationButton.addEventListener("click", saveEncryptionKeyForConversation);
  }

  if (generateKeyButton) {
    generateKeyButton.addEventListener("click", generateKey);
  }

  if (copyButton) {
    copyButton.addEventListener("click", copyKeyToClipboard);
  }

  encryptionKeyInput.addEventListener("input", toggleCopyButton);
  loadEncryptionKey();
  toggleSlackOption();
}

document.addEventListener("DOMContentLoaded", initializeEventListeners);