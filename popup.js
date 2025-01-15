const encryptionKeyInput = document.getElementById("encryption-key");
const successMessage = document.getElementById("success-message");

function saveEncryptionKey() {
  const encryptionKey = encryptionKeyInput.value.trim();
  if (encryptionKey) {
    browser.runtime
      .sendMessage({ type: "SET_KEY", key: encryptionKey })
      .then((response) => {
        if (response.success) {
          successMessage.style.display = "block";
        }
      })
      .catch((error) => {
        console.error("Error:", error);
      });
  }
}

function loadEncryptionKey() {
  browser.runtime
    .sendMessage({ type: "GET_KEY" })
    .then((response) => {
      try {
        if (response.success) {
          encryptionKeyInput.value = response.key || "";
        }
      } catch (error) {
        console.error("Error loading encryption key:", error);
      }
    })
    .catch((error) => {
      console.error("Error:", error);
    });
}

function initializeEventListeners() {
  document
    .getElementById("save-key")
    .addEventListener("click", saveEncryptionKey);
  loadEncryptionKey();
}

document.addEventListener("DOMContentLoaded", initializeEventListeners);
