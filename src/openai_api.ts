import { App, MarkdownRenderer, MarkdownView, Notice, requestUrl, TFile } from "obsidian";
import { OpenAI } from "openai";
import { DEFAULT_OAI_IMAGE_MODEL, OAI_IMAGE_CAPABLE_MODELS, DEFAULT_WHISPER_MODEL } from "./settings";

export class OpenAIAssistant {
	app: App;
	modelName: string;
	openRouterApiFun: OpenAI; // For general LLM calls via OpenRouter/custom base URL
	openaiApiFun: OpenAI;     // For OpenAI-specific services (TTS, DALL-E if not using requestUrl)
	maxTokens: number;
	openAIapiKey: string;     // Stored for direct use with requestUrl
	openRouterApiKey: string; // Stored for reference, used by openRouterApiFun

	constructor(
		app: App,
		openAIapiKey: string,
		openRouterApiKey: string,
		llmBaseUrl: string,
		modelName: string,
		maxTokens: number,
	) {
		this.app = app;
		this.openAIapiKey = openAIapiKey;
		this.openRouterApiKey = openRouterApiKey; // Though SDK uses it directly

		this.openRouterApiFun = new OpenAI({
			apiKey: openRouterApiKey,
			baseURL: llmBaseUrl,
			dangerouslyAllowBrowser: true,
		});

		this.openaiApiFun = new OpenAI({
			apiKey: openAIapiKey, // Uses default OpenAI base URL
			dangerouslyAllowBrowser: true,
		});

		this.modelName = modelName;
		this.maxTokens = maxTokens;
	}

	log_request = async (
		request_type: string,
		input_data: any,
		output_data: any,
	): Promise<void> => {
		try {
			const now = new Date();
			const dateString = now.toISOString().split("T")[0]; // YYYY-MM-DD
			const logDir = "ai-assistant-logs";
			const logFileName = `ai-assistant-log-${dateString}.json`; // Changed extension to .json
			const logFilePath = `${logDir}/${logFileName}`;

			if (!(await this.app.vault.adapter.exists(logDir))) {
				await this.app.vault.createFolder(logDir);
			}

			let logsArray: any[] = [];
			if (await this.app.vault.adapter.exists(logFilePath)) {
				try {
					const fileContent = await this.app.vault.adapter.read(logFilePath);
					if (fileContent.trim() !== "") {
						logsArray = JSON.parse(fileContent);
						if (!Array.isArray(logsArray)) {
							console.warn(
								"AI Assistant: Log file was not an array, starting new log for the day.",
							);
							logsArray = [];
						}
					}
				} catch (parseError) {
					console.error(
						"AI Assistant: Failed to parse existing log file, starting new log for the day.",
						parseError,
					);
					logsArray = [];
				}
			}

			const outputEntry =
				output_data instanceof Error
					? {
						error: true,
						message: output_data.message,
						stack: output_data.stack,
					}
					: output_data;

			const logEntryObject = {
				timestamp: now.toISOString(),
				requestType: request_type,
				input: input_data,
				output: outputEntry,
			};

			logsArray.push(logEntryObject);

			await this.app.vault.adapter.write(
				logFilePath,
				JSON.stringify(logsArray, null, 2), // Pretty print JSON
			);
		} catch (error) {
			console.error("AI Assistant: Failed to write to log file", error);
			// Optionally, show a notice to the user if logging fails critically
			// new Notice("Failed to write to AI Assistant log file.");
		}
	};

	display_error = (err: any) => {
		if (err instanceof OpenAI.APIError) {
			new Notice(
				`## OpenAI/LLM API Error:
Status: ${err.status}
Type: ${err.type}
Message: ${err.message}
Code: ${err.code}
Param: ${err.param}`,
				10000,
			);
		} else {
			new Notice(`## AI Assistant Error:
${err.message || String(err)}`, 10000);
		}
		console.error("AI Assistant Error:", err);
	};

	text_api_call = async (
		prompt_list: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
		htmlEl?: HTMLElement,
		view?: MarkdownView,
	): Promise<string | undefined> => {
		const streamMode = htmlEl !== undefined;
		const has_img = prompt_list.some((el) => Array.isArray(el.content));
		let modelToUse = this.modelName;

		// This logic for switching models based on image capability might need
		// to be updated if LLM_MODELS keys don't align with OAI_IMAGE_CAPABLE_MODELS.
		if (has_img && !OAI_IMAGE_CAPABLE_MODELS.includes(modelToUse)) {
			new Notice(
				`Model ${modelToUse} does not support images. Switching to ${DEFAULT_OAI_IMAGE_MODEL}.`,
				5000,
			);
			modelToUse = DEFAULT_OAI_IMAGE_MODEL;
		}

		const requestPayload = {
			messages: prompt_list,
			model: modelToUse,
			max_tokens: this.maxTokens,
			stream: streamMode,
		};

		try {
			const response =
				await this.openRouterApiFun.chat.completions.create(
					requestPayload as any, // Cast to any if type issues with stream
				);

			if (streamMode && htmlEl) {
				let responseText = "";
				// @ts-ignore
				for await (const chunk of response) {
					const content = chunk.choices[0]?.delta?.content;
					if (content) {
						responseText = responseText.concat(content);
						htmlEl.innerHTML = ""; // Clear previous content
						if (view) {
							await MarkdownRenderer.renderMarkdown(
								responseText,
								htmlEl,
								// @ts-ignore (this.app.vault.getRoot().path appears to be valid in practice for component path)
								this.app.vault.getRoot().path,
								view,
							);
						} else {
							// Fallback if no view context, just set innerHTML (less ideal for complex markdown)
							htmlEl.innerHTML = responseText.replace(/\n/g, "<br>");
						}
					}
				}
				await this.log_request("text_stream", requestPayload, responseText);
				return responseText;
			} else {
				// @ts-ignore
				const result = response.choices[0]?.message?.content;
				await this.log_request("text_nostream", requestPayload, result);
				// Convert null to undefined to match the return type Promise<string | undefined>
				return result ?? undefined;
			}
		} catch (err) {
			this.display_error(err);
			await this.log_request("text_error", requestPayload, err);
			return undefined;
		}
	};

	img_api_call = async (
		model: string,
		prompt: string,
		img_size: string,
		num_img: number,
		is_hd: boolean,
	): Promise<string[] | undefined> => {
		const inputData = { model, prompt, img_size, num_img, is_hd };
		try {
			const requestBody: any = {
				model: model,
				prompt: prompt,
				n: num_img,
				size: img_size,
			};
			if (model === "dall-e-3" && is_hd) {
				requestBody.quality = "hd";
			}

			const response = await requestUrl({
				url: "https://api.openai.com/v1/images/generations",
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.openAIapiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestBody),
				throw: false, // Do not throw on HTTP errors, handle them manually
			});

			if (response.status === 200 && response.json && response.json.data) {
				const urls = response.json.data.map((x: any) => x.url);
				await this.log_request("image", inputData, urls);
				return urls;
			} else {
				const errorBody = response.text || JSON.stringify(response.json);
				const error = new Error(
					`DALL-E API Error: Status ${response.status}, Body: ${errorBody}`,
				);
				this.display_error(error);
				await this.log_request("image_error", inputData, error);
				return undefined;
			}
		} catch (err: any) {
			// Catch any other errors (network, etc.)
			const error = err instanceof Error ? err : new Error(String(err));
			this.display_error(error);
			await this.log_request("image_error", inputData, error);
			return undefined;
		}
	};

	whisper_api_call = async (
		audioFile: File,
		language?: string,
	): Promise<string | undefined> => {
		const inputData = {
			filename: audioFile.name,
			language,
			filetype: audioFile.type,
		};
		try {
			const formData = new FormData();
			formData.append("file", audioFile);
			formData.append("model", DEFAULT_WHISPER_MODEL);
			if (language) {
				formData.append("language", language);
			}

			const boundary = `----WebKitFormBoundary${Math.random().toString(16).substring(2)}`;
			const metadata = `--${boundary}\r
Content-Disposition: form-data; name="model"\r
\r
${DEFAULT_WHISPER_MODEL}\r
`;
			const fileHeader = `--${boundary}\r
Content-Disposition: form-data; name="file"; filename="${audioFile.name}"\r
Content-Type: ${audioFile.type}\r
\r
`;
			const languagePart = language
				? `--${boundary}\r
Content-Disposition: form-data; name="language"\r
\r
${language}\r
`
				: "";
			const footer = `\r
--${boundary}--`;

			const fileBuffer = await audioFile.arrayBuffer();
			const encoder = new TextEncoder();
			const metadataBytes = encoder.encode(metadata);
			const fileHeaderBytes = encoder.encode(fileHeader);
			const languageBytes = encoder.encode(languagePart);
			const footerBytes = encoder.encode(footer);

			const totalLength =
				metadataBytes.length +
				fileHeaderBytes.length +
				fileBuffer.byteLength +
				languageBytes.length +
				footerBytes.length;
			const bodyBuffer = new Uint8Array(totalLength);
			let offset = 0;
			bodyBuffer.set(metadataBytes, offset);
			offset += metadataBytes.length;
			bodyBuffer.set(fileHeaderBytes, offset);
			offset += fileHeaderBytes.length;
			bodyBuffer.set(new Uint8Array(fileBuffer), offset);
			offset += fileBuffer.byteLength;
			bodyBuffer.set(languageBytes, offset);
			offset += languageBytes.length;
			bodyBuffer.set(footerBytes, offset);
			offset += footerBytes.length;

			const response = await requestUrl({
				url: "https://api.openai.com/v1/audio/transcriptions",
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.openAIapiKey}`,
					"Content-Type": `multipart/form-data; boundary=${boundary}`,
				},
				body: bodyBuffer.buffer,
				throw: false,
			});

			if (response.status === 200 && response.json && response.json.text) {
				const transcriptionText = response.json.text;
				await this.log_request("whisper", inputData, transcriptionText);
				return transcriptionText;
			} else {
				const errorBody = response.text || JSON.stringify(response.json);
				const error = new Error(
					`Whisper API Error: Status ${response.status}, Body: ${errorBody}`,
				);
				this.display_error(error);
				await this.log_request("whisper_error", inputData, error);
				return undefined;
			}
		} catch (err: any) {
			const error = err instanceof Error ? err : new Error(String(err));
			this.display_error(error);
			await this.log_request("whisper_error", inputData, error);
			return undefined;
		}
	};

	text_to_speech_call = async (
		input_text: string,
	): Promise<void> => {
		const inputData = { input_text, model: "tts-1", voice: "alloy" };
		try {
			const mp3 = await this.openaiApiFun.audio.speech.create({
				model: "tts-1",
				voice: "alloy",
				input: input_text,
			});

			const blob = new Blob([await mp3.arrayBuffer()], {
				type: "audio/mp3",
			});
			const url = URL.createObjectURL(blob);
			const audio = new Audio(url);

			await new Promise<void>((resolve, reject) => {
				audio.onended = () => {
					URL.revokeObjectURL(url);
					resolve();
				};
				audio.onerror = (e) => {
					URL.revokeObjectURL(url);
					console.error("Audio playback error:", e);
					reject(new Error("Audio playback failed"));
				};
				audio.play().catch(err => {
					URL.revokeObjectURL(url);
					reject(err);
				});
			});

			await this.log_request("tts", inputData, "Successfully played audio.");
		} catch (err) {
			this.display_error(err);
			await this.log_request("tts_error", inputData, err);
		}
	};
}
