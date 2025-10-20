// Content script for monitoring and modifying ChatGPT responses

let isEnabled = false;
let settings = {};
let isInitialized = false;

// Initialize extension
async function init() {
  // Prevent double initialization
  if (isInitialized) {
    console.log('ChatGPT Gemini Modifier: Already initialized');
    return;
  }
  isInitialized = true;

  // Load initial settings
  const stored = await chrome.storage.sync.get({
    enabled: false,
    apiKey: '',
    anthropomorphize: 2,
    systemPrompt: `Enhance the following response with these characteristics:
    - Balance professionalism with approachability
    - Use clear, accessible language
    - Include helpful explanations without being condescending
    - Use "you" naturally where it improves clarity
    - Provide comprehensive yet digestible information
    - Add relevant examples when helpful
    - Maintain a neutral, helpful tone
    - Be informative while remaining engaging

    Purely output the response, with no mention of what you are doing.
    Original response to enhance:`
  });

  isEnabled = stored.enabled;
  settings = stored;

  console.log('ChatGPT Gemini Modifier: Initialized', { enabled: isEnabled });

  if (isEnabled) {
    startObserving();
  }
}

// Listen for messages from popup and background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    // Respond to ping from background script
    sendResponse({ status: 'alive' });
    return true;
  } else if (request.action === 'updateSettings') {
    // Reload settings
    chrome.storage.sync.get(null, (stored) => {
      settings = stored;
      console.log('ChatGPT Gemini Modifier: Settings updated');
    });
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'toggleExtension') {
    isEnabled = request.enabled;
    console.log('ChatGPT Gemini Modifier: Toggled', { enabled: isEnabled });

    if (isEnabled) {
      startObserving();
    } else {
      stopObserving();
    }
    sendResponse({ success: true });
    return true;
  }
});

// MutationObserver to watch for new ChatGPT responses
let observer = null;
const processedMessages = new WeakSet();
const processingMessages = new WeakSet();

function startObserving() {
  if (observer) {
    console.log('ChatGPT Gemini Modifier: Observer already active');
    return;
  }

  observer = new MutationObserver((mutations) => {
    if (!isEnabled) return;

    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          checkForChatGPTResponse(node);
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log('ChatGPT Gemini Modifier: Started observing');

  // Check existing messages on the page
  checkExistingMessages();
}

function stopObserving() {
  if (observer) {
    observer.disconnect();
    observer = null;
    console.log('ChatGPT Gemini Modifier: Stopped observing');
  }
}

function checkExistingMessages() {
  // Check for any existing ChatGPT messages that haven't been processed
  const existingMessages = document.querySelectorAll(
    '[data-message-author-role="assistant"]'
  );
  existingMessages.forEach(processMessageContainer);

  // Also check for the newer ChatGPT interface structure
  const articles = document.querySelectorAll('article');
  articles.forEach((article) => {
    const isAssistantMessage =
      article
        .querySelector('.text-token-text-secondary')
        ?.textContent?.includes('ChatGPT') ||
      article.classList.contains('agent-turn') ||
      article.querySelector('[data-message-author-role="assistant"]');

    if (
      isAssistantMessage &&
      !processedMessages.has(article) &&
      !processingMessages.has(article)
    ) {
      processMessageContainer(article);
    }
  });
}

function checkForChatGPTResponse(element) {
  // Look for ChatGPT message containers
  // ChatGPT uses different selectors, we'll try multiple approaches
  let messageContainers = [];

  if (element.nodeType === Node.ELEMENT_NODE) {
    // Check if the element itself is a message container
    if (
      element.matches &&
      element.matches('[data-message-author-role="assistant"]')
    ) {
      messageContainers.push(element);
    }

    // Also look for message containers within the element
    const found = element.querySelectorAll(
      '[data-message-author-role="assistant"]'
    );
    messageContainers.push(...found);
  }

  messageContainers.forEach(processMessageContainer);

  // Also check for the newer ChatGPT interface structure
  const articleElements = element.querySelectorAll
    ? element.querySelectorAll('article')
    : [];
  if (element.matches && element.matches('article')) {
    articleElements.push(element);
  }

  articleElements.forEach((article) => {
    // Check if this is an assistant message
    const isAssistantMessage =
      article
        .querySelector('.text-token-text-secondary')
        ?.textContent?.includes('ChatGPT') ||
      article.classList.contains('agent-turn') ||
      article.querySelector('[data-message-author-role="assistant"]');

    if (
      isAssistantMessage &&
      !processedMessages.has(article) &&
      !processingMessages.has(article)
    ) {
      processMessageContainer(article);
    }
  });
}

async function processMessageContainer(container) {
  // Skip if already processed or currently processing
  if (processedMessages.has(container) || processingMessages.has(container))
    return;

  // Find the actual text element within the message
  const textElement = findTextElement(container);
  if (!textElement) return;

  // Mark as processing to avoid duplicate processing
  processingMessages.add(container);

  console.log('ChatGPT Gemini Modifier: Processing message');

  // Wait a bit to ensure ChatGPT has finished streaming the response
  const isComplete = await waitForResponseCompletion(textElement);
  if (!isComplete) {
    console.log('ChatGPT Gemini Modifier: Response still streaming, skipping');
    processingMessages.delete(container);
    return;
  }

  // Mark as processed
  processedMessages.add(container);
  processingMessages.delete(container);

  // Check if we've already modified this element BEFORE storing anything
  if (
    textElement.querySelector('.gemini-modified-content') ||
    textElement.classList.contains('gemini-processed')
  ) {
    console.log('ChatGPT Gemini Modifier: Already modified, skipping');
    return;
  }

  // Store the original HTML content BEFORE any modifications
  const originalHTML = textElement.innerHTML;

  // Get the original text
  const originalText = extractTextContent(textElement);
  if (!originalText || originalText.trim().length === 0) {
    console.log('ChatGPT Gemini Modifier: Empty response, skipping');
    return;
  }

  // Add loading indicator
  addLoadingIndicator(textElement);

  try {
    // Send to background script for Gemini processing
    const response = await chrome.runtime.sendMessage({
      action: 'modifyWithGemini',
      text: originalText
    });

    if (response.success && response.modifiedText) {
      // Mark element as processed before replacing content
      textElement.classList.add('gemini-processed');
      // Replace the content with modified version, passing the original HTML
      replaceContent(textElement, response.modifiedText, originalHTML);
      console.log('ChatGPT Gemini Modifier: Successfully modified response');
    } else {
      throw new Error(response.error || 'Failed to modify text');
    }
  } catch (error) {
    console.error('Failed to modify with Gemini:', error);
    removeLoadingIndicator(textElement);
    // Add error indicator
    addErrorIndicator(textElement, error.message);
  }
}

function findTextElement(container) {
  // Try multiple selectors for different ChatGPT versions
  const selectors = [
    '.markdown',
    '.whitespace-pre-wrap',
    '[data-message-content]',
    '.text-base',
    '.group .text-gray-800',
    '.prose'
  ];

  for (const selector of selectors) {
    const element = container.querySelector(selector);
    if (element && element.textContent.trim()) {
      return element;
    }
  }

  // Fallback: look for div with substantial text content
  const divs = container.querySelectorAll('div');
  for (const div of divs) {
    // Skip if it contains buttons or is likely UI element
    if (div.querySelector('button') || div.querySelector('svg')) {
      continue;
    }

    // Skip if already processed or contains modified content
    if (
      div.classList.contains('gemini-processed') ||
      div.querySelector('.gemini-modified-content')
    ) {
      continue;
    }

    // Check if it has meaningful text content
    const text = div.textContent.trim();
    if (
      text.length > 50 &&
      !div.classList.contains('gemini-modifier-loading') &&
      !div.classList.contains('gemini-modifier-error')
    ) {
      return div;
    }
  }

  return null;
}

async function waitForResponseCompletion(element, maxWaitTime = 10000) {
  // Wait for streaming to complete by checking if content is still changing
  let lastContent = element.textContent;
  let unchangedCount = 0;
  const checkInterval = 500;
  const checksNeeded = 3; // Content unchanged for 1.5 seconds
  const startTime = Date.now();

  return new Promise((resolve) => {
    const checkTimer = setInterval(() => {
      const currentContent = element.textContent;
      const elapsedTime = Date.now() - startTime;

      // Check for streaming indicators
      const isStreaming =
        element.closest('article')?.querySelector('.result-streaming') !==
          null ||
        element.querySelector('.result-streaming') !== null ||
        document.querySelector('[data-testid="stop-button"]') !== null;

      if (isStreaming) {
        unchangedCount = 0;
        lastContent = currentContent;
      } else if (currentContent === lastContent) {
        unchangedCount++;
        if (unchangedCount >= checksNeeded) {
          clearInterval(checkTimer);
          resolve(true);
        }
      } else {
        unchangedCount = 0;
        lastContent = currentContent;
      }

      // Timeout check
      if (elapsedTime >= maxWaitTime) {
        clearInterval(checkTimer);
        resolve(false);
      }
    }, checkInterval);
  });
}

function extractTextContent(element) {
  // Clone the element to avoid modifying the original during extraction
  const clone = element.cloneNode(true);

  // Remove UI elements
  clone.querySelectorAll('button').forEach((btn) => btn.remove());
  clone.querySelectorAll('.copy-code-button').forEach((btn) => btn.remove());
  clone
    .querySelectorAll('.gemini-modifier-loading')
    .forEach((el) => el.remove());
  clone
    .querySelectorAll('.gemini-modified-content')
    .forEach((el) => el.remove());
  clone.querySelectorAll('.gemini-modifier-error').forEach((el) => el.remove());

  // Get text content while preserving some structure
  let text = '';

  // Handle code blocks specially to preserve them
  const codeBlocks = clone.querySelectorAll('pre');
  const codeBlockContents = [];

  codeBlocks.forEach((block, index) => {
    const codeContent = block.textContent;
    codeBlockContents.push(codeContent);
    block.textContent = `[CODE_BLOCK_${index}]`;
  });

  text = clone.textContent.trim();

  // Restore code blocks
  codeBlockContents.forEach((content, index) => {
    text = text.replace(
      `[CODE_BLOCK_${index}]`,
      '\n```\n' + content + '\n```\n'
    );
  });

  return text;
}

function addLoadingIndicator(element) {
  // Remove any existing indicator
  removeLoadingIndicator(element);

  const indicator = document.createElement('div');
  indicator.className = 'gemini-modifier-loading';
  indicator.style.cssText = `
    margin: 10px 0;
    padding: 12px 16px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 8px;
    color: white;
    font-size: 14px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 10px;
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  `;

  // Add pulse animation
  if (!document.querySelector('#gemini-modifier-styles')) {
    const style = document.createElement('style');
    style.id = 'gemini-modifier-styles';
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.8; }
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  indicator.innerHTML = `
    <span style="animation: spin 1s linear infinite; display: inline-block;">✨</span>
    <span>Enhancing response with Gemini AI...</span>
  `;

  element.parentNode.insertBefore(indicator, element.nextSibling);
}

function removeLoadingIndicator(element) {
  const indicator = element.parentNode?.querySelector(
    '.gemini-modifier-loading'
  );
  if (indicator) {
    indicator.remove();
  }
}

function addErrorIndicator(element, errorMessage) {
  const indicator = document.createElement('div');
  indicator.className = 'gemini-modifier-error';
  indicator.style.cssText = `
    margin: 10px 0;
    padding: 12px 16px;
    background-color: #fef2f2;
    border: 1px solid #ef4444;
    border-radius: 8px;
    color: #991b1b;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  indicator.innerHTML = `
    <span>❌</span>
    <span>Failed to enhance: ${errorMessage}</span>
  `;
  element.parentNode.insertBefore(indicator, element.nextSibling);

  // Remove error after 5 seconds
  setTimeout(() => indicator.remove(), 5000);
}

function replaceContent(element, modifiedText, originalHTML) {
  removeLoadingIndicator(element);

  // Create a wrapper for the modified content
  const wrapper = document.createElement('div');
  wrapper.className = 'gemini-modified-content';
  wrapper.style.cssText = `
    position: relative;
    padding: 10px 0;
  `;

  // Add styles for smooth transitions
  const transitionStyle = document.createElement('style');
  if (!document.querySelector('#gemini-transition-styles')) {
    transitionStyle.id = 'gemini-transition-styles';
    transitionStyle.textContent = `
      .gemini-content-container {
        transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out;
      }
      .gemini-content-hidden {
        opacity: 0;
        transform: translateY(-10px);
        position: absolute;
        pointer-events: none;
      }
      .gemini-content-visible {
        opacity: 1;
        transform: translateY(0);
        position: relative;
      }
    `;
    document.head.appendChild(transitionStyle);
  }

  // Add a header showing this was modified
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    padding: 10px 14px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    transition: background 0.3s ease;
  `;
  header.innerHTML = `
    <span style="font-size: 16px;">✨</span>
    <span>Response Deanthropomorphized</span>
    <button class="toggle-original" style="
      margin-left: auto;
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      color: white;
      padding: 5px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.2s;
    " onmouseover="this.style.background='rgba(255,255,255,0.3)'"
       onmouseout="this.style.background='rgba(255,255,255,0.2)'">
      Show Original
    </button>
  `;

  // Create containers for modified and original content
  const modifiedContainer = document.createElement('div');
  modifiedContainer.className =
    'modified-text gemini-content-container gemini-content-visible';
  modifiedContainer.style.cssText = `
    position: relative;
    opacity: 1;
    transform: translateY(0);
  `;
  modifiedContainer.innerHTML = formatTextToHTML(modifiedText);

  const originalContainer = document.createElement('div');
  originalContainer.className =
    'original-text gemini-content-container gemini-content-hidden';
  originalContainer.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    opacity: 0;
    transform: translateY(-10px);
    pointer-events: none;
    background: #f9fafb;
    padding: 12px;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
  `;

  // Add a label to indicate original content
  const originalLabel = document.createElement('div');
  originalLabel.style.cssText = `
    font-size: 11px;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
    font-weight: 500;
  `;
  originalLabel.textContent = '📝 Original ChatGPT Response';

  const originalContentWrapper = document.createElement('div');
  originalContentWrapper.innerHTML = originalHTML;

  originalContainer.appendChild(originalLabel);
  originalContainer.appendChild(originalContentWrapper);

  // Track current state
  let showingOriginal = false;

  // Create a container for both versions
  const contentContainer = document.createElement('div');
  contentContainer.style.cssText = `
    position: relative;
    min-height: 100px;
  `;

  // Add toggle functionality
  const toggleButton = header.querySelector('.toggle-original');
  toggleButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    showingOriginal = !showingOriginal;

    if (showingOriginal) {
      // Fade out modified, fade in original
      modifiedContainer.style.opacity = '0';
      modifiedContainer.style.transform = 'translateY(-10px)';
      modifiedContainer.style.position = 'absolute';
      modifiedContainer.style.pointerEvents = 'none';

      setTimeout(() => {
        originalContainer.style.position = 'relative';
        originalContainer.style.opacity = '1';
        originalContainer.style.transform = 'translateY(0)';
        originalContainer.style.pointerEvents = 'auto';
      }, 50);

      toggleButton.textContent = 'Show Enhanced';
      toggleButton.style.background = 'rgba(255,255,255,0.35)';
      header.style.background =
        'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)';
    } else {
      // Fade out original, fade in modified
      originalContainer.style.opacity = '0';
      originalContainer.style.transform = 'translateY(-10px)';
      originalContainer.style.position = 'absolute';
      originalContainer.style.pointerEvents = 'none';

      setTimeout(() => {
        modifiedContainer.style.position = 'relative';
        modifiedContainer.style.opacity = '1';
        modifiedContainer.style.transform = 'translateY(0)';
        modifiedContainer.style.pointerEvents = 'auto';
      }, 50);

      toggleButton.textContent = 'Show Original';
      toggleButton.style.background = 'rgba(255,255,255,0.2)';
      header.style.background =
        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }
  });

  // Assemble the wrapper
  wrapper.appendChild(header);
  contentContainer.appendChild(modifiedContainer);
  contentContainer.appendChild(originalContainer);
  wrapper.appendChild(contentContainer);

  // Replace the original element's content
  element.innerHTML = '';
  element.appendChild(wrapper);
}

function formatTextToHTML(text) {
  // Convert markdown-style formatting to HTML
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Preserve code blocks
  html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
    return `<pre style="background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 12px 0; font-family: 'Monaco', 'Menlo', monospace; font-size: 14px; line-height: 1.5;"><code>${code.trim()}</code></pre>`;
  });

  // Convert line breaks to paragraphs
  const paragraphs = html.split(/\n\n+/);
  html = paragraphs
    .map((p) => {
      if (p.trim() && !p.includes('<pre')) {
        // Convert single line breaks to <br>
        p = p.replace(/\n/g, '<br>');
        // Bold text
        p = p.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Italic text
        p = p.replace(/\*(.*?)\*/g, '<em>$1</em>');
        // Inline code
        p = p.replace(
          /`([^`]+)`/g,
          '<code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; color: #374151;">$1</code>'
        );

        return `<p style="margin: 10px 0; line-height: 1.6; color: #1f2937;">${p}</p>`;
      }
      return p;
    })
    .join('');

  // Wrap in a container with consistent styling
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${html}</div>`;
}

// Initialize immediately when script loads
console.log('ChatGPT Gemini Modifier: Content script loaded');
init();

// Also listen for storage changes to update settings
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    if (changes.enabled) {
      isEnabled = changes.enabled.newValue;
      if (isEnabled) {
        startObserving();
      } else {
        stopObserving();
      }
    }

    // Update other settings
    if (changes.apiKey) {
      settings.apiKey = changes.apiKey.newValue;
    }
    if (changes.anthropomorphize) {
      settings.anthropomorphize = changes.anthropomorphize.newValue;
    }
    if (changes.systemPrompt) {
      settings.systemPrompt = changes.systemPrompt.newValue;
    }
  }
});
