const ENCRYPTION_KEY_STORAGE_KEY = "slackeee-key";

// Saves the encryption key entered by the user to the browser's storage.
function saveEncryptionKey() {
  const encryptionKeyInput = document.getElementById("encryption-key");
  const encryptionKey = encryptionKeyInput.value;
  if (encryptionKey) {
    browser.storage.sync
      .set({ [ENCRYPTION_KEY_STORAGE_KEY]: encryptionKey })
      .then(() => {
        document.getElementById("success-message").style.display = "block";
        setTimeout(() => {
          document.getElementById("success-message").style.display = "none";
        }, 3000);
      });
  } else {
    alert("Please enter a valid encryption key.");
  }
}

// Loads the encryption key from the browser's synchronized storage and sets it
function loadEncryptionKey() {
  browser.storage.sync.get(ENCRYPTION_KEY_STORAGE_KEY).then((result) => {
    const encryptionKey = result[ENCRYPTION_KEY_STORAGE_KEY] || "";
    try {
      document.getElementById("encryption-key").value = encryptionKey;
    } catch (error) {
      console.log("Error loading encryption key:", error);
    }
  });
}

function initializeEventListeners() {
  document
    .getElementById("save-key")
    .addEventListener("click", saveEncryptionKey);
  loadEncryptionKey();
}

document.addEventListener("DOMContentLoaded", initializeEventListeners);
