// OSC 8 terminal hyperlinks — supported by iTerm2, macOS Terminal 3+, GNOME Terminal, etc.
// Terminals that don't support OSC 8 silently ignore the escape codes and show plain text.
const OSC = '\x1b]';
const ST  = '\x1b\\';

export function terminalLink(text: string, url: string): string {
  return `${OSC}8;;${url}${ST}${text}${OSC}8;;${ST}`;
}

export function etherscanTx(text: string, txHash: string): string {
  return terminalLink(text, `https://sepolia.etherscan.io/tx/${txHash}`);
}
