// Background script for handling API calls to Gemini

// Function to inject content script into a tab
async function injectContentScript(tabId) {
  try {
    // Check if content script is already injected
    const response = await chrome.tabs
      .sendMessage(tabId, { action: 'ping' })
      .catch(() => null);

    if (!response) {
      // Content script not injected, inject it now
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      console.log('Content script injected into tab', tabId);
    }
  } catch (error) {
    console.error('Failed to inject content script:', error);
  }
}

// Function to inject into all ChatGPT tabs
async function injectIntoAllChatGPTTabs() {
  const tabs = await chrome.tabs.query({
    url: ['https://chatgpt.com/*', 'https://chat.openai.com/*']
  });

  for (const tab of tabs) {
    await injectContentScript(tab.id);
  }
}

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'modifyWithGemini') {
    handleGeminiRequest(request.text)
      .then((modifiedText) => {
        sendResponse({ success: true, modifiedText });
      })
      .catch((error) => {
        console.error('Gemini API error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  } else if (request.action === 'injectContentScript') {
    // Inject content script when popup enables the extension
    injectIntoAllChatGPTTabs().then(() => {
      sendResponse({ success: true });
    });
    return true;
  } else if (request.action === 'ping') {
    // Response for ping to check if content script is loaded
    sendResponse({ status: 'alive' });
  }
});

async function handleGeminiRequest(originalText) {
  // Get settings from storage
  const settings = await chrome.storage.sync.get({
    apiKey: '',
    systemPrompt: `Enhance the following response with these characteristics:
    - Balance professionalism with approachability
    - Use clear, accessible language
    - Include helpful explanations without being condescending
    - Use "you" naturally where it improves clarity
    - Provide comprehensive yet digestible information
    - Add relevant examples when helpful
    - Maintain a neutral, helpful tone
    - Be informative while remaining engaging

    Original response to enhance:` // Default to balanced assistant
  });

  if (!settings.apiKey) {
    throw new Error(
      'Gemini API key not configured. Please set it in the extension settings.'
    );
  }

  // Construct the full prompt - ensure there's proper spacing
  const fullPrompt = `${settings.systemPrompt}\n\n${originalText}`;

  console.log('Using anthropomorphize level:', settings.anthropomorphize || 2);

  // Make API call to Gemini
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${settings.apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: fullPrompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7, // Fixed optimal temperature
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192
        },
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_NONE'
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_NONE'
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_NONE'
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_NONE'
          }
        ]
      })
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      `Gemini API error: ${errorData.error?.message || 'Unknown error'}`
    );
  }

  const data = await response.json();

  // Extract text from response
  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    const modifiedText = data.candidates[0].content.parts
      .map((part) => part.text)
      .join('');
    return modifiedText;
  } else {
    throw new Error('Invalid response format from Gemini API');
  }
}

// Handle extension installation and updates
chrome.runtime.onInstalled.addListener((details) => {
  console.log('ChatGPT Gemini Modifier extension installed/updated');

  // Inject content script into existing ChatGPT tabs
  if (details.reason === 'install' || details.reason === 'update') {
    injectIntoAllChatGPTTabs();
  }
});

// Handle tab updates to inject script when navigating to ChatGPT
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only proceed if the page has completed loading
  if (changeInfo.status === 'complete') {
    // Check if this is a ChatGPT URL
    if (
      tab.url &&
      (tab.url.includes('chatgpt.com') || tab.url.includes('chat.openai.com'))
    ) {
      // Get settings to check if extension is enabled
      const settings = await chrome.storage.sync.get({ enabled: false });

      if (settings.enabled) {
        // Inject content script
        await injectContentScript(tabId);
      }
    }
  }
});
