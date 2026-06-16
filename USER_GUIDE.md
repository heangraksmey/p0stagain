# 📖 Visual User Guide - How to Use Your Bot Dashboard

## 🎬 Getting Started

### Step 1: Start the Backend

```bash
$ npm install        # Install dependencies (1st time only)
$ npm start         # Start the server
```

**Expected output:**
```
🤖 Telegram Bot Server running on port 3000
📱 Bot link: https://t.me/p0stagain_bot
```

✅ Leave this running!

---

### Step 2: Open Dashboard

Pick ONE:

#### 🌟 Option A: HTML Dashboard (EASIEST)
```
📁 Find: telegram-bot-dashboard.html
🖱️ Double-click it
🌐 Opens in browser
✅ Ready to go!
```

#### 🔷 Option B: React Dashboard
```
📁 Find: TelegramBotDashboard-improved.jsx
📋 Copy all code
🎨 Paste into Claude.ai (React artifact)
✅ Renders instantly!
```

---

## 📊 Dashboard Walkthrough

### Header Section
```
┌─────────────────────────────────────────────────────────┐
│  📤 Telegram Bot Manager                  🟢 Connected  │
│  Post • Schedule • Broadcast              Channels: 3   │
│                                           Scheduled: 1  │
└─────────────────────────────────────────────────────────┘
```

**What it shows:**
- ✅ Server connection status (green = connected, red = error)
- ✅ Number of channels registered
- ✅ Number of scheduled messages

---

### Tab Navigation
```
┌─────────────────────────────────────────────────────────┐
│  [📤 Post Message] [📋 Channels] [⏰ Scheduled]          │
└─────────────────────────────────────────────────────────┘
```

**3 main tabs:**
1. **📤 Post Message** - Send messages
2. **📋 Channels** - Add/delete channels
3. **⏰ Scheduled** - View scheduled messages

---

## 🎯 Tab 1: Post Message

### How to post:

```
Step 1: Select Channel
┌──────────────────────────────────┐
│ 📍 Select Channel                │
│ [👇 Choose a channel...  ▼]      │
│                                  │
│ Options: @mychannel              │
│          @news_channel           │
│          @announcements          │
└──────────────────────────────────┘

Step 2: Write Message
┌──────────────────────────────────┐
│ ✍️ Your Message       [152 chars] │
│ ┌──────────────────────────────┐ │
│ │ Hello everyone! Check out    │ │
│ │ our new feature launch!      │ │
│ │ Visit: https://example.com   │ │
│ └──────────────────────────────┘ │
│ 💡 Tip: Use HTML: <b>bold</b>   │
└──────────────────────────────────┘

Step 3: Pick Options
┌──────────────────────────────────┐
│ ⚙️ Options                        │
│ [🔇 Silent] [👁️ Spoiler] [💰 Paid]│
└──────────────────────────────────┘

Step 4: Send (or Schedule)
┌──────────────────────────────────┐
│ ⏰ Schedule (Optional)            │
│ [Pick date/time or leave empty]  │
│                                  │
│ [📤 Send Message]                │
└──────────────────────────────────┘
```

### Options Explained:

| Option | Icon | What it does | When to use |
|--------|------|------------|------------|
| **Silent** | 🔇 | No notification sound | Updates that don't need attention |
| **Spoiler** | 👁️ | Hide message (users tap to reveal) | Plot twists, surprises |
| **Paid** | 💰 | Mark as premium content | Exclusive member content |

### Features:

- ✅ **Broadcast Mode**: Toggle to send to multiple channels at once
- ✅ **Character Count**: Live count of message length
- ✅ **Schedule**: Optional - leave empty to post immediately
- ✅ **HTML Formatting**: 
  ```html
  <b>Bold</b> <i>Italic</i> <u>Underline</u>
  <a href="https://example.com">Link</a>
  ```

### Preview Panel (Right Side):

```
┌──────────────────────────┐
│ 📊 Preview              │
│                         │
│ Channel:                │
│ @mychannel              │
│                         │
│ Active options:         │
│ 👁️ Spoiler              │
│ ⏰ Scheduled             │
└──────────────────────────┘
```

Shows what will be sent!

---

## 📋 Tab 2: Manage Channels

### Add a Channel:

```
Left Side: Add New Channel
┌─────────────────────────────────┐
│ ➕ Add New Channel              │
│                                 │
│ Channel ID or Username:         │
│ [@yourchannelname ____]         │
│ 💡 @username or numeric ID      │
│                                 │
│ Display Name:                   │
│ [My Awesome Channel ____]       │
│                                 │
│ [➕ Add Channel]                │
└─────────────────────────────────┘

Right Side: Your Channels List
┌─────────────────────────────────┐
│ 📋 Your Channels (3 channels)   │
│                                 │
│ 🟣 My Channel                   │
│    @mychannel                   │
│    [🗑️]                          │
│                                 │
│ 🟣 News Updates                 │
│    @news                        │
│    [🗑️]                          │
│                                 │
│ 🟣 Announcements                │
│    @announce                    │
│    [🗑️]                          │
└─────────────────────────────────┘
```

### Channel ID Formats:

```
Public Channel:   @channelname
                  Example: @mychannel

Private Channel:  -1001234567890
                  How to find: Forward a message to @userinfobot
```

### Delete a Channel:

```
1. Click 🗑️ trash icon
2. Confirm: "Delete 'My Channel'?"
3. Done! Channel removed
```

---

## ⏰ Tab 3: Scheduled Messages

### View Scheduled Messages:

```
┌──────────────────────────────────────┐
│ ⏰ Scheduled Messages (2 scheduled)   │
│                                      │
│ ┌────────────────────────────────┐  │
│ │ 📍 @mychannel                  │  │
│ │ ⏰ Dec 25, 2024 10:00 AM      │  │
│ │                                │  │
│ │ Message preview:               │  │
│ │ "Merry Christmas everyone!..." │  │
│ │                                │  │
│ │ 👁️ Spoiler                     │  │
│ │                    [🗑️ Cancel] │  │
│ └────────────────────────────────┘  │
│                                      │
│ ┌────────────────────────────────┐  │
│ │ 📍 @news                       │  │
│ │ ⏰ Dec 26, 2024 9:00 AM       │  │
│ │ ...                            │  │
│ │                    [🗑️ Cancel] │  │
│ └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### Cancel a Scheduled Message:

```
1. Find the message in the list
2. Click [🗑️ Cancel]
3. Confirm: "Cancel this scheduled message?"
4. Message deleted (won't send)
```

---

## 🎨 UI Elements Explained

### Status Indicators:

```
🟢 Connected       = Server is working
🔴 Disconnected    = Server not running (start with: npm start)
```

### Buttons:

```
Primary (Gradient):     [📤 Send Message]        - Main action
Secondary (Dark):       [➕ Add Channel]         - Secondary action
Danger (Red):          [🗑️ Delete]              - Destructive action
Disabled (Faded):      [Submit...]              - Can't click (validation failed)
```

### Toast Notifications:

```
Success (Green):       ✅ Message posted!
Error (Red):          ❌ Channel not found
Info (Blue):          ℹ️ Waiting...
```

### Forms:

```
Valid input:           ✅ Border: purple glow
Invalid input:         ❌ Shows error below
Focused:               💜 Border highlights
```

---

## 🔔 Common Workflows

### Workflow 1: Post Now

```
1. Go to: "Post Message" tab
2. Select: Your channel
3. Type: Your message
4. Click: "Send Message"
5. Result: Message appears instantly! ✅
```

**Time: 1 minute**

---

### Workflow 2: Schedule a Message

```
1. Go to: "Post Message" tab
2. Select: Your channel
3. Type: Your message
4. Click: "Schedule (Optional)"
5. Pick: Date & time (e.g., tomorrow 9 AM)
6. Click: "Send Message"
7. Result: Message queued! ✅
   Will send automatically at scheduled time
```

**Time: 2 minutes**

---

### Workflow 3: Broadcast to Multiple

```
1. Go to: "Post Message" tab
2. Toggle: "📢 Broadcast to Multiple"
3. Check: Multiple channels (☑️ @channel1, ☑️ @channel2)
4. Type: Your message
5. Click: "Send Message"
6. Result: Same message sent to all! ✅
```

**Time: 1 minute**

---

### Workflow 4: Hide with Spoiler

```
1. Go to: "Post Message" tab
2. Select: Your channel
3. Type: Your secret message
4. Click: "👁️ Spoiler" button (turns active)
5. Click: "Send Message"
6. Result: Message hidden! Users must tap to reveal ✅
```

**Time: 1 minute**

---

### Workflow 5: Add New Channel

```
1. Go to: "Channels" tab
2. Enter: Channel ID (@mychannel or -1001234567890)
3. Enter: Display name (My Channel)
4. Click: "Add Channel"
5. Result: Channel added to your list! ✅
```

**Time: 1 minute**

---

## 🐛 Troubleshooting

### Problem: "Server Not Connected"

```
❌ Error message appears at top
   "Backend Server Not Connected"

✅ Solution:
   1. Open terminal
   2. Run: npm start
   3. Wait for: "running on port 3000"
   4. Refresh browser (Ctrl+R)
```

---

### Problem: "Channel not found"

```
❌ Error: "Chat not found"

✅ Solution:
   1. Check channel ID format:
      - Public: @channelname
      - Private: -1001234567890
   2. Make sure bot is admin in channel
   3. Try exact channel ID
```

---

### Problem: "Please select a channel"

```
❌ Error: "Please select a channel"

✅ Solution:
   1. Go to "Channels" tab
   2. Add your channel first
   3. Then go to "Post Message"
   4. Select the channel from dropdown
```

---

### Problem: Dashboard won't load

```
❌ Blank page or error

✅ Solution:
   1. Make sure npm start is running
   2. Check: http://localhost:3000/api/health
   3. Refresh browser (Ctrl+Shift+R)
   4. Clear browser cache
   5. Try different browser
```

---

## 💡 Pro Tips

### Tip 1: Use Scheduling
- Schedule posts in advance
- Posts happen automatically
- No need to stay online

### Tip 2: Combine Features
- Spoiler + Silent = Surprise messages
- Broadcast + Schedule = Automated newsletters

### Tip 3: HTML Formatting
```html
<b>Attention!</b> This is <i>important</i>
Visit: <a href="https://example.com">our website</a>
```

### Tip 4: Test First
- Post test message first
- Make sure formatting looks good
- Then schedule production messages

### Tip 5: Keep Server Running
- Deploy to cloud for 24/7
- Or keep laptop on for scheduled posts
- Check server status at top

---

## ✨ Keyboard Shortcuts

```
Ctrl+R or Cmd+R    Refresh page
Ctrl+Shift+R       Hard refresh (clear cache)
Tab                Next field
Enter              Submit form
Esc                Close dialog
```

---

## 🎓 Learning Path

**Day 1:** Post your first message (5 minutes)
**Day 2:** Schedule a message (5 minutes)
**Day 3:** Broadcast to multiple channels (5 minutes)
**Day 4:** Create spoiler messages (2 minutes)
**Day 5:** Automate your workflow (ongoing)

---

**You're ready!** Start posting now! 🚀
