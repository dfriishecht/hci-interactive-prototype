// Define personality levels with their system prompts
const personalityLevels = [
  {
    name: 'Technical Assistant',
    emoji: '🤖',
    style: 'Precise, formal, and data-driven',
    prompt: `Analyze the following response and rewrite it with these characteristics:
    - Use precise, technical language without colloquialisms
    - Present information in a structured, logical manner
    - Remove all personal pronouns (I, we, you) where possible
    - Focus on objective facts and data
    - Use passive voice for more formal tone
    - Eliminate emotional language and personal opinions
    - Structure responses with clear hierarchies and bullet points
    - Be concise and direct without unnecessary pleasantries
    Purely output the response, with no mention of what you are doing.
    Original response to rewrite:`
  },
  {
    name: 'Professional Assistant',
    emoji: '💼',
    style: 'Clear, professional, and informative',
    prompt: `Improve the following response with these characteristics:
    - Use clear, professional language
    - Maintain a respectful but not overly formal tone
    - Present information in a well-organized manner
    - Use "you" sparingly and appropriately
    - Focus on being helpful and informative
    - Include relevant context where necessary
    - Be thorough but avoid redundancy
    - Maintain objectivity while being approachable
    Purely output the response, with no mention of what you are doing.
    Original response to improve:`
  },
  {
    name: 'Balanced Assistant',
    emoji: '⚖️',
    style: 'Clear, helpful, and appropriately friendly',
    prompt: `Enhance the following response with these characteristics:
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
  },
  {
    name: 'Friendly Guide',
    emoji: '😊',
    style: 'Warm, encouraging, and conversational',
    prompt: `Transform the following response with these characteristics:
    - Use warm, conversational language
    - Include personal pronouns naturally (I'd suggest, you might find)
    - Add encouraging phrases and positive reinforcement
    - Use relatable examples and analogies
    - Express understanding and empathy where appropriate
    - Include helpful tips with a friendly tone
    - Use casual but respectful language
    - Make the interaction feel more like a friendly conversation
    Purely output the response, with no mention of what you are doing.
    Original response to transform:`
  },
  {
    name: 'Personal Companion',
    emoji: '🤗',
    style: 'Highly personable, empathetic, and engaging',
    prompt: `Reimagine the following response with these characteristics:
    - Use very warm, personal language
    - Freely use personal pronouns to create connection
    - Express enthusiasm and genuine interest
    - Include empathetic statements and emotional support
    - Use encouraging and motivating language
    - Add personal touches and conversational elements
    - Show understanding of potential feelings and concerns
    - Create a sense of partnership and support
    - Use exclamation points and emoticons sparingly but naturally
    - Make the user feel heard, valued, and supported
    Purely output the response, with no mention of what you are doing.
    Original response to reimagine:`
  }
];

// Load saved settings when popup opens
document.addEventListener('DOMContentLoaded', async () => {
  const settings = await chrome.storage.sync.get({
    apiKey: '',
    anthropomorphize: 2, // Default to balanced
    enabled: false
  });

  document.getElementById('apiKey').value = settings.apiKey;
  document.getElementById('anthropomorphize').value = settings.anthropomorphize;
  document.getElementById('enabled').checked = settings.enabled;
});

// Save settings
document.getElementById('save').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value.trim();
  const anthropomorphize = parseInt(
    document.getElementById('anthropomorphize').value
  );
  const enabled = document.getElementById('enabled').checked;

  if (!apiKey) {
    showStatus('Please enter your Gemini API key', 'error');
    return;
  }

  try {
    // Get the system prompt for the selected level
    const systemPrompt = personalityLevels[anthropomorphize].prompt;

    await chrome.storage.sync.set({
      apiKey,
      anthropomorphize,
      systemPrompt, // Store the actual prompt
      temperature: 0.7, // Fixed optimal temperature
      enabled
    });

    // If extension is enabled, inject content script into existing tabs
    if (enabled) {
      await chrome.runtime.sendMessage({ action: 'injectContentScript' });
    }

    // Send message to content script to update settings
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    if (
      tab &&
      (tab.url.includes('chatgpt.com') || tab.url.includes('chat.openai.com'))
    ) {
      chrome.tabs
        .sendMessage(tab.id, { action: 'updateSettings' })
        .catch(() => {
          // Content script might not be injected yet, that's okay
        });
    }

    showStatus('Settings saved successfully!', 'success');
  } catch (error) {
    showStatus('Error saving settings: ' + error.message, 'error');
  }
});

// Handle enable/disable toggle
document.getElementById('enabled').addEventListener('change', async (e) => {
  const enabled = e.target.checked;

  try {
    // Get current anthropomorphize level to ensure system prompt is set
    const anthropomorphize = parseInt(
      document.getElementById('anthropomorphize').value
    );
    const systemPrompt = personalityLevels[anthropomorphize].prompt;

    await chrome.storage.sync.set({
      enabled,
      systemPrompt // Always update the system prompt when toggling
    });

    if (enabled) {
      // Inject content script into all ChatGPT tabs when enabling
      await chrome.runtime.sendMessage({ action: 'injectContentScript' });

      // Small delay to allow injection to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Send message to content script
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    if (
      tab &&
      (tab.url.includes('chatgpt.com') || tab.url.includes('chat.openai.com'))
    ) {
      chrome.tabs
        .sendMessage(tab.id, {
          action: 'toggleExtension',
          enabled
        })
        .catch(() => {
          // Content script might not be injected yet, that's okay
          if (enabled) {
            console.log(
              'Content script will be active on next page interaction'
            );
          }
        });
    }

    // Also notify all other ChatGPT tabs
    const allTabs = await chrome.tabs.query({
      url: ['https://chatgpt.com/*', 'https://chat.openai.com/*']
    });

    for (const chatTab of allTabs) {
      if (chatTab.id !== tab?.id) {
        chrome.tabs
          .sendMessage(chatTab.id, {
            action: 'toggleExtension',
            enabled
          })
          .catch(() => {
            // Ignore errors for tabs without content script
          });
      }
    }

    showStatus(enabled ? 'Extension enabled' : 'Extension disabled', 'success');
  } catch (error) {
    showStatus('Error updating status: ' + error.message, 'error');
  }
});

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type}`;

  setTimeout(() => {
    status.className = 'status hidden';
  }, 3000);
}

// Auto-save when anthropomorphize slider changes
document
  .getElementById('anthropomorphize')
  .addEventListener('change', async () => {
    const apiKey = document.getElementById('apiKey').value.trim();

    // Only auto-save if API key is already set
    if (apiKey) {
      const anthropomorphize = parseInt(
        document.getElementById('anthropomorphize').value
      );
      const systemPrompt = personalityLevels[anthropomorphize].prompt;

      try {
        await chrome.storage.sync.set({
          anthropomorphize,
          systemPrompt
        });

        // Update content scripts with new prompt
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true
        });

        if (
          tab &&
          (tab.url.includes('chatgpt.com') ||
            tab.url.includes('chat.openai.com'))
        ) {
          chrome.tabs
            .sendMessage(tab.id, { action: 'updateSettings' })
            .catch(() => {
              // Content script might not be injected yet, that's okay
            });
        }

        // Show brief success indicator
        showStatus('Style updated!', 'success');
      } catch (error) {
        console.error('Error auto-saving anthropomorphize level:', error);
      }
    }
  });
