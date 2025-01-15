const encryptionKeyInput = document.getElementById("encryption-key");
const successMessage = document.getElementById("success-message");

if (typeof browser === "undefined") {
  var browser = chrome;
}

function saveEncryptionKey() {
  const encryptionKey = encryptionKeyInput.value.trim();
  if (encryptionKey) {
    setKey(encryptionKey)
      .then((response) => {
        if (response.success) {
          successMessage.style.display = "block";
          browser.tabs.query({ url: "*://*.slack.com/*" }).then((tabs) => {
            tabs.forEach((tab) => {
              browser.tabs.reload(tab.id);
            });
          });
        }
      })
      .catch((error) => {
        console.error("Error:", error);
      });
  }
}

function loadEncryptionKey() {
  getKey()
    .then((response) => {
      if (response.success) {
        encryptionKeyInput.value = response.key || "";
        toggleCopyButton();
      }
    })
    .catch((error) => {
      console.error("Error:", error);
    });
}

function setKey(key) {
  return browser.storage.sync
    .set({ slackeeeKey: key })
    .then(() => ({ success: true }))
    .catch((error) => ({ success: false, error: error.message }));
}

function getKey() {
  return browser.storage.sync
    .get("slackeeeKey")
    .then(({ slackeeeKey }) => {
      if (slackeeeKey) {
        return { success: true, key: slackeeeKey };
      } else {
        return { success: false, error: "No encryption key found." };
      }
    })
    .catch((error) => ({ success: false, error: error.message }));
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

const copyButton = document.getElementById("copy-key");

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
        saveEncryptionKey();
      })
      .catch((err) => {
        console.error("Failed to copy: ", err);
      });
  }
}

function toggleCopyButton() {
  if (encryptionKeyInput.value.trim()) {
    copyButton.style.display = "inline-block";
  } else {
    copyButton.style.display = "none";
  }
}

function initializeEventListeners() {
  const saveButton = document.getElementById("save-key");
  const generateButton = document.getElementById("generate-key");
  const copyButton = document.getElementById("copy-key");

  if (saveButton) {
    saveButton.addEventListener("click", saveEncryptionKey);
  } else {
    console.error("Save Key button not found");
  }

  if (generateButton) {
    generateButton.addEventListener("click", generateKey);
  } else {
    console.error("Generate Key button not found");
  }

  if (copyButton) {
    copyButton.addEventListener("click", copyKeyToClipboard);
  } else {
    console.error("Copy Key button not found");
  }

  encryptionKeyInput.addEventListener("input", toggleCopyButton);

  loadEncryptionKey();
}

document.addEventListener("DOMContentLoaded", initializeEventListeners);
