const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField, ChannelType, StringSelectMenuBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const DISCORD_TOKEN    = process.env.DISCORD_TOKEN    || 'TON_TOKEN_ICI';
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID || '1570890792745304245';

// IDs DE TES RÔLES
const ROLE_ACCES_ID    = '1541600868787556412'; 
const ROLE_CROWN_ID    = '1541601494929907763';
const ROLE_OWNER_ID    = '1565080966693781644';
const ROLE_SUPPORT_ID  = '1541600641183387738';

// Variable pour stocker le salon admin
let currentAdminChannelId = ADMIN_CHANNEL_ID;

const demandes = new Map();

const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildMembers
]});

client.once('ready', () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`);
  client.user.setActivity('!help | Snapchat+', { type: 'WATCHING' });
});

/* ═══════════════════════════════════════════════════════════════
   GESTION DES BOUTONS (Site Web)
   ═══════════════════════════════════════════════════════════════ */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

  // GESTION DES TICKETS (Select Menu)
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
    const choice = interaction.values[0];
    let categoryName = 'Autre';
    if (choice === 'acces') categoryName = 'Get-Acces';
    if (choice === 'redeem') categoryName = 'Redeem';

    await interaction.reply({ content: `⏳ Création de ton ticket pour **${categoryName}**...`, ephemeral: true });

    try {
      const thread = await interaction.channel.threads.create({
        name: `🎫 ${categoryName} - ${interaction.user.username}`,
        type: ChannelType.PrivateThread,
        reason: 'Ticket client'
      });

      await thread.members.add(interaction.user.id);
      
      const embed = new EmbedBuilder()
        .setTitle(`🎫 Ticket : ${categoryName}`)
        .setDescription(`Bonjour ${interaction.user}, un membre du staff va te répondre rapidement.\n\nExplique ton problème ou ta demande ci-dessous.`)
        .setColor(0x2b2d31);

      const btnClose = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Fermer le ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
      );

      await thread.send({ content: `<@&${ROLE_CROWN_ID}> <@&${ROLE_OWNER_ID}> <@&${ROLE_SUPPORT_ID}>`, embeds: [embed], components: [btnClose] });
    } catch (e) {
      console.log("Erreur ticket:", e);
      await interaction.followUp({ content: "❌ Impossible de créer le ticket (vérifie les permissions du bot).", ephemeral: true });
    }
    return;
  }

  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    await interaction.reply({ content: 'Fermeture du ticket dans 5 secondes...', ephemeral: false });
    setTimeout(() => { if (interaction.channel) interaction.channel.delete().catch(() => {}); }, 5000);
    return;
  }

  // BOUTONS DU SITE WEB
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

/* ═══════════════════════════════════════════════════════════════
   COMMANDES PRÉFIXE "!"
   ═══════════════════════════════════════════════════════════════ */
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  // --- Commande : !help ---
  if (cmd === 'help') {
    const embed = new EmbedBuilder()
      .setTitle('📖 Commandes du Bot')
      .setColor(0xFF6B00)
      .setDescription('Voici la liste des commandes disponibles (préfixe `!`) :')
      .addFields(
        { name: '🛠️ Modération', value: '`!ban @user`\n`!kick @user`\n`!mute @user [durée]`\n`!lock #salon`' },
        { name: '⚙️ Administration', value: '`!admin @user`\n`!acces @user [30s/1d/1w/lifetime]`' },
        { name: '🎫 Tickets', value: '`!ticket #salon`' }
      )
      .setFooter({ text: 'Snapchat+ | Système de gestion' });
    return message.reply({ embeds: [embed] });
  }

  // --- Commande : !ticket ---
  if (cmd === 'ticket') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply({ content: '❌ Tu n\'as pas la permission d\'utiliser cette commande.' });
    }

    const embed = new EmbedBuilder()
      .setTitle("Besoin d'aide ?")
      .setDescription("Ouvrez un ticket en sélectionnant une catégorie ci-dessous. Notre équipe vous répondra dans les plus brefs délais.")
      .setColor(0x2b2d31)
      .setImage('https://i.imgur.com/L7K0wX5.png'); // Optionnel, une bannière

    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket_select')
        .setPlaceholder('Sélectionne une catégorie...')
        .addOptions([
          { label: 'Get-Acces', description: 'Obtenir un accès ou un rôle', value: 'acces', emoji: '🔑' },
          { label: 'Redeem', description: 'Racheter ou renouveler un accès', value: 'redeem', emoji: '💎' },
          { label: 'Autre', description: 'Une autre demande', value: 'autre', emoji: '❓' }
        ])
    );

    return message.channel.send({ embeds: [embed], components: [menu] });
  }

  // --- Commandes d'administration (vérification) ---
  if (['ban','kick','mute','acces','admin','lock'].includes(cmd)) {
    // Vérification des permissions admin (ou rôle spécifique)
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply({ content: '❌ Tu n\'as pas les permissions requises pour cette commande.' });
    }

    // --- Commande : !lock ---
    if (cmd === 'lock') {
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply('❌ Mentionne un salon. Ex: `!lock #general`');
      
      try {
        await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return message.reply(`🔒 Le salon ${channel} a été verrouillé.`);
      } catch (e) { return message.reply('❌ Je n\'ai pas la permission de verrouiller ce salon.'); }
    }

    // --- Commandes nécessitant un utilisateur cible ---
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Mentionne un utilisateur. Ex: `!' + cmd + ' @user`');
    if (target.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
      return message.reply('❌ Tu ne peux pas sanctionner quelqu\'un de plus haut gradé que toi.');
    }

    // --- Commande : !ban ---
    if (cmd === 'ban') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply('❌ Tu n\'as pas la permission de bannir.');
      try {
        await target.ban({ reason: 'Banni par ' + message.author.tag });
        return message.reply(`🔨 **${target.user.tag}** a été banni.`);
      } catch (e) { return message.reply('❌ Impossible de bannir cet utilisateur.'); }
    }

    // --- Commande : !kick ---
    if (cmd === 'kick') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return message.reply('❌ Tu n\'as pas la permission d\'expulser.');
      try {
        await target.kick('Expulsé par ' + message.author.tag);
        return message.reply(`👢 **${target.user.tag}** a été expulsé.`);
      } catch (e) { return message.reply('❌ Impossible d\'expulser cet utilisateur.'); }
    }

    // --- Commande : !mute ---
    if (cmd === 'mute') {
      const timeArg = args[1] || '10m';
      const match = timeArg.match(/^(\d+)(s|m|h|d)$/);
      let ms = 10 * 60 * 1000; // 10 mins par défaut
      if (match) {
        const val = parseInt(match[1]);
        const unit = match[2];
        const mult = unit === 's' ? 1000 : unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000;
        ms = val * mult;
      }
      try {
        await target.timeout(ms, 'Mute par ' + message.author.tag);
        return message.reply(`🔇 **${target.user.tag}** est muet pour ${timeArg}.`);
      } catch (e) { return message.reply('❌ Impossible de mute.'); }
    }

    // --- Commande : !admin (Créer un salon admin privé) ---
    if (cmd === 'admin') {
      try {
        const adminChan = await message.guild.channels.create({
          name: `admin-${target.user.username}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: message.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: target.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: message.author.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
          ]
        });
        currentAdminChannelId = adminChan.id; // Met à jour le salon des demandes
        return message.reply(`⚙️ Salon admin créé : ${adminChan}\nLes demandes du site arriveront maintenant ici.`);
      } catch (e) { return message.reply('❌ Impossible de créer le salon admin.'); }
    }

    // --- Commande : !acces (Donner un rôle temporaire) ---
    if (cmd === 'acces') {
      const timeArg = args[1] ? args[1].toLowerCase() : 'lifetime';
      const role = message.guild.roles.cache.get(ROLE_ACCES_ID);
      
      if (!role) return message.reply('❌ Rôle d\'accès introuvable.');
      
      try {
        await target.roles.add(role);
        
        let ms = 0;
        if (timeArg === '30s') ms = 30 * 1000;
        else if (timeArg === '1d') ms = 24 * 60 * 60 * 1000;
        else if (timeArg === '1w') ms = 7 * 24 * 60 * 60 * 1000;
        
        if (ms > 0) {
          message.reply(`✅ Accès donné à **${target.user.tag}** pour ${timeArg}.`);
          
          // Timer pour retirer le rôle
          setTimeout(async () => {
            try {
              if (target.roles.cache.has(role.id)) {
                await target.roles.remove(role);
                const dmEmbed = new EmbedBuilder()
                  .setTitle('⏳ Ton accès a expiré')
                  .setDescription(`Ton temps d'accès à Snapchat+ est écoulé.\n\nSi tu veux recharger ton temps, merci de faire un ticket sur le serveur.`)
                  .setColor(0xef4444);
                target.send({ embeds: [dmEmbed] }).catch(() => {});
              }
            } catch (err) { console.log(err); }
          }, ms);
          
        } else {
          message.reply(`♾️ Accès **Lifetime** donné à **${target.user.tag}**.`);
        }
      } catch (e) { return message.reply('❌ Impossible de donner le rôle (vérifie que le rôle du bot est au-dessus).'); }
    }
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

    const channel = await client.channels.fetch(currentAdminChannelId).catch(() => null);
    if(!channel) return res.status(500).json({ error: 'Salon admin introuvable.' });

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