import { google } from "googleapis";
import dotenv from "dotenv";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function authClient() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (!keyFile) throw new Error("GOOGLE_SERVICE_ACCOUNT_FILE not set");
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: SCOPES,
  });
  return auth;
}

export async function readUsersSheet() {
  const auth = authClient();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.SHEET_USERS_ID;
  const sheetName = "Users";
  const range = `${sheetName}!A2:C`;

  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const values = resp.data.values || [];

  return values.map((item) => item[0]);
}

export async function getDates() {
  const auth = authClient();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.SHEET_BOOKINGS_ID;

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
  });

  const resp = response.data.sheets || [];

  const today = getCurrentDateGMT3();
  const todayNum = dateToNumber(today);

  const result = [];

  for (const s of resp) {
    const title = s.properties?.title;

    // проверяем что название листа выглядит как дата DD.MM.YYYY
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(title)) continue;

    const sheetNum = dateToNumber(title);

    const times = await getTimes(title);

    if (sheetNum >= todayNum && times.length > 0) {
      result.push(title);
    }
  }

  result.sort((a, b) => dateToNumber(a) - dateToNumber(b));

  return result;
}

export async function getTimes(list) {
  let flagToday = false;
  const auth = authClient();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.SHEET_BOOKINGS_ID;

  const listExistFlag = await checkSheetExists(list);

  const sheetNum = dateToNumber(list);
  const today = getCurrentDateGMT3();
  const todayNum = dateToNumber(today);

  if (sheetNum >= todayNum) {
    flagToday = true;
  }

  if (listExistFlag && flagToday) {
    const range = list + "!A2:E"; // вся колонка A

    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const values = resp.data.values || [];

    const columnAValues = values
      .filter((value) => !value[1] || value[1].trim() === "")
      .map((value) => value[0]); // берем только первый элемент каждой строки (колонка A)

    return columnAValues;
  } else {
    return [];
  }
}

async function checkSheetExists(sheetName) {
  const auth = authClient();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.SHEET_BOOKINGS_ID;

  try {
    // Получаем метаданные таблицы
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties",
    });

    // Проверяем существование листа с нужным названием
    const sheetsList = response.data.sheets;
    const sheetExists = sheetsList.some(
      (sheet) => sheet.properties.title === sheetName
    );

    return sheetExists;
  } catch (error) {
    console.error("Ошибка при проверке листа:", error);
    throw error;
  }
}

export async function checkTimeClear(sheetName, time) {
  const auth = authClient();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.SHEET_BOOKINGS_ID;

  try {
    // 1. Получаем данные из колонки A (весь столбец)
    const responseTimes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:A`,
    });

    const valuesTimes = responseTimes.data.values || [];

    // 2. Ищем совпадение в колонке A
    let rowIndexTimes = -1;
    for (let i = 0; i < valuesTimes.length; i++) {
      if (valuesTimes[i][0] === time) {
        rowIndexTimes = i + 1; // +1 потому что строки в Google Sheets начинаются с 1
        break;
      }
    }

    if (rowIndexTimes === -1) {
      return false;
    }

    // 3. Получаем значения из колонок B, C, D для найденной строки
    const range = `${sheetName}!B${rowIndexTimes}:D${rowIndexTimes}`;
    const rowResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: range,
    });

    const rowValues = rowResponse.data.values ? rowResponse.data.values[0] : [];

    // 4. Проверяем каждую колонку на пустоту
    const result = {
      found: true,
      rowIndex: rowIndexTimes,
      searchValue: time,
      columns: {
        B: {
          value: rowValues[0] || null,
          isEmpty: !rowValues[0] || rowValues[0].trim() === "",
        },
        C: {
          value: rowValues[1] || null,
          isEmpty: !rowValues[1] || rowValues[1].trim() === "",
        },
        D: {
          value: rowValues[2] || null,
          isEmpty: !rowValues[2] || rowValues[2].trim() === "",
        },
      },
      allEmpty: false,
      anyEmpty: false,
    };

    // Дополнительные проверки
    result.allEmpty =
      result.columns.B.isEmpty &&
      result.columns.C.isEmpty &&
      result.columns.D.isEmpty;

    result.anyEmpty =
      result.columns.B.isEmpty ||
      result.columns.C.isEmpty ||
      result.columns.D.isEmpty;

    return result.allEmpty ? rowIndexTimes : false;
  } catch (error) {
    console.error("Ошибка при поиске и проверке:", error);
    throw error;
  }
}

function getCurrentDateGMT3() {
  const now = new Date(); // локальное время сервера, уже GMT+3

  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();

  return `${dd}.${mm}.${yyyy}`;
}

function dateToNumber(dateStr) {
  const [dd, mm, yyyy] = dateStr.split(".");
  return Number(`${yyyy}${mm}${dd}`);
}

export async function getUserInfo(username) {
  const auth = authClient();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.SHEET_USERS_ID;

  try {
    // Получаем данные из колонок A, B и C
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `Users!A:C`, // Колонки A, B, C
    });

    const rows = response.data.values || [];

    // Ищем строку с совпадением в колонке A
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === username) {
        // rows[i][0] - значение в колонке A
        return {
          found: true,
          rowNumber: i + 1, // +1 потому что строки в Google Sheets начинаются с 1
          username: rows[i][0] || null,
          name: rows[i][1] || null, // Значение из колонки B
          phone: rows[i][2] || null, // Значение из колонки C
          fullRow: rows[i],
        };
      }
    }

    // Если значение не найдено
    return false;
  } catch (error) {
    console.error("Ошибка при поиске:", error);
    throw error;
  }
}

export async function writeRecord(sheetName, rowNumber, values) {
  const auth = authClient();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.SHEET_BOOKINGS_ID;

  try {
    // Формируем диапазон для всех трех колонок
    const range = `${sheetName}!B${rowNumber}:D${rowNumber}`;

    // Подготавливаем значения в виде одной строки
    const rowValues = [
      [
        values.B || "", // Колонка B
        values.C || "", // Колонка C
        values.D || "", // Колонка D
      ],
    ];

    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: range,
      valueInputOption: "USER_ENTERED",
      resource: {
        values: rowValues,
      },
    });
  } catch (error) {
    console.error("Ошибка при записи:", error);
    throw error;
  }
}

export async function writeChatID(username, chatID) {
  const auth = authClient();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.SHEET_USERS_ID;

  try {
    // 1. Получаем все значения из колонки A
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `Users!A:A`,
    });

    const rows = response.data.values || [];
    let foundRowNumber = null;

    // 2. Ищем значение в колонке A
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === username) {
        foundRowNumber = i + 1; // +1 потому что строки в Google Sheets начинаются с 1
        break;
      }
    }

    if (!foundRowNumber) return;

    // 3. Записываем новое значение в колонку D найденной строки
    const updateResponse = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Users!D${foundRowNumber}`,
      valueInputOption: "USER_ENTERED", // или 'RAW' для сырых данных
      resource: {
        values: [[chatID]],
      },
    });

    return;
  } catch (error) {
    console.error("Ошибка при поиске и обновлении:", error);
    throw error;
  }
}

export async function getUserRecords(username) {
  const auth = authClient();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.SHEET_BOOKINGS_ID;

  const dates = await getDates();
  const results = [];

  try {
    // Проходим по каждому листу
    for (const sheetName of dates) {
      try {
        // Получаем данные из колонок A и B на текущем листе
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!A:B`, // Колонки A и B
        });

        const rows = response.data.values || [];

        // Ищем username в колонке B
        for (let i = 0; i < rows.length; i++) {
          // rows[i][1] - значение в колонке B
          if (rows[i][1] === username) {
            results.push({
              sheetName: sheetName,
              columnA: rows[i][0] || null,
            });
          }
        }
      } catch (error) {
        console.error(
          `Ошибка при обработке листа ${sheetName}:`,
          error.message
        );
        // Продолжаем с следующим листом даже если текущий вызвал ошибку
      }
    }

    return results;
  } catch (error) {
    console.error("Общая ошибка при поиске:", error);
    throw error;
  }
  return;
}

export async function deleteRecord(username, sheetName, time) {
  const sheetExist = await checkSheetExists(sheetName);

  if (!sheetExist) {
    return false;
  }

  const auth = authClient();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.SHEET_BOOKINGS_ID;

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:B`, // Только колонка A
    });

    const rows = response.data.values || [];

    let rowIndex;

    // Ищем значение в колонке A
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === time && rows[i][1] === username) {
        rowIndex = i + 1;
        break;
      }
    }

    const clearPromises = [
      sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!B${rowIndex}`,
      }),
      sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!C${rowIndex}`,
      }),
      sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${sheetName}!D${rowIndex}`,
      }),
    ];

    const results = await Promise.all(clearPromises);

    return true;
  } catch (error) {
    console.error(`Ошибка при обработке листа ${sheetName}:`, error.message);
    return false;
  }
}

export async function getSheetData(list) {
  let flagToday = false;
  const auth = authClient();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.SHEET_BOOKINGS_ID;

  const listExistFlag = await checkSheetExists(list);

  const sheetNum = dateToNumber(list);
  const today = getCurrentDateGMT3();
  const todayNum = dateToNumber(today);

  if (sheetNum >= todayNum) {
    flagToday = true;
  }

  if (listExistFlag && flagToday) {
    const range = list + "!A2:E"; // вся колонка A

    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const values = resp.data.values || [];

    const columnAValues = values.filter((value) => value[0] && value[1]); // берем только первый элемент каждой строки (колонка A)

    return columnAValues;
  } else {
    return [];
  }
}

export async function getUsersTomorrow(searchValues) {
  const auth = authClient();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.SHEET_USERS_ID;

  try {
    // Получаем все данные с листа
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `Users!A2:D`, // Получаем все колонки до Z
    });

    const rows = response.data.values || [];
    const results = [];

    // Проходим по всем строкам
    for (let i = 0; i < rows.length; i++) {
      const valueInColumnA = rows[i][0]; // Значение в колонке A

      // Проверяем, есть ли это значение в массиве поиска
      if (searchValues.includes(valueInColumnA) && rows[i][3]) {
        // Создаем объект со всеми колонками
        const rowData = {};
        for (let j = 0; j < rows[i].length; j++) {
          const columnLetter = String.fromCharCode(65 + j); // A, B, C, ...
          rowData[columnLetter] = rows[i][j] || null;
        }

        results.push({
          A: rows[i][0] || null,
          B: rows[i][1] || null,
          C: rows[i][2] || null,
          D: rows[i][3] || null,
        });
      }
    }

    return results;
  } catch (error) {
    console.error("Ошибка при поиске:", error);
    throw error;
  }
}
