const ADMIN_MENU = {
  reply_markup: {
    inline_keyboard: [
      [
        {
          text: "📅 Просмотреть записи на сегодня",
          callback_data: "admin-list",
        },
      ],
    ],
  },
};

// Обработка кооманды start
export async function handleAdminText(bot, chatId) {
  bot.sendMessage(
    chatId,
    `Привет, Кирюха!\n\n` + "Выбери действие",
    ADMIN_MENU
  );
}
