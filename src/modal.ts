import {
	App,
	Editor,
	MarkdownRenderer,
	MarkdownView,
	Modal,
	Notice,
	requestUrl,
	Setting,
	SuggestModal,
	TFolder, // Added
	TFile,   // Added
	TAbstractFile, // Added
	Vault,   // Added
	normalizePath, // Added for path handling
	TextComponent, // Added for SaveChatNameModal
} from "obsidian";
import { OpenAIAssistant } from "./openai_api";
import { LLM_MODELS } from "./settings";
import AiAssistantPlugin from "./main";
import { OpenAI } from "openai"; // Import OpenAI

// Tiktoken imports changed for explicit initialization
import { Tiktoken, init as tiktokenInit } from 'tiktoken/lite/init';
// Path to the WASM file for tiktoken/lite. esbuild will bundle this using the dataurl loader.
import wasmPathForTiktokenLite from 'tiktoken/tiktoken_bg.wasm';
// Path to the encoding definition JSON for cl100k_base.
import cl100k_base_model_data from 'tiktoken/encoders/cl100k_base.json';


function generateUniqueId() {
	return "_" + Math.random().toString(36).substr(2, 9);
}

const EDIT_BUTTON_ICON = "📝"; // Using an emoji for edit
const DELETE_BUTTON_ICON = "🗑️"; // Using an emoji for delete
const SEND_BUTTON_ICON = "➡️";
const CLEAR_BUTTON_ICON = "🧹";
const COPY_BUTTON_ICON = "📄";
const INSERT_BUTTON_ICON = "📥";
const ADD_IMAGE_ICON = "🖼️";
const ADD_FOLDER_ICON = "📁";
const ADD_FILE_ICON = "📄";
const SAVE_CHAT_ICON = "💾";
const LOAD_CHAT_ICON = "📂";
const PROMPT_CHAIN_ICON = "⛓️"; // New icon
const RECORD_AUDIO_ICON = "🎤"; // New icon for chat recording
const STOP_RECORD_ICON = "🛑"; // New icon for stopping chat recording


const CHAT_SAVE_FOLDER = "AI Assistant Chats"; // Define save folder
const MAX_CHAIN_PROMPTS = 10; // Limit for prompt chain execution


// Define ChatMessageWithId as a type alias using intersection
type ChatMessageWithId = OpenAI.Chat.Completions.ChatCompletionMessageParam & {
	id: string;
};


function format_prompt_table(prompt_table: ChatMessageWithId[]) {
	// Removed automatic "Hello" message insertion.
	// Removed message merging logic. Each message remains separate.

	for (let i = 0; i < prompt_table.length; i++) {
		const current = prompt_table[i];
		if (!current.id) current.id = generateUniqueId(); // Assign ID if missing

		// --- Merging logic removed ---
	}
}

export class PromptModal extends Modal {
	param_dict: { [key: string]: string };
	onSubmit: (input_dict: object) => void;
	is_img_modal: boolean;
	settings: { [key: string]: any };
	assistant: OpenAIAssistant;
	recorder: MediaRecorder | null;
	gumStream: MediaStream | null;
	is_recording: boolean;


	constructor(
		app: App,
		onSubmit: (x: object) => void,
		is_img_modal: boolean,
		settings: { [key: string]: any },
		assistant: OpenAIAssistant,
	) {
		super(app);
		this.onSubmit = onSubmit;
		this.settings = settings;
		this.is_img_modal = is_img_modal;
		this.assistant = assistant;
		this.recorder = null;
		this.gumStream = null;
		this.is_recording = false;
		this.param_dict = {
			num_img: "1",
			is_hd: "true",
		};
	}

	build_image_modal() {
		this.titleEl.setText("What can I generate for you?");
		const prompt_container = this.contentEl.createEl("div", {
			cls: "prompt-modal-container",
		});
		this.contentEl.append(prompt_container);

		const prompt_left_container = prompt_container.createEl("div", {
			cls: "prompt-left-container",
		});

		const desc1 = prompt_left_container.createEl("p", {
			cls: "description",
		});
		desc1.innerText = "Resolution";

		const prompt_right_container = prompt_container.createEl("div", {
			cls: "prompt-right-container",
		});

		const resolution_dropdown = prompt_right_container.createEl("select");

		let options = ["256x256", "512x512", "1024x1024"];
		this.param_dict["img_size"] = "256x256";

		if (this.settings["model"] === "dall-e-3") {
			options = ["1024x1024", "1792x1024", "1024x1792"];
			this.param_dict["img_size"] = "1024x1024";
		}

		options.forEach((option) => {
			const optionEl = resolution_dropdown.createEl("option", {
				text: option,
			});
			optionEl.value = option;
			if (option === this.param_dict["img_size"]) {
				optionEl.selected = true;
			}
		});
		resolution_dropdown.addEventListener("change", (event) => {
			const selectElement = event.target as HTMLSelectElement;
			this.param_dict["img_size"] = selectElement.value;
		});

		if (this.settings["model"] === "dall-e-2") {
			const desc2 = prompt_left_container.createEl("p", {
				cls: "description",
			});
			desc2.innerText = "Num images";

			const num_img_dropdown = prompt_right_container.createEl("select");
			const num_choices = [...Array(10).keys()].map((x) =>
				(x + 1).toString(),
			);
			num_choices.forEach((option) => {
				const optionEl = num_img_dropdown.createEl("option", {
					text: option,
				});
				optionEl.value = option;
				if (option === this.param_dict["num_img"]) {
					optionEl.selected = true;
				}
			});
			num_img_dropdown.addEventListener("change", (event) => {
				const selectElement = event.target as HTMLSelectElement;
				this.param_dict["num_img"] = selectElement.value;
			});
		}
		if (this.settings["model"] === "dall-e-3") {
			const desc2 = prompt_left_container.createEl("p", {
				cls: "description",
			});
			desc2.innerText = "HD?";
			const is_hd = prompt_right_container.createEl("input", {
				type: "checkbox",
			});
			is_hd.checked = this.param_dict["is_hd"] === "true";
			is_hd.addEventListener("change", (event) => {
				this.param_dict["is_hd"] = is_hd.checked.toString();
			});
		}
	}

	submit_action() {
		if (this.param_dict["prompt_text"]) {
			this.close();
			this.onSubmit(this.param_dict);
		}
	}

	onOpen() {
		const { contentEl } = this;
		this.titleEl.setText("What can I do for you?");

		const modelDisplayName = LLM_MODELS[this.assistant.modelName as keyof typeof LLM_MODELS] || this.assistant.modelName;
		const modelDisplay = contentEl.createEl("div", {
			cls: "current-model-display",
			text: `Model: ${modelDisplayName}`
		});
		modelDisplay.style.fontSize = "0.8em";
		modelDisplay.style.color = "var(--text-muted)";
		modelDisplay.style.textAlign = "center";
		modelDisplay.style.marginBottom = "10px";


		const input_container = contentEl.createEl("div", {
			// Reusing class, might need adjustment if styles conflict - CHECK THIS
			cls: "chat-button-row", // Use chat-button-row for consistency? Or make a new class?
			attr: { style: "justify-content: stretch;" } // Override justify-content: flex-end
		});

		const input_field = input_container.createEl("input", {
			placeholder: "Your prompt here",
			type: "text",
		});
		input_field.style.flexGrow = "1"; // Make input take available space
		input_field.addEventListener("keypress", (evt) => {
			if (evt.key === "Enter") {
				this.param_dict["prompt_text"] = input_field.value.trim();
				this.submit_action();
			}
		});

		const record_button = input_container.createEl("button", {
			text: "Record",
			cls: "record-prompt-button mod-cta" // Keep specific class for prompt record
		});
		record_button.style.backgroundColor = "green";
		record_button.style.color = "white";
		// record_button.style.marginLeft = "5px"; // Gap handles spacing


		record_button.addEventListener("click", () => {
			if (this.is_recording) {
				this.stopRecording();
				record_button.setText("Record");
				record_button.style.borderColor = "";
				record_button.style.backgroundColor = "green";
			} else {
				this.start_recording(input_field);
				record_button.setText("Stop");
				record_button.style.borderColor = "red";
				record_button.style.backgroundColor = "darkred";
			}
		});

		const submit_btn = input_container.createEl("button", {
			text: "Submit",
			cls: "mod-cta",
		});
		// submit_btn.style.marginLeft = "5px"; // Gap handles spacing
		submit_btn.addEventListener("click", () => {
			this.param_dict["prompt_text"] = input_field.value.trim();
			this.submit_action();
		});

		input_field.focus();
		input_field.select();

		if (this.is_img_modal) {
			this.build_image_modal();
		}
	}

	stopRecording() {
		if (this.recorder && this.recorder.state === "recording") {
			this.recorder.stop();
			if (this.gumStream) {
				this.gumStream.getAudioTracks().forEach(track => track.stop());
			}
			this.is_recording = false;
			new Notice("Recording stopped. Transcribing...");
		}
	}

	start_recording(input_field: HTMLInputElement) {
		let mimeType: string | undefined;
		if (MediaRecorder.isTypeSupported("audio/webm")) {
			mimeType = "audio/webm";
		} else if (MediaRecorder.isTypeSupported("audio/mp4")) {
			mimeType = "audio/mp4";
		} else {
			new Notice("No suitable audio recording format supported by your browser.");
			return;
		}

		const constraints = { audio: true };

		navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
			this.gumStream = stream;
			const options = {
				audioBitsPerSecond: 256000,
				mimeType: mimeType
			};
			this.recorder = new MediaRecorder(this.gumStream, options);
			const chunks: BlobPart[] = [];

			this.recorder.ondataavailable = async (e) => {
				chunks.push(e.data);
				if (this.recorder && this.recorder.state === "inactive") {
					const audioFile = new File(
						chunks,
						`prompt_recording.${mimeType!.split("/")[1]}`,
						{ type: mimeType }
					);
					const transcription = await this.assistant.whisper_api_call(
						audioFile,
						this.settings.language
					);
					if (transcription) {
						input_field.value = transcription;
						this.param_dict["prompt_text"] = transcription;
						new Notice("Transcription complete.");
					} else {
						new Notice("Transcription failed or was empty.");
					}
				}
			};

			this.recorder.start();
			this.is_recording = true;
			new Notice("Recording started...");

		}).catch((err) => {
			new Notice(`Error starting recording: ${err.message}`);
			this.is_recording = false;
			const record_button = this.contentEl.querySelector('.record-prompt-button') as HTMLButtonElement;
			if (record_button) {
				record_button.setText("Record");
				record_button.style.borderColor = "";
				record_button.style.backgroundColor = "green";
			}
		});
	}


	onClose() {
		this.stopRecording();
		this.contentEl.empty();
	}
}

// --- New Modal for Getting Chat Save Name ---
export class SaveChatNameModal extends Modal {
	chatModal: ChatModal;
	chatName: string = "";
	inputComponent: TextComponent; // Store reference to input

	constructor(app: App, chatModal: ChatModal) {
		super(app);
		this.chatModal = chatModal;
		// Suggest currentChatFileName or a timestamp if it's 'default' and empty
		if (chatModal.currentChatFileName === "default" && chatModal.prompt_table.length === 0) {
			this.chatName = `Chat ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
		} else {
			this.chatName = chatModal.currentChatFileName;
		}
	}

	onOpen() {
		const { contentEl } = this;
		this.titleEl.setText("Save Chat As...");

		new Setting(contentEl)
			.setName("Chat Name:")
			.addText((text) => {
				this.inputComponent = text; // Store reference
				text.setValue(this.chatName)
					.setPlaceholder("Enter a name for this chat")
					.onChange((value) => {
						this.chatName = value;
					});
				// Allow submitting with Enter key
				text.inputEl.addEventListener('keypress', (e) => {
					if (e.key === 'Enter') {
						e.preventDefault(); // Prevent default form submission if any
						this.submit();
					}
				});
			});

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText("Save")
					.setCta() // Make it stand out
					.onClick(() => {
						this.submit();
					}))
			.addButton((btn) =>
				btn.setButtonText("Cancel")
					.onClick(() => {
						this.close();
					}));

		// Ensure input is focused when modal opens
		this.inputComponent.inputEl.focus();
		this.inputComponent.inputEl.select();
	}

	async submit() {
		const trimmedName = this.chatName.trim();
		if (trimmedName) {
			await this.chatModal.performSaveChat(trimmedName, false); // false for non-silent, shows notice
			// performSaveChat now updates currentChatFileName internally
			this.close();
		} else {
			new Notice("Please enter a valid chat name.");
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
// --- End SaveChatNameModal ---


export class ChatModal extends Modal {
	prompt_text: string = "";
	prompt_table: ChatMessageWithId[] = []; // Use the type alias
	aiAssistant: OpenAIAssistant;
	is_generating_answer: boolean;
	plugin: AiAssistantPlugin;
	editingMessageId: string | null = null; // Added state for editing
	messageContainer: HTMLDivElement | null = null; // To store reference for scrolling
	is_running_chain: boolean = false; // Flag to prevent concurrent actions during chain

	initialContextProvided: boolean;
	currentChatFileName: string;
	openedAtTimestamp: string;

	// Properties for chat audio recording
	chat_recorder: MediaRecorder | null = null;
	chat_gumStream: MediaStream | null = null;
	is_chat_recording: boolean = false;
	
	// Tokenizer properties
	tokenizer: Tiktoken | null = null;
	private tokenizerInitializationPromise: Promise<void> | null = null;


	constructor(app: App, plugin: AiAssistantPlugin, initialMessage: string | null = null) {
		super(app);
		this.plugin = plugin;
		this.aiAssistant = plugin.aiAssistant;
		this.is_generating_answer = false;

		this.initialContextProvided = !!initialMessage;
		this.openedAtTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-'); // Sanitize for filename

		if (!this.initialContextProvided) {
			this.currentChatFileName = "default";
		} else {
			this.currentChatFileName = `Chat ${this.openedAtTimestamp}`;
		}

		if (initialMessage) {
			this.prompt_table.push({ role: "user", content: initialMessage, id: generateUniqueId() });
		}
		format_prompt_table(this.prompt_table);
		
		// Start tokenizer initialization
        this.tokenizerInitializationPromise = this._initializeTokenizer();
	}

	private async _initializeTokenizer(): Promise<void> {
        try {
            // Fetch the WASM module (data URL provided by esbuild)
            const response = await fetch(wasmPathForTiktokenLite as unknown as string); // Use 'as unknown as string' for stricter type checking
            if (!response.ok) {
                throw new Error(`Failed to fetch WASM for tiktoken/lite: ${response.statusText} (URL: ${wasmPathForTiktokenLite})`);
            }
            const wasmBuffer = await response.arrayBuffer();

            // Initialize tiktoken with the WASM module
            await tiktokenInit((imports) => WebAssembly.instantiate(wasmBuffer, imports));
            
            // Create the Tiktoken instance using the model data JSON
            // The cl100k_base_model_data is an object with bpe_ranks, special_tokens, and pat_str properties.
            this.tokenizer = new Tiktoken(
				cl100k_base_model_data.bpe_ranks,
				cl100k_base_model_data.special_tokens,
				cl100k_base_model_data.pat_str
			);

            console.log("AI Assistant: Tiktoken tokenizer (lite) initialized successfully.");
        } catch (e) {
            console.warn("AI Assistant: Tiktoken (lite) initialization failed. Token count will be N/A.", e);
            this.tokenizer = null;
        }
    }


	addFolderContentAsUserMessage(folderContent: string) {
		if (folderContent.trim() === "") {
			new Notice("No content found in the selected folder.");
			return;
		}
		this.prompt_table.push({
			role: "user",
			content: folderContent,
			id: generateUniqueId(),
		});
		format_prompt_table(this.prompt_table); // Still useful for ID assignment
		this.displayModalContent(); // This will trigger async token update
		new Notice("Folder content added to chat.");
		this.scrollToBottom(); // Scroll after adding content
	}

	// --- New Method: Add File Content ---
	addFileContentAsUserMessage(fileContent: string, fileName: string) {
		if (fileContent.trim() === "") {
			new Notice(`File "${fileName}" is empty.`);
			return;
		}
		const formattedContent = `***File Context (${fileName}):***\n${fileContent}`;
		this.prompt_table.push({
			role: "user",
			content: formattedContent,
			id: generateUniqueId(),
		});
		format_prompt_table(this.prompt_table);
		this.displayModalContent(); // This will trigger async token update
		new Notice(`Content from "${fileName}" added to chat.`);
		this.scrollToBottom();
	}


	async delete_message(messageId: string) {
		if (this.is_running_chain) {
			new Notice("Cannot modify chat while a prompt chain is running.");
			return;
		}
		const index = this.prompt_table.findIndex(msg => msg.id === messageId);
		if (index > -1) {
			let oldScrollTop = 0;
			if (this.messageContainer) {
				oldScrollTop = this.messageContainer.scrollTop;
			}

			this.prompt_table.splice(index, 1);
			await this.displayModalContent(); // Await the re-render (which includes async token update)

			if (this.messageContainer) {
				this.messageContainer.scrollTop = oldScrollTop;
			}
			new Notice("Message deleted.");
		}
	}

	edit_message(messageId: string) {
		if (this.is_running_chain) {
			new Notice("Cannot modify chat while a prompt chain is running.");
			return;
		}
		const messageIndex = this.prompt_table.findIndex(msg => msg.id === messageId);
		if (messageIndex > -1) {
			const message = this.prompt_table[messageIndex];
			let textContent = "";
			if (Array.isArray(message.content)) {
				const textItem = message.content.find((item: OpenAI.Chat.Completions.ChatCompletionContentPart) => item.type === "text");
				if (textItem && textItem.type === "text") textContent = textItem.text;
			} else if (typeof message.content === 'string') {
				textContent = message.content;
			}

			this.editingMessageId = messageId;
			this.prompt_text = textContent;

			this.displayModalContent();  // This will trigger async token update

			const inputField = this.contentEl.querySelector('.chat-modal-footer textarea') as HTMLTextAreaElement;
			if (inputField) {
				inputField.focus();
				inputField.value = this.prompt_text; 
			}
			new Notice("Editing message. Modify the text below and click 'Save Edit'.");
		}
	}

	saveChat() {
		if (this.is_running_chain) {
			new Notice("Cannot save chat while a prompt chain is running.");
			return;
		}
		if (this.prompt_table.length === 0 && this.currentChatFileName === "default") {
			new Notice("Chat is empty. Type something to save the default chat or use 'Save As' for a new name.");
			// Optionally open SaveChatNameModal directly if they want to save an empty chat with a new name
			// new SaveChatNameModal(this.app, this).open();
			return;
		}
		new SaveChatNameModal(this.app, this).open();
	}

	async performSaveChat(chatName: string, silent: boolean = false) {
		const sanitizedName = chatName.replace(/[^a-zA-Z0-9\s-_]/g, '').trim() || `Chat ${this.openedAtTimestamp}`;
		const filename = `${sanitizedName}.json`;
		const folderPath = normalizePath(CHAT_SAVE_FOLDER);

		try {
			if (!await this.app.vault.adapter.exists(folderPath)) {
				await this.app.vault.createFolder(folderPath);
				if (!silent) new Notice(`Created chat save folder: ${folderPath}`);
			}

			const filePath = normalizePath(`${folderPath}/${filename}`);
			const chatData = JSON.stringify(this.prompt_table, null, 2);

			await this.app.vault.adapter.write(filePath, chatData);
			if (!silent) new Notice(`Chat saved as "${filename}" in ${folderPath}`);
			this.currentChatFileName = sanitizedName; // Update current file name

		} catch (error) {
			console.error("Error saving chat:", error);
			if (!silent) new Notice("Failed to save chat. Check console for details.");
		}
	}

	async tryLoadChatByName(chatName: string) {
		const filePath = normalizePath(`${CHAT_SAVE_FOLDER}/${chatName}.json`);
		try {
			if (await this.app.vault.adapter.exists(filePath)) {
				const fileContent = await this.app.vault.adapter.read(filePath);
				await this.loadChatContents(fileContent);
				// new Notice(`Loaded chat: ${chatName}.json`, 2000); // Silent on auto-load
			} else {
				// File doesn't exist, start fresh for "default" or other named chat
				this.prompt_table = [];
				this.editingMessageId = null;
				this.prompt_text = "";
				// new Notice(`Starting new chat: ${chatName}.json`, 2000); // Silent
			}
		} catch (error) {
			console.error(`Error loading chat ${chatName}.json:`, error);
			new Notice(`Failed to load chat: ${chatName}.json. Starting fresh.`);
			this.prompt_table = []; // Ensure a clean state on error
			this.editingMessageId = null;
			this.prompt_text = "";
		}
	}
	
	async loadChatContents(jsonData: string) {
		try {
			const loadedTable: ChatMessageWithId[] = JSON.parse(jsonData);

			if (!Array.isArray(loadedTable)) {
				throw new Error("Invalid chat file format: Not an array.");
			}
			if (loadedTable.some(msg => typeof msg.role !== 'string' || typeof msg.content === 'undefined')) {
				throw new Error("Invalid chat file format: Message structure incorrect.");
			}
			
			loadedTable.forEach(msg => { if (!msg.id) msg.id = generateUniqueId(); });

			this.prompt_table = loadedTable;
			this.prompt_text = ""; 
			this.editingMessageId = null; 
			format_prompt_table(this.prompt_table); 
			// UI update will be handled by the caller (onOpen or LoadChatSuggestModal), which includes token update
		} catch (error) {
			console.error("Error parsing or validating chat data:", error);
			new Notice("Failed to parse chat file. Invalid format. Starting fresh chat.");
			this.prompt_table = []; // Reset to a clean state
			this.editingMessageId = null;
			this.prompt_text = "";
		}
	}


	async runPromptChain(chainContent: string) {
		if (this.is_generating_answer || this.is_running_chain) {
			new Notice("Please wait for the current action to complete before starting a chain.");
			return;
		}
		if (this.editingMessageId) {
			new Notice("Please save or cancel your current edit before starting a chain.");
			return;
		}

		const prompts = chainContent.split('\n')
			.map(line => line.trim())
			.filter(line => line.length > 0); 

		if (prompts.length === 0) {
			new Notice("Prompt chain file is empty or contains no valid prompts.");
			return;
		}

		this.is_running_chain = true;
		await this.displayModalContent(); // Refresh UI, including disabling buttons

		const promptsToRun = prompts.slice(0, MAX_CHAIN_PROMPTS);
		if (prompts.length > MAX_CHAIN_PROMPTS) {
			new Notice(`Prompt chain truncated to the first ${MAX_CHAIN_PROMPTS} prompts.`);
		}

		new Notice(`Starting prompt chain: ${promptsToRun.length} prompt(s).`);

		try {
			for (let i = 0; i < promptsToRun.length; i++) {
				const prompt = promptsToRun[i];
				new Notice(`Running chain prompt ${i + 1}/${promptsToRun.length}: "${prompt.substring(0, 50)}..."`);
				this.prompt_text = prompt; 

				while (this.is_generating_answer) {
					await new Promise(resolve => setTimeout(resolve, 100)); 
				}

				await this.send_action(); 

				await new Promise(resolve => setTimeout(resolve, 200));
			}
			new Notice("Prompt chain finished.");
		} catch (error) {
			console.error("Error during prompt chain execution:", error);
			new Notice("An error occurred during the prompt chain. Check console for details.");
		} finally {
			this.is_running_chain = false;
			this.prompt_text = ""; 
			await this.displayModalContent(); // Refresh UI, re-enable buttons
		}
	}

	async startChatRecording(inputField: HTMLTextAreaElement, recordButton: HTMLButtonElement) {
		if (this.is_chat_recording) {
			new Notice("Already recording for chat.");
			return;
		}

		let mimeType: string | undefined;
		if (MediaRecorder.isTypeSupported("audio/webm")) {
			mimeType = "audio/webm";
		} else if (MediaRecorder.isTypeSupported("audio/mp4")) {
			mimeType = "audio/mp4";
		} else {
			new Notice("No suitable audio recording format supported by your browser.");
			return;
		}

		const constraints = { audio: true };

		try {
			this.chat_gumStream = await navigator.mediaDevices.getUserMedia(constraints);
			const options = {
				audioBitsPerSecond: 256000,
				mimeType: mimeType
			};
			this.chat_recorder = new MediaRecorder(this.chat_gumStream, options);
			const chunks: BlobPart[] = [];

			this.chat_recorder.ondataavailable = async (e) => {
				chunks.push(e.data);
				if (this.chat_recorder && this.chat_recorder.state === "inactive") {
					const audioFile = new File(
						chunks,
						`chat_recording.${mimeType!.split("/")[1]}`,
						{ type: mimeType }
					);
					if (audioFile.size === 0) {
						new Notice("No audio data captured for chat.");
						// is_chat_recording will be set by onstop
						return;
					}

					new Notice("Transcribing audio for chat...");
					const transcription = await this.aiAssistant.whisper_api_call(
						audioFile,
						this.plugin.settings.language
					);
					if (transcription) {
						this.prompt_text = (this.prompt_text + " " + transcription).trim();
						inputField.value = this.prompt_text;
						new Notice("Transcription added to chat prompt.");
					} else {
						new Notice("Chat transcription failed or was empty.");
					}
					// is_chat_recording will be set by onstop
				}
			};

			this.chat_recorder.onerror = (event) => {
				console.error("Chat MediaRecorder error:", event);
				new Notice("Error during chat recording.");
				// is_chat_recording will be set by onstop
			};
			
			this.chat_recorder.onstop = () => {
				if (this.chat_gumStream) {
					this.chat_gumStream.getAudioTracks().forEach(track => track.stop());
					this.chat_gumStream = null;
				}
				// This ensures that if recording stops for any reason, we reset the state.
				this.is_chat_recording = false;
				recordButton.setText(RECORD_AUDIO_ICON);
				recordButton.style.borderColor = "";
				recordButton.title = "Record audio for prompt";
			};

			this.chat_recorder.start();
			this.is_chat_recording = true; // Set state after successful start
			new Notice("Recording for chat started...");
			// Button icon/style updated by the caller based on is_chat_recording state
		} catch (err: any) {
			new Notice(`Error starting chat recording: ${err.message}`);
			this.is_chat_recording = false; // Ensure state is false on error
			if (this.chat_gumStream) {
				this.chat_gumStream.getAudioTracks().forEach(track => track.stop());
				this.chat_gumStream = null;
			}
			// Caller will update button based on is_chat_recording
		}
	}

	async stopChatRecording(recordButton?: HTMLButtonElement) {
		if (this.chat_recorder && this.chat_recorder.state === "recording") {
			this.chat_recorder.stop(); // This will trigger ondataavailable then onstop
			new Notice("Chat recording stopped. Awaiting transcription...");
		} else {
			// If not actually recording, ensure state and UI are reset
			this.is_chat_recording = false;
			if (this.chat_gumStream) {
				this.chat_gumStream.getAudioTracks().forEach(track => track.stop());
				this.chat_gumStream = null;
			}
			if (recordButton) {
				recordButton.setText(RECORD_AUDIO_ICON);
				recordButton.style.borderColor = "";
				recordButton.title = "Record audio for prompt";
			}
		}
	}


	send_action = async () => {
		if (this.is_chat_recording) {
			new Notice("Please stop the current recording before sending the message.");
			return;
		}

		if (this.is_generating_answer) {
			new Notice("Please wait for the current response to complete.");
			return;
		}

		if (this.editingMessageId) {
			const messageIndex = this.prompt_table.findIndex(msg => msg.id === this.editingMessageId);
			if (messageIndex > -1) {
				const editedText = this.prompt_text.trim();
				if (editedText) {
					const originalMessage = this.prompt_table[messageIndex];
					if (Array.isArray(originalMessage.content)) {
						const textPartIndex = originalMessage.content.findIndex(part => part.type === 'text');
						if (textPartIndex > -1) {
							(originalMessage.content[textPartIndex] as OpenAI.Chat.Completions.ChatCompletionContentPartText).text = editedText;
						} else {
							originalMessage.content.push({ type: 'text', text: editedText });
						}
					} else {
						originalMessage.content = editedText;
					}
					new Notice("Message updated.");
				} else {
					this.prompt_table.splice(messageIndex, 1);
					new Notice("Message deleted as edit resulted in empty content.");
				}
			}
			this.editingMessageId = null;
			this.prompt_text = ""; 
			await this.displayModalContent(); // Refresh UI, including token count
			this.scrollToBottom();
			return; 
		}

		const hasContentToSend = this.prompt_text.trim() !== "" || this.prompt_table.length > 0;

		if (hasContentToSend) {
			this.is_generating_answer = true; 

			if (this.prompt_text.trim() !== "") {
				this.prompt_table.push({
					role: "user",
					content: this.prompt_text.trim(),
					id: generateUniqueId(),
				});
				if (!this.is_running_chain) {
					this.prompt_text = "";
				}
			} else if (this.prompt_table.length === 0) {
				this.is_generating_answer = false;
				return;
			}

			format_prompt_table(this.prompt_table);

			const assistantPlaceholderId = generateUniqueId();
			this.prompt_table.push({
				role: "assistant",
				content: "Generating Answer...",
				id: assistantPlaceholderId,
			});

			await this.displayModalContent(); // Refresh UI, including token count
			this.scrollToBottom(); 

			let answerElement: HTMLElement | undefined;
			const placeholderRow = this.modalEl.querySelector(`.chat-message-row[data-entry-id="${assistantPlaceholderId}"]`);
			if (placeholderRow) {
				answerElement = placeholderRow.querySelector('.chat-message-content') as HTMLElement;
			}

			const placeholderIndexInData = this.prompt_table.findIndex(m => m.id === assistantPlaceholderId);
			if (placeholderIndexInData > -1) {
				this.prompt_table.splice(placeholderIndexInData, 1); 
			} else {
				console.warn("Could not find placeholder message in prompt_table before API call.");
			}
			
			const view = this.app.workspace.getActiveViewOfType(MarkdownView) as MarkdownView;
			const api_prompts: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = this.prompt_table.map(({ id, ...rest }) => rest);

			let answer: string | undefined;
			try {
				answer = await this.aiAssistant.text_api_call(
					api_prompts,
					answerElement, 
					view,
				);
			} catch (error) {
				console.error("Error during text_api_call:", error);
				answer = "Error receiving answer."; 
			}

			this.prompt_table.push({
				role: "assistant",
				content: answer ?? "Error receiving answer.", 
				id: assistantPlaceholderId
			});
			
			await this.displayModalContent(); // Final refresh with answer and updated token count

			this.is_generating_answer = false; 
			this.scrollToBottom(); 
		}
	};


	extract_text = (
		items:
			| OpenAI.Chat.Completions.ChatCompletionMessageParam["content"]
			| undefined,
	): string => {
		if (items === undefined || items === null) {
			return "";
		}
		if (typeof items === "string") {
			return items;
		}
		let output = "";
		for (const content of items) {
			if (content.type === "text") {
				output += content.text;
			} else if (content.type === "image_url" && content.image_url && content.image_url.url) {
				// This part is for display/copying, not token counting.
				// For token counting, calculateChatTokens handles text parts separately.
				output += `[Image: ${content.image_url.url.substring(0, 30)}...]`;
			}
		}
		return output.trim();
	};

	calculateChatTokens = async (): Promise<number | null> => {
        if (this.tokenizerInitializationPromise) {
            await this.tokenizerInitializationPromise; // Ensure initialization is complete
        }

        if (!this.tokenizer) {
            return null;
        }
        
        let totalTokens = 0;
        for (const message of this.prompt_table) {
            let textToTokenize = "";
            if (typeof message.content === 'string') {
                textToTokenize = message.content;
            } else if (Array.isArray(message.content)) {
                for (const part of message.content) {
                    if (part.type === 'text') {
                        textToTokenize += part.text;
                    }
                    // Image parts are not tokenized for this text context count
                }
            }
            if (textToTokenize) {
                totalTokens += this.tokenizer.encode(textToTokenize.trim()).length;
            }
        }
        return totalTokens;
    };

	scrollToBottom = () => {
		setTimeout(() => {
			if (this.messageContainer) {
				this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
			}
		}, 0);
	};

	private async updateTokenCountDisplay(tokenCountDiv: HTMLDivElement) {
        try {
            const currentTokens = await this.calculateChatTokens();
            if (currentTokens !== null) {
                tokenCountDiv.setText(`Context Tokens: ${currentTokens} / ${this.plugin.settings.maxTokens}`);
            } else {
                tokenCountDiv.setText(`Context Tokens: N/A / ${this.plugin.settings.maxTokens}`);
            }
        } catch (error) {
            console.warn("AI Assistant: Error calculating token count for display.", error);
            tokenCountDiv.setText(`Context Tokens: Error / ${this.plugin.settings.maxTokens}`);
        }
    }


	displayModalContent = async () => {
		const { contentEl } = this;
		contentEl.empty();

		this.messageContainer = contentEl.createEl("div", {
			cls: "chat-modal-container",
		});
		const view = this.app.workspace.getActiveViewOfType(
			MarkdownView,
		) as MarkdownView;

		for (const [index, x] of this.prompt_table.entries()) {
			const messageRow = this.messageContainer.createEl("div", {
				cls: `chat-message-row ${x.role}`,
			});
			messageRow.dataset.entryId = x.id;

			const actionsContainer = messageRow.createDiv({
				cls: "chat-message-actions",
			});

			const messageContentDiv = messageRow.createEl("div", {
				cls: `chat-message-content`,
			});

			const editButton = actionsContainer.createEl("button", {
				text: EDIT_BUTTON_ICON,
				cls: "chat-edit-button",
				attr: { title: "Edit message" }
			});
			editButton.disabled = this.is_running_chain; 
			editButton.addEventListener("click", (e) => {
				e.stopPropagation(); 
				this.edit_message(x.id);
			});

			const deleteButton = actionsContainer.createEl("button", {
				text: DELETE_BUTTON_ICON,
				cls: "chat-delete-button",
				attr: { title: "Delete message" }
			});
			deleteButton.disabled = this.is_running_chain; 
			deleteButton.addEventListener("click", (e) => {
				e.stopPropagation(); 
				this.delete_message(x.id);
			});


			messageContentDiv.addEventListener("click", async () => {
				if (this.is_running_chain) return; 
				await navigator.clipboard.writeText(this.extract_text(x.content));
				new Notice("Message content copied!");
			});
			messageContentDiv.title = "Click to copy message content";

			if (x.role === "assistant") {
				const contentToRender = typeof x.content === 'string' ? x.content : this.extract_text(x.content);
				if (contentToRender === "Generating Answer...") {
					messageContentDiv.setText(contentToRender); 
				} else {
					await MarkdownRenderer.renderMarkdown(
						contentToRender,
						messageContentDiv,
						this.plugin.app.vault.getRoot().path,
						view,
					);
				}
			} else { 
				if (Array.isArray(x.content)) {
					for (const contentItem of x.content) {
						if (contentItem.type === "text") {
							await MarkdownRenderer.renderMarkdown(contentItem.text, messageContentDiv, this.plugin.app.vault.getRoot().path, view);
						} else if (contentItem.type === "image_url") {
							const image = messageContentDiv.createEl("img", { cls: "image-modal-image" });
							image.setAttribute("src", contentItem.image_url.url);
							image.style.maxWidth = "100%"; 
							image.style.maxHeight = "200px"; 
							image.style.objectFit = "contain"; 
							image.style.display = "block"; 
							image.style.marginTop = "5px"; 
							image.style.marginBottom = "5px";
						}
					}
				} else if (typeof x.content === 'string') {
					await MarkdownRenderer.renderMarkdown(x.content, messageContentDiv, this.plugin.app.vault.getRoot().path, view);
				}
			}
		}

		const footerEl = contentEl.createDiv({ cls: "chat-modal-footer" });

		const inputAndButtonsContainer = footerEl.createDiv({ cls: "chat-input-buttons-container" });

		const input_field = inputAndButtonsContainer.createEl("textarea", {
			placeholder: this.editingMessageId ? "Edit your message..." : (this.is_running_chain ? "Running prompt chain..." : "Your prompt here..."),
		});
		input_field.rows = 2;
		input_field.value = this.prompt_text; 
		input_field.disabled = this.is_running_chain; 

		input_field.addEventListener("input", (e) => {
			this.prompt_text = (e.target as HTMLTextAreaElement).value;
		});
		input_field.addEventListener("keypress", (evt) => {
			if (evt.key === "Enter" && !evt.shiftKey && !this.is_running_chain) { 
				evt.preventDefault();
				this.send_action();
			}
		});

		const button_row = inputAndButtonsContainer.createEl("div", {
			cls: "chat-button-row",
		});

		const modelSelectorContainer = button_row.createDiv({ cls: "chat-model-selector-inline" });
		new Setting(modelSelectorContainer)
			.addDropdown((dropdown) => {
				dropdown
					.addOptions(LLM_MODELS)
					.setValue(this.aiAssistant.modelName)
					.setDisabled(this.is_running_chain) 
					.onChange(async (value) => {
						this.aiAssistant.modelName = value;
						new Notice(`Chat model set to: ${LLM_MODELS[value as keyof typeof LLM_MODELS]}`);
					});
			});
		
		const actionButtonsGroup = button_row.createDiv({ cls: "chat-action-buttons-group" });
		actionButtonsGroup.style.display = "flex";
		actionButtonsGroup.style.gap = "5px"; 

		const record_chat_button = actionButtonsGroup.createEl("button", {
            text: this.is_chat_recording ? STOP_RECORD_ICON : RECORD_AUDIO_ICON
        });
        record_chat_button.title = this.is_chat_recording ? "Stop recording chat audio" : "Record audio for chat prompt";
        if (this.is_chat_recording) {
            record_chat_button.style.borderColor = "red";
        } else {
            record_chat_button.style.borderColor = "";
        }
        record_chat_button.disabled = this.is_generating_answer || !!this.editingMessageId || this.is_running_chain;

        record_chat_button.addEventListener("click", async () => {
            const inputField = contentEl.querySelector('.chat-modal-footer textarea') as HTMLTextAreaElement;
            if (!inputField) {
                new Notice("Chat input field not found.");
                return;
            }

            if (this.is_chat_recording) {
                await this.stopChatRecording(record_chat_button);
                // UI update for button text/style is handled by stopChatRecording or its callbacks (onstop)
            } else {
                if (this.is_generating_answer || this.editingMessageId || this.is_running_chain) {
                    new Notice("Cannot record while another action is in progress or editing.");
                    return;
                }
                await this.startChatRecording(inputField, record_chat_button);
                // Update button based on whether recording actually started
                if (this.is_chat_recording) {
                    record_chat_button.setText(STOP_RECORD_ICON);
                    record_chat_button.style.borderColor = "red";
                    record_chat_button.title = "Stop recording chat audio";
                } else { // If starting failed, ensure button is reset
                    record_chat_button.setText(RECORD_AUDIO_ICON);
                    record_chat_button.style.borderColor = "";
                    record_chat_button.title = "Record audio for chat prompt";
                }
            }
        });


		const load_chat_button = actionButtonsGroup.createEl("button", { text: LOAD_CHAT_ICON });
		load_chat_button.title = "Load Chat";
		load_chat_button.disabled = this.is_running_chain; 
		load_chat_button.addEventListener("click", () => {
			new LoadChatSuggestModal(this.app, this).open();
		});

		const save_chat_button = actionButtonsGroup.createEl("button", { text: SAVE_CHAT_ICON });
		save_chat_button.title = "Save Chat";
		save_chat_button.disabled = this.is_running_chain; 
		save_chat_button.addEventListener("click", () => {
			this.saveChat(); 
		});

		const clear_button = actionButtonsGroup.createEl("button", { text: CLEAR_BUTTON_ICON });
		clear_button.title = "Clear Chat";
		clear_button.disabled = this.is_running_chain; 
		clear_button.addEventListener("click", () => {
			this.prompt_table = [];
			this.prompt_text = "";
			this.editingMessageId = null;
			this.displayModalContent(); // This will re-render and update token count (to 0)
		});

		const copy_conversation_button = actionButtonsGroup.createEl("button", { text: COPY_BUTTON_ICON });
		copy_conversation_button.title = "Copy Conversation";
		copy_conversation_button.disabled = this.is_running_chain; 
		copy_conversation_button.addEventListener("click", async () => {
			let conversation = this.prompt_table
				.map((x) => `${x.role}:\n${this.extract_text(x.content)}`)
				.join("\n\n---\n\n");
			await navigator.clipboard.writeText(conversation.trim());
			new Notice("Conversation copied to clipboard");
		});

		const insert_to_obsidian_button = actionButtonsGroup.createEl("button", { text: INSERT_BUTTON_ICON });
		insert_to_obsidian_button.title = "Insert last assistant message to note";
		insert_to_obsidian_button.disabled = this.is_running_chain; 
		insert_to_obsidian_button.addEventListener("click", () => {
			const lastAssistantMessage = [...this.prompt_table].reverse().find(msg => msg.role === 'assistant');
			const editor = this.app.workspace.activeEditor?.editor;

			if (lastAssistantMessage && lastAssistantMessage.content && editor) {
				const textToInsert = this.extract_text(lastAssistantMessage.content);
				if (textToInsert) {
					editor.replaceSelection(textToInsert);
					this.close();
				} else {
					new Notice("Last assistant message has no text content to insert.");
				}
			} else if (!editor) {
				new Notice("No active editor found to insert text.");
			} else {
				new Notice("No assistant message found.");
			}
		});
		
		const addContentGroup = button_row.createDiv({ cls: "chat-add-content-group" });
		addContentGroup.style.display = "flex";
		addContentGroup.style.gap = "5px";

		const hidden_add_file_button = addContentGroup.createEl(
			"input", { type: "file", cls: "hidden-file" }
		);
		hidden_add_file_button.setAttribute("accept", ".png, .jpg, .jpeg, .gif, .webp");
		hidden_add_file_button.addEventListener("change", async (e: Event) => {
			const files = (e.target as HTMLInputElement).files;
			if (files && files.length > 0) {
				const base64String = await convertBlobToBase64(files[0]);
				const imageContent: OpenAI.Chat.Completions.ChatCompletionContentPartImage = {
					type: "image_url",
					image_url: { url: base64String, detail: "auto" }
				};

				if (this.editingMessageId || this.is_running_chain) {
					new Notice("Cannot add images while editing or running a chain.");
					hidden_add_file_button.value = ""; 
					return;
				}

				const lastMessage = this.prompt_table.at(-1);
				if (lastMessage && lastMessage.role === "user") {
					if (typeof lastMessage.content === 'string') {
						lastMessage.content = [{ type: "text", text: lastMessage.content }, imageContent];
					} else if (Array.isArray(lastMessage.content)) {
						lastMessage.content.push(imageContent);
					} else {
						this.prompt_table.push({ role: "user", content: [imageContent], id: generateUniqueId() });
					}
				} else {
					this.prompt_table.push({ role: "user", content: [imageContent], id: generateUniqueId() });
				}

				format_prompt_table(this.prompt_table); 
				await this.displayModalContent(); // Refresh UI, including token count
				this.scrollToBottom();
			}
			hidden_add_file_button.value = ""; 
		});

		const add_image_button = addContentGroup.createEl("button", { text: ADD_IMAGE_ICON });
		add_image_button.title = "Add image";
		add_image_button.disabled = this.is_running_chain; 
		add_image_button.addEventListener("click", () => {
			if (this.editingMessageId) {
				new Notice("Cannot add images while editing a message. Save or cancel edit first.");
				return;
			}
			hidden_add_file_button.click();
		});

		const add_file_button = addContentGroup.createEl("button", { text: ADD_FILE_ICON });
		add_file_button.title = "Add file context";
		add_file_button.disabled = this.is_running_chain; 
		add_file_button.addEventListener("click", () => {
			if (this.editingMessageId) {
				new Notice("Cannot add file context while editing a message. Save or cancel edit first.");
				return;
			}
			new FileSuggestModal(this.app, this).open(); 
		});


		const add_folder_button = addContentGroup.createEl("button", { text: ADD_FOLDER_ICON });
		add_folder_button.title = "Add folder context";
		add_folder_button.disabled = this.is_running_chain; 
		add_folder_button.addEventListener("click", () => {
			if (this.editingMessageId) {
				new Notice("Cannot add folder context while editing a message. Save or cancel edit first.");
				return;
			}
			new FolderSuggestModal(this.app, this).open();
		});

		const prompt_chain_button = addContentGroup.createEl("button", { text: PROMPT_CHAIN_ICON });
		prompt_chain_button.title = "Run prompt chain (.chain.md)";
		prompt_chain_button.disabled = this.is_running_chain; 
		prompt_chain_button.addEventListener("click", () => {
			if (this.editingMessageId) {
				new Notice("Cannot run prompt chain while editing a message. Save or cancel edit first.");
				return;
			}
			new PromptChainSuggestModal(this.app, this).open(); 
		});
		
		const submit_btn = button_row.createEl("button", {
			text: this.editingMessageId ? EDIT_BUTTON_ICON : SEND_BUTTON_ICON, 
			cls: "mod-cta",
		});
		submit_btn.title = this.editingMessageId ? "Save Edit" : "Send Message";
		submit_btn.disabled = this.is_running_chain; 
		submit_btn.addEventListener("click", () => {
			this.send_action();
		});

		// Token count display
		const tokenCountDiv = footerEl.createDiv({ cls: "chat-token-count" });
		// Asynchronously update the token count. Initial display might be "N/A" or placeholder.
        this.updateTokenCountDisplay(tokenCountDiv);
		
		input_field.focus();

		const convertBlobToBase64 = (blob: Blob): Promise<string> => {
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onerror = () => reject(reader.error);
				reader.onload = () => {
					resolve(reader.result as string);
				};
				reader.readAsDataURL(blob);
			});
		};
	};

	async onOpen() {
		this.modalEl.addClass('ai-chat-modal-fullscreen');
		
        // Await tokenizer initialization before loading chat or displaying content,
        // as these operations might depend on the tokenizer for token counts.
        if (this.tokenizerInitializationPromise) {
            await this.tokenizerInitializationPromise;
        }
		
		if (this.currentChatFileName === "default") {
			await this.tryLoadChatByName("default");
		}
		// If currentChatFileName is timestamped (due to initial context), 
		// tryLoadChatByName is NOT called. The prompt_table will contain 
		// the initialMessage if provided.

		await this.displayModalContent(); // This will now correctly trigger async token updates
		this.scrollToBottom();
	}

	async onClose() {
		if (this.is_chat_recording) {
			await this.stopChatRecording(); // Pass no button as it's closing
		}
		this.chat_recorder = null;
		this.chat_gumStream = null;
		this.is_chat_recording = false;

		// If it's the "default" chat, always save it (even if empty to persist a cleared state).
		if (this.currentChatFileName === "default") {
			await this.performSaveChat(this.currentChatFileName, true); // true for silent save
		} 
		// For non-default (e.g., timestamped) chats, only save if there's content.
		else if (this.prompt_table.length > 0) { 
			await this.performSaveChat(this.currentChatFileName, true); // true for silent save
		}

		this.is_running_chain = false;
		this.contentEl.empty();
		this.messageContainer = null;

		// Free the tokenizer when the modal is closed
        // Ensure initialization is complete before trying to free
        if (this.tokenizerInitializationPromise) {
            await this.tokenizerInitializationPromise;
        }
		if (this.tokenizer) {
			try {
				this.tokenizer.free();
			} catch (e) {
				console.warn("AI Assistant: Error freeing tiktoken tokenizer:", e);
			}
			this.tokenizer = null;
		}
	}
}

// --- New Suggest Modal for Loading Chats ---
export class LoadChatSuggestModal extends SuggestModal<TFile> {
	chatModal: ChatModal;

	constructor(app: App, chatModal: ChatModal) {
		super(app);
		this.chatModal = chatModal;
		this.setPlaceholder("Search for a saved chat to load...");
	}

	getSuggestions(query: string): TFile[] {
		const lowerCaseQuery = query.toLowerCase();
		const chatFolder = this.app.vault.getAbstractFileByPath(normalizePath(CHAT_SAVE_FOLDER));

		if (!(chatFolder instanceof TFolder)) {
			return [];
		}

		return chatFolder.children.filter((file): file is TFile => {
			return file instanceof TFile &&
				file.extension === 'json' &&
				file.basename.toLowerCase().includes(lowerCaseQuery); 
		});
	}

	renderSuggestion(file: TFile, el: HTMLElement) {
		el.createEl("div", { text: file.basename });
	}

	async onChooseSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent) {
		try {
			const fileContent = await this.app.vault.read(file);
			await this.chatModal.loadChatContents(fileContent); 
			this.chatModal.currentChatFileName = file.basename; // Set the current name
			await this.chatModal.displayModalContent(); // Refresh display, including token count
			this.chatModal.scrollToBottom();
			new Notice(`Chat "${file.basename}.json" loaded.`);
		} catch (error) {
			console.error(`Error reading chat file ${file.path}:`, error);
			new Notice(`Failed to read or parse chat file: ${file.name}`);
		}
	}
}
// --- End LoadChatSuggestModal ---

// --- New Suggest Modal for Adding Files ---
export class FileSuggestModal extends SuggestModal<TFile> {
	chatModal: ChatModal;

	constructor(app: App, chatModal: ChatModal) {
		super(app);
		this.chatModal = chatModal;
		this.setPlaceholder("Search for a markdown file to add its content...");
	}

	getSuggestions(query: string): TFile[] {
		const lowerCaseQuery = query.toLowerCase();
		return this.app.vault.getMarkdownFiles().filter(file =>
			file.path.toLowerCase().includes(lowerCaseQuery)
		);
	}

	renderSuggestion(file: TFile, el: HTMLElement) {
		el.createEl("div", { text: file.path });
	}

	async onChooseSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent) {
		try {
			const fileContent = await this.app.vault.read(file);
			this.chatModal.addFileContentAsUserMessage(fileContent, file.name);
		} catch (error) {
			console.error(`Error reading file ${file.path}:`, error);
			new Notice(`Failed to read file: ${file.name}`);
		}
	}
}
// --- End FileSuggestModal ---

// --- New Suggest Modal for Prompt Chains ---
export class PromptChainSuggestModal extends SuggestModal<TFile> {
	chatModal: ChatModal;

	constructor(app: App, chatModal: ChatModal) {
		super(app);
		this.chatModal = chatModal;
		this.setPlaceholder("Search for a prompt chain file (.chain.md)...");
	}

	getSuggestions(query: string): TFile[] {
		const lowerCaseQuery = query.toLowerCase();
		return this.app.vault.getFiles().filter(file =>
			file.name.toLowerCase().endsWith('.chain.md') &&
			file.path.toLowerCase().includes(lowerCaseQuery) 
		);
	}

	renderSuggestion(file: TFile, el: HTMLElement) {
		el.createEl("div", { text: file.path });
	}

	async onChooseSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent) {
		try {
			const fileContent = await this.app.vault.read(file);
			await this.chatModal.runPromptChain(fileContent);
		} catch (error) {
			console.error(`Error reading prompt chain file ${file.path}:`, error);
			new Notice(`Failed to read prompt chain file: ${file.name}`);
		}
	}
}
// --- End PromptChainSuggestModal ---


export class FolderSuggestModal extends SuggestModal<TFolder> {
	chatModal: ChatModal;

	constructor(app: App, chatModal: ChatModal) {
		super(app);
		this.chatModal = chatModal;
		this.setPlaceholder("Search for a folder to add its content to the chat...");
	}

	getSuggestions(query: string): TFolder[] {
		const lowerCaseQuery = query.toLowerCase();
		return this.app.vault.getAllLoadedFiles().filter((file): file is TFolder => {
			return file instanceof TFolder && file.path.toLowerCase().includes(lowerCaseQuery);
		});
	}

	renderSuggestion(folder: TFolder, el: HTMLElement) {
		el.createEl("div", { text: folder.path });
	}

	async onChooseSuggestion(folder: TFolder, evt: MouseEvent | KeyboardEvent) {
		const collectedContent: string[] = [];
		let fileCount = 0;
		const MAX_CONTENT_LENGTH = 1000000; 
		let currentLength = 0;
		let truncated = false;

		const processFile = async (mdFile: TFile) => {
			if (truncated) return;
			try {
				const content = await this.app.vault.read(mdFile);
				const fileHeader = `File /${mdFile.path} contents:\n`;
				const contentToAdd = `${fileHeader}${content}\n`;

				if (currentLength + contentToAdd.length > MAX_CONTENT_LENGTH) {
					const remainingLength = MAX_CONTENT_LENGTH - currentLength;
					if (remainingLength > fileHeader.length + 50) { 
						collectedContent.push(`${fileHeader}${content.substring(0, remainingLength - fileHeader.length - 4)}...\n`);
						fileCount++;
					}
					truncated = true;
					new Notice(`Content truncated due to length limit (${MAX_CONTENT_LENGTH} chars).`, 10000);
					return;
				}

				collectedContent.push(contentToAdd);
				currentLength += contentToAdd.length;
				fileCount++;
			} catch (error) {
				console.error(`Error reading file ${mdFile.path}:`, error);
				new Notice(`Failed to read file: ${mdFile.path}`);
			}
		};

		const filesToProcess: TFile[] = [];
		Vault.recurseChildren(folder, (item: TAbstractFile) => {
			if (item instanceof TFile && item.extension === 'md') {
				filesToProcess.push(item);
			}
		});

		filesToProcess.sort((a, b) => a.path.localeCompare(b.path));


		for (const mdFile of filesToProcess) {
			await processFile(mdFile);
			if (truncated) break;
		}

		if (fileCount === 0) {
			new Notice(`No markdown files found in "${folder.name}".`);
			return;
		}

		const finalString = `***Folder Context (${folder.name}):***\n${collectedContent.join('\n---\n\n')}`;
		this.chatModal.addFolderContentAsUserMessage(finalString);
	}
}

export class ImageModal extends Modal {
	imageUrls: string[];
	selectedImageUrls: string[];
	assetFolder: string;

	constructor(
		app: App,
		imageUrls: string[],
		title: string,
		assetFolder: string,
	) {
		super(app);
		this.imageUrls = imageUrls;
		this.selectedImageUrls = [];
		this.titleEl.setText(title);
		this.assetFolder = assetFolder;
	}

	onOpen() {
		const container = this.contentEl.createEl("div", {
			cls: "image-modal-container",
		});

		for (const imageUrl of this.imageUrls) {
			const imgWrapper = container.createEl("div", {
				cls: "image-modal-wrapper",
			});

			const img = imgWrapper.createEl("img", {
				cls: "image-modal-image",
			});
			img.src = imageUrl;

			img.addEventListener("click", async () => {
				if (this.selectedImageUrls.includes(imageUrl)) {
					this.selectedImageUrls = this.selectedImageUrls.filter(
						(url) => url !== imageUrl,
					);
					img.style.border = "none";
				} else {
					this.selectedImageUrls.push(imageUrl);
					img.style.border = "2px solid blue";
				}
			});
		}
		const selectionNotice = container.createEl("p", {
			text: "Click on images to select them for download and copying to clipboard.",
			cls: "image-modal-selection-notice"
		});
		selectionNotice.style.width = "100%";
		selectionNotice.style.textAlign = "center";
		selectionNotice.style.marginTop = "10px";
	}

	downloadImage = async (url: string, path: string) => {
		const response = await requestUrl({ url: url });
		await this.app.vault.adapter.writeBinary(path, response.arrayBuffer);
	};

	getImageName = (url: string) => {
		try {
			const parsedUrl = new URL(url);
			let name = parsedUrl.pathname.split("/").pop() || `ai-image-${generateUniqueId()}`;
			if (!/\.(png|jpg|jpeg|gif|webp)$/i.test(name)) {
				name += ".png";
			}
			name = name.replace(/[^a-zA-Z0-9._-]/g, '_');
			return name;
		} catch (e) {
			return `ai-image-${generateUniqueId()}.png`;
		}
	};


	saveImagesToVault = async (imageUrls: string[], folderPath: string) => {
		const savedPaths: string[] = [];
		for (const url of imageUrls) {
			const imageName = this.getImageName(url);
			const savePath = normalizePath(folderPath + "/" + imageName); 
			try {
				await this.downloadImage(url, savePath);
				savedPaths.push(savePath); 
			} catch (downloadError) {
				console.error(`Error downloading image ${url} to ${savePath}:`, downloadError);
				new Notice(`Failed to download image: ${imageName}`);
			}
		}
		return savedPaths; 
	};


	async onClose() {
		if (this.selectedImageUrls.length > 0) {
			const normalizedAssetFolder = normalizePath(this.assetFolder); 
			if (!await this.app.vault.adapter.exists(normalizedAssetFolder)) {
				try {
					await this.app.vault.createFolder(normalizedAssetFolder);
				} catch (error) {
					console.error("Error creating directory:", error);
					new Notice(`Error creating image folder: ${normalizedAssetFolder}`);
				}
			}

			let savedImagePaths: string[] = [];
			try {
				savedImagePaths = await this.saveImagesToVault(
					this.selectedImageUrls,
					normalizedAssetFolder,
				);
				if (savedImagePaths.length > 0) {
					new Notice(`${savedImagePaths.length} image(s) saved to ${normalizedAssetFolder}.`);
				}
				if (savedImagePaths.length !== this.selectedImageUrls.length) {
					new Notice(`Failed to save ${this.selectedImageUrls.length - savedImagePaths.length} image(s).`);
				}
			} catch (e) {
				new Notice("Error occurred while downloading images.");
				console.error("Image download process error:", e);
			}

			if (savedImagePaths.length > 0) {
				try {
					const markdownLinks = savedImagePaths
						.map(path => {
							const file = this.app.vault.getAbstractFileByPath(path);
							if (file instanceof TFile) {
								return this.app.fileManager.generateMarkdownLink(
									file,
									this.app.vault.getRoot().path 
								);
							}
							return `[[${path}]]`; 
						})
						.join("\n\n");
					await navigator.clipboard.writeText(markdownLinks + "\n");
					new Notice("Image links copied to clipboard.");
				} catch (e) {
					new Notice("Error while copying image links to clipboard.");
					console.error("Clipboard copy error:", e);
				}
			}
		}
		this.contentEl.empty();
	}
}

export class SpeechModal extends Modal {
	recorder: MediaRecorder | null;
	gumStream: MediaStream | null;
	assistant: OpenAIAssistant;
	editor: Editor;
	is_cancelled: boolean;
	language: string;
	stopButton: HTMLButtonElement;
	is_recording = false;


	constructor(app: App, assistant: OpenAIAssistant, language: string, editor: Editor) {
		super(app);
		this.assistant = assistant;
		this.language = language;
		this.editor = editor;
		this.is_cancelled = false;
		this.recorder = null;
		this.gumStream = null;
	}

	stopRecording = () => {
		if (this.recorder && this.recorder.state === "recording") {
			this.recorder.stop();
		}
		if (this.gumStream) {
			this.gumStream.getAudioTracks().forEach(track => track.stop());
		}
		this.is_recording = false;
		if (this.stopButton) {
			this.stopButton.setText("Record");
			this.stopButton.style.borderColor = "";
		}
		this.titleEl.setText("Speech to Text");
	};


	start_recording = async (
		constraints: MediaStreamConstraints,
		mimeType: string,
	) => {
		try {
			let chunks: Blob[] = [];
			this.gumStream =
				await navigator.mediaDevices.getUserMedia(constraints);
			this.is_recording = true;

			const options = {
				audioBitsPerSecond: 256000,
				mimeType: mimeType,
			};
			this.recorder = new MediaRecorder(this.gumStream, options);

			this.recorder.ondataavailable = async (e: BlobEvent) => {
				chunks.push(e.data);
				if (this.recorder && this.recorder.state == "inactive" && !this.is_cancelled) {
					const audioFile = new File(
						chunks,
						`speech-input.${mimeType.split("/").pop()}`,
						{ type: mimeType }
					);
					const answer = await this.assistant.whisper_api_call(
						audioFile,
						this.language,
					);

					if (answer) {
						this.editor.replaceRange(
							answer,
							this.editor.getCursor(),
						);
						const newPos = {
							line: this.editor.getCursor().line,
							ch: this.editor.getCursor().ch + answer.length,
						};
						this.editor.setCursor(newPos.line, newPos.ch);
					}
					this.close();
				}
			};
			this.recorder.start(1000);
			this.titleEl.setText("Listening...");
			if (this.stopButton) {
				this.stopButton.setText("Stop Recording");
				this.stopButton.style.borderColor = "red";
			}
			new Notice("Recording started...");

		} catch (err: any) {
			new Notice(`Error starting recording: ${err.message}`);
			this.is_recording = false;
			if (this.stopButton) {
				this.stopButton.setText("Record");
				this.stopButton.style.borderColor = "";
			}
			this.titleEl.setText("Speech to Text");
			this.close();
		}
	};

	async onOpen() {
		const { contentEl } = this;
		this.titleEl.setText("Speech to Text");

		let mimeType: string | undefined;
		if (MediaRecorder.isTypeSupported("audio/webm")) {
			mimeType = "audio/webm";
		} else if (MediaRecorder.isTypeSupported("audio/mp4")) {
			mimeType = "audio/mp4";
		} else {
			new Notice("No suitable audio recording format supported by your browser.");
			this.close();
			return;
		}

		const constraints = { audio: true };

		const button_container = contentEl.createEl("div", {
			cls: "speech-modal-container",
		});

		this.stopButton = button_container.createEl("button", {
			text: "Stop Recording",
			cls: "record-button",
		});
		this.stopButton.style.borderColor = "red";

		this.start_recording(constraints, mimeType!);


		this.stopButton.addEventListener("click", () => {
			if (this.recorder && this.recorder.state === "recording") {
				new Notice("Stopping recording...");
				this.stopButton.disabled = true;
				this.titleEl.setText("Processing audio...");
				this.stopRecording();
			}
		});

		const cancel_button = button_container.createEl("button", {
			text: "Cancel",
		});

		cancel_button.addEventListener("click", (e) => {
			this.is_cancelled = true;
			this.stopRecording();
			this.close();
		});
	}

	async onClose() {
		if (this.is_recording) {
			this.stopRecording();
		}
		this.contentEl.empty();
	}
}

export class FrequentPromptSuggestModal extends SuggestModal<any> {
	plugin: AiAssistantPlugin;
	selectedText: string;
	editor: Editor;

	constructor(app: App, plugin: AiAssistantPlugin, selectedText: string, editor: Editor) {
		super(app);
		this.plugin = plugin;
		this.selectedText = selectedText;
		this.editor = editor;
		const currentModelName = LLM_MODELS[plugin.settings.modelName as keyof typeof LLM_MODELS] || plugin.settings.modelName;
		this.setPlaceholder(`Search prompts (Using: ${currentModelName})...`);
	}

	getSuggestions(query: string): any[] {
		const lowerCaseQuery = query.toLowerCase();
		return this.plugin.settings.promptHistory
			.filter(entry => entry.prompt.toLowerCase().includes(lowerCaseQuery))
			.sort((a, b) => {
				if (b.count !== a.count) {
					return b.count - a.count;
				}
				return b.lastUsed - a.lastUsed;
			});
	}

	renderSuggestion(item: any, el: HTMLElement) {
		el.empty();
		const contentEl = el.createDiv({ cls: "frequent-prompt-suggestion" });
		contentEl.createDiv({ text: item.prompt, cls: "frequent-prompt-text" });
		contentEl.createDiv({
			text: `Count: ${item.count}`,
			cls: "frequent-prompt-count"
		});
	}

	async onChooseSuggestion(item: any, evt: MouseEvent | KeyboardEvent) {
		const promptText = item.prompt;
		let thinkingIntervalId: NodeJS.Timeout | null = null;
		try {
			thinkingIntervalId = setInterval(() => { new Notice("AI is thinking...", 5000); }, 5000);

			let answer = await this.plugin.aiAssistant.text_api_call([
				{ role: "user", content: `${promptText} : ${this.selectedText}` }
			]);
			answer = answer!;

			if (!this.plugin.settings.replaceSelection && this.selectedText) {
				answer = `${this.selectedText}\n\n${answer.trim()}`;
			} else if (!this.plugin.settings.replaceSelection && !this.selectedText) {
				answer = answer.trim();
			}

			if (answer) {
				this.editor.replaceSelection(answer.trim());
			}
			this.plugin.updatePromptHistory(promptText);
		} finally {
			if (thinkingIntervalId) clearInterval(thinkingIntervalId);
		}
	}
}

export class ModelSelectModal extends Modal {
	plugin: AiAssistantPlugin;
	models: typeof LLM_MODELS;

	constructor(app: App, plugin: AiAssistantPlugin) {
		super(app);
		this.plugin = plugin;
		this.models = LLM_MODELS;
	}

	onOpen() {
		const { contentEl } = this;
		this.titleEl.setText("Select LLM Model");

		new Setting(contentEl)
			.setName("Model Name")
			.setDesc("Select the text generation model for the plugin.")
			.addDropdown(dropdown => {
				dropdown
					.addOptions(this.models)
					.setValue(this.plugin.settings.modelName)
					.onChange(async (value) => {
						this.plugin.settings.modelName = value;
						await this.plugin.saveSettings();
						this.plugin.build_api(); 
						new Notice(`Default model changed to: ${this.models[value as keyof typeof LLM_MODELS]}`);
						this.close();
					});
			});
	}

	onClose() {
		this.contentEl.empty();
	}
}
