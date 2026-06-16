require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cron = require('node-cron');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const https = require('https');
const FormData = require('form-data');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram');
const { CustomFile } = require('telegram/client/uploads');
const { _parseMessageText } = require('telegram/client/messageParse');
const { ApifyClient } = require('apify-client');

// Bot configuration (fallback)
const token = process.env.BOT_TOKEN;
if (!token) {
    console.error('❌ Missing BOT_TOKEN environment variable. Set it in your .env file or environment.');
    process.exit(1);
}
const bot = new TelegramBot(token, { polling: false });

// ============================================
// USER ACCOUNT (GramJS) SETUP
// ============================================
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const SESSION_FILE = path.join(DATA_DIR, '.telegram-session');
const CONFIG_FILE  = path.join(DATA_DIR, '.telegram-config.json');

let savedConfig  = {};
let savedSession = '';
try { if (fs.existsSync(CONFIG_FILE)) savedConfig  = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) {}
try { if (fs.existsSync(SESSION_FILE)) savedSession = fs.readFileSync(SESSION_FILE, 'utf8').trim();    } catch (e) {}

let userClient           = null;
let isUserAuthenticated  = false;
let authPending          = { phone: null, phoneCodeHash: null };

async function initUserClient(apiId, apiHash) {
    try {
        if (userClient) { try { await userClient.disconnect(); } catch (_) {} }
        userClient = new TelegramClient(
            new StringSession(savedSession),
            parseInt(apiId),
            apiHash,
            { connectionRetries: 3 }
        );
        await userClient.connect();
        isUserAuthenticated = await userClient.isUserAuthorized();
        return isUserAuthenticated;
    } catch (err) {
        console.error('User client init failed:', err.message);
        return false;
    }
}

// Restore session on startup and warm the entity cache
if (savedConfig.apiId && savedConfig.apiHash && savedSession) {
    setTimeout(() => {
        initUserClient(savedConfig.apiId, savedConfig.apiHash)
            .then(async ok => {
                if (!ok) return;
                console.log('✅ Telegram user session restored');
                try {
                    await userClient.getDialogs({ limit: 200 });
                    console.log('✅ Entity cache warmed');
                } catch (_) {}
            })
            .catch(() => {});
    }, 1500);
}

// ── Resolve a group/channel entity robustly ──────────────────────────────
// GramJS needs entities in its cache to resolve numeric IDs.
// If the first attempt fails, we refresh the dialog cache and retry.
// Invite-link hashes (+XxxXxx) are detected early and rejected with guidance.
async function resolveWatchEntity(channelId) {
    const id = (channelId || '').trim();

    // Detect private invite-link hashes like +3Qr-2fck5GozMDVl
    if (/^\+[A-Za-z0-9_\-]{5,}$/.test(id) && !/^\+\d{7,15}$/.test(id)) {
        throw new Error(
            `"${id}" is a Telegram invite-link hash — not a usable group ID.\n` +
            `Fix: in Bot Manager → Account tab, log in so groups load automatically with correct IDs (e.g. -1001234567890 or @groupname). ` +
            `Then re-add the group in the Channels tab using that numeric ID.`
        );
    }

    // First try — works if entity is already in GramJS cache
    try { return await userClient.getInputEntity(id); } catch (_) {}

    // Cache miss — refresh dialogs to repopulate, then retry
    console.log(`[watch] entity cache miss for "${id}", refreshing dialogs…`);
    try { await userClient.getDialogs({ limit: 200 }); } catch (_) {}
    return await userClient.getInputEntity(id);
}

// ============================================
// PAID MEDIA HELPER (Bot API fallback)
// ============================================
function sendPaidMediaViaBot(channelId, buffer, mimeType, ext, caption, starsCount, sendWithoutSound) {
    const isPhoto = mimeType.startsWith('image/');
    const mediaType = isPhoto ? 'photo' : 'video';

    return new Promise((resolve, reject) => {
        const form = new FormData();
        form.append('chat_id', String(channelId));
        form.append('star_count', String(starsCount));
        form.append('media', JSON.stringify([{ type: mediaType, media: 'attach://upload' }]));
        form.append('upload', buffer, { filename: `file.${ext}`, contentType: mimeType, knownLength: buffer.length });
        if (caption) { form.append('caption', caption); form.append('parse_mode', 'HTML'); }
        if (sendWithoutSound) form.append('disable_notification', 'true');

        form.getLength((err, length) => {
            if (err) return reject(err);

            const req = https.request({
                hostname: 'api.telegram.org',
                path: `/bot${token}/sendPaidMedia`,
                method: 'POST',
                headers: { ...form.getHeaders(), 'Content-Length': length },
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.ok) resolve(parsed.result);
                        else reject(new Error(parsed.description || JSON.stringify(parsed)));
                    } catch (e) { reject(new Error(data)); }
                });
            });
            req.on('error', reject);
            form.pipe(req);
        });
    });
}

function sendPaidMediaAlbumViaBot(channelId, buffers, mimeTypes, caption, starsCount, sendWithoutSound) {
    return new Promise((resolve, reject) => {
        const form = new FormData();
        form.append('chat_id', String(channelId));
        form.append('star_count', String(starsCount));

        const mediaJson = buffers.map((_, idx) => ({
            type: mimeTypes[idx].startsWith('image/') ? 'photo' : 'video',
            media: `attach://file${idx}`,
        }));
        form.append('media', JSON.stringify(mediaJson));

        if (caption) { form.append('caption', caption); form.append('parse_mode', 'HTML'); }
        if (sendWithoutSound) form.append('disable_notification', 'true');

        buffers.forEach((buf, idx) => {
            const ext = mimeTypes[idx].split('/')[1] || 'jpg';
            form.append(`file${idx}`, buf, { filename: `file${idx}.${ext}`, contentType: mimeTypes[idx], knownLength: buf.length });
        });

        form.getLength((err, length) => {
            if (err) return reject(err);

            const req = https.request({
                hostname: 'api.telegram.org',
                path: `/bot${token}/sendPaidMedia`,
                method: 'POST',
                headers: { ...form.getHeaders(), 'Content-Length': length },
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.ok) resolve(parsed.result);
                        else reject(new Error(parsed.description || JSON.stringify(parsed)));
                    } catch (e) { reject(new Error(data)); }
                });
            });
            req.on('error', reject);
            form.pipe(req);
        });
    });
}

// Express app setup
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'telegram-bot-dashboard.html'));
});

// Persistent storage for scheduled messages
const SCHEDULED_FILE = path.join(DATA_DIR, '.scheduled-messages.json');
let scheduledMessages = [];
try {
    if (fs.existsSync(SCHEDULED_FILE)) {
        const raw = JSON.parse(fs.readFileSync(SCHEDULED_FILE, 'utf8'));
        const now = Date.now();
        scheduledMessages = raw.filter(m => new Date(m.scheduledTime).getTime() > now);
    }
} catch (e) {}

function saveScheduledMessages() {
    try { fs.writeFileSync(SCHEDULED_FILE, JSON.stringify(scheduledMessages, null, 2)); } catch (e) {}
}

const channelList = [];

// ============================================
// GET ALL CHANNELS
// ============================================
app.get('/api/channels', (req, res) => {
  res.json(channelList);
});

// ============================================
// POST MESSAGE TO CHANNEL
// ============================================
app.post('/api/post', async (req, res) => {
  const { 
    channelId, 
    content, 
    hideWithSpoiler, 
    makeContentPaid, 
    sendWithoutSound,
    scheduledTime 
  } = req.body;

  try {
    if (!channelId || !content) {
      return res.status(400).json({ error: 'Channel ID and content are required' });
    }

    const messageOptions = {
      parse_mode: 'HTML',
      disable_notification: sendWithoutSound || false,
    };

    // If spoiler is enabled, wrap content in spoiler tags
    let finalContent = content;
    if (hideWithSpoiler) {
      finalContent = `<tg-spoiler>${content}</tg-spoiler>`;
    }

    // If schedule is set
    if (scheduledTime) {
      const scheduleTime = new Date(scheduledTime);
      const scheduleTs = Math.floor(scheduleTime.getTime() / 1000);

      if (scheduleTs <= Math.floor(Date.now() / 1000)) {
        return res.status(400).json({ error: 'Scheduled time must be in the future' });
      }

      let telegramMsgId = null;
      if (isUserAuthenticated && userClient) {
        const msg = await userClient.sendMessage(channelId, {
          message: finalContent,
          parseMode: 'html',
          silent: messageOptions.disable_notification,
          schedule: scheduleTs,
        });
        telegramMsgId = msg?.id || null;
      } else {
        const delay = scheduleTime.getTime() - Date.now();
        const recordId = Date.now();
        setTimeout(async () => {
          try {
            await bot.sendMessage(channelId, finalContent, messageOptions);
          } catch (error) {
            console.error('Error sending scheduled message:', error);
          }
          const idx = scheduledMessages.findIndex(m => m.id === recordId);
          if (idx !== -1) { scheduledMessages.splice(idx, 1); saveScheduledMessages(); }
        }, delay);
        const messageRecord = { id: recordId, type: 'text', channelId, content: finalContent, scheduledTime, telegramMsgId };
        scheduledMessages.push(messageRecord);
        saveScheduledMessages();
        return res.json({ success: true, message: 'Message scheduled successfully', scheduledFor: scheduledTime });
      }

      const messageRecord = {
        id: Date.now(),
        type: 'text',
        channelId,
        content: finalContent,
        scheduledTime,
        telegramMsgId,
      };
      scheduledMessages.push(messageRecord);
      saveScheduledMessages();

      return res.json({ success: true, message: 'Message scheduled successfully', scheduledFor: scheduledTime });
    }

    // Send message immediately
    if (isUserAuthenticated && userClient) {
      await userClient.sendMessage(channelId, { message: finalContent, parseMode: 'html', silent: messageOptions.disable_notification });
    } else {
      await bot.sendMessage(channelId, finalContent, messageOptions);
    }

    res.json({ success: true, sentAt: new Date() });

  } catch (error) {
    console.error('Error posting message:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET SCHEDULED MESSAGES
// ============================================
app.get('/api/scheduled', (req, res) => {
  res.json(scheduledMessages);
});

// ============================================
// DELETE SCHEDULED MESSAGE
// ============================================
app.delete('/api/scheduled/:id', async (req, res) => {
  const { id } = req.params;
  const index = scheduledMessages.findIndex(msg => msg.id === parseInt(id));

  if (index === -1) {
    return res.status(404).json({ error: 'Scheduled message not found' });
  }

  const msg = scheduledMessages[index];

  // Try to cancel on Telegram side
  if (isUserAuthenticated && userClient && msg.telegramMsgId) {
    try {
      const peer = await userClient.getInputEntity(msg.channelId);
      await userClient.invoke(new Api.messages.DeleteScheduledMessages({ peer, id: [msg.telegramMsgId] }));
    } catch (_) {}
  }

  scheduledMessages.splice(index, 1);
  saveScheduledMessages();
  res.json({ success: true, message: 'Scheduled message deleted' });
});

// ============================================
// ADD CHANNEL
// ============================================
app.post('/api/channels', (req, res) => {
  const { channelId, channelName, channelType } = req.body;

  if (!channelId || !channelName) {
    return res.status(400).json({ error: 'Channel ID and name are required' });
  }

  const exists = channelList.find(ch => ch.channelId === channelId);
  if (exists) {
    return res.status(400).json({ error: 'Channel already exists' });
  }

  const newChannel = {
    id: Date.now(),
    channelId,
    channelName,
    channelType: channelType || 'channel',
    addedAt: new Date(),
  };

  channelList.push(newChannel);
  res.json({ success: true, channel: newChannel });
});

// ============================================
// DELETE CHANNEL
// ============================================
app.delete('/api/channels/:id', (req, res) => {
  const { id } = req.params;
  const index = channelList.findIndex(ch => ch.id === parseInt(id));

  if (index === -1) {
    return res.status(404).json({ error: 'Channel not found' });
  }

  channelList.splice(index, 1);
  res.json({ success: true, message: 'Channel deleted' });
});

// ============================================
// SEND MESSAGE TO MULTIPLE CHANNELS
// ============================================
app.post('/api/broadcast', async (req, res) => {
  const {
    channelIds,
    content,
    hideWithSpoiler,
    makeContentPaid,
    sendWithoutSound,
    scheduledTime
  } = req.body;

  if (!channelIds || channelIds.length === 0 || !content) {
    return res.status(400).json({ error: 'Channels and content are required' });
  }

  const messageOptions = {
    parse_mode: 'HTML',
    disable_notification: sendWithoutSound || false,
  };

  let finalContent = content;
  if (hideWithSpoiler) {
    finalContent = `<tg-spoiler>${content}</tg-spoiler>`;
  }

  let scheduleTs;
  if (scheduledTime) {
    scheduleTs = Math.floor(new Date(scheduledTime).getTime() / 1000);
    if (scheduleTs <= Math.floor(Date.now() / 1000)) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }
  }

  const results = [];

  for (const channelId of channelIds) {
    try {
      if (isUserAuthenticated && userClient) {
        const msg = await userClient.sendMessage(channelId, {
          message: finalContent, parseMode: 'html',
          silent: messageOptions.disable_notification,
          schedule: scheduleTs,
        });
        if (scheduleTs) {
          scheduledMessages.push({ id: Date.now() + Math.random(), type: 'text', channelId, content: finalContent, scheduledTime, telegramMsgId: msg?.id || null });
        }
      } else {
        if (scheduleTs) {
          const delay = new Date(scheduledTime).getTime() - Date.now();
          const recordId = Date.now() + Math.random();
          setTimeout(async () => {
            try { await bot.sendMessage(channelId, finalContent, messageOptions); } catch (e) { console.error(e); }
            const idx = scheduledMessages.findIndex(m => m.id === recordId);
            if (idx !== -1) { scheduledMessages.splice(idx, 1); saveScheduledMessages(); }
          }, delay);
          scheduledMessages.push({ id: recordId, type: 'text', channelId, content: finalContent, scheduledTime, telegramMsgId: null });
        } else {
          await bot.sendMessage(channelId, finalContent, messageOptions);
        }
      }
      results.push({ channelId, success: true });
    } catch (error) {
      results.push({ channelId, success: false, error: error.message });
    }
  }

  if (scheduleTs) saveScheduledMessages();

  res.json({ success: true, results, scheduled: !!scheduleTs });
});

// ============================================
// POST PHOTO TO CHANNEL
// ============================================
app.post('/api/post-photo', async (req, res) => {
  const { channelId, base64, mimeType, caption, sendWithoutSound, hideWithSpoiler, scheduledTime, forceDocument, makeContentPaid, starsCount } = req.body;

  if (!channelId || !base64) {
    return res.status(400).json({ error: 'Channel ID and photo are required' });
  }

  try {
    const buffer = Buffer.from(base64, 'base64');
    const ext = (mimeType || 'image/jpeg').split('/')[1] || 'jpg';
    const scheduleTs = scheduledTime ? Math.floor(new Date(scheduledTime).getTime() / 1000) : undefined;
    if (scheduleTs && scheduleTs <= Math.floor(Date.now() / 1000)) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }

    if (makeContentPaid && starsCount > 0) {
      // ── Paid media path ──
      if (isUserAuthenticated && userClient) {
        const cf = new CustomFile(`photo.${ext}`, buffer.length, '', buffer);
        const inputFile = await userClient.uploadFile({ file: cf, workers: 1 });
        const peer = await userClient.getInputEntity(channelId);
        const [parsedCaption, captionEntities] = caption ? await _parseMessageText(userClient, caption, 'html') : ['', []];
        const result = await userClient.invoke(new Api.messages.SendMedia({
          peer,
          media: new Api.InputMediaPaidMedia({
            starsAmount: BigInt(starsCount),
            extendedMedia: [new Api.InputMediaUploadedPhoto({ file: inputFile })],
          }),
          message: parsedCaption || '',
          entities: captionEntities.length ? captionEntities : undefined,
          randomId: BigInt(Math.floor(Math.random() * 1e15)),
          silent: sendWithoutSound || false,
          ...(scheduleTs ? { scheduleDate: scheduleTs } : {}),
        }));
        if (scheduleTs) {
          let paidMsgId = null;
          if (result?.updates) {
            for (const upd of result.updates) {
              if (upd.className === 'UpdateNewScheduledMessage') { paidMsgId = upd.message?.id; break; }
            }
          }
          scheduledMessages.push({ id: Date.now(), type: 'photo', channelId, content: caption || '', scheduledTime: new Date(scheduleTs * 1000).toISOString(), telegramMsgId: paidMsgId });
          saveScheduledMessages();
        }
      } else {
        await sendPaidMediaViaBot(channelId, buffer, mimeType || 'image/jpeg', ext, caption, starsCount, sendWithoutSound);
      }
    } else {
      // ── Regular photo path ──
      if (isUserAuthenticated && userClient) {
        const cf = new CustomFile(`photo.${ext}`, buffer.length, '', buffer);
        let telegramMsgId = null;

        if (!forceDocument && (scheduleTs || hideWithSpoiler)) {
          // Use messages.SendMedia directly — reliable for scheduling and spoiler
          const inputFile = await userClient.uploadFile({ file: cf, workers: 1 });
          const peer = await userClient.getInputEntity(channelId);
          const [parsedCaption, captionEntities] = caption ? await _parseMessageText(userClient, caption, 'html') : ['', []];
          const mediaPhoto = hideWithSpoiler
            ? new Api.InputMediaUploadedPhoto({ file: inputFile, spoiler: true })
            : new Api.InputMediaUploadedPhoto({ file: inputFile });
          const result = await userClient.invoke(new Api.messages.SendMedia({
            peer,
            media: mediaPhoto,
            message: parsedCaption || '',
            entities: captionEntities.length ? captionEntities : undefined,
            randomId: BigInt(Math.floor(Math.random() * 1e15)),
            silent: sendWithoutSound || false,
            ...(scheduleTs ? { scheduleDate: scheduleTs } : {}),
          }));
          if (scheduleTs && result?.updates) {
            for (const upd of result.updates) {
              if (upd.className === 'UpdateNewScheduledMessage') { telegramMsgId = upd.message?.id; break; }
            }
          }
        } else {
          // sendFile for immediate non-spoiler photos (or forceDocument)
          await userClient.sendFile(channelId, {
            file: cf, caption: caption || undefined, parseMode: 'html',
            silent: sendWithoutSound || false,
            forceDocument: forceDocument || false,
          });
        }

        if (scheduleTs) {
          scheduledMessages.push({ id: Date.now(), type: 'photo', channelId, content: caption || '', scheduledTime: new Date(scheduleTs * 1000).toISOString(), telegramMsgId });
          saveScheduledMessages();
        }
      } else {
        // ── Bot fallback ──
        const opts = { parse_mode: 'HTML', disable_notification: sendWithoutSound || false };
        if (caption) opts.caption = caption;
        if (hideWithSpoiler) opts.has_spoiler = true;
        if (scheduleTs) {
          const delay = new Date(scheduledTime).getTime() - Date.now();
          const recordId = Date.now() + Math.random();
          setTimeout(async () => {
            try { await bot.sendPhoto(channelId, buffer, opts, { filename: `photo.${ext}`, contentType: mimeType || 'image/jpeg' }); } catch (e) { console.error(e); }
            const idx = scheduledMessages.findIndex(m => m.id === recordId);
            if (idx !== -1) { scheduledMessages.splice(idx, 1); saveScheduledMessages(); }
          }, delay);
          scheduledMessages.push({ id: recordId, type: 'photo', channelId, content: caption || '', scheduledTime: new Date(scheduleTs * 1000).toISOString(), telegramMsgId: null });
          saveScheduledMessages();
        } else {
          await bot.sendPhoto(channelId, buffer, opts, { filename: `photo.${ext}`, contentType: mimeType || 'image/jpeg' });
        }
      }
    }

    res.json({ success: true, scheduled: !!scheduleTs });
  } catch (error) {
    console.error('Error posting photo:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// POST VIDEO TO CHANNEL
// ============================================
app.post('/api/post-video', async (req, res) => {
  const { channelId, base64, mimeType, caption, sendWithoutSound, hideWithSpoiler, scheduledTime, forceDocument, makeContentPaid, starsCount } = req.body;

  if (!channelId || !base64) {
    return res.status(400).json({ error: 'Channel ID and video are required' });
  }

  try {
    const buffer = Buffer.from(base64, 'base64');
    const ext = (mimeType || 'video/mp4').split('/')[1] || 'mp4';
    const scheduleTs = scheduledTime ? Math.floor(new Date(scheduledTime).getTime() / 1000) : undefined;
    if (scheduleTs && scheduleTs <= Math.floor(Date.now() / 1000)) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }

    if (makeContentPaid && starsCount > 0) {
      // ── Paid media path ──
      if (isUserAuthenticated && userClient) {
        const cf = new CustomFile(`video.${ext}`, buffer.length, '', buffer);
        const inputFile = await userClient.uploadFile({ file: cf, workers: 1 });
        const peer = await userClient.getInputEntity(channelId);
        const [parsedCaption, captionEntities] = caption ? await _parseMessageText(userClient, caption, 'html') : ['', []];
        await userClient.invoke(new Api.messages.SendMedia({
          peer,
          media: new Api.InputMediaPaidMedia({
            starsAmount: BigInt(starsCount),
            extendedMedia: [new Api.InputMediaUploadedDocument({
              file: inputFile,
              mimeType: mimeType || 'video/mp4',
              attributes: [
                new Api.DocumentAttributeVideo({ duration: 0, w: 0, h: 0, supportsStreaming: true }),
                new Api.DocumentAttributeFilename({ fileName: `video.${ext}` }),
              ],
            })],
          }),
          message: parsedCaption || '',
          entities: captionEntities.length ? captionEntities : undefined,
          randomId: BigInt(Math.floor(Math.random() * 1e15)),
          silent: sendWithoutSound || false,
        }));
      } else {
        await sendPaidMediaViaBot(channelId, buffer, mimeType || 'video/mp4', ext, caption, starsCount, sendWithoutSound);
      }
    } else {
      // ── Regular video path ──
      if (isUserAuthenticated && userClient) {
        const cf = new CustomFile(`video.${ext}`, buffer.length, '', buffer);
        let telegramMsgId = null;
        if (hideWithSpoiler) {
          const inputFile = await userClient.uploadFile({ file: cf, workers: 1 });
          const peer = await userClient.getInputEntity(channelId);
          const [parsedCaption, captionEntities] = caption ? await _parseMessageText(userClient, caption, 'html') : ['', []];
          const mediaAttrs = forceDocument
            ? [new Api.DocumentAttributeFilename({ fileName: `video.${ext}` })]
            : [new Api.DocumentAttributeVideo({ duration: 0, w: 0, h: 0, supportsStreaming: true }), new Api.DocumentAttributeFilename({ fileName: `video.${ext}` })];
          const result = await userClient.invoke(new Api.messages.SendMedia({
            peer,
            media: new Api.InputMediaUploadedDocument({
              file: inputFile,
              mimeType: mimeType || 'video/mp4',
              attributes: mediaAttrs,
              spoiler: true,
            }),
            message: parsedCaption || '',
            entities: captionEntities.length ? captionEntities : undefined,
            randomId: BigInt(Math.floor(Math.random() * 1e15)),
            silent: sendWithoutSound || false,
            scheduleDate: scheduleTs,
          }));
          if (scheduleTs && result?.updates) {
            for (const upd of result.updates) {
              if (upd.className === 'UpdateNewScheduledMessage') { telegramMsgId = upd.message?.id; break; }
            }
          }
        } else {
          const sentMsg = await userClient.sendFile(channelId, {
            file: cf, caption: caption || undefined, parseMode: 'html',
            silent: sendWithoutSound || false,
            forceDocument: forceDocument || false, isVideo: !forceDocument,
            supportsStreaming: !forceDocument, schedule: scheduleTs,
            attributes: forceDocument ? [] : [new Api.DocumentAttributeVideo({ duration: 0, w: 0, h: 0, supportsStreaming: true })],
          });
          if (scheduleTs) telegramMsgId = sentMsg?.id || null;
        }
        if (scheduleTs) {
          scheduledMessages.push({ id: Date.now(), type: 'video', channelId, content: caption || '', scheduledTime: new Date(scheduleTs * 1000).toISOString(), telegramMsgId });
          saveScheduledMessages();
        }
      } else {
        const opts = { parse_mode: 'HTML', disable_notification: sendWithoutSound || false };
        if (caption) opts.caption = caption;
        if (hideWithSpoiler) opts.has_spoiler = true;
        await bot.sendVideo(channelId, buffer, opts, { filename: `video.${ext}`, contentType: mimeType || 'video/mp4' });
      }
    }

    res.json({ success: true, scheduled: !!scheduleTs });
  } catch (error) {
    console.error('Error posting video:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// POST MEDIA GROUP (up to 4 photos as album)
// ============================================
app.post('/api/post-media-group', async (req, res) => {
  const { channelId, photos, caption, sendWithoutSound, scheduledTime, makeContentPaid, starsCount } = req.body;

  if (!channelId || !Array.isArray(photos) || photos.length === 0) {
    return res.status(400).json({ error: 'Channel ID and photos array required' });
  }

  const clamped = photos.slice(0, 3);

  try {
    const scheduleTs = scheduledTime ? Math.floor(new Date(scheduledTime).getTime() / 1000) : undefined;
    if (scheduleTs && scheduleTs <= Math.floor(Date.now() / 1000)) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }

    const buffers   = clamped.map(p => Buffer.from(p.base64, 'base64'));
    const mimeTypes = clamped.map(p => p.mimeType || 'image/jpeg');

    if (makeContentPaid && starsCount > 0) {
      // ── Paid album: Bot API sendPaidMedia (MTProto EXTENDED_MEDIA_INVALID for multi-photo) ──
      await sendPaidMediaAlbumViaBot(channelId, buffers, mimeTypes, caption, starsCount, sendWithoutSound);
      // Note: Bot API does not support scheduling for paid media
    } else if (isUserAuthenticated && userClient) {
      // ── Free album via MTProto SendMultiMedia ──
      const peer = await userClient.getInputEntity(channelId);

      let parsedCaption = caption || '';
      let captionEntities = [];
      if (caption) {
        [parsedCaption, captionEntities] = await _parseMessageText(userClient, caption, 'html');
      }

      const uploadedFiles = [];
      for (let idx = 0; idx < clamped.length; idx++) {
        const ext = mimeTypes[idx].split('/')[1] || 'jpg';
        const cf = new CustomFile(`photo_${idx}.${ext}`, buffers[idx].length, '', buffers[idx]);
        uploadedFiles.push(await userClient.uploadFile({ file: cf, workers: 1 }));
      }

      const multiMedia = uploadedFiles.map((inputFile, idx) => new Api.InputSingleMedia({
        media: new Api.InputMediaUploadedPhoto({ file: inputFile }),
        randomId: BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)),
        message: idx === 0 ? parsedCaption : '',
        entities: idx === 0 && captionEntities.length ? captionEntities : undefined,
      }));

      await userClient.invoke(new Api.messages.SendMultiMedia({
        peer,
        multiMedia,
        silent: sendWithoutSound || false,
        ...(scheduleTs ? { scheduleDate: scheduleTs } : {}),
      }));

      if (scheduleTs) {
        scheduledMessages.push({ id: Date.now(), type: 'photo', channelId, content: caption || '', scheduledTime: new Date(scheduleTs * 1000).toISOString() });
        saveScheduledMessages();
      }
    } else {
      // ── Bot fallback: free album via sendMediaGroup ──
      const mediaArray = buffers.map((buf, idx) => {
        const item = { type: 'photo', media: buf };
        if (idx === 0 && caption) { item.caption = caption; item.parse_mode = 'HTML'; }
        return item;
      });

      const opts = { disable_notification: sendWithoutSound || false };

      if (scheduleTs) {
        const delay = new Date(scheduledTime).getTime() - Date.now();
        const recordId = Date.now() + Math.random();
        setTimeout(async () => {
          try { await bot.sendMediaGroup(channelId, mediaArray, opts); } catch (e) { console.error(e); }
          const i = scheduledMessages.findIndex(m => m.id === recordId);
          if (i !== -1) { scheduledMessages.splice(i, 1); saveScheduledMessages(); }
        }, delay);
        scheduledMessages.push({ id: recordId, type: 'photo', channelId, content: caption || '', scheduledTime: new Date(scheduleTs * 1000).toISOString() });
        saveScheduledMessages();
      } else {
        await bot.sendMediaGroup(channelId, mediaArray, opts);
      }
    }

    res.json({ success: true, scheduled: !!scheduleTs });
  } catch (error) {
    console.error('Error posting media group:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AUTH: STATUS
// ============================================
app.get('/api/auth/status', async (req, res) => {
    if (isUserAuthenticated && userClient) {
        try {
            const me = await userClient.getMe();
            return res.json({ authenticated: true, user: { firstName: me.firstName, lastName: me.lastName || '', username: me.username || '' } });
        } catch (_) {}
    }
    // Try restoring from saved config
    if (!isUserAuthenticated && savedConfig.apiId && savedConfig.apiHash && savedSession) {
        try {
            const ok = await initUserClient(savedConfig.apiId, savedConfig.apiHash);
            if (ok) {
                const me = await userClient.getMe();
                return res.json({ authenticated: true, user: { firstName: me.firstName, lastName: me.lastName || '', username: me.username || '' } });
            }
        } catch (_) {}
    }
    res.json({ authenticated: false });
});

// ============================================
// AUTH: CONNECT (set API ID + Hash)
// ============================================
app.post('/api/auth/connect', async (req, res) => {
    const { apiId, apiHash } = req.body;
    if (!apiId || !apiHash) return res.status(400).json({ error: 'API ID and API Hash required' });

    try {
        savedConfig = { apiId, apiHash };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(savedConfig));

        const authed = await initUserClient(apiId, apiHash);
        if (authed) {
            const me = await userClient.getMe();
            return res.json({ success: true, authenticated: true, user: { firstName: me.firstName, lastName: me.lastName || '', username: me.username || '' } });
        }
        res.json({ success: true, authenticated: false, needsPhone: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// AUTH: SEND CODE
// ============================================
app.post('/api/auth/send-code', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });
    if (!userClient) return res.status(400).json({ error: 'Call /api/auth/connect first' });

    try {
        const result = await userClient.invoke(new Api.auth.SendCode({
            phoneNumber: phone,
            apiId: parseInt(savedConfig.apiId),
            apiHash: savedConfig.apiHash,
            settings: new Api.CodeSettings({}),
        }));
        authPending.phone = phone;
        authPending.phoneCodeHash = result.phoneCodeHash;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// AUTH: VERIFY CODE
// ============================================
app.post('/api/auth/verify-code', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code required' });
    if (!authPending.phone || !authPending.phoneCodeHash) return res.status(400).json({ error: 'Send code first' });

    try {
        await userClient.invoke(new Api.auth.SignIn({
            phoneNumber: authPending.phone,
            phoneCodeHash: authPending.phoneCodeHash,
            phoneCode: String(code),
        }));

        const session = userClient.session.save();
        savedSession = session;
        fs.writeFileSync(SESSION_FILE, session);
        isUserAuthenticated = true;

        const me = await userClient.getMe();
        res.json({ success: true, authenticated: true, user: { firstName: me.firstName, lastName: me.lastName || '', username: me.username || '' } });
    } catch (err) {
        if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
            return res.json({ success: true, needs2FA: true });
        }
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// AUTH: VERIFY 2FA
// ============================================
app.post('/api/auth/verify-2fa', async (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });

    try {
        const { computeCheck } = require('telegram/Password');
        const passwordInfo = await userClient.invoke(new Api.account.GetPassword());
        const passwordSrp  = await computeCheck(passwordInfo, password);
        await userClient.invoke(new Api.auth.CheckPassword({ password: passwordSrp }));

        const session = userClient.session.save();
        savedSession = session;
        fs.writeFileSync(SESSION_FILE, session);
        isUserAuthenticated = true;

        const me = await userClient.getMe();
        res.json({ success: true, authenticated: true, user: { firstName: me.firstName, lastName: me.lastName || '', username: me.username || '' } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// AUTH: FETCH MY CHANNELS
// ============================================
app.get('/api/auth/my-channels', async (req, res) => {
    if (!isUserAuthenticated || !userClient) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const dialogs = await userClient.getDialogs({ limit: 200 });
        const channels = dialogs
            .filter(d => d.isChannel || d.isGroup)
            .map(d => {
                // Use the numeric entity ID so GramJS can always resolve it from its cache
                const rawId = d.entity.id.toString();
                let channelId;
                if (d.entity.username) {
                    // Public groups/channels — @username is self-resolving
                    channelId = `@${d.entity.username}`;
                } else if (d.isChannel) {
                    // Supergroups and broadcast channels — must use -100<id>
                    channelId = `-100${rawId}`;
                } else {
                    // Legacy regular groups (non-supergroup) — use -<id>
                    channelId = `-${rawId}`;
                }
                const channelType = (d.isChannel && d.entity.broadcast) ? 'channel' : 'group';
                return {
                    channelId,
                    channelName: d.title || d.entity.title || 'Unknown',
                    isCreator: !!d.entity.creator,
                    isBroadcast: !!d.entity.broadcast,
                    channelType,
                };
            });
        res.json(channels);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// AUTH: LOGOUT
// ============================================
app.post('/api/auth/logout', async (req, res) => {
    try {
        if (userClient && isUserAuthenticated) {
            await userClient.invoke(new Api.auth.LogOut());
        }
    } catch (_) {}

    savedSession = '';
    isUserAuthenticated = false;
    try { if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE); } catch (_) {}

    res.json({ success: true });
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'Bot is running' });
});

// ============================================
// INSTAGRAM DOWNLOADER
// ============================================

function igHttpsGet(url, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const opts = {
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                ...extraHeaders,
            }
        };
        const req = https.request(opts, (res) => {
            if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
                return igHttpsGet(res.headers.location, extraHeaders).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.end();
    });
}

function igDownloadBinary(url, destPath) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const opts = {
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        };
        const req = https.request(opts, (res) => {
            if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
                return igDownloadBinary(res.headers.location, destPath).then(resolve).catch(reject);
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => { fs.writeFileSync(destPath, Buffer.concat(chunks)); resolve(); });
        });
        req.on('error', reject);
        req.end();
    });
}

function igDecodeHtml(str) {
    return str
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

async function igFetchSinglePost(postUrl, extraHeaders = {}) {
    const resp = await igHttpsGet(postUrl, extraHeaders);
    const html = resp.body;

    // Try JSON-LD first
    const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (ldMatch) {
        try {
            const ld = JSON.parse(ldMatch[1]);
            const img = ld.image?.[0] || ld.image || ld.thumbnailUrl;
            const caption = ld.caption || ld.articleBody || '';
            if (img) return { imageUrl: img, caption: igDecodeHtml(caption) };
        } catch (_) {}
    }

    // Try embedded JSON data blob
    const jsonMatch = html.match(/"display_url":"([^"]+)"/);
    const captionMatch2 = html.match(/"edge_media_to_caption":\{"edges":\[\{"node":\{"text":"([^"]+)"/);
    if (jsonMatch) {
        return {
            imageUrl: jsonMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, ''),
            caption: captionMatch2 ? igDecodeHtml(captionMatch2[1].replace(/\\n/g, '\n')) : '',
        };
    }

    // Fall back to og meta tags
    const imgMatch  = html.match(/<meta property="og:image" content="([^"]+)"/);
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    if (!imgMatch) throw new Error('Image not found — post may be private or login required');

    let caption = descMatch ? igDecodeHtml(descMatch[1]) : '';
    const colonIdx = caption.indexOf(': ');
    if (colonIdx !== -1) caption = caption.slice(colonIdx + 2);

    return { imageUrl: igDecodeHtml(imgMatch[1]), caption };
}

async function igFetchProfilePosts(profileUrl, limit, extraHeaders = {}) {
    const resp = await igHttpsGet(profileUrl, extraHeaders);
    const html = resp.body;

    // Extract shortcodes from multiple HTML patterns
    const found = new Set();
    for (const m of html.matchAll(/\/p\/([A-Za-z0-9_-]{6,})\//g)) found.add(m[1]);
    for (const m of html.matchAll(/\/reel\/([A-Za-z0-9_-]{6,})\//g)) found.add(m[1]);
    for (const m of html.matchAll(/"shortcode":"([A-Za-z0-9_-]{6,})"/g)) found.add(m[1]);
    for (const m of html.matchAll(/"code":"([A-Za-z0-9_-]{6,})"/g)) found.add(m[1]);

    if (found.size === 0) {
        throw new Error('No posts found — Instagram blocked the request.\n\nTry: 📋 URL List (paste post links) or 🍪 Profile + Cookie (use your session cookie).');
    }

    const codes = [...found].slice(0, limit);
    const posts = [];
    for (const sc of codes) {
        try {
            const post = await igFetchSinglePost(`https://www.instagram.com/p/${sc}/`, extraHeaders);
            posts.push(post);
            await new Promise(r => setTimeout(r, 600));
        } catch (_) {}
    }
    if (posts.length === 0) throw new Error('Could not download posts. Try 🍪 Profile + Cookie mode.');
    return posts;
}

// ── Apify token save/load ──
app.post('/api/settings/apify-token', (req, res) => {
    const { apifyToken } = req.body;
    if (!apifyToken) return res.status(400).json({ error: 'Token required' });
    savedConfig.apifyToken = apifyToken;
    try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(savedConfig)); } catch (e) {}
    res.json({ success: true });
});

app.get('/api/settings/apify-token', (req, res) => {
    res.json({ apifyToken: savedConfig.apifyToken || '' });
});

// ── Apify: start scraper run (returns runId immediately, no timeout risk) ──
app.post('/api/instagram/apify-start', async (req, res) => {
    const { profileUrl, limit } = req.body;
    const token = savedConfig.apifyToken;
    if (!token) return res.status(400).json({ error: 'No Apify token saved. Add it in the Account tab.' });
    if (!profileUrl) return res.status(400).json({ error: 'Profile URL required' });

    try {
        const client = new ApifyClient({ token });
        const run = await client.actor('apify/instagram-scraper').start({
            directUrls: [profileUrl.trim().replace(/\/$/, '') + '/'],
            resultsType: 'posts',
            resultsLimit: Math.min(parseInt(limit) || 20, 100),
            addParentData: false,
        });
        res.json({ success: true, runId: run.id, datasetId: run.defaultDatasetId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Apify: poll run status ──
app.get('/api/instagram/apify-status/:runId', async (req, res) => {
    const token = savedConfig.apifyToken;
    if (!token) return res.status(400).json({ error: 'No Apify token' });
    try {
        const client = new ApifyClient({ token });
        const run = await client.run(req.params.runId).get();
        res.json({ success: true, status: run.status, stats: run.stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Apify: get dataset results ──
app.get('/api/instagram/apify-results/:datasetId', async (req, res) => {
    const token = savedConfig.apifyToken;
    if (!token) return res.status(400).json({ error: 'No Apify token' });
    try {
        const client = new ApifyClient({ token });
        const { items } = await client.dataset(req.params.datasetId).listItems();
        const posts = items
            .filter(it => it.displayUrl || it.imageUrl)
            .map(it => ({
                postUrl:   it.url || '',
                imageUrl:  it.displayUrl || it.imageUrl || '',
                caption:   it.caption || it.text || '',
                timestamp: it.timestamp || '',
                likesCount: it.likesCount || 0,
            }));
        res.json({ success: true, posts, count: posts.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Grab all post links from a profile page
app.post('/api/instagram/grab-links', async (req, res) => {
    const { url, cookie } = req.body;
    if (!url) return res.status(400).json({ error: 'Profile URL required' });
    const cookieHeader = cookie ? { 'Cookie': `sessionid=${cookie.trim()}; ds_user_id=0` } : {};
    try {
        const cleanUrl = url.trim().replace(/\/$/, '');
        const resp = await igHttpsGet(cleanUrl + '/', cookieHeader);

        if (resp.status === 404) throw new Error('Profile not found');
        if (resp.status === 302 || resp.body.includes('login') && resp.body.length < 3000) {
            throw new Error('Instagram returned a login page. Add your session cookie to grab this profile.');
        }

        const html = resp.body;
        const found = new Map(); // shortcode → type

        for (const m of html.matchAll(/["']\/p\/([A-Za-z0-9_-]{6,})\//g))  found.set(m[1], 'p');
        for (const m of html.matchAll(/["']\/reel\/([A-Za-z0-9_-]{6,})\//g)) found.set(m[1], 'reel');
        for (const m of html.matchAll(/"shortcode":"([A-Za-z0-9_-]{6,})"/g)) if (!found.has(m[1])) found.set(m[1], 'p');
        for (const m of html.matchAll(/"code":"([A-Za-z0-9_-]{6,})"/g))      if (!found.has(m[1])) found.set(m[1], 'p');

        if (found.size === 0) {
            throw new Error('No posts found in the page. Instagram may have blocked the request.\n\nFix: Add your session cookie — see "How to get it?" above.');
        }

        const urls = [...found.entries()].map(([sc, type]) => `https://www.instagram.com/${type}/${sc}/`);
        res.json({ success: true, urls, count: urls.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Download a single post URL → save to numbered folder
app.post('/api/instagram/download-url', async (req, res) => {
    const { postUrl, imageUrl: preImageUrl, caption: preCaption, outputDir, index, starValue, spoiler, silent, cookie } = req.body;
    if ((!postUrl && !preImageUrl) || !outputDir) return res.status(400).json({ error: 'postUrl/imageUrl and outputDir required' });
    const cookieHeader = cookie ? { 'Cookie': `sessionid=${cookie.trim()}; ds_user_id=0` } : {};
    try {
        // If Apify already gave us the image URL, use it directly (no extra fetch needed)
        let post;
        if (preImageUrl) {
            post = { imageUrl: preImageUrl, caption: preCaption || '' };
        } else {
            post = await igFetchSinglePost(postUrl, cookieHeader);
        }
        const folderName = String(index + 1).padStart(3, '0');
        const folderPath = path.join(outputDir, folderName);
        fs.mkdirSync(folderPath, { recursive: true });
        const rawExt = (post.imageUrl.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
        const ext = ['jpg','jpeg','png','webp','gif'].includes(rawExt) ? rawExt : 'jpg';
        await igDownloadBinary(post.imageUrl, path.join(folderPath, `photo.${ext}`));
        if (post.caption) fs.writeFileSync(path.join(folderPath, 'caption.txt'), post.caption, 'utf8');
        const stars = parseInt(starValue) || 0;
        if (stars >= 1 && stars <= 2500) fs.writeFileSync(path.join(folderPath, 'star.txt'), String(stars), 'utf8');
        if (spoiler) fs.writeFileSync(path.join(folderPath, 'spoiler.txt'), '', 'utf8');
        if (silent)  fs.writeFileSync(path.join(folderPath, 'silent.txt'),  '', 'utf8');
        res.json({ success: true, folder: folderName, hasCaption: !!post.caption });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Step 1: fetch metadata only (fast, no file writes)
app.post('/api/instagram/metadata', async (req, res) => {
    const { url, limit, urlList, cookie } = req.body;
    const cookieHeader = cookie ? { 'Cookie': `sessionid=${cookie.trim()}` } : {};

    try {
        let posts = [];

        // Mode: URL list (one URL per item)
        if (Array.isArray(urlList) && urlList.length > 0) {
            for (const u of urlList.slice(0, 50)) {
                try {
                    const post = await igFetchSinglePost(u.trim(), cookieHeader);
                    posts.push(post);
                } catch (_) {}
                await new Promise(r => setTimeout(r, 400));
            }
            if (posts.length === 0) throw new Error('Could not extract any posts from the provided URLs');
        } else if (url) {
            const cleanUrl = url.trim().split('?')[0].replace(/\/$/, '');
            if (/instagram\.com\/(p|reel|tv)\//.test(cleanUrl)) {
                posts = [await igFetchSinglePost(cleanUrl, cookieHeader)];
            } else if (/instagram\.com\/[^/]+\/?$/.test(cleanUrl)) {
                posts = await igFetchProfilePosts(cleanUrl, Math.min(parseInt(limit) || 10, 50), cookieHeader);
            } else {
                return res.status(400).json({ error: 'Invalid URL. Use instagram.com/p/… or instagram.com/username/' });
            }
        } else {
            return res.status(400).json({ error: 'Provide a URL or URL list' });
        }

        res.json({ success: true, posts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Step 2: download & save one post
app.post('/api/instagram/save-post', async (req, res) => {
    const { imageUrl, caption, outputDir, index, starValue, spoiler, silent } = req.body;
    if (!imageUrl || !outputDir) return res.status(400).json({ error: 'imageUrl and outputDir required' });
    try {
        const folderName = String(index + 1).padStart(3, '0');
        const folderPath = path.join(outputDir, folderName);
        fs.mkdirSync(folderPath, { recursive: true });
        const rawExt = (imageUrl.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
        const ext = ['jpg','jpeg','png','webp','gif'].includes(rawExt) ? rawExt : 'jpg';
        await igDownloadBinary(imageUrl, path.join(folderPath, `photo.${ext}`));
        if (caption) fs.writeFileSync(path.join(folderPath, 'caption.txt'), caption, 'utf8');
        const stars = parseInt(starValue) || 0;
        if (stars >= 1 && stars <= 2500) fs.writeFileSync(path.join(folderPath, 'star.txt'), String(stars), 'utf8');
        if (spoiler) fs.writeFileSync(path.join(folderPath, 'spoiler.txt'), '', 'utf8');
        if (silent)  fs.writeFileSync(path.join(folderPath, 'silent.txt'),  '', 'utf8');
        res.json({ success: true, folder: folderName, hasCaption: !!caption });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Legacy single-call endpoint (kept for compatibility)
app.post('/api/instagram/fetch', async (req, res) => {
    const { url, limit, outputDir, starValue, spoiler, silent } = req.body;
    if (!url || !outputDir) return res.status(400).json({ error: 'URL and output directory required' });
    try {
        const cleanUrl = url.trim().split('?')[0].replace(/\/$/, '');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        let posts = [];
        if (/instagram\.com\/(p|reel|tv)\//.test(cleanUrl)) {
            posts = [await igFetchSinglePost(cleanUrl)];
        } else if (/instagram\.com\/[^/]+\/?$/.test(cleanUrl)) {
            posts = await igFetchProfilePosts(cleanUrl, Math.min(parseInt(limit) || 10, 50));
        } else {
            return res.status(400).json({ error: 'Invalid Instagram URL' });
        }
        const results = [];
        const stars = parseInt(starValue) || 0;
        for (let i = 0; i < posts.length; i++) {
            const post = posts[i];
            const folderName = String(i + 1).padStart(3, '0');
            const folderPath = path.join(outputDir, folderName);
            try {
                fs.mkdirSync(folderPath, { recursive: true });
                const rawExt = (post.imageUrl.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
                const ext = ['jpg','jpeg','png','webp','gif'].includes(rawExt) ? rawExt : 'jpg';
                await igDownloadBinary(post.imageUrl, path.join(folderPath, `photo.${ext}`));
                if (post.caption) fs.writeFileSync(path.join(folderPath, 'caption.txt'), post.caption, 'utf8');
                if (stars >= 1 && stars <= 2500) fs.writeFileSync(path.join(folderPath, 'star.txt'), String(stars), 'utf8');
                if (spoiler) fs.writeFileSync(path.join(folderPath, 'spoiler.txt'), '', 'utf8');
                if (silent)  fs.writeFileSync(path.join(folderPath, 'silent.txt'),  '', 'utf8');
                results.push({ folder: folderName, success: true, hasCaption: !!post.caption });
            } catch (err) {
                results.push({ folder: folderName, success: false, error: err.message });
            }
        }
        res.json({ success: true, total: posts.length, saved: results.filter(r => r.success).length, results, outputDir });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// POST ALBUM FROM URLs — sendMediaGroup with direct URLs (Bot API)
// or download+upload via GramJS. Supports 2–10 images per post.
// POST /api/post-album-urls
// ============================================
async function downloadImageBuffer(url) {
    return new Promise((resolve, reject) => {
        function dl(target, hops) {
            if (hops > 5) return reject(new Error('Too many redirects'));
            try {
                const u = new URL(target);
                https.get({
                    hostname: u.hostname, path: u.pathname + u.search,
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*,*/*' },
                }, r => {
                    if ([301,302,303,307,308].includes(r.statusCode) && r.headers.location) {
                        return dl(r.headers.location, hops + 1);
                    }
                    const chunks = [];
                    r.on('data', c => chunks.push(c));
                    r.on('end', () => resolve(Buffer.concat(chunks)));
                }).on('error', reject);
            } catch (e) { reject(e); }
        }
        dl(url, 0);
    });
}

// Detect image type from magic bytes so we use the correct extension/mime
function detectImgType(buf) {
    if (!buf || buf.length < 4) return { ext: 'jpg', mime: 'image/jpeg' };
    if (buf[0] === 0xFF && buf[1] === 0xD8) return { ext: 'jpg',  mime: 'image/jpeg' };
    if (buf[0] === 0x89 && buf[1] === 0x50) return { ext: 'png',  mime: 'image/png'  };
    if (buf[0] === 0x47 && buf[1] === 0x49) return { ext: 'gif',  mime: 'image/gif'  };
    if (buf.length >= 12 && buf.slice(8, 12).toString('ascii') === 'WEBP')
                                             return { ext: 'webp', mime: 'image/webp' };
    return { ext: 'jpg', mime: 'image/jpeg' };
}

// Bot API multipart — mirrors the Python approach:
//   files[name] = buf  →  form.append(name, buf, ...)
//   media: f'attach://{name}'  →  { type:'photo', media:'attach://photo0' }
//   requests.post(url, data={...}, files=files)  →  r.write(formBuf); r.end()
async function sendAlbumViaBot(channelId, buffers, caption, sendWithoutSound) {
    if (buffers.length === 1) {
        const { ext, mime } = detectImgType(buffers[0]);
        const opts = { parse_mode: 'HTML', disable_notification: sendWithoutSound || false };
        if (caption) opts.caption = caption;
        await bot.sendPhoto(channelId, buffers[0], opts, { filename: `photo.${ext}`, contentType: mime });
        return;
    }

    const form = new FormData();
    form.append('chat_id', String(channelId));
    if (sendWithoutSound) form.append('disable_notification', 'true');

    const mediaJson = buffers.map((buf, i) => {
        const { ext, mime } = detectImgType(buf);
        const name = `photo${i}`;
        // Append each image buffer — same as files[name] = buf in Python
        form.append(name, buf, { filename: `${name}.${ext}`, contentType: mime });
        const item = { type: 'photo', media: `attach://${name}` };
        if (i === 0 && caption) { item.caption = caption; item.parse_mode = 'HTML'; }
        return item;
    });
    form.append('media', JSON.stringify(mediaJson));

    await new Promise((resolve, reject) => {
        form.getLength((err, length) => {
            if (err) return reject(err);
            const r = https.request({
                hostname: 'api.telegram.org',
                path:     `/bot${token}/sendMediaGroup`,
                method:   'POST',
                headers:  { ...form.getHeaders(), 'Content-Length': length },
            }, (resp) => {
                let data = '';
                resp.on('data', c => data += c);
                resp.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        console.log('[sendAlbumViaBot]', parsed.ok
                            ? `OK — ${parsed.result?.length} messages sent`
                            : `FAIL: ${parsed.description}`);
                        if (parsed.ok) resolve(parsed.result);
                        else reject(new Error(parsed.description || JSON.stringify(parsed)));
                    } catch (e) { reject(new Error(data)); }
                });
            });
            r.on('error', reject);
            form.pipe(r);
        });
    });
}

app.post('/api/post-album-urls', async (req, res) => {
    const { channelId, urls, caption, sendWithoutSound, scheduledTime } = req.body;
    if (!channelId || !Array.isArray(urls) || urls.length === 0)
        return res.status(400).json({ error: 'channelId and urls[] required' });

    const clampedUrls = urls.slice(0, 10);
    const scheduleTs  = scheduledTime ? Math.floor(new Date(scheduledTime).getTime() / 1000) : undefined;

    try {
        // Download all images once — used by both GramJS and Bot API paths
        const buffers = [];
        for (const url of clampedUrls) {
            buffers.push(await downloadImageBuffer(url));
        }
        if (buffers.length === 0) throw new Error('No images could be downloaded');

        // ── Try GramJS first (account-level posting) ──────────────────────────
        if (isUserAuthenticated && userClient) {
            try {
                const peer = await resolveWatchEntity(channelId);
                let parsedCaption = caption || '', captionEntities = [];
                if (caption) [parsedCaption, captionEntities] = await _parseMessageText(userClient, caption, 'html');

                // Upload each buffer with the correct file extension
                const uploaded = [];
                for (let i = 0; i < buffers.length; i++) {
                    const { ext } = detectImgType(buffers[i]);
                    const cf = new CustomFile(`photo_${i}.${ext}`, buffers[i].length, '', buffers[i]);
                    uploaded.push(await userClient.uploadFile({ file: cf, workers: 1 }));
                }

                if (uploaded.length === 1) {
                    const cf = new CustomFile(`photo_0.${detectImgType(buffers[0]).ext}`, buffers[0].length, '', buffers[0]);
                    await userClient.sendFile(channelId, {
                        file: cf, caption: parsedCaption || undefined,
                        parseMode: 'html', silent: sendWithoutSound || false,
                        schedule: scheduleTs,
                    });
                } else {
                    const multiMedia = uploaded.map((f, i) => new Api.InputSingleMedia({
                        media: new Api.InputMediaUploadedPhoto({ file: f }),
                        randomId: BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)),
                        message: i === 0 ? parsedCaption : '',
                        entities: i === 0 && captionEntities.length ? captionEntities : undefined,
                    }));
                    await userClient.invoke(new Api.messages.SendMultiMedia({
                        peer, multiMedia,
                        silent: sendWithoutSound || false,
                        ...(scheduleTs ? { scheduleDate: scheduleTs } : {}),
                    }));
                }
                return res.json({ success: true });
            } catch (gramErr) {
                // MEDIA_INVALID usually means an unsupported image format for MTProto
                // Fall through to Bot API multipart which handles all formats
                console.warn(`[post-album-urls] GramJS failed (${gramErr.message}) — falling back to Bot API multipart`);
            }
        }

        // ── Bot API multipart fallback (attach:// — works for all image types) ──
        await sendAlbumViaBot(channelId, buffers, caption, sendWithoutSound);
        res.json({ success: true });

    } catch (err) {
        console.error('[post-album-urls]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// FETCH REMOTE IMAGE AS BASE64 (for image-downloader quick-post)
// ============================================
app.post('/api/fetch-image', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });
    try {
        const result = await (function fetchBuffer(targetUrl, redirects = 0) {
            if (redirects > 5) throw new Error('Too many redirects');
            return new Promise((resolve, reject) => {
                const u = new URL(targetUrl);
                const opts = {
                    hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'image/*,*/*',
                        'Referer': `https://${u.hostname}/`,
                    },
                };
                const req = https.request(opts, r => {
                    if ([301,302,303,307,308].includes(r.statusCode) && r.headers.location) {
                        return fetchBuffer(r.headers.location, redirects + 1).then(resolve).catch(reject);
                    }
                    const chunks = [];
                    r.on('data', c => chunks.push(c));
                    r.on('end', () => resolve({
                        buffer: Buffer.concat(chunks),
                        mimeType: (r.headers['content-type'] || 'image/jpeg').split(';')[0].trim(),
                    }));
                });
                req.on('error', reject);
                req.end();
            });
        })(url);

        if (result.buffer.length > 20 * 1024 * 1024) {
            return res.status(400).json({ error: 'Image too large (max 20 MB)' });
        }
        res.json({ success: true, base64: result.buffer.toString('base64'), mimeType: result.mimeType, size: result.buffer.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// AI CAPTION (Google Gemini - Free Tier)
// ============================================
app.post('/api/settings/gemini-key', (req, res) => {
    const { geminiKey } = req.body;
    if (!geminiKey) return res.status(400).json({ error: 'Gemini API key required' });
    savedConfig.geminiKey = geminiKey;
    try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(savedConfig)); } catch (e) {}
    res.json({ success: true });
});

app.get('/api/settings/gemini-key', (req, res) => {
    res.json({ geminiKey: savedConfig.geminiKey || '' });
});

app.post('/api/ai/caption', async (req, res) => {
    const { imageBase64, mimeType, prompt, tone, language } = req.body;
    const geminiKey = savedConfig.geminiKey;
    if (!geminiKey) return res.status(400).json({ error: 'No Gemini API key set. Add it in the Account tab.' });

    try {
        const toneText = tone || 'engaging';
        const langText = language || 'English';
        const userHint = prompt ? `Topic/context: ${prompt}. ` : '';
        const instruction = `${userHint}Write a compelling Telegram channel post caption. Tone: ${toneText}. Language: ${langText}. Be concise and impactful. Use 6-10 relevant emoji throughout the caption — place them naturally between sentences and at the end. No hashtags unless requested.`;

        const parts = [];
        if (imageBase64 && mimeType) {
            parts.push({ inline_data: { mime_type: mimeType, data: imageBase64 } });
        }
        parts.push({ text: instruction });

        const body = JSON.stringify({
            contents: [{ parts }],
            generationConfig: { temperature: 0.9, maxOutputTokens: 300 }
        });

        // Try models newest-first; skip 404s so we always find one that works
        const MODELS = [
            'gemini-3.5-flash',
            'gemini-2.5-flash',
            'gemini-2.0-flash',
            'gemini-2.0-flash-exp',
            'gemini-1.5-flash',
        ];

        function callGemini(model) {
            return new Promise((resolve, reject) => {
                const path = `/v1beta/models/${model}:generateContent?key=${geminiKey}`;
                const opts = {
                    hostname: 'generativelanguage.googleapis.com',
                    path,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
                };
                const r = https.request(opts, (resp) => {
                    let data = '';
                    resp.on('data', c => data += c);
                    resp.on('end', () => resolve({ status: resp.statusCode, body: data, model }));
                });
                r.on('error', reject);
                r.write(body);
                r.end();
            });
        }

        let apiRes = null;
        for (const model of MODELS) {
            apiRes = await callGemini(model);
            if (apiRes.status === 200) { console.log(`[gemini] using ${model}`); break; }
            if (apiRes.status === 404) { console.warn(`[gemini] ${model} not found, trying next…`); continue; }
            // Any other error (401, 429, 500…) — stop and report immediately
            break;
        }

        if (apiRes.status !== 200) {
            let errMsg = `Gemini error (${apiRes.status})`;
            try { errMsg = JSON.parse(apiRes.body).error?.message || errMsg; } catch (_) {}
            return res.status(400).json({ error: errMsg });
        }

        const result = JSON.parse(apiRes.body);
        const caption = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        res.json({ success: true, caption: caption.trim(), model: apiRes.model });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// WATCH GROUP — bootstrap: get latest message ID
// GET /api/watch/baseline?channelId=xxx
// ============================================
app.get('/api/watch/baseline', async (req, res) => {
    const { channelId } = req.query;
    if (!channelId) return res.status(400).json({ error: 'channelId required' });
    if (!isUserAuthenticated || !userClient) {
        return res.status(401).json({ error: 'Not authenticated — login in Bot Manager → Account tab first.' });
    }
    try {
        const entity   = await resolveWatchEntity(channelId);
        const messages = await userClient.getMessages(entity, { limit: 1 });
        const latestId = messages.length > 0 ? messages[0].id : 0;
        res.json({ latestMsgId: latestId });
    } catch (err) {
        console.error('[watch/baseline]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// WATCH GROUP — poll for new message with URL
// GET /api/watch/latest-link?channelId=xxx&sinceId=N
// ============================================
app.get('/api/watch/latest-link', async (req, res) => {
    const { channelId, sinceId } = req.query;
    if (!channelId) return res.status(400).json({ error: 'channelId required' });
    if (!isUserAuthenticated || !userClient) {
        return res.status(401).json({ error: 'Not authenticated — login in Bot Manager → Account tab first.' });
    }

    try {
        const afterId  = parseInt(sinceId) || 0;
        const entity   = await resolveWatchEntity(channelId);
        const messages = await userClient.getMessages(entity, { limit: 30 });
        const urlRe    = /https?:\/\/[^\s<>"')\]]+/gi;

        // Track the true latest message ID (with or without URL) so the client cursor stays current
        const latestMsgId = messages.length > 0 ? messages[0].id : afterId;

        for (const msg of messages) {
            if (msg.id <= afterId) continue; // already seen

            // Collect URLs from raw text
            const text     = msg.message || '';
            const textUrls = text.match(urlRe) || [];

            // Collect URLs stored in message entities (handles t.me short-links, etc.)
            const entUrls = [];
            if (Array.isArray(msg.entities)) {
                for (const ent of msg.entities) {
                    if (ent.className === 'MessageEntityTextUrl' && ent.url) {
                        entUrls.push(ent.url);
                    } else if (ent.className === 'MessageEntityUrl' && text) {
                        entUrls.push(text.slice(ent.offset, ent.offset + ent.length));
                    }
                }
            }

            const allUrls = [...new Set([...textUrls, ...entUrls])];
            if (allUrls.length === 0) continue;

            const cleanLink = allUrls[0].replace(/[.,;!?»"']+$/, '');
            console.log(`[watch] new link in ${channelId} msgId=${msg.id}: ${cleanLink}`);
            return res.json({
                found:       true,
                link:        cleanLink,
                messageId:   msg.id,
                date:        msg.date,
                text:        text.slice(0, 300),
                latestMsgId,
            });
        }

        res.json({ found: false, latestMsgId });
    } catch (err) {
        console.error('[watch/latest-link]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// AUTO-PRUNE SENT SCHEDULED MESSAGES
// ============================================
setInterval(() => {
    const now = Date.now();
    const before = scheduledMessages.length;
    scheduledMessages = scheduledMessages.filter(m => new Date(m.scheduledTime).getTime() > now);
    if (scheduledMessages.length !== before) saveScheduledMessages();
}, 60 * 1000);

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
const openBrowser = (url) => {
  const command = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;

  exec(command, (error) => {
    if (error) {
      console.log(`Unable to open browser automatically: ${error.message}`);
    }
  });
};

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`🤖 Telegram Bot Server running on port ${PORT}`);
  console.log(`📱 Bot link: https://t.me/p0stagain_bot`);
  if (process.env.NODE_ENV !== 'production') {
    openBrowser(url);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  process.exit(0);
});
