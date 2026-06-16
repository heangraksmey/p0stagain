import React, { useState, useEffect } from 'react';
import { Trash2, Plus, Send, Clock, Eye, Lock, Volume2, AlertCircle, CheckCircle, X, Settings } from 'lucide-react';

export default function TelegramBotDashboard() {
  const [activeTab, setActiveTab] = useState('post');
  const [channels, setChannels] = useState([]);
  const [scheduledMessages, setScheduledMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [serverStatus, setServerStatus] = useState('checking');
  const [apiUrl, setApiUrl] = useState('http://localhost:3000/api');
  const [showApiSettings, setShowApiSettings] = useState(false);

  // Form states
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [content, setContent] = useState('');
  const [hideWithSpoiler, setHideWithSpoiler] = useState(false);
  const [makeContentPaid, setMakeContentPaid] = useState(false);
  const [sendWithoutSound, setSendWithoutSound] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');
  const [multiChannelMode, setMultiChannelMode] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState([]);

  // Channel form
  const [newChannelId, setNewChannelId] = useState('');
  const [newChannelName, setNewChannelName] = useState('');

  // Toast notification
  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Check server connection
  const checkServerStatus = async () => {
    try {
      const res = await fetch(`${apiUrl}/health`, { method: 'GET' });
      setServerStatus(res.ok ? 'connected' : 'error');
    } catch {
      setServerStatus('disconnected');
    }
  };

  // Fetch data
  const fetchChannels = async () => {
    if (serverStatus !== 'connected') return;
    try {
      const res = await fetch(`${apiUrl}/channels`);
      const data = await res.json();
      setChannels(Array.isArray(data) ? data : []);
    } catch (error) {
      setChannels([]);
    }
  };

  const fetchScheduledMessages = async () => {
    if (serverStatus !== 'connected') return;
    try {
      const res = await fetch(`${apiUrl}/scheduled`);
      const data = await res.json();
      setScheduledMessages(Array.isArray(data) ? data : []);
    } catch (error) {
      setScheduledMessages([]);
    }
  };

  useEffect(() => {
    checkServerStatus();
  }, [apiUrl]);

  useEffect(() => {
    if (serverStatus === 'connected') {
      fetchChannels();
      fetchScheduledMessages();
    }
  }, [serverStatus]);

  useEffect(() => {
    const interval = setInterval(checkServerStatus, 5000);
    return () => clearInterval(interval);
  }, [apiUrl]);

  // Add channel
  const handleAddChannel = async (e) => {
    e.preventDefault();

    if (!newChannelId.trim() || !newChannelName.trim()) {
      showNotification('⚠️ Please enter channel ID and name', 'error');
      return;
    }

    if (serverStatus !== 'connected') {
      showNotification('❌ Server not connected. Start with: npm start', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: newChannelId.trim(),
          channelName: newChannelName.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        await fetchChannels();
        setNewChannelId('');
        setNewChannelName('');
        showNotification(`✅ Channel "${newChannelName}" added!`, 'success');
      } else {
        showNotification(`❌ ${data.error}`, 'error');
      }
    } catch (error) {
      showNotification(`❌ Error: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Delete channel
  const handleDeleteChannel = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;

    try {
      const res = await fetch(`${apiUrl}/channels/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchChannels();
        showNotification(`✅ Channel deleted`, 'success');
      }
    } catch (error) {
      showNotification(`❌ Error: ${error.message}`, 'error');
    }
  };

  // Post message
  const handlePostMessage = async (e) => {
    e.preventDefault();

    if (!content.trim()) {
      showNotification('⚠️ Please type a message', 'error');
      return;
    }

    const hasChannels = multiChannelMode 
      ? selectedChannels.length > 0 
      : selectedChannelId;

    if (!hasChannels) {
      showNotification('⚠️ Please select a channel', 'error');
      return;
    }

    if (serverStatus !== 'connected') {
      showNotification('❌ Server not connected', 'error');
      return;
    }

    setLoading(true);
    try {
      let endpoint = multiChannelMode ? `${apiUrl}/broadcast` : `${apiUrl}/post`;
      
      const body = multiChannelMode 
        ? {
            channelIds: selectedChannels,
            content: content.trim(),
            hideWithSpoiler,
            makeContentPaid,
            sendWithoutSound,
          }
        : {
            channelId: selectedChannelId,
            content: content.trim(),
            hideWithSpoiler,
            makeContentPaid,
            sendWithoutSound,
            scheduledTime: scheduledTime || null,
          };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        const msg = multiChannelMode 
          ? `✅ Sent to ${selectedChannels.length} channel(s)`
          : scheduledTime
          ? `✅ Scheduled for ${new Date(scheduledTime).toLocaleString()}`
          : '✅ Message posted!';
        
        showNotification(msg, 'success');
        setContent('');
        setScheduledTime('');
        setHideWithSpoiler(false);
        setMakeContentPaid(false);
        setSendWithoutSound(false);
        setSelectedChannelId('');
        setSelectedChannels([]);
        await fetchScheduledMessages();
      } else {
        showNotification(`❌ ${data.error}`, 'error');
      }
    } catch (error) {
      showNotification(`❌ Error: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Delete scheduled
  const handleDeleteScheduled = async (id) => {
    if (!window.confirm('Cancel this scheduled message?')) return;

    try {
      const res = await fetch(`${apiUrl}/scheduled/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchScheduledMessages();
        showNotification('✅ Message cancelled', 'success');
      }
    } catch (error) {
      showNotification(`❌ Error: ${error.message}`, 'error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950">
      {/* Server Status Alert */}
      {serverStatus === 'disconnected' && (
        <div className="bg-red-500/20 border-b border-red-500/50 text-red-300 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold">⚠️ Backend Not Connected!</p>
              <p className="text-sm">Run this command: <code className="bg-red-900/30 px-2 py-1 rounded">npm start</code></p>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-5 py-3 rounded-xl backdrop-blur-md border animate-in fade-in slide-in-from-top-2 ${
          notification.type === 'success' 
            ? 'bg-green-500/20 border-green-500/50 text-green-300' 
            : 'bg-red-500/20 border-red-500/50 text-red-300'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span className="font-medium flex-1">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="p-1 hover:bg-white/10 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-purple-500/20 bg-black/40 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/50">
                <Send className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Telegram Bot Manager
                </h1>
                <p className="text-sm text-purple-300">Post • Schedule • Broadcast</p>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="flex items-center gap-2 justify-end mb-2">
                  <div className={`w-3 h-3 rounded-full animate-pulse ${
                    serverStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'
                  }`}></div>
                  <span className={`text-sm font-medium ${
                    serverStatus === 'connected' ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {serverStatus === 'connected' ? '🟢 Connected' : '🔴 Disconnected'}
                  </span>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-gray-400">Channels: <span className="text-white font-bold">{channels.length}</span></p>
                  <p className="text-gray-400">Scheduled: <span className="text-white font-bold">{scheduledMessages.length}</span></p>
                </div>
              </div>

              <button
                onClick={() => setShowApiSettings(!showApiSettings)}
                className="p-2 hover:bg-purple-500/20 rounded-lg transition-colors text-purple-400"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* API Settings */}
          {showApiSettings && (
            <div className="mt-4 pt-4 border-t border-purple-500/20 flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-sm text-gray-400 block mb-2">API URL:</label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  className="w-full bg-slate-800 border border-purple-500/30 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  placeholder="http://localhost:3000/api"
                />
              </div>
              <button
                onClick={() => {
                  checkServerStatus();
                  setShowApiSettings(false);
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white text-sm font-medium transition-colors"
              >
                Test
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Tab Navigation */}
        <div className="flex gap-3 mb-8 bg-slate-900/50 p-3 rounded-xl border border-purple-500/20">
          {[
            { id: 'post', label: '📤 Post Message', desc: 'Send messages' },
            { id: 'channels', label: '📋 Channels', desc: 'Manage channels' },
            { id: 'scheduled', label: '⏰ Scheduled', desc: `${scheduledMessages.length} pending` },
          ].map(({ id, label, desc }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${
                activeTab === id
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-gray-300 hover:bg-slate-800'
              }`}
            >
              <div>{label}</div>
              <div className="text-xs opacity-75">{desc}</div>
            </button>
          ))}
        </div>

        {/* POST MESSAGE TAB */}
        {activeTab === 'post' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form */}
            <div className="lg:col-span-2 space-y-6">
              <form onSubmit={handlePostMessage} className="space-y-6">
                {/* Mode Toggle */}
                <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl p-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={multiChannelMode}
                      onChange={(e) => setMultiChannelMode(e.target.checked)}
                      className="w-5 h-5 rounded accent-purple-500 cursor-pointer"
                    />
                    <span className="text-white font-semibold">📢 Broadcast to Multiple Channels</span>
                  </label>
                  <p className="text-sm text-gray-400 mt-2">Send the same message to multiple channels at once</p>
                </div>

                {/* Channel Selection */}
                <div>
                  <label className="block text-white font-bold mb-3 flex items-center gap-2">
                    <span>📍 Select Channel{multiChannelMode ? 's' : ''}</span>
                  </label>

                  {channels.length === 0 ? (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-amber-300 text-sm">
                      No channels yet. <button
                        type="button"
                        onClick={() => setActiveTab('channels')}
                        className="underline font-semibold hover:opacity-80"
                      >
                        Add your first channel
                      </button>
                    </div>
                  ) : multiChannelMode ? (
                    <div className="space-y-2 bg-slate-800/50 border border-purple-500/20 rounded-xl p-4 max-h-48 overflow-y-auto">
                      {channels.map((ch) => (
                        <label key={ch.id} className="flex items-center gap-3 cursor-pointer hover:bg-slate-700/50 p-3 rounded-lg transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedChannels.includes(ch.channelId)}
                            onChange={() => {
                              setSelectedChannels(prev =>
                                prev.includes(ch.channelId)
                                  ? prev.filter(id => id !== ch.channelId)
                                  : [...prev, ch.channelId]
                              );
                            }}
                            className="w-5 h-5 rounded accent-purple-500 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-200 font-medium">{ch.channelName}</p>
                            <p className="text-gray-500 text-xs">{ch.channelId}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <select
                      value={selectedChannelId}
                      onChange={(e) => setSelectedChannelId(e.target.value)}
                      className="w-full bg-slate-800 border border-purple-500/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="">👇 Choose a channel...</option>
                      {channels.map((ch) => (
                        <option key={ch.id} value={ch.channelId}>
                          {ch.channelName} ({ch.channelId})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Message Content */}
                <div>
                  <label className="block text-white font-bold mb-3 flex items-center gap-2">
                    <span>✍️ Your Message</span>
                    <span className="text-xs bg-slate-700 px-2 py-1 rounded text-gray-300">{content.length} chars</span>
                  </label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Type your message here... You can use HTML formatting like <b>bold</b>, <i>italic</i>, etc."
                    rows="6"
                    className="w-full bg-slate-800 border border-purple-500/30 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  />
                  <p className="text-xs text-gray-400 mt-2">💡 Tip: You can use HTML tags like &lt;b&gt;, &lt;i&gt;, &lt;a href&gt;</p>
                </div>

                {/* Options */}
                <div>
                  <label className="block text-white font-bold mb-3">⚙️ Options</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { state: sendWithoutSound, setState: setSendWithoutSound, icon: '🔇', label: 'Silent', desc: 'No notification sound' },
                      { state: hideWithSpoiler, setState: setHideWithSpoiler, icon: '👁️', label: 'Spoiler', desc: 'Hidden message' },
                      { state: makeContentPaid, setState: setMakeContentPaid, icon: '💰', label: 'Paid', desc: 'Premium content' },
                    ].map(({ state, setState, icon, label, desc }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setState(!state)}
                        className={`p-4 rounded-xl font-medium transition-all text-center ${
                          state
                            ? 'bg-gradient-to-br from-purple-600 to-pink-600 text-white shadow-lg'
                            : 'bg-slate-800 border border-purple-500/20 text-gray-300 hover:border-purple-500/50'
                        }`}
                      >
                        <div className="text-2xl mb-1">{icon}</div>
                        <div className="text-sm font-bold">{label}</div>
                        <div className="text-xs opacity-75">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Schedule */}
                {!multiChannelMode && (
                  <div>
                    <label className="block text-white font-bold mb-3">⏰ Schedule (Optional)</label>
                    <input
                      type="datetime-local"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-full bg-slate-800 border border-purple-500/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-400 mt-2">Leave empty to post immediately</p>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-3 text-lg shadow-lg hover:shadow-xl"
                >
                  <Send className="w-6 h-6" />
                  {loading ? 'Sending...' : 'Send Message'}
                </button>
              </form>
            </div>

            {/* Preview */}
            <div className="bg-slate-800/50 border border-purple-500/20 rounded-xl p-6 h-fit sticky top-20">
              <h3 className="text-white font-bold text-lg mb-4">📊 Preview</h3>
              <div className="space-y-4 text-sm">
                <div className="bg-slate-900 rounded-lg p-3 space-y-2">
                  <p className="text-gray-500">Channel:</p>
                  <p className="text-purple-300 font-semibold">
                    {multiChannelMode 
                      ? selectedChannels.length > 0 
                        ? `${selectedChannels.length} channel(s)`
                        : 'None selected'
                      : selectedChannelId || 'Not selected'}
                  </p>
                </div>

                <div className="bg-slate-900 rounded-lg p-3 space-y-2">
                  <p className="text-gray-500">Message length:</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-purple-500 to-pink-500 h-full transition-all"
                        style={{ width: `${Math.min((content.length / 1000) * 100, 100)}%` }}
                      ></div>
                    </div>
                    <span className="text-purple-300 font-semibold">{content.length}</span>
                  </div>
                </div>

                <div className="bg-slate-900 rounded-lg p-3 space-y-2">
                  <p className="text-gray-500">Active options:</p>
                  <div className="flex flex-wrap gap-2">
                    {sendWithoutSound && <span className="bg-yellow-500/20 text-yellow-300 px-2 py-1 rounded text-xs font-medium">🔇 Silent</span>}
                    {hideWithSpoiler && <span className="bg-yellow-500/20 text-yellow-300 px-2 py-1 rounded text-xs font-medium">👁️ Spoiler</span>}
                    {makeContentPaid && <span className="bg-yellow-500/20 text-yellow-300 px-2 py-1 rounded text-xs font-medium">💰 Paid</span>}
                    {scheduledTime && <span className="bg-yellow-500/20 text-yellow-300 px-2 py-1 rounded text-xs font-medium">⏰ Scheduled</span>}
                    {!sendWithoutSound && !hideWithSpoiler && !makeContentPaid && !scheduledTime && (
                      <span className="text-gray-500 text-xs">No special options</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CHANNELS TAB */}
        {activeTab === 'channels' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Add Channel */}
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-800/30 border border-purple-500/20 rounded-xl p-8">
              <h3 className="text-white font-bold text-2xl mb-2">➕ Add New Channel</h3>
              <p className="text-gray-400 text-sm mb-6">Register a Telegram channel to post messages</p>

              <form onSubmit={handleAddChannel} className="space-y-4">
                <div>
                  <label className="block text-gray-300 text-sm font-semibold mb-2">Channel ID or Username</label>
                  <input
                    type="text"
                    value={newChannelId}
                    onChange={(e) => setNewChannelId(e.target.value)}
                    placeholder="@mychannel or -1001234567890"
                    className="w-full bg-slate-900 border border-purple-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">💡 Use @username for public channels or numeric ID for private</p>
                </div>

                <div>
                  <label className="block text-gray-300 text-sm font-semibold mb-2">Display Name</label>
                  <input
                    type="text"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    placeholder="e.g., My Awesome Channel"
                    className="w-full bg-slate-900 border border-purple-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  {loading ? 'Adding...' : 'Add Channel'}
                </button>
              </form>
            </div>

            {/* Channels List */}
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-800/30 border border-purple-500/20 rounded-xl p-8">
              <h3 className="text-white font-bold text-2xl mb-2">📋 Your Channels</h3>
              <p className="text-gray-400 text-sm mb-6">{channels.length} channel{channels.length !== 1 ? 's' : ''} registered</p>

              {channels.length === 0 ? (
                <div className="bg-slate-900/50 rounded-lg p-6 text-center text-gray-400">
                  <div className="text-4xl mb-2">📭</div>
                  <p>No channels added yet</p>
                  <p className="text-sm mt-2">Add your first channel above to get started!</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {channels.map((ch) => (
                    <div
                      key={ch.id}
                      className="bg-slate-900 hover:bg-slate-800/80 rounded-lg p-4 flex items-center justify-between transition-colors border border-purple-500/10"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold">{ch.channelName}</p>
                        <p className="text-gray-500 text-xs truncate">{ch.channelId}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteChannel(ch.id, ch.channelName)}
                        className="ml-3 p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors flex-shrink-0"
                        title="Delete channel"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SCHEDULED TAB */}
        {activeTab === 'scheduled' && (
          <div className="bg-gradient-to-br from-slate-800/50 to-slate-800/30 border border-purple-500/20 rounded-xl p-8">
            <h3 className="text-white font-bold text-2xl mb-2">⏰ Scheduled Messages</h3>
            <p className="text-gray-400 text-sm mb-6">{scheduledMessages.length} message{scheduledMessages.length !== 1 ? 's' : ''} scheduled</p>

            {scheduledMessages.length === 0 ? (
              <div className="bg-slate-900/50 rounded-lg p-12 text-center text-gray-400">
                <div className="text-5xl mb-3">📭</div>
                <p className="text-lg font-semibold">No Scheduled Messages</p>
                <p className="text-sm mt-2">Schedule a message from the Post Message tab to see it here</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {scheduledMessages.map((msg) => (
                  <div key={msg.id} className="bg-slate-900 rounded-lg p-6 border border-purple-500/10 hover:border-purple-500/30 transition-colors">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="bg-purple-500/20 text-purple-300 px-3 py-1 rounded-full text-sm font-medium">
                            📍 {msg.channelId}
                          </span>
                        </div>
                        <p className="text-gray-400 text-sm">
                          ⏰ {new Date(msg.scheduledTime).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteScheduled(msg.id)}
                        className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors flex-shrink-0"
                        title="Cancel scheduled message"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="bg-slate-800 rounded-lg p-4 mb-3 text-gray-300 text-sm max-h-32 overflow-y-auto border border-slate-700">
                      {msg.content.replace(/<[^>]*>/g, '')}
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      {msg.isSpoiler && <span className="bg-yellow-500/20 text-yellow-300 px-3 py-1 rounded text-xs font-medium">👁️ Spoiler</span>}
                      {msg.isPaid && <span className="bg-green-500/20 text-green-300 px-3 py-1 rounded text-xs font-medium">💰 Paid</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-purple-500/20 bg-black/40 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-8 text-center text-gray-500 text-sm">
          <p>🤖 Telegram Bot Manager v1.0 • Made with ❤️</p>
          <p className="mt-2">Bot: @p0stagain_bot | API: {apiUrl}</p>
        </div>
      </footer>
    </div>
  );
}
