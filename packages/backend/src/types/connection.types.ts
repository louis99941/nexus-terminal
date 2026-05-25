export interface ConnectionBase {
  id: number;
  name: string | null;
  type: 'SSH' | 'RDP' | 'VNC' | 'Telnet';
  host: string;
  port: number;
  username: string;
  auth_method: 'password' | 'key';
  proxy_id: number | null;
  proxy_type?: 'proxy' | 'jump' | null;
  created_at: number;
  updated_at: number;
  last_connected_at: number | null;
  notes?: string | null;
  jump_chain: number[] | null;
}

export interface ConnectionWithTags extends ConnectionBase {
  tag_ids: number[];
}

export interface CreateConnectionInput {
  name?: string;
  type: 'SSH' | 'RDP' | 'VNC' | 'Telnet';
  host: string;
  port?: number;
  username: string;
  auth_method: 'password' | 'key';
  password?: string;
  private_key?: string;
  passphrase?: string;
  ssh_key_id?: number | null;
  proxy_id?: number | null;
  proxy_type?: 'proxy' | 'jump' | null;
  tag_ids?: number[];
  notes?: string | null;
  jump_chain?: number[] | null;
  force_keyboard_interactive?: boolean;
}

export interface UpdateConnectionInput {
  name?: string;
  type?: 'SSH' | 'RDP' | 'VNC' | 'Telnet';
  host?: string;
  port?: number;
  username?: string;
  auth_method?: 'password' | 'key';
  password?: string;
  private_key?: string;
  passphrase?: string;
  ssh_key_id?: number | null;
  proxy_id?: number | null;
  proxy_type?: 'proxy' | 'jump' | null;
  notes?: string | null;
  tag_ids?: number[];
  jump_chain?: number[] | null;
  force_keyboard_interactive?: boolean;
}

export interface FullConnectionData {
  id: number;
  name: string | null;
  type: 'SSH' | 'RDP' | 'VNC' | 'Telnet';
  host: string;
  port: number;
  username: string;
  auth_method: 'password' | 'key';
  encrypted_password: string | null;
  encrypted_private_key: string | null;
  encrypted_passphrase: string | null;
  ssh_key_id?: number | null;
  proxy_id: number | null;
  proxy_type?: 'proxy' | 'jump' | null;
  created_at: number;
  notes: string | null;
  updated_at: number;
  last_connected_at: number | null;
  jump_chain: number[] | null;
  force_keyboard_interactive: boolean;
}

export interface DecryptedConnectionCredentials {
  decryptedPassword?: string;
  decryptedPrivateKey?: string;
  decryptedPassphrase?: string;
}

/** 路由跳点信息 */
export interface RouteHop {
  host: string;
  port: number;
  username: string;
  name?: string;
  latencyMs?: number;
}

/** SSH 连接路由规划信息 */
export interface ConnectionRoutePlan {
  hops: RouteHop[];
  totalLatencyMs: number;
  directConnection: boolean;
}
