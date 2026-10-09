export interface ServerListenOptions {
  host: string;
  port: number;
}

export function createListenOptions(
  configured: Readonly<ServerListenOptions>,
): ServerListenOptions {
  return { host: configured.host, port: configured.port };
}
