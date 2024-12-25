require("./config/global");
require("module-alias/register");
const {
  makeWASocket,
  useMultiFileAuthState,
  makeInMemoryStore,
  makeCacheableSignalKeyStore,
  Browsers,
  proto,
  DisconnectReason,
  isJidGroup,
  isJidStatusBroadcast,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const NodeCache = require("node-cache");
const inquirer = require("inquirer");
let useCode = {
  isTrue: !process.argv.includes("--scan"),
};

const logger = require("@utils/logger");
const sleep = require("@utils/sleep");

async function start() {
  const commands = [];
  await new Promise((resolve) => {
    if (!fs.existsSync(global.commandPath)) {
      fs.mkdirSync(global.commandPath);
    }
    function readdir(dirpath) {
      fs.readdirSync(dirpath).forEach((val) => {
        const fullpath = path.join(dirpath, val);
        if (path.extname(fullpath) === ".js") {
          commands.push(require(fullpath));
        } else if (fs.statSync(fullpath).isDirectory()) {
          readdir(fullpath);
        }
      });
    }
    readdir(path.join(__dirname, global.commandPath));
    resolve(commands);
  });
  const msgRetryCounterCache = new NodeCache();
  const { state, saveCreds } = await useMultiFileAuthState(global.creds);

  const store = makeInMemoryStore({
    logger: pino({}).child({ level: "fatal" }),
  });

  setInterval(() => {
    store.writeToFile(global.store);
    store.readFromFile(global.store);
  }, 5000);

  const zzysock = makeWASocket({
    logger: pino({ level: "fatal" }).child({ level: "fatal" }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(
        state.keys,
        pino({ level: "fatal" }).child({ level: "fatal" })
      ),
    },
    browser: Browsers.ubuntu("Firefox"),
    defaultQueryTimeoutMs: undefined,
    generateHighQualityLinkPreview: true,
    getMessage: async (key) => {
      if (store) {
        const m = await store.loadMessage(key.remoteJid, key.id);
        return m;
      } else return proto.Message.fromObject({});
    },
    markOnlineOnConnect: true,
    msgRetryCounterCache,
    printQRInTerminal: !useCode.isTrue,
    shouldSyncHistoryMessage: () => true,
    syncFullHistory: false,
  });
  store.bind(zzysock.ev);
  if (useCode.isTrue && !zzysock.authState.creds.registered) {
    console.log("\n\n");
    await inquirer
      .prompt([
        {
          type: "confirm",
          name: "confirm",
          message: "Terhubung menggunakan pairing code?",
          default: true,
        },
      ])
      .then(async ({ confirm }) => {
        useCode.isTrue = confirm;
        if (confirm) {
          if (!global.number) {
            global.number = (
              await inquirer.prompt([
                {
                  type: "number",
                  name: "number",
                  message: "Masukkan nomor WhatsApp: +",
                },
              ])
            ).number;
          }
          logger(
            "info",
            `PAIRING CODE`,
            `Requesting pairing code for ${global.number}`
          );
          await sleep(3000);
          let code = await zzysock.requestPairingCode(global.number);
          logger(
            "primary",
            `Pairing Code for +${global.number}:`,
            code.match(/.{1,4}/g)?.join("-") || code
          );
        } else {
          start();
        }
      })
      .catch((err) => {
        console.log(err);
      });
  }
  zzysock.ev.on("creds.update", saveCreds);
  zzysock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "connecting") {
      if (zzysock.user) {
        logger("info", "Reconnecting", zzysock.user.id.split(":")[0]);
      }
    }
    if (connection === "open") {
      zzysock.id = `${zzysock.user.id.split(":")[0]}@s.whatsapp.net`;
      logger("success", "Connected", zzysock.user.id.split(":")[0]);
    }
    if (connection === "close") {
      const { statusCode, message, error } =
        lastDisconnect.error?.output.payload;
      if (
        statusCode === DisconnectReason.badSession ||
        statusCode === DisconnectReason.forbidden ||
        statusCode == 405 ||
        (statusCode === DisconnectReason.loggedOut &&
          message !== "Stream Errored (conflict)")
      ) {
        fs.rmSync(path.join(__dirname, global.creds), {
          force: true,
          recursive: true,
        });
      }
      logger("error", `Koneksi ${error}`, `${statusCode} ${message}`);
      start();
    }
  });
  zzysock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0];
    if (!m.message) return;
    if (
      m.message.reactionMessage ||
      m.message.protocolMessage ||
      isJidStatusBroadcast(m.key.remoteJid)
    )
      return;
    m.id = m.key.remoteJid;
    m.isGroup = isJidGroup(m.id);
    m.userId = m.isGroup ? m.key.participant : m.id;
    m.userName = m.pushName;
    m.itsMe = m.key.fromMe;
    m.isOwner = global.owner.number.includes(m.userId.split("@")[0]);
    m.type = Object.keys(m.message)[0];
    m.isMentioned =
      m.type === "extendedTextMessage"
        ? m.message.extendedTextMessage.contextInfo?.mentionedJid
        : m.type === "imageMessage"
        ? m.message.imageMessage.contextInfo?.mentionedJid
        : m.type === "videoMessage"
        ? m.message.videoMessage.contextInfo?.mentionedJid
        : m.type === "documentMessage"
        ? m.message.documentMessage.contextInfo?.mentionedJid
        : m.type === "audioMessage"
        ? m.message.audioMessage.contextInfo?.mentionedJid
        : m.type === "productMessage"
        ? m.message.productMessage.contextInfo?.mentionedJid
        : m.type === "liveLocationMessage"
        ? m.message.liveLocationMessage.contextInfo?.mentionedJid
        : m.type === "locationMessage"
        ? m.message.locationMessage.contextInfo?.mentionedJid
        : m.type === "contactMessage"
        ? m.message.contactMessage.contextInfo?.mentionedJid
        : null;
    m.isQuoted =
      m.type === "extendedTextMessage"
        ? m.message.extendedTextMessage.contextInfo?.quotedMessage
        : m.type === "imageMessage"
        ? m.message.imageMessage.contextInfo?.quotedMessage
        : m.type === "videoMessage"
        ? m.message.videoMessage.contextInfo?.quotedMessage
        : m.type === "documentMessage"
        ? m.message.documentMessage.contextInfo?.quotedMessage
        : m.type === "audioMessage"
        ? m.message.audioMessage.contextInfo?.quotedMessage
        : m.type === "productMessage"
        ? m.message.productMessage.contextInfo?.quotedMessage
        : m.type === "liveLocationMessage"
        ? m.message.liveLocationMessage.contextInfo?.quotedMessage
        : m.type === "locationMessage"
        ? m.message.locationMessage.contextInfo?.quotedMessage
        : m.type === "contactMessage"
        ? m.message.contactMessage.contextInfo?.quotedMessage
        : null;
    m.quoted = m.isQuoted
      ? m.message.extendedTextMessage?.contextInfo ||
        m.message.imageMessage?.contextInfo ||
        m.message.videoMessage?.contextInfo ||
        m.message.documentMessage?.contextInfo ||
        m.message.audioMessage?.contextInfo ||
        m.message.productMessage?.contextInfo ||
        m.message.liveLocationMessage?.contextInfo ||
        m.message.locationMessage?.contextInfo ||
        m.message.contactMessage?.contextInfo
      : null;
    m.body =
      m.type === "conversation"
        ? m.message.conversation
        : m.type === "extendedTextMessage"
        ? m.message.extendedTextMessage.text
        : m.type === "imageMessage"
        ? m.message.imageMessage.caption
        : m.type === "videoMessage"
        ? m.message.videoMessage.caption
        : m.type === "documentMessage"
        ? m.message.documentMessage.caption
        : m.type === "templateButtonReplyMessage"
        ? m.message.templateButtonReplyMessage.selectedId
        : m.type === "interactiveResponseMessage"
        ? JSON.parse(
            m.message.interactiveResponseMessage.nativeFlowResponseMessage
              .paramsJson
          ).id
        : m.type === "messageContextInfo"
        ? m.message.buttonsResponseMessage?.selectedButtonId ||
          m.message.listResponseMessage?.singleSelectReply.selectedRowId ||
          m.message.buttonsResponseMessage?.selectedButtonId ||
          m.message.interactiveResponseMessage?.nativeFlowResponseMessage
            .paramsJson
          ? JSON.parse(
              m.message.interactiveResponseMessage.nativeFlowResponseMessage
                .paramsJson
            )?.id
          : "" || ""
        : m.type === "senderKeyDistributionMessage"
        ? m.message.conversation || m.message.imageMessage?.caption
        : "";
    m.isCmd = m.body?.startsWith(global.prefix);
    m.cmd = m.body
      ?.trim()
      .split(" ")[0]
      .replace(global.prefix, "")
      .toLowerCase();
    m.args = m.body
      ?.replace(/^\S*\b/g, "")
      .trim()
      .split(global.splitArgs)
      .filter((arg) => arg !== "");
    m.isLink = m.body?.match(
      /(http:\/\/|https:\/\/)?(www\.)?[a-zA-Z0-9]+\.[a-zA-Z]+(\.[a-zA-Z]+)?(\/[^\s]*)?/g
    );

    m.reply = (text) =>
      zzysock.sendMessage(
        m.id,
        {
          text,
        },
        {
          quoted: m,
        }
      );

    if (!m.isCmd) return;

    /** COMMAND HANDLER */
    for (let command of commands) {
      if (command.cmds && command.cmds.includes(m.cmd)) {
        try {
          logger("info", `COMMAND ${m.cmd}`, `From: ${m.userId}`);
          if (command.autoRead) {
            await zzysock.readMessages([m.key]);
          }
          if (command.presence) {
            const presenceOptions = [
              "unavailable",
              "available",
              "composing",
              "recording",
              "paused",
            ];
            await zzysock.sendPresenceUpdate(
              presenceOptions.includes(command.presence)
                ? command.presence
                : "composing",
              m.id
            );
          }
          if (command.react) {
            await zzysock.sendMessage(m.id, {
              react: {
                key: m.key,
                text: command.react,
              },
            });
          }
          if (command.onlyOwner && !m.itsMe && !m.isOwner)
            return m.reply(global.mess.onlyOwner);
          if (command.handle) {
            await command.handle(zzysock, m);
          }
        } catch (err) {
          m.reply(err.message);
        }
      } else {
        switch (m.cmd) {
          default:
            break;
        }
      }
    }
  });
}

start();
