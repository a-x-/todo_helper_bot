# dolistbot
telegram outliner todo list manager. Add it to channel with you and add #todo lists starting with special short 3-symbol slash-command instead of "-". Click on it to mark item complete w/o editing!

Alexander @tesla_guy: I use following format:
```
#todo #topic
- todo item
- todo item
```

When i need to complete item, I replace "-" sign by "✅" one.
When list (almost) complete usually I start new one and copy actual items.
Mostly I work with saved messages chat, but also I have some Channels with myself only for some special topics. Channel allows me edit messages anytime and add comments 

# Architecture
### Tech stack
ts, bun.sh, telegraf, tdlib, postgres, docker, caddy, github actions

### Structure
- Telegram bot (inserts Button to todo WebApp under #todo lists)
- TDLib helper (edit my and my wife and friends messages with #todo lists: update todo items)
- WebApp frontend (displays todo lists with checkboxes and move-handles and delete buttons)
- WebApp server /api/items (CRUD for todo items; uses shared with bot pg)


# Todos
- [ ] multiuser: wife sends a shopping list to me, I edit it w/o copying to my own list
- [ ] sync with notion databases by #todo #topic tags
- [ ] use inline mode to find tasks in notion and link them to todo items