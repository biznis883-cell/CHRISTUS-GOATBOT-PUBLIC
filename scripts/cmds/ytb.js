
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { pipeline } = require("stream/promises");
const { Transform } = require("stream");

const CACHE_DIR = path.join(__dirname, "cache");
const MAX_FILE_SIZE = 25 * 1024 * 1024;

async function getBaseApiUrl() {
	const response = await axios.get(
		"https://raw.githubusercontent.com/mahmudx7/HINATA/main/baseApiUrl.json",
		{ timeout: 15000 }
	);

	const base = response.data?.mahmud;

	if (!base) {
		throw new Error("Search API URL is unavailable");
	}

	return base.replace(/\/+$/, "");
}

function getCobaltUrl() {
	const url = process.env.COBALT_API_URL;

	if (!url) {
		throw new Error(
			"COBALT_API_URL is not configured. Set it to an authorized Cobalt API instance."
		);
	}

	return url.replace(/\/+$/, "");
}

function extractVideoID(input) {
	try {
		const url = new URL(
			/^https?:\/\//i.test(input) ? input : `https://${input}`
		);

		if (
			url.hostname === "youtu.be" ||
			url.hostname === "www.youtu.be"
		) {
			return url.pathname.split("/").filter(Boolean)[0] || null;
		}

		if (
			!/(^|\.)youtube\.com$/.test(url.hostname) &&
			!/(^|\.)youtube-nocookie\.com$/.test(url.hostname)
		) {
			return null;
		}

		if (url.searchParams.has("v")) {
			return url.searchParams.get("v");
		}

		const parts = url.pathname.split("/").filter(Boolean);

		if (["shorts", "embed", "live", "v"].includes(parts[0])) {
			return parts[1] || null;
		}

		return null;
	} catch {
		return null;
	}
}

function isValidVideoID(id) {
	return typeof id === "string" && /^[\w-]{11}$/.test(id);
}

function reaction(api, emoji, messageID) {
	try {
		api.setMessageReaction(emoji, messageID, () => {}, true);
	} catch {}
}

function send(api, body, threadID, messageID) {
	return new Promise(resolve => {
		api.sendMessage(body, threadID, (err, info) => {
			resolve({ err, info });
		}, messageID);
	});
}

async function downloadFromCobalt(videoID, type, title) {
	const cobaltUrl = getCobaltUrl();

	const videoUrl = `https://www.youtube.com/watch?v=${videoID}`;

	const payload = {
		url: videoUrl,
		downloadMode: type === "audio" ? "audio" : "auto",
		audioFormat: "mp3",
		filenameStyle: "pretty",
		...(type === "video"
			? {
				videoQuality: "720",
				youtubeVideoCodec: "h264"
			}
			: {})
	};

	const response = await axios.post(cobaltUrl, payload, {
		timeout: 30000,
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json"
		},
		maxContentLength: 1024 * 1024,
		maxBodyLength: 1024 * 1024
	});

	const data = response.data;

	if (
		!data ||
		!["tunnel", "redirect"].includes(data.status) ||
		typeof data.url !== "string"
	) {
		throw new Error(
			data?.error?.code || data?.text || "Cobalt could not process this video"
		);
	}

	const downloadURL = new URL(data.url);

	if (!["https:", "http:"].includes(downloadURL.protocol)) {
		throw new Error("Invalid download URL");
	}

	await fs.ensureDir(CACHE_DIR);

	const ext = type === "audio" ? "mp3" : "mp4";
	const filePath = path.join(
		CACHE_DIR,
		`yt_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
	);

	try {
		const fileResponse = await axios.get(downloadURL.href, {
			responseType: "stream",
			timeout: 30000,
			maxRedirects: 5,
			validateStatus: status => status >= 200 && status < 300
		});

		const contentLength = Number(
			fileResponse.headers["content-length"] || 0
		);

		if (contentLength > MAX_FILE_SIZE) {
			fileResponse.data.destroy();
			throw new Error("File exceeds the 25 MB bot attachment limit");
		}

		let received = 0;

		const sizeGuard = new Transform({
			transform(chunk, encoding, callback) {
				received += chunk.length;

				if (received > MAX_FILE_SIZE) {
					return callback(
						new Error("File exceeds the 25 MB bot attachment limit")
					);
				}

				callback(null, chunk);
			}
		});

		await pipeline(
			fileResponse.data,
			sizeGuard,
			fs.createWriteStream(filePath)
		);

		if (!(await fs.pathExists(filePath)) || (await fs.stat(filePath)).size === 0) {
			throw new Error("Downloaded file is empty");
		}

		return { filePath, title, ext };
	} catch (error) {
		await fs.remove(filePath).catch(() => {});
		throw error;
	}
}

async function sendDownloadedFile(api, threadID, messageID, result) {
	try {
		const stream = fs.createReadStream(result.filePath);

		const sent = await send(
			api,
			{
				body: `👑 ${result.title}`,
				attachment: stream
			},
			threadID,
			messageID
		);

		if (sent.err) {
			throw sent.err;
		}

		reaction(api, "✅", messageID);
	} finally {
		await fs.remove(result.filePath).catch(() => {});
	}
}

async function handleDownload(
	api,
	threadID,
	messageID,
	videoID,
	type,
	getLang
) {
	let result;

	try {
		await send(
			api,
			`⬇️ Preparing your ${type} download...`,
			threadID,
			messageID
		);

		result = await downloadFromCobalt(
			videoID,
			type,
			`YouTube ${type}`
		);

		await sendDownloadedFile(
			api,
			threadID,
			messageID,
			result
		);
	} catch (error) {
		console.error("[YTB DOWNLOAD]", error.message);

		await send(
			api,
			`⚠️ Download failed: ${error.message}`,
			threadID,
			messageID
		);
	}
}

async function fetchInfo(api, threadID, messageID, videoID, apiUrl) {
	try {
		const response = await axios.get(
			`${apiUrl}/api/ytb/details`,
			{
				params: { id: videoID },
				timeout: 20000
			}
		);

		const d = response.data?.details;

		if (!d) {
			throw new Error("Video information is unavailable");
		}

		const number = value =>
			Number(value || 0).toLocaleString("en-US");

		const text =
			`💗 Title: ${d.title || "Unknown"}\n` +
			`👑 Channel: ${d.channel || "Unknown"}\n` +
			`⏱️ Duration: ${d.duration_raw || d.duration || "Unknown"}\n` +
			`👀 Views: ${number(d.view_count)}\n` +
			`👍 Likes: ${number(d.like_count)}\n` +
			`🆔 ID: ${videoID}\n` +
			`🔗 Link: ${d.webpage_url || `https://youtu.be/${videoID}`}`;

		await send(api, text, threadID, messageID);
		reaction(api, "✅", messageID);
	} catch (error) {
		console.error("[YTB INFO]", error.message);

		await send(
			api,
			"⚠️ Unable to retrieve video information.",
			threadID,
			messageID
		);
	}
}

module.exports = {
	config: {
		name: "ytb",
		aliases: ["youtube", "yt"],
		version: "3.0.0",
		author: "Bassit",
		countDown: 10,
		role: 0,
		description: {
			en: "Search YouTube, download audio or video, and view information"
		},
		category: "media",
		guide: {
			en:
				"{pn} -v <video name or URL>\n" +
				"{pn} -a <video name or URL>\n" +
				"{pn} -i <video name or URL>"
		}
	},

	onStart: async function ({
		api,
		args,
		message,
		event,
		commandName
	}) {
		const { threadID, messageID, senderID } = event;

		const options = {
			"-v": "video",
			"video": "video",
			"-a": "audio",
			"-s": "audio",
			"audio": "audio",
			"sing": "audio",
			"-i": "info",
			"info": "info"
		};

		const type = options[(args[0] || "").toLowerCase()];

		if (!type || !args.slice(1).join(" ").trim()) {
			return message.SyntaxError();
		}

		const input = args.slice(1).join(" ").trim();
		const videoID = extractVideoID(input);

		if (videoID) {
			if (!isValidVideoID(videoID)) {
				return send(api, "⚠️ Invalid YouTube video link.", threadID, messageID);
			}

			reaction(api, "⏳", messageID);

			if (type === "info") {
				try {
					const apiUrl = await getBaseApiUrl();
					return fetchInfo(api, threadID, messageID, videoID, apiUrl);
				} catch {
					return send(
						api,
						"⚠️ The video information service is unavailable.",
						threadID,
						messageID
					);
				}
			}

			return handleDownload(
				api,
				threadID,
				messageID,
				videoID,
				type
			);
		}

		try {
			const apiUrl = await getBaseApiUrl();

			const response = await axios.get(
				`${apiUrl}/api/ytb/search`,
				{
					params: { q: input },
					timeout: 20000
				}
			);

			const results = (response.data?.results || [])
				.filter(item => {
					const id = item.id || item.videoId;
					return isValidVideoID(id);
				})
				.slice(0, 6);

			if (!results.length) {
				return send(
					api,
					"⚠️ No YouTube search results were found.",
					threadID,
					messageID
				);
			}

			let text = "🎀 YouTube Search Results\n\n";

			results.forEach((item, index) => {
				const channel = item.channel?.name || item.channel || "Unknown";
				const id = item.id || item.videoId;

				text +=
					`${index + 1}. ${item.title || "Untitled"}\n` +
					`Duration: ${item.time || "Unknown"}\n` +
					`Channel: ${channel}\n` +
					`https://youtu.be/${id}\n\n`;
			});

			text += "Reply with a number to select a video.";

			const sent = await send(api, text, threadID, messageID);

			if (sent.err || !sent.info?.messageID) {
				return;
			}

			global.GoatBot.onReply.set(sent.info.messageID, {
				commandName,
				author: senderID,
				results,
				type,
				apiUrl
			});
		} catch (error) {
			console.error("[YTB SEARCH]", error.message);

			return send(
				api,
				"⚠️ YouTube search failed. Please try again later.",
				threadID,
				messageID
			);
		}
	},

	onReply: async function ({ event, api, Reply }) {
		if (String(event.senderID) !== String(Reply.author)) {
			return;
		}

		const choice = Number((event.body || "").trim());

		if (
			!Number.isInteger(choice) ||
			choice < 1 ||
			choice > Reply.results.length
		) {
			return send(
				api,
				"⚠️ Invalid selection. Reply with a number from the list.",
				event.threadID,
				event.messageID
			);
		}

		try {
			await api.unsendMessage(Reply.messageID).catch(() => {});
		} catch {}

		const item = Reply.results[choice - 1];
		const videoID = item.id || item.videoId;

		if (!isValidVideoID(videoID)) {
			return send(
				api,
				"⚠️ Invalid video ID.",
				event.threadID,
				event.messageID
			);
		}

		reaction(api, "⏳", event.messageID);

		if (Reply.type === "info") {
			return fetchInfo(
				api,
				event.threadID,
				event.messageID,
				videoID,
				Reply.apiUrl
			);
		}

		return handleDownload(
			api,
			event.threadID,
			event.messageID,
			videoID,
			Reply.type
		);
	}
};
