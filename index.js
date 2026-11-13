const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField, ChannelType, StringSelectMenuBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const DISCORD_TOKEN    = process.env.DISCORD_TOKEN    || 'TON_TOKEN_ICI';
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID || '1570890792745304245';

const ROLE_ACCES_ID    = '1541600868787556412'; 
const ROLE_CROWN_ID    = '1541601494929907763';
const ROLE_OWNER_ID    = '1565080966693781644';
const ROLE_SUPPORT_ID  = '1541600641183387738';

let currentAdminChannelId = ADMIN_CHANNEL_ID;
const demandes = new Map();

const client = new Client({ intents: [
  GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers
]});

client.once('ready', () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`);
  client.user.setActivity('!help | Snapchat+', { type: 'WATCHING' });
});

/* ═══════════════════════════════════════════════════════════════
   GESTION DES BOUTONS & MENUS (Site Web & Tickets)
   ═══════════════════════════════════════════════════════════════ */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

  // --- SYSTEME DE TICKET (Select Menu) ---
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

  // --- FERMER UN TICKET ---
  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    await interaction.reply({ content: 'Fermeture du ticket dans 5 secondes...', ephemeral: false });
    setTimeout(() => { if (interaction.channel) interaction.channel.delete().catch(() => {}); }, 5000);
    return;
  }

  // --- BOUTONS DU SITE WEB ---
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

  if (cmd === 'help') {
    const embed = new EmbedBuilder()
      .setTitle('📖 Commandes du Bot')
      .setColor(0xFF6B00)
      .setDescription('Voici la liste des commandes disponibles (préfixe `!`) :')
      .addFields(
        { name: '🛠️ Modération', value: '`!ban @user`\n`!kick @user`\n`!mute @user [durée]`\n`!lock #salon`' },
        { name: '⚙️ Administration', value: '`!admin @user`\n`!acces @user [30s/1j/1semaine/lifetime]`' },
        { name: '🎫 Tickets', value: '`!ticket #salon`' }
      ).setFooter({ text: 'Snapchat+ | Système de gestion' });
    return message.reply({ embeds: [embed] });
  }

  if (cmd === 'ticket') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return message.reply({ content: '❌ Tu n\'as pas la permission.' });
    
    // TON LIEN DIRECT ICI
    const bannerURL = 'https://i.imgur.com/NhoPWn6.png'; 

    const embed = new EmbedBuilder()
      .setTitle("Besoin d'aide ?")
      .setDescription("Ouvrez un ticket en sélectionnant une catégorie ci-dessous. Notre équipe vous répondra dans les plus brefs délais.")
      .setColor(0x2b2d31)
      .setImage(bannerURL); // La bannière s'affiche ici

    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('ticket_select').setPlaceholder('Sélectionne une catégorie...')
        .addOptions([
          { label: 'Get-Acces', description: 'Obtenir un accès', value: 'acces', emoji: '🔑' },
          { label: 'Redeem', description: 'Racheter un accès', value: 'redeem', emoji: '💎' },
          { label: 'Autre', description: 'Autre demande', value: 'autre', emoji: '❓' }
        ])
    );
    return message.channel.send({ embeds: [embed], components: [menu] });
  }

  if (['ban','kick','mute','acces','admin','lock'].includes(cmd)) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply({ content: '❌ Tu n\'as pas les permissions requises.' });
    }

    if (cmd === 'lock') {
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply('❌ Mentionne un salon. Ex: `!lock #general`');
      try { await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }); return message.reply(`🔒 Salon ${channel} verrouillé.`); } 
      catch (e) { return message.reply('❌ Permission refusée.'); }
    }

    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Mentionne un utilisateur. Ex: `!' + cmd + ' @user`');
    if (target.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
      return message.reply('❌ Tu ne peux pas sanctionner quelqu\'un de plus haut gradé.');
    }

    if (cmd === 'ban') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply('❌ Permission de ban manquante.');
      try { await target.ban({ reason: 'Par ' + message.author.tag }); return message.reply(`🔨 **${target.user.tag}** banni.`); } catch (e) { return message.reply('❌ Impossible de bannir.'); }
    }
    if (cmd === 'kick') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return message.reply('❌ Permission d\'expulser manquante.');
      try { await target.kick('Par ' + message.author.tag); return message.reply(`👢 **${target.user.tag}** expulsé.`); } catch (e) { return message.reply('❌ Impossible d\'expulser.'); }
    }
    if (cmd === 'mute') {
      const timeArg = args[1] || '10m';
      const match = timeArg.match(/^(\d+)(s|m|h|d)$/);
      let ms = 10 * 60 * 1000; 
      if (match) { const mult = match[2] === 's' ? 1000 : match[2] === 'm' ? 60000 : match[2] === 'h' ? 3600000 : 86400000; ms = parseInt(match[1]) * mult; }
      try { await target.timeout(ms, 'Par ' + message.author.tag); return message.reply(`🔇 **${target.user.tag}** muet pour ${timeArg}.`); } catch (e) { return message.reply('❌ Impossible de mute.'); }
    }
    if (cmd === 'admin') {
      try {
        const adminChan = await message.guild.channels.create({
          name: `admin-${target.user.username}`, type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: message.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: target.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: message.author.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
          ]
        });
        currentAdminChannelId = adminChan.id;
        return message.reply(`⚙️ Salon admin créé : ${adminChan}\nLes demandes du site arriveront ici.`);
      } catch (e) { return message.reply('❌ Impossible de créer le salon.'); }
    }

    if (cmd === 'acces') {
      const timeArg = args[1] ? args[1].toLowerCase() : null;
      const role = message.guild.roles.cache.get(ROLE_ACCES_ID);
      if (!role) return message.reply('❌ Rôle d\'accès introuvable.');

      if (!timeArg) {
        return message.reply('❌ Précise une durée. Ex: `!acces @user 30s` ou `!acces @user 1j` ou `!acces @user lifetime`');
      }

      let ms = 0;
      let displayTime = timeArg;

      if (timeArg === '30s' || timeArg === '30second' || timeArg === '30secondes') { ms = 30 * 1000; displayTime = '30 secondes'; }
      else if (timeArg === '1j' || timeArg === '1d' || timeArg === '1jour') { ms = 24 * 60 * 60 * 1000; displayTime = '1 jour'; }
      else if (timeArg === '1w' || timeArg === '1semaine' || timeArg === '1sem') { ms = 7 * 24 * 60 * 60 * 1000; displayTime = '1 semaine'; }
      else if (timeArg === 'lifetime' || timeArg === 'vie') { ms = 0; displayTime = 'Lifetime'; }
      else {
        return message.reply('❌ Temps invalide. Utilise : `30s`, `1j`, `1semaine` ou `lifetime`.');
      }

      try {
        await target.roles.add(role);
        
        if (ms > 0) {
          message.reply(`✅ Accès de **${displayTime}** donné à **${target.user.tag}**.`);
          
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
      } catch (e) { return message.reply('❌ Impossible de donner le rôle.'); }
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