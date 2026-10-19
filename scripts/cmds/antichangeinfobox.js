const { getStreamFromURL, uploadImgbb } = global.utils;

module.exports = {
  config: {
    name: "antichangeinfobox",
    version: "2.1.0",
    author: "NTKhang",
    countDown: 5,
    role: 1,
    description: {
      en: "Silent protection for group information"
    },
    category: "box chat",
    guide: {
      en:
        "{pn} avt on/off\n" +
        "{pn} name on/off\n" +
        "{pn} nickname on/off\n" +
        "{pn} theme on/off\n" +
        "{pn} emoji on/off"
    }
  },

  onStart: async function ({ event, args, threadsData }) {
    const { threadID } = event;
    const type = String(args[0] || "").toLowerCase();
    const state = String(args[1] || "").toLowerCase();

    if (!["on", "off"].includes(state)) return;

    const data = await threadsData.get(
      threadID,
      "data.antiChangeInfoBox",
      {}
    );

    const enabled = state === "on";

    const save = async (key, value) => {
      if (enabled) data[key] = value;
      else delete data[key];

      await threadsData.set(
        threadID,
        data,
        "data.antiChangeInfoBox"
      );
    };

    switch (type) {
      case "avt":
      case "avatar":
      case "image": {
        if (!enabled) return save("avatar");

        const { imageSrc } = await threadsData.get(threadID);
        if (!imageSrc) return;

        const uploaded = await uploadImgbb(imageSrc);
        return save("avatar", uploaded.image.url);
      }

      case "name": {
        if (!enabled) return save("name");

        const { threadName } = await threadsData.get(threadID);
        return save("name", threadName);
      }

      case "nickname": {
        if (!enabled) return save("nickname");

        const { members = [] } = await threadsData.get(threadID);
        const nicknames = {};

        for (const member of members) {
          nicknames[member.userID] = member.nickname || "";
        }

        return save("nickname", nicknames);
      }

      case "theme": {
        if (!enabled) return save("theme");

        const { threadThemeID } = await threadsData.get(threadID);
        return save("theme", threadThemeID);
      }

      case "emoji": {
        if (!enabled) return save("emoji");

        const { emoji } = await threadsData.get(threadID);
        return save("emoji", emoji);
      }

      default:
        return;
    }
  },

  onEvent: async function ({ event, threadsData, role, api }) {
    const { threadID, logMessageType, logMessageData, author } = event;

    const botID = String(api.getCurrentUserID());
    if (String(author || "") === botID) return;

    const data = await threadsData.get(
      threadID,
      "data.antiChangeInfoBox",
      {}
    );

    const isAdmin = role >= 1;

    try {
      switch (logMessageType) {
        case "log:thread-image": {
          if (!Object.prototype.hasOwnProperty.call(data, "avatar")) return;

          if (!isAdmin) {
            if (data.avatar && data.avatar !== "REMOVE") {
              await api.changeGroupImage(
                await getStreamFromURL(data.avatar),
                threadID
              );
            }
            return;
          }

          const imageURL = logMessageData?.url;
          if (!imageURL) {
            await threadsData.set(
              threadID,
              "REMOVE",
              "data.antiChangeInfoBox.avatar"
            );
            return;
          }

          const uploaded = await uploadImgbb(imageURL);
          await threadsData.set(
            threadID,
            uploaded.image.url,
            "data.antiChangeInfoBox.avatar"
          );
          return;
        }

        case "log:thread-name": {
          if (!Object.prototype.hasOwnProperty.call(data, "name")) return;

          if (!isAdmin) {
            await api.setTitle(data.name, threadID);
            return;
          }

          if (logMessageData?.name) {
            await threadsData.set(
              threadID,
              logMessageData.name,
              "data.antiChangeInfoBox.name"
            );
          }
          return;
        }

        case "log:user-nickname": {
          if (!Object.prototype.hasOwnProperty.call(data, "nickname")) return;

          const { nickname, participant_id } = logMessageData || {};
          if (!participant_id) return;

          if (!isAdmin) {
            await api.changeNickname(
              data.nickname[participant_id] || "",
              threadID,
              participant_id
            );
            return;
          }

          await threadsData.set(
            threadID,
            nickname || "",
            `data.antiChangeInfoBox.nickname.${participant_id}`
          );
          return;
        }

        case "log:thread-color": {
          if (!Object.prototype.hasOwnProperty.call(data, "theme")) return;

          if (!isAdmin) {
            await api.changeThreadColor(
              data.theme || "196241301102133",
              threadID
            );
            return;
          }

          if (logMessageData?.theme_id) {
            await threadsData.set(
              threadID,
              logMessageData.theme_id,
              "data.antiChangeInfoBox.theme"
            );
          }
          return;
        }

        case "log:thread-icon": {
          if (!Object.prototype.hasOwnProperty.call(data, "emoji")) return;

          if (!isAdmin) {
            await api.changeThreadEmoji(data.emoji, threadID);
            return;
          }

          await threadsData.set(
            threadID,
            logMessageData?.thread_icon || "",
            "data.antiChangeInfoBox.emoji"
          );
          return;
        }

        default:
          return;
      }
    } catch (error) {
      console.error("[antichangeinfobox]", error);
    }
  }
};
