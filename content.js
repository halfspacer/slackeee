// Constants
const CLONED_WYSIWYG_CONTAINER_ID =
  ".c-wysiwyg_container__button--send-encrypted";
const KEY = "slackeee-key";
const MESSAGE_ELEMENT_ID = ".p-rich_text_section";
const SEND_BUTTON_CONTAINER_ID = '[class*="c-wysiwyg_container__send_button"]';
const ENCRYPTION_DELIMITER = "¤";
const MESSAGE_CONTAINER_ID = "[data-qa='slack_kit_list']";
const INPUT_CONTAINER_ID = ".ql-editor";
const HEADER_TEXT_CONTAINER_ID = ".p-view_header__text";
const VIRTUAL_LIST_ITEM_CLASS = "c-virtual_list__item";
const ENCRYPTED_SEND_BUTTON_CLASS = "encrypted-send-button-container";
const CHANNEL_CHANGE_SELECTOR =
  'div[data-qa="slack_kit_list"].c-virtual_list__scroll_container';

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

// Cached DOM elements
let encryptedSendButtons = [];
let messageContainers = [];
let messageInputs = [];
let sendButtons = [];
let messageElementCollection = [];
let firstRun = true;

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
  const encodedKey = textEncoder.encode(key);
  const hash = await crypto.subtle.digest("SHA-256", encodedKey);
  return new Uint8Array(hash);
}

/**
 * Initializes the extension by setting up the Send Encrypted button,
 * adding necessary styles, and attaching event listeners for detecting new messages and input changes.
 *
 * @param {string} key - The key used for encryption/decryption of messages.
 */
function Initialize(key) {
  removeExistingSendButtons();
  addCSSStyles();

  const messageElements = getAllMessageContainers();
  messageElementCollection = [];
  for (const messageElement of messageElements) {
    // Get the send button container from the message element
    const sendButtonContainer = messageElement.querySelector(
      SEND_BUTTON_CONTAINER_ID
    );

    const inputField = messageElement.querySelector(INPUT_CONTAINER_ID);

    if (!sendButtonContainer || !inputField) {
      return;
    }

    // Store the message element and send button container together
    const messageElementData = {
      inputField,
      sendButtonContainer,
    };

    messageElementCollection.push(messageElementData);
  }

  sendButtons = document.querySelectorAll(SEND_BUTTON_CONTAINER_ID);
  messageContainers = document.querySelectorAll(MESSAGE_CONTAINER_ID);
  messageInputs = document.querySelector(INPUT_CONTAINER_ID);

  for (const messageElementData of messageElementCollection) {
    const encryptedSendButton = createSendButton(
      messageElementData.sendButtonContainer
    );
    if (!encryptedSendButton) {
      return;
    }

    initializeTooltip(encryptedSendButton);
    addInputEventListener(messageElementData.inputField, encryptedSendButton);
    addSendButtonClickListener(
      encryptedSendButton,
      messageElementData.inputField,
      messageElementData.sendButtonContainer,
      key
    );
  }

  observeChannelChange();
  observeThreadOpen();
  observeIncomingMessages();

  if (firstRun) {
    decryptMessagesPeriodically();
    firstRun = false;
  } else {
    decryptAllMessages();
  }
}

/**
 * Try to detect when the active channel tab
 */
let channelObserver;
function observeChannelChange() {
  const targetNode = document.querySelector(CHANNEL_CHANGE_SELECTOR);
  const config = { childList: true, subtree: true };
  const callback = function (mutationsList, observer) {
    for (let mutation of mutationsList) {
      if (mutation.type === "childList") {
        Initialize(KEY);
      }
    }
  };

  if (channelObserver) {
    channelObserver.disconnect();
  }
  channelObserver = new MutationObserver(callback);
  channelObserver.observe(targetNode, config);
}

/**
 * Observe when a Slack thread is opened by detecting the addition of the threads flexpane.
 */
let threadObserver;
function observeThreadOpen() {
  const targetNode = document.body;
  const config = { childList: true, subtree: true };

  const callback = function (mutationsList, observer) {
    for (let mutation of mutationsList) {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            // Ensure it's an element node
            // Detect the threads flexpane using data-qa attribute
            if (node.matches && node.matches('[data-qa="threads_flexpane"]')) {
              Initialize(KEY);
            } else {
              // Check within the subtree of the added node
              const threadNode = node.querySelector(
                '[data-qa="threads_flexpane"]'
              );
              if (threadNode) {
                Initialize(KEY);
              }
            }
          }
        });
      }
    }
  };

  if (threadObserver) {
    threadObserver.disconnect();
  }
  threadObserver = new MutationObserver(callback);
  threadObserver.observe(targetNode, config);
}

function removeExistingSendButtons() {
  const existingSendButtons = document.querySelectorAll(
    `.${ENCRYPTED_SEND_BUTTON_CLASS}`
  );
  existingSendButtons.forEach((button) => {
    button.remove();
  });
}

let hasAddedCSS = false;
function addCSSStyles() {
  if (hasAddedCSS) {
    return;
  }
  hasAddedCSS = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = browser.extension.getURL("styles.css");
  document.head.appendChild(link);
}

function createSendButton(sendButtonContainer) {
  const encryptedSendButtonContainer = document.createElement("span");
  encryptedSendButtonContainer.classList.add(
    "c-wysiwyg_container__send_button--with_options"
  );
  encryptedSendButtonContainer.innerHTML = `
    <button type="button" class="c-wysiwyg_container__button--send-encrypted" aria-label="Send Encrypted Message" title="Send Encrypted Message" data-qa="texty_send_button" data-sk="tooltip_parent" style="margin-right: 8px;">
      <svg aria-hidden="true" viewBox="0 0 20 20" class="send-icon">
        <path fill="currentColor" d="M1.5 2.25a.755.755 0 0 1 1-.71l15.596 7.808a.73.73 0 0 1 0 1.305L2.5 18.462l-.076.018a.75.75 0 0 1-.924-.728v-4.54c0-1.21.97-2.229 2.21-2.25l6.54-.17c.27-.01.75-.24.75-.79s-.5-.79-.75-.79l-6.54-.17A2.253 2.253 0 0 1 1.5 6.79z"></path>
      </svg>
      <svg aria-hidden="true" viewBox="0 0 20 20" class="lock-icon">
        <path fill="currentColor" d="M10 2a4 4 0 0 0-4 4v4H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1V6a4 4 0 0 0-4-4zm-2 4a2 2 0 1 1 4 0v4H8V6zm-1 6h6v5H7v-5z"></path>
      </svg>
    </button>
  `;
  encryptedSendButtonContainer.classList.add(ENCRYPTED_SEND_BUTTON_CLASS);
  if (!sendButtonContainer.parentNode) {
    return;
  }
  if (sendButtonContainer.nextSibling) {
    sendButtonContainer.parentNode.insertBefore(
      encryptedSendButtonContainer,
      sendButtonContainer.nextSibling
    );
  } else {
    sendButtonContainer.parentNode.insertBefore(
      encryptedSendButtonContainer,
      sendButtonContainer.parentNode.firstChild
    );
  }

  return encryptedSendButtonContainer;
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
  function updateButtonColor() {
    const button = clonedSendButtonContainer.querySelector(
      CLONED_WYSIWYG_CONTAINER_ID
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
  }

  messageInput.addEventListener("keyup", updateButtonColor);
  updateButtonColor(); // Initial check
}

/**
 * Adds a click event listener to the cloned send button container that encrypts the message input
 * before sending it.
 */
let sendButtonClickedObserver;
function addSendButtonClickListener(
  encryptedSendButton,
  messageInput,
  sendButtonContainer,
  key
) {
  encryptedSendButton.addEventListener("click", async () => {
    const messageText = messageInput.textContent;
    const response = await browser.runtime.sendMessage({ type: "GET_KEY" });
    const encryptionKey = response ? response.key : null;

    if (!messageText || !encryptionKey) {
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

      if (sendButtonClickedObserver) {
        sendButtonClickedObserver.disconnect();
      }
      sendButtonClickedObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (
            mutation.type === "childList" ||
            mutation.type === "characterData"
          ) {
            const originalSendButton =
              sendButtonContainer.querySelector("button");
            if (originalSendButton) {
              originalSendButton.click();

              // Trigger the "keyup" event to update the send button color
              messageInput.dispatchEvent(new KeyboardEvent("keyup"));
            } else {
              console.error("Send button not found.");
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
  if (!messageContainers) {
    console.error("Message container not found.");
    return;
  }

  for (const messageContainer of messageContainers) {
    var messageElements = messageContainer.querySelectorAll(MESSAGE_ELEMENT_ID);

    for (const messageElement of messageElements) {
      const messageText = messageElement.textContent;
      if (!messageText) {
        continue;
      }

      // We're only interested in messages that end with the special character
      if (!messageText.endsWith(ENCRYPTION_DELIMITER)) {
        continue;
      }

      // Check if the message ends with the special character
      if (messageText.endsWith(ENCRYPTION_DELIMITER)) {
        const [encryptedMessageBase64, ivBase64] = messageText
          .split(ENCRYPTION_DELIMITER)[0]
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

        const response = await browser.runtime.sendMessage({ type: "GET_KEY" });
        const encryptionKey = response.key;

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
}

// Observe the message container for new messages
let messageObservers = [];
let headerObservers = [];
function observeIncomingMessages() {
  messageContainers = document.querySelectorAll(MESSAGE_CONTAINER_ID);
  const headerTextContainers = document.querySelectorAll(
    HEADER_TEXT_CONTAINER_ID
  );

  for (const observer of messageObservers) {
    observer.disconnect();
  }

  for (const container of messageContainers) {
    const messageObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (
            node.classList &&
            node.classList.contains(VIRTUAL_LIST_ITEM_CLASS)
          ) {
            decryptAllMessages();
          }
        }
      }
    });

    messageObserver.observe(container, {
      childList: true,
      subtree: true,
    });

    messageObservers.push(messageObserver);
  }

  for (const observer of headerObservers) {
    observer.disconnect;
  }

  for (const headerTextContainer of headerTextContainers) {
    if (headerTextContainer) {
      const headerObserver = new MutationObserver(() => {
        decryptAllMessages();
      });

      headerObserver.observe(headerTextContainer, {
        childList: true,
        subtree: true,
      });

      headerObservers.push(headerObserver);
    }
  }
}

// Decrypt messages periodically
function decryptMessagesPeriodically() {
  let counter = 0;
  const decryptMessages = () => {
    decryptAllMessages();
    counter += 2;
    if (counter < 3) {
      setTimeout(() => {
        requestAnimationFrame(decryptMessages);
      }, 2000);
    }
  };
  requestAnimationFrame(decryptMessages);
}

//We wait for all the necessary elements to be available before initializing.
function onDOMChanged() {
  const messageElements = getAllMessageContainers();
  if (!messageElements || messageElements.length === 0) {
    return;
  }

  for (const messageElement of messageElements) {
    // Get the send button container from the message element
    const sendButtonContainer = messageElement.querySelector(
      SEND_BUTTON_CONTAINER_ID
    );

    const inputField = messageElement.querySelector(INPUT_CONTAINER_ID);

    if (!sendButtonContainer || !inputField) {
      return;
    }

    // Store the message element and send button container together
    const messageElementData = {
      inputField,
      sendButtonContainer,
    };
    if (!messageElementCollection) {
      messageElementCollection = [];
    }
    messageElementCollection.push(messageElementData);
  }

  sendButtons = document.querySelectorAll(SEND_BUTTON_CONTAINER_ID);
  if (!sendButtons || sendButtons.length === 0) {
    return;
  }

  messageContainers = document.querySelectorAll(MESSAGE_CONTAINER_ID);
  if (!messageContainers || messageContainers.length === 0) {
    return;
  }

  messageInputs = document.querySelector(INPUT_CONTAINER_ID);
  if (!messageInputs || messageInputs.length === 0) {
    return;
  }

  observer.disconnect();
  removeExistingSendButtons();
  Initialize(KEY);
}

const observer = new MutationObserver(onDOMChanged);
observer.observe(document.body, {
  childList: true,
  subtree: true,
});

const MESSAGE_CONTAINER = "p-message_input__input_container_unstyled";

function getAllMessageContainers() {
  // Select all elements that have a class starting with 'partial'
  const cont = document.querySelectorAll(`[class*="${MESSAGE_CONTAINER}"]`);
  return cont;
}
