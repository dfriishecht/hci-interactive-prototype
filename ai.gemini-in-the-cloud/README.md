# ChatGPT Gemini Modifier

A Chrome extension that automatically enhances ChatGPT responses using Google's Gemini AI. When you use ChatGPT, this extension intercepts the responses, sends them to Gemini with a customizable system prompt, and replaces the original output with the modified version.

## Prerequisites

- Google Chrome browser
- A Google AI Studio account for Gemini API access
- Active ChatGPT account

## Installation

### Step 1: Get a Gemini API Key

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated API key (keep it secure!)

### Step 2: Install the Extension

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked"
5. Select the `ai.gemini-in-the-cloud` folder
6. The extension icon will appear in your Chrome toolbar

## Configuration

1. Click the extension icon in the Chrome toolbar
2. Enter your Gemini API key
3. Adjust the Response Style slider to select your preferred personality
4. Toggle "Enable Extension" to activate
5. Click "Save Settings"

## Usage

1. Navigate to [ChatGPT](https://chatgpt.com)
2. Start a conversation as normal
3. When ChatGPT responds, the extension will automatically:
   - Detect the response
   - Show a loading indicator ("🤖 Enhancing response with Gemini...")
   - Send the response to Gemini with your system prompt
   - Replace the original with the modified



### File Structure
```
ai.gemini-in-the-cloud/
├── manifest.json        # Extension manifest
├── background.js        # Background script for API calls
├── content.js          # Content script for ChatGPT interaction
├── popup.html          # Settings popup UI with personality slider
├── popup.js            # Settings popup logic with personality levels
├── package.json        # Package metadata
└── images/            # Extension icons
```
