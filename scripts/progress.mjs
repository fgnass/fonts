// Progress on one terminal line. Without a terminal (make output, logs), nothing is written.
const tty = process.stdout.isTTY;

export function progress(text) {
  if (tty) process.stdout.write(`\r${text}`);
}

/** Ends the progress line. */
export function progressDone() {
  if (tty) process.stdout.write('\n');
}
