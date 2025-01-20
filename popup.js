const encryptionKeyInput = document.getElementById("encryption-key");
const successMessage = document.getElementById("success-message");
const saveKeyButton = document.getElementById("save-key");
const generateKeyButton = document.getElementById("generate-key");
const copyButton = document.getElementById("copy-key");

if (typeof browser === "undefined") {
  var browser = chrome;
}

function parseConversationId(url) {
  // https://app.slack.com/client/TEAM_ID/CHANNEL_ID
  const parts = url.split("/");
  return parts[parts.length - 1].split("?")[0] || null;
}

function loadEncryptionKeyForPopup() {
  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (tabs && tabs.length) {
      const conversationId = parseConversationId(tabs[0].url);

      // If title doesn't contain (DM) or (Channel), return
      const pageTitle = tabs[0].title;
      console.error("pageTitle", pageTitle);
      if (!isDirectMessagePage(pageTitle) && !isChannelPage(pageTitle)) {
        return;
      }

      if (conversationId) {
        getKeyForConversationIfAvailable(conversationId).then((key) => {
          let titleParts = pageTitle;
          titleParts = titleParts.split("(");
          const isDM = isDirectMessagePage(pageTitle);

          const conversationName = titleParts[0];
          const withElement = document.createTextNode("with ");
          const inElement = document.createTextNode("in ");
          const hashBold = document.createElement("b");
          hashBold.textContent = "#";

          if (key) {
            encryptionKeyInput.value = key;
            toggleCopyButton();

            // Set the encryption-key-label to the conversation name
            const encryptionKeyLabel = document.getElementById(
              "encryption-key-label"
            );

            // Clear existing content
            while (encryptionKeyLabel.firstChild) {
              encryptionKeyLabel.removeChild(encryptionKeyLabel.firstChild);
            }

            // Create and append the text node
            const textNode = document.createTextNode(`Secure conversation `);

            encryptionKeyLabel.appendChild(textNode);
            encryptionKeyLabel.appendChild(isDM ? withElement : inElement);

            // Create and append the <b> element with the conversation name
            const boldElement = document.createElement("b");
            boldElement.textContent = conversationName;
            encryptionKeyLabel.appendChild(boldElement);
          } else {
            // Set the encryption-key-label to the conversation name
            // Set the encryption-key-label to the conversation name
            const encryptionKeyLabel = document.getElementById(
              "encryption-key-label"
            );

            // Clear existing content
            while (encryptionKeyLabel.firstChild) {
              encryptionKeyLabel.removeChild(encryptionKeyLabel.firstChild);
            }

            // Create and append the text node
            const textNode = document.createTextNode(
              `Start a secure conversation `
            );
            encryptionKeyLabel.appendChild(textNode);
            encryptionKeyLabel.appendChild(isDM ? withElement : inElement);

            // Create and append the <b> element with the conversation name
            const boldElement = document.createElement("b");
            boldElement.textContent = conversationName;
            if (!isDM) {
              encryptionKeyLabel.appendChild(hashBold);
            }
            encryptionKeyLabel.appendChild(boldElement);
            toggleCopyButton();
          }
        });
      }
    }
  });
}

function saveEncryptionKeyForConversation() {
  const encryptionKey = encryptionKeyInput.value.trim();

  console.error("encryptionKey", encryptionKey);
  if (!encryptionKey) return;

  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    console.error("tabs", tabs);
    if (!tabs || !tabs.length) return;
    const conversationId = parseConversationId(tabs[0].url);

    console.error("conversationId", conversationId);
    if (!conversationId) return;

    // Retrieve existing conversation-based keys
    browser.storage.sync
      .get("slackeeeConversationKeys")
      .then((result) => {
        console.error("result", result);
        const conversationKeys = result.slackeeeConversationKeys || {};
        conversationKeys[conversationId] = encryptionKey;
        // Store updated conversation keys
        browser.storage.sync
          .set({ slackeeeConversationKeys: conversationKeys })
          .then(() => {
            successMessage.style.display = "block";

            console.error(
              "Saved key ",
              encryptionKey,
              " for conversation ",
              conversationId
            );

            // Reload the Slack tab
            browser.tabs.reload(tabs[0].id);
          });
      })
      .catch((err) => {
        console.error("Failed to save key: ", err);
      });
  });
}

function getKeyForConversationIfAvailable(conversationId) {
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

function toggleCopyButton(enable) {
  // If title doesn't contain (DM) or (Channel), return
  if (!enable) {
    copyButton.style.display = "none";
    return;
  }

  if (encryptionKeyInput.value.trim()) {
    copyButton.style.display = "inline-block";
  } else {
    copyButton.style.display = "none";
  }
}

function toggleSlackOption(enable) {
  if (enable) {
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
    encryptionKeyInput.value = "";
    copyButton.style.display = "none";
  }
}

function initializeEventListeners() {
  if (saveKeyButton) {
    saveKeyButton.addEventListener("click", saveEncryptionKeyForConversation);
  }

  const saveConversationButton = document.getElementById(
    "save-conversation-key"
  );
  if (saveConversationButton) {
    saveConversationButton.addEventListener(
      "click",
      saveEncryptionKeyForConversation
    );
  }

  if (generateKeyButton) {
    generateKeyButton.addEventListener("click", generateKey);
  }

  if (copyButton) {
    copyButton.addEventListener("click", copyKeyToClipboard);
  }

  encryptionKeyInput.addEventListener("input", toggleCopyButton);

  browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (!tabs || !tabs.length) return;
    const slackUrlPattern = /^https:\/\/app\.slack\.com\/client\/[^/]+\/[^/]+/;
    const isSlackConversation = slackUrlPattern.test(tabs[0].url);
    const pageTitle = tabs[0].title;

    if (isSlackConversation) {
      // If title contains (DM) or (Channel), enable Slack options
      if (isDirectMessagePage(pageTitle) || isChannelPage(pageTitle)) {
        toggleSlackOption(true);
        toggleCopyButton(true);
        loadEncryptionKeyForPopup();
      }
    } else {
      toggleSlackOption(false);
      toggleCopyButton(false);
    }
  });
}

function isChannelPage(title) {
  title = title.toLowerCase();
  return (
    title.includes("(channel)") ||
    title.includes("(canal)") ||
    title.includes("(canale)") ||
    title.includes("(チャンネル)") ||
    title.includes("(渠道)") ||
    title.includes("(频道)") ||
    title.includes("(채널)")
  );
}

function isDirectMessagePage(title) {
  title = title.toLowerCase();
  return (
    title.includes("(dm)") ||
    title.includes("(md)") ||
    title.includes("(direct message)") ||
    title.includes("(message direct)") ||
    title.includes("(mensaje directo)") ||
    title.includes("(mensajes directos)") ||
    title.includes("(私信)") ||
    title.includes("((私訊)")
  );
}

function getDirectMessageName(title) {
  switch (title) {
    case "(dm)":
      return "Direct Message";
    case "(md)":
      return "Mensaje Directo";
    case "(direct message)":
      return "Direct Message";
    case "(message direct)":
      return "Message Direct";
    case "(mensaje directo)":
      return "Mensaje Directo";
    case "(mensajes directos)":
      return "Mensajes Directos";
    case "(私信)":
      return "私信";
    case "(私訊)":
      return "私訊";
  }
}

function getChannelName(title) {
  switch (title) {
    case "(channel)":
      return "Channel";
    case "(canal)":
      return "Canal";
    case "(canale)":
      return "Canale";
    case "(チャンネル)":
      return "チャンネル";
    case "(渠道)":
      return "渠道";
    case "(频道)":
      return "频道";
    case "(채널)":
      return "채널";
  }
}

document.addEventListener("DOMContentLoaded", initializeEventListeners);
