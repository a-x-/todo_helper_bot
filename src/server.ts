//
// SERVER
//

import { psqlQuery } from "./db/setup.js";
import { getItem, getItems } from "./model.js";
import { updateMessageKeepButton } from "./utils/tg.js";
import { regExpEscape, res, tickTextRxStr } from "./utils/utils.js";

console.log("process.env.PG_URL", process.env.PG_URL);
const port = process.env.SERVER_PORT || 3000;
console.log("starting server on port :", port);

export default {
  port,
  async fetch(req: Request) {
    try {
      const urlObj = new URL(req.url);
      if (!urlObj.pathname.startsWith("/api/items")) {
        const error = "Invalid endpoint path";
        console.log(error, urlObj.pathname);
        return res({ error }, 404);
      }
      const chatId = urlObj.searchParams.get("chatId");
      const messageId = urlObj.searchParams.get("messageId");
      if (!chatId || !messageId) return res({ error: "Missing params" }, 400);

      switch (req.method) {
        case "GET": {
          const items = await getItems(Number(chatId), Number(messageId));
          return res({ items });
        }
        case "PATCH": {
          const itemId = Number(urlObj.pathname.replace("/api/items/", ""));
          const body = await req.json<TodoItem>();
          if ('completed' in body) {
            const { completed } = body;
            const query = "UPDATE items SET completed = $1 WHERE id = $2";
            await psqlQuery(query, [completed, itemId]);
            const { item_text } = await getItem(itemId);
            await updateMessageByToggleItem(Number(chatId), Number(messageId), item_text, completed);
            return res({ success: true });
          } else if ('item_text' in body) {
            const { item_text: old_text } = await getItem(itemId);
            const { item_text: new_text } = body;
            const query = "UPDATE items SET item_text = $1 WHERE id = $2";
            await psqlQuery(query, [new_text, itemId]);
            await updateMessageByEditItem(Number(chatId), Number(messageId), old_text, new_text);
            return res({ success: true });
          } else {
            return res({ error: "Invalid body" }, 400);
          }
        }
        case "POST": {
          const body = await req.json<TodoItem>();
          const { item_text } = body;
          await updateMessageByNewItem(Number(chatId), Number(messageId), item_text);
          const items = await getItems(Number(chatId), Number(messageId));
          return res({ items });
        }
        case "DELETE": {
          const itemId = Number(urlObj.pathname.replace("/api/items/", ""));
          const { item_text } = await getItem(itemId);
          const query = "DELETE FROM items WHERE id = $1";
          await psqlQuery(query, [itemId]);
          await updateMessageByDeleteItem(Number(chatId), Number(messageId), item_text);
          return res({ success: true });
        }
        default:
          return res({ error: "Invalid method" }, 405);
      }
    } catch (e) {
      console.error(e);
      return res(e instanceof Error ? { error: e.message, trace: e.stack } : { error: "Internal server error"}, 500);
    }
  },
};

async function updateMessageByNewItem(chatId: number, messageId: number, item_text: number) {
  const addQuery = `INSERT INTO items (chat_id, message_id, item_text) VALUES ($1, $2, $3)`;
  await psqlQuery(addQuery, [chatId, messageId, item_text]);
  const getTextQuery = "SELECT list_text, chat_type FROM lists WHERE chat_id = $1 AND message_id = $2";
  const { chat_type, list_text } = (await psqlQuery(getTextQuery, [chatId, messageId])).rows[0];
  const newText = list_text + "\n- " + item_text;
  const updateTextQuery = "UPDATE lists SET list_text = $1 WHERE chat_id = $2 AND message_id = $3";
  await psqlQuery(updateTextQuery, [newText, chatId, messageId]);

  const msgObj = { id: messageId, text: newText, chatType: chat_type };
  console.log("updateMessageByNewItem", { chatId, messageId, item_text, list_text, newText, msgObj });
  await updateMessageKeepButton(chatId, msgObj);
}

async function updateMessageByToggleItem(chatId: number, messageId: number, item_text: string, completed: boolean) {
  const getTextQuery = "SELECT list_text, chat_type FROM lists WHERE chat_id = $1 AND message_id = $2";
  const { chat_type, list_text } = (await psqlQuery(getTextQuery, [chatId, messageId])).rows[0];
  const item_text_ = (completed ? "✅ " : "- ") + item_text;
  const list_text_ = list_text.replace(new RegExp(tickTextRxStr + regExpEscape(item_text), "m"), item_text_);
  const updateTextQuery = "UPDATE lists SET list_text = $1 WHERE chat_id = $2 AND message_id = $3";
  await psqlQuery(updateTextQuery, [list_text_, chatId, messageId]);

  try {
    const msgObj = { id: messageId, text: list_text_, chatType: chat_type };
    await updateMessageKeepButton(chatId, msgObj);
  } catch (e) {
    console.error("update tg message failed", e, {
      chatId,
      messageId,
      completed,
      list_text,
      list_text_,
      item_text,
      item_text_,
    });
    throw e;
  }
}

async function updateMessageByEditItem(chatId: number, messageId: number, old_text: string, new_text: string) {
  const getTextQuery = "SELECT list_text, chat_type FROM lists WHERE chat_id = $1 AND message_id = $2";
  const { chat_type, list_text } = (await psqlQuery(getTextQuery, [chatId, messageId])).rows[0];
  const list_text_ = list_text.replace(new RegExp(tickTextRxStr + regExpEscape(old_text), "m"), "- " + new_text);
  const updateTextQuery = "UPDATE lists SET list_text = $1 WHERE chat_id = $2 AND message_id = $3";
  await psqlQuery(updateTextQuery, [list_text_, chatId, messageId]);

  try {
    const msgObj = { id: messageId, text: list_text_, chatType: chat_type };
    await updateMessageKeepButton(chatId, msgObj);
  } catch (e) {
    console.error("update tg message failed", e, {
      chatId,
      messageId,
      list_text,
      list_text_,
      item_text: new_text,
    });
    throw e;
  }
}

async function updateMessageByDeleteItem(chatId: number, messageId: number, item_text: string) {
  const getTextQuery = "SELECT list_text, chat_type FROM lists WHERE chat_id = $1 AND message_id = $2";
  const { chat_type, list_text } = (await psqlQuery(getTextQuery, [chatId, messageId])).rows[0];
  const list_text_ = list_text.replace(new RegExp(tickTextRxStr + regExpEscape(item_text) + '\n?', "m"), "");
  const updateTextQuery = "UPDATE lists SET list_text = $1 WHERE chat_id = $2 AND message_id = $3";
  await psqlQuery(updateTextQuery, [list_text_, chatId, messageId]);

  try {
    const msgObj = { id: messageId, text: list_text_, chatType: chat_type };
    await updateMessageKeepButton(chatId, msgObj);
  } catch (e) {
    console.error("update tg message failed", e, {
      chatId,
      messageId,
      list_text,
      list_text_,
      item_text,
    });
    throw e;
  }
}

type TodoItem = {
  id: number;
  completed: boolean;
  item_id: number;
  message_id: number;
  item_text: number;
};
