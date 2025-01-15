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
const textEncoder = new TextEncoder("utf-8");

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
async function encryptMessage(messageInput, key) {
  try {
    const messageWithEmojisEncoded = extractEmojiCodes(messageInput);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedMessage = textEncoder.encode(messageWithEmojisEncoded);
    const hashedKey = await hashKey(key);

    const cryptoKey = await window.crypto.subtle.importKey(
      "raw",
      hashedKey,
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );

    const encryptedMessage = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      cryptoKey,
      encodedMessage
    );

    return { encryptedMessage: new Uint8Array(encryptedMessage), iv: iv };
  } catch (error) {
    console.error("Encryption failed:", error);
    throw error;
  }
}

/**
 * Hash a key using SHA-256.
 * @param {string} key - The key to hash.
 * @returns {Promise<Uint8Array>} - The hashed key.
 */
async function hashKey(key) {
  const encodedKey = textEncoder.encode(key);
  const hash = await crypto.subtle.digest("SHA-256", encodedKey);
  return new Uint8Array(hash);
}

/**
 * Replaces emoji images with their corresponding encoded IDs in the input field.
 * @param {HTMLElement} messageInput - The message input field element.
 * @returns {string} - The processed message text with encoded emoji IDs.
 */
function extractEmojiCodes(messageInput) {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = messageInput.innerHTML;
  const emojis = tempDiv.querySelectorAll("img.emoji");

  emojis.forEach((emoji) => {
    const backgroundImage = emoji.style.backgroundImage;
    const match = backgroundImage.match(/\/([0-9a-f]{4,})\.png/);
    const emojiId = match ? match[1] : "unknown";
    const emojiCode = `:emoji_${emojiId}:`;
    const textNode = document.createTextNode(emojiCode);
    emoji.parentNode.replaceChild(textNode, emoji);
  });

  return tempDiv.textContent || tempDiv.innerText || "";
}

/**
 * Converts encoded emoji IDs back to emoji images in the decrypted message.
 * @param {string} decryptedText - The decrypted message text with encoded emoji IDs.
 * @returns {string} - The final HTML string with emoji images.
 */
function convertEmojiCodes(decryptedText) {
  if (typeof decryptedText !== "string") {
    console.error("decryptMessage returned non-string:", decryptedText);
    return ""; // Fallback to empty string or handle accordingly
  }

  const emojiRegex = /:emoji_([0-9a-f]{4,}):/g;
  return decryptedText.replace(emojiRegex, (match, emojiId) => {
    return `
      <span class="c-emoji c-emoji__medium c-emoji--inline" data-qa="emoji" delay="300" data-sk="tooltip_parent">
        <img src="https://a.slack-edge.com/production-standard-emoji-assets/14.0/google-medium/${emojiId}.png" aria-label="emoji" alt="${match}" data-stringify-type="emoji" data-stringify-emoji="${match}">
      </span>
    `;
  });
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
 * ( Is there a better way to do this? )
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
            const threadNode = node.querySelector(
              '[class*="p-threads_flexpane"]'
            );
            if (threadNode) {
              Initialize(KEY);
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

  for (const observer of sendButtonClickedObservers) {
    observer.disconnect();
  }
}

let hasAddedCSS = false;
function addCSSStyles() {
  if (hasAddedCSS) {
    return;
  }
  hasAddedCSS = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = browser.runtime.getURL("styles.css");
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
 * @param {HTMLElement} encrypedSendButton - The container element that contains the cloned send button.
 */
let tooltips = [];
function initializeTooltip(encrypedSendButton) {
  removeAllTooltips();
  const tooltipParentId = '[data-sk="tooltip_parent"]';
  let tooltipParent = encrypedSendButton.querySelector(tooltipParentId);
  if (tooltipParent) {
    tooltipParent.addEventListener("mouseenter", () => {
      removeAllTooltips();

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
          removeAllTooltips();
        },
        { once: true }
      );

      tooltips.push(tooltip);
    });
  }

  function removeAllTooltips() {
    tooltips.forEach((tooltip) => {
      tooltip.remove();
    });
    tooltips = [];
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
let sendButtonClickedObservers = [];
function addSendButtonClickListener(
  encryptedSendButton,
  messageInput,
  sendButtonContainer,
  key
) {
  encryptedSendButton.addEventListener("click", async () => {
    const messageText = messageInput.textContent;
    const { success, key } = await getKey();
    const encryptionKey = success ? key : null;

    if (!messageText || !encryptionKey) {
      return;
    }

    try {
      const { encryptedMessage, iv } = await encryptMessage(
        messageInput,
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

      const sendButtonClickedObserver = new MutationObserver((mutations) => {
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

      sendButtonClickedObserver.observe(messageInput, {
        childList: true,
        characterData: true,
        subtree: true,
      });

      sendButtonClickedObservers.push(sendButtonClickedObserver);
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

  const decodedMessage = textDecoder.decode(decryptedMessage);
  const messageHtmlWithEmojis = convertEmojiCodes(decodedMessage);
  return messageHtmlWithEmojis;
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

        const { success, key } = await getKey();
        const encryptionKey = success ? key : null;

        if (!encryptionKey) {
          return;
        }

        // Decrypt the message
        decryptedMessage = await decryptMessage(
          encryptedMessage,
          iv,
          encryptionKey
        );
        createMessageEntry(decryptedMessage);
      }

      function createMessageEntry(msg) {
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
        messageText.innerHTML = msg;
        container.appendChild(messageText);

        // Append the container to the message element
        messageElement.innerHTML = "";
        messageElement.appendChild(container);
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
