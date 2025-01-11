// Constants
const clonedWysiwygContainerId = ".c-wysiwyg_container__button--send-encrypted";
const key = "slackeee-key";
const messageElementId =
  ".p-message_pane_message__message .p-rich_text_section";
const sendButtonContainerId = '[class*="c-wysiwyg_container__send_button"]';
const encryptionDelimiter = "¤";
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

// Variables
let clonedSendButtonContainer = null;
let messageContainer = null;
let messageInput = null;
let sendButtonContainer = null;

/**
 * Encrypt a message using AES-GCM.
 * @param {string} message - The message to encrypt.
 * @param {string} key - The encryption key.
 * @returns {Promise<{encryptedMessage: Uint8Array, iv: Uint8Array}>} - The encrypted message and Initialization Vector (IV).
 */
async function encryptMessage(message, key) {
  try {
    // Generate a random Initialization Vector (IV)
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    // Encode the message to a Uint8Array
    const encodedMessage = textEncoder.encode(message);

    // Hash the key using SHA-256
    const hashedKey = await hashKey(key);

    // Import the hashed key for AES-GCM encryption
    const cryptoKey = await window.crypto.subtle.importKey(
      "raw",
      hashedKey,
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );

    // Encrypt the message
    const encryptedMessage = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      cryptoKey,
      encodedMessage
    );

    // Return the encrypted message and IV
    return { encryptedMessage: new Uint8Array(encryptedMessage), iv: iv };
  } catch (error) {
    console.error("Encryption failed:", error);
    throw error;
  }
}

/**
 * Hash a key using SHA-256.
 * @param {string} key - The key to hash. This should be a string that will be converted to a Uint8Array and hashed using SHA-256.
 * @returns {Promise<Uint8Array>} - The hashed key.
 */
async function hashKey(key) {
  const data = textEncoder.encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hash);
}

/**
 * Initializes the extension by setting up the Send Encrypted button,
 * adding necessary styles, and attaching event listeners for detecting new messages and input changes.
 *
 * @param {string} key - The key used for encryption/decryption of messages.
 */
function Initialize(key) {
  removeExistingSendButton();
  addSendButtonStyles();

  if (sendButtonContainer && messageInput) {
    clonedSendButtonContainer = createSendButton(sendButtonContainer);
    if (!clonedSendButtonContainer) {
      return;
    }
    initializeTooltip(clonedSendButtonContainer);
    addInputEventListener(messageInput, clonedSendButtonContainer);
    observeIncomingMessages();
    addSendButtonClickListener(
      clonedSendButtonContainer,
      messageInput,
      sendButtonContainer,
      key
    );
    decryptMessagesPeriodically();
  }
}

function removeExistingSendButton() {
  const existingButton = document.getElementById(
    "cloned-send-button-container"
  );
  if (existingButton) {
    existingButton.remove();
  }
}

function addSendButtonStyles() {
  const style = document.createElement("style");
  style.innerHTML = `
  .c-wysiwyg_container__button--send-encrypted {
    background-color:rgb(175, 76, 76); /* Red background */
    color: white; /* White text */
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    border-radius: 4px;
  }

  .c-wysiwyg_container__button--send-encrypted .send-icon {
    margin-right: 5px;
  }

  .c-wysiwyg_container__button--send-encrypted .lock-icon {
    width: 16px;
    height: 16px;
  }

  .c-wysiwyg_container__button--send-encrypted:hover {
    background-color:rgb(209, 63, 63); /* Darker red on hover */
  }
`;
  document.head.appendChild(style);
}

function createSendButton(sendButtonContainer) {
  const clonedSendButtonContainer = document.createElement("span");
  clonedSendButtonContainer.classList.add(
    "c-wysiwyg_container__send_button--with_options"
  );
  clonedSendButtonContainer.innerHTML = `
    <button type="button" class="c-wysiwyg_container__button--send-encrypted" aria-label="Send Encrypted Message" title="Send Encrypted Message" data-qa="texty_send_button" data-sk="tooltip_parent" style="margin-right: 8px;">
      <svg aria-hidden="true" viewBox="0 0 20 20" class="send-icon">
        <path fill="currentColor" d="M1.5 2.25a.755.755 0 0 1 1-.71l15.596 7.808a.73.73 0 0 1 0 1.305L2.5 18.462l-.076.018a.75.75 0 0 1-.924-.728v-4.54c0-1.21.97-2.229 2.21-2.25l6.54-.17c.27-.01.75-.24.75-.79s-.5-.79-.75-.79l-6.54-.17A2.253 2.253 0 0 1 1.5 6.79z"></path>
      </svg>
      <svg aria-hidden="true" viewBox="0 0 20 20" class="lock-icon">
        <path fill="currentColor" d="M10 2a4 4 0 0 0-4 4v4H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1V6a4 4 0 0 0-4-4zm-2 4a2 2 0 1 1 4 0v4H8V6zm-1 6h6v5H7v-5z"></path>
      </svg>
    </button>
  `;
  clonedSendButtonContainer.id = "cloned-send-button-container";
  if (!sendButtonContainer.parentNode) {
    return;
  }
  if (sendButtonContainer.nextSibling) {
    sendButtonContainer.parentNode.insertBefore(
      clonedSendButtonContainer,
      sendButtonContainer.nextSibling
    );
  } else {
    sendButtonContainer.parentNode.insertBefore(
      clonedSendButtonContainer,
      sendButtonContainer.parentNode.firstChild
    );
  }
  return clonedSendButtonContainer;
}

/**
 * Initializes a tooltip for the provided cloned send button container.
 * When the mouse enters the element with the specified tooltip parent ID,
 * There is probably a better way to properly trigger the native Slack tooltip, but I couldn't really figure it out.
 *
 * @param {HTMLElement} clonedSendButtonContainer - The container element that contains the cloned send button.
 */
function initializeTooltip(clonedSendButtonContainer) {
  const tooltipParentId = '[data-sk="tooltip_parent"]';
  let tooltipParent = clonedSendButtonContainer.querySelector(tooltipParentId);
  if (tooltipParent) {
    tooltipParent.addEventListener("mouseenter", () => {
      const tooltip = document.createElement("div");
      tooltip.className =
        "ReactModal__Content ReactModal__Content--after-open popover c-popover__content";
      tooltip.setAttribute("role", "tooltip");
      tooltip.innerHTML = `
        <div role="presentation">
          <div class="c-tooltip__tip c-tooltip__tip--top-right c-tooltip__tip--small" data-qa="tooltip-tip" data-sk="tooltip" style="left: -75%;">
            <span class="c-keyboard_keys--title" aria-hidden="true">Send Encrypted Message</span>
            <div class="c-tooltip__tip__arrow" data-qa="tooltip-tip-arrow"></div>
          </div>
        </div>
      `;
      document.body.appendChild(tooltip);

      const rect = tooltipParent.getBoundingClientRect();
      tooltip.style.position = "absolute";
      tooltip.style.left = `${rect.left}px`;
      tooltip.style.top = `${rect.top - tooltip.offsetHeight}px`;

      tooltipParent.addEventListener(
        "mouseleave",
        () => {
          tooltip.remove();
        },
        { once: true }
      );
    });
  }
}

/**
 * Updates the color of the send button based on the content of the message input.
 * Just mimicking the original Slack send button behavior.
 */
function addInputEventListener(messageInput, clonedSendButtonContainer) {
  const updateButtonColor = () => {
    const button = clonedSendButtonContainer.querySelector(
      clonedWysiwygContainerId
    );

    const icons = clonedSendButtonContainer.querySelectorAll("svg");
    if (messageInput.textContent.trim() === "") {
      button.style.backgroundColor = "#222529"; // Gray color for empty input
      icons.forEach((icon) => {
        icon.style.opacity = "0.5";
      });
    } else {
      button.style.backgroundColor = "rgb(175, 76, 76)"; // Original color for non-empty input
      icons.forEach((icon) => {
        icon.style.opacity = "1";
      });
    }
  };

  messageInput.addEventListener("keyup", updateButtonColor);
  updateButtonColor(); // Initial check
}

/**
 * Adds a click event listener to the cloned send button container that encrypts the message input
 * before sending it.
 */
function addSendButtonClickListener(
  clonedSendButtonContainer,
  messageInput,
  sendButtonContainer,
  key
) {
  clonedSendButtonContainer.addEventListener("click", async () => {
    const messageText = messageInput.textContent;
    const data = await browser.storage.sync.get(key);
    const encryptionKey = data[key];
    if (!encryptionKey) {
      alert("Please set an encryption key first.");
      return;
    }

    try {
      const { encryptedMessage, iv } = await encryptMessage(
        messageText,
        encryptionKey
      );

      const encryptedMessageBase64 = btoa(
        String.fromCharCode.apply(null, encryptedMessage)
      );
      const ivBase64 = btoa(String.fromCharCode.apply(null, iv));
      const invisibleChar = "¤";
      const finalMessage = `${encryptedMessageBase64}:${ivBase64}${invisibleChar}`;

      messageInput.textContent = finalMessage;
      messageInput.dispatchEvent(new Event("input", { bubbles: true }));

      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (
            mutation.type === "childList" ||
            mutation.type === "characterData"
          ) {
            const originalSendButton =
              sendButtonContainer.querySelector("button");
            if (originalSendButton) {
              originalSendButton.click();
            }
            observer.disconnect();
          }
        });
      });

      observer.observe(messageInput, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    } catch (error) {
      console.error("Failed to encrypt and send the message:", error);
    }
  });
}

/**
 * Decrypt a message using AES-GCM.
 * @param {Uint8Array} encryptedMessage - The encrypted message.
 * @param {Uint8Array} iv - The Initialization Vector (IV).
 * @param {string} key - The encryption key.
 * @returns {Promise<string>} - The decrypted message.
 * @throws {Error} - If the decryption fails.
 */
async function decryptMessage(encryptedMessage, iv, key) {
  try {
    // Hash the key using SHA-256
    const hashedKey = await hashKey(key);

    // Import the hashed key for AES-GCM decryption
    const cryptoKey = await window.crypto.subtle.importKey(
      "raw",
      hashedKey,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    // Decrypt the message
    const decryptedMessage = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      cryptoKey,
      encryptedMessage
    );

    // Decode the decrypted message to a string
    const decodedMessage = textDecoder.decode(decryptedMessage);

    return decodedMessage;
  } catch (error) {
    console.error("Decryption failed:", error);
    throw error;
  }
}

/**
 * Decrypts all messages in the message container that end with a special character.
 *
 * This function retrieves all message elements, checks if they end with the specified
 * encryption delimiter, and decrypts them using the stored encryption key.
 * The decrypted messages are prefixed with a lock icon.
 *
 * @async
 * @function decryptAllMessages
 * @returns {Promise<void>} A promise that resolves when all messages have been processed.
 */
async function decryptAllMessages() {
  // Get all message elements
  var messageElements = messageContainer.querySelectorAll(messageElementId);

  for (const messageElement of messageElements) {
    const messageText = messageElement.textContent;
    if (!messageText) {
      continue;
    }

    // We're only interested in messages that end with the special character
    if (!messageText.endsWith(encryptionDelimiter)) {
      continue;
    }

    // Check if the message ends with the special character
    if (messageText.endsWith(encryptionDelimiter)) {
      const [encryptedMessageBase64, ivBase64] = messageText
        .split(encryptionDelimiter)[0]
        .split(":");
      const encryptedMessage = new Uint8Array(
        atob(encryptedMessageBase64)
          .split("")
          .map((char) => char.charCodeAt(0))
      );
      const iv = new Uint8Array(
        atob(ivBase64)
          .split("")
          .map((char) => char.charCodeAt(0))
      );

      // Get the encryption key from browser.storage
      const data = await browser.storage.sync.get(key);
      const encryptionKey = data[key];
      if (!encryptionKey) {
        return;
      }

      // Decrypt the message
      try {
        const decryptedMessage = await decryptMessage(
          encryptedMessage,
          iv,
          encryptionKey
        );

        const lockIcon = document.createElement("svg");
        lockIcon.setAttribute("aria-hidden", "true");
        lockIcon.setAttribute("viewBox", "0 0 20 20");
        lockIcon.classList.add("lock-icon");
        lockIcon.innerHTML = `
        <span class="c-icon c-icon--lock" data-qa="lock-icon" style="margin-right: 5px;">
          <svg aria-hidden="true" viewBox="0 0 20 20">
            <path fill="currentColor" d="M10 2a4 4 0 0 0-4 4v4H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1V6a4 4 0 0 0-4-4zm-2 4a2 2 0 1 1 4 0v4H8V6zm-1 6h6v5H7v-5z"></path>
          </svg>
        </span>
        `;

        const container = document.createElement("div");
        container.classList.add("message-container");
        container.style.display = "flex";
        container.style.alignItems = "center";

        // Append the lock icon and the message to the container
        container.appendChild(lockIcon);
        const messageText = document.createElement("span");
        messageText.textContent = decryptedMessage;
        container.appendChild(messageText);

        // Append the container to the message element
        messageElement.innerHTML = "";
        messageElement.appendChild(container);
      } catch (error) {}
    }
  }
}

// Observe the message container for new messages
function observeIncomingMessages() {
  const messageContainer = document.querySelector(".c-message_list");
  const headerTextContainer = document.querySelector(".p-view_header__text");

  if (messageContainer) {
    const messageObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (
            node.classList &&
            node.classList.contains("c-virtual_list__item")
          ) {
            decryptAllMessages();
          }
        }
      }
    });

    messageObserver.observe(messageContainer, {
      childList: true,
      subtree: true,
    });
  }

  if (headerTextContainer) {
    const headerObserver = new MutationObserver(() => {
      decryptAllMessages();
    });

    headerObserver.observe(headerTextContainer, {
      childList: true,
      subtree: true,
    });
  }
}

/**
 * I couldn't easily find a reliable way to detect when new Slack messages are added to the DOM during the initial page load.
 * So, I'm decrypting all messages periodically every 2 seconds until the page is sure to be loaded.
 */
function decryptMessagesPeriodically() {
  let counter = 0;
  const interval = setInterval(() => {
    decryptAllMessages();
    counter += 2;
    if (counter >= 10) {
      clearInterval(interval);
    }
  }, 2000);
}

//We wait for all the necessary elements to be available before initializing.
function onDOMChanged() {
  sendButtonContainer = document.querySelector(sendButtonContainerId);
  if (!sendButtonContainer || !sendButtonContainer.parentNode) {
    return;
  }

  messageContainer = document.querySelector(".c-message_list");
  if (!messageContainer) {
    return;
  }

  messageInput = document.querySelector(".ql-editor");
  if (!messageInput) {
    return;
  }

  observer.disconnect();
  Initialize(key);
}

const observer = new MutationObserver(onDOMChanged);
observer.observe(document.body, {
  childList: true,
  subtree: true,
});
