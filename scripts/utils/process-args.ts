export class CommandLine {

  public command: string[] = [];
  public options: {[key: string]: string} = {};

  public requiresOption(optionName: string): string {
    if (!this.options[optionName]) throw new Error('Missing required option --' + optionName);
    return this.options[optionName];
  }
}

export function parseCommandLine(): CommandLine {
  const options = new CommandLine();
  const nb = process.argv.length;
  for (let i = 2; i < nb; ++i) {
    const arg = process.argv[i];
    if (arg.startsWith('--')) {
      const i = arg.indexOf('=');
      if (i >= 0) {
        const name = arg.substring(2, i);
        const value = arg.substring(i + 1);
        options.options[name] = value;
      }
    } else {
      options.command.push(arg);
    }
  }
  return options;
}
