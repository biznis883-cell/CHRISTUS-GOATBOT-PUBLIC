
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { pipeline } = require("stream/promises");

const CACHE_DIR = path.join(__dirname, "cache");
const MAX_SIZE = 25 * 1024 * 1024;

async function getBaseApiUrl() {
	const response = await axios.get(
		"https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json",
		{ timeout: 15000 }
	);

	const base = response.data?.mahmud;

	if (typeof base !== "string" || !/^https?:\/\//i.test(base)) {
		throw new Error("Invalid music API configuration");
	}

	return base.replace(/\/+$/, "");
}

function setReaction(api, emoji, messageID) {
	try {
		api.setMessageReaction(emoji, messageID, () => {}, true);
	} catch {}
}

module.exports = {
	config: {
		name: "sing",
		aliases: ["song", "music"],
		version: "2.0.0",
		author: "Bassit",
		countDown: 10,
		role: 0,
		description: {
			en: "Search and download a song as an audio file"
		},
		category: "music",
		guide: {
			en: "{pn} <song name>"
		}
	},

	langs: {
		en: {
			noInput:
				"⚠️ Please provide a song name.\nExample: sing Shape of You",
			success:
				"🎵 Your song is ready!\n💗 Title: %1\n👑 Bassit Bot",
			error:
				"⚠️ Unable to download the song: %1"
		}
	},

	onStart: async function ({ api, event, args, message, getLang }) {
		const query = args.join(" ").trim();

		if (!query) {
			return message.reply(getLang("noInput"));
		}

		setReaction(api, "⏳", event.messageID);

		let filePath;

		try {
			await fs.ensureDir(CACHE_DIR);

			const baseUrl = await getBaseApiUrl();
			const apiUrl = `${baseUrl}/api/song/mahmud`;

			// Request the song from the configured API.
			const response = await axios.get(apiUrl, {
				params: { query },
				responseType: "stream",
				timeout: 60000,
				maxRedirects: 5,
				validateStatus: status => status >= 200 && status < 300
			});

			const contentType = String(
				response.headers["content-type"] || ""
			).toLowerCase();

			if (
				contentType.includes("application/json") ||
				contentType.includes("text/html")
			) {
				response.data.destroy();
				throw new Error("The API did not return an audio file");
			}

			const contentLength = Number(
				response.headers["content-length"] || 0
			);

			if (contentLength > MAX_SIZE) {
				response.data.destroy();
				throw new Error("Audio file exceeds the 25 MB limit");
			}

			filePath = path.join(
				CACHE_DIR,
				`sing_${Date.now()}_${Math.random()
					.toString(36)
					.slice(2)}.mp3`
			);

			let received = 0;

			const { Transform } = require("stream");

			const sizeGuard = new Transform({
				transform(chunk, encoding, callback) {
					received += chunk.length;

					if (received > MAX_SIZE) {
						return callback(
							new Error("Audio file exceeds the 25 MB limit")
						);
					}

					callback(null, chunk);
				}
			});

			await pipeline(
				response.data,
				sizeGuard,
				fs.createWriteStream(filePath)
			);

			const stat = await fs.stat(filePath);

			if (!stat.size) {
				throw new Error("The downloaded audio file is empty");
			}

			const result = await new Promise(resolve => {
				api.sendMessage(
					{
						body: getLang("success", query),
						attachment: fs.createReadStream(filePath)
					},
					event.threadID,
					err => resolve(err || null),
					event.messageID
				);
			});

			if (result) {
				throw result;
			}

			setReaction(api, "✅", event.messageID);
		} catch (error) {
			console.error("[SING ERROR]", error.message);

			setReaction(api, "⚠️", event.messageID);

			await message.reply(
				getLang("error", error.message || "Unknown error")
			);
		} finally {
			if (filePath) {
				await fs.remove(filePath).catch(() => {});
			}
		}
	}
};
