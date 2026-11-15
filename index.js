const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelType } = require('discord.js');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || 'TON_TOKEN_ICI';
const CLIENT_ID     = process.env.CLIENT_ID     || 'TON_CLIENT_ID_ICI'; 

// ⚠️ TON ID DISCORD (Créateur)
const OWNER_ID = '1565080966693781644'; 

const adminsAutorises = new Set([OWNER_ID]);
let customEmojis = { 1: '1️⃣', 2: '2️⃣', 3: '3️⃣' };

const paniers = new Map();

const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages
]});

client.once('ready', async () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`);
  client.user.setActivity('/ticket | /help', { type: 'WATCHING' });

  const commands = [
    new SlashCommandBuilder().setName('ban').setDescription('Bannir').addUserOption(o => o.setName('user').setDescription('Utilisateur').setRequired(true)),
    new SlashCommandBuilder().setName('kick').setDescription('Expulser').addUserOption(o => o.setName('user').setDescription('Utilisateur').setRequired(true)),
    new SlashCommandBuilder().setName('mute').setDescription('Mute').addUserOption(o => o.setName('user').setDescription('Utilisateur').setRequired(true)).addIntegerOption(o => o.setName('minutes').setDescription('Durée').setRequired(true)),
    new SlashCommandBuilder().setName('admin').setDescription('Ajouter un admin').addUserOption(o => o.setName('user').setDescription('Utilisateur').setRequired(true)),
    new SlashCommandBuilder().setName('removeadmin').setDescription('Retirer un admin').addUserOption(o => o.setName('user').setDescription('Utilisateur').setRequired(true)),
    new SlashCommandBuilder().setName('adminlist').setDescription('Voir les admins'),
    new SlashCommandBuilder().setName('ticket').setDescription('Envoyer le panneau').addChannelOption(o => o.setName('salon').setDescription('Salon').setRequired(true)),
    new SlashCommandBuilder().setName('emojis').setDescription('Configurer les emojis').addStringOption(o => o.setName('emoji1').setDescription('Emoji 1').setRequired(true)).addStringOption(o => o.setName('emoji2').setDescription('Emoji 2').setRequired(true)).addStringOption(o => o.setName('emoji3').setDescription('Emoji 3').setRequired(true)),
    new SlashCommandBuilder().setName('help').setDescription('Affiche les commandes')
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); } catch (e) { console.error(e); }
});

client.on('interactionCreate', async (interaction) => {
  // ============ COMMANDES SLASH ============
  if (interaction.isChatInputCommand()) {
    const { commandName, user, member } = interaction;
    const hasPermission = adminsAutorises.has(user.id) || member.permissions.has(PermissionsBitField.Flags.Administrator);

    if (!hasPermission) return interaction.reply({ content: "❌ **T'es bête ou quoi ? T'es pas admin ici.**", ephemeral: true });

    if (commandName === 'emojis') {
      customEmojis[1] = interaction.options.getString('emoji1');
      customEmojis[2] = interaction.options.getString('emoji2');
      customEmojis[3] = interaction.options.getString('emoji3');
      const embed = new EmbedBuilder().setTitle('✅ Emojis mis à jour').setColor(0x22c55e)
        .setDescription(`**1er emoji :** ${customEmojis[1]}\n**2ème emoji :** ${customEmojis[2]}\n**3ème emoji :** ${customEmojis[3]}`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'ticket') {
      const channel = interaction.options.getChannel('salon');
      const embed = new EmbedBuilder()
        .setTitle('🎟️ Ticket - Commandes')
        .setDescription('> Choisis ton type de commande ci-dessous.')
        .setColor(0x2b2d31)
        .addFields(
          { name: `${customEmojis[1]} CC Classic`, value: '> **Prix : 25 €**', inline: true },
          { name: `${customEmojis[2]} CC Gold`, value: '> **Prix : 50 €**', inline: true },
          { name: `${customEmojis[3]} CC Infinite`, value: '> **Prix : 80 €**', inline: true },
          { name: 'Autres Produits', value: '> **Divers**', inline: true }
        );
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket_menu').setLabel('Choisir un produit').setStyle(ButtonStyle.Primary).setEmoji('🛒'));
      await channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: `✅ Panneau envoyé.`, ephemeral: true });
    }

    if (commandName === 'adminlist') {
      const embed = new EmbedBuilder().setTitle('👑 Liste des Administrateurs').setColor(0x2b2d31)
        .setDescription(Array.from(adminsAutorises).map(id => `> <@${id}>`).join('\n'));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (commandName === 'admin') {
      if (user.id !== OWNER_ID) return interaction.reply({ content: "❌ Créateur seulement.", ephemeral: true });
      adminsAutorises.add(interaction.options.getUser('user').id);
      return interaction.reply({ content: `✅ Ajouté.` });
    }
    if (commandName === 'removeadmin') {
      if (user.id !== OWNER_ID) return interaction.reply({ content: "❌ Créateur seulement.", ephemeral: true });
      adminsAutorises.delete(interaction.options.getUser('user').id);
      return interaction.reply({ content: `✅ Retiré.` });
    }
    if (commandName === 'help') {
      const embed = new EmbedBuilder().setTitle('📖 Commandes').setColor(0x2b2d31)
        .addFields(
          { name: '🛠️ Modération', value: '`/ban`, `/kick`, `/mute`' },
          { name: '🎫 Ticket', value: '`/ticket #salon`' },
          { name: '⚙️ Config', value: '`/admin`, `/removeadmin`, `/adminlist`, `/emojis`' }
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (['ban', 'kick', 'mute'].includes(commandName)) {
      const target = interaction.options.getMember('user');
      if (!target) return interaction.reply({ content: "❌ Introuvable.", ephemeral: true });
      if (commandName === 'ban') { try { await target.ban({ reason: 'Par ' + user.tag }); return interaction.reply(`🔨 Banni.`); } catch(e) { return interaction.reply({content:'❌ Impossible',ephemeral:true}); } }
      if (commandName === 'kick') { try { await target.kick('Par ' + user.tag); return interaction.reply(`👢 Expulsé.`); } catch(e) { return interaction.reply({content:'❌ Impossible',ephemeral:true}); } }
      if (commandName === 'mute') { try { await target.timeout(interaction.options.getInteger('minutes')*60000); return interaction.reply(`🔇 Muet.`); } catch(e) { return interaction.reply({content:'❌ Impossible',ephemeral:true}); } }
    }
  }

  // ============ TUNNEL ============
  
  // 1. Choix du produit
  if (interaction.isButton() && interaction.customId === 'open_ticket_menu') {
    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_product')
        .setPlaceholder('Sélectionne ton produit...')
        .addOptions([
          { label: 'CC Classic', description: '25 €', value: 'classic', emoji: customEmojis[1] },
          { label: 'CC Gold', description: '50 €', value: 'gold', emoji: customEmojis[2] },
          { label: 'CC Infinite', description: '80 €', value: 'infinite', emoji: customEmojis[3] },
          // ⚠️ Option sans emoji
          { label: 'Autres Produits', description: 'Divers', value: 'autre' }
        ])
    );
    return interaction.reply({ content: 'Quel produit veux-tu acheter ?', components: [menu], ephemeral: true });
  }

  // 2. Choix du moyen de paiement
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_product') {
    const choice = interaction.values[0];
    let productName = ''; let price = ''; let emojiUsed = '';
    
    if (choice === 'classic') { productName = 'CC Classic'; price = '25 €'; emojiUsed = customEmojis[1]; }
    if (choice === 'gold') { productName = 'CC Gold'; price = '50 €'; emojiUsed = customEmojis[2]; }
    if (choice === 'infinite') { productName = 'CC Infinite'; price = '80 €'; emojiUsed = customEmojis[3]; }
    if (choice === 'autre') { productName = 'Autres Produits'; price = 'À définir'; emojiUsed = ''; } // Pas d'emoji

    paniers.set(interaction.user.id, { product: productName, price: price, emoji: emojiUsed });

    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_payment')
        .setPlaceholder('Quel est votre moyen de paiement ?')
        .addOptions([
          { label: 'PayPal', value: 'paypal', emoji: '🅿️' },
          { label: 'Crypto', value: 'crypto', emoji: '🪙' },
          { label: 'Paysafecard', value: 'paysafecard', emoji: '💳' }
        ])
    );
    
    // Affichage propre selon si on a un emoji ou non
    let displayProduct = emojiUsed ? `${emojiUsed} **${productName}**` : `**${productName}**`;
    return interaction.reply({ content: `Produit sélectionné : ${displayProduct} (${price})\nMaintenant, choisis ton moyen de paiement :`, components: [menu], ephemeral: true });
  }

  // 3. Choix de la crypto
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_payment') {
    const paymentChoice = interaction.values[0];
    const panier = paniers.get(interaction.user.id);

    if (paymentChoice === 'crypto') {
      panier.payment = 'Crypto';
      paniers.set(interaction.user.id, panier);
      const menu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_crypto')
          .setPlaceholder('Quelle crypto ?')
          .addOptions([
            { label: 'LTC (Litecoin)', value: 'LTC', emoji: 'Ł' },
            { label: 'ETH (Ethereum)', value: 'ETH', emoji: 'Ξ' },
            { label: 'BTC (Bitcoin)', value: 'BTC', emoji: '₿' }
          ])
      );
      return interaction.reply({ content: 'Quelle crypto souhaites-tu utiliser ?', components: [menu], ephemeral: true });
    } else {
      panier.payment = paymentChoice === 'paypal' ? 'PayPal' : 'Paysafecard';
      paniers.set(interaction.user.id, panier);
      await createTicket(interaction, panier);
    }
  }

  // 4. Création du ticket final
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_crypto') {
    const cryptoChoice = interaction.values[0];
    const panier = paniers.get(interaction.user.id);
    panier.payment = `Crypto (${cryptoChoice})`;
    paniers.set(interaction.user.id, panier);
    await createTicket(interaction, panier);
  }

  // Fermeture
  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    await interaction.reply({ content: '⏳ Fermeture...' });
    setTimeout(() => { if (interaction.channel) interaction.channel.delete().catch(() => {}); }, 5000);
  }
});

async function createTicket(interaction, panier) {
  await interaction.reply({ content: `⏳ Création de ton ticket...`, ephemeral: true });

  try {
    const thread = await interaction.channel.threads.create({
      name: `🎫 ${panier.product} - ${interaction.user.username}`,
      type: ChannelType.PrivateThread
    });
    await thread.members.add(interaction.user.id);

    // Affichage propre dans le ticket
    let displayProduct = panier.emoji ? `${panier.emoji} ${panier.product}` : panier.product;
    let title = panier.emoji ? `${panier.emoji} Ticket - ${panier.product}` : `🎫 Ticket - ${panier.product}`;

    const ticketEmbed = new EmbedBuilder()
      .setTitle(title)
      .setColor(0x2b2d31)
      .setDescription(
        `> **Bienvenue dans ton ticket !**\n> Un membre du staff va te répondre dans les plus brefs délais.\n\n` +
        `**📦 Produit :** ${displayProduct}\n` +
        `**💰 Prix :** ${panier.price}\n` +
        `**💳 Paiement :** ${panier.payment}`
      )
      .setFooter({ text: 'Merci de patienter...' })
      .setTimestamp();

    const btnClose = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('Fermer le ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
    );

    await thread.send({ content: `${interaction.user}`, embeds: [ticketEmbed], components: [btnClose] });
    paniers.delete(interaction.user.id);

  } catch (e) {
    console.error(e);
    await interaction.followUp({ content: "❌ Impossible de créer le ticket.", ephemeral: true });
  }
}

client.login(DISCORD_TOKEN);