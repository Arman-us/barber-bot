import {
  readUsersSheet,
  getDates,
  getTimes,
  checkTimeClear,
  getUserInfo,
  writeRecord,
  writeChatID,
  getUserRecords,
  deleteRecord,
  getSheetData,
  getUsersTomorrow,
} from "./sheets.js";

// Обработка кооманды start
export async function handleUserText(bot, chatId, username, start = true) {
  const { flag: usernameFlag, text: usernameText } = await checkUserName(
    username
  );
  if (usernameFlag) {
    if (start) {
      bot.sendMessage(chatId, `Привет, ${username}!`);
    }
    const { flag: registrationFlag, text: registrationText } =
      await checkRegistration(username);

    if (registrationFlag) {
      if (start) {
        const helloText = `Воспользуйся пунктами меню для взаимодействия с ботом.`;
        bot.sendMessage(chatId, helloText);
      }

      return true;
    } else {
      bot.sendMessage(chatId, registrationText);
      return false;
    }
  } else {
    if (start) {
      bot.sendMessage(chatId, `Привет!`);
    }
    bot.sendMessage(chatId, usernameText);
    return false;
  }
}

async function checkUserName(username) {
  let flag = true;
  let text = "";

  if (username == "") {
    flag = false;
    text =
      `Чтобы пользоваться ботом, вам нужен username в Telegram.\n\n` +
      `Вот как его установить:\n` +
      `1. Откройте настройки Telegram.\n` +
      `2. Перейдите в редактирование пользователя.\n` +
      `3. Перейдите в "Имя пользователя".\n` +
      `4. Придумайте уникальный username и сохраните.\n\n` +
      `После этого возвращайтесь к боту и пользуйтесь всеми функциями.`;
  }

  return { flag, text };
}

async function checkRegistration(username) {
  let flag = true;
  let text = "";

  const users = await readUsersSheet();

  if (!users.includes(username)) {
    const ADMIN_USERNAME = process.env.ADMIN_USERNAME.toLowerCase();
    flag = false;
    text =
      `У тебя нет доступа к функционалу бота.\n\n` +
      `Обратись к @` +
      ADMIN_USERNAME +
      `, чтобы он добавил тебя в список доверенных пользователей.`;
  }

  return { flag, text };
}

// Обработка callback_query пользователя
export async function handleUser(bot, q) {
  const data = q.data;
  switch (data) {
    case "cancel":
      await cancelQuery(bot, q);
      break;
    case "cancel_delete":
      await cancelQuery(bot, q);
      break;
  }

  const username = (q.message.chat.username || "").toLowerCase();

  if (data?.startsWith("date_")) {
    await newOrderDateQuery(bot, q, username);
    return;
  }

  if (data?.startsWith("time_")) {
    await newOrderTimeQuery(bot, q, username);
    return;
  }

  if (data?.startsWith("delete_")) {
    await deleteOrderTimeQuery(bot, q, username);
    return;
  }
}

async function cancelQuery(bot, q) {
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;
  const username = q.from.username || "";

  await bot.deleteMessage(q.message.chat.id, q.message.message_id);
  await bot.answerCallbackQuery(q.id);
}

export async function newOrderQuery(
  bot,
  chatId,
  username,
  text = "",
  q = null
) {
  const flag = await handleUserText(bot, chatId, username, false);
  if (!flag) return;

  const dates = await getDates();

  const dateButtons = dates.map((d) => [
    { text: d, callback_data: `date_${d}` },
  ]);
  dateButtons.push([{ text: "❌ Отмена", callback_data: "cancel" }]);

  if (text != "") {
    await bot.deleteMessage(q.message.chat.id, q.message.message_id);
    await bot.sendMessage(chatId, text);
  }
  await bot.sendMessage(chatId, "Выбери дату записи:", {
    reply_markup: { inline_keyboard: dateButtons },
  });
}

async function newOrderDateQuery(bot, q, username) {
  const flag = await handleUserText(
    bot,
    q.message.chat.id,
    q.from.username,
    false
  );
  if (!flag) return;

  const sheetName = q.data.split("_")[1];
  const times = await getTimes(sheetName);

  if (times.length > 0) {
    const buttons = times.map((t) => ({
      text: t,
      callback_data: `time_${sheetName}_${t}`,
    }));
    // группируем по 3 в ряд
    const timeButtons = [];
    for (let i = 0; i < buttons.length; i += 3) {
      timeButtons.push(buttons.slice(i, i + 3));
    }
    // добавляем кнопку возврата
    timeButtons.push([{ text: "❌ Отмена", callback_data: "cancel" }]);
    await bot.deleteMessage(q.message.chat.id, q.message.message_id);
    await bot.sendMessage(
      q.message.chat.id,
      "Выбери время " + sheetName + " для записи:",
      {
        reply_markup: { inline_keyboard: timeButtons },
      }
    );
    await bot.answerCallbackQuery(q.id);
  } else {
    await newOrderQuery(
      bot,
      q.message.chat.id,
      username,
      "Выбранная дата больше не актуальна.",
      q
    );
    return;
  }
}

async function newOrderTimeQuery(bot, q, username) {
  const flag = await handleUserText(
    bot,
    q.message.chat.id,
    q.from.username,
    false
  );
  if (!flag) return;

  const sheetName = q.data.split("_")[1];
  const time = q.data.split("_")[2];

  const timeFlag = await checkTimeClear(sheetName, time);

  if (!timeFlag) {
    await newOrderQuery(
      bot,
      q.message.chat.id,
      username,
      "Выбранное время больше не актуально.",
      q
    );
    return;
  }

  const userData = await getUserInfo(username);

  if (userData) {
    await writeRecord(sheetName, timeFlag, {
      B: userData.username,
      C: userData.phone,
      D: userData.name,
    });

    await writeChatID(username, q.message.chat.id);

    await bot.deleteMessage(q.message.chat.id, q.message.message_id);
    await bot.sendMessage(
      q.message.chat.id,
      `Запись на ${sheetName} в ${time} успешно оформлена.`
    );
  }

  return;
}

export async function deleteOrderQuery(bot, chatId, username) {
  const flag = await handleUserText(bot, chatId, username, false);
  if (!flag) return;

  const orders = await getUserRecords(username);

  if (orders.length == 0) {
    await bot.sendMessage(chatId, `У Вас нет актуальных записей.`);
  } else {
    const buttons = orders.map((t) => [
      {
        text: `${t.sheetName} в ${t.columnA}`,
        callback_data: `delete_${t.sheetName}_${t.columnA}`,
      },
    ]);

    // добавляем кнопку возврата
    buttons.push([{ text: "❌ Отмена", callback_data: "cancel_delete" }]);

    await bot.sendMessage(chatId, "Выбери запись для отмены:", {
      reply_markup: { inline_keyboard: buttons },
    });
  }
}

async function deleteOrderTimeQuery(bot, q, username) {
  const sheetName = q.data.split("_")[1];
  const time = q.data.split("_")[2];

  const deleteResult = await deleteRecord(username, sheetName, time);
  await bot.deleteMessage(q.message.chat.id, q.message.message_id);

  if (deleteResult) {
    await bot.sendMessage(
      q.message.chat.id,
      `Ваша запись ${sheetName} в ${time} успешно отменена.`
    );
  } else {
    const ADMIN_USERNAME = process.env.ADMIN_USERNAME.toLowerCase();
    await bot.sendMessage(
      q.message.chat.id,
      `Что-то пошло не так, для отмены обратитесь к @` + ADMIN_USERNAME + `.`
    );
  }
}

export async function checkOrdersQuery(bot, chatId, username) {
  const flag = await handleUserText(bot, chatId, username, false);
  if (!flag) return;

  const orders = await getUserRecords(username);

  if (orders.length == 0) {
    await bot.sendMessage(chatId, `У Вас нет актуальных записей.`);
  } else {
    let resultText = `Количество записей - ${orders.length}:`;

    orders.forEach((element) => {
      resultText += `\n📅 ${element.sheetName} в ${element.columnA}`;
    });

    await bot.sendMessage(chatId, resultText);
  }
}

export async function sendSchudele(bot) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dd = String(tomorrow.getDate()).padStart(2, "0");
  const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const yyyy = tomorrow.getFullYear();

  const tomorrowDate = `${dd}.${mm}.${yyyy}`;

  const data = await getSheetData(tomorrowDate);

  if (data.length == 0) return;

  const grouped = data.reduce((acc, item) => {
    const time = item[0];
    const key = item[1]; // caspip, santa и т.д.
    const phone = item[2];
    const name = item[3];

    if (!acc[key]) {
      acc[key] = {
        times: [],
      };
    }

    acc[key].times.push(time);

    return acc;
  }, {});

  const users = await getUsersTomorrow(Object.keys(grouped));

  if (users.length == 0) return;

  Object.entries(grouped).forEach(([key, value]) => {
    let resultText = `У Вас есть записи на завтра:`;

    value.times.forEach((element) => {
      resultText += `\n📅 ${tomorrowDate} в ${element}`;
    });

    const userDataFiltered = users.filter((el) => el.A === key);
    const chatID = userDataFiltered[0].D;

    bot.sendMessage(chatID, resultText);
  });
}
