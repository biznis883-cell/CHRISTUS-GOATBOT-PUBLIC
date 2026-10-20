
module.exports = {
	config: {
		name: "delnick",
		aliases: ["dnick"],
		version: "1.1.0",
		author: "Bassit",
		countDown: 5,
		role: 1,
		description: "Remove nicknames from all group members",
		category: "box chat",
		usePrefix: true
	},

	onStart: async function ({ api, event }) {
		const threadID = event.threadID;

		try {
			const threadInfo = await api.getThreadInfo(threadID);
			const members = threadInfo.userInfo || [];

			if (members.length === 0) {
				return api.sendMessage(
					"⚠️ No group members were found.",
					threadID
				);
			}

			let success = 0;
			let failed = 0;

			for (const member of members) {
				if (!member.id) {
					failed++;
					continue;
				}

				try {
					await api.changeNickname(
						"",
						threadID,
						member.id
					);

					success++;
				} catch (error) {
					failed++;
				}

				await new Promise(resolve =>
					setTimeout(resolve, 500)
				);
			}

			return api.sendMessage(
				`🛡️ Nickname Removal Complete!\n\n` +
				`💗 Successfully cleared: ${success}\n` +
				`⚠️ Failed: ${failed}\n\n` +
				`👑 Bassit Bot`,
				threadID
			);
		} catch (error) {
			console.error("[DELNICK ERROR]", error);

			return api.sendMessage(
				"⚠️ An error occurred while removing nicknames.",
				threadID
			);
		}
	}
};
