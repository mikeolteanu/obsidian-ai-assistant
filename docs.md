# AI Assistant Plugin Documentation

## Table of Contents

1.  [Overview](#overview)
2.  [For Users](#for-users)
    *   [Features](#features)
        *   [Assistant Chat](#assistant-chat)
        *   [Assistant Prompt](#assistant-prompt)
        *   [Run Frequent Prompt](#run-frequent-prompt)
        *   [Clean Up Markdown](#clean-up-markdown)
        *   [Image Generator](#image-generator)
        *   [Speech to Text](#speech-to-text)
        *   [Select Model](#select-model)
        *   [File/Folder Context Menu Actions](#filefolder-context-menu-actions)
    *   [Installation](#installation)
    *   [Configuration](#configuration)
        *   [API Keys](#api-keys)
        *   [Text Assistant Settings](#text-assistant-settings)
        *   [Image Assistant Settings](#image-assistant-settings)
        *   [Speech to Text Settings](#speech-to-text-settings)
    *   [Chat Interface Guide](#chat-interface-guide)
        *   [Saving and Loading Chats](#saving-and-loading-chats)
        *   [Adding Context (Files, Folders, Images)](#adding-context-files-folders-images)
        *   [Running Prompt Chains](#running-prompt-chains)
        *   [Audio Recording in Chat](#audio-recording-in-chat)
3.  [For Developers/Maintainers](#for-developersmaintainers)
    *   [Project Structure](#project-structure)
    *   [Key Files and Components](#key-files-and-components)
        *   [`main.ts`](#maints)
        *   [`modal.ts`](#modalts)
        *   [`openai_api.ts`](#openai_apits)
        *   [`settings.ts`](#settingsts)
        *   [`styles.css`](#stylescss)
    *   [Building the Plugin](#building-the-plugin)
    *   [Core Logic](#core-logic)
        *   [API Interaction](#api-interaction)
        *   [Modal Management](#modal-management)
        *   [State Management](#state-management)
        *   [Settings and Configuration](#settings-and-configuration)
        *   [Event Handling](#event-handling)
    *   [Adding New Features](#adding-new-features)
        *   [Adding a new LLM Model](#adding-a-new-llm-model)
        *   [Adding a new Command](#adding-a-new-command)
        *   [Modifying the Chat UI](#modifying-the-chat-ui)
    *   [Logging](#logging)
4.  [Troubleshooting](#troubleshooting)

## 1. Overview

The AI Assistant Plugin for Obsidian enhances your note-taking experience by integrating various AI-powered functionalities directly into your workspace. It allows users to interact with Large Language Models (LLMs) for text generation, summarization, markdown cleanup, image generation via DALL-E, and speech-to-text transcription via Whisper.

This document serves as a guide for both end-users and developers looking to understand, use, or contribute to the plugin.

## 2. For Users

### Features

#### Assistant Chat
*   **Command:** `Open Assistant Chat`
*   **Functionality:** Opens a persistent, fullscreen chat interface. You can have an ongoing conversation with the AI, load previous chats, save current chats, and add context from your notes (files, folders, images).
*   **Context:** If you have text selected in your editor when invoking this command, it will be used as the initial context for the chat.

#### Assistant Prompt
*   **Command:** `Open Assistant Prompt`
*   **Functionality:** Opens a modal to send a one-off prompt to the AI. If text is selected, it's appended to your prompt as context.
*   **Behavior:** The AI's response can either replace your selected text or be inserted after it, based on your plugin settings.

#### Run Frequent Prompt
*   **Command:** `Run frequent prompt`
*   **Functionality:** Opens a suggestion modal listing your most frequently used prompts. Selecting a prompt sends it to the AI, along with any currently selected text as context.
*   **History:** The plugin keeps track of your prompt usage to populate this list.

#### Clean Up Markdown
*   **Command:** `Clean up Markdown`
*   **Functionality:** Takes the selected text and sends it to the AI with a pre-defined prompt to reformat it into clean Markdown.
*   **Behavior:** Similar to "Assistant Prompt", the result can replace or be inserted after the selection.

#### Image Generator
*   **Command:** `Open Image Generator`
*   **Functionality:** Opens a modal to generate images using DALL-E. You can specify the prompt, image size, number of images, and quality (for DALL-E 3).
*   **Output:** Generated images are displayed in a subsequent modal where you can select images to download to your vault (configurable folder) and copy their Markdown links to the clipboard.

#### Speech to Text
*   **Command:** `Open Speech to Text`
*   **Functionality:** Opens a modal to record audio from your microphone. The recorded audio is then transcribed using OpenAI's Whisper API.
*   **Output:** The transcribed text is inserted at your current cursor position in the editor.
*   **Language:** You can specify the input audio language in settings, or leave it blank for auto-detection.

#### Select Model
*   **Command:** `Select Model`
*   **Functionality:** Opens a modal to quickly change the default LLM used for text generation tasks across the plugin.

#### File/Folder Context Menu Actions
*   **Right-click on a file or folder in the Obsidian File Explorer:**
    *   **Collect content:** Copies the content of the selected Markdown file (or all Markdown files within a selected folder) to your clipboard, formatted with file paths.
    *   **Chat with:** Opens the Assistant Chat modal with the content of the selected Markdown file (or all Markdown files within a selected folder) pre-loaded as initial context. This also works for multi-selections.

### Installation

1.  Ensure you have Obsidian installed.
2.  This plugin is likely installed manually or via a community plugin manager like BRAT (if available).
    *   **Manual Installation:** Download the plugin files (`main.js`, `manifest.json`, `styles.css`) and place them in your vault's `.obsidian/plugins/your-plugin-id/` directory.
    *   **BRAT:** If the plugin author supports it, add it via BRAT using the repository URL.
3.  Enable the plugin in Obsidian's settings under "Community Plugins".

### Configuration

Access the plugin settings via Obsidian's settings panel, under "AI Assistant".

#### API Keys
*   **OpenAI API Key:** Required for DALL-E image generation and Whisper/TTS voice features. Get this from your OpenAI account.
*   **LLM API Key:** Required for text generation. This can be an OpenRouter key or a key for another service if you change the LLM Base URL.

#### Text Assistant Settings
*   **LLM Base URL:** The API endpoint for text generation. Defaults to OpenRouter (`https://openrouter.ai/api/v1`). You can change this to point to a local LLM or another compatible service.
*   **Model Name:** Select the default LLM for text generation from a dropdown list of supported models.
*   **Max Tokens:** The maximum number of tokens the AI should generate in a single response.
*   **Prompt behavior (Replace selection):** A toggle to control whether AI responses from "Assistant Prompt" and "Clean Up Markdown" replace the currently selected text or are inserted after it.

#### Image Assistant Settings
*   **Default location for generated images:** Specify the folder path within your vault where generated images will be saved (e.g., `AI Images`).
*   **Image Model Name:** Select the DALL-E model to use (e.g., `dall-e-3`, `dall-e-2`).

#### Speech to Text Settings
*   **The language of the input audio:** Specify the language of your speech in ISO-639-1 format (e.g., `en`, `fr`, `de`). Leave empty for auto-detection by Whisper.

### Chat Interface Guide

The Chat Modal provides a rich, interactive experience.

*   **Model Selection:** A dropdown at the bottom allows you to change the LLM for the current chat session.
*   **Message Actions:** Each message (user or assistant) has:
    *   **Edit (📝):** Allows you to modify the content of your previous messages or the assistant's responses.
    *   **Delete (🗑️):** Removes the message from the chat history.
    *   **Copy (Click on message content):** Clicking the main body of a message copies its text content to the clipboard.
*   **Input Field:** A textarea for typing your prompts. Press `Enter` to send, `Shift+Enter` for a new line.
*   **Buttons (below input field):**
    *   **Load Chat (📂):** Opens a suggester to load previously saved chat sessions.
    *   **Save Chat (💾):** Saves the current chat session. You'll be prompted for a name. "default" chat is saved automatically on close.
    *   **Clear Chat (🧹):** Clears all messages from the current chat session.
    *   **Copy Conversation (📄):** Copies the entire conversation history to the clipboard.
    *   **Insert Last (📥):** Inserts the last assistant message into the active editor note.
    *   **Add Image (🖼️):** Allows you to upload an image from your computer to include in your user prompt (for multimodal models).
    *   **Add File Context (📄):** Opens a suggester to select a Markdown file from your vault. Its content will be added as context to the chat.
    *   **Add Folder Context (📁):** Opens a suggester to select a folder from your vault. The content of all Markdown files within that folder will be added as context.
    *   **Run Prompt Chain (⛓️):** Opens a suggester to select a `.chain.md` file. The prompts in this file will be run sequentially.
    *   **Record Audio (🎤/🛑):** Toggles audio recording. Transcribed text is added to the input field.
    *   **Send/Save Edit (➡️/📝):** Sends the current prompt or saves the edited message.

#### Saving and Loading Chats
*   Chats are saved as JSON files in the `AI Assistant Chats` folder (created automatically) in your vault's root.
*   The "default" chat is automatically loaded when you open an empty chat modal and saved when you close it.
*   Use the "Save Chat" (💾) button and provide a name to save the current session. Use "Load Chat" (📂) to retrieve it later.

#### Adding Context (Files, Folders, Images)
*   **Images:** Click the "Add Image" (🖼️) button. This is for models that support image input (e.g., GPT-4o).
*   **Files:** Click the "Add File Context" (📄) button and select a Markdown file.
*   **Folders:** Click the "Add Folder Context" (📁) button and select a folder. Content from all `.md` files in the folder (and its subfolders) will be added. Large content may be truncated.

#### Running Prompt Chains
*   Create a plain text file with the extension `.chain.md`.
*   Each line in this file will be treated as a separate prompt.
*   Click the "Run Prompt Chain" (⛓️) button in the chat modal and select your `.chain.md` file.
*   The plugin will execute each prompt sequentially, feeding the conversation history (including previous chain step responses) to the next prompt.
*   A maximum of 10 prompts from the chain file will be executed to prevent accidental long runs.

#### Audio Recording in Chat
*   Click the "Record Audio" (🎤) button to start recording. The icon changes to "Stop" (🛑).
*   Speak your prompt.
*   Click "Stop" (🛑) to finish recording.
*   The audio will be transcribed, and the text will appear in the chat input field, ready to be sent.

## 3. For Developers/Maintainers

### Project Structure

The plugin is written in TypeScript and uses `esbuild` for bundling.

```
.
├── .editorconfig
├── .eslintignore
├── .eslintrc
├── .gitignore
├── .npmrc
├── README.md                 // (This will be the main project README, not this docs.md)
├── docs.md                   // (This file)
├── esbuild.config.mjs        // esbuild configuration
├── manifest.json             // Obsidian plugin manifest
├── package-lock.json
├── package.json              // NPM dependencies and scripts
├── src/
│   ├── main.ts               // Plugin entry point, command registration, settings tab
│   ├── modal.ts              // All modal definitions (Chat, Prompt, Image, etc.)
│   ├── openai_api.ts         // API interaction logic with OpenAI and other LLM services
│   ├── settings.ts           // Type definitions for settings, default values, model lists
│   └── (other .ts files)
├── styles.css                // CSS styles for modals and UI elements
├── tsconfig.json             // TypeScript configuration
├── version-bump.mjs          // Script for versioning (likely)
└── versions.json             // Tracks plugin versions (likely)
```

### Key Files and Components

#### `main.ts`
*   **Entry Point:** Contains the main `AiAssistantPlugin` class that extends `Plugin`.
*   **Lifecycle Hooks:** Implements `onload()` and `onunload()` for plugin initialization and cleanup.
*   **Settings:** Loads and saves plugin settings (`AiAssistantSettings`).
*   **API Initialization:** Creates an instance of `OpenAIAssistant`.
*   **Command Registration:** Adds all user-facing commands (e.g., "Open Assistant Chat", "Image Generator").
*   **Settings Tab:** Defines `AiAssistantSettingTab` for user configuration.
*   **Event Listeners:** Registers listeners for file menu events (`file-menu`, `files-menu`) to add custom context menu items.

#### `modal.ts`
*   **Modal Definitions:** Contains classes for all modals used by the plugin:
    *   `PromptModal`: For simple prompt input and image generation options.
    *   `ChatModal`: The main chat interface, handling message display, input, saving/loading, context addition, prompt chains, and audio recording.
    *   `SaveChatNameModal`: Prompts user for a filename when saving chats.
    *   `ImageModal`: Displays generated images and handles saving them to the vault.
    *   `SpeechModal`: Handles audio recording and transcription for the "Speech to Text" command.
    *   `LoadChatSuggestModal`, `FileSuggestModal`, `FolderSuggestModal`, `PromptChainSuggestModal`: Suggest modals for selecting chats, files, folders, or chain files.
    *   `FrequentPromptSuggestModal`: Suggests frequently used prompts.
    *   `ModelSelectModal`: Allows users to change the default LLM.
*   **UI Logic:** Each modal class is responsible for building its HTML structure, handling user interactions within the modal, and calling appropriate backend functions (e.g., API calls, file operations).
*   **Tokenizer:** `ChatModal` initializes and uses `tiktoken` (lite version) to calculate and display token counts for the chat context.

#### `openai_api.ts`
*   **`OpenAIAssistant` Class:** Encapsulates all interactions with AI services.
*   **API Clients:** Initializes `OpenAI` SDK instances:
    *   `openRouterApiFun`: For general LLM calls, configured with the user's LLM Base URL and API key (e.g., OpenRouter).
    *   `openaiApiFun`: Specifically for OpenAI services like TTS, using the OpenAI API key.
*   **Methods:**
    *   `text_api_call()`: Sends text prompts (including multimodal with images) to the configured LLM. Supports streaming for chat.
    *   `img_api_call()`: Makes requests to DALL-E via `requestUrl` for image generation.
    *   `whisper_api_call()`: Sends audio files to OpenAI's Whisper API for transcription via `requestUrl`.
    *   `text_to_speech_call()`: Sends text to OpenAI's TTS API.
    *   `log_request()`: Logs API requests and responses to a daily JSON file in the `ai-assistant-logs` folder within the vault for debugging.
    *   `display_error()`: Standardized error display using Obsidian's `Notice`.

#### `settings.ts`
*   **Constants:** Defines lists of models:
    *   `OAI_IMAGE_CAPABLE_MODELS`: Models that can accept image inputs.
    *   `LLM_MODELS`: A mapping of model IDs to display names for text generation.
    *   `ALL_IMAGE_MODELS`: DALL-E models.
*   **Defaults:** Provides default values for various settings (e.g., `DEFAULT_OAI_IMAGE_MODEL`, `DEFAULT_MAX_TOKENS`).
*   **Interfaces:** (Implicitly through usage, though `PromptHistoryEntry` and `AiAssistantSettings` are defined in `main.ts`). Defines the structure for plugin settings and prompt history entries.

#### `styles.css`
*   **Styling:** Contains all CSS rules for the plugin's UI elements, primarily the modals. It defines layouts, colors, and responsive behavior for chat messages, buttons, input fields, etc.

### Building the Plugin

The plugin uses `npm` (or a compatible package manager like `yarn` or `pnpm`) and `esbuild`.

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Build for Development:** This command usually watches for file changes and rebuilds automatically.
    ```bash
    npm run dev
    ```
3.  **Build for Production/Release:** This command creates an optimized build.
    ```bash
    npm run build
    ```
The build process, configured in `esbuild.config.mjs`, compiles the TypeScript code from the `src` directory into `main.js` (and potentially other assets) in the project root or a `build` directory, ready for Obsidian to load. The `manifest.json` and `styles.css` are typically copied to the output as well.

### Core Logic

#### API Interaction
*   Managed by `OpenAIAssistant` in `openai_api.ts`.
*   Uses the `openai` npm package for interacting with OpenAI-compatible APIs (including OpenRouter or local LLMs if they adhere to the OpenAI API spec).
*   Direct `requestUrl` calls are used for DALL-E and Whisper, likely due to specific needs like `multipart/form-data` for Whisper or direct control over OpenAI-specific endpoints.
*   Handles authentication using API keys provided in settings.
*   Includes error handling and logging for API calls.

#### Modal Management
*   All modals are defined in `modal.ts` and extend Obsidian's `Modal` or `SuggestModal` classes.
*   `onOpen()` is used to construct the modal's content and set up event listeners.
*   `onClose()` is used for cleanup (e.g., stopping recorders, saving chat state).
*   The `ChatModal` is the most complex, managing its own state (prompt table, editing state, recording state) and re-rendering its content dynamically (`displayModalContent`).

#### State Management
*   Plugin-wide settings are managed in `AiAssistantSettings` (defined in `main.ts`) and stored using Obsidian's `loadData()` and `saveData()`.
*   The `ChatModal` maintains its own state for the current conversation (`prompt_table`), current input (`prompt_text`), editing status (`editingMessageId`), etc. This state is persisted to a JSON file for the "default" chat or when explicitly saved by the user.
*   `tiktoken` is used in `ChatModal` to calculate and display token counts, requiring asynchronous initialization of its WASM module.

#### Settings and Configuration
*   The `AiAssistantSettingTab` class in `main.ts` provides the UI for users to configure the plugin.
*   Settings are loaded in `onload()` and saved whenever a setting is changed in the UI or programmatically.
*   `settings.ts` provides default values and lists of available models.

#### Event Handling
*   **Commands:** Obsidian commands are registered in `main.ts`, linking UI actions (like menu clicks or hotkeys) to plugin functions.
*   **Modal Interactions:** Event listeners within each modal class handle button clicks, input changes, etc.
*   **File System Events:** `main.ts` listens to `file-menu` and `files-menu` events from `app.workspace` to add custom actions to the context menus for files and folders.

### Adding New Features

#### Adding a new LLM Model
1.  **`settings.ts`:**
    *   Add the model ID and its user-friendly display name to the `LLM_MODELS` object.
    *   If the model supports image input, add its ID to the `OAI_IMAGE_CAPABLE_MODELS` array.
2.  **Testing:**
    *   Ensure your LLM Base URL and API key are correctly configured for the service providing this new model.
    *   Test the model via the "Select Model" command or by setting it as default in settings, then using chat or prompt features.

#### Adding a new Command
1.  **`main.ts`:**
    *   In the `onload()` method, use `this.addCommand({...})`.
    *   Define an `id`, `name`, and a `callback` or `editorCallback` function.
    *   The callback will contain the logic for your new command. This might involve:
        *   Getting selected text from the editor.
        *   Opening a new or existing modal from `modal.ts`.
        *   Calling methods on `this.aiAssistant`.
        *   Updating the editor or showing notices.
2.  **Modal (if needed):**
    *   If your command requires custom UI or input, create a new class in `modal.ts` extending `Modal` or `SuggestModal`.
3.  **API Call (if needed):**
    *   If it interacts with an AI service, add a corresponding method to `OpenAIAssistant` in `openai_api.ts`.

#### Modifying the Chat UI
1.  **`modal.ts` (`ChatModal` class):**
    *   The `displayModalContent()` method is responsible for rendering the chat interface. Modify its HTML generation logic.
    *   Add new event listeners for new UI elements.
    *   Update internal state variables if needed.
2.  **`styles.css`:**
    *   Add or modify CSS rules to style your new UI elements.
3.  **Functionality:**
    *   Connect new UI elements to existing or new methods within `ChatModal` or `OpenAIAssistant`.

### Logging
*   The plugin implements a logging mechanism in `OpenAIAssistant.log_request()`.
*   Logs are stored in JSON format in the `ai-assistant-logs` directory within the Obsidian vault.
*   Each day gets a new log file (e.g., `ai-assistant-log-YYYY-MM-DD.json`).
*   Logs include timestamp, request type, input data, and output data (or error details).
*   This is useful for debugging API interactions and plugin behavior.

## 4. Troubleshooting

*   **"API Key not valid" / Authentication Errors:**
    *   Double-check your API keys in the plugin settings.
    *   Ensure the "LLM Base URL" is correct for the API key you are using (e.g., OpenRouter URL for an OpenRouter key).
    *   For OpenAI features (DALL-E, Whisper), ensure the OpenAI API key is correctly entered and has funds/credits.
*   **Model Not Working / "Model not found":**
    *   Verify the selected model is available from your configured LLM provider (via the Base URL).
    *   Some models might be deprecated or require specific API versions. Check the provider's documentation.
*   **Chat Not Saving/Loading:**
    *   Ensure Obsidian has permission to write to your vault, especially the `AI Assistant Chats` folder.
    *   Check the developer console (Ctrl+Shift+I or Cmd+Opt+I) for errors related to file operations.
*   **Image Generation Fails:**
    *   Ensure your OpenAI API key is correct and has DALL-E access.
    *   Check for error messages in Obsidian notices or the developer console.
*   **Speech to Text Fails:**
    *   Ensure microphone permissions are granted to Obsidian/your browser (if applicable to how Obsidian handles it).
    *   Check your OpenAI API key.
*   **"Tiktoken initialization failed":**
    *   This means the tokenizer for calculating chat token counts couldn't load. Token counts will show as "N/A".
    *   This might be due to network issues preventing the WASM module from loading or an issue with the bundled WASM path. The core chat functionality should still work.
*   **General Issues:**
    *   Open the developer console (View -> Toggle Developer Tools) for error messages.
    *   Check the `ai-assistant-logs` folder for detailed API request/response information.
    *   Try disabling and re-enabling the plugin.
    *   Ensure you have the latest version of Obsidian and the plugin.
    *   Conflict with other plugins: Try disabling other plugins temporarily to see if the issue resolves.

---

This documentation should provide a good starting point for users and developers. Remember to update it as new features are added or existing ones change.
