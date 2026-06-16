# 🤖 Telegram Bot Post Manager

A production-grade Telegram bot system for posting, scheduling, and broadcasting messages to your Telegram channels with advanced features.

## ✨ Features

✅ **Post to Single Channel** - Send messages to individual channels  
✅ **Broadcast to Multiple Channels** - Send same message to many channels at once  
✅ **Schedule Messages** - Queue messages to be sent at a specific time  
✅ **Hide with Spoiler** - Wrap messages in spoiler tags (users must tap to reveal)  
✅ **Silent Delivery** - Send messages without notification sound  
✅ **Paid Content** - Mark messages as exclusive/paid  
✅ **HTML Formatting** - Support for bold, italic, links, code blocks, etc.  
✅ **Modern Dashboard UI** - Beautiful, intuitive interface for management  
✅ **REST API** - Full API for programmatic access  
✅ **Channel Management** - Add/remove/manage channels  

## 📦 What's Included

```
telegram-bot-project/
├── telegram-bot-server.js      # Backend Express server
├── TelegramBotDashboard.jsx    # React dashboard UI
├── package.json                # Dependencies & scripts
├── QUICKSTART.md               # 5-minute setup guide
├── SETUP_GUIDE.md              # Detailed documentation
├── API_DOCUMENTATION.md        # Complete API reference
├── test-api.js                 # API testing script
└── .env.example                # Environment template
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Backend Server
```bash
npm start
```

You'll see:
```
🤖 Telegram Bot Server running on port 3000
📱 Bot link: https://t.me/p0stagain_bot
```

### 3. Open Dashboard
- **Option A (Easiest)**: Copy `TelegramBotDashboard.jsx` into a Claude.ai React artifact
- **Option B**: Deploy to your own React app using `TelegramBotDashboard.jsx`

### 4. Start Posting!
1. Add channels in the "Manage Channels" tab
2. Go to "Post Message" tab
3. Select a channel, type your message
4. Click "Post Message"

**Done!** ✅

## 🎯 Use Cases

### 📢 Newsletter Distribution
- Add all your subscriber channels
- Click "Send to Multiple Channels"
- Schedule your newsletter
- Message reaches everyone automatically

### 🎬 Content Creator
- Post behind spoilers to hide plot twists
- Mark premium content as "Paid"
- Send silent notifications for surprise drops

### 📱 Team Communication
- Quiet notifications (no sound)
- Schedule important updates
- Broadcast to team channels

### 🛒 E-commerce
- Schedule product launches
- Broadcast to multiple promotional channels
- Use spoilers for surprise announcements

## 📡 API Endpoints

### Core Endpoints
```
GET  /api/health              # Server health check
POST /api/post                # Post to single channel
POST /api/broadcast           # Post to multiple channels
GET  /api/channels            # List all channels
POST /api/channels            # Add new channel
DELETE /api/channels/:id      # Delete channel
GET  /api/scheduled           # List scheduled messages
DELETE /api/scheduled/:id     # Cancel scheduled message
```

See `API_DOCUMENTATION.md` for full details.

## 📊 Dashboard Features

### Post Message Tab
- Select single or multiple channels
- Write message with HTML formatting
- Enable/disable: spoiler, silent, paid
- Schedule for future delivery
- Real-time character count

### Manage Channels Tab
- Add channels by ID or username
- View all registered channels
- Delete channels with one click
- Bulk management interface

### Scheduled Messages Tab
- View all queued messages
- See scheduled delivery times
- Cancel messages before they send
- Check message details

## 🔑 Bot Information

Your bot is already created! Here's your info:

| Item | Value |
|------|-------|
| **Bot Username** | @p0stagain_bot |
| **Bot Link** | https://t.me/p0stagain_bot |
| **Token** | set via `BOT_TOKEN` in `.env` (see `.env.example`) |
| **Create/Manage** | @BotFather |

## 🛠️ Technologies Used

- **Backend**: Node.js + Express.js
- **Bot API**: node-telegram-bot-api
- **Frontend**: React + Tailwind CSS + Lucide Icons
- **Scheduling**: node-cron
- **Communication**: REST API

## 📖 Documentation

| Document | Purpose |
|----------|---------|
| `QUICKSTART.md` | 5-minute setup guide |
| `SETUP_GUIDE.md` | Complete installation & configuration |
| `API_DOCUMENTATION.md` | Full API reference & examples |
| `test-api.js` | Automated API testing |

## 🧪 Testing

Run the test suite to verify everything works:

```bash
# Terminal 1: Start the server
npm start

# Terminal 2: Run tests
node test-api.js
```

You'll see:
```
🧪 Test 1: Health Check
✅ PASSED: Server is running
...
🎉 All tests passed! Your bot is ready to go!
```

## 🔒 Security Notes

⚠️ **Important**: Your bot token is sensitive!

1. **Never commit to public repos**
   ```bash
   echo "node_modules/" >> .gitignore
   echo ".env" >> .gitignore
   ```

2. **Use environment variables**
   - Copy `.env.example` to `.env`
   - Fill in your token
   - Load with: `require('dotenv').config()`

3. **Add API authentication** (for production)
   - Implement API key validation
   - Use HTTPS for all communication
   - Rate limit API endpoints

## 🚀 Production Deployment

### Heroku
```bash
heroku create your-bot-name
git push heroku main
```

### AWS Lambda
1. Package the application
2. Create Lambda function
3. Set up API Gateway

### Docker
```bash
docker build -t telegram-bot .
docker run -p 3000:3000 telegram-bot
```

### PM2 (VPS/Linode)
```bash
npm install -g pm2
pm2 start telegram-bot-server.js
pm2 startup
pm2 save
```

## 🐛 Troubleshooting

**Q: "Cannot connect to localhost:3000"**  
A: Make sure you're running `npm start` in another terminal

**Q: "Chat not found" error**  
A: Verify your channel ID. Use `@channelname` for public channels or numeric ID for private

**Q: "Bot doesn't have permission"**  
A: Add the bot as an admin to your channel first

**Q: Messages not sending**  
A: Check that the bot has send message permissions in the channel

## 📞 Support & Resources

- **Telegram Bot API**: https://core.telegram.org/bots/api
- **Express.js Docs**: https://expressjs.com/
- **Telegram Bot Tutorials**: https://www.youtube.com/results?search_query=telegram+bot

## 📝 License

This project is open source and free to use, modify, and distribute.

## 🎉 Next Steps

1. ✅ Install & start the server (`npm install && npm start`)
2. ✅ Open the dashboard
3. ✅ Add your channels
4. ✅ Post your first message!
5. ✅ Deploy to production when ready

---

## 📊 Project Structure

```javascript
// Backend Routes
GET   /api/health              → Server status
GET   /api/channels            → List channels
POST  /api/channels            → Add channel
DELETE /api/channels/:id       → Remove channel

GET   /api/scheduled           → List scheduled posts
DELETE /api/scheduled/:id      → Cancel scheduled post

POST  /api/post                → Post single message
POST  /api/broadcast           → Broadcast to multiple
```

## 🎨 UI Components

- **Gradient Background**: Slate + Purple theme
- **Tab Navigation**: Post, Channels, Scheduled
- **Form Validation**: Required fields checking
- **Real-time Feedback**: Character count, status updates
- **Responsive Design**: Works on desktop and tablet

## ⚡ Performance

- ✅ Instant message delivery
- ✅ Concurrent broadcasting (send to 10+ channels simultaneously)
- ✅ Lightweight dashboard (minimal bundle size)
- ✅ Efficient scheduling (uses Node.js timers)

---

**Built with ❤️ for Telegram creators and broadcasters**

Happy posting! 🚀
