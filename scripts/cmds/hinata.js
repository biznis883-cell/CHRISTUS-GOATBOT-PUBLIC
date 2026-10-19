const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const COMMANDS_DIR = __dirname;
const BACKUP_DIR = path.join(__dirname, ".ai-backups");
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

module.exports = {
  config: {
    name: "hinata",
    aliases: ["ai", "aiagent"],
    version: "2.0.0",
    author: "Bassit",
    countDown: 5,
    role: 2,
    description: "Create new GoatBot V2 commands with AI",
    category: "owner",
    guide: "{pn} <describe the command you want>"
  },

  onStart: async function ({ message, args, event }) {
    const senderID = String(event.senderID || event.userID || "");
    const admins = (
      global.GoatBot?.config?.adminBot || []
    ).map(String);

    // Restrict use to configured bot admins.
    if (!admins.includes(senderID)) {
      return message.reply(
        "⛔ هذا الأمر خاص بمسؤولي البوت فقط."
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return message.reply(
        "❌ مفتاح الذكاء الاصطناعي غير مضبوط.\n" +
        "أضف OPENROUTER_API_KEY في Variables داخل Railway."
      );
    }

    const request = args.join(" ").trim();

    if (!request) {
      return message.reply(
        "🤖 Hinata AI Agent\n\n" +
        "أمثلة:\n" +
        "hinata أنشئ أمر ping يرد Pong\n" +
        "hinata أنشئ أمر hello يرحب بالعضو\n\n" +
        "ملاحظة: هذه النسخة تنشئ أوامر جديدة فقط."
      );
    }

    if (typeof fetch !== "function") {
      return message.reply(
        "❌ إصدار Node.js لا يدعم fetch. استعمل Node.js 20 أو أحدث."
      );
    }

    const prompt = `
You are Hinata, a JavaScript command generator for GoatBot V2.

User request:
${request}

Return only one complete CommonJS JavaScript command module.
Do not use Markdown fences.

Requirements:
- Use module.exports with config and onStart.
- Use the GoatBot V2 command API.
- The command config must contain a valid name.
- Keep code simple and safe.
- Never use eval, child_process, shell commands, or dynamic code execution.
- Never access credentials, login sessions, or environment variables.
- Never create or modify other files.
- Do not include code that sends spam or repeats messages indefinitely.
- Generate a new command, not a modification of an existing command.
`;

    let tempFile = null;

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model:
            process.env.OPENROUTER_MODEL ||
            "openai/gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "Generate safe GoatBot V2 command modules. Return JavaScript only."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.2
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error?.message ||
          `AI API returned HTTP ${response.status}`
        );
      }

      let code = data.choices?.[0]?.message?.content;

      if (typeof code !== "string" || !code.trim()) {
        throw new Error("لم يرجع الذكاء الاصطناعي أي كود.");
      }

      code = code
        .trim()
        .replace(/^```(?:javascript|js)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();

      // Identify the command name.
      const match = code.match(
        /config\s*:\s*\{[\s\S]*?\bname\s*:\s*["']([a-z0-9_-]+)["']/i
      );

      if (!match) {
        throw new Error(
          "ما قدرتش نحدد اسم الأمر من الكود الذي تم إنشاؤه."
        );
      }

      const name = match[1].toLowerCase();

      if (
        !/^[a-z0-9_-]{1,40}$/.test(name) ||
        ["hinata", "ai", "aiagent"].includes(name)
      ) {
        throw new Error("اسم الأمر غير صالح أو محجوز.");
      }

      const destination = path.resolve(
        COMMANDS_DIR,
        `${name}.js`
      );

      if (path.dirname(destination) !== path.resolve(COMMANDS_DIR)) {
        throw new Error("مسار الملف غير مسموح.");
      }

      if (await fs.pathExists(destination)) {
        return message.reply(
          `⚠️ الأمر ${name}.js موجود من قبل.\n` +
          "لم يتم تغيير أي ملف."
        );
      }

      await fs.ensureDir(BACKUP_DIR);

      tempFile = path.join(
        os.tmpdir(),
        `hinata-${Date.now()}-${process.pid}.js`
      );

      await fs.writeFile(tempFile, code + "\n", "utf8");

      // Syntax check only; this does not prove code is safe.
      await execFileAsync(process.execPath, ["--check", tempFile]);

      // Do not overwrite an existing command.
      await fs.writeFile(destination, code + "\n", {
        encoding: "utf8",
        flag: "wx"
      });

      return message.reply(
        `✅ Hinata أنشأ الملف: ${name}.js\n\n` +
        `📁 المسار: scripts/cmds/${name}.js\n` +
        "🔎 فحص صياغة JavaScript نجح.\n\n" +
        "⚠️ فحص الصياغة لا يضمن أن الكود آمن أو يعمل بشكل صحيح. " +
        "راجع الأمر قبل استعماله. قد تحتاج إلى إعادة تشغيل البوت لتحميله."
      );
    } catch (error) {
      console.error("[Hinata AI Agent]", error);

      let details = error.message || "خطأ غير معروف";

      if (error.name === "SyntaxError") {
        details = "الكود الذي تم إنشاؤه فيه خطأ في الصياغة.";
      }

      return message.reply(
        `❌ Hinata ما قدرش ينشئ الأمر.\nالسبب: ${details}`
      );
    } finally {
      if (tempFile) {
        await fs.remove(tempFile).catch(() => {});
      }
    }
  }
};
