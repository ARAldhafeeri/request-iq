import { IAuth, RequestIQConfig } from "../types";
/**
 * Simple username password authentication for dashboard.
 */
export class Authentication implements IAuth {
  constructor(private config: RequestIQConfig) {
    this.config = config;
  }

  /**
   * simple authentication implementation for dashboard access
   * @param authHeader : authentication header
   * @returns authentication valid or not based on credentials username and password
   */
  public isValidAuth(authHeader: string): boolean {
    if (authHeader === "") return false;

    const isAuthEnabled = this.config.dashboard.enableAuth;
    const usernameConfig = this.config.dashboard.auth?.username;
    const passwordConfig = this.config.dashboard.auth?.password;

    if (!isAuthEnabled) return true;

    // short circut misconfigured auth
    if (!usernameConfig && passwordConfig) return false;
    const encoded = authHeader.split(" ")[1];
    if (!encoded) return false;

    const decoded = Buffer.from(encoded, "base64").toString();

    const [username, password] = decoded.split(":");
    return username === usernameConfig && password === passwordConfig;
  }
}
