import {
	App,
	Editor,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFolder,
	TFile,
	MarkdownView,
	Vault, // Import Vault
	TAbstractFile, // Import TAbstractFile
	Menu, // Added import
	MenuItem, // Added import
	Events, // Added import
} from "obsidian";
import { ChatModal, ImageModal, PromptModal, SpeechModal, FrequentPromptSuggestModal, ModelSelectModal } from "./modal";
import { OpenAIAssistant } from "./openai_api";
import {
	ALL_IMAGE_MODELS,
	LLM_MODELS,
	DEFAULT_IMAGE_MODEL,
	DEFAULT_MAX_TOKENS,
} from "./settings";

interface PromptHistoryEntry {
	prompt: string;
	count: number;
	lastUsed: number;
}

interface AiAssistantSettings {
	mySetting: string;
	openAIapiKey: string;
	openRouterApiKey: string;
	llmBaseUrl: string;
	modelName: string;
	imageModelName: string;
	maxTokens: number;
	replaceSelection: boolean;
	imgFolder: string;
	language: string;
	promptHistory: PromptHistoryEntry[];
}

const DEFAULT_SETTINGS: AiAssistantSettings = {
	mySetting: "default",
	openAIapiKey: "",
	openRouterApiKey: "",
	llmBaseUrl: "https://openrouter.ai/api/v1",
	modelName: "google/gemini-2.0-flash-lite-001",
	imageModelName: DEFAULT_IMAGE_MODEL,
	maxTokens: DEFAULT_MAX_TOKENS,
	replaceSelection: true,
	imgFolder: "AI Images",
	language: "en", // Changed from "" to "en" to align with modified-main.js
	promptHistory: [],
};

// Define types for Bookmark items and groups based on Obsidian's structure
// Removed BookmarkItem and BookmarkGroup interfaces as they are no longer used


export default class AiAssistantPlugin extends Plugin {
	settings: AiAssistantSettings;
	aiAssistant: OpenAIAssistant;

	build_api() {
		this.aiAssistant = new OpenAIAssistant(
			this.app,
			this.settings.openAIapiKey,
			this.settings.openRouterApiKey,
			this.settings.llmBaseUrl,
			this.settings.modelName,
			this.settings.maxTokens,
		);
	}

	updatePromptHistory(promptText: string) {
		const existingEntryIndex = this.settings.promptHistory.findIndex(
			(entry) => entry.prompt === promptText,
		);
		if (existingEntryIndex > -1) {
			this.settings.promptHistory[existingEntryIndex].count++;
			this.settings.promptHistory[existingEntryIndex].lastUsed = Date.now();
		} else {
			this.settings.promptHistory.push({
				prompt: promptText,
				count: 1,
				lastUsed: Date.now(),
			});
		}
		this.saveSettings();
	}

	async onload() {
		await this.loadSettings();
		this.build_api();

		this.addCommand({
			id: "chat-mode",
			name: "Open Assistant Chat",
			editorCallback: (editor: Editor) => {
				const selectedText = editor.getSelection()?.trim();
				let initialMessage: string | null = null;
				if (selectedText) {
					initialMessage = `***File Context:***\n${selectedText}`;
				}
				new ChatModal(this.app, this, initialMessage).open();
			},
		});

		this.addCommand({
			id: "prompt-mode",
			name: "Open Assistant Prompt",
			editorCallback: async (editor: Editor) => {
				const selected_text = editor.getSelection().toString().trim();
				new PromptModal(
					this.app,
					async (x: { [key: string]: string }) => {
						let thinkingIntervalId: NodeJS.Timeout | null = null;
						try {
							thinkingIntervalId = setInterval(() => {
								new Notice("AI is thinking...", 5000);
							}, 5000);

							let answer = await this.aiAssistant.text_api_call([
								{
									role: "user",
									content:
										x["prompt_text"] + " : " + selected_text,
								},
							]);
							answer = answer!;
							if (!this.settings.replaceSelection && selected_text) {
								answer = selected_text + "\n\n" + answer.trim();
							} else if (!this.settings.replaceSelection && !selected_text) {
								answer = answer.trim();
							}

							if (answer) {
								editor.replaceSelection(answer.trim());
								this.updatePromptHistory(x["prompt_text"]);
							}
						} finally {
							if (thinkingIntervalId) {
								clearInterval(thinkingIntervalId);
							}
						}
					},
					false,
					{},
					this.aiAssistant,
				).open();
			},
		});

		this.addCommand({
			id: "run-frequent-prompt",
			name: "Run frequent prompt",
			editorCallback: (editor: Editor) => {
				const selectedText = editor.getSelection().toString().trim();
				if (!this.settings.promptHistory || this.settings.promptHistory.length === 0) {
					new Notice("No frequent prompts saved yet.");
					return;
				}
				new FrequentPromptSuggestModal(this.app, this, selectedText, editor).open();
			},
		});

		this.addCommand({
			id: "clean-up-markdown",
			name: "Clean up Markdown",
			editorCallback: async (editor: Editor) => {
				const selected_text = editor.getSelection().toString().trim();
				if (!selected_text) {
					new Notice("No text selected.");
					return;
				}
				const fixed_prompt = "clean up this text into nice markdown format";
				let thinkingIntervalId: NodeJS.Timeout | null = null;
				try {
					thinkingIntervalId = setInterval(() => {
						new Notice("AI is thinking...", 5000);
					}, 5000);

					let answer = await this.aiAssistant.text_api_call([
						{
							role: "user",
							content: fixed_prompt + " : " + selected_text,
						},
					]);
					answer = answer!;

					if (!this.settings.replaceSelection && selected_text) {
						answer = selected_text + "\n\n" + answer.trim();
					} else if (!this.settings.replaceSelection && !selected_text) {
						answer = answer.trim();
					}

					if (answer) {
						editor.replaceSelection(answer.trim());
					}
				} finally {
					if (thinkingIntervalId) {
						clearInterval(thinkingIntervalId);
					}
				}
			},
		});


		this.addCommand({
			id: "img-generator",
			name: "Open Image Generator",
			editorCallback: async (editor: Editor) => {
				new PromptModal(
					this.app,
					async (prompt: { [key: string]: string }) => {
						const answer = await this.aiAssistant.img_api_call(
							this.settings.imageModelName,
							prompt["prompt_text"],
							prompt["img_size"],
							parseInt(prompt["num_img"]),
							prompt["is_hd"] === "true",
						);
						if (answer) {
							const imageModal = new ImageModal(
								this.app,
								answer,
								prompt["prompt_text"],
								this.settings.imgFolder,
							);
							imageModal.open();
						}
					},
					true,
					{ model: this.settings.imageModelName },
					this.aiAssistant,
				).open();
			},
		});

		this.addCommand({
			id: "speech-to-text",
			name: "Open Speech to Text",
			editorCallback: (editor: Editor) => {
				new SpeechModal(
					this.app,
					this.aiAssistant,
					this.settings.language,
					editor,
				).open();
			},
		});

		this.addCommand({
			id: "select-model",
			name: "Select Model",
			callback: () => {
				new ModelSelectModal(this.app, this).open();
			},
		});

		this.addSettingTab(new AiAssistantSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on('file-menu', async (menu, file) => {
				// Show menu items if it's a Markdown file or a Folder
				if ((file instanceof TFile && file.extension === 'md') || file instanceof TFolder) {
					menu.addItem((item) => {
						item.setTitle(file instanceof TFile ? `Collect content of '${file.name}'` : `Collect all markdown in '${file.name}'`)
							.setIcon('copy')
							.onClick(async () => {
								const collectedContent: string[] = [];
								let fileCount = 0;

								const processSingleFile = async (mdFile: TFile) => {
									try {
										const content = await this.app.vault.read(mdFile);
										collectedContent.push(`File /${mdFile.path} contents:\n${content}\n`);
										fileCount++;
									} catch (error) {
										console.error(`Error reading file ${mdFile.path}:`, error);
										new Notice(`Failed to read file: ${mdFile.path}`);
									}
								};

								if (file instanceof TFile && file.extension === 'md') {
									await processSingleFile(file);
								} else if (file instanceof TFolder) {
									const filesToProcess: TFile[] = [];
									Vault.recurseChildren(file, (item: TAbstractFile) => {
										if (item instanceof TFile && item.extension === 'md') {
											filesToProcess.push(item);
										}
									});
									for (const mdFile of filesToProcess) {
										await processSingleFile(mdFile);
									}
								}

								if (fileCount === 0) {
									new Notice(`No markdown content found in '${file.name}'.`);
									return;
								}

								const finalString = collectedContent.join('\n---\n\n');
								try {
									await navigator.clipboard.writeText(finalString);
									if (file instanceof TFile) {
										new Notice(`Content of '${file.name}' copied to clipboard.`);
									} else {
										new Notice(`Collected markdown from ${fileCount} file(s) in '${file.name}' copied to clipboard.`);
									}
								} catch (error) {
									console.error('Failed to copy to clipboard:', error);
									new Notice('Failed to copy collected markdown to clipboard.');
								}
							});
					});

					menu.addItem((item) => {
						item.setTitle(file instanceof TFile ? `Chat with '${file.name}'` : `Chat with Folder '${file.name}'`)
							.setIcon('message-circle')
							.onClick(async () => {
								const collectedContent: string[] = [];
								let fileCount = 0;
								const MAX_CONTENT_LENGTH = 1000000;
								let currentLength = 0;
								let truncated = false;
								let contextTitle = "";

								const processFileForChat = async (mdFile: TFile) => {
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

								if (file instanceof TFile && file.extension === 'md') {
									contextTitle = `File Context (${file.name})`;
									await processFileForChat(file);
								} else if (file instanceof TFolder) {
									contextTitle = `Folder Context (${file.name})`;
									const filesToProcessInFolder: TFile[] = [];
									Vault.recurseChildren(file, (item: TAbstractFile) => {
										if (item instanceof TFile && item.extension === 'md') {
											filesToProcessInFolder.push(item);
										}
									});
									for (const mdFile of filesToProcessInFolder) {
										await processFileForChat(mdFile);
										if (truncated) break;
									}
								}

								if (fileCount === 0) {
									new Notice(`No markdown content found to chat with in '${file.name}'.`);
									return;
								}
								const finalString = `***${contextTitle}:***\n${collectedContent.join('\n---\n\n')}`;
								new ChatModal(this.app, this, finalString).open();
							});
					});
				}
			})
		);

		// Event listener for multi-selection context menu
		this.registerEvent(
			this.app.workspace.on('files-menu', async (menu, selectedFiles: TAbstractFile[]) => {
				if (!selectedFiles || selectedFiles.length === 0) {
					return;
				}

				menu.addItem((item) => {
					item.setTitle('Collect all markdown from Selection')
						.setIcon('copy')
						.onClick(async () => {
							const collectedContent: string[] = [];
							let fileCount = 0;

							const processItemForCollection = async (abstractFile: TAbstractFile) => {
								if (abstractFile instanceof TFile && abstractFile.extension === 'md') {
									try {
										const content = await this.app.vault.read(abstractFile);
										collectedContent.push(`File /${abstractFile.path} contents:\n${content}\n`);
										fileCount++;
									} catch (error) {
										console.error(`Error reading file ${abstractFile.path}:`, error);
										new Notice(`Failed to read file: ${abstractFile.path}`);
									}
								} else if (abstractFile instanceof TFolder) {
									const filesInFolder: TFile[] = [];
									Vault.recurseChildren(abstractFile, (child: TAbstractFile) => {
										if (child instanceof TFile && child.extension === 'md') {
											filesInFolder.push(child);
										}
									});
									for (const mdFile of filesInFolder) {
										try {
											const content = await this.app.vault.read(mdFile);
											collectedContent.push(`File /${mdFile.path} contents:\n${content}\n`);
											fileCount++;
										} catch (error) {
											console.error(`Error reading file ${mdFile.path}:`, error);
											new Notice(`Failed to read file: ${mdFile.path}`);
										}
									}
								}
							};

							for (const selFile of selectedFiles) {
								await processItemForCollection(selFile);
							}

							if (fileCount === 0) {
								new Notice('No markdown files found in selection.');
								return;
							}

							const finalString = collectedContent.join('\n---\n\n');
							try {
								await navigator.clipboard.writeText(finalString);
								new Notice(`Collected markdown from ${fileCount} file(s) in selection copied to clipboard.`);
							} catch (error) {
								console.error('Failed to copy to clipboard:', error);
								new Notice('Failed to copy collected markdown to clipboard.');
							}
						});
				});

				menu.addItem((item) => {
					item.setTitle('Chat with Selection')
						.setIcon('message-circle')
						.onClick(async () => {
							const collectedContent: string[] = [];
							let fileCount = 0;
							const MAX_CONTENT_LENGTH = 1000000;
							let currentLength = 0;
							let truncated = false;

							const processItemForChat = async (abstractFile: TAbstractFile) => {
								if (truncated) return;

								if (abstractFile instanceof TFile && abstractFile.extension === 'md') {
									try {
										const content = await this.app.vault.read(abstractFile);
										const fileHeader = `File /${abstractFile.path} contents:\n`;
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
										console.error(`Error reading file ${abstractFile.path}:`, error);
										new Notice(`Failed to read file: ${abstractFile.path}`);
									}
								} else if (abstractFile instanceof TFolder) {
									const filesInFolder: TFile[] = [];
									Vault.recurseChildren(abstractFile, (child: TAbstractFile) => {
										if (child instanceof TFile && child.extension === 'md') {
											filesInFolder.push(child);
										}
									});
									for (const mdFile of filesInFolder) {
										if (truncated) break;
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
												break; 
											}
											collectedContent.push(contentToAdd);
											currentLength += contentToAdd.length;
											fileCount++;
										} catch (error) {
											console.error(`Error reading file ${mdFile.path}:`, error);
											new Notice(`Failed to read file: ${mdFile.path}`);
										}
									}
								}
							};

							for (const selFile of selectedFiles) {
								await processItemForChat(selFile);
								if (truncated) break;
							}

							if (fileCount === 0) {
								new Notice('No markdown files found in selection to chat with.');
								return;
							}
							const finalString = `***Multi-Selection Context:***\n${collectedContent.join('\n---\n\n')}`;
							new ChatModal(this.app, this, finalString).open();
						});
				});
			})
		);


		// Event listener for bookmark group context menu - REMOVED
		// this.registerEvent(
		// 	this.app.workspace.on('bookmarks:menu-group', (menu: Menu, group: BookmarkGroup) => {
		// 		menu.addItem((item: MenuItem) => {
		// 			item.setTitle('Chat With Group')
		// 				.setIcon('message-circle')
		// 				.onClick(async () => {
		// 					const collectedContent: string[] = [];
		// 					let fileCount = 0;
		// 					const MAX_CONTENT_LENGTH = 1000000; // Same as folder chat
		// 					let currentLength = 0;
		// 					let truncated = false;

		// 					if (!group.items || group.items.length === 0) {
		// 						new Notice(`Bookmark group "${group.title}" is empty.`);
		// 						return;
		// 					}

		// 					for (const bookmarkItem of group.items) {
		// 						if (truncated) break;

		// 						if (bookmarkItem.type === 'file' && bookmarkItem.path) {
		// 							const abstractFile = this.app.vault.getAbstractFileByPath(bookmarkItem.path);
		// 							if (abstractFile instanceof TFile && abstractFile.extension === 'md') {
		// 								try {
		// 									const content = await this.app.vault.read(abstractFile);
		// 									const fileHeader = `File /${abstractFile.path} contents:\n`;
		// 									const contentToAdd = `${fileHeader}${content}\n`;

		// 									if (currentLength + contentToAdd.length > MAX_CONTENT_LENGTH) {
		// 										const remainingLength = MAX_CONTENT_LENGTH - currentLength;
		// 										if (remainingLength > fileHeader.length + 50) { // Ensure space for header and some content
		// 											collectedContent.push(`${fileHeader}${content.substring(0, remainingLength - fileHeader.length - 4)}...\n`); // Add ellipsis
		// 											fileCount++;
		// 										}
		// 										truncated = true;
		// 										new Notice(`Content truncated due to length limit (${MAX_CONTENT_LENGTH} chars).`, 10000);
		// 										break; 
		// 									}

		// 									collectedContent.push(contentToAdd);
		// 									currentLength += contentToAdd.length;
		// 									fileCount++;
		// 								} catch (error) {
		// 									console.error(`Error reading bookmarked file ${abstractFile.path}:`, error);
		// 									new Notice(`Failed to read bookmarked file: ${abstractFile.name}`);
		// 								}
		// 							}
		// 						}
		// 					}

		// 					if (fileCount === 0) {
		// 						new Notice(`No markdown files found in bookmark group "${group.title}".`);
		// 						return;
		// 					}

		// 					const finalString = `***Bookmark Group Context (${group.title}):***\n${collectedContent.join('\n---\n\n')}`;
		// 					new ChatModal(this.app, this, finalString).open();
		// 				});
		// 		});
		// 	})
		// );
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class AiAssistantSettingTab extends PluginSettingTab {
	plugin: AiAssistantPlugin;

	constructor(app: App, plugin: AiAssistantPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl("h2", { text: "Settings for my AI assistant." });

		new Setting(containerEl).setName("OpenAI API Key")
			.setDesc("Used for DALL-E image generation and Whisper/TTS voice features.")
			.addText((text) =>
				text
					.setPlaceholder("Enter OpenAI key here")
					.setValue(this.plugin.settings.openAIapiKey)
					.onChange(async (value) => {
						this.plugin.settings.openAIapiKey = value;
						await this.plugin.saveSettings();
						this.plugin.build_api();
					}),
			);

		new Setting(containerEl).setName("LLM API Key")
			.setDesc("Used for text generation. Set Base URL accordingly below.")
			.addText((text) =>
				text
					.setPlaceholder("Enter API key here (e.g., OpenRouter key)")
					.setValue(this.plugin.settings.openRouterApiKey)
					.onChange(async (value) => {
						this.plugin.settings.openRouterApiKey = value;
						await this.plugin.saveSettings();
						this.plugin.build_api();
					}),
			);

		containerEl.createEl("h3", { text: "Text Assistant" });

		new Setting(containerEl).setName("LLM Base URL")
			.setDesc("The base URL for the text generation API (e.g., OpenRouter, local LLM).")
			.addText((text) =>
				text
					.setPlaceholder("Enter Base URL")
					.setValue(this.plugin.settings.llmBaseUrl)
					.onChange(async (value) => {
						try {
							new URL(value);
							this.plugin.settings.llmBaseUrl = value.trim();
							await this.plugin.saveSettings();
							this.plugin.build_api();
						} catch (_) {
							new Notice("Please enter a valid URL.");
						}
					}),
			);

		new Setting(containerEl)
			.setName("Model Name")
			.setDesc("Select your model")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(LLM_MODELS)
					.setValue(this.plugin.settings.modelName)
					.onChange(async (value) => {
						this.plugin.settings.modelName = value;
						await this.plugin.saveSettings();
						this.plugin.build_api();
					}),
			);

		new Setting(containerEl)
			.setName("Max Tokens")
			.setDesc("Select max number of generated tokens")
			.addText((text) =>
				text
					.setPlaceholder("Max tokens")
					.setValue(this.plugin.settings.maxTokens.toString())
					.onChange(async (value) => {
						const int_value = parseInt(value);
						if (!int_value || int_value <= 0) {
							new Notice("Error while parsing maxTokens ");
						} else {
							this.plugin.settings.maxTokens = int_value;
							await this.plugin.saveSettings();
							this.plugin.build_api();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Prompt behavior")
			.setDesc("Replace selection")
			.addToggle((toogle) => {
				toogle
					.setValue(this.plugin.settings.replaceSelection)
					.onChange(async (value) => {
						this.plugin.settings.replaceSelection = value;
						await this.plugin.saveSettings();
						// No need to rebuild API for this setting
					});
			});
		containerEl.createEl("h3", { text: "Image Assistant" });
		new Setting(containerEl)
			.setName("Default location for generated images")
			.setDesc("Where generated images are stored.")
			.addText((text) =>
				text
					.setPlaceholder("Enter the path to you image folder")
					.setValue(this.plugin.settings.imgFolder)
					.onChange(async (value) => {
						const path = value.replace(/\/+$/, "");
						if (path) {
							this.plugin.settings.imgFolder = path;
							await this.plugin.saveSettings();
						} else {
							new Notice("Image folder cannot be empty");
						}
					}),
			);
		new Setting(containerEl)
			.setName("Image Model Name")
			.setDesc("Select your model")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(ALL_IMAGE_MODELS)
					.setValue(this.plugin.settings.imageModelName)
					.onChange(async (value) => {
						this.plugin.settings.imageModelName = value;
						await this.plugin.saveSettings();
						this.plugin.build_api();
					}),
			);

		containerEl.createEl("h3", { text: "Speech to Text" });
		new Setting(containerEl)
			.setName("The language of the input audio")
			.setDesc("Using ISO-639-1 format (en, fr, de, ...). Leave empty for auto-detection.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = value;
						await this.plugin.saveSettings();
					}),
			);

		const div = containerEl.createDiv({ cls: "coffee-container" });
		div.createEl("a", {
			href: "https://buymeacoffee.com/qgrail",
		}).createEl("img", {
			attr: {
				src: "https://cdn.buymeacoffee.com/buttons/v2/default-violet.png",
			},
			cls: "coffee-button-img",
		});
	}
}
