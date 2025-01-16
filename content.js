// Constants
const CLONED_WYSIWYG_CONTAINER_ID =
  ".c-wysiwyg_container__button--send-encrypted";
const KEY = "slackeee-key";
const MESSAGE_ELEMENT_ID = ".p-rich_text_section";
const SEND_BUTTON_CONTAINER_ID = '[class*="c-wysiwyg_container__send_button"]';
const ENCRYPTION_DELIMITER = "¤";
const MESSAGE_CONTAINER_ID = "[data-qa='slack_kit_list']";
const INPUT_CONTAINER_ID = '[class*="ql-editor"]';
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

if (typeof browser === "undefined") {
  var browser = chrome;
}

/**
 * Initializes the extension by setting up the Send Encrypted button,
 * adding necessary styles, and attaching event listeners for detecting new messages and input changes.
 */
function Initialize(forNode) {
  console.error("Initializing");
  if (!forNode) {
    forNode = document.body;
  }
  isInitializing = true;

  const existingSendButton = forNode.querySelector(
    `.${ENCRYPTED_SEND_BUTTON_CLASS}`
  );
  if (existingSendButton) {
    isInitializing = false;
    decryptAllMessages();
    return;
  }

  const { success, key } = loadEncryptionKey();
  const didFind = success && key;

  if (!didFind) {
    isInitializing = false;
    return;
  }

  addCSSStyles();

  const messageElements = getAllMessageContainers(forNode);
  messageElementCollection = [];
  for (const messageElement of messageElements) {
    // Get the send button container from the message element
    const sendButtonContainer = messageElement.querySelector(
      SEND_BUTTON_CONTAINER_ID
    );

    const inputField = messageElement.querySelector(INPUT_CONTAINER_ID);

    if (!sendButtonContainer || !inputField) {
      isInitializing = false;
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
      isInitializing = false;
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

    isInitializing = false;
  }

  //observeChannelChange();
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
        Initialize();
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
      if (
        (mutation.target &&
          mutation.target.className &&
          mutation.target.className === "c-virtual_list__scroll_container") ||
        mutation.target.className ===
          "c-virtual_list__scroll_container c-virtual_list__scroll_container--scrollbar" ||
        mutation.target.className ===
          "p-file_drag_drop__container p-threads_flexpane"
      ) {
        if (threadContainerObserver) {
          threadContainerObserver.disconnect();
        }

        function onThreadDOMChanged() {
          queryAllComponentsAndInitialize(mutation.target);
        }
        threadContainerObserver = new MutationObserver(onThreadDOMChanged);
        threadContainerObserver.observe(document.body, {
          childList: true,
          subtree: true,
        });

        Initialize(mutation.target);
      }
    }
  };

  if (threadObserver) {
    threadObserver.disconnect();
  }
  threadObserver = new MutationObserver(callback);
  threadObserver.observe(targetNode, config);
}

let threadContainerObserver;

function removeExistingSendButton(forNode) {
  if (!forNode) {
    forNode = document.body;
  }
  const existingSendButton = forNode.querySelector(
    `.${ENCRYPTED_SEND_BUTTON_CLASS}`
  );
  if (existingSendButton) {
    sendButtonClickedObservers[existingSendButton]?.disconnect();
    existingSendButton.remove();
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
    <button type="button" class="c-wysiwyg_container__button--send-encrypted" aria-label="Send Encrypted Message" title="Send Encrypted Message" data-qa="texty_send_button" data-sk="tooltip_parent" style="margin-right: 16px; width: 42px;">
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
// Store the send button click observers in a dictionary with the send button as key, to disconnect them when the message is sent
let sendButtonClickedObservers = new Map();
function addSendButtonClickListener(
  encryptedSendButton,
  messageInput,
  sendButtonContainer,
  key
) {
  encryptedSendButton.addEventListener("click", async () => {
    const messageText = messageInput.innerHTML;
    const { success, key } = await loadEncryptionKey();
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

      // Prepend a random letter to the message (To ensure we don't start with a /, since Slack will interpret it as a command)
      const randomLetter = String.fromCharCode(
        65 + Math.floor(Math.random() * 26)
      );

      const finalMessage = `${randomLetter}${encryptedMessageBase64}:${ivBase64}${ENCRYPTION_DELIMITER}`;

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
            }
            mainObserver.disconnect();
          }
        });
      });

      sendButtonClickedObserver.observe(messageInput, {
        childList: true,
        characterData: true,
        subtree: true,
      });

      // Store the observer in a dictionary with the send button as key
      sendButtonClickedObservers.set(
        encryptedSendButton,
        sendButtonClickedObserver
      );
    } catch (error) {}
  });
}

/**
 * Encrypt a message using AES-GCM.
 * @param {string} message - The message to encrypt.
 * @param {string} key - The encryption key.
 * @returns {Promise<{encryptedMessage: Uint8Array, iv: Uint8Array}>} - The encrypted message and Initialization Vector (IV).
 */
async function encryptMessage(messageInput, key) {
  try {
    const message = messageInput.innerHTML;
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedMessage = textEncoder.encode(message);
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
  } catch (error) {}
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
  return decodedMessage;
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
    return;
  }

  const { success, key } = await loadEncryptionKey();
  const encryptionKey = success ? key : null;

  if (!encryptionKey) {
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
        try {
          // Remove the first character from the message since it was prepended before encryption
          const encryptedMessageText = messageText.slice(1);

          const [encryptedMessageBase64, ivBase64] = encryptedMessageText
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
        } catch (error) {}
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

        msg = msg.replace(/<p>/g, "");
        msg = msg.replace(/<\/p>/g, "<br>");

        msg = wrapEmojis(msg);
        msg = wrapCodeBlocks(msg);
        msg = wrapBlockquotes(msg);
        msg = wrapInlineCode(msg);

        messageText.innerHTML = msg;
        messageElement.innerHTML = "";
        messageElement.appendChild(container);
      }
    }
  }

  function wrapEmojis(msg) {
    const emojiRegex =
      /<img data-id=":(.*?)" data-title=":(.*?)" data-stringify-text=":(.*?)" class="emoji" src="(.*?)" alt="(.*?)" style="background-image: url\((.*?)\);">/g;

    const emojis = msg.match(emojiRegex);
    if (emojis) {
      for (const emoji of emojis) {
        const match = emoji.match(
          /<img data-id=":(.*?)" data-title=":(.*?)" data-stringify-text=":(.*?)" class="emoji" src="(.*?)" alt="(.*?)" style="background-image: url\((.*?)\);">/
        );
        if (match) {
          const [
            ,
            dataId,
            dataTitle,
            dataStringifyText,
            src,
            alt,
            backgroundImageUrl,
          ] = match;
          const ariaLabelMatch = alt.match(/^(.*) emoji$/);
          const ariaLabel = ariaLabelMatch ? ariaLabelMatch[1] : "";
          const dataStringifyEmoji = `:${dataId}:`;

          const span = `<span class="c-emoji c-emoji__medium c-emoji--inline" data-qa="emoji" delay="300" data-sk="tooltip_parent">
      <img src="${backgroundImageUrl}" aria-label="${ariaLabel}" alt="${dataStringifyEmoji}" data-stringify-type="emoji" data-stringify-emoji="${dataStringifyEmoji}">
    </span>`;
          msg = msg.replace(emoji, span);
        }
      }
    }
    return msg;
  }

  function wrapCodeBlocks(msg) {
    const codeBlockRegex = /<div class="ql-code-block">(.*?)<\/div>/g;

    const codeBlocks = msg.match(codeBlockRegex);
    if (codeBlocks) {
      for (const codeBlock of codeBlocks) {
        const innerContent = codeBlock.match(
          /<div class="ql-code-block">(.*?)<\/div>/
        )[1];
        const wrappedBlock = `<pre class="c-mrkdwn__pre" data-stringify-type="pre"><div class="p-rich_text_block--no-overflow">${innerContent}</div></pre>`;
        msg = msg.replace(codeBlock, wrappedBlock);
      }
    }
    return msg;
  }

  function wrapBlockquotes(msg) {
    const blockquoteRegex = /<blockquote>(.*?)<\/blockquote>/g;

    const blockquotes = msg.match(blockquoteRegex);
    if (blockquotes) {
      for (const blockquote of blockquotes) {
        const innerContent = blockquote.match(
          /<blockquote>(.*?)<\/blockquote>/
        )[1];
        const wrappedBlockquote = `<blockquote type="cite" class="c-mrkdwn__quote" data-stringify-type="quote">${innerContent}</blockquote>`;
        msg = msg.replace(blockquote, wrappedBlockquote);
      }
    }
    return msg;
  }

  function wrapInlineCode(msg) {
    const inlineCodeRegex = /<code>(.*?)<\/code>/g;

    const inlineCodes = msg.match(inlineCodeRegex);
    if (inlineCodes) {
      for (const inlineCode of inlineCodes) {
        const innerContent = inlineCode.match(/<code>(.*?)<\/code>/)[1];
        const wrappedInlineCode = `<code data-stringify-type="code" class="c-mrkdwn__code">${innerContent}</code>`;
        msg = msg.replace(inlineCode, wrappedInlineCode);
      }
    }
    return msg;
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
  queryAllComponentsAndInitialize(document.body);
}

function queryAllComponentsAndInitialize(fromNode) {
  if (!fromNode) {
    fromNode = document.body;
    return;
  }
  const messageElements = getAllMessageContainers(fromNode);
  if (!messageElements || messageElements.length === 0) {
    return;
  }

  if (
    !document.title.includes("(DM)") &&
    !document.title.includes("(Channel)")
  ) {
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

  sendButtons = fromNode.querySelectorAll(SEND_BUTTON_CONTAINER_ID);
  if (!sendButtons || sendButtons.length === 0) {
    return;
  }

  messageContainers = fromNode.querySelectorAll(MESSAGE_CONTAINER_ID);
  if (!messageContainers || messageContainers.length === 0) {
    return;
  }

  messageInputs = fromNode.querySelector(INPUT_CONTAINER_ID);
  if (!messageInputs || messageInputs.length === 0) {
    return;
  }

  mainObserver.disconnect();
  Initialize();
}

let mainObserver = new MutationObserver(onDOMChanged);
mainObserver.observe(document.body, {
  childList: true,
  subtree: true,
});

const MESSAGE_CONTAINER = "p-message_input__input_container_unstyled";

function getAllMessageContainers(fromNode) {
  if (!fromNode) {
    fromNode = document.body;
  }
  // Select all elements that have a class starting with 'partial'
  const cont = fromNode.querySelectorAll(`[class*="${MESSAGE_CONTAINER}"]`);
  return cont;
}

function parseConversationId(url) {
  // https://app.slack.com/client/TEAM_ID/CHANNEL_ID
  const parts = url.split("/");
  return parts[parts.length - 1] || null;
}

function loadEncryptionKey() {
  try {
    const response = window.location.href;
    const title = document.title;

    if (!title.includes("(DM)") && !title.includes("(Channel)")) {
      return { success: false, key: null };
    }

    if (response) {
      const conversationId = parseConversationId(response);
      if (conversationId) {
        const key = getEncryptionKeyForConversationIfAvailable(conversationId);
        if (key) {
          return { success: true, key };
        } else {
          return { success: false, key: null };
        }
      }
    }
    return { success: false, key: null };
  } catch (error) {
    return { success: false, key: null };
  }
}

function getEncryptionKeyForConversationIfAvailable(conversationId) {
  return browser.storage.sync.get("slackeeeConversationKeys").then((result) => {
    const conversationKeys = result.slackeeeConversationKeys || {};
    return conversationKeys[conversationId] || null;
  });
}
