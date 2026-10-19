module.exports = {
  config: {
    name: "nick",
    aliases: ["delnick"],
    version: "1.1.0",
    author: "Bassit",
    countDown: 10,
    role: 1,
    description: "Change or reset group member nicknames",
    category: "box chat",
    guide: {
      en: "{pn} <name> - Set a nickname for all members\n{pn} delnick - Reset member nicknames"
    }
  },

  onStart: async function ({ api, event, args, message, commandName }) {
    const threadID = event.threadID;
    const action = String(commandName || "nick").toLowerCase();

    if (action === "delnick" || args[0]?.toLowerCase() === "delnick") {
      return message.reply(
        "🦔 Sorry! This GoatBot version does not provide a confirmed method to reset every member's nickname."
      );
    }

    const nickname = args.join(" ").trim();

    if (!nickname) {
      return message.reply(
        "🐤 Nickname Manager\n\n" +
        "😗 Usage: nick <name>\n" +
        "😝 Example: nick Bassit\n" +
        "🦔 Usage: delnick"
      );
    }

    if (typeof api.changeNickname !== "function") {
      return message.reply(
        "😗 The changeNickname API is not available in this bot version."
      );
    }

    try {
      const info = await api.getThreadInfo(threadID);
      const members = info.participantIDs || [];

      let success = 0;
      let failed = 0;

      await message.reply(
        `🐤 Starting nickname update for ${members.length} members...`
      );

      for (const userID of members) {
        try {
          await api.changeNickname(nickname, threadID, userID);
          success++;
        } catch (error) {
          failed++;
        }
      }

      return message.reply(
        "😝 Nickname update completed!\n\n" +
        `🐤 Successful: ${success}\n` +
        `🦔 Failed: ${failed}`
      );
    } catch (error) {
      console.error("[nick command]", error);

      return message.reply(
        "😗 Failed to retrieve group information or update nicknames."
      );
    }
  }
};
