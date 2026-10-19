module.exports = {
  config: {
    name: "name",
    aliases: ["groupname"],
    version: "1.0.0",
    author: "Bassit",
    countDown: 5,
    role: 1,
    description: "Change the group name",
    category: "box chat",
    guide: {
      en: "{pn} <new group name>"
    }
  },

  onStart: async function ({ api, event, args, message }) {
    const threadID = event.threadID;
    const newName = args.join(" ").trim();

    if (!newName) {
      return message.reply(
        "🐤 Please provide a new group name.\n\n" +
        "😗 Example: name Bassit Family 🦔"
      );
    }

    try {
      await api.setTitle(newName, threadID);

      return message.reply(
        "😝 Group name changed successfully!\n" +
        `🐤 New name: ${newName}`
      );
    } catch (error) {
      console.error("[name command]", error);

      return message.reply(
        "🦔 Failed to change the group name. Please check the bot's permissions and try again."
      );
    }
  }
};
