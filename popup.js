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

function initializeEventListeners() {
  document
    .getElementById("save-key")
    .addEventListener("click", saveEncryptionKey);
  loadEncryptionKey();
}

document.addEventListener("DOMContentLoaded", initializeEventListeners);
