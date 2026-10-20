"use strict";

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "groupNameProtect.json");
const PREFIX_EMOJI = "🇮🇳";

function readData() {
	try {
		if (!fs.existsSync(DATA_FILE)) return {};
		return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
	} catch {
		return {};
	}
}

function saveData(data) {
	if (!fs.existsSync(DATA_DIR))
		fs.mkdirSync(DATA_DIR, { recursive: true });

	fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getText(event) {
	const reply = event.messageReply;
	return reply && typeof reply.body === "string"
		? reply.body.trim()
		: "";
}

module.exports = {
	config: {
		name: "kilwa",
		version: "1.0.0",
		author: "Bassit",
		countDown: 3,
		role: 0,
		description: "Set and protect the group name using 🇮🇳",
		category: "group",
	},

	onStart: async function ({ event, api, message }) {
		if (!event.isGroup) {
			return message.reply("This command only works in groups.");
		}

		const name = getText(event);

		if (!name) {
			return message.reply("Reply to a message containing the new group name with 🇮🇳.");
		}

		try {
			await api.setTitle(name, event.threadID);

			const data = readData();
			data[event.threadID] = {
				name,
				ownerID: String(event.senderID)
			};
			saveData(data);

			return message.reply("Group name updated and protection enabled.");
		} catch (error) {
			return message.reply("Could not change the group name: " + error.message);
		}
	},

	onReaction: async function ({ event, api }) {
		if (event.reaction !== PREFIX_EMOJI) return;
		if (!event.isGroup || !event.messageReply) return;

		const name = getText(event);
		if (!name) return;

		try {
			await api.setTitle(name, event.threadID);

			const data = readData();
			data[event.threadID] = {
				name,
				ownerID: String(event.userID || event.senderID)
			};
			saveData(data);
		} catch (error) {
			console.error("[name] Reaction error:", error.message);
		}
	}
};
