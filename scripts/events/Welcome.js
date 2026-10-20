
module.exports = {
	config: {
		name: "welcome",
		eventType: ["log:subscribe"],
		version: "1.1.0",
		author: "Bassit",
		description: "Send video when the bot joins a group"
	},

	onStart: async function ({ event, api }) {
		try {
			const botID = String(api.getCurrentUserID());
			const addedParticipants =
				event.logMessageData?.addedParticipants || [];

			const botJoined = addedParticipants.some(
				member => String(member.userFbId) === botID
			);

			if (!botJoined) return;

			await api.sendMessage(
				{
					attachment: await global.utils.getStreamFromURL(
						"https://imgg.fr/r/pa3RBa8w.mp4"
					)
				},
				event.threadID
			);
		} catch (error) {
			console.error("[WELCOME VIDEO ERROR]", error);
		}
	}
};
