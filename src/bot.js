import TelegramBot from "node-telegram-bot-api";
import cron from "node-cron";
import dotenv from "dotenv";
import {
  handleUserText,
  handleUser,
  newOrderQuery,
  deleteOrderQuery,
  checkOrdersQuery,
  sendSchudele,
} from "./user.js";
// import { handleAdminText } from "./admin.js";
dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const ADMIN_USERNAME = process.env.ADMIN_USERNAME.toLowerCase();

bot.setMyCommands([
  { command: "/createorder", description: "✅ Записаться" },
  { command: "/deleteorder", description: "❌ Отменить запись" },
  { command: "/checkorders", description: "📅 Просмотр записей" },
]);

bot.onText(/\/start/, async (msg) => {
  const username = (msg.from.username || "").toLowerCase();
  const chatId = msg.chat.id;
  await handleUserText(bot, chatId, username);
  return;
});

bot.onText(/\/createorder/, async (msg) => {
  const username = (msg.from.username || "").toLowerCase();
  const chatId = msg.chat.id;
  await newOrderQuery(bot, chatId, username);
  return;
});

bot.onText(/\/deleteorder/, async (msg) => {
  const username = (msg.from.username || "").toLowerCase();
  const chatId = msg.chat.id;
  await deleteOrderQuery(bot, chatId, username);
  return;
});

bot.onText(/\/checkorders/, async (msg) => {
  const username = (msg.from.username || "").toLowerCase();
  const chatId = msg.chat.id;
  await checkOrdersQuery(bot, chatId, username);
  return;
});

bot.on("callback_query", async (q) => {
  const username = (q.from.username || "").toLowerCase();
  await handleUser(bot, q);
  return;
});

console.log("Bot started");

cron.schedule("0 18 * * *", () => {
  sendSchudele(bot);
});

// sendSchudele(bot);
