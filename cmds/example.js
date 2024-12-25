/***
 * autoRead: AUTO READ MESSAGE
 * react: AUTO REACT TO MESSAGE WITH EMOJI
 * presence: AUTO UPDATE PRESENCE
 * onlyOwner: ONLY OWNER CAN USE THIS COMMAND
 * cmds: COMMANDS
 * handle: HOW WILL THIS COMMAND BE HANDLED
 */
module.exports = {
  autoRead: true,
  react: "👍",
  presence: "composing",
  onlyOwner: false,
  cmds: ["example"],
  handle: (zzysock, m) => m.reply(global.mess.dev),
};

// NOTE: IF YOU DON'T WANT TO USE AUTOREAD/REACT, JUST SET IT IN FALSE
