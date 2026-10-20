const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const baseApiUrl = async () => {
	const response = await axios.get(
		"https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json",
		{ timeout: 15000 }
	);

	const url = response.data?.mahmud;

	if (!url || typeof url !== "string") {
		throw new Error("Pinterest API URL is unavailable.");
	}

	return url.replace(/\/+$/, "");
};

module.exports = {
	config: {
		name: "pin",
		aliases: ["pinterest", "pic"],
		version: "2.0",
		author: "Bassit",
		countDown: 10,
		role: 0,
		description: {
			en: "Search and download images from Pinterest"
		},
		category: "image",
		guide: {
			en: "{pn} <query> - <amount>\nExample: {pn} goku - 10"
		}
	},

	langs: {
		en: {
			noInput: "Please enter a search query.\nExample: {pn} goku - 10",
			noData: "No images were found for your query.",
			success: "Here are %2 images for \"%1\":",
			error: "An error occurred: %1",
			invalidAmount: "Please enter a valid amount between 1 and 20.",
			tooLarge: "The downloaded images exceed the allowed size.",
			downloadFailed: "Some images could not be downloaded. Please try again."
		}
	},

	onStart: async function ({ api, event, args, message, getLang }) {
		const cacheDir = path.join(__dirname, "cache");
		const tempFiles = [];
		const streams = [];

		const react = (emoji) => {
			try {
				api.setMessageReaction(
					emoji,
					event.messageID,
					() => {},
					true
				);
			} catch (_) {}
		};

		try {
			const input = args.join(" ").trim();

			if (!input) {
				return message.reply(getLang("noInput"));
			}

			const match = input.match(/^(.*?)\s*-\s*(\d+)\s*$/);
			const query = match ? match[1].trim() : input;
			const amount = match ? Number(match[2]) : 6;

			if (!query) {
				return message.reply(getLang("noInput"));
			}

			if (!Number.isInteger(amount) || amount < 1 || amount > 20) {
				return message.reply(getLang("invalidAmount"));
			}

			react("⏳");
			await fs.ensureDir(cacheDir);

			const apiUrl = await baseApiUrl();
			const response = await axios.get(
				`${apiUrl}/api/pin/mahmud`,
				{
					params: {
						query,
						limit: amount
					},
					timeout: 30000
				}
			);

			const images = response.data?.images;

			if (!Array.isArray(images) || images.length === 0) {
				react("❌");
				return message.reply(getLang("noData"));
			}

			const selectedImages = images
				.filter(url =>
					typeof url === "string" &&
					/^https?:\/\//i.test(url)
				)
				.slice(0, amount);

			if (selectedImages.length === 0) {
				react("❌");
				return message.reply(getLang("noData"));
			}

			const attachments = [];
			let totalBytes = 0;
			const maxTotalBytes = 24 * 1024 * 1024;

			for (let i = 0; i < selectedImages.length; i++) {
				let imageResponse;

				try {
					imageResponse = await axios.get(selectedImages[i], {
						responseType: "arraybuffer",
						timeout: 20000,
						maxContentLength: maxTotalBytes,
						maxBodyLength: maxTotalBytes,
						validateStatus: status => status >= 200 && status < 300
					});
				} catch (error) {
					console.error("Pinterest image download failed:", error.message);
					continue;
				}

				const buffer = Buffer.from(imageResponse.data);

				if (!buffer.length) continue;

				totalBytes += buffer.length;

				if (totalBytes > maxTotalBytes) {
					throw new Error(getLang("tooLarge"));
				}

				const contentType = String(
					imageResponse.headers["content-type"] || ""
				).toLowerCase();

				if (
					contentType &&
					!contentType.startsWith("image/") &&
					!contentType.includes("octet-stream")
				) {
					totalBytes -= buffer.length;
					continue;
				}

				let extension = ".jpg";

				if (contentType.includes("png")) extension = ".png";
				else if (contentType.includes("webp")) extension = ".webp";
				else if (contentType.includes("gif")) extension = ".gif";

				const filePath = path.join(
					cacheDir,
					`pin_${Date.now()}_${i}_${Math.random()
						.toString(36)
						.slice(2)}${extension}`
				);

				await fs.outputFile(filePath, buffer);
				tempFiles.push(filePath);
				attachments.push(fs.createReadStream(filePath));
			}

			if (attachments.length === 0) {
				react("❌");
				return message.reply(getLang("downloadFailed"));
			}

			for (const stream of attachments) {
				streams.push(stream);
			}

			await new Promise((resolve, reject) => {
				message.reply(
					{
						body: getLang(
							"success",
							query,
							attachments.length
						),
						attachment: attachments
					},
					(error) => {
						if (error) reject(error);
						else resolve();
					}
				);
			});

			react("✅");
		} catch (error) {
			console.error("Pinterest command error:", error);

			react("❌");

			const errorMessage = error.message === getLang("tooLarge")
				? getLang("tooLarge")
				: getLang("error", error.message || "Unknown error");

			return message.reply(errorMessage);
		} finally {
			for (const stream of streams) {
				try {
					stream.destroy();
				} catch (_) {}
			}

			for (const file of tempFiles) {
				try {
					await fs.remove(file);
				} catch (error) {
					console.error("Failed to remove temporary image:", error.message);
				}
			}
		}
	}
};
