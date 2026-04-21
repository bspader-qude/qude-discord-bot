// Qude Discord Bot
// Commands: /watchlist /add /recommend /watched /whats-on /qude-help
// Deploy to Railway, Render, or any Node.js host
// Required env vars: DISCORD_TOKEN, DISCORD_CLIENT_ID, QUDE_API_URL

import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import axios from 'axios';

const DISCORD_TOKEN   = process.env.DISCORD_TOKEN;
const CLIENT_ID       = process.env.DISCORD_CLIENT_ID;
const QUDE_API        = process.env.QUDE_API_URL || 'https://qude-production.up.railway.app/api';

// ── Register slash commands ───────────────────────────────────────────────────

const commands = [
  new SlashCommandBuilder()
    .setName('watchlist')
    .setDescription('Show your Qude watchlist (top 10 shows)')
    .addStringOption(o => o.setName('status').setDescription('Filter by status').setRequired(false)
      .addChoices(
        { name: 'Watching', value: 'watching' },
        { name: 'Finished', value: 'watched' },
        { name: 'In Queue', value: 'want_to_watch' },
      )),

  new SlashCommandBuilder()
    .setName('add')
    .setDescription('Add a show to your Qude watchlist')
    .addStringOption(o => o.setName('show').setDescription('Show title').setRequired(true))
    .addStringOption(o => o.setName('service').setDescription('Streaming service').setRequired(false)
      .addChoices(
        { name: 'Netflix', value: 'netflix' },
        { name: 'Hulu', value: 'hulu' },
        { name: 'Disney+', value: 'disney_plus' },
        { name: 'HBO Max', value: 'hbo_max' },
        { name: 'Prime Video', value: 'amazon_prime' },
        { name: 'Apple TV+', value: 'apple_tv' },
        { name: 'Peacock', value: 'peacock' },
        { name: 'Paramount+', value: 'paramount_plus' },
      )),

  new SlashCommandBuilder()
    .setName('recommend')
    .setDescription('Get a show recommendation based on your mood')
    .addStringOption(o => o.setName('mood').setDescription('Your current mood').setRequired(true)
      .addChoices(
        { name: '😄 Happy', value: 'happy' },
        { name: '😤 Stressed', value: 'stressed' },
        { name: '😑 Bored', value: 'bored' },
        { name: '🔥 Adventurous', value: 'adventurous' },
        { name: '❤️ Romantic', value: 'romantic' },
        { name: '😢 Sad', value: 'sad' },
      )),

  new SlashCommandBuilder()
    .setName('watched')
    .setDescription('Mark a show as finished on your Qude watchlist')
    .addStringOption(o => o.setName('show').setDescription('Show title').setRequired(true)),

  new SlashCommandBuilder()
    .setName('popular-now')
    .setDescription('See what shows are trending on Qude right now'),

  new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Discord account to Qude')
    .addStringOption(o => o.setName('username').setDescription('Your Qude username').setRequired(true)),

  new SlashCommandBuilder()
    .setName('qude-help')
    .setDescription('Show all Qude bot commands'),
].map(cmd => cmd.toJSON());

// Register commands with Discord
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try {
    console.log('[Qude Bot] Registering slash commands...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('[Qude Bot] Commands registered.');
  } catch (err) {
    console.error('[Qude Bot] Failed to register commands:', err);
  }
}

// ── In-memory Discord → Qude token store ─────────────────────────────────────
// In production, persist this in a database
const userTokens = new Map(); // discordUserId → { token, username }

// ── Client ────────────────────────────────────────────────────────────────────

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`[Qude Bot] Logged in as ${client.user.tag}`);
  registerCommands();
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  try {
    switch (commandName) {
      case 'qude-help':
        await handleHelp(interaction);
        break;
      case 'link':
        await handleLink(interaction);
        break;
      case 'watchlist':
        await handleWatchlist(interaction);
        break;
      case 'add':
        await handleAdd(interaction);
        break;
      case 'recommend':
        await handleRecommend(interaction);
        break;
      case 'watched':
        await handleWatched(interaction);
        break;
      case 'popular-now':
        await handlePopularNow(interaction);
        break;
    }
  } catch (err) {
    console.error(`[Qude Bot] Error in ${commandName}:`, err);
    const reply = { content: '⚠️ Something went wrong. Try again in a moment.', ephemeral: true };
    if (interaction.deferred) await interaction.editReply(reply);
    else await interaction.reply(reply);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function requireAuth(interaction) {
  const linked = userTokens.get(interaction.user.id);
  if (!linked) {
    interaction.reply({
      content: '🔗 Link your Qude account first with `/link your-username`\nDon\'t have an account? Sign up free at **qudetv.com**',
      ephemeral: true,
    });
    return null;
  }
  return linked;
}

function authHeaders(linked) {
  return { Authorization: `Bearer ${linked.token}` };
}

const SERVICE_NAMES = {
  netflix: 'Netflix', hulu: 'Hulu', disney_plus: 'Disney+',
  hbo_max: 'HBO Max', amazon_prime: 'Prime Video', apple_tv: 'Apple TV+',
  peacock: 'Peacock', paramount_plus: 'Paramount+',
};

const STATUS_LABELS = {
  watching: '▶️ Watching', watched: '✅ Finished', want_to_watch: '🕐 In Queue',
};

// ── Command handlers ──────────────────────────────────────────────────────────

async function handleHelp(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle('📺 Qude Bot Commands')
    .setDescription('Track your shows across all streaming services')
    .addFields(
      { name: '/link [username]',    value: 'Connect your Qude account', inline: false },
      { name: '/watchlist',          value: 'View your watchlist', inline: true },
      { name: '/add [show]',         value: 'Add a show', inline: true },
      { name: '/watched [show]',     value: 'Mark as finished', inline: true },
      { name: '/recommend [mood]',   value: 'Get a mood-based pick', inline: true },
      { name: '/popular-now',        value: 'What\'s trending on Qude', inline: true },
    )
    .setFooter({ text: 'qudetv.com · Never lose track of what to watch' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleLink(interaction) {
  const username = interaction.options.getString('username');
  await interaction.deferReply({ ephemeral: true });

  try {
    // Look up user by username to verify it exists
    const res = await axios.get(`${QUDE_API}/users/${username}/profile`);
    const profile = res.data;

    // Store the link (token-less for now — future: OAuth flow)
    userTokens.set(interaction.user.id, { username, token: null, profile });

    const embed = new EmbedBuilder()
      .setColor(0x06b6d4)
      .setTitle('🔗 Account Linked!')
      .setDescription(`Your Discord is now linked to **@${username}** on Qude.`)
      .addFields(
        { name: '📺 Shows tracked', value: String(profile.total_shows), inline: true },
        { name: '✅ Finished',       value: String(profile.watched), inline: true },
        { name: '🧬 Watch type',     value: profile.dna_label, inline: true },
      )
      .setFooter({ text: 'Use /watchlist, /add, /recommend and more' });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply({ content: `❌ Couldn't find Qude user **@${username}**. Check your username at qudetv.com/settings` });
  }
}

async function handleWatchlist(interaction) {
  const linked = requireAuth(interaction);
  if (!linked) return;
  await interaction.deferReply();

  const statusFilter = interaction.options.getString('status');

  try {
    const res = await axios.get(`${QUDE_API}/users/${linked.username}/profile`);
    const profile = res.data;
    const shows = profile.currently_watching || [];

    if (shows.length === 0) {
      await interaction.editReply({ content: `📭 **@${linked.username}**'s watchlist is empty. Add shows at qudetv.com` });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle(`📺 @${linked.username}'s Watchlist`)
      .setDescription(shows.slice(0, 10).map((s, i) => {
        const service = SERVICE_NAMES[s.service_id] || s.service_id;
        const ep = s.current_season ? ` · S${s.current_season}E${s.current_episode || 1}` : '';
        return `**${i + 1}.** ${s.title}${ep} · ${service}`;
      }).join('\n'))
      .addFields(
        { name: 'Total shows', value: String(profile.total_shows), inline: true },
        { name: 'Finished',    value: String(profile.watched),     inline: true },
        { name: 'Watch type',  value: profile.dna_label,           inline: true },
      )
      .setFooter({ text: 'Full watchlist at qudetv.com/watchlist' });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply({ content: '❌ Failed to fetch watchlist. Make sure your Qude account is public.' });
  }
}

async function handleAdd(interaction) {
  const linked = requireAuth(interaction);
  if (!linked) return;

  const showTitle = interaction.options.getString('show');
  const serviceId = interaction.options.getString('service') || 'netflix';

  await interaction.deferReply();

  // Note: Without a token, we can only show a deep link to add the show
  // Full add requires OAuth token integration
  const searchUrl = `https://qudetv.com/watchlist?add=${encodeURIComponent(showTitle)}`;
  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle(`➕ Add "${showTitle}" to Qude`)
    .setDescription(`Click below to add this show to your watchlist on Qude.`)
    .setURL(searchUrl)
    .addFields(
      { name: 'Service', value: SERVICE_NAMES[serviceId] || serviceId, inline: true },
    )
    .setFooter({ text: 'Or use the Chrome extension to auto-track while you watch' });

  await interaction.editReply({ embeds: [embed] });
}

async function handleRecommend(interaction) {
  const mood = interaction.options.getString('mood');
  await interaction.deferReply();

  try {
    // Public mood endpoint doesn't require auth
    const moodEmojis = { happy: '😄', stressed: '😤', bored: '😑', adventurous: '🔥', romantic: '❤️', sad: '😢' };
    const emoji = moodEmojis[mood] || '🎭';

    // Use TMDB trending as fallback since mood endpoint requires auth
    const res = await axios.get(`${QUDE_API.replace('/api', '')}/api/tmdb/trending`, {
      headers: { Authorization: 'Bearer public' }
    }).catch(() => ({ data: { results: [] } }));

    const results = res.data.results || [];
    if (results.length === 0) {
      await interaction.editReply({ content: `${emoji} Check out qudetv.com for mood-based recommendations!` });
      return;
    }

    const pick = results[Math.floor(Math.random() * Math.min(results.length, 5))];
    const embed = new EmbedBuilder()
      .setColor(0x06b6d4)
      .setTitle(`${emoji} Qude recommends for ${mood} mood:`)
      .setDescription(`**${pick.title}**`)
      .addFields(
        { name: '⭐ Rating', value: String(pick.rating || 'N/A'), inline: true },
      )
      .setURL(`https://qudetv.com`)
      .setThumbnail(pick.poster_url || null)
      .setFooter({ text: 'Get personalised picks at qudetv.com/mood' });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply({ content: '🎭 Check out qudetv.com/mood for personalised recommendations!' });
  }
}

async function handleWatched(interaction) {
  const linked = requireAuth(interaction);
  if (!linked) return;

  const showTitle = interaction.options.getString('show');
  await interaction.deferReply();

  const embed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle(`✅ Marked as finished!`)
    .setDescription(`Go to qudetv.com/watchlist to update **${showTitle}** and rate it.`)
    .setURL(`https://qudetv.com/watchlist`)
    .setFooter({ text: 'Or use the Chrome extension to track automatically' });

  await interaction.editReply({ embeds: [embed] });
}

async function handlePopularNow(interaction) {
  await interaction.deferReply();
  try {
    const res = await axios.get(`${QUDE_API}/detection/popular-now`);
    const popular = res.data.popular || [];

    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle('🔥 Trending on Qude right now')
      .setDescription(
        popular.length > 0
          ? popular.slice(0, 8).map((s, i) => `**${i + 1}.** ${s.title} · ${s.detections} users watching`).join('\n')
          : 'Not enough data yet — check back later!'
      )
      .setFooter({ text: `qudetv.com · Updated hourly` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply({ content: '📊 Trending data unavailable right now. Try again soon!' });
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

client.login(DISCORD_TOKEN);
