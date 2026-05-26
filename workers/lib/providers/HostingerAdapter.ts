import type { DeployPluginOpts, DeployResult, IHostingProvider, Site } from './IHostingProvider';

/**
 * @todo F-S04 — implementar via Hostinger MCP per ADR-0008 §3.1.
 * Todos os métodos lançam Error("Not implemented yet — see F-S04").
 */
export class HostingerAdapter implements IHostingProvider {
  private readonly token: string;
  private readonly wpAdminPassword?: string;

  constructor(credentials: { token: string; wpAdminPassword?: string }) {
    this.token = credentials.token;
    this.wpAdminPassword = credentials.wpAdminPassword;
  }

  async listSites(): Promise<Site[]> {
    void this.token; void this.wpAdminPassword;
    throw new Error('Not implemented yet — see F-S04');
  }
  async verifyDomain(_domain: string): Promise<boolean> {
    throw new Error('Not implemented yet — see F-S04');
  }
  async deployPlugin(_opts: DeployPluginOpts): Promise<DeployResult> {
    throw new Error('Not implemented yet — see F-S04');
  }
  async pingToken(): Promise<boolean> {
    throw new Error('Not implemented yet — see F-S04');
  }
}
